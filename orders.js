/* ============================================================
   ידידיה מוטורס — הזמנות בדרך ומכולות
   כל הלוגיקה (אישור מול מספר הזמנה, מכסות, קידום מכולה) בשרת.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }
  var perms = session.permissions || [];

  var STAGES = [
    { key: 'pending',  label: 'ממתין לאישור' },
    { key: 'approved', label: 'מאושר — לשיבוץ' },
    { key: 'booked',   label: 'שובץ למכולה' },
    { key: 'at_sea',   label: 'בים' },
    { key: 'port',     label: 'בנמל' },
    { key: 'customs',  label: 'במכס' }
  ];
  var CSTEPS = [['pending', 'ממתינה'], ['at_sea', 'בים'], ['port_arrival', 'בנמל'], ['customs', 'במכס'], ['ready', 'שוחררה']];
  var STD_HE = { canadian: 'קנדי', federal: 'פדרלי', other: 'אחר' };

  var data = null, filter = '', canManage = false;
  // חיפוש וסינון — חיפוש חופשי בכל פרט, וסינונים לפי ערכים שקיימים בנתונים בפועל
  var query = '';
  var bf = { make: '', std: '', supplier: '', flag: '' };   // סינוני לוח הרכבים
  var cf = { status: '', line: '', flag: '' };              // סינוני מכולות
  try { var saved = JSON.parse(sessionStorage.getItem('ym_orders_filters') || 'null'); if (saved) { query = saved.q || ''; filter = saved.stage || ''; Object.assign(bf, saved.bf || {}); Object.assign(cf, saved.cf || {}); } } catch (e) {}
  function saveFilters() { try { sessionStorage.setItem('ym_orders_filters', JSON.stringify({ q: query, stage: filter, bf: bf, cf: cf })); } catch (e) {} }

  load(true);

  async function load(first) {
    var res;
    try { res = await YM.api('/import/board', { token: session.token }); }
    catch (err) { if (first) bootError(err.message); else notice(err.message, 'err'); return; }
    if (res.ok !== true) {
      if (res.__status === 401 && ['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE','SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession(); location.replace('login.html'); return;
      }
      if (first) bootError(res.message_he || 'טעינת ההזמנות נכשלה.'); else notice(res.message_he, 'err');
      return;
    }
    data = res; canManage = !!(res.viewer && res.viewer.can_manage);
    render();
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
    if (first) openFromUrl();
  }

  // קישור ישיר: orders.html?container=<id> פותח את לשונית המכולות ואת מסך המעקב
  function openFromUrl() {
    var m = /[?&]container=([0-9a-f-]{36})/i.exec(location.search);
    if (!m) return;
    switchTab('containers');
    openTracking(m[1]);
  }

  function bootError(text) {
    var boot = document.getElementById('boot');
    boot.innerHTML = '<div class="mark">YEDIDIA MOTORS</div><div class="msg">' + E(text) + '</div>' +
      '<button class="btn-primary" type="button" id="boot-retry">נסו שוב</button>';
    boot.hidden = false;
    document.getElementById('boot-retry').addEventListener('click', function () { location.reload(); });
  }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 5000);
  }

  function render() {
    YM.renderNav('nav', 'orders.html', perms);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);
    var open = (data.containers || []).filter(function (c) { return c.status !== 'ready'; });
    var late = open.filter(function (c) { return c.eta_overdue; }).length;
    document.getElementById('meta-line').textContent = data.vehicles.length + ' רכבים בתהליך יבוא · ' + open.length + ' מכולות במעקב' + (late ? ' · ' + late + ' עם ETA שעבר' : '');
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box"><div class="label">בדרך לארץ</div><div class="stat-figure">' + data.vehicles.filter(function (v) { return ['at_sea','port','customs'].indexOf(v.stage) > -1; }).length + '</div>' +
      '<div class="stat-note">' + data.vehicles.filter(function (v) { return v.stage === 'pending'; }).length + ' ממתינים לאישור</div></div>';
    setCount('count-board', data.vehicles.length);
    setCount('count-containers', open.length);
    setCount('count-quotas', (data.quotas || []).length);
    document.getElementById('new-quota').hidden = !canManage;
    renderAll();
  }
  function renderAll() {
    renderBoardFilters(); renderStages(); renderBoard(); renderRecent();
    renderContFilters(); renderContainers(); renderQuotas();
    saveFilters();
  }

  /* ---------- חיפוש וסינון ---------- */
  var searchEl = document.getElementById('search');
  searchEl.value = query;
  var searchTimer = null;
  searchEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { query = searchEl.value; if (data) renderAll(); }, 150);
  });
  searchEl.addEventListener('keydown', function (e) { if (e.key === 'Escape' && searchEl.value) { e.stopPropagation(); searchEl.value = ''; query = ''; renderAll(); } });

  function fold(t) {
    return String(t).toLowerCase()
      .replace(/[\u0591-\u05C7]/g, '')            // ניקוד
      .replace(/[״"׳'`]/g, '')
      .replace(/[ךםןףץ]/g, function (c) { return { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]; });
  }
  // כל ערך טקסט/מספר באובייקט (כולל מסמכים, רכבים במכולה וכו׳), כולל תאריכים בפורמט התצוגה
  function haystack(obj, extra) {
    var out = [];
    (function walk(x, depth) {
      if (x == null || depth > 4) return;
      if (typeof x === 'string') {
        out.push(x);
        if (/^\d{4}-\d{2}-\d{2}/.test(x)) out.push(fmtDate(x));
      } else if (typeof x === 'number') out.push(String(x));
      else if (Array.isArray(x)) x.forEach(function (y) { walk(y, depth + 1); });
      else if (typeof x === 'object') Object.keys(x).forEach(function (k) { if (!/(^id$|_id$|token|url$)/.test(k)) walk(x[k], depth + 1); });
    })(obj, 0);
    if (extra) out = out.concat(extra.filter(Boolean));
    var h = fold(out.join(' \u0001 '));
    return h + ' \u0001 ' + h.replace(/[\s\-\/.]/g, '');   // גם בלי רווחים/מקפים — VIN, מספר מכולה, בוקינג
  }
  function matchQuery(hay) {
    var q = fold(query.trim());
    if (!q) return true;
    return q.split(/\s+/).every(function (t) { return hay.indexOf(t) > -1 || hay.indexOf(t.replace(/[\-\/.]/g, '')) > -1; });
  }
  function stageLabel(k) { var s = STAGES.filter(function (x) { return x.key === k; })[0]; return s ? s.label : k; }
  function vehHay(v) {
    if (!v.__hay) v.__hay = haystack(v, [stageLabel(v.stage), STD_HE[v.standard_type], v.standard_type ? 'תקן ' + STD_HE[v.standard_type] : null]);
    return v.__hay;
  }
  function contHay(c) {
    if (!c.__hay) c.__hay = haystack(c, [c.dangerous_goods ? 'חומ"ס חומרים מסוכנים' : null, c.telex_release ? 'טלקס רליס התקבל' : 'טלקס טרם',
      (data.vehicles || []).filter(function (v) { return v.container_id === c.id; }).map(function (v) { return [v.vin, v.order_number, v.stock_lot_number, v.supplier_name, v.requested_customer_name].join(' '); }).join(' ')]);
    return c.__hay;
  }
  function makeOf(v) { var t = String(v.title || '').trim(); return t ? t.split(/\s+/)[0] : ''; }

  var VFLAGS = [
    ['no_order', 'אין מספר הזמנה', function (v) { return !v.order_number; }],
    ['no_std', 'אין תקן', function (v) { return !v.standard_type; }],
    ['no_vin', 'VIN לא פוענח', function (v) { return !v.vin_decoded; }],
    ['requested', 'מבוקש ללקוח', function (v) { return !!v.requested_customer_name; }],
    ['no_docs', 'בלי מסמכים', function (v) { return !(v.document_list || []).length; }],
    ['stuck', '30+ ימים בשלב', function (v) { return v.days_in_stage >= 30; }]
  ];
  var CFLAGS = [
    ['late', 'ETA עבר', function (c) { return !!c.eta_overdue; }],
    ['no_num', 'ממתינה למספר מכולה', function (c) { return !c.container_number; }],
    ['unlinked', 'רכבים לא משובצים', function (c) { return !!c.expected_unlinked; }],
    ['warn', 'התראות / שגיאת נמל', function (c) { return !!(c.recent_warnings || c.port_last_error); }],
    ['no_telex', 'בלי טלקס רליס', function (c) { return !c.telex_release; }],
    ['free', 'יש מקום פנוי', function (c) { return (c.vehicles || []).length < c.capacity; }]
  ];

  // הרכב עומד בכל הסינונים חוץ מ-skip (כדי שהמונים בכל קבוצה יראו כמה יישארו אם בוחרים בה)
  function vehPass(v, skip) {
    if (skip !== 'stage' && filter && v.stage !== filter) return false;
    if (skip !== 'make' && bf.make && makeOf(v) !== bf.make) return false;
    if (skip !== 'std' && bf.std && (v.standard_type || '') !== bf.std) return false;
    if (skip !== 'supplier' && bf.supplier && (v.supplier_name || '') !== bf.supplier) return false;
    if (skip !== 'flag' && bf.flag) { var f = VFLAGS.filter(function (x) { return x[0] === bf.flag; })[0]; if (f && !f[2](v)) return false; }
    return matchQuery(vehHay(v));
  }
  function contPass(c, skip) {
    if (skip !== 'status' && cf.status && c.status !== cf.status) return false;
    if (skip !== 'line' && cf.line && (c.shipping_line || '') !== cf.line) return false;
    if (skip !== 'flag' && cf.flag) { var f = CFLAGS.filter(function (x) { return x[0] === cf.flag; })[0]; if (f && !f[2](c)) return false; }
    return matchQuery(contHay(c));
  }

  function chip(group, val, label, n, active) {
    return '<button class="chip' + (active ? ' is-active' : '') + '" type="button" data-g="' + group + '" data-v="' + E(val) + '"' + (n === 0 && !active ? ' disabled style="opacity:.4;cursor:default"' : '') + '>' + E(label) + (n != null ? ' · ' + n : '') + '</button>';
  }
  function groupHtml(label, chips) { return chips.length ? '<div class="filter-group"><span class="fg-l">' + E(label) + '</span>' + chips.join('') + '</div>' : ''; }
  function distinct(list, fn) {
    var m = {}; list.forEach(function (x) { var k = fn(x); if (k) m[k] = 1; });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'he'); });
  }

  function renderBoardFilters() {
    var host = document.getElementById('board-filters');
    var vs = data.vehicles || [];
    if (!vs.length) { host.innerHTML = ''; return; }
    function count(skip, test) { return vs.filter(function (v) { return vehPass(v, skip) && test(v); }).length; }
    var makes = distinct(vs, makeOf), sups = distinct(vs, function (v) { return v.supplier_name; }), stds = distinct(vs, function (v) { return v.standard_type; });
    var html = '';
    if (makes.length > 1) html += groupHtml('יצרן', makes.map(function (m) { return chip('make', m, m, count('make', function (v) { return makeOf(v) === m; }), bf.make === m); }));
    if (stds.length > 1) html += groupHtml('תקן', stds.map(function (k) { return chip('std', k, STD_HE[k] || k, count('std', function (v) { return v.standard_type === k; }), bf.std === k); }));
    if (sups.length > 1) html += groupHtml('ספק', sups.map(function (k) { return chip('supplier', k, k, count('supplier', function (v) { return v.supplier_name === k; }), bf.supplier === k); }));
    html += groupHtml('דורש טיפול', VFLAGS.map(function (f) { return chip('flag', f[0], f[1], count('flag', f[2]), bf.flag === f[0]); }));
    host.innerHTML = html;
    host.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () { var g = b.getAttribute('data-g'), v = b.getAttribute('data-v'); bf[g] = bf[g] === v ? '' : v; renderAll(); });
    });
  }
  function renderContFilters() {
    var host = document.getElementById('cont-filters');
    var cs = data.containers || [];
    if (!cs.length) { host.innerHTML = ''; return; }
    function count(skip, test) { return cs.filter(function (c) { return contPass(c, skip) && test(c); }).length; }
    var lines = distinct(cs, function (c) { return c.shipping_line; });
    var html = groupHtml('סטטוס', CSTEPS.map(function (s) { return chip('status', s[0], s[1], count('status', function (c) { return c.status === s[0]; }), cf.status === s[0]); }));
    if (lines.length > 1) html += groupHtml('חברת ספנות', lines.map(function (k) { return chip('line', k, k, count('line', function (c) { return c.shipping_line === k; }), cf.line === k); }));
    html += groupHtml('דורש טיפול', CFLAGS.map(function (f) { return chip('flag', f[0], f[1], count('flag', f[2]), cf.flag === f[0]); }));
    host.innerHTML = html;
    host.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () { var g = b.getAttribute('data-g'), v = b.getAttribute('data-v'); cf[g] = cf[g] === v ? '' : v; renderAll(); });
    });
  }
  function boardActive() { return !!(query.trim() || filter || bf.make || bf.std || bf.supplier || bf.flag); }
  function contActive() { return !!(query.trim() || cf.status || cf.line || cf.flag); }
  function resultLine(id, shown, total, active, noun, clearFn) {
    var el = document.getElementById(id);
    el.hidden = !active;
    if (!active) return;
    el.innerHTML = '<span>מוצגים ' + shown + ' מתוך ' + total + ' ' + noun + '</span><button class="clear" type="button">ניקוי חיפוש וסינון</button>';
    el.querySelector('.clear').addEventListener('click', clearFn);
  }
  function clearBoard() { query = ''; searchEl.value = ''; filter = ''; bf = { make: '', std: '', supplier: '', flag: '' }; renderAll(); }
  function clearCont() { query = ''; searchEl.value = ''; cf = { status: '', line: '', flag: '' }; renderAll(); }
  function setCount(id, n) { var el = document.getElementById(id); el.textContent = n; el.hidden = !n; }

  /* ---------- לוח ---------- */
  function renderStages() {
    var host = document.getElementById('stages');
    host.innerHTML = STAGES.map(function (s) {
      var n = data.vehicles.filter(function (v) { return v.stage === s.key && vehPass(v, 'stage'); }).length;
      return '<div class="stage' + (filter === s.key ? ' is-active' : '') + '" data-stage="' + s.key + '"><div class="n">' + n + '</div><div class="l">' + E(s.label) + '</div></div>';
    }).join('');
    host.querySelectorAll('.stage').forEach(function (el) {
      el.addEventListener('click', function () { var k = el.getAttribute('data-stage'); filter = filter === k ? '' : k; renderAll(); });
    });
  }

  function renderBoard() {
    var host = document.getElementById('board');
    var groups = STAGES.filter(function (s) { return !filter || s.key === filter; });
    var any = false, shown = 0;
    host.innerHTML = groups.map(function (s) {
      var list = data.vehicles.filter(function (v) { return v.stage === s.key && vehPass(v); });
      shown += list.length;
      if (!list.length) return '';
      any = true;
      return '<div class="group"><h3>' + E(s.label) + ' <span class="tag">' + list.length + '</span></h3>' + list.map(vehHtml).join('') + '</div>';
    }).join('');
    resultLine('board-result', shown, data.vehicles.length, boardActive(), 'רכבים', clearBoard);
    if (!any) host.innerHTML = '<div class="empty">' + (data.vehicles.length && boardActive() ? 'לא נמצאו רכבים שמתאימים לחיפוש ולסינון.' : filter ? 'אין רכבים בשלב הזה.' : 'אין כרגע רכבים בתהליך יבוא. תיק חדש נפתח אוטומטית ממייל של יאיר או מתמונת מדבקה בוואטסאפ.') + '</div>';
    bindBoard();
  }

  function vehHtml(v) {
    var meta = [];
    if (v.order_number) meta.push('<span class="tag">הזמנה ' + E(v.order_number) + '</span>');
    else if (v.stage === 'pending') meta.push('<span class="tag warn">אין מספר הזמנה</span>');
    if (v.stock_lot_number) meta.push('<span class="tag">לוט ' + E(v.stock_lot_number) + '</span>');
    if (v.standard_type) meta.push('<span class="tag">תקן ' + E(STD_HE[v.standard_type] || v.standard_type) + '</span>');
    else if (v.stage === 'approved') meta.push('<span class="tag warn">אין תקן — נדרש למכסה</span>');
    if (v.supplier_name) meta.push('<span class="tag">' + E(v.supplier_name) + (v.purchase_country ? ' · ' + E(v.purchase_country) : '') + '</span>');
    if (v.purchase_price != null) meta.push('<span class="tag">' + E(v.purchase_currency || '') + ' ' + Number(v.purchase_price).toLocaleString('en-US') + '</span>');
    if (v.container_id) meta.push('<a class="tag link" href="orders.html?container=' + E(v.container_id) + '" data-container="' + E(v.container_id) + '">מכולה ' + E(v.container_number || '') + ' · ' + E(v.container_status_he) + (v.container_eta ? ' · ETA ' + fmtDate(v.container_eta) : '') + '</a>');
    if (v.quota_request_number) meta.push('<span class="tag">מכסה ' + E(v.quota_request_number) + '</span>');
    if (v.requested_customer_name) meta.push('<span class="tag ok">מבוקש: ' + E(v.requested_customer_name) + '</span>');
    if (v.customs && v.customs.total) meta.push('<span class="tag' + (v.customs.done === v.customs.total ? ' ok' : '') + '">מכס ' + v.customs.done + '/' + v.customs.total + '</span>');
    if (!v.vin_decoded) meta.push('<span class="tag warn">VIN לא פוענח</span>');
    meta.push('<span class="tag">' + v.days_in_stage + ' ימים בשלב</span>');

    var acts = '';
    if (canManage) {
      if (v.stage === 'pending') acts += '<button class="btn-icon primary" type="button" data-act="approve">אישור הזמנה</button>';
      if (v.stage === 'approved') acts += '<button class="btn-icon primary" type="button" data-act="book">שיבוץ למכולה</button>';
      if (v.stage === 'booked') acts += '<button class="btn-icon" type="button" data-act="unbook">הוצאה מהמכולה</button>';
      if (['at_sea','port','customs'].indexOf(v.stage) > -1) acts += '<button class="btn-icon" type="button" data-act="checklist">checklist מכס</button>';
      acts += '<button class="btn-icon" type="button" data-act="edit">עריכה</button>';
      if (['pending','approved','booked'].indexOf(v.stage) > -1) acts += '<button class="btn-icon danger" type="button" data-act="cancel">ביטול</button>';
    } else if (['at_sea','port','customs'].indexOf(v.stage) > -1) {
      acts += '<button class="btn-icon" type="button" data-act="checklist">checklist מכס</button>';
    }
    acts += '<button class="btn-icon" type="button" data-act="open">תיק הרכב</button>';

    var docs = (v.document_list || []).map(function (d) {
      var label = E(d.doc_type_he || d.doc_type || 'מסמך') + (d.filename ? ' · <span class="ltr">' + E(d.filename) + '</span>' : '');
      return d.drive_url
        ? '<a class="doc" href="' + E(d.drive_url) + '" target="_blank" rel="noopener" title="' + E(d.filename || '') + '">' + label + '</a>'
        : '<span class="doc">' + label + '</span>';
    }).join('');
    var docsHtml = docs
      ? '<div class="docs"><span class="docs-l">מסמכי התיק (' + (v.document_list || []).length + ')</span>' + docs + '</div>'
      : '<div class="docs"><span class="docs-l empty-docs">אין עדיין מסמכים בתיק</span></div>';

    return '<div class="veh" data-id="' + E(v.id) + '">' +
      '<div class="thumb"><span>' + E(v.vin_tail || '—') + '</span></div>' +
      '<div><div class="title">' + E(v.title || '—') + '</div>' +
        '<div class="sub">' + E([v.model_year, v.trim, v.color, v.vin ? 'VIN ' + v.vin : null].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="meta">' + meta.join('') + '</div>' + docsHtml + '</div>' +
      '<div class="actions"><div class="row">' + acts + '</div></div>' +
      '<div class="cl" hidden></div>' +
    '</div>';
  }

  function bindBoard() {
    document.querySelectorAll('#board .veh').forEach(function (el) {
      var id = el.getAttribute('data-id');
      var v = data.vehicles.filter(function (x) { return x.id === id; })[0];
      el.querySelectorAll('[data-container]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); switchTab('containers'); openTracking(a.getAttribute('data-container')); });
      });
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          if (act === 'approve') openApprove(v);
          else if (act === 'book') openBook(v);
          else if (act === 'unbook') unbook(v);
          else if (act === 'edit') openVehicle(v);
          else if (act === 'cancel') cancelVehicle(v);
          else if (act === 'checklist') toggleChecklist(el, v);
          else if (act === 'open') location.href = 'inventory.html?ref=' + encodeURIComponent(v.vin || v.id);
        });
      });
    });
  }

  function renderRecent() {
    var card = document.getElementById('recent-card');
    var list = (data.recent || []).filter(function (r) { return matchQuery(r.__hay || (r.__hay = haystack(r))); });
    card.hidden = !list.length;
    document.getElementById('recent-count').textContent = list.length + ' ב-30 הימים האחרונים';
    document.getElementById('recent').innerHTML = list.map(function (r) {
      return '<div class="recent-row"><span class="t">' + E(r.title) + ' · ' + E(r.vin_tail) + (r.color ? ' · ' + E(r.color) : '') + '</span><span>' + E(fmtDT(r.arrived_at)) + ' · ' + E(r.status_he) + '</span></div>';
    }).join('');
  }

  /* ---------- אישור ---------- */
  var aForm = document.getElementById('approve-form');
  function openApprove(v) {
    aForm.reset(); aForm.vehicle_id.value = v.id;
    document.getElementById('approve-line').textContent = v.title + ' · VIN ' + (v.vin || '—') + (v.order_number ? ' · במסמכים: ' + v.order_number : ' · בתיק אין מספר הזמנה');
    show('approve-modal'); setTimeout(function () { aForm.confirmed_order_number.focus(); }, 50);
  }
  aForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await call('/import/approve', { vehicle_id: aForm.vehicle_id.value, confirmed_order_number: aForm.confirmed_order_number.value.trim() });
    if (r.ok) { hide('approve-modal'); load(false); }
  });

  /* ---------- שיבוץ ---------- */
  var bForm = document.getElementById('book-form');
  function openBook(v) {
    bForm.reset(); bForm.vehicle_id.value = v.id;
    document.getElementById('book-line').textContent = v.title + ' · VIN ' + (v.vin || '—') + ' · תקן ' + (STD_HE[v.standard_type] || 'לא הוגדר');
    var open = (data.containers || []).filter(function (c) { return c.status === 'pending' && c.container_number && (c.vehicles || []).length < c.capacity; });
    bForm.existing.innerHTML = '<option value="">מכולה חדשה…</option>' + open.map(function (c) {
      return '<option value="' + E(c.container_number) + '">' + E(c.container_number) + ' (' + (c.vehicles || []).length + '/' + c.capacity + ')' + (c.vehicles.length ? ' · ' + E(c.vehicles.map(function (x) { return x.title; }).join(', ')) : '') + '</option>';
    }).join('');
    var quotas = (data.quotas || []).filter(function (q) { return q.status === 'approved' && q.remaining_quantity > 0; });
    bForm.quota_id.innerHTML = '<option value="">בחירה אוטומטית (מכסה מתאימה עם יתרה)</option>' + quotas.map(function (q) {
      return '<option value="' + E(q.id) + '">' + E(q.importer_partner_name) + ' · ' + E(STD_HE[q.standard_type] || q.standard_type) + (q.make ? ' · ' + E(q.make) : '') + (q.model ? ' ' + E(q.model) : '') + ' · יתרה ' + q.remaining_quantity + '</option>';
    }).join('');
    if (!quotas.length) notice('אין מכסת רישיון יבוא מאושרת עם יתרה — להוסיף בטאב "מכסות" לפני השיבוץ.', 'err');
    syncBook(); show('book-modal');
  }
  function syncBook() { document.getElementById('b-new-wrap').hidden = !!bForm.existing.value; }
  bForm.existing.addEventListener('change', syncBook);
  bForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var num = bForm.existing.value || bForm.container_number.value.trim().toUpperCase();
    if (!num) { notice('ציין מספר מכולה או בחר מכולה פתוחה.', 'err'); return; }
    var r = await call('/import/book', { vehicle_id: bForm.vehicle_id.value, container_number: num, quota_id: bForm.quota_id.value || null });
    if (r.ok) { hide('book-modal'); load(false); }
  });

  async function unbook(v) {
    if (!confirm('להוציא את ' + v.title + ' מהמכולה ' + (v.container_number || '') + '?')) return;
    var r = await call('/import/unbook', { vehicle_id: v.id });
    if (r.ok) load(false);
  }
  async function cancelVehicle(v) {
    var reason = prompt('סיבת ביטול התיק ' + v.title + ' (' + (v.vin || '') + '):');
    if (reason === null) return;
    var r = await call('/import/cancel', { vehicle_id: v.id, reason: reason });
    if (r.ok) load(false);
  }

  /* ---------- עריכת תיק ---------- */
  var vForm = document.getElementById('vehicle-form');
  function openVehicle(v) {
    vForm.reset(); vForm.vehicle_id.value = v.id;
    document.getElementById('vehicle-line').textContent = v.title + ' · VIN ' + (v.vin || '—');
    vForm.order_number.value = v.order_number || ''; vForm.stock_lot_number.value = v.stock_lot_number || '';
    vForm.standard_type.value = v.standard_type || ''; vForm.model_year.value = v.model_year || '';
    vForm.color.value = v.color || ''; vForm.trim.value = v.trim || ''; vForm.location.value = v.location || '';
    vForm.has_spare_key.value = v.has_spare_key === true ? 'true' : v.has_spare_key === false ? 'false' : '';
    vForm.misc_notes.value = v.misc_notes || '';
    show('vehicle-modal');
  }
  vForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var p = { vehicle_id: vForm.vehicle_id.value, order_number: vForm.order_number.value, stock_lot_number: vForm.stock_lot_number.value,
      standard_type: vForm.standard_type.value, model_year: vForm.model_year.value, color: vForm.color.value, trim: vForm.trim.value,
      location: vForm.location.value, misc_notes: vForm.misc_notes.value, has_spare_key: vForm.has_spare_key.value };
    var r = await call('/import/vehicle', { vehicle: p });
    if (r.ok) { hide('vehicle-modal'); load(false); }
  });

  /* ---------- checklist מכס ---------- */
  async function toggleChecklist(el, v) {
    var body = el.querySelector('.cl');
    if (!body.hidden) { body.hidden = true; return; }
    body.hidden = false; body.innerHTML = '<div class="empty small">טוען…</div>';
    var r;
    try { r = await YM.api('/import/checklist', { token: session.token, vehicle_id: v.id }); } catch (err) { body.innerHTML = '<div class="empty small">' + E(err.message) + '</div>'; return; }
    if (r.ok !== true) { body.innerHTML = '<div class="empty small">' + E(r.message_he || 'לא ניתן לטעון.') + '</div>'; return; }
    var pct = r.total ? Math.round(100 * r.done / r.total) : 0;
    body.innerHTML = '<div class="cl-progress"><div class="bar"><span style="width:' + pct + '%"></span></div><div class="txt">' + r.done + ' / ' + r.total + ' אומתו</div></div>' +
      r.items.map(function (it) {
        return '<div class="cl-item st-' + E(it.status) + '" data-id="' + E(it.id) + '"><div><div class="cl-label">' + E(it.label_he) + '</div>' + (it.notes ? '<div class="cl-notes">' + E(it.notes) + '</div>' : '') + '</div>' +
          (r.editable ? '<div class="cl-ctl"><select class="cl-status">' + [['missing','חסר'],['received','התקבל'],['verified','אומת']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === it.status ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><button class="btn-icon cl-note" type="button" title="הערה">✎</button></div>'
                      : '<div class="cl-ctl"><span class="tag">' + E(it.status_he) + '</span></div>') + '</div>';
      }).join('');
    body.querySelectorAll('.cl-item').forEach(function (row) {
      var rid = row.getAttribute('data-id');
      var sel = row.querySelector('.cl-status');
      if (sel) sel.addEventListener('change', async function () { var x = await call('/import/requirement', { requirement_id: rid, status: sel.value }); if (x.ok) { body.hidden = true; toggleChecklist(el, v); } });
      var nb = row.querySelector('.cl-note');
      if (nb) nb.addEventListener('click', async function () {
        var cur = row.querySelector('.cl-notes'); var txt = prompt('הערה:', cur ? cur.textContent : '');
        if (txt === null) return;
        var x = await call('/import/requirement', { requirement_id: rid, notes: txt }); if (x.ok) { body.hidden = true; toggleChecklist(el, v); }
      });
    });
  }

  /* ---------- מעקב מכולות ---------- */
  var NEXT_LABEL = { at_sea: 'יצאה לדרך', port_arrival: 'הגיעה לנמל', customs: 'נכנסה למכס', ready: 'שוחררה — למלאי בארץ' };
  var NEXT_MSG = {
    at_sea: 'המכולה יצאה לדרך? הרכבים שבה יעברו ל"בדרך" ומרגע זה מותר לשייך להם לקוח (פריסייל).',
    port_arrival: 'המכולה הגיעה לנמל?', customs: 'המכולה נכנסה למכס?', ready: 'המכולה שוחררה? הרכבים שבה ייכנסו למלאי בארץ.'
  };

  function contName(c) {
    if (c.container_number) return c.container_number;
    if (c.booking_number) return 'בוקינג ' + c.booking_number;
    if (c.bl_number) return 'B/L ' + c.bl_number;
    return 'מכולה ללא מספר';
  }
  function stepsHtml(status) {
    var idx = CSTEPS.findIndex(function (s) { return s[0] === status; });
    return CSTEPS.map(function (s, i) { return '<span class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + s[1] + '</span>'; }).join('<span class="sep">›</span>');
  }
  function nextStep(status) {
    var idx = CSTEPS.findIndex(function (s) { return s[0] === status; });
    return idx >= 0 && idx < CSTEPS.length - 1 ? CSTEPS[idx + 1][0] : null;
  }
  function etaText(c) {
    if (!c.eta) return null;
    var days = Math.round((new Date(c.eta + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    var rel = c.status === 'pending' || c.status === 'at_sea'
      ? (days > 0 ? 'בעוד ' + days + ' ימים' : days === 0 ? 'היום' : 'עבר לפני ' + (-days) + ' ימים')
      : null;
    return fmtDate(c.eta) + (rel ? ' · ' + rel : '');
  }
  var SIZE_HE = { '20DV': "20' רגילה", '20HC': "20' גבוהה", '40DV': "40' רגילה", '40HC': "40' גבוהה", '45HC': "45' גבוהה" };
  function sizeText(c) { return c.size ? '\u2066' + c.size + '\u2069' + (SIZE_HE[c.size] ? ' — ' + SIZE_HE[c.size].replace(/^(\d+)'/, '$1 רגל') : '') + ' · ' + c.capacity + ' רכבים' : null; }
  // קאט-אופ נשמר בשעון נמל הטעינה (בלי אזור זמן) — מציגים כפי שכתוב בבוקינג
  function lts(t) { if (!t) return null; var m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] + ':' + m[5] : t; }
  function ltsDate(t) { var m = t && String(t).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null; }
  var CUTOFFS = [['dg_cutoff', 'קאט-אופ חומ"ס (DG)'], ['si_cutoff', 'קאט-אופ מסמכים (SI)'], ['vgm_cutoff', 'קאט-אופ VGM'], ['cargo_cutoff', 'קאט-אופ מטען (כניסה לנמל)']];
  // הקאט-אופ הקרוב שעוד לא עבר — רק כשהמכולה עוד לא יצאה
  function nextCutoff(c) {
    if (c.status !== 'pending') return null;
    var now = new Date(), best = null;
    CUTOFFS.forEach(function (k) { var d = ltsDate(c[k[0]]); if (d && d > now && (!best || d < best.d)) best = { d: d, label: k[1], raw: c[k[0]] }; });
    if (!best) return null;
    best.hours = Math.round((best.d - now) / 3600000);
    return best;
  }
  function kg(n) { return n ? Number(n).toLocaleString('en-US') + ' ק"ג' : null; }

  function routeText(c) {
    if (!c.port_of_loading && !c.port_of_discharge) return null;
    // הסדר הוא תמיד טעינה ואחריה יעד; החץ נבחר לפי כיוון הכתב של שמות הנמלים
    var rtl = /[\u0590-\u05FF]/.test((c.port_of_loading || '') + (c.port_of_discharge || ''));
    return (c.port_of_loading || '?') + (rtl ? ' ← ' : ' → ') + (c.port_of_discharge || '?');
  }

  function renderContainers() {
    var host = document.getElementById('containers');
    var all = data.containers || [];
    var list = all.filter(function (c) { return contPass(c); });
    resultLine('cont-result', list.length, all.length, contActive() && all.length > 0, 'מכולות', clearCont);
    if (all.length && !list.length) { host.innerHTML = '<div class="empty">לא נמצאו מכולות שמתאימות לחיפוש ולסינון.</div>'; return; }
    if (!list.length) {
      host.innerHTML = '<div class="empty">אין מכולות במעקב. מכולה נפתחת אוטומטית כשיאיר שולח למייל אישור בוקינג או שטר מטען, או ידנית בשיבוץ רכב למכולה (בלוח הרכבים).</div>';
      return;
    }
    host.innerHTML = list.map(function (c) {
      var vehs = (c.vehicles || []).map(function (v) { return '<span class="doc">' + E(v.title) + ' · ' + E(v.vin_tail) + (v.color ? ' · ' + E(v.color) : '') + ' · ' + E(v.status_he) + '</span>'; });
      for (var i = vehs.length; i < c.capacity; i++) vehs.push('<span class="doc empty-slot">מקום פנוי</span>');
      var flags = [];
      if (c.source === 'email') flags.push('<span class="tag">נפתחה מהמייל</span>');
      if (!c.container_number) flags.push('<span class="tag warn">ממתין למספר מכולה</span>');
      if (c.eta_overdue) flags.push('<span class="tag warn">ה-ETA עבר — לעדכן</span>');
      if (c.expected_unlinked) flags.push('<span class="tag warn">' + c.expected_unlinked + ' רכבים מהמסמכים עוד לא שובצו</span>');
      if (c.port_last_error) flags.push('<span class="tag warn">שגיאה מול רשות הנמלים</span>');
      if (c.recent_warnings) flags.push('<span class="tag warn">' + c.recent_warnings + ' התראות</span>');
      var next = nextStep(c.status);
      var suggest = c.departure_suggested
        ? '<div class="suggest">לפי המסמכים המכולה עלתה על האונייה ב-' + E(fmtDate(c.departed_at)) + '.' +
          (canManage ? ' <button class="btn-icon primary" type="button" data-act="advance" data-status="at_sea">לאשר "יצאה לדרך"</button>' : '') + '</div>'
        : '';
      var acts = '<button class="btn-icon primary" type="button" data-act="track">מעקב מלא</button>' +
        (c.tracking_url ? '<a class="btn-icon" href="' + E(c.tracking_url) + '" target="_blank" rel="noopener">באתר חברת הספנות ↗</a>' : '');
      if (canManage) {
        acts += '<button class="btn-icon" type="button" data-act="edit">פרטי מכולה</button>';
        if (next && !(next === 'at_sea' && c.departure_suggested)) acts += '<button class="btn-icon" type="button" data-act="advance" data-status="' + next + '">' + E(NEXT_LABEL[next]) + '</button>';
      }
      var last = c.last_event ? '<div class="last-ev">עדכון אחרון: ' + E(c.last_event.title_he) + ' · ' + E(fmtDT(c.last_event.at)) + (c.last_event.source === 'email' ? ' · מהמייל' : c.last_event.source === 'port' ? ' · רשות הנמלים' : '') + '</div>' : '';
      return '<div class="cont" data-id="' + E(c.id) + '">' +
        '<div class="head"><span>' + (c.container_number ? '' : '<span class="num-l">' + (c.booking_number ? 'בוקינג' : 'שטר מטען') + '</span> ') +
          '<span class="num">' + E(c.container_number || c.booking_number || c.bl_number || '—') + '</span>' +
          (c.size ? ' <span class="size-chip">' + E(c.size) + '</span>' : '') + (c.dangerous_goods ? ' <span class="size-chip dg" title="מסומן בבוקינג כחומרים מסוכנים (Dangerous Goods)">חומ"ס</span>' : '') +
          '</span><span class="status-pill">' + E(c.status_he) + '</span></div>' +
        '<div class="steps">' + stepsHtml(c.status) + '</div>' +
        suggest + cutoffAlert(c) +
        '<div class="kv">' + kv('ETA', etaText(c)) + kv('אונייה', c.vessel_name ? c.vessel_name + (c.voyage_number ? ' · ' + c.voyage_number : '') : null) +
          kv('חברת ספנות', c.shipping_line) + kv('מסלול', routeText(c)) +
          kv('בוקינג', c.container_number ? c.booking_number : null) + kv('שטר מטען', c.bl_number) +
          kv('טלקס רליס', c.telex_release ? 'התקבל' + (c.telex_release_at ? ' ' + fmtDate(c.telex_release_at) : '') : 'טרם') + kv('גודל', sizeText(c)) + '</div>' +
        (flags.length ? '<div class="meta">' + flags.join('') + '</div>' : '') +
        portStepsHtml(c) +
        '<div class="vehs">' + vehs.join('') + '</div>' + last +
        '<div class="actions">' + acts + '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('.cont').forEach(function (el) {
      var id = el.getAttribute('data-id');
      var c = list.filter(function (x) { return x.id === id; })[0];
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          if (act === 'edit') openContainer(c);
          else if (act === 'track') openTracking(c.id);
          else if (act === 'advance') advance(c, b.getAttribute('data-status'));
        });
      });
    });
  }
  function cutoffAlert(c) {
    var n = nextCutoff(c);
    if (!n) return '';
    var when = n.hours < 48 ? 'בעוד ' + n.hours + ' שעות' : 'בעוד ' + Math.round(n.hours / 24) + ' ימים';
    return '<div class="suggest' + (n.hours < 72 ? ' warn' : '') + '">' + E(n.label) + ': ' + E(lts(n.raw)) + ' (שעון נמל הטעינה) · ' + E(when) + '</div>';
  }
  function kv(k, v) { return '<div><span class="k">' + E(k) + '</span><span class="v">' + E(v || '—') + '</span></div>'; }

  async function advance(c, st) {
    if (!confirm(NEXT_MSG[st])) return false;
    var r = await call('/import/container', { container: { container_id: c.id, status: st } });
    if (r.ok) { load(false); if (!document.getElementById('track-modal').hidden) openTracking(c.id); }
    return r.ok;
  }

  /* ---------- מסך מעקב מלא ---------- */
  // שלבי הנמל מ-TaskYam (רשות הנמלים) — מהגעת האונייה ועד יציאה מהנמל
  var PORT_STEPS = [
    ['manifest', 'במצהר'], ['unloaded', 'נפרקה'], ['delivery_order', 'פקודת מסירה'], ['customs_check', 'בדיקת מכס'],
    ['customs_release', 'שחרור מכס'], ['port_release', 'שחרור נמל'], ['exit', 'יצאה מהנמל']];
  function portStepsHtml(c) {
    var ms = c.port_milestones || {};
    var any = PORT_STEPS.some(function (s) { return ms[s[0]]; });
    if (!any) return '';
    return '<div class="port-steps">' + PORT_STEPS.filter(function (s) { return s[0] !== 'customs_check' || ms.customs_check; }).map(function (s) {
      var d = ms[s[0]];
      return '<span class="' + (d ? 'done' : '') + '" title="' + E(d ? fmtDT(d) : 'טרם') + '">' + E(s[1]) + (d ? ' <small>' + E(fmtDate(d).slice(0, 5)) + '</small>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function portLine(c) {
    if (c.port_last_error) return '<div class="port-line err">רשות הנמלים: ' + E(c.port_last_error) + '</div>';
    if (c.port_last_check_at) return '<div class="port-line">נבדק מול רשות הנמלים (TaskYam) · ' + E(fmtDT(c.port_last_check_at)) + (c.port_name ? ' · ' + E(c.port_name) : '') + (c.manifest_number ? ' · מצהר ' + E(c.manifest_number) : '') + '</div>';
    return '';
  }

  var EV_ICON = { port: '⚓', opened: '◎', booking: '⚓', document: '✉', status: '●', eta_changed: '⏱', departure_detected: '⚑', vehicle_linked: '+', vehicle_removed: '−', warning: '!', note: '✎' };
  var trackId = null;

  async function openTracking(id) {
    trackId = id;
    var body = document.getElementById('track-body');
    body.innerHTML = '<div class="empty small">טוען…</div>';
    document.getElementById('track-title').textContent = 'מעקב מכולה';
    show('track-modal');
    try { if (history.replaceState) history.replaceState(null, '', 'orders.html?container=' + encodeURIComponent(id)); } catch (e) {}
    var r;
    try { r = await YM.api('/import/container-tracking', { token: session.token, container_id: id }); }
    catch (err) { body.innerHTML = '<div class="empty small">' + E(err.message) + '</div>'; return; }
    if (trackId !== id) return;
    if (r.ok !== true) { body.innerHTML = '<div class="empty small">' + E(r.message_he || 'לא ניתן לטעון את המכולה.') + '</div>'; return; }
    renderTracking(r);
  }

  function renderTracking(r) {
    var c = r.container, can = r.viewer && r.viewer.can_manage;
    document.getElementById('track-title').textContent = contName(c);
    var next = nextStep(c.status);
    var head = '<div class="tr-head"><span class="status-pill">' + E(c.status_he) + '</span>' +
      (c.eta ? '<span class="tr-eta' + (c.eta_overdue ? ' late' : '') + '">ETA ' + E(etaText(c)) + '</span>' : '<span class="tr-eta">אין ETA עדיין</span>') + '</div>' +
      '<div class="steps">' + stepsHtml(c.status) + '</div>';
    var alerts = '';
    if (c.departure_suggested) alerts += '<div class="suggest">לפי המסמכים המכולה עלתה על האונייה ב-' + E(fmtDate(c.departed_at)) + '.' + (can ? ' <button class="btn-icon primary" type="button" data-tr="advance" data-status="at_sea">לאשר "יצאה לדרך"</button>' : '') + '</div>';
    if (c.eta_overdue) alerts += '<div class="suggest warn">ה-ETA (' + E(fmtDate(c.eta)) + ') עבר והמכולה עדיין לא סומנה כהגיעה לנמל. לבדוק באתר חברת הספנות ולעדכן.</div>';
    alerts += cutoffAlert(c);
    if (!c.container_number) alerts += '<div class="suggest warn">עדיין אין מספר מכולה — הרכבים ישובצו אוטומטית כשיגיע מייל עם המספר, או שאפשר להזין אותו ב"פרטי מכולה".</div>';

    var portBlock = (portStepsHtml(c) || c.port_last_check_at || c.port_last_error)
      ? '<h3>בנמל — רשות הנמלים</h3>' + (portStepsHtml(c) || '<div class="empty small">המכולה עוד לא מופיעה במערכת הנמל — תופיע כשהאונייה תדווח עליה.</div>') + portLine(c) : '';
    var cutBlock = CUTOFFS.some(function (k) { return c[k[0]]; })
      ? '<h3>מועדי קאט-אופ <span class="h-note">(שעון נמל הטעינה, כפי שבבוקינג)</span></h3><div class="cutoffs">' + CUTOFFS.filter(function (k) { return c[k[0]]; }).map(function (k) {
          var d = ltsDate(c[k[0]]), past = d && d < new Date(), soon = d && !past && (d - new Date()) < 72 * 3600000;
          return '<div class="cut' + (past ? ' past' : soon ? ' soon' : '') + '"><span class="k">' + E(k[1]) + '</span><span class="v">' + E(lts(c[k[0]])) + '</span><span class="s">' + (past ? 'עבר' : soon ? 'בקרוב' : '') + '</span></div>';
        }).join('') + '</div>' : '';
    var bookBlock = '<h3>פרטי בוקינג</h3><div class="kv tr-kv">' +
      kv('גודל מכולה', sizeText(c)) + kv('חומרים מסוכנים', c.dangerous_goods === true ? 'כן (DG)' : c.dangerous_goods === false ? 'לא' : null) +
      kv('לקוח בבוקינג', c.shipper_name) + kv('תאריך בוקינג', c.booking_date ? fmtDate(c.booking_date) : null) +
      kv('תיק אצל המשלח', c.forwarder_file_number) + kv('מספר חותם (Seal)', c.seal_number) +
      kv('משקל כולל', kg(c.gross_weight_kg)) + kv('סחורה', c.commodity) + '</div>' +
      ((c.empty_pickup || c.full_return || c.place_of_receipt || c.place_of_delivery) ? '<div class="kv tr-kv wide2">' +
        kv('איסוף מכולה ריקה', c.empty_pickup) + kv('החזרת מכולה מלאה', c.full_return) +
        (c.place_of_receipt ? kv('מקום קבלה', c.place_of_receipt) : '') + (c.place_of_delivery ? kv('מקום מסירה', c.place_of_delivery) : '') + '</div>' : '');
    var details = portBlock + cutBlock + '<h3>משלוח</h3><div class="kv tr-kv">' +
      kv('מספר מכולה', c.container_number) + kv('בוקינג', c.booking_number) + kv('שטר מטען', c.bl_number) + kv('חברת ספנות', c.shipping_line) +
      kv('משלח', c.freight_forwarder) + kv('אונייה', c.vessel_name ? c.vessel_name + (c.voyage_number ? ' · ' + c.voyage_number : '') : null) +
      kv('נמל טעינה', c.port_of_loading) + kv('נמל יעד', c.port_of_discharge) +
      kv('ETD', c.etd ? fmtDate(c.etd) : null) + kv('עלתה לאונייה', c.departed_at ? fmtDate(c.departed_at) : null) +
      kv('הגיעה לנמל', c.arrived_at ? fmtDate(c.arrived_at) : null) +
      kv('טלקס רליס', c.telex_release ? 'התקבל' + (c.telex_release_at ? ' ' + fmtDate(c.telex_release_at) : '') : 'טרם') + '</div>' +
      (c.notes ? '<div class="tr-notes">' + E(c.notes) + '</div>' : '') + bookBlock;

    var acts = (c.tracking_url ? '<a class="btn-icon" href="' + E(c.tracking_url) + '" target="_blank" rel="noopener">מעקב באתר חברת הספנות ↗</a>' : '');
    if (can) {
      acts += '<button class="btn-icon" type="button" data-tr="edit">פרטי מכולה</button>';
      if (next && !(next === 'at_sea' && c.departure_suggested)) acts += '<button class="btn-icon primary" type="button" data-tr="advance" data-status="' + next + '">' + E(NEXT_LABEL[next]) + '</button>';
    }

    var vehs = (r.vehicles || []).map(function (v) {
      var cu = v.customs && v.customs.total ? ' · מכס ' + v.customs.done + '/' + v.customs.total : '';
      return '<a class="tr-veh" href="inventory.html?ref=' + encodeURIComponent(v.vin || v.id) + '"><span class="t">' + E(v.title || '—') + '</span>' +
        '<span class="s">' + E([v.model_year, v.color, v.vin ? 'VIN ' + v.vin : null, kg((c.vehicle_weights || {})[v.vin])].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="s">' + E(v.status_he) + E(cu) + (v.requested_customer_name ? ' · מבוקש: ' + E(v.requested_customer_name) : '') + '</span></a>';
    }).join('');
    var missing = (r.expected_unlinked || []).map(function (m) {
      var w = kg((c.vehicle_weights || {})[m.vin]);
      return '<div class="tr-miss"><span class="ltr">' + E(m.vin) + '</span>' + (w ? ' · ' + E(w) : '') + ' · ' + (m.vehicle_id ? E(m.title || '') + ' · ' + E(m.status_he || '') + ' — לשבץ מלוח הרכבים' : 'אין תיק רכב במערכת') + '</div>';
    }).join('');
    var vehBlock = '<h3>רכבים במכולה (' + (r.vehicles || []).length + '/' + c.capacity + ')</h3>' +
      (vehs ? '<div class="tr-vehs">' + vehs + '</div>' : '<div class="empty small">עדיין לא שובצו רכבים.</div>') +
      (missing ? '<div class="tr-missing"><div class="k">הופיעו במסמכי המשלוח ועוד לא שובצו:</div>' + missing + '</div>' : '');

    var docs = (r.documents || []).map(function (d) {
      var label = E(d.doc_type_he || 'מסמך') + ' · ' + E(d.vin_tail || '') + (d.filename ? ' · <span class="ltr">' + E(d.filename) + '</span>' : '');
      return d.drive_url ? '<a class="doc" href="' + E(d.drive_url) + '" target="_blank" rel="noopener">' + label + '</a>' : '<span class="doc">' + label + '</span>';
    }).join('');
    var docBlock = r.viewer && r.viewer.can_docs ? '<h3>מסמכי משלוח ומכס</h3>' + (docs ? '<div class="vehs">' + docs + '</div>' : '<div class="empty small">אין עדיין מסמכי משלוח בתיקי הרכבים.</div>') : '';

    var events = (r.events || []).map(function (e) {
      return '<li class="ev ev-' + E(e.type) + '"><span class="ic">' + E(EV_ICON[e.type] || '•') + '</span><div>' +
        '<div class="t">' + E(e.title_he) + '</div>' +
        (e.summary_he ? '<div class="sm">' + E(e.summary_he) + '</div>' : '') +
        '<div class="m">' + E(fmtDT(e.at)) + (e.location ? ' · ' + E(e.location) : '') + ' · ' + E(e.source === 'email' ? 'מהמייל' : e.source === 'port' ? 'רשות הנמלים' : e.source === 'system' ? 'מערכת' : (e.by || 'ידני')) + '</div></div></li>';
    }).join('');
    var addForm = can ? '<form class="tr-add" id="tr-add" novalidate><input name="title_he" placeholder="הוספת עדכון לציר הזמן — למשל: המשלח אישר טעינה ביום שני" maxlength="500"><input name="location" placeholder="מיקום (אופציונלי)"><button class="btn-primary small" type="submit">הוספה</button></form>' : '';
    var timeline = '<h3>ציר זמן</h3>' + addForm + (events ? '<ol class="timeline">' + events + '</ol>' : '<div class="empty small">אין עדיין אירועים.</div>');

    var body = document.getElementById('track-body');
    body.innerHTML = head + alerts + details + '<div class="tr-acts">' + acts + '</div>' + vehBlock + docBlock + timeline;
    body.querySelectorAll('[data-tr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-tr');
        if (a === 'edit') { hide('track-modal'); openContainer(c); }
        else if (a === 'advance') advance(c, b.getAttribute('data-status'));
      });
    });
    var f = document.getElementById('tr-add');
    if (f) f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var t = f.title_he.value.trim();
      if (!t) { f.title_he.focus(); return; }
      var x = await call('/import/container-event', { event: { container_id: c.id, title_he: t, location: f.location.value.trim() } });
      if (x.ok) { openTracking(c.id); load(false); }
    });
  }

  var cForm = document.getElementById('container-form');
  var C_FIELDS = ['container_number', 'booking_number', 'bl_number', 'freight_forwarder', 'vessel_name', 'shipping_line', 'voyage_number',
                  'port_of_loading', 'port_of_discharge', 'etd', 'departed_at', 'eta', 'notes',
                  'size', 'capacity', 'seal_number', 'shipper_name', 'forwarder_file_number', 'booking_date', 'dangerous_goods',
                  'dg_cutoff', 'si_cutoff', 'vgm_cutoff', 'cargo_cutoff', 'empty_pickup', 'full_return', 'gross_weight_kg'];
  function formVal(k, v) {
    if (v === null || v === undefined) return '';
    if (/_cutoff$/.test(k)) return String(v).slice(0, 16).replace(' ', 'T');
    if (k === 'dangerous_goods') return v === true ? 'true' : v === false ? 'false' : '';
    return String(v);
  }
  function openContainer(c) {
    cForm.reset(); cForm.container_id.value = c.id;
    document.getElementById('container-title').textContent = contName(c);
    C_FIELDS.forEach(function (k) { if (cForm[k]) cForm[k].value = formVal(k, c[k]); });
    cForm.telex_release.checked = !!c.telex_release;
    show('container-modal');
  }
  cForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var p = { container_id: cForm.container_id.value, telex_release: cForm.telex_release.checked };
    C_FIELDS.forEach(function (k) { if (cForm[k]) p[k] = cForm[k].value.trim() || null; });
    var r = await call('/import/container', { container: p });
    if (r.ok) { hide('container-modal'); load(false); }
  });

  /* ---------- מכסות ---------- */
  function renderQuotas() {
    var host = document.getElementById('quotas');
    var all = data.quotas || [];
    var list = all.filter(function (q) { return matchQuery(q.__hay || (q.__hay = haystack(q, [STD_HE[q.standard_type]]))); });
    if (all.length && !list.length) { host.innerHTML = '<div class="empty">לא נמצאו מכסות שמתאימות לחיפוש.</div>'; return; }
    if (!list.length) { host.innerHTML = '<div class="empty">אין מכסות רישיון יבוא עדיין.' + (canManage ? ' הוסיפו את המכסה המאושרת הראשונה כדי לאפשר שיבוץ למכולות.' : '') + '</div>'; return; }
    host.innerHTML = list.map(function (q) {
      var exhausted = q.remaining_quantity <= 0;
      return '<div class="quota-row" data-id="' + E(q.id) + '">' +
        '<div>' + E(q.importer_partner_name) + '</div>' +
        '<div class="q-std">' + E(STD_HE[q.standard_type] || q.standard_type) + '</div>' +
        '<div class="q-make">' + E([q.make, q.model].filter(Boolean).join(' · ') || 'כל דגם') + '</div>' +
        '<div class="ltr q-req">' + E(q.request_number || '—') + '</div>' +
        '<div class="ltr' + (exhausted ? ' exhausted' : '') + '">' + q.used_quantity + ' / ' + q.approved_quantity + '</div>' +
        '<div class="q-valid">' + E(q.valid_until ? fmtDate(q.valid_until) : '—') + '</div>' +
        '<div><span class="status-pill">' + E(q.status_he) + '</span></div>' +
      '</div>';
    }).join('');
    if (canManage) host.querySelectorAll('.quota-row').forEach(function (r) {
      r.addEventListener('click', function () { openQuota(list.filter(function (q) { return q.id === r.getAttribute('data-id'); })[0]); });
    });
  }
  var qForm = document.getElementById('quota-form');
  function openQuota(q) {
    qForm.reset(); qForm.id.value = q ? q.id : '';
    document.getElementById('quota-title').textContent = q ? 'עריכת מכסה' : 'מכסה חדשה';
    if (q) {
      qForm.importer_partner_name.value = q.importer_partner_name || ''; qForm.standard_type.value = q.standard_type || 'canadian';
      qForm.status.value = q.status || 'approved'; qForm.make.value = q.make || ''; qForm.model.value = q.model || '';
      qForm.approved_quantity.value = q.approved_quantity; qForm.valid_until.value = q.valid_until || ''; qForm.request_number.value = q.request_number || '';
    }
    show('quota-modal');
  }
  document.getElementById('new-quota').addEventListener('click', function () { openQuota(null); });
  qForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await call('/import/quota', { quota: { id: qForm.id.value || null, importer_partner_name: qForm.importer_partner_name.value, standard_type: qForm.standard_type.value,
      status: qForm.status.value, make: qForm.make.value, model: qForm.model.value, approved_quantity: qForm.approved_quantity.value, valid_until: qForm.valid_until.value || null, request_number: qForm.request_number.value } });
    if (r.ok) { hide('quota-modal'); load(false); }
  });

  /* ---------- כללי ---------- */
  async function call(path, body) {
    body.token = session.token;
    var r;
    try { r = await YM.api(path, body); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.message_he || (r.ok ? 'בוצע.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
    return r;
  }
  function show(id) { document.getElementById(id).hidden = false; }
  function hide(id) { document.getElementById(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { hide(b.getAttribute('data-close')); }); });
  document.querySelectorAll('.modal').forEach(function (m) { m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); });
  function switchTab(which) {
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('is-active', x.getAttribute('data-tab') === which); });
    ['board','containers','quotas'].forEach(function (k) { document.getElementById('panel-' + k).hidden = k !== which; });
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
  });
  document.getElementById('refresh').addEventListener('click', function () { load(false); });
  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function fmtDT(iso) { return iso ? fmtDate(iso) + ' ' + YM.hhmm(new Date(iso)) : '—'; }
})();
