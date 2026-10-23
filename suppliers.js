/* ============================================================
   ידידיה מוטורס — ספקים ותשלומים (כרטיס ספק)
   העברות לספק, שיוך לרכבים, ביטול רכב (ע״י ספק / ע״י ידידיה),
   יתרה לא משויכת, חיפוש לפי שילדה ישנה וקליטת אישורי העברה.
   כל החישובים וההרשאות (manage_supplier_payments) — בשרת.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }
  var perms = session.permissions || [];

  var STATUS_HE = {
    draft_from_sticker: 'טיוטה', pending_approval: 'ממתין לאישור', approved: 'מאושר', booked: 'שובץ למכולה',
    in_transit: 'בים', port_arrival: 'בנמל', customs: 'במכס', in_stock_israel: 'במלאי בארץ',
    assigned_to_customer: 'שויך ללקוח', licensing_in_progress: 'ברישוי', delivered: 'נמסר', cancelled: 'בוטל'
  };
  var OPEN = ['draft_from_sticker', 'pending_approval', 'approved', 'booked', 'in_transit', 'port_arrival', 'customs'];
  var PAY_HE = {
    paid: ['שולם', 'ok'], partial: ['שולם חלקית', 'warn'], unpaid: ['לא שולם', 'bad'], overpaid: ['שולם ביתר', 'bad'],
    no_price: ['שולם · אין מחיר בתיק', 'warn'], no_price_unpaid: ['אין מחיר בתיק', ''], cancelled: ['בוטל', '']
  };
  var CREDIT_HE = { missing: 'חסר', received: 'התקבל', not_needed: 'לא נדרש' };
  var CURRENCIES = ['USD', 'CAD', 'EUR', 'ILS'];

  var list = null;          // תשובת list
  var card = null;          // תשובת card
  var currentId = null;
  var tab = 'vehicles';
  var vFilter = 'open';

  /* ---------- עזרים ---------- */
  function money(n, cur) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    var v = Number(n);
    var s = v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return (cur ? cur + ' ' : '') + s;
  }
  function dt(s) {
    if (!s) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s);
  }
  function vin6(v) { return v ? '…' + String(v).slice(-6) : '—'; }
  function cur() { return card && card.supplier ? (card.supplier.currency || '') : ''; }
  function num(v) { var x = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(x) ? null : x; }
  function hl(text, q) {
    var t = E(text || '');
    if (!q) return t;
    var qq = String(q).replace(/[^A-Za-z0-9]/g, '');
    if (qq.length < 3) return t;
    try { return t.replace(new RegExp('(' + qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); } catch (e) { return t; }
  }

  async function call(action, p) {
    var res;
    try { res = await YM.api('/suppliers/api', { token: session.token, action: action, p: p || {} }); }
    catch (err) { return { ok: false, message_he: err.message }; }
    if (res.ok !== true && res.__status === 401 && ['INVALID_TOKEN', 'SESSION_EXPIRED', 'USER_INACTIVE', 'SESSION_INVALID'].indexOf(res.error) > -1) {
      YM.clearSession(); location.replace('login.html');
    }
    return res;
  }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
    if (kind !== 'err') setTimeout(function () { if (el.textContent === text) el.innerHTML = ''; }, 6000);
  }
  function bootError(text) {
    var boot = document.getElementById('boot');
    boot.innerHTML = '<div class="mark">YEDIDIA MOTORS</div><div class="msg">' + E(text) + '</div>' +
      '<button class="btn-primary" type="button" id="boot-retry">נסו שוב</button>';
    boot.hidden = false;
    document.getElementById('boot-retry').addEventListener('click', function () { location.reload(); });
  }

  /* ---------- טעינה ---------- */
  init();
  async function init() {
    YM.renderNav('nav', 'suppliers.html', perms);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);
    document.getElementById('signout').addEventListener('click', YM.logout);
    var res = await call('list');
    if (res.ok !== true) { bootError(res.error === 'PERMISSION_DENIED' ? 'אין לך הרשאה לכרטיסי ספקים. ההרשאה ניתנת ליאיר, למנהל המערכת ולמנהל הרכש.' : (res.message_he || 'הטעינה נכשלה.')); return; }
    list = res;
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
    var m = /[?&]s=([0-9a-f-]{36})/i.exec(location.search);
    var q = /[?&]q=([^&]+)/.exec(location.search);
    if (m) await openSupplier(m[1], true); else renderList();
    if (q) { document.getElementById('search').value = decodeURIComponent(q[1]); runSearch(); }
  }

  async function reloadList() { var r = await call('list'); if (r.ok) list = r; }
  async function reloadCard() {
    if (!currentId) { await reloadList(); renderList(); return; }
    var r = await call('card', { supplier_id: currentId });
    if (r.ok) { card = r; renderCard(); } else notice(r.message_he, 'err');
    reloadList();
  }

  /* ---------- רשימת ספקים ---------- */
  function renderList() {
    currentId = null; card = null;
    history.replaceState(null, '', 'suppliers.html');
    document.getElementById('page-title').textContent = 'ספקים ותשלומים';
    var sups = list.suppliers || [];
    var totalUn = sups.filter(function (s) { return Number(s.totals.unallocated) > 0; }).length;
    var short = sups.reduce(function (a, s) { return a + Number(s.totals.shortfall_count || 0); }, 0);
    document.getElementById('meta-line').textContent = sups.length + ' ספקים' + (totalUn ? ' · ' + totalUn + ' עם יתרה לא משויכת' : '') + (short ? ' · ' + short + ' רכבים בחוסר תשלום' : '');
    document.getElementById('side-box').innerHTML = '';
    var html = '';
    var drafts = list.unassigned_drafts || [];
    if (drafts.length) {
      html += '<div class="card"><div class="card-head"><h2>אישורי העברה שלא זוהה להם ספק</h2><span class="card-count">' + drafts.length + '</span></div>' +
        '<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>הועלה</th><th>קובץ</th><th>סכום</th><th>מוטב</th><th>הערה לבנק</th><th></th></tr></thead><tbody>' +
        drafts.map(function (t) {
          return '<tr><td>' + dt(t.created_at) + '</td><td>' + E(t.original_filename || '') + '</td><td class="n">' + money(t.amount, t.currency) + '</td><td>' + E(t.beneficiary_name || '—') + '</td><td class="note">' + E(t.bank_note || '') + '</td>' +
            '<td><div class="acts"><button class="btn-icon primary" type="button" data-review="' + t.id + '">בדיקה ואישור</button></div></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    html += '<div class="sp-grid">' + sups.map(function (s) {
      var t = s.totals || {};
      var flags = [];
      if (Number(t.unallocated) > 0) flags.push('<span class="tag warn">יתרה לא משויכת ' + money(t.unallocated, s.currency) + '</span>');
      if (Number(t.shortfall_count) > 0) flags.push('<span class="tag bad">' + t.shortfall_count + ' בחוסר תשלום</span>');
      if (Number(t.drafts) > 0) flags.push('<span class="tag warn">' + t.drafts + ' אישורים לבדיקה</span>');
      if (Number(t.cancelled) > 0) flags.push('<span class="tag">' + t.cancelled + ' מבוטלים</span>');
      return '<button class="sp-tile" type="button" data-open="' + s.id + '">' +
        '<div><div class="name">' + E(s.name) + '</div><div class="sub">' + E(s.country || '') + (s.currency ? ' · ' + E(s.currency) : ' · מטבע לא הוגדר') + '</div></div>' +
        '<div class="figs"><div class="fig"><div class="l">הועבר</div><div class="v">' + money(t.paid_out) + '</div></div>' +
        '<div class="fig"><div class="l">רכבים פעילים</div><div class="v">' + (t.active_vehicles || 0) + '</div></div>' +
        '<div class="fig"><div class="l">בדרך</div><div class="v">' + (t.open_vehicles || 0) + '</div></div></div>' +
        (flags.length ? '<div class="flags">' + flags.join('') + '</div>' : '') + '</button>';
    }).join('') + '</div>' +
    '<div><button class="btn-ghost small" type="button" id="new-supplier">ספק חדש</button></div>';
    document.getElementById('view').innerHTML = html;
  }

  async function openSupplier(id, first) {
    var r = await call('card', { supplier_id: id });
    if (r.ok !== true) { notice(r.message_he || 'פתיחת הספק נכשלה.', 'err'); if (first) renderList(); return; }
    card = r; currentId = id;
    history.replaceState(null, '', 'suppliers.html?s=' + id);
    renderCard();
    window.scrollTo(0, 0);
  }

  /* ---------- כרטיס ספק ---------- */
  function renderCard() {
    var s = card.supplier, t = card.totals, c = s.currency || '';
    document.getElementById('page-title').textContent = 'כרטיס ספק';
    document.getElementById('meta-line').textContent = (s.country || '') + (c ? ' · מטבע ' + c : '');
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box"><div class="label">יתרה לא משויכת</div><div class="stat-figure">' + money(t.unallocated) + '</div><div class="stat-note">' + E(c) + '</div></div>';

    var bank = s.bank_details || {};
    var html = '<div class="sp-head"><div class="left"><button class="sp-back" type="button" data-back>→ כל הספקים</button>' +
      '<h2>' + E(s.name) + '</h2><div class="meta">' +
      (c ? '<span class="tag">מטבע ספק: ' + E(c) + '</span>' : '<span class="tag warn">מטבע לא הוגדר</span>') +
      (bank.iban || bank.account_number ? '<span class="tag ok">פרטי בנק שמורים — זיהוי אוטומטי</span>' : '<span class="tag warn">אין פרטי בנק — הספק לא יזוהה אוטומטית מאישור העברה</span>') +
      '<span>נראה למנהל רכש ומנהל מערכת בלבד</span></div></div>' +
      '<div class="acts"><button class="btn-ghost small" type="button" data-edit-supplier>פרטי ספק ובנק</button></div></div>';

    html += '<div class="sp-kpis">' +
      kpi('הועבר לספק', money(t.paid_out), (t.transfers_count || 0) + ' העברות' + (Number(t.paid_out_ils) ? ' · ≈ ' + YM.nis(t.paid_out_ils) : ''), '') +
      kpi('משויך לרכבים', money(t.allocated), Number(t.fees) ? 'דמי ביטול ' + money(t.fees) : '', '') +
      kpi('יתרה לא משויכת', money(t.unallocated), Number(t.refunds) ? 'כולל החזרים ' + money(t.refunds) : 'כסף אצל הספק בלי רכב', Number(t.unallocated) > 0 ? 'warn' : '') +
      kpi('חוסר תשלום', money(t.shortfall), (t.shortfall_count || 0) + ' רכבים בדרך שלא שולמו במלואם', Number(t.shortfall) > 0 ? 'bad' : '') +
      kpi('רכבים', String(t.active_vehicles || 0), (t.open_vehicles || 0) + ' בדרך · ' + (t.cancelled || 0) + ' בוטלו', '') + '</div>';

    if (card.alerts && card.alerts.length) {
      html += '<div class="sp-alerts">' + card.alerts.map(function (a) {
        return '<div class="sp-alert ' + E(a.level) + '"><span class="dot"></span><div>' + E(a.text) + '</div></div>';
      }).join('') + '</div>';
    }
    (card.suggestions || []).forEach(function (g, i) {
      html += '<div class="sp-sugg"><div><div class="t">הצעת שיוך: ' + money(g.amount, c) + ' מהעברה ' + E(g.reference || '') + ' → ' + E(g.title || '') + ' <span class="mono">' + vin6(g.vin) + '</span></div>' +
        '<div class="s">' + E(g.why || '') + ' · פנוי בהעברה ' + money(g.free, c) + '</div></div>' +
        '<div class="acts"><button class="btn-primary small" type="button" data-sugg="' + i + '">שייך</button></div></div>';
    });

    var nCan = (card.cancelled || []).length;
    html += '<div class="tabs" role="tablist">' +
      tabBtn('vehicles', 'רכבים ותשלומים', (card.vehicles || []).length) +
      tabBtn('transfers', 'העברות', (card.transfers || []).length + (card.drafts || []).length) +
      tabBtn('cancelled', 'מבוטלים', nCan) +
      tabBtn('stats', 'סטטיסטיקות', null) + '</div>';
    html += '<div id="tab-body"></div>';
    document.getElementById('view').innerHTML = html;
    renderTab();
  }
  function kpi(l, v, f, cls) { return '<div class="sp-kpi ' + cls + '"><div class="l">' + E(l) + '</div><div class="v">' + v + '</div><div class="f">' + E(f || '') + '</div></div>'; }
  function tabBtn(k, l, n) { return '<button class="tab' + (tab === k ? ' is-active' : '') + '" type="button" data-tab="' + k + '">' + E(l) + (n ? ' <span class="tab-count">' + n + '</span>' : '') + '</button>'; }

  function renderTab() {
    var el = document.getElementById('tab-body');
    if (!el) return;
    if (tab === 'vehicles') el.innerHTML = vehiclesHtml();
    else if (tab === 'transfers') el.innerHTML = transfersHtml();
    else if (tab === 'cancelled') el.innerHTML = cancelledHtml();
    else el.innerHTML = statsHtml();
  }

  function allocLines(v, opts) {
    var c = cur();
    var rows = (v.allocations || []).map(function (a) {
      var rel = !!a.released_at;
      var moved = (a.moved_to || []).filter(function (m) { return !m.released; });
      return '<div class="alloc-line' + (rel ? ' released' : '') + '">' +
        (a.kind === 'cancellation_fee' ? '<span class="tag warn">דמי ביטול</span>' : '') +
        '<span class="num">' + money(a.amount, c) + '</span><span>מהעברה ' + E(a.reference || '—') + ' · ' + dt(a.transfer_date) + '</span>' +
        (a.doc_url ? '<a href="' + E(a.doc_url) + '" target="_blank" rel="noopener">אישור</a>' : '') +
        (rel ? '<span class="rel-why">· שוחרר: ' + E(a.release_reason || '') + '</span>' : '') +
        (moved.length ? '<span class="rel-why">→ ' + moved.map(function (m) { return E(m.title || '') + ' ' + vin6(m.vin) + ' (' + money(m.amount) + ')'; }).join(', ') + '</span>' : '') +
        (!rel && opts && opts.release ? '<button class="linkish" type="button" data-release="' + a.id + '">ביטול שיוך</button>' : '') +
        '</div>';
    });
    return rows.length ? '<div class="allocs">' + rows.join('') + '</div>' : '<span class="muted">אין תשלומים משויכים</span>';
  }

  function vehiclesHtml() {
    var c = cur();
    var vs = (card.vehicles || []).filter(function (v) {
      if (vFilter === 'open') return OPEN.indexOf(v.status) > -1;
      if (vFilter === 'short') return ['unpaid', 'partial'].indexOf(v.pay_state) > -1 && OPEN.indexOf(v.status) > -1;
      if (vFilter === 'noprice') return v.purchase_price == null;
      return true;
    });
    var chips = [['open', 'בדרך / פתוחים'], ['short', 'חוסר תשלום'], ['noprice', 'בלי מחיר'], ['all', 'הכול']].map(function (x) {
      return '<button class="chip' + (vFilter === x[0] ? ' is-active' : '') + '" type="button" data-vf="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var rows = vs.map(function (v) {
      var p = PAY_HE[v.pay_state] || ['', ''];
      return '<tr><td><div class="veh-t">' + E(v.title || '—') + '</div><div class="veh-s"><span class="mono">' + E(v.vin || '') + '</span>' + (v.order_number ? ' · הזמנה ' + E(v.order_number) : '') +
        (v.replaces ? ' · מחליף את <span class="mono">' + vin6(v.replaces.vin) + '</span>' : '') + '</div></td>' +
        '<td class="inv">' + E(v.invoice_number || '—') + '</td>' +
        '<td class="n">' + (v.purchase_price != null ? money(v.purchase_price, v.purchase_currency || c) : '<button class="linkish" type="button" data-price="' + v.id + '">הוספת מחיר</button>') + '</td>' +
        '<td class="n">' + money(v.paid) + '</td>' +
        '<td class="n ' + (Number(v.due) > 0 ? 'bad-t' : '') + '">' + (v.due != null ? money(v.due) : '—') + '</td>' +
        '<td><span class="tag ' + p[1] + '">' + E(p[0]) + '</span></td>' +
        '<td><span class="status-pill">' + E(STATUS_HE[v.status] || v.status) + '</span></td>' +
        '<td><div class="acts"><button class="btn-icon primary" type="button" data-alloc-v="' + v.id + '">שיוך תשלום</button>' +
        '<button class="btn-icon" type="button" data-price="' + v.id + '">מחיר/חשבונית</button>' +
        (['in_stock_israel', 'assigned_to_customer', 'licensing_in_progress', 'delivered'].indexOf(v.status) === -1 ? '<button class="btn-icon danger" type="button" data-cancel="' + v.id + '">ביטול רכב</button>' : '') +
        '</div></td></tr>' +
        ((v.allocations || []).length ? '<tr class="is-sub"><td colspan="8">' + allocLines(v, { release: true }) + '</td></tr>' : '');
    }).join('');
    return '<div class="card"><div class="sp-chips">' + chips + '</div>' +
      (vs.length ? '<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>רכב</th><th>חשבונית</th><th>מחיר רכישה</th><th>שולם</th><th>יתרה לתשלום</th><th>תשלום</th><th>סטטוס</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty">אין רכבים בסינון הזה.</div>') + '</div>';
  }

  function transferRows(ts, isDraft) {
    var c = cur();
    return ts.map(function (t) {
      var act = (t.allocations || []).filter(function (a) { return !a.released_at; });
      return '<tr><td>' + dt(t.transfer_date || t.created_at) + (t.direction === 'refund' ? ' <span class="tag ok">החזר מהספק</span>' : '') + '</td>' +
        '<td class="mono">' + E(t.reference || '—') + '</td>' +
        '<td class="n">' + money(t.amount, t.currency || c) + '</td>' +
        '<td class="n">' + (t.fx_rate ? E(t.fx_rate) : '—') + '</td>' +
        '<td class="n">' + (t.amount_ils ? YM.nis(t.amount_ils) : '—') + '</td>' +
        '<td class="note">' + E(t.bank_note || '') + '</td>' +
        '<td>' + (isDraft ? '<span class="tag warn">ממתין לבדיקה</span>' : (act.length ? act.map(function (a) {
          return '<div class="alloc-line">' + (a.kind === 'cancellation_fee' ? '<span class="tag warn">דמי ביטול</span>' : '') + E(a.title || '') + ' <span class="mono">' + vin6(a.vin) + '</span> · ' + money(a.amount) + '</div>';
        }).join('') : '<span class="muted">—</span>')) + '</td>' +
        '<td class="n ' + (Number(t.unallocated) > 0 ? 'warn-t' : '') + '">' + (t.direction === 'refund' ? '—' : money(t.unallocated)) + '</td>' +
        '<td><div class="acts">' + (t.doc_url ? '<a class="btn-icon" href="' + E(t.doc_url) + '" target="_blank" rel="noopener">אישור</a>' : '') +
        (isDraft ? '<button class="btn-icon primary" type="button" data-review="' + t.id + '">בדיקה ואישור</button>'
          : ((Number(t.unallocated) > 0 ? '<button class="btn-icon primary" type="button" data-alloc-t="' + t.id + '">שיוך יתרה</button>' : '') +
             '<button class="btn-icon" type="button" data-review="' + t.id + '">פרטים</button>' +
             '<button class="btn-icon danger" type="button" data-void="' + t.id + '">ביטול העברה</button>')) +
        '</div></td></tr>';
    }).join('');
  }
  function transfersHtml() {
    var head = '<thead><tr><th>תאריך</th><th>אסמכתא</th><th>סכום</th><th>שער</th><th>בשקלים</th><th>הערה לבנק</th><th>שויך ל</th><th>פנוי</th><th></th></tr></thead>';
    var out = '';
    if ((card.drafts || []).length) out += '<div class="card"><div class="card-head"><h2>אישורים שהועלו וממתינים לאישור</h2></div><div class="sp-table-wrap"><table class="sp-table">' + head + '<tbody>' + transferRows(card.drafts, true) + '</tbody></table></div></div>';
    out += '<div class="card"><div class="card-head"><h2>העברות לספק</h2><span class="card-count">ההערה לבנק נקראת מאישור ההעברה ומשמשת להצעת שיוך</span></div>' +
      ((card.transfers || []).length ? '<div class="sp-table-wrap"><table class="sp-table">' + head + '<tbody>' + transferRows(card.transfers, false) + '</tbody></table></div>' : '<div class="empty">עוד לא נרשמו העברות לספק הזה.</div>') + '</div>';
    return out;
  }

  function cancelledHtml() {
    var c = cur();
    var vs = card.cancelled || [];
    if (!vs.length) return '<div class="card"><div class="empty">אין רכבים מבוטלים אצל הספק.</div></div>';
    return '<div class="card"><div class="card-head"><h2>רכבים שבוטלו</h2><span class="card-count">לא יגיעו לארץ · יצאו מהמלאי ומהאתר</span></div><div class="sp-table-wrap"><table class="sp-table"><thead><tr>' +
      '<th>רכב שבוטל</th><th>חשבונית</th><th>בוטל ע״י</th><th>תאריך</th><th>שולם עליו</th><th>דמי ביטול</th><th>איפה הכסף עכשיו</th><th>זיכוי מהספק</th></tr></thead><tbody>' +
      vs.map(function (v) {
        var rel = (v.allocations || []).filter(function (a) { return a.kind === 'purchase' && a.released_at; });
        var total = rel.reduce(function (s, a) { return s + Number(a.amount); }, 0);
        var moved = []; rel.forEach(function (a) { (a.moved_to || []).forEach(function (m) { if (!m.released && m.kind === 'purchase') moved.push(m); }); });
        var movedSum = moved.reduce(function (s, m) { return s + Number(m.amount); }, 0);
        var where = moved.length ? moved.map(function (m) { return E(m.title || '') + ' <span class="mono">' + vin6(m.vin) + '</span> (' + money(m.amount) + ')'; }).join('<br>') : '';
        var left = total - movedSum - Number(v.fee || 0);
        if (left > 0.004) where += (where ? '<br>' : '') + '<span class="warn-t">' + money(left, c) + ' עדיין לא שויכו</span>';
        return '<tr><td><div class="veh-t">' + E(v.title || '') + '</div><div class="veh-s mono">' + E(v.vin || '') + '</div>' +
          (v.replaced_by ? '<div class="veh-s">הוחלף ב- <span class="mono">' + vin6(v.replaced_by.vin) + '</span></div>' : '') + '</td>' +
          '<td>' + E(v.invoice_number || '—') + '</td>' +
          '<td>' + (v.cancelled_by === 'supplier' ? 'הספק' : 'ידידיה') + (v.cancelled_by_name ? ' · ' + E(v.cancelled_by_name) : '') + '<div class="veh-s">' + E(v.cancellation_reason || '') + '</div></td>' +
          '<td>' + dt(v.cancelled_at) + '</td><td class="n">' + money(total) + '</td><td class="n">' + (Number(v.fee) ? money(v.fee) : '—') + '</td>' +
          '<td>' + (where || '<span class="muted">לא שולם עליו</span>') + '</td>' +
          '<td><select class="credit-sel" data-credit="' + v.id + '" aria-label="זיכוי מהספק">' + ['missing', 'received', 'not_needed'].map(function (k) {
            return '<option value="' + k + '"' + ((v.credit_note || 'not_needed') === k ? ' selected' : '') + '>' + CREDIT_HE[k] + '</option>';
          }).join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function statsHtml() {
    var st = card.stats || {}, c = cur();
    var months = st.by_month || [];
    var max = Math.max.apply(null, months.map(function (m) { return m.count; }).concat([1]));
    var MHE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
    var tile = function (l, v) { return '<div class="sp-stat"><div class="l">' + E(l) + '</div><div class="v">' + v + '</div></div>'; };
    return '<div class="card"><div class="sp-stats">' +
      tile('רכבים שנרכשו', st.vehicles_total || 0) +
      tile('סה״כ רכישות (לפי מחיר בתיק)', money(st.purchases_total, c)) +
      tile('מחיר ממוצע לרכב', st.avg_price ? money(st.avg_price, c) : '—') +
      tile('רכבים עם מחיר בתיק', (st.priced_count || 0) + ' מתוך ' + (st.vehicles_total || 0)) +
      tile('החלפות שילדה ע״י הספק', (st.cancelled_by_supplier || 0) + (st.swap_rate != null ? ' (' + st.swap_rate + '%)' : '')) +
      tile('ביטולים שלנו', st.cancelled_by_us || 0) +
      tile('דמי ביטול ששולמו', money(st.fees_total, c)) +
      tile('ממוצע ימים עד שיוך מחדש', st.avg_days_to_reassign != null ? st.avg_days_to_reassign : '—') +
      tile('ממוצע ימים מתשלום עד הפלגה', st.avg_days_payment_to_ship != null ? st.avg_days_payment_to_ship : '—') +
      tile('רכישה ראשונה / אחרונה', dt(st.first_purchase) + ' · ' + dt(st.last_purchase)) +
      '</div><div class="card-head"><h2>רכבים לפי חודש רכישה</h2></div>' +
      '<div class="sp-bars" role="img" aria-label="רכבים לפי חודש">' + months.map(function (m) {
        return '<div class="sp-bar"><div class="c">' + (m.count || '') + '</div><div class="b" style="height:' + Math.round(m.count / max * 110) + 'px"></div></div>';
      }).join('') + '</div><div class="sp-bar-labels">' + months.map(function (m) {
        return '<span>' + MHE[Number(m.month.slice(5, 7)) - 1] + '</span>';
      }).join('') + '</div></div>';
  }

  /* ---------- חיפוש ---------- */
  document.getElementById('search-form').addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
  document.getElementById('search').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { this.value = ''; document.getElementById('search-results').innerHTML = ''; }
  });
  var lastSearch = null;
  async function runSearch() {
    var q = document.getElementById('search').value.trim();
    var box = document.getElementById('search-results');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card"><div class="empty">מחפש…</div></div>';
    var r = await call('search', { q: q });
    if (r.ok !== true) { box.innerHTML = '<div class="banner">' + E(r.message_he || 'החיפוש נכשל.') + '</div>'; return; }
    lastSearch = r;
    var html = '<div class="card"><div class="card-head"><h2>תוצאות חיפוש: ' + E(q) + '</h2><span class="card-count">' + r.vehicles.length + ' רכבים · ' + r.transfers.length + ' העברות · <button class="linkish" type="button" data-close-search>סגירה</button></span></div>';
    r.vehicles.forEach(function (v, i) {
      var allocs = v.allocations || [];
      var paidBox = allocs.length ? allocs.map(function (a) {
        return '<div class="s">' + money(a.amount, a.currency) + ' · העברה ' + hl(a.reference || '—', q) + ' · ' + dt(a.transfer_date) + (a.released_at ? ' · <span class="warn-t">שוחרר</span>' : '') + '</div>' +
          (a.bank_note ? '<div class="s ltr">הערה לבנק: ' + hl(a.bank_note, q) + '</div>' : '') +
          (a.doc_url ? '<div class="s"><a href="' + E(a.doc_url) + '" target="_blank" rel="noopener">אישור ההעברה</a></div>' : '');
      }).join('') : '<div class="s">לא נמצאו תשלומים משויכים לרכב</div>';
      var moved = []; allocs.forEach(function (a) { (a.moved_to || []).forEach(function (m) { if (!m.released) moved.push(m); }); });
      var active = allocs.filter(function (a) { return !a.released_at; });
      var nowBox;
      if (v.status === 'cancelled') {
        var relSum = allocs.filter(function (a) { return a.released_at && a.kind === 'purchase'; }).reduce(function (s, a) { return s + Number(a.amount); }, 0);
        var movedSum = moved.reduce(function (s, m) { return s + Number(m.amount); }, 0);
        nowBox = (moved.length ? moved.map(function (m) { return '<div class="s">' + (m.kind === 'cancellation_fee' ? 'דמי ביטול' : '→ ' + E(m.title || '') + ' <span class="mono">' + vin6(m.vin) + '</span>') + ' · ' + money(m.amount) + '</div>'; }).join('') : '') +
          (relSum - movedSum > 0.004 ? '<div class="s warn-t">' + money(relSum - movedSum) + ' יתרה לא משויכת אצל הספק</div>' : '') +
          (!relSum ? '<div class="s">לא שולם על הרכב</div>' : '');
      } else {
        nowBox = active.length ? '<div class="s">משויך לרכב הזה · ' + PAY_HE[v.pay_state][0] + '</div>' : '<div class="s">אין תשלום פעיל</div>';
      }
      html += '<div class="chain">' +
        '<div class="box ' + (v.status === 'cancelled' ? 'bad' : '') + '"><div class="k">' + (v.status === 'cancelled' ? '1 · רכב מבוטל' : '1 · רכב') + '</div><div class="t">' + E(v.title || '') + '</div>' +
        '<div class="s mono">' + hl(v.vin || '', q) + '</div><div class="s">' + E(v.supplier_name || '') + (v.invoice_number ? ' · חשבונית ' + hl(v.invoice_number, q) : '') + '</div>' +
        (v.status === 'cancelled' ? '<div class="s">בוטל ' + dt(v.cancelled_at) + ' ע״י ' + (v.cancelled_by === 'supplier' ? 'הספק' : 'ידידיה') + ' · ' + E(v.cancellation_reason || '') + '</div>' : '<div class="s">' + E(STATUS_HE[v.status] || '') + '</div>') + '</div>' +
        '<div class="box"><div class="k">2 · העברות ששילמו עליו</div>' + paidBox + '</div>' +
        '<div class="box ' + (v.status === 'cancelled' ? 'warn' : 'ok') + '"><div class="k">3 · איפה הכסף עכשיו</div>' + nowBox +
        '<div class="s" style="margin-top:6px"><button class="linkish" type="button" data-report="' + i + '">דוח מעקב לספק (אנגלית, להדפסה/PDF)</button>' +
        (v.supplier_id ? ' · <button class="linkish" type="button" data-open="' + v.supplier_id + '">כרטיס הספק</button>' : '') + '</div></div></div>';
    });
    if (r.transfers.length) {
      html += '<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>תאריך</th><th>ספק</th><th>אסמכתא</th><th>סכום</th><th>הערה לבנק</th><th>שויך ל</th><th>פנוי</th><th></th></tr></thead><tbody>' +
        r.transfers.map(function (t) {
          return '<tr><td>' + dt(t.transfer_date) + '</td><td>' + E(t.supplier_name || '—') + '</td><td class="mono">' + hl(t.reference || '—', q) + '</td><td class="n">' + money(t.amount, t.currency) + '</td>' +
            '<td class="note">' + hl(t.bank_note || '', q) + '</td><td>' + (t.allocations || []).map(function (a) {
              return '<div class="alloc-line' + (a.released_at ? ' released' : '') + '">' + E(a.title || '') + ' <span class="mono">' + vin6(a.vin) + '</span> · ' + money(a.amount) + '</div>';
            }).join('') + '</td><td class="n">' + money(t.unallocated) + '</td>' +
            '<td>' + (t.doc_url ? '<a class="btn-icon" href="' + E(t.doc_url) + '" target="_blank" rel="noopener">אישור</a>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (!r.vehicles.length && !r.transfers.length) html += '<div class="empty">לא נמצא רכב או העברה שמתאימים לחיפוש.</div>';
    box.innerHTML = html + '</div>';
  }

  // דוח מעקב לספק — באנגלית, נפתח בחלון להדפסה / שמירה כ-PDF
  function printReport(v) {
    var w = window.open('', '_blank');
    if (!w) { notice('הדפדפן חסם פתיחת חלון. לאפשר חלונות קופצים לפאנל ולנסות שוב.', 'err'); return; }
    var esc = E;
    var allocs = v.allocations || [];
    var rows = allocs.map(function (a) {
      var moved = (a.moved_to || []).filter(function (m) { return !m.released; });
      return '<tr><td>' + esc(a.reference || '') + '</td><td>' + dt(a.transfer_date) + '</td><td style="text-align:right">' + money(a.amount, a.currency) + '</td><td>' + esc(a.bank_note || '') + '</td><td>' +
        (a.released_at ? 'Released ' + dt(a.released_at) + (moved.length ? '; re-applied to ' + moved.map(function (m) { return (m.kind === 'cancellation_fee' ? 'cancellation fee' : 'VIN ' + esc(m.vin)) + ' (' + money(m.amount) + ')'; }).join(', ') : '; open credit with supplier') : 'Applied to this VIN') + '</td></tr>';
    }).join('');
    w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Payment trace — ' + esc(v.vin || '') + '</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f1f1}.muted{color:#555}.box{border:1px solid #bbb;padding:10px 12px;margin-top:10px}</style></head><body>' +
      '<h1>Payment trace — VIN ' + esc(v.vin || '') + '</h1><div class="muted">YEDIDIA TRADE LTD · Reg. 514569649 · Prepared ' + dt(new Date().toISOString()) + '</div>' +
      '<h2>Vehicle</h2><table><tr><th>Supplier</th><td>' + esc(v.supplier_name || '') + '</td></tr><tr><th>Vehicle</th><td>' + esc(v.title || '') + '</td></tr><tr><th>VIN</th><td>' + esc(v.vin || '') + '</td></tr>' +
      '<tr><th>Invoice</th><td>' + esc(v.invoice_number || '—') + '</td></tr><tr><th>Purchase price</th><td>' + money(v.purchase_price, v.purchase_currency) + '</td></tr>' +
      (v.status === 'cancelled' ? '<tr><th>Status</th><td>CANCELLED ' + dt(v.cancelled_at) + ' — ' + (v.cancelled_by === 'supplier' ? 'vehicle replaced / cancelled by supplier' : 'cancelled by buyer') + (v.replaced_by ? '; replaced by VIN ' + esc(v.replaced_by.vin) : '') + '</td></tr>' : '') + '</table>' +
      '<h2>Payments made for this VIN</h2>' + (rows ? '<table><tr><th>Transfer ref.</th><th>Value date</th><th>Amount</th><th>Payment details (as sent to bank)</th><th>Current application</th></tr>' + rows + '</table>' : '<p>No payments recorded.</p>') +
      '<div class="box">Please apply the above payment(s) as stated. Transfer confirmations are attached / available on request.</div>' +
      '<script>setTimeout(function(){window.print()},300)<\/script></body></html>');
    w.document.close();
  }

  /* ---------- חלון ---------- */
  var modal = document.getElementById('modal');
  function openModal(html, narrow) {
    document.getElementById('modal-body').innerHTML = html;
    modal.querySelector('.modal-box').classList.toggle('narrow', !!narrow);
    modal.hidden = false;
    var f = modal.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModal() { modal.hidden = true; document.getElementById('modal-body').innerHTML = ''; }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  function modalErr(text) { var el = document.getElementById('m-err'); if (el) el.textContent = text || ''; }
  function busy(btn, on) { if (btn) { btn.disabled = on; } }

  /* ---------- העלאת אישור העברה ---------- */
  var fileInput = document.getElementById('transfer-file');
  function startUpload() { fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    openModal('<h2 id="modal-title">קליטת אישור העברה</h2><div class="uploading"><div class="spinner"></div><div>מעלה וקורא את האישור… זה לוקח כ-20 שניות.</div><div class="hint">' + E(f.name) + '</div></div>', true);
    var fd = new FormData();
    fd.append('token', session.token);
    if (currentId) fd.append('supplier_id', currentId);
    fd.append('file', f, f.name);
    var res;
    try {
      var resp = await fetch(YM.API_BASE + '/suppliers/transfer-upload', { method: 'POST', body: fd });
      res = await resp.json().catch(function () { return {}; });
    } catch (e) { res = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (res.ok !== true) { openModal('<h2 id="modal-title">קליטת אישור העברה</h2><div class="banner">' + E(res.message_he || 'הקליטה נכשלה.') + '</div>', true); return; }
    reviewTransfer(res.transfer_id);
  });

  /* ---------- בדיקה ואישור העברה (טיוטה מאישור / העברה ידנית / פרטים) ---------- */
  async function reviewTransfer(id, manual) {
    var r = null, t = { direction: 'out', allocations: [] }, sugg = {}, ex = {};
    if (id) {
      r = await call('transfer_get', { transfer_id: id });
      if (r.ok !== true) { notice(r.message_he, 'err'); closeModal(); return; }
      t = r.transfer; sugg = r.suggestions || {}; ex = r.extracted || {};
    } else {
      r = null;
      t.supplier_id = currentId; t.currency = cur() || null;
    }
    var suppliers = (r && r.suppliers) || (list.suppliers || []).map(function (s) { return { id: s.id, name: s.name, currency: s.currency }; });
    if (!t.supplier_id && sugg.supplier_match) t.supplier_id = sugg.supplier_match.supplier_id;
    var isDraft = t.status === 'draft', isConfirmed = t.status === 'confirmed';
    var vehicles = (r && r.vehicles) || [];
    if (!id && currentId && card) vehicles = (card.vehicles || []).filter(function (v) { return v.status !== 'delivered'; }).map(function (v) { return { id: v.id, vin: v.vin, title: v.title, purchase_price: v.purchase_price, paid: v.paid, invoice_number: v.invoice_number }; });

    var allocRows = [];
    if (isDraft) (sugg.vehicles || []).forEach(function (s) { if (Number(s.suggested_amount) > 0) allocRows.push({ vehicle_id: s.vehicle_id, amount: s.suggested_amount }); });
    var checks = (sugg.checks || []).map(function (c) { return '<div class="sp-alert ' + (c.level === 'high' ? 'high' : c.level === 'ok' ? 'ok' : 'warn') + '"><span class="dot"></span><div>' + E(c.text) + '</div></div>'; }).join('');
    var matched = (sugg.vehicles || []).length ? '<div class="sp-alert"><span class="dot"></span><div>בהערה לבנק נמצאו: ' + sugg.vehicles.map(function (s) {
      return E(s.title || '') + ' <span class="mono">' + vin6(s.vin) + '</span> (' + ({ vin: 'שילדה', vin_end: 'סוף שילדה', invoice: 'חשבונית', order: 'מספר הזמנה' }[s.matched_on] || s.matched_on) + (s.due != null ? ' · חסר ' + money(s.due) : '') + ')';
    }).join(', ') + '</div></div>' : '';
    var sel = function (name, opts, val) { return '<select name="' + name + '">' + opts.map(function (o) { return '<option value="' + E(o[0]) + '"' + (String(val || '') === String(o[0]) ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>'; };

    var html = '<h2 id="modal-title">' + (isDraft ? 'בדיקה ואישור העברה' : isConfirmed ? 'פרטי העברה' : 'העברה ידנית לספק') + '</h2>' +
      '<form class="form" id="tr-form" novalidate>' +
      (t.has_file ? '<div class="file-chip">קובץ: ' + E(t.original_filename || '') + (t.doc_url ? ' · <a href="' + E(t.doc_url) + '" target="_blank" rel="noopener">פתיחת האישור</a>' : '') + '</div>' : '') +
      (ex.ocr_error ? '<div class="sp-alert warn"><span class="dot"></span><div>הקריאה האוטומטית לא הצליחה: ' + E(ex.ocr_error) + '. אפשר למלא ידנית.</div></div>' : '') +
      (ex.notes_he ? '<div class="hint">' + E(ex.notes_he) + '</div>' : '') +
      '<div class="sp-alerts">' + checks + matched + '</div>' +
      '<div class="grid2"><div class="field"><label>ספק</label>' + sel('supplier_id', [['', '— בחירה —']].concat(suppliers.map(function (s) { return [s.id, s.name + (s.currency ? ' · ' + s.currency : '')]; })), t.supplier_id) + '</div>' +
      '<div class="field"><label>סוג</label>' + sel('direction', [['out', 'תשלום לספק'], ['refund', 'החזר כספי מהספק']], t.direction) + '</div></div>' +
      '<div class="grid3"><div class="field"><label>תאריך ערך</label><input type="date" name="transfer_date" value="' + E(t.transfer_date || '') + '"></div>' +
      '<div class="field"><label>סכום (במטבע הספק)</label><input name="amount" inputmode="decimal" dir="ltr" value="' + E(t.amount != null ? t.amount : '') + '"></div>' +
      '<div class="field"><label>מטבע</label>' + sel('currency', [['', '—']].concat(CURRENCIES.map(function (c) { return [c, c]; })), t.currency) + '</div></div>' +
      '<div class="grid3"><div class="field"><label>אסמכתא</label><input name="reference" dir="ltr" value="' + E(t.reference || '') + '"></div>' +
      '<div class="field"><label>שער המרה</label><input name="fx_rate" inputmode="decimal" dir="ltr" value="' + E(t.fx_rate || '') + '"></div>' +
      '<div class="field"><label>סכום בשקלים</label><input name="amount_ils" inputmode="decimal" dir="ltr" value="' + E(t.amount_ils || '') + '"></div></div>' +
      '<div class="field"><label>הערה לבנק (על איזו עסקה הועבר)</label><input name="bank_note" dir="ltr" value="' + E(t.bank_note || '') + '"></div>' +
      '<div class="grid2"><div class="field"><label>שם המוטב</label><input name="beneficiary_name" dir="ltr" value="' + E(t.beneficiary_name || '') + '"></div>' +
      '<div class="field"><label>IBAN / חשבון מוטב</label><input name="beneficiary_account" dir="ltr" value="' + E(t.beneficiary_account || '') + '"></div></div>' +
      (t.beneficiary_name || t.beneficiary_account ? '<label class="check"><input type="checkbox" name="remember_bank"' + (isDraft ? ' checked' : '') + '> לשמור את פרטי המוטב בכרטיס הספק לזיהוי אוטומטי בפעם הבאה</label>' : '') +
      '<div class="field"><label>הערות</label><input name="notes" value="' + E(t.notes || '') + '"></div>' +
      (isConfirmed ? '<div class="form-sec">שיוכים קיימים</div><div class="allocs">' + ((t.allocations || []).filter(function (a) { return !a.released_at; }).map(function (a) {
        return '<div class="alloc-line">' + E(a.title || '') + ' <span class="mono">' + vin6(a.vin) + '</span> · ' + money(a.amount) + ' <button class="linkish" type="button" data-release="' + a.id + '">ביטול שיוך</button></div>';
      }).join('') || '<span class="muted">אין</span>') + '</div>' : '') +
      '<div class="form-sec">' + (isConfirmed ? 'שיוך נוסף מהיתרה הפנויה' : 'שיוך לרכבים') + '</div>' +
      '<div class="alloc-rows" id="alloc-rows"></div>' +
      '<div><button class="btn-ghost small" type="button" id="add-alloc">+ רכב</button></div>' +
      '<div class="alloc-sum" id="alloc-sum"></div>' +
      '<div class="hint">מה שלא משויך לרכב נשאר כיתרה לא משויכת אצל הספק, ואפשר לשייך אותו בהמשך (למשל כשהספק שולח חשבונית על שילדה חדשה).</div>' +
      '<div class="modal-err" id="m-err"></div>' +
      '<div class="modal-actions"><button class="btn-primary" type="submit">' + (isConfirmed ? 'שמירה' : 'אישור ושמירה') + '</button>' +
      (isDraft ? '<button class="btn-ghost" type="button" id="drop-draft">מחיקת הטיוטה</button>' : '') +
      '<button class="btn-ghost" type="button" data-close-modal>סגירה</button></div></form>';
    openModal(html);

    var form = document.getElementById('tr-form');
    var vehOpts = function (selId) {
      return '<option value="">— רכב —</option>' + vehicles.map(function (v) {
        var due = v.purchase_price != null ? Number(v.purchase_price) - Number(v.paid || 0) : null;
        return '<option value="' + v.id + '"' + (v.id === selId ? ' selected' : '') + '>' + E((v.title || '') + ' · ' + vin6(v.vin) + (v.invoice_number ? ' · חשבונית ' + v.invoice_number : '') + (due != null ? ' · חסר ' + money(due) : (Number(v.paid) ? ' · שולם ' + money(v.paid) : ''))) + '</option>';
      }).join('');
    };
    function addRow(vid, amt) {
      var div = document.createElement('div');
      div.className = 'alloc-row';
      div.innerHTML = '<select aria-label="רכב">' + vehOpts(vid) + '</select><input aria-label="סכום" inputmode="decimal" dir="ltr" value="' + (amt != null ? amt : '') + '"><button class="x" type="button" aria-label="הסרה">×</button>';
      div.querySelector('.x').addEventListener('click', function () { div.remove(); updateSum(); });
      div.querySelector('input').addEventListener('input', updateSum);
      div.querySelector('select').addEventListener('change', function () {
        var v = vehicles.find(function (x) { return x.id === this.value; }, this);
        var inp = div.querySelector('input');
        if (v && !inp.value && v.purchase_price != null) inp.value = Math.max(0, Number(v.purchase_price) - Number(v.paid || 0));
        updateSum();
      });
      document.getElementById('alloc-rows').appendChild(div);
      updateSum();
    }
    function rowsData() {
      return Array.prototype.map.call(document.querySelectorAll('#alloc-rows .alloc-row'), function (d) {
        return { vehicle_id: d.querySelector('select').value, amount: num(d.querySelector('input').value) };
      }).filter(function (x) { return x.vehicle_id && x.amount; });
    }
    function updateSum() {
      var amt = num(form.amount.value) || 0;
      var used = isConfirmed ? (Number(t.amount) - Number(t.unallocated || 0)) : 0;
      var s = rowsData().reduce(function (a, x) { return a + x.amount; }, 0);
      var left = amt - used - s;
      document.getElementById('alloc-sum').innerHTML = 'משויך עכשיו: <b class="num">' + money(s) + '</b> · ' + (left < -0.004 ? '<span class="bad-t">חריגה של ' + money(-left) + ' מסכום ההעברה</span>' : 'יישאר לא משויך: <b class="num">' + money(left) + '</b>');
    }
    document.getElementById('add-alloc').addEventListener('click', function () { addRow('', null); });
    form.amount.addEventListener('input', updateSum);
    form.supplier_id.addEventListener('change', async function () {
      // ספק אחר → רשימת רכבים של אותו ספק
      var sid = this.value; vehicles = [];
      if (sid) { var cr = await call('card', { supplier_id: sid }); if (cr.ok) vehicles = (cr.vehicles || []).filter(function (v) { return v.status !== 'delivered'; }).map(function (v) { return { id: v.id, vin: v.vin, title: v.title, purchase_price: v.purchase_price, paid: v.paid, invoice_number: v.invoice_number }; }); var s = suppliers.find(function (x) { return x.id === sid; }); if (s && s.currency && !form.currency.value) form.currency.value = s.currency; }
      document.getElementById('alloc-rows').innerHTML = ''; addRow('', null);
    });
    if (allocRows.length) allocRows.forEach(function (a) { addRow(a.vehicle_id, a.amount); }); else if (!isConfirmed || Number(t.unallocated) > 0) addRow('', null);
    if (isConfirmed && !(Number(t.unallocated) > 0)) { document.getElementById('alloc-rows').innerHTML = ''; document.getElementById('add-alloc').hidden = true; }

    var drop = document.getElementById('drop-draft');
    if (drop) drop.addEventListener('click', async function () {
      if (!confirm('למחוק את הטיוטה? הקובץ נשאר ב-Drive.')) return;
      var rr = await call('transfer_void', { transfer_id: t.id });
      if (rr.ok) { closeModal(); notice(rr.message_he); reloadCard(); } else modalErr(rr.message_he);
    });

    var force = { dup: false, over: false };
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      modalErr('');
      var btn = form.querySelector('button[type=submit]');
      var p = {
        id: t.id || null, supplier_id: form.supplier_id.value, direction: form.direction.value, transfer_date: form.transfer_date.value,
        amount: num(form.amount.value), currency: form.currency.value, reference: form.reference.value.trim(),
        fx_rate: num(form.fx_rate.value), amount_ils: num(form.amount_ils.value), bank_note: form.bank_note.value.trim(), notes: form.notes.value.trim(),
        beneficiary_name: form.beneficiary_name.value.trim(), beneficiary_account: form.beneficiary_account.value.trim(),
        remember_bank: !!(form.remember_bank && form.remember_bank.checked),
        allocations: rowsData(), force_duplicate: force.dup, force_overpay: force.over
      };
      if (!p.supplier_id) { modalErr('חובה לבחור ספק.'); return; }
      busy(btn, true);
      var rr = await call('transfer_save', p);
      busy(btn, false);
      if (rr.ok === true) {
        closeModal(); notice(rr.message_he);
        if (rr.supplier_id && rr.supplier_id !== currentId) await openSupplier(rr.supplier_id); else reloadCard();
        return;
      }
      if (rr.error === 'DUPLICATE') {
        force.dup = true;
        modalErr(rr.message_he + ' ' + (rr.duplicates || []).map(function (d) { return dt(d.transfer_date) + ' · ' + money(d.amount) + ' · ' + (d.reference || ''); }).join(' | ') + ' — לחיצה נוספת על "אישור" תשמור בכל זאת.');
        return;
      }
      if (rr.error === 'OVERPAY') { force.over = true; modalErr(rr.message_he + ' לחיצה נוספת על "אישור" תאשר את החריגה.'); return; }
      modalErr(rr.message_he || 'השמירה נכשלה.');
    });
  }

  /* ---------- שיוך תשלום ---------- */
  function freeTransfers() { return (card.transfers || []).filter(function (t) { return t.direction === 'out' && Number(t.unallocated) > 0; }); }
  function allocateFromVehicle(vid) {
    var v = (card.vehicles || []).find(function (x) { return x.id === vid; });
    var ts = freeTransfers();
    if (!ts.length) {
      openModal('<h2 id="modal-title">שיוך תשלום לרכב</h2><p class="muted">אין אצל הספק יתרה פנויה בהעברות. קודם להעלות את אישור ההעברה (או לרשום העברה ידנית) — ושם לשייך לרכב.</p>' +
        '<div class="modal-actions"><button class="btn-primary" type="button" data-upload>העלאת אישור העברה</button><button class="btn-ghost" type="button" data-close-modal>סגירה</button></div>', true);
      return;
    }
    var due = v.due != null ? Number(v.due) : null;
    openModal('<h2 id="modal-title">שיוך תשלום לרכב</h2><form class="form" id="al-form" novalidate><div class="sub">' + E(v.title || '') + ' · <span class="mono">' + E(v.vin || '') + '</span>' + (due != null ? ' · חסר ' + money(due, cur()) : '') + '</div>' +
      '<div class="field"><label>מאיזו העברה</label><select name="transfer_id">' + ts.map(function (t) {
        return '<option value="' + t.id + '">' + E(dt(t.transfer_date) + ' · ' + (t.reference || '') + ' · פנוי ' + money(t.unallocated, t.currency)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>סכום</label><input name="amount" dir="ltr" inputmode="decimal" value="' + (due != null ? Math.min(due, Number(ts[0].unallocated)) : ts[0].unallocated) + '"></div>' +
      '<div class="modal-err" id="m-err"></div><div class="modal-actions"><button class="btn-primary" type="submit">שיוך</button><button class="btn-ghost" type="button" data-close-modal>ביטול</button></div></form>', true);
    bindAllocForm({ vehicle_id: vid });
  }
  function allocateFromTransfer(tid, preVehicle, preAmount) {
    var t = (card.transfers || []).find(function (x) { return x.id === tid; });
    var vs = (card.vehicles || []).filter(function (v) { return OPEN.indexOf(v.status) > -1 || v.pay_state === 'partial' || v.pay_state === 'unpaid'; });
    openModal('<h2 id="modal-title">שיוך יתרה לרכב</h2><form class="form" id="al-form" novalidate><div class="sub">העברה ' + E(t.reference || '') + ' · ' + dt(t.transfer_date) + ' · פנוי ' + money(t.unallocated, t.currency) + '</div>' +
      '<div class="field"><label>לאיזה רכב</label><select name="vehicle_id"><option value="">— רכב —</option>' + vs.map(function (v) {
        return '<option value="' + v.id + '"' + (v.id === preVehicle ? ' selected' : '') + '>' + E((v.title || '') + ' · ' + vin6(v.vin) + (v.invoice_number ? ' · חשבונית ' + v.invoice_number : '') + (v.due != null ? ' · חסר ' + money(v.due) : '')) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>סכום</label><input name="amount" dir="ltr" inputmode="decimal" value="' + (preAmount != null ? preAmount : t.unallocated) + '"></div>' +
      '<div class="modal-err" id="m-err"></div><div class="modal-actions"><button class="btn-primary" type="submit">שיוך</button><button class="btn-ghost" type="button" data-close-modal>ביטול</button></div></form>', true);
    bindAllocForm({ transfer_id: tid });
  }
  function bindAllocForm(fixed) {
    var form = document.getElementById('al-form'); var force = false;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var p = { transfer_id: fixed.transfer_id || form.transfer_id.value, vehicle_id: fixed.vehicle_id || form.vehicle_id.value, amount: num(form.amount.value), force_overpay: force, source: fixed.source };
      if (!p.vehicle_id) { modalErr('לבחור רכב.'); return; }
      var rr = await call('allocate', p);
      if (rr.ok) { closeModal(); notice(rr.message_he); reloadCard(); return; }
      if (rr.error === 'OVERPAY') { force = true; modalErr(rr.message_he + ' לחיצה נוספת על "שיוך" תאשר.'); return; }
      modalErr(rr.message_he || 'השיוך נכשל.');
    });
  }

  /* ---------- ביטול רכב ---------- */
  function cancelVehicle(vid) {
    var v = (card.vehicles || []).find(function (x) { return x.id === vid; });
    var c = cur();
    var paid = Number(v.paid || 0);
    var others = (card.vehicles || []).filter(function (x) { return x.id !== vid && x.status !== 'cancelled' && ['delivered'].indexOf(x.status) === -1; });
    var vOpts = '<option value="">— אין / עוד לא נפתח —</option>' + others.map(function (x) {
      return '<option value="' + x.id + '">' + E((x.title || '') + ' · ' + vin6(x.vin) + (x.invoice_number ? ' · חשבונית ' + x.invoice_number : '') + (x.due != null ? ' · חסר ' + money(x.due) : '')) + '</option>';
    }).join('');
    openModal('<h2 id="modal-title">ביטול רכב</h2><form class="form" id="cx-form" novalidate>' +
      '<div class="sub">' + E(v.title || '') + ' · <span class="mono">' + E(v.vin || '') + '</span>' + (v.invoice_number ? ' · חשבונית ' + E(v.invoice_number) : '') + ' · שולם עליו ' + money(paid, c) + '</div>' +
      '<div class="field"><label>מי ביטל</label><div class="radio-row"><label><input type="radio" name="by" value="supplier" checked> הספק (החליף שילדה / ביטל)</label><label><input type="radio" name="by" value="us"> ידידיה (יאיר ביקש רכב אחר)</label></div></div>' +
      '<div class="grid2"><div class="field"><label>סיבה</label><select name="reason_k"></select></div><div class="field"><label>פירוט</label><input name="reason_t" placeholder="לא חובה"></div></div>' +
      '<div class="grid2"><div class="field"><label>דמי ביטול שהספק מנכה (' + E(c) + ')</label><input name="fee" dir="ltr" inputmode="decimal" value="0"' + (paid ? '' : ' disabled') + '></div>' +
      '<div class="field"><label>זיכוי מהספק על החשבונית</label><select name="credit_note"><option value="missing">עוד לא התקבל — להתריע</option><option value="received">התקבל</option><option value="not_needed">לא נדרש</option></select></div></div>' +
      '<div class="field"><label>הרכב שמחליף אותו (אם הספק שלח שילדה אחרת)</label><select name="replaced_by">' + vOpts + '</select></div>' +
      (paid ? '<div class="field"><label>מה לעשות עם הכסף ששולם עליו</label><div class="radio-row"><label><input type="radio" name="money" value="keep" checked> להשאיר כיתרה לא משויכת אצל הספק</label><label><input type="radio" name="money" value="move"> לשייך עכשיו לרכב אחר</label></div></div>' +
        '<div class="grid2" id="mv-wrap" hidden><div class="field"><label>לאיזה רכב</label><select name="move_to">' + vOpts.replace('— אין / עוד לא נפתח —', '— רכב —') + '</select></div><div class="field"><label>סכום</label><input name="move_amt" dir="ltr" inputmode="decimal" value="' + paid + '"></div></div>' : '') +
      '<div class="effect" id="cx-effect"></div>' +
      '<div class="modal-err" id="m-err"></div><div class="modal-actions"><button class="btn-primary" type="submit">ביטול הרכב</button><button class="btn-ghost" type="button" data-close-modal>חזרה</button></div></form>');
    var form = document.getElementById('cx-form');
    var REASONS = {
      supplier: ['הספק החליף שילדה', 'הספק ביטל את המכירה', 'הרכב לא זמין אצל הספק', 'אחר'],
      us: ['מצב הרכב', 'מחיר', 'צבע / תוספות', 'הלקוח ביטל', 'אחר']
    };
    function fillReasons() {
      var by = form.querySelector('input[name=by]:checked').value;
      form.reason_k.innerHTML = REASONS[by].map(function (r) { return '<option>' + E(r) + '</option>'; }).join('');
      form.credit_note.value = by === 'supplier' ? 'missing' : 'not_needed';
      effect();
    }
    function effect() {
      var fee = num(form.fee.value) || 0;
      var mv = form.money && form.money.value === 'move' ? (num(form.move_amt.value) || 0) : 0;
      var left = paid - fee - mv;
      var t = 'הרכב יעבור לרשימת המבוטלים, ייצא מהמלאי ומהאתר, ולא יימחק.';
      if (paid) {
        t += '<br>' + money(paid, c) + ' ששולמו עליו משתחררים: ' +
          (fee ? money(fee) + ' דמי ביטול · ' : '') + (mv ? money(mv) + ' לרכב אחר · ' : '') +
          (left > 0.004 ? money(left) + ' ליתרה לא משויכת אצל הספק (נשאר קישור לשילדה ' + vin6(v.vin) + ').' : '');
        if (left < -0.004) t += '<br><b>הסכומים גדולים ממה ששולם על הרכב.</b>';
      } else t += '<br>לא שולם על הרכב — אין יתרה לשחרר.';
      document.getElementById('cx-effect').innerHTML = t;
    }
    form.querySelectorAll('input[name=by]').forEach(function (r) { r.addEventListener('change', fillReasons); });
    form.fee.addEventListener('input', effect);
    form.replaced_by.addEventListener('change', function () { if (form.move_to && this.value) form.move_to.value = this.value; });
    if (form.money) {
      form.querySelectorAll('input[name=money]').forEach(function (r) { r.addEventListener('change', function () {
        document.getElementById('mv-wrap').hidden = form.money.value !== 'move';
        if (form.money.value === 'move' && !form.move_to.value && form.replaced_by.value) form.move_to.value = form.replaced_by.value;
        effect();
      }); });
      form.move_amt.addEventListener('input', effect);
    }
    fillReasons();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var by = form.querySelector('input[name=by]:checked').value;
      var reason = form.reason_k.value + (form.reason_t.value.trim() ? ' — ' + form.reason_t.value.trim() : '');
      var p = { vehicle_id: vid, by: by, reason: reason, fee: num(form.fee.value) || 0, credit_note: form.credit_note.value, replaced_by_vehicle_id: form.replaced_by.value || null, reassign: [] };
      if (form.money && form.money.value === 'move') {
        if (!form.move_to.value) { modalErr('לבחור לאיזה רכב לשייך את הכסף.'); return; }
        p.reassign.push({ vehicle_id: form.move_to.value, amount: num(form.move_amt.value) });
      }
      if (!confirm('לבטל את הרכב ' + vin6(v.vin) + '? הוא יעבור לרשימת המבוטלים.')) return;
      var rr = await call('vehicle_cancel', p);
      if (rr.ok) { closeModal(); notice(rr.message_he); tab = 'cancelled'; reloadCard(); } else modalErr(rr.message_he || 'הביטול נכשל.');
    });
  }

  /* ---------- מחיר / חשבונית ---------- */
  function editPrice(vid) {
    var v = (card.vehicles || []).find(function (x) { return x.id === vid; });
    openModal('<h2 id="modal-title">מחיר רכישה וחשבונית</h2><form class="form" id="pr-form" novalidate><div class="sub">' + E(v.title || '') + ' · <span class="mono">' + E(v.vin || '') + '</span></div>' +
      '<div class="grid2"><div class="field"><label>מחיר רכישה (' + E(v.purchase_currency || cur()) + ')</label><input name="price" dir="ltr" inputmode="decimal" value="' + E(v.purchase_price != null ? v.purchase_price : '') + '"></div>' +
      '<div class="field"><label>מספר חשבונית ספק</label><input name="inv" dir="ltr" value="' + E(v.invoice_number || '') + '"></div></div>' +
      '<div class="hint">המחיר מאפשר לדעת אם הרכב שולם במלואו ולמנוע תשלום כפול.</div>' +
      '<div class="modal-err" id="m-err"></div><div class="modal-actions"><button class="btn-primary" type="submit">שמירה</button><button class="btn-ghost" type="button" data-close-modal>ביטול</button></div></form>', true);
    var form = document.getElementById('pr-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var rr = await call('vehicle_update', { vehicle_id: vid, purchase_price: num(form.price.value), invoice_number: form.inv.value.trim() });
      if (rr.ok) { closeModal(); notice('נשמר.'); reloadCard(); } else modalErr(rr.message_he);
    });
  }

  /* ---------- פרטי ספק ---------- */
  function editSupplier(isNew) {
    var s = isNew ? { bank_details: {} } : card.supplier; var b = s.bank_details || {};
    openModal('<h2 id="modal-title">' + (isNew ? 'ספק חדש' : 'פרטי ספק') + '</h2><form class="form" id="sp-form" novalidate>' +
      '<div class="field"><label>שם הספק</label><input name="name" dir="ltr" value="' + E(s.name || '') + '"></div>' +
      '<div class="grid2"><div class="field"><label>מדינה</label><input name="country" dir="ltr" value="' + E(s.country || '') + '"></div>' +
      '<div class="field"><label>מטבע הספק</label><select name="currency"><option value="">—</option>' + CURRENCIES.map(function (c) { return '<option' + (s.currency === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="form-sec">פרטי בנק — לזיהוי אוטומטי של הספק מאישור העברה</div>' +
      '<div class="field"><label>שם המוטב כפי שמופיע בהעברה</label><input name="beneficiary_name" dir="ltr" value="' + E(b.beneficiary_name || '') + '"></div>' +
      '<div class="grid2"><div class="field"><label>IBAN</label><input name="iban" dir="ltr" value="' + E(b.iban || '') + '"></div><div class="field"><label>מספר חשבון</label><input name="account_number" dir="ltr" value="' + E(b.account_number || '') + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>SWIFT</label><input name="swift" dir="ltr" value="' + E(b.swift || '') + '"></div><div class="field"><label>בנק</label><input name="bank_name" dir="ltr" value="' + E(b.bank_name || '') + '"></div></div>' +
      '<div class="field"><label>הערות</label><input name="notes" value="' + E(s.notes || '') + '"></div>' +
      '<div class="modal-err" id="m-err"></div><div class="modal-actions"><button class="btn-primary" type="submit">שמירה</button><button class="btn-ghost" type="button" data-close-modal>ביטול</button></div></form>');
    var form = document.getElementById('sp-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var bank = {}; ['beneficiary_name', 'iban', 'account_number', 'swift', 'bank_name'].forEach(function (k) { var v = form[k].value.trim(); if (v) bank[k] = v; });
      var rr = await call('supplier_save', { id: isNew ? null : s.id, name: form.name.value.trim(), country: form.country.value.trim(), currency: form.currency.value, bank_details: bank, notes: form.notes.value.trim() });
      if (!rr.ok) { modalErr(rr.message_he); return; }
      closeModal(); notice(rr.message_he);
      await reloadList();
      openSupplier(rr.supplier_id);
    });
  }

  /* ---------- אירועים ---------- */
  document.getElementById('upload-transfer').addEventListener('click', startUpload);
  document.getElementById('new-transfer').addEventListener('click', function () { reviewTransfer(null, true); });

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-open],[data-back],[data-tab],[data-vf],[data-alloc-v],[data-alloc-t],[data-cancel],[data-price],[data-release],[data-review],[data-void],[data-sugg],[data-upload],[data-manual],[data-edit-supplier],[data-close-modal],[data-close-search],[data-report],#new-supplier');
    if (!el) return;
    var d = el.dataset;
    if (el.id === 'new-supplier') return editSupplier(true);
    if ('open' in d) { document.getElementById('search-results').innerHTML = ''; return openSupplier(d.open); }
    if ('back' in d) { await reloadList(); return renderList(); }
    if ('tab' in d) { tab = d.tab; document.querySelectorAll('.tabs .tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === tab); }); return renderTab(); }
    if ('vf' in d) { vFilter = d.vf; return renderTab(); }
    if ('allocV' in d) return allocateFromVehicle(d.allocV);
    if ('allocT' in d) return allocateFromTransfer(d.allocT);
    if ('cancel' in d) return cancelVehicle(d.cancel);
    if ('price' in d) return editPrice(d.price);
    if ('review' in d) return reviewTransfer(d.review);
    if ('upload' in d) { closeModal(); return startUpload(); }
    if ('manual' in d) return reviewTransfer(null, true);
    if ('editSupplier' in d) return editSupplier(false);
    if ('closeModal' in d) return closeModal();
    if ('closeSearch' in d) { document.getElementById('search-results').innerHTML = ''; document.getElementById('search').value = ''; return; }
    if ('report' in d) return printReport(lastSearch.vehicles[Number(d.report)]);
    if ('sugg' in d) {
      var g = card.suggestions[Number(d.sugg)];
      var rr = await call('allocate', { transfer_id: g.transfer_id, vehicle_id: g.vehicle_id, amount: g.amount, source: 'suggested' });
      if (rr.ok) { notice(rr.message_he); reloadCard(); }
      else if (rr.error === 'OVERPAY') { allocateFromTransfer(g.transfer_id, g.vehicle_id, g.amount); modalErr(rr.message_he); }
      else notice(rr.message_he, 'err');
      return;
    }
    if ('release' in d) {
      var why = prompt('למה מבטלים את השיוך? (הסכום יחזור ליתרה הלא משויכת של הספק)');
      if (!why) return;
      var r2 = await call('release', { allocation_id: d.release, reason: why });
      if (r2.ok) { closeModal(); notice(r2.message_he); reloadCard(); } else notice(r2.message_he, 'err');
      return;
    }
    if ('void' in d) {
      var why2 = prompt('ביטול העברה (למשל: נרשמה פעמיים / ההעברה חזרה). כל השיוכים שלה יבוטלו. סיבה:');
      if (!why2) return;
      var r3 = await call('transfer_void', { transfer_id: d.void, reason: why2 });
      if (r3.ok) { notice(r3.message_he); reloadCard(); } else notice(r3.message_he, 'err');
    }
  });

  document.addEventListener('change', async function (e) {
    var el = e.target.closest('[data-credit]');
    if (!el) return;
    var rr = await call('vehicle_update', { vehicle_id: el.dataset.credit, credit_note: el.value });
    if (rr.ok) { notice('עודכן.'); reloadCard(); } else notice(rr.message_he, 'err');
  });
})();
