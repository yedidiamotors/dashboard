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
    document.getElementById('meta-line').textContent = data.vehicles.length + ' רכבים בתהליך יבוא · ' + open.length + ' מכולות פעילות';
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box"><div class="label">בדרך לארץ</div><div class="stat-figure">' + data.vehicles.filter(function (v) { return ['at_sea','port','customs'].indexOf(v.stage) > -1; }).length + '</div>' +
      '<div class="stat-note">' + data.vehicles.filter(function (v) { return v.stage === 'pending'; }).length + ' ממתינים לאישור</div></div>';
    setCount('count-board', data.vehicles.length);
    setCount('count-containers', open.length);
    setCount('count-quotas', (data.quotas || []).length);
    document.getElementById('new-quota').hidden = !canManage;
    renderStages(); renderBoard(); renderRecent(); renderContainers(); renderQuotas();
  }
  function setCount(id, n) { var el = document.getElementById(id); el.textContent = n; el.hidden = !n; }

  /* ---------- לוח ---------- */
  function renderStages() {
    var host = document.getElementById('stages');
    host.innerHTML = STAGES.map(function (s) {
      var n = data.vehicles.filter(function (v) { return v.stage === s.key; }).length;
      return '<div class="stage' + (filter === s.key ? ' is-active' : '') + '" data-stage="' + s.key + '"><div class="n">' + n + '</div><div class="l">' + E(s.label) + '</div></div>';
    }).join('');
    host.querySelectorAll('.stage').forEach(function (el) {
      el.addEventListener('click', function () { var k = el.getAttribute('data-stage'); filter = filter === k ? '' : k; renderStages(); renderBoard(); });
    });
  }

  function renderBoard() {
    var host = document.getElementById('board');
    var groups = STAGES.filter(function (s) { return !filter || s.key === filter; });
    var any = false;
    host.innerHTML = groups.map(function (s) {
      var list = data.vehicles.filter(function (v) { return v.stage === s.key; });
      if (!list.length) return '';
      any = true;
      return '<div class="group"><h3>' + E(s.label) + ' <span class="tag">' + list.length + '</span></h3>' + list.map(vehHtml).join('') + '</div>';
    }).join('');
    if (!any) host.innerHTML = '<div class="empty">' + (filter ? 'אין רכבים בשלב הזה.' : 'אין כרגע רכבים בתהליך יבוא. תיק חדש נפתח אוטומטית ממייל של יאיר או מתמונת מדבקה בוואטסאפ.') + '</div>';
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
    if (v.container_number) meta.push('<span class="tag">מכולה ' + E(v.container_number) + ' · ' + E(v.container_status_he) + (v.container_eta ? ' · ETA ' + fmtDate(v.container_eta) : '') + '</span>');
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
    var list = data.recent || [];
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
    var open = (data.containers || []).filter(function (c) { return c.status === 'pending' && (c.vehicles || []).length < c.capacity; });
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

  /* ---------- מכולות ---------- */
  function renderContainers() {
    var host = document.getElementById('containers');
    var list = data.containers || [];
    if (!list.length) { host.innerHTML = '<div class="empty">אין מכולות עדיין. מכולה נפתחת בשיבוץ הרכב הראשון אליה (בלוח הרכבים).</div>'; return; }
    host.innerHTML = list.map(function (c) {
      var idx = CSTEPS.findIndex(function (s) { return s[0] === c.status; });
      var steps = CSTEPS.map(function (s, i) { return '<span class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + s[1] + '</span>'; }).join('<span style="border:0;padding:0">›</span>');
      var vehs = (c.vehicles || []).map(function (v) { return '<span class="doc">' + E(v.title) + ' · ' + E(v.vin_tail) + (v.color ? ' · ' + E(v.color) : '') + ' · ' + E(v.status_he) + '</span>'; });
      for (var i = vehs.length; i < c.capacity; i++) vehs.push('<span class="doc empty-slot">מקום פנוי</span>');
      var next = idx >= 0 && idx < CSTEPS.length - 1 ? CSTEPS[idx + 1] : null;
      var nextLabel = next ? ({ at_sea: 'יצאה לדרך', port_arrival: 'הגיעה לנמל', customs: 'נכנסה למכס', ready: 'שוחררה — למלאי בארץ' })[next[0]] : null;
      var acts = canManage ? '<button class="btn-icon" type="button" data-act="edit">פרטי מכולה</button>' +
        (next ? '<button class="btn-icon primary" type="button" data-act="advance" data-status="' + next[0] + '">' + E(nextLabel) + '</button>' : '') : '';
      return '<div class="cont" data-id="' + E(c.id) + '">' +
        '<div class="head"><span class="num">' + E(c.container_number) + '</span><span class="status-pill">' + E(c.status_he) + '</span></div>' +
        '<div class="steps">' + steps + '</div>' +
        '<div class="kv">' + kv('אונייה', c.vessel_name) + kv('חברת ספנות', c.shipping_line) + kv('הפלגה', c.voyage_number) + kv('ETA', c.eta ? fmtDate(c.eta) : null) +
          kv('טלקס רליס', c.telex_release ? 'התקבל' + (c.telex_release_at ? ' ' + fmtDate(c.telex_release_at) : '') : 'טרם') + kv('נפתחה', fmtDate(c.created_at)) + '</div>' +
        '<div class="vehs">' + vehs.join('') + '</div>' +
        (acts ? '<div class="actions">' + acts + '</div>' : '') +
      '</div>';
    }).join('');
    host.querySelectorAll('.cont').forEach(function (el) {
      var id = el.getAttribute('data-id');
      var c = list.filter(function (x) { return x.id === id; })[0];
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (b.getAttribute('data-act') === 'edit') { openContainer(c); return; }
          var st = b.getAttribute('data-status');
          var msg = { at_sea: 'המכולה יצאה לדרך? הרכבים שבה יעברו ל"בדרך" ומרגע זה מותר לשייך להם לקוח (פריסייל).', port_arrival: 'המכולה הגיעה לנמל?', customs: 'המכולה נכנסה למכס?', ready: 'המכולה שוחררה? הרכבים שבה ייכנסו למלאי בארץ.' }[st];
          if (!confirm(msg)) return;
          var r = await call('/import/container', { container: { container_id: id, status: st } });
          if (r.ok) load(false);
        });
      });
    });
  }
  function kv(k, v) { return '<div><span class="k">' + E(k) + '</span><span class="v">' + E(v || '—') + '</span></div>'; }

  var cForm = document.getElementById('container-form');
  function openContainer(c) {
    cForm.reset(); cForm.container_id.value = c.id;
    document.getElementById('container-title').textContent = 'מכולה ' + c.container_number;
    cForm.container_number.value = c.container_number || ''; cForm.vessel_name.value = c.vessel_name || '';
    cForm.shipping_line.value = c.shipping_line || ''; cForm.voyage_number.value = c.voyage_number || '';
    cForm.eta.value = c.eta || ''; cForm.telex_release.checked = !!c.telex_release;
    show('container-modal');
  }
  cForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await call('/import/container', { container: { container_id: cForm.container_id.value, container_number: cForm.container_number.value, vessel_name: cForm.vessel_name.value,
      shipping_line: cForm.shipping_line.value, voyage_number: cForm.voyage_number.value, eta: cForm.eta.value || null, telex_release: cForm.telex_release.checked } });
    if (r.ok) { hide('container-modal'); load(false); }
  });

  /* ---------- מכסות ---------- */
  function renderQuotas() {
    var host = document.getElementById('quotas');
    var list = data.quotas || [];
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
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('is-active', x === t); });
      var which = t.getAttribute('data-tab');
      ['board','containers','quotas'].forEach(function (k) { document.getElementById('panel-' + k).hidden = k !== which; });
    });
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
