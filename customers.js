/* ============================================================
   ידידיה מוטורס — לקוחות ועסקאות
   כל הלוגיקה (כפילויות, כלל 2.1 לשיוך רכב, הרשאות) בשרת.
   המסך מציג את מה שהגיע ומעביר פעולות ל-n8n → Supabase.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var session = YM.getSession();
  var LOGIN_URL = 'login.html' + (location.search ? '?next=' + encodeURIComponent('customers.html' + location.search) : '');
  if (!session) { location.replace(LOGIN_URL); return; }
  var perms = session.permissions || [];
  var can = function (k) { return perms.indexOf(k) > -1; };

  var state = { rows: [], total: 0, q: '', type: '', archive: '', counts: {}, loading: false, card: null, cardId: null };
  var LEAD_LINK = (function () { try { return new URLSearchParams(location.search).get('lead'); } catch (e) { return null; } })();
  var TYPES = [{ key: '', label: 'הכל' }, { key: 'individual', label: 'פרטיים' }, { key: 'company', label: 'חברות' }];
  var DEAL_DOCS = [
    ['memorandum_of_understanding', 'זיכרון דברים'], ['purchase_agreement', 'הסכם רכישה'],
    ['financing_agreement', 'הסכם מימון'], ['trade_in_agreement', 'הסכם טרייד-אין'],
    ['signed_order_form', 'טופס הזמנה חתום'], ['other', 'אחר']
  ];
  var CUST_DOCS = [['id_card', 'תעודת זהות'], ['drivers_license', 'רישיון נהיגה'], ['company_registration', 'תעודת התאגדות'],
                   ['power_of_attorney', 'ייפוי כוח'], ['other', 'אחר']];
  var LEAD_STATUSES = [['new', 'חדש'], ['contacted', 'נוצר קשר'], ['converted', 'הפך ללקוח'], ['closed', 'נסגר'], ['spam', 'ספאם']];
  var leads = { rows: [], counts: {}, filter: '', loaded: false };
  var DEAL_STATUSES = [['open', 'פתוחה'], ['pending_signatures', 'ממתינה לחתימות'], ['completed', 'הושלמה'], ['cancelled', 'בוטלה']];

  load(true);

  /* ---------- רשימה ---------- */
  async function load(first) {
    if (state.loading) return;
    state.loading = true;
    var res;
    try {
      res = await YM.api('/customers/list', { token: session.token, q: state.q, type: state.type || null, archive: state.archive || null, limit: 100 });
    } catch (err) {
      state.loading = false;
      if (first) bootError(err.message); else notice(err.message, 'err');
      return;
    }
    state.loading = false;
    if (res.ok !== true) {
      if (res.__status === 401 || ['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE','SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession(); location.replace(LOGIN_URL); return;
      }
      if (first) bootError(res.message_he || 'טעינת הלקוחות נכשלה.'); else notice(res.message_he, 'err');
      return;
    }
    state.rows = res.customers || [];
    state.total = res.total || 0;
    state.counts = res.counts || {};
    state.archiveMode = res.archive || 'active';
    render();
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
    if (first && LEAD_LINK) openLeadLink();
  }

  /* קישור ישיר לליד (מהמייל): customers.html?lead=<id> */
  function openLeadLink() {
    var tab = document.querySelector('.tab[data-tab="leads"]');
    if (tab) tab.click();
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
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 4500);
  }

  function render() {
    YM.renderNav('nav', 'customers.html', perms);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);
    document.getElementById('meta-line').textContent = state.total + ' לקוחות' + (state.archiveMode === 'archived' ? ' בארכיון' : '') +
      (state.q ? ' · חיפוש: ' + state.q + (state.archiveMode === 'all' ? ' (כולל ארכיון)' : '') : '');

    var open = state.rows.reduce(function (s, c) { return s + (Number(c.deals_open) || 0); }, 0);
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box"><div class="label">לקוחות</div><div class="stat-figure">' + state.total + '</div>' +
      '<div class="stat-note">' + open + ' עסקאות פתוחות</div></div>';

    var tf = document.getElementById('type-filters');
    tf.innerHTML = TYPES.map(function (t) {
      return '<button class="chip' + (state.type === t.key ? ' is-active' : '') + '" type="button" data-type="' + t.key + '">' + t.label + '</button>';
    }).join('');
    var am = state.archiveMode || 'active', cn = state.counts || {};
    tf.innerHTML += '<span class="chip-sep" aria-hidden="true"></span>' + [
      ['active', 'פעילים', cn.active], ['archived', 'ארכיון', cn.archived], ['all', 'הכל', null]
    ].map(function (o) {
      return '<button class="chip' + (am === o[0] ? ' is-active' : '') + '" type="button" data-arch="' + o[0] + '">' + o[1] +
        (o[2] != null ? ' · ' + o[2] : '') + '</button>';
    }).join('');
    tf.querySelectorAll('.chip[data-type]').forEach(function (c) {
      c.addEventListener('click', function () { state.type = c.getAttribute('data-type'); load(false); });
    });
    tf.querySelectorAll('.chip[data-arch]').forEach(function (c) {
      c.addEventListener('click', function () { state.archive = c.getAttribute('data-arch'); load(false); });
    });
    renderRows();
    if (!leads.loaded) loadLeads();
  }

  /* ---------- לידים מהאתר ---------- */
  async function loadLeads() {
    var r, seq = (leads.seq = (leads.seq || 0) + 1);
    try { r = await YM.api('/leads/list', { token: session.token, status: leads.filter || null, limit: 200 }); }
    catch (err) { document.getElementById('lead-rows').innerHTML = '<div class="empty">' + E(err.message) + '</div>'; return; }
    if (seq !== leads.seq) return; // תשובה ישנה — כבר נשלחה בקשה חדשה יותר
    if (r.ok !== true) { document.getElementById('lead-rows').innerHTML = '<div class="empty">' + E(r.message_he || 'טעינת הלידים נכשלה.') + '</div>'; return; }
    leads.rows = r.leads || []; leads.counts = r.counts || {}; leads.loaded = true;
    var open = (Number(leads.counts.new) || 0) + (Number(leads.counts.contacted) || 0);
    var badge = document.getElementById('leads-count');
    badge.textContent = open; badge.hidden = !open;
    renderLeadFilters();
    renderLeads();
    if (LEAD_LINK) {
      var hit = document.querySelector('.lead-row[data-id="' + LEAD_LINK.replace(/[^0-9a-f-]/gi, '') + '"]');
      if (!hit && leads.filter !== 'all') { leads.filter = 'all'; loadLeads(); return; }
      if (hit) {
        hit.classList.add('is-linked');
        setTimeout(function () { hit.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
      } else notice('הליד מהקישור לא נמצא.', 'err');
      LEAD_LINK = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
  }

  function renderLeadFilters() {
    var host = document.getElementById('lead-filters');
    var opts = [['', 'פתוחים'], ['new', 'חדשים'], ['contacted', 'נוצר קשר'], ['converted', 'הפכו ללקוח'], ['closed', 'נסגרו'], ['spam', 'ספאם'], ['all', 'הכל']];
    host.innerHTML = opts.map(function (o) {
      var n = o[0] === '' ? (Number(leads.counts.new) || 0) + (Number(leads.counts.contacted) || 0) : o[0] === 'all' ? null : (leads.counts[o[0]] || 0);
      return '<button class="chip' + (leads.filter === o[0] ? ' is-active' : '') + '" type="button" data-f="' + o[0] + '">' + o[1] + (n !== null ? ' · ' + n : '') + '</button>';
    }).join('');
    host.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () { leads.filter = c.getAttribute('data-f'); loadLeads(); });
    });
  }

  var LEAD_SOURCES = { website_form: ['אתר', 'web'], facebook_lead_ad: ['פייסבוק', 'fb'] };
  function leadSourceBadge(l) {
    var src = LEAD_SOURCES[l.source] || [l.source || 'אתר', 'web'];
    return '<span class="lead-src ' + src[1] + '">' + E(src[0]) + '</span>';
  }

  function renderLeads() {
    var host = document.getElementById('lead-rows');
    if (!leads.rows.length) {
      host.innerHTML = '<div class="empty">אין לידים בסינון הזה.</div>';
      document.getElementById('lead-foot').innerHTML = '';
      return;
    }
    host.innerHTML = leads.rows.map(function (l) {
      var interest = [l.brand, l.interest].filter(Boolean).join(' · ');
      var done = l.status === 'converted' || l.status === 'spam' || l.status === 'closed';
      return '<div class="lead-row" data-id="' + E(l.id) + '">' +
        '<div><div class="l-name">' + E(l.full_name || '—') + '</div>' +
          (l.message ? '<div class="l-msg">' + E(String(l.message).slice(0, 160)) + '</div>' : '') +
          (l.customer_name ? '<div class="l-sub">לקוח: ' + E(l.customer_name) + '</div>' : (Number(l.matching_customers) ? '<div class="l-sub">יש כבר לקוח עם הטלפון הזה</div>' : '')) +
          (l.notes ? '<div class="l-sub">הערה: ' + E(l.notes) + '</div>' : '') + '</div>' +
        '<div class="ltr l-phone">' + E(l.phone ? YM.phoneHe(l.phone) : '—') + (l.email ? '<div class="l-sub">' + E(l.email) + '</div>' : '') + '</div>' +
        '<div class="l-int">' + leadSourceBadge(l) + '<div>' + E(interest || '—') + '</div>' +
          (l.form_name ? '<div class="l-sub">טופס: ' + E(l.form_name) + '</div>' : '') +
          (l.campaign_name ? '<div class="l-sub">קמפיין: ' + E(l.campaign_name) + '</div>' : '') + '</div>' +
        '<div class="l-when">' + E(fmtDT(l.created_at)) + (l.handled_by_name ? '<div class="l-sub">טופל: ' + E(l.handled_by_name) + '</div>' : '') + '</div>' +
        '<div><span class="lead-status ' + E(l.status) + '">' + E(l.status_he) + '</span></div>' +
        '<div class="l-act">' +
          (done ? (l.customer_id ? '<button class="btn-icon lead-open" type="button" data-cid="' + E(l.customer_id) + '">פתח לקוח</button>' : '') :
            '<button class="btn-icon lead-convert" type="button">הפוך ללקוח</button>') +
          '<select class="small lead-status-sel" aria-label="סטטוס ליד">' + LEAD_STATUSES.map(function (x) {
            return '<option value="' + x[0] + '"' + (x[0] === l.status ? ' selected' : '') + '>' + x[1] + '</option>';
          }).join('') + '</select>' +
          '<button class="btn-icon lead-note" type="button" title="הערה">✎</button>' +
        '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('.lead-row').forEach(function (row) {
      var id = row.getAttribute('data-id');
      var lead = leads.rows.filter(function (x) { return x.id === id; })[0];
      var conv = row.querySelector('.lead-convert');
      if (conv) conv.addEventListener('click', function () {
        openCustomerForm(null);
        cForm.lead_id.value = id;
        cForm.full_name.value = lead.full_name || '';
        cForm.phone.value = YM.phoneHe(lead.phone) || lead.phone || '';
      });
      var op = row.querySelector('.lead-open');
      if (op) op.addEventListener('click', function () { openCard(op.getAttribute('data-cid')); });
      var sel = row.querySelector('.lead-status-sel');
      if (sel) sel.addEventListener('change', function () { updateLead({ lead_id: id, status: sel.value }); });
      var nb = row.querySelector('.lead-note');
      if (nb) nb.addEventListener('click', function () {
        var txt = prompt('הערה לליד:', lead.notes || '');
        if (txt === null) return;
        updateLead({ lead_id: id, notes: txt });
      });
    });
    document.getElementById('lead-foot').innerHTML = 'מוצגים ' + leads.rows.length + ' לידים';
  }

  async function updateLead(payload) {
    payload.token = session.token;
    var r;
    try { r = await YM.api('/leads/update', payload); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
    loadLeads();
  }

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('is-active', x === t); });
      var which = t.getAttribute('data-tab');
      document.getElementById('panel-customers').hidden = which !== 'customers';
      document.getElementById('panel-leads').hidden = which !== 'leads';
      document.getElementById('new-customer').hidden = which !== 'customers';
      if (which === 'leads') loadLeads();
    });
  });

  function renderRows() {
    var host = document.getElementById('rows');
    if (!state.rows.length) {
      host.innerHTML = '<div class="empty">' + (state.q || state.type ? 'לא נמצאו לקוחות התואמים לחיפוש.' : state.archiveMode === 'archived' ? 'אין לקוחות בארכיון.' : 'עדיין אין לקוחות. פתחו את הראשון בכפתור "לקוח חדש".') + '</div>';
      document.getElementById('foot').innerHTML = '';
      return;
    }
    host.innerHTML = state.rows.map(function (c) {
      var last = c.last_deal;
      var lastTxt = last ? (last.vehicle ? E(last.vehicle) + ' · ' : '') + '<span class="deal-status ' + E(last.status) + '">' + E(last.status_he) + '</span>' : '<span class="c-sub">—</span>';
      var idTxt = c.customer_type === 'company' ? (c.company_reg_number ? 'ח.פ ' + c.company_reg_number : '—') : (c.id_number || '—');
      return '<div class="cust-row' + (c.archived ? ' is-archived' : '') + '" data-id="' + E(c.id) + '">' +
        '<div><div class="c-name">' + E(c.name) + (c.customer_type === 'company' ? '<span class="badge company">חברה</span>' : '') +
          (c.needs_contact_details ? '<span class="badge missing">חסרים פרטי קשר</span>' : '') +
          (c.archived ? '<span class="badge archived">בארכיון</span>' : '') + '</div>' +
          (c.match_hint ? '<div class="c-hit">נמצא לפי: ' + E(c.match_hint) + '</div>' : '') +
          (c.contact_person ? '<div class="c-sub">איש קשר: ' + E(c.contact_person) + '</div>' : '') +
          '<div class="c-meta">' + E(YM.phoneHe(c.phone)) + ' · ' + E(idTxt) + '</div></div>' +
        '<div class="ltr c-phone">' + E(YM.phoneHe(c.phone)) + '</div>' +
        '<div class="ltr c-id">' + E(idTxt) + '</div>' +
        '<div>' + (Number(c.deals_open) ? '<b>' + c.deals_open + '</b> פתוחות · ' : '') + c.deals_total + '</div>' +
        '<div class="c-last">' + lastTxt + '</div>' +
        '<div class="c-docs">' + (c.documents || 0) + '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('.cust-row').forEach(function (r) {
      r.addEventListener('click', function () { openCard(r.getAttribute('data-id')); });
    });
    document.getElementById('foot').innerHTML = 'מוצגים ' + state.rows.length + ' מתוך ' + state.total;
  }

  /* ---------- כרטיס לקוח ---------- */
  async function openCard(id) {
    state.cardId = id;
    document.getElementById('card-body').innerHTML = '<div class="empty">טוען…</div>';
    show('card-modal');
    var res, ord;
    try {
      var both = await Promise.all([
        YM.api('/customers/card', { token: session.token, id: id }),
        YM.api('/orders/action', { token: session.token, action: 'customer', customer_id: id }).catch(function () { return null; })
      ]);
      res = both[0]; ord = both[1];
    }
    catch (err) { document.getElementById('card-body').innerHTML = '<div class="empty">' + E(err.message) + '</div>'; return; }
    if (res.ok !== true) { document.getElementById('card-body').innerHTML = '<div class="empty">' + E(res.message_he || 'לא ניתן להציג את הלקוח.') + '</div>'; return; }
    state.card = res;
    state.orders = ord && ord.ok === true ? ord : null;
    document.getElementById('card-body').innerHTML = cardHtml(res);
    bindCard(res);
    loadPortal(id);
  }

  function cardHtml(res) {
    var c = res.customer, deals = res.deals || [], docs = res.documents || [], wait = res.waitlist || [], act = res.activity;
    var h = '<div class="card-head-c"><h2>' + E(c.name) + '</h2>' +
      '<div class="sub">' + (c.customer_type === 'company' ? 'חברה / חברת מימון' + (c.contact_person ? ' · איש קשר: ' + E(c.contact_person) : '') : 'לקוח פרטי') +
      ' · נפתח ' + fmtDate(c.created_at) + (c.created_by_name ? ' ע"י ' + E(c.created_by_name) : '') + '</div>' +
      '<div class="tags"><span class="tag">' + E(YM.phoneHe(c.phone)) + '</span>' +
      (c.id_number ? '<span class="tag">ת.ז. ' + E(c.id_number) + '</span>' : '') +
      (c.company_reg_number ? '<span class="tag">' + (c.company_reg_type === 'am' ? 'ע.מ ' : 'ח.פ ') + E(c.company_reg_number) + '</span>' : '') +
      (c.address ? '<span class="tag">' + E(c.address) + '</span>' : '') +
      (c.invoice_email ? '<span class="tag ltr">' + E(c.invoice_email) + '</span>' : '') + '</div>' +
      (!idValid(c.customer_type === 'company' ? c.company_reg_number : c.id_number)
        ? '<div class="gap-note">חסר מספר ' + (c.customer_type === 'company' ? 'ח.פ / ע.מ' : 'תעודת זהות') + ' — בלעדיו אי אפשר לפתוח הזמנה, והלקוח לא יוכל להיכנס לאיזור האישי. <button class="linkish" type="button" id="card-fix-id">להשלים</button></div>' : '') +
      (c.invoice_gaps && c.invoice_gaps.length ? '<div class="gap-note">חסר לחשבונית: ' + E(c.invoice_gaps.join(', ')) + ' — <button class="linkish" type="button" id="card-fix-invoice">להשלים</button></div>' : '') + '</div>';

    var lc = c.lifecycle || {};
    if (lc.archived) {
      h += '<div class="archive-banner">הלקוח בארכיון' + (lc.archived_at ? ' מאז ' + fmtDate(lc.archived_at) : '') +
        (lc.archived_by ? ' · ע"י ' + E(lc.archived_by) : '') + (lc.archive_reason ? ' · ' + E(lc.archive_reason) : '') +
        '<span class="s">פתיחת הזמנה חדשה מחזירה אותו אוטומטית לפעילים.</span></div>';
    }
    h += '<div class="card-tools">' +
      '<button class="btn-primary small" type="button" id="card-new-deal">הזמנה חדשה</button>' +
      '<button class="btn-ghost small" type="button" id="card-edit">עריכת פרטים</button>' +
      (lc.archived ? '<button class="btn-ghost small" type="button" id="card-unarchive">שחזור מהארכיון</button>'
                   : '<button class="btn-ghost small" type="button" id="card-archive"' + (lc.can_archive ? '' : ' data-blocked="1" title="' + E(lc.archive_message_he || '') + '"') + '>העברה לארכיון</button>') +
      (lc.can_delete && lc.can_delete_perm ? '<button class="btn-ghost small danger" type="button" id="card-delete">מחיקת לקוח</button>' : '') +
      '</div>';

    h += '<div id="idchk-sect">' + idChecksHtml(res.id_checks || []) + '</div>';

    var orders = state.orders && state.orders.orders;
    if (orders) {
      // כל הזמנה מקבצת את הרכבים (העסקאות) שלה, עם עגלת התוספות והסיכום
      var byId = {}; deals.forEach(function (d) { byId[d.id] = d; });
      orders = orders.slice().sort(function (a, b) { return (a.archived ? 1 : 0) - (b.archived ? 1 : 0); });
      var archN = orders.filter(function (o) { return o.archived; }).length;
      h += '<div class="sect"><h3>הזמנות (' + (orders.length - archN) + (archN ? ' · ' + archN + ' בארכיון' : '') + ')</h3>';
      if (!orders.length) h += '<div class="empty small">אין הזמנות עדיין. "הזמנה חדשה" פותחת עגלה עם הרכב הראשון.</div>';
      orders.forEach(function (o) { h += orderHtml(o, byId, res.viewer); });
      h += '</div>';
    } else {
      h += '<div class="sect"><h3>עסקאות (' + deals.length + ')</h3>';
      if (!deals.length) h += '<div class="empty small">אין עסקאות עדיין.</div>';
      deals.forEach(function (d) { h += dealHtml(d, res.viewer); });
      h += '</div>';
    }

    // ההרשאה נבדקת בשרת; סשן שנפתח לפני הוספת ההרשאה עדיין לא מכיר אותה ברשימה המקומית
    if (can('manage_customer_portal') || can('create_customer_deal')) {
      h += '<div class="sect" id="portal-sect"><h3>האיזור האישי של הלקוח</h3><div class="empty small">טוען…</div></div>';
    }

    h += '<div class="sect"><h3>מסמכי לקוח קבועים</h3>' +
      (docs.length ? '<div class="docs">' + docs.map(function (x) {
        return '<span class="doc' + (x.expired ? ' expired' : '') + '">' + (x.drive_url ? '<a href="' + E(x.drive_url) + '" target="_blank" rel="noopener">' + E(x.doc_type_he) + '</a>' : E(x.doc_type_he)) +
          (x.expires_at ? (x.expired ? ' · פג תוקף ' : ' · בתוקף עד ') + E(x.expires_at) : '') + '</span>';
      }).join('') + '</div>' : '<div class="empty small">אין מסמכים קבועים עדיין.</div>') +
      (can('manage_customer_documents')
        ? '<div class="actions" style="margin-top:8px"><select class="small" id="cdoc-type">' + CUST_DOCS.map(function (x) {
            return '<option value="' + x[0] + '">' + x[1] + '</option>';
          }).join('') + '</select><button class="btn-icon" type="button" id="cdoc-up">צירוף קובץ ללקוח</button></div>'
        : '') + '</div>';

    if (wait.length) {
      h += '<div class="sect"><h3>רשימת המתנה</h3><div class="docs">' + wait.map(function (w) {
        return '<span class="doc">' + E([w.make, w.model, w.trim, w.color].filter(Boolean).join(' ')) + ' · ' + E(w.status) + '</span>';
      }).join('') + '</div></div>';
    }

    if (Array.isArray(act)) {
      h += '<div class="sect"><h3>היסטוריית שינויים</h3>' +
        (act.length ? '<div class="timeline">' + act.slice(0, 40).map(function (l) {
          var what = (l.action === 'create' ? 'יצירה' : l.action === 'status_change' ? 'שינוי סטטוס' : l.action === 'delete' ? 'מחיקה' : 'עדכון') +
            ' · ' + entityHe(l.entity_type) + (l.field_name ? ' · ' + E(l.field_name) : '');
          var det = l.field_name ? ' <span class="mono">' + E(l.old_value == null ? '—' : l.old_value) + '</span> ← <span class="mono">' + E(l.new_value == null ? '—' : l.new_value) + '</span>' : '';
          return '<div class="tl"><div class="t">' + fmtDT(l.performed_at) + '</div><div>' + what + det + (l.performed_by_name ? ' · ' + E(l.performed_by_name) : '') + '</div></div>';
        }).join('') + '</div>' : '<div class="empty small">אין שינויים עדיין.</div>') + '</div>';
    }
    return h;
  }

  function entityHe(t) {
    return { deal: 'עסקה', vehicle_file: 'תיק רכב', deal_document: 'מסמך עסקה', trade_in_vehicle: 'טרייד-אין',
             trade_in_document: 'מסמך טרייד-אין', vehicle_requirement: 'דרישת רישוי', trade_in_requirement: 'דרישת טרייד-אין' }[t] || t || '';
  }

  function dealHtml(d, viewer) {
    var v = d.vehicle;
    var vehTxt = v ? E(v.title || (v.make + ' ' + v.model)) + '<small>' + E([v.model_year, v.color, v.status_he, v.vin ? 'VIN ' + v.vin : null].filter(Boolean).join(' · ')) +
      (v.sale_price != null ? ' · מחיר ' + YM.nis(v.sale_price) : '') + '</small>' : 'ללא רכב משויך<small>אפשר לשייך רכב בעריכת העסקה</small>';
    var closed = d.deal_status === 'completed' || d.deal_status === 'cancelled';
    var mine = viewer && (viewer.role !== 'sales' || viewer.id === d.created_by_staff_id);
    var h = '<div class="deal" data-id="' + E(d.id) + '">' +
      '<div class="head"><div class="veh">' + vehTxt + '</div><span class="deal-status ' + E(d.deal_status) + '">' + E(d.status_he) + '</span></div>' +
      '<div class="line">נפתחה ' + fmtDate(d.created_at) + (d.created_by_name ? ' · ' + E(d.created_by_name) : '') +
        (d.financing_required ? ' · במימון' + (d.financing_on_private_name ? ' (על שם פרטי)' : '') : '') +
        (d.customer_docs && d.customer_docs.total ? ' · מסמכי לקוח ' + d.customer_docs.done + '/' + d.customer_docs.total : '') + '</div>';
    h += ownerHtml(d);
    h += regLineHtml(d, mine, closed);
    var docs = d.documents || [];
    h += '<div class="docs">' + docs.map(function (x) {
      var open = x.is_open_for_upload && !x.drive_url;
      return '<span class="doc' + (open ? ' open' : '') + '">' + (x.drive_url ? '<a href="' + E(x.drive_url) + '" target="_blank" rel="noopener">' + E(x.doc_type_he) + '</a>' : E(x.doc_type_he)) +
        (open ? ' · ממתין להעלאה' + (mine && !closed ? ' <button class="doc-up" type="button" data-doc="' + E(x.id) + '" data-type="' + E(x.doc_type) + '">העלאה</button>' : '') : '') + '</span>';
    }).join('') + '</div>';
    h += termsHtml(d, mine, closed);
    h += cartHtml(d);
    h += agreementHtml(d, mine);
    if (d.deal_status !== 'cancelled') {
      h += '<div class="checklist" data-deal="' + E(d.id) + '"><div class="cl-head"><span>מסמכי לקוח · רישוי ומסירה</span><button class="btn-icon cl-toggle" type="button">הצג checklist</button></div><div class="cl-body" hidden></div></div>';
    }
    if (mine) {
      h += '<div class="actions">';
      if (!closed) {
        h += '<select class="small deal-up-sel" aria-label="העלאת מסמך"><option value="">העלאת מסמך…</option>' + DEAL_DOCS.map(function (x) {
          return '<option value="' + x[0] + '">' + x[1] + '</option>';
        }).join('') + '</select>';
        h += '<select class="small deal-status-sel" aria-label="שינוי סטטוס">' + DEAL_STATUSES.map(function (s) {
          return '<option value="' + s[0] + '"' + (s[0] === d.deal_status ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select>';
        if (!v) h += '<button class="btn-icon deal-assign" type="button">שיוך רכב</button>';
        if (can('open_document_request')) {
          h += '<select class="small deal-doc-sel" aria-label="בקשת מסמך"><option value="">בקשת מסמך…</option>' + DEAL_DOCS.map(function (x) {
            return '<option value="' + x[0] + '">' + x[1] + '</option>';
          }).join('') + '</select>';
        }
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  /* על שם מי נרשם הרכב ברישיון — אנחנו מוציאים את הרישיון, אז זה חייב להיות מדויק */
  function regLineHtml(d, mine, closed) {
    var r = d.registration || {}, miss = r.missing || [];
    var who = r.type ? E(r.type_he) + ': <b>' + E(r.name || '—') + '</b>' + (r.id_number ? ' · ' + E(r.id_label) + ' ' + E(r.id_number) : '') +
      (r.address ? ' · ' + E(r.address) : '') : '<b>לא נקבע</b>';
    return '<div class="reg-line' + (miss.length ? ' warn' : '') + '"><span class="k">רישום ברישיון</span><span class="v">' + who +
      (miss.length ? '<span class="miss">חסר: ' + E(miss.join(', ')) + '</span>' : '') +
      (r.type && !r.explicit ? '<span class="miss">נקבע אוטומטית לעסקה ותיקה — לאשר</span>' : '') +
      (d.license_gate && !d.license_gate.ok && d.deal_status !== 'completed'
        ? '<span class="gate">הוצאת רישיון ומספר רישוי — רק אחרי: ' + E((d.license_gate.missing || []).join(' · ')) + '</span>'
        : (d.license_gate && d.license_gate.ok && d.deal_status !== 'completed' ? '<span class="gate ok">אפשר להוציא רישיון</span>' : '')) + '</span>' +
      (mine && !closed ? '<button class="btn-icon reg-edit" type="button">עריכה</button>' : '') + '</div>';
  }

  /* מי העסקה רשומה עליו. השיוך נקבע אוטומטית למי שפתח אותה;
     מנהל יכול להעביר אותה לאיש מכירות אחר, וההעברה נרשמת בלוג. */
  function ownerHtml(d) {
    var card = state.card || {};
    var name = d.sales_owner_name || 'לא משויכת';
    if (!card.can_assign_owner) {
      return '<div class="line owner-line">רשומה על <b>' + E(name) + '</b></div>';
    }
    var opts = (card.staff_options || []).map(function (s) {
      return '<option value="' + E(s.id) + '"' +
        (s.id === d.sales_owner_staff_id ? ' selected' : '') + '>' + E(s.name) + '</option>';
    }).join('');
    return '<div class="line owner-line"><span>רשומה על</span>' +
      '<select class="small deal-owner-sel" aria-label="איש המכירות שהעסקה רשומה עליו">' +
      (d.sales_owner_staff_id ? '' : '<option value="">— לא משויכת —</option>') +
      opts + '</select></div>';
  }

  /* ---------- הזמנה (עגלה): רכבים, תוספות, שליחה לאישור הלקוח ---------- */
  function cartLookup(dealId) {
    var os = (state.orders && state.orders.orders) || [];
    for (var i = 0; i < os.length; i++) {
      var ds = os[i].deals || [];
      for (var j = 0; j < ds.length; j++) if (ds[j].deal_id === dealId) return { order: os[i], deal: ds[j] };
    }
    return null;
  }

  function orderHtml(o, byId, viewer) {
    var st = o.state || {}, t = (o.snapshot && o.snapshot.totals) || {};
    var live = ['closed', 'cancelled'].indexOf(st.code) === -1;
    var ARCH_KIND = { delivered: 'נמסרה', cancelled: 'בוטלה', partial: 'נמסרה חלקית' };
    var h = '<div class="order' + (o.archived ? ' archived' : '') + '" data-order="' + E(o.id) + '">' +
      '<div class="order-head"><div><div class="order-no">' + E(o.order_number) + '</div>' +
        '<div class="order-sub">נפתחה ' + fmtDate(o.created_at) + (o.created_by ? ' · ' + E(o.created_by) : '') +
          (o.sent_at ? ' · נשלחה ' + fmtDT(o.sent_at) + (o.sent_by ? ' ע"י ' + E(o.sent_by) : '') : '') +
          (o.approved_at && st.code === 'approved' ? ' · אושרה ' + fmtDT(o.approved_at) : '') + '</div></div>' +
        (o.archived ? '<span class="order-state st-archived">בארכיון · ' + E(ARCH_KIND[o.archive_kind] || '') + '</span>'
                    : '<span class="order-state st-' + E(st.code) + '">' + E(st.he || '') + '</span>') + '</div>';
    if (o.archived) {
      h += '<div class="order-archived-line">הועברה לארכיון ' + fmtDate(o.archived_at) + (o.archived_by ? ' ע"י ' + E(o.archived_by) : '') +
        (o.archive_reason ? ' · ' + E(o.archive_reason) : '') +
        ' <button class="linkish order-toggle" type="button">הצגת פרטים</button></div>';
    }
    h += '<div class="order-body">';

    if (st.code === 'change_requested' && o.change_request_note) {
      h += '<div class="order-alert">הלקוח ביקש שינוי (' + fmtDT(o.change_requested_at) + '): ' + E(o.change_request_note) +
        '<span class="s">אחרי העדכון — לשלוח שוב לאישור.</span></div>';
    }
    if (st.code === 'changed') {
      h += '<div class="order-alert">ההזמנה השתנתה אחרי ' + (o.stored_status === 'approved' ? 'שהלקוח אישר אותה' : 'שנשלחה ללקוח') +
        '. האישור הקודם כבר לא תקף — יש לשלוח שוב.</div>';
    }

    var ids = (o.deals || []).map(function (x) { return x.deal_id; });
    ids.forEach(function (id) { if (byId[id]) h += dealHtml(byId[id], viewer); });

    h += '<div class="order-sum">' +
      sumCell('רכבים', t.vehicles) + sumCell('אביזרים ושירותים', t.extras) + sumCell('סה״כ כולל מע״מ', t.grand, true) +
      (t.trade_in ? sumCell('זיכוי טרייד-אין', -t.trade_in) : '') +
      (t.down_payment ? sumCell('מקדמה', -t.down_payment) : '') +
      (t.financing ? sumCell('מימון', -t.financing) : '') +
      sumCell('יתרה לתשלום', t.balance, true) + '</div>';
    if (t.count && !t.priced) h += '<div class="terms-note">לחלק מהרכבים עוד אין מחיר מכירה — הסכום חלקי.</div>';
    if (o.pending_lines) h += '<div class="terms-note warn">' + o.pending_lines + ' שורות ממתינות לאישור מנהל — עד אז לא ניתן לשלוח את ההזמנה.</div>';

    var ac = o.archive_check || {};
    if (live && !o.archived) {
      h += '<div class="order-acts">';
      if (can('create_customer_deal')) h += '<button class="btn-icon order-add-veh" type="button">+ רכב נוסף להזמנה</button>';
      if (o.can_send) {
        h += '<button class="btn-icon primary order-send" type="button">' +
          (['sent', 'approved', 'changed', 'change_requested'].indexOf(st.code) > -1 && o.sent_at ? 'שליחה מחדש ללקוח' : 'שליחה ללקוח לאישור') + '</button>';
        if (st.code === 'sent') h += '<button class="btn-icon order-withdraw" type="button">החזרה להכנה</button>';
      }
      if (ac.ok) h += '<button class="btn-icon order-archive" type="button">העברה לארכיון</button>';
      h += '</div>';
    } else if (!o.archived && ac.ok) {
      h += '<div class="order-acts"><button class="btn-icon order-archive" type="button">העברה לארכיון</button></div>';
    }
    if (o.archived && can('create_customer_deal')) {
      h += '<div class="order-acts"><button class="btn-icon order-unarchive" type="button">שחזור מהארכיון</button></div>';
    }
    return h + '</div></div>';
  }

  function sumCell(k, v, strong) {
    var txt = v == null ? '—' : (v < 0 ? '−' + YM.nis(-v) : YM.nis(v));
    return '<div' + (strong ? ' class="strong"' : '') + '><span class="k">' + E(k) + '</span><span class="v">' + E(txt) + '</span></div>';
  }

  var KIND_HE = { accessory: 'אביזר', service: 'שירות', custom: 'שורה חופשית' };
  function cartHtml(d) {
    var c = cartLookup(d.id);
    if (!c) return '';
    var lines = c.deal.lines || [], ed = c.deal.editable, appr = state.orders && state.orders.can_approve_lines;
    var h = '<div class="cart" data-deal="' + E(d.id) + '"><div class="cl-head"><span>אביזרים ושירותים לרכב</span></div>';
    if (!lines.length) h += '<div class="empty small">לא נוספו תוספות לרכב הזה.</div>';
    lines.forEach(function (x) {
      h += '<div class="cart-line st-' + E(x.status) + '" data-line="' + E(x.id) + '">' +
        '<div class="cart-main"><div class="t">' + E(x.label) + ' <span class="kind">' + E(KIND_HE[x.kind] || '') + '</span></div>' +
          '<div class="s">' + (x.quantity > 1 ? x.quantity + ' × ' + E(YM.nis(x.unit_price)) + ' · ' : '') +
            (x.status === 'pending' ? 'ממתינה לאישור מנהל' + (x.by ? ' · נוספה ע"י ' + E(x.by) : '') :
             x.status === 'rejected' ? 'נדחתה' + (x.decided_by ? ' ע"י ' + E(x.decided_by) : '') + (x.note ? ': ' + E(x.note) : '') :
             (x.kind === 'custom' && x.decided_by ? 'אושרה ע"י ' + E(x.decided_by) : '')) + '</div></div>' +
        '<div class="cart-price">' + E(YM.nis(x.total)) + '</div>' +
        '<div class="cart-ctl">' +
          (appr && x.status === 'pending' ? '<button class="btn-icon primary line-ok" type="button">אישור</button><button class="btn-icon line-no" type="button">דחייה</button>' : '') +
          (ed && x.status !== 'rejected' ? '<button class="btn-icon line-qty" type="button" title="כמות">כמות</button>' : '') +
          (ed ? '<button class="btn-icon danger line-del" type="button" title="הסרה">הסרה</button>' : '') +
        '</div></div>';
    });
    if (ed) {
      var cat = (state.orders && state.orders.catalog) || [];
      h += '<div class="cart-add">' +
        '<select class="small cart-pick" aria-label="בחירת פריט מהקטלוג"><option value="">הוספה מהקטלוג…</option>' +
          ['accessory', 'service'].map(function (k) {
            var items = cat.filter(function (i) { return i.kind === k; });
            if (!items.length) return '';
            return '<optgroup label="' + (k === 'accessory' ? 'אביזרים' : 'שירותים') + '">' + items.map(function (i) {
              return '<option value="' + E(i.id) + '">' + E(i.name) + ' — ' + E(YM.nis(i.price)) + '</option>';
            }).join('') + '</optgroup>';
          }).join('') +
        '</select>' +
        '<input class="small cart-qty" type="number" min="1" max="99" value="1" aria-label="כמות">' +
        '<button class="btn-icon cart-add-btn" type="button">הוספה</button>' +
        '<button class="linkish cart-custom" type="button">שורה חופשית</button>' +
        (!cat.length ? '<span class="hint">הקטלוג ריק — מנהל הרכש מוסיף פריטים ב"קטלוג תוספות".</span>' : '') +
      '</div>';
    } else if (c.deal.locked) {
      h += '<div class="terms-note">ההסכם על הרכב נחתם — התוספות נעולות.</div>';
    }
    return h + '</div>';
  }

  async function archiveCall(payload, okText, after) {
    payload.token = session.token;
    var r;
    try { r = await YM.api('/archive/action', payload); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.ok ? okText : (r.message_he || 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) { if (after) after(r); else openCard(state.cardId); load(false); }
    return r;
  }

  async function orderCall(payload, okReload) {
    payload.token = session.token;
    var r;
    try { r = await YM.api('/orders/action', payload); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.message_he || (r.ok ? 'נשמר.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok && okReload !== false) openCard(state.cardId);
    return r;
  }

  function bindOrders(res) {
    var body = document.getElementById('card-body');
    body.querySelectorAll('.order').forEach(function (el) {
      var oid = el.getAttribute('data-order');
      var o = ((state.orders && state.orders.orders) || []).filter(function (x) { return x.id === oid; })[0] || {};
      var addVeh = el.querySelector('.order-add-veh');
      if (addVeh) addVeh.addEventListener('click', function () { openDealForm(res.customer, null, oid); });
      var send = el.querySelector('.order-send');
      if (send) send.addEventListener('click', function () { openSend(o, res.customer); });
      var arc = el.querySelector('.order-archive');
      if (arc) arc.addEventListener('click', function () {
        var ac = o.archive_check || {};
        var what = ac.kind === 'delivered' ? 'כל הרכבים בהזמנה נמסרו.' : ac.kind === 'partial' ? 'חלק מהרכבים נמסרו וחלק בוטלו.' : 'ההזמנה בוטלה / לא הושלמה.';
        var reason = prompt(what + ' להעביר את ' + (o.order_number || 'ההזמנה') + ' לארכיון?\nסיבה / הערה (לא חובה):', '');
        if (reason === null) return;
        archiveCall({ action: 'order_archive', order_id: oid, reason: reason }, 'ההזמנה הועברה לארכיון.');
      });
      var unarc = el.querySelector('.order-unarchive');
      if (unarc) unarc.addEventListener('click', function () {
        archiveCall({ action: 'order_unarchive', order_id: oid }, 'ההזמנה הוחזרה מהארכיון.');
      });
      var tg = el.querySelector('.order-toggle');
      if (tg) tg.addEventListener('click', function () {
        var open = el.classList.toggle('open');
        tg.textContent = open ? 'הסתרת פרטים' : 'הצגת פרטים';
      });
      var wd = el.querySelector('.order-withdraw');
      if (wd) wd.addEventListener('click', function () {
        if (!confirm('להחזיר את ההזמנה להכנה? הלקוח לא יוכל לאשר אותה עד שתישלח שוב.')) return;
        orderCall({ action: 'withdraw', order_id: oid });
      });
    });
    body.querySelectorAll('.cart').forEach(function (el) {
      var dealId = el.getAttribute('data-deal');
      var addBtn = el.querySelector('.cart-add-btn');
      if (addBtn) addBtn.addEventListener('click', function () {
        var pick = el.querySelector('.cart-pick').value;
        if (!pick) { notice('בחרו פריט מהקטלוג.', 'err'); return; }
        addBtn.disabled = true;
        orderCall({ action: 'extra_add', deal_id: dealId, catalog_item_id: pick, quantity: el.querySelector('.cart-qty').value || 1 });
      });
      var cust = el.querySelector('.cart-custom');
      if (cust) cust.addEventListener('click', function () {
        var label = prompt('תיאור השורה (למשל: התקנת וו גרירה מקורי):');
        if (label === null || !label.trim()) return;
        var price = prompt('מחיר כולל מע"מ (₪):');
        if (price === null || !String(price).trim()) return;
        orderCall({ action: 'extra_add', deal_id: dealId, label: label, unit_price: price, quantity: 1 });
      });
      el.querySelectorAll('.cart-line').forEach(function (row) {
        var lid = row.getAttribute('data-line');
        var q = row.querySelector('.line-qty');
        if (q) q.addEventListener('click', function () {
          var v = prompt('כמות:', '1'); if (v === null) return;
          orderCall({ action: 'extra_qty', extra_id: lid, quantity: v });
        });
        var del = row.querySelector('.line-del');
        if (del) del.addEventListener('click', function () {
          if (!confirm('להסיר את השורה מההזמנה?')) return;
          orderCall({ action: 'extra_remove', extra_id: lid });
        });
        var ok = row.querySelector('.line-ok');
        if (ok) ok.addEventListener('click', function () { orderCall({ action: 'extra_decide', extra_id: lid, approve: true }); });
        var no = row.querySelector('.line-no');
        if (no) no.addEventListener('click', function () {
          var why = prompt('סיבת הדחייה:'); if (why === null || !why.trim()) return;
          orderCall({ action: 'extra_decide', extra_id: lid, approve: false, note: why });
        });
      });
    });
  }

  /* שליחה ללקוח: ההזמנה נפתחת לאישור באיזור האישי; ההודעה יכולה לצאת במייל או בוואטסאפ */
  var sendCtx = null;
  function openSend(o, customer) {
    sendCtx = o;
    var t = (o.snapshot && o.snapshot.totals) || {};
    document.getElementById('send-line').textContent = o.order_number + ' · ' + customer.name + ' · סה״כ ' + YM.nis(t.grand) + ' · יתרה ' + YM.nis(t.balance);
    var em = document.getElementById('send-email');
    em.disabled = !customer.invoice_email;
    em.parentNode.title = customer.invoice_email ? customer.invoice_email : 'ללקוח אין מייל';
    document.getElementById('send-email-note').textContent = customer.invoice_email ? 'יישלח ל-' + customer.invoice_email : 'ללקוח אין כתובת מייל — אפשר להוסיף בעריכת הפרטים.';
    document.getElementById(customer.invoice_email ? 'send-email' : 'send-wa').checked = true;
    hide('card-modal');
    show('send-modal');
  }
  var sendForm = document.getElementById('send-form');
  if (sendForm) sendForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!sendCtx) return;
    var ch = (sendForm.querySelector('input[name="channel"]:checked') || {}).value || 'portal';
    var waWin = ch === 'whatsapp' ? window.open('', '_blank') : null; // נפתח עכשיו כדי שהדפדפן לא יחסום
    var btn = document.getElementById('send-go'); btn.disabled = true;
    var r = await orderCall({ action: 'send', order_id: sendCtx.id, channel: ch }, false);
    btn.disabled = false;
    if (r.ok && r.wa_phone && waWin) {
      waWin.location = 'https://wa.me/' + String(r.wa_phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(r.wa_text || '');
    } else if (waWin) waWin.close();
    if (r.ok) { hide('send-modal'); openCard(state.cardId); }
  });

  /* ---------- קטלוג אביזרים ושירותים (מנהל רכש) ---------- */
  var catBtn = document.getElementById('open-catalog');
  if (catBtn) {
    catBtn.hidden = !can('manage_catalog');
    catBtn.addEventListener('click', function () { show('catalog-modal'); loadCatalog(); });
  }
  async function loadCatalog() {
    var host = document.getElementById('catalog-rows');
    host.innerHTML = '<div class="empty small">טוען…</div>';
    var r;
    try { r = await YM.api('/orders/action', { token: session.token, action: 'catalog' }); } catch (err) { r = { ok: false, message_he: err.message }; }
    if (r.ok !== true) { host.innerHTML = '<div class="empty small">' + E(r.message_he || 'הטעינה נכשלה.') + '</div>'; return; }
    var items = r.items || [];
    host.innerHTML = items.length ? items.map(function (i) {
      return '<div class="cat-row' + (i.active ? '' : ' off') + '" data-id="' + E(i.id) + '">' +
        '<div><div class="t">' + E(i.name) + ' <span class="kind">' + E(KIND_HE[i.kind]) + '</span>' + (i.active ? '' : ' <span class="kind">מושבת</span>') + '</div>' +
        '<div class="s">' + (i.description ? E(i.description) + ' · ' : '') + 'בשימוש ב-' + i.used + ' הזמנות' + (i.updated_by ? ' · עודכן ע"י ' + E(i.updated_by) : '') + '</div></div>' +
        '<div class="cart-price">' + E(YM.nis(i.price)) + '</div>' +
        '<button class="btn-icon cat-edit" type="button">עריכה</button></div>';
    }).join('') : '<div class="empty small">הקטלוג ריק. הוסיפו את האביזרים והשירותים שאתם מוכרים, עם המחיר ללקוח כולל מע"מ.</div>';
    host.querySelectorAll('.cat-edit').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('.cat-row').getAttribute('data-id');
        fillCatForm(items.filter(function (x) { return x.id === id; })[0]);
      });
    });
  }
  var catForm = document.getElementById('catalog-form');
  function fillCatForm(i) {
    catForm.reset();
    catForm.item_id.value = i ? i.id : '';
    catForm.kind.value = i ? i.kind : 'accessory';
    catForm.item_name.value = i ? i.name : '';
    catForm.description.value = i ? (i.description || '') : '';
    catForm.price.value = i ? i.price : '';
    catForm.active.checked = i ? !!i.active : true;
    document.getElementById('cat-save').textContent = i ? 'שמירת שינויים' : 'הוספה לקטלוג';
    catForm.item_name.focus();
  }
  if (catForm) {
    document.getElementById('cat-new').addEventListener('click', function () { fillCatForm(null); });
    catForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var item = { id: catForm.item_id.value || null, kind: catForm.kind.value, name: catForm.item_name.value,
                   description: catForm.description.value, price: catForm.price.value, active: catForm.active.checked };
      var r = await orderCall({ action: 'catalog_save', item: item }, false);
      if (r.ok) { fillCatForm(null); loadCatalog(); }
    });
  }

  /* ---------- תנאים מסחריים והסכם מכירה ---------- */
  function termsHtml(d, mine, closed) {
    var t = d.terms || {}, b = t.breakdown || {};
    var has = t.sale_price != null;
    var rows = has ? [
      t.list_price != null && t.discount ? ['מחיר מחירון', YM.nis(t.list_price)] : null,
      t.discount ? ['הנחה', YM.nis(t.discount) + (t.discount_by ? ' · ' + t.discount_by : '')] : null,
      ['מחיר מכירה', YM.nis(b.total) + ' (כולל מע"מ ' + (t.vat_rate || 18) + '%)'],
      ['לפני מע"מ', YM.nis(b.net) + ' · מע"מ ' + YM.nis(b.vat)],
      t.down_payment ? ['מקדמה', YM.nis(t.down_payment)] : null,
      t.trade_in_credit ? ['זיכוי טרייד-אין', YM.nis(t.trade_in_credit)] : null,
      t.financing_amount ? ['מימון', YM.nis(t.financing_amount)] : null,
      ['יתרה לתשלום', YM.nis(b.balance)],
      ['מועד מסירה משוער', t.expected_delivery_date ? fmtDate(t.expected_delivery_date) : '—']
    ].filter(Boolean) : [];

    return '<div class="terms">' +
      '<div class="cl-head"><span>תנאים מסחריים' + (t.locked ? ' · נעולים (ההסכם נחתם)' : '') + '</span>' +
        (mine && !closed ? '<button class="btn-icon terms-edit" type="button">' + (has ? 'עריכה' : 'הזנת תנאים') + '</button>' : '') + '</div>' +
      (has ? '<div class="terms-grid">' + rows.map(function (r) {
          return '<div><span class="k">' + E(r[0]) + '</span><span class="v">' + E(r[1]) + '</span></div>';
        }).join('') + '</div>' +
        (t.warranty_text ? '<div class="terms-note">אחריות: ' + E(t.warranty_text) + '</div>' : '') +
        (t.special_terms ? '<div class="terms-note">תנאים מיוחדים: ' + E(t.special_terms) + '</div>' : '')
        : '<div class="empty small">טרם הוזנו מחיר מכירה ותנאי תשלום — הם נדרשים להנפקת הסכם.</div>') +
      (t.discount_reason ? '<div class="terms-note">סיבת ההנחה: ' + E(t.discount_reason) + '</div>' : '') +
      discountRequestHtml(d, t) +
      '</div>';
  }

  /* בקשת הנחה חריגה: מנהל המכירות מבקש, מנהל הרכש מאשר */
  function discountRequestHtml(d, t) {
    var card = state.card || {}, v = card.viewer || {};
    var r = t.request;
    var h = '';
    if (r) {
      h += '<div class="disc-req">' +
        (r.approved_at
          ? 'אושרה הנחה של ' + E(YM.nis(r.approved_amount)) + (r.approved_by ? ' · ' + E(r.approved_by) : '')
          : 'ממתין לאישור מנהל הרכש: הנחה של ' + E(YM.nis(r.amount))) +
        '<span class="s">' + E(r.reason || '') + (r.note ? ' · ' + E(r.note) : '') + '</span>' +
        (card.can_set_price && !r.approved_at
          ? '<span class="disc-acts">' +
            '<button class="btn-icon primary disc-ok" type="button">אישור</button>' +
            '<button class="btn-icon disc-no" type="button">דחייה</button></span>'
          : '') +
      '</div>';
    }
    if (card.can_discount && t.cap != null && !t.locked) {
      h += '<div class="terms-note">תקרת הנחה ללא אישור: ' + E(YM.nis(t.cap)) +
        ' <button class="linkish disc-ask" type="button">בקשת הנחה גבוהה יותר</button></div>';
    }
    if (t.trade_in_locked) {
      h += '<div class="terms-note">זיכוי הטרייד-אין נגזר ממחיר הקנייה שקבע מנהל הרכש.</div>';
    }
    return h;
  }

  function agreementHtml(d, mine) {
    var a = d.agreement;
    var head = '<div class="cl-head"><span>הסכם מכירה</span>' +
      (mine ? '<button class="btn-icon agr-preview" type="button">תצוגה מקדימה</button>' : '') + '</div>';
    if (!a) {
      return '<div class="agr">' + head +
        '<div class="agr-row"><span class="empty small">לא הונפק הסכם.</span>' +
        (mine && d.deal_status !== 'cancelled' && d.deal_status !== 'completed'
          ? '<button class="btn-icon primary agr-issue" type="button">הנפקת הסכם לחתימה</button>' : '') + '</div></div>';
    }
    var signed = a.status === 'signed';
    return '<div class="agr">' + head + '<div class="agr-row">' +
      '<div><div class="t">' + (signed ? 'נחתם' : 'ממתין לחתימת הלקוח') + ' · גרסה ' + a.version + '</div>' +
      '<div class="s">' + (signed
          ? E(a.signer_name || '') + ' · ' + fmtDT(a.signed_at) + (a.sign_method === 'digital_portal' ? ' · חתימה דיגיטלית' : ' · חתימה ידנית')
          : 'הונפק ' + fmtDate(a.issued_at) + (a.issued_by_name ? ' · ' + E(a.issued_by_name) : '') +
            (a.expires_at ? ' · תקף עד ' + fmtDate(a.expires_at) : '')) + '</div>' +
      '<div class="hash ltr" title="טביעת אצבע של המסמך">' + E(String(a.content_hash || '').slice(0, 16)) + '…</div></div>' +
      '<div class="agr-btns">' +
        (a.pdf_drive_url ? '<a class="btn-icon" href="' + E(a.pdf_drive_url) + '" target="_blank" rel="noopener">ההסכם החתום</a>' : '') +
        (mine && !signed ? '<button class="btn-icon agr-cancel" type="button">ביטול ההסכם</button>' : '') +
        (mine && signed ? '<button class="btn-icon agr-issue" type="button">הנפקת הסכם מתוקן</button>' : '') +
      '</div></div></div>';
  }

  var tForm = document.getElementById('terms-form');
  function openTerms(d) {
    var t = d.terms || {};
    tForm.reset(); tForm.deal_id.value = d.id;
    document.getElementById('terms-line').textContent =
      (d.vehicle ? d.vehicle.title + ' · VIN ' + (d.vehicle.vin || '—') : 'ללא רכב משויך');
    tForm.sale_price.value = t.sale_price != null ? t.sale_price : '';
    tForm.down_payment.value = t.down_payment != null ? t.down_payment : '';
    tForm.trade_in_credit.value = t.trade_in_credit != null ? t.trade_in_credit : '';
    tForm.trade_in_credit.readOnly = !!t.trade_in_locked;
    tForm.trade_in_credit.title = t.trade_in_locked
      ? 'נגזר ממחיר הקנייה של רכב הטרייד-אין, שנקבע על ידי מנהל הרכש' : '';
    tForm.financing_amount.value = t.financing_amount != null ? t.financing_amount : '';
    tForm.expected_delivery_date.value = t.expected_delivery_date || '';
    tForm.delivery_terms.value = t.delivery_terms || '';
    tForm.warranty_text.value = t.warranty_text || '';
    tForm.special_terms.value = t.special_terms || '';
    tForm.vat_rate.value = t.vat_rate != null ? t.vat_rate : 18;
    show('terms-modal');
  }
  if (tForm) tForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var terms = { deal_id: tForm.deal_id.value, sale_price: tForm.sale_price.value, vat_rate: tForm.vat_rate.value,
      price_includes_vat: true, down_payment: tForm.down_payment.value, trade_in_credit: tForm.trade_in_credit.value,
      financing_amount: tForm.financing_amount.value, expected_delivery_date: tForm.expected_delivery_date.value,
      delivery_terms: tForm.delivery_terms.value, warranty_text: tForm.warranty_text.value, special_terms: tForm.special_terms.value };
    var t0 = (state.card && (state.card.deals || []).filter(function (x) { return x.id === terms.deal_id; })[0]) || {};
    var list = (t0.terms || {}).list_price;
    var want = Number(String(terms.sale_price).replace(/[^0-9.]/g, ''));
    if (list != null && want && want < list) {
      var why = prompt('הנחה של ' + YM.nis(list - want) + ' — מה הסיבה?',
                       (t0.terms || {}).discount_reason || '');
      if (why === null || !String(why).trim()) { notice('הנחה מחייבת סיבה.', 'err'); return; }
      terms.discount_reason = why;
    }
    var r = await YM.api('/deal/terms', { token: session.token, terms: terms });
    notice(r.message_he || (r.ok ? 'נשמר.' : 'השמירה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) { hide('terms-modal'); openCard(state.cardId); }
  });

  async function previewAgreement(dealId) {
    var r = await YM.api('/deal/agreement/preview', { token: session.token, deal_id: dealId });
    if (r.ok !== true) { notice(r.message_he || 'לא ניתן להציג את ההסכם.', 'err'); return; }
    document.getElementById('apv-body').innerHTML = r.html;
    var warn = document.getElementById('apv-warn');
    var gaps = (r.gaps || []);
    warn.innerHTML = (r.reviewed_by_lawyer ? '' : '<div class="banner">נוסח ההסכם טרם אושר על ידי עורך דין — מומלץ לאשר לפני החתמת לקוח.</div>') +
      (gaps.length ? '<div class="banner">חסר להנפקה: ' + E(gaps.join(', ')) + '</div>' : '');
    show('apv-modal');
    document.getElementById('apv-body').scrollTop = 0;
  }

  /* ---------- בדיקת תעודות מזהות (OCR מול הכרטיס) ---------- */
  var FIELD_HE = { id: 'מספר זהות', name: 'שם', address: 'כתובת' };
  function idChecksHtml(list) {
    if (!list.length) return '';
    var open = list.filter(function (k) { return !k.resolved && (k.status === 'mismatch' || k.status === 'unreadable' || k.status === 'error'); });
    var h = '<div class="sect idchk"><h3>בדיקת תעודות מזהות' + (open.length ? ' <span class="idchk-count">' + open.length + ' לטיפול</span>' : '') + '</h3>';
    list.forEach(function (k) {
      var x = k.extracted || {};
      var who = [x.full_name_he || x.company_name || x.full_name_en, x.id_number || x.company_reg_number].filter(Boolean).join(' · ');
      var head = '<div class="idchk-head"><b>' + E(k.kind_he) + '</b>' + (who ? ' · <span>' + E(who) + '</span>' : '') +
        (k.vehicle ? ' <span class="idchk-veh">' + E(k.vehicle) + '</span>' : '') +
        '<span class="idchk-when">' + fmtDT(k.checked_at || k.created_at) + '</span></div>';
      if (k.status === 'pending') {
        h += '<div class="idchk-item pending">' + head + '<div class="idchk-line">סורקים את התעודה ומשווים לכרטיס…</div></div>';
        return;
      }
      if (k.status === 'match') {
        h += '<div class="idchk-item ok">' + head + '<div class="idchk-line">✓ הפרטים בתעודה תואמים ל' + E(k.party_label || 'כרטיס') + '.' +
          (x.expiry_date ? ' בתוקף עד ' + E(x.expiry_date.split('-').reverse().join('.')) + '.' : '') + '</div>' +
          flagsHtml(k.flags) + '</div>';
        return;
      }
      if (k.resolved) {
        h += '<div class="idchk-item done">' + head + '<div class="idchk-line">' +
          (k.resolution === 'applied' ? 'הפרטים עודכנו מהתעודה (' + E(((k.applied && k.applied.fields) || []).map(function (f) { return FIELD_HE[f] || f; }).join(', ')) + ')'
                                       : 'נבדק — הפרטים בכרטיס נשארו כמו שהם') +
          (k.resolved_by ? ' · ' + E(k.resolved_by) : '') + ' · ' + fmtDT(k.resolved_at) + '</div></div>';
        return;
      }
      var mis = k.mismatches || [];
      var rows = mis.map(function (m) {
        var canApply = m.doc && (m.field !== 'id' || /^\d{5,9}$/.test(String(m.doc)));
        return '<label class="idchk-row sev-' + E(m.severity) + '">' +
          (canApply ? '<input type="checkbox" class="idchk-f" value="' + E(m.field) + '"' + (m.card ? '' : ' checked') + '>' : '<span class="idchk-nochk"></span>') +
          '<span class="k">' + E(m.label) + '</span>' +
          '<span class="v">בתעודה: <b>' + E(m.doc || '—') + '</b></span>' +
          '<span class="v">בכרטיס: <b>' + E(m.card || 'חסר') + '</b></span>' +
          '<span class="t">' + E(m.text || '') + '</span></label>';
      }).join('');
      var targets = k.targets || [];
      var tsel = targets.length > 1 ? '<select class="small idchk-target" aria-label="לאן לעדכן">' + targets.map(function (t) {
        return '<option value="' + E(t.key) + '"' + (t.key === k.party ? ' selected' : '') + '>לעדכן ב: ' + E(t.label) + '</option>';
      }).join('') + '</select>' : '';
      h += '<div class="idchk-item warn" data-check="' + E(k.id) + '">' + head +
        (k.status === 'unreadable' || k.status === 'error'
          ? '<div class="idchk-line">⚠ ' + E(k.status === 'error' ? ('הסריקה נכשלה' + (k.error ? ': ' + k.error : '')) : 'לא הצלחנו לקרוא את פרטי התעודה.') + ' כדאי לבדוק את הקובץ ידנית.</div>'
          : '<div class="idchk-line">⚠ יש אי-התאמה בין התעודה ל' + E(k.party_label || 'כרטיס') + '. זה לא חוסם — רק לוודא שזה תקין (למשל תעודה של בן/בת הזוג).</div>') +
        (rows ? '<div class="idchk-rows">' + rows + '</div>' : '') + flagsHtml(k.flags) +
        '<div class="idchk-acts">' + tsel +
          (rows && mis.some(function (m) { return m.doc; }) ? '<button class="btn-icon primary idchk-apply" type="button">עדכון הפרטים שסומנו לכרטיס</button>' : '') +
          '<button class="btn-icon idchk-ignore" type="button">הפרטים בכרטיס נכונים</button></div></div>';
    });
    return h + '</div>';
  }
  function flagsHtml(flags) {
    if (!flags || !flags.length) return '';
    return '<ul class="idchk-flags">' + flags.map(function (f) { return '<li class="sev-' + E(f.severity) + '">' + E(f.text) + '</li>'; }).join('') + '</ul>';
  }
  function bindIdChecks() {
    var sect = document.getElementById('idchk-sect');
    if (!sect) return;
    sect.querySelectorAll('.idchk-item.warn').forEach(function (el) {
      var id = el.getAttribute('data-check');
      var ap = el.querySelector('.idchk-apply');
      if (ap) ap.addEventListener('click', async function () {
        var fields = Array.prototype.map.call(el.querySelectorAll('.idchk-f:checked'), function (c) { return c.value; });
        if (!fields.length) { notice('סמנו אילו פרטים לעדכן מהתעודה.', 'err'); return; }
        var tg = el.querySelector('.idchk-target');
        ap.disabled = true;
        await idCheckCall({ check_id: id, action: 'apply', fields: fields, target: tg ? tg.value : 'customer' }, true);
        ap.disabled = false;
      });
      var ig = el.querySelector('.idchk-ignore');
      if (ig) ig.addEventListener('click', function () { idCheckCall({ check_id: id, action: 'ignore' }, false); });
    });
  }
  async function idCheckCall(payload, reloadAll) {
    payload.token = session.token;
    var r;
    try { r = await YM.api('/id-check/resolve', payload); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.message_he || (r.ok ? 'נשמר.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) { if (reloadAll) { openCard(state.cardId); load(false); } else refreshIdChecks(); }
  }
  async function refreshIdChecks() {
    var id = state.cardId, sect = document.getElementById('idchk-sect');
    if (!id || !sect || document.getElementById('card-modal').hidden) return null;
    var r; try { r = await YM.api('/customers/card', { token: session.token, id: id }); } catch (e) { return null; }
    if (!r || r.ok !== true || state.cardId !== id) return null;
    sect = document.getElementById('idchk-sect');
    if (!sect) return null;
    sect.innerHTML = idChecksHtml(r.id_checks || []);
    bindIdChecks();
    return r.id_checks || [];
  }
  // אחרי העלאת תעודה: הסריקה רצה ברקע — מרעננים את הבדיקות עד שהתוצאה מגיעה
  function watchIdChecks(customerId, known) {
    var tries = 0;
    (function tick() {
      setTimeout(async function () {
        if (state.cardId !== customerId) return;
        var list = await refreshIdChecks();
        tries++;
        var fresh = (list || []).filter(function (k) { return known.indexOf(k.id) === -1; });
        var pending = !fresh.length || fresh.some(function (k) { return k.status === 'pending'; });
        if (pending && tries < 8) tick();
      }, tries ? 5000 : 4000);
    })();
  }

  function bindCard(res) {
    bindIdChecks();
    var body = document.getElementById('card-body');
    var cdocUp = document.getElementById('cdoc-up');
    if (cdocUp) cdocUp.addEventListener('click', function () {
      pickFile({ scope: 'customer', target_id: res.customer.id, document_id: null, doc_type: document.getElementById('cdoc-type').value });
    });
    var newDeal = document.getElementById('card-new-deal');
    if (newDeal) newDeal.addEventListener('click', function () { openDealForm(res.customer, null); });
    var edit = document.getElementById('card-edit');
    if (edit) edit.addEventListener('click', function () { openCustomerForm(res.customer); });
    var cArc = document.getElementById('card-archive');
    if (cArc) cArc.addEventListener('click', function () {
      if (cArc.getAttribute('data-blocked')) { notice(cArc.getAttribute('title') || 'אי אפשר להעביר לארכיון כרגע.', 'err'); return; }
      var reason = prompt('להעביר את ' + res.customer.name + ' לארכיון?\nההזמנות שלו יעברו איתו. הלקוח עדיין יימצא בחיפוש.\nסיבה / הערה (לא חובה):', '');
      if (reason === null) return;
      archiveCall({ action: 'customer_archive', customer_id: res.customer.id, reason: reason }, 'הלקוח הועבר לארכיון.');
    });
    var cUn = document.getElementById('card-unarchive');
    if (cUn) cUn.addEventListener('click', function () {
      archiveCall({ action: 'customer_unarchive', customer_id: res.customer.id }, 'הלקוח הוחזר לפעילים.');
    });
    var cDel = document.getElementById('card-delete');
    if (cDel) cDel.addEventListener('click', function () {
      var typed = prompt('מחיקה סופית של ' + res.customer.name + ' — הפרטים יימחקו ולא יהיה אפשר לשחזר.\nלאישור הקלידו: מחק');
      if (typed === null) return;
      if (typed.trim() !== 'מחק') { notice('המחיקה לא בוצעה — לא הוקלד "מחק".', 'err'); return; }
      archiveCall({ action: 'customer_delete', customer_id: res.customer.id }, 'הלקוח נמחק.', function () { hide('card-modal'); });
    });
    var fixId = document.getElementById('card-fix-id');
    if (fixId) fixId.addEventListener('click', function () { openCustomerForm(res.customer); });
    var fix = document.getElementById('card-fix-invoice');
    if (fix) fix.addEventListener('click', function () { openCustomerForm(res.customer); });

    body.querySelectorAll('.deal').forEach(function (el) {
      var id = el.getAttribute('data-id');
      var dl = (res.deals || []).filter(function (x) { return x.id === id; })[0] || {};
      var closed = dl.deal_status === 'completed' || dl.deal_status === 'cancelled';
      var mine = res.viewer && (res.viewer.role !== 'sales' || res.viewer.id === dl.created_by_staff_id);
      var sel = el.querySelector('.deal-status-sel');
      if (sel) sel.addEventListener('change', async function () {
        var st = sel.value;
        if ((st === 'cancelled' || st === 'completed') && !confirm(st === 'cancelled' ? 'לבטל את העסקה? הרכב ישוחרר חזרה למלאי.' : 'לסמן את העסקה כהושלמה? הרכב יסומן כנמסר.')) { openCard(state.cardId); return; }
        sel.disabled = true;
        var r = await YM.api('/deals/status', { token: session.token, deal_id: id, status: st });
        notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
        openCard(state.cardId); load(false);
      });
      var ask = el.querySelector('.disc-ask');
      if (ask) ask.addEventListener('click', async function () {
        var amt = prompt('איזו הנחה לבקש? (₪)');
        if (amt === null || !String(amt).trim()) return;
        var why = prompt('נימוק לבקשה:');
        if (why === null || !String(why).trim()) return;
        var r = await YM.api('/deal/discount/request', { token: session.token, deal_id: id, amount: amt, reason: why });
        notice(r.message_he || (r.ok ? 'נשלח.' : 'הבקשה נכשלה.'), r.ok ? 'ok' : 'err');
        if (r.ok) openCard(state.cardId);
      });
      var dOk = el.querySelector('.disc-ok');
      if (dOk) dOk.addEventListener('click', async function () {
        var note = prompt('הערה לאישור (לא חובה):') || '';
        var r = await YM.api('/deal/discount/decide', { token: session.token, deal_id: id, approve: true, note: note });
        notice(r.message_he || (r.ok ? 'אושר.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
        if (r.ok) openCard(state.cardId);
      });
      var dNo = el.querySelector('.disc-no');
      if (dNo) dNo.addEventListener('click', async function () {
        var note = prompt('סיבת הדחייה:');
        if (note === null) return;
        var r = await YM.api('/deal/discount/decide', { token: session.token, deal_id: id, approve: false, note: note });
        notice(r.message_he || (r.ok ? 'נדחה.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
        if (r.ok) openCard(state.cardId);
      });

      var ownerSel = el.querySelector('.deal-owner-sel');
      if (ownerSel) {
        var ownerWas = ownerSel.value;
        ownerSel.addEventListener('change', async function () {
          if (!ownerSel.value) { ownerSel.value = ownerWas; return; }
          ownerSel.disabled = true;
          var r = await YM.api('/deal/owner', { token: session.token, deal_id: id, staff_id: ownerSel.value });
          notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
          if (!r.ok) { ownerSel.value = ownerWas; ownerSel.disabled = false; return; }
          openCard(state.cardId);
        });
      }
      var docSel = el.querySelector('.deal-doc-sel');
      if (docSel) docSel.addEventListener('change', async function () {
        if (!docSel.value) return;
        docSel.disabled = true;
        var r = await YM.api('/deals/document-request', { token: session.token, deal_id: id, doc_type: docSel.value });
        notice(r.message_he || (r.ok ? 'נפתחה בקשה.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
        openCard(state.cardId);
      });
      el.querySelectorAll('.doc-up').forEach(function (b) {
        b.addEventListener('click', function () {
          pickFile({ scope: 'deal', target_id: id, document_id: b.getAttribute('data-doc'), doc_type: b.getAttribute('data-type') });
        });
      });
      var upSel = el.querySelector('.deal-up-sel');
      if (upSel) upSel.addEventListener('change', function () {
        if (!upSel.value) return;
        pickFile({ scope: 'deal', target_id: id, document_id: null, doc_type: upSel.value });
        upSel.value = '';
      });
      var clt = el.querySelector('.cl-toggle');
      if (clt) clt.addEventListener('click', function () {
        var body = el.querySelector('.cl-body');
        if (!body.hidden) { body.hidden = true; clt.textContent = 'הצג checklist'; return; }
        body.hidden = false; clt.textContent = 'הסתר';
        loadChecklist(id, body, mine && !closed);
      });
      var assign = el.querySelector('.deal-assign');
      if (assign) assign.addEventListener('click', function () {
        var d = (res.deals || []).filter(function (x) { return x.id === id; })[0];
        openDealForm(res.customer, d);
      });

      var re = el.querySelector('.reg-edit');
      if (re) re.addEventListener('click', function () { openDealForm(res.customer, dl); });
      var te = el.querySelector('.terms-edit');
      if (te) te.addEventListener('click', function () { openTerms(dl); });

      var apv = el.querySelector('.agr-preview');
      if (apv) apv.addEventListener('click', function () { previewAgreement(id); });

      el.querySelectorAll('.agr-issue').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (dl.agreement && dl.agreement.status === 'signed' &&
              !confirm('ההסכם הקיים כבר נחתם. הנפקת הסכם מתוקן לא מבטלת אותו — היא יוצרת גרסה חדשה לחתימה. להמשיך?')) return;
          b.disabled = true;
          var r = await YM.api('/deal/agreement/issue', { token: session.token, deal_id: id });
          if (r.ok !== true && r.gaps && r.gaps.length) {
            notice('חסרים פרטים להנפקה: ' + r.gaps.join(', '), 'err');
          } else {
            notice(r.message_he || (r.ok ? 'ההסכם הונפק.' : 'ההנפקה נכשלה.'), r.ok ? 'ok' : 'err');
          }
          b.disabled = false;
          if (r.ok) openCard(state.cardId);
        });
      });

      var acl = el.querySelector('.agr-cancel');
      if (acl) acl.addEventListener('click', async function () {
        var reason = prompt('סיבת ביטול ההסכם:');
        if (reason === null || !reason.trim()) return;
        var r = await YM.api('/deal/agreement/cancel', { token: session.token, agreement_id: dl.agreement.id, reason: reason });
        notice(r.message_he || (r.ok ? 'ההסכם בוטל.' : 'הפעולה נכשלה.'), r.ok ? 'ok' : 'err');
        if (r.ok) openCard(state.cardId);
      });
    });
    bindOrders(res);
  }

  /* ---------- טופס לקוח ---------- */
  var cForm = document.getElementById('customer-form');
  var cType = 'individual';

  function setCustomerType(t) {
    cType = t;
    document.querySelectorAll('#type-seg button').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-type') === t); });
    cForm.querySelectorAll('[data-for]').forEach(function (f) { f.hidden = f.getAttribute('data-for') !== t; });
  }
  document.querySelectorAll('#type-seg button').forEach(function (b) {
    b.addEventListener('click', function () { setCustomerType(b.getAttribute('data-type')); });
  });
  function setRegType(t) {
    cForm.company_reg_type.value = t;
    document.querySelectorAll('#reg-seg button').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-reg') === t); });
  }
  document.querySelectorAll('#reg-seg button').forEach(function (b) {
    b.addEventListener('click', function () { setRegType(b.getAttribute('data-reg')); });
  });

  function openCustomerForm(c) {
    cForm.reset();
    document.getElementById('dup-box').hidden = true;
    cForm.id.value = c ? c.id : '';
    document.getElementById('customer-modal-title').textContent = c ? 'עריכת לקוח' : 'לקוח חדש';
    setCustomerType(c ? c.customer_type : 'individual');
    setRegType(c && c.company_reg_type ? c.company_reg_type : 'hp');
    if (c) {
      cForm.full_name.value = c.full_name || ''; cForm.company_name.value = c.company_name || '';
      cForm.contact_person.value = c.contact_person || ''; cForm.phone.value = YM.phoneHe(c.phone) || '';
      cForm.id_number.value = c.id_number || ''; cForm.company_reg_number.value = c.company_reg_number || '';
      cForm.address.value = c.address || ''; cForm.invoice_email.value = c.invoice_email || '';
    }
    hide('card-modal');
    show('customer-modal');
    setTimeout(function () { (cType === 'company' ? cForm.company_name : cForm.full_name).focus(); }, 50);
  }
  document.getElementById('new-customer').addEventListener('click', function () { openCustomerForm(null); });

  cForm.addEventListener('submit', function (e) { e.preventDefault(); saveCustomer(false); });

  // ספרת ביקורת של ת.ז / ח.פ ישראלי — אותה בדיקה שהשרת עושה
  function idValid(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length < 5 || d.length > 9) return false;
    d = ('000000000' + d).slice(-9);
    if (d === '000000000') return false;
    var s = 0;
    for (var i = 0; i < 9; i++) { var x = Number(d[i]) * (i % 2 ? 2 : 1); s += x > 9 ? x - 9 : x; }
    return s % 10 === 0;
  }
  function formError(text) {
    var box = document.getElementById('dup-box');
    box.hidden = false; box.className = 'banner'; box.textContent = text;
  }

  async function saveCustomer(force) {
    var btn = document.getElementById('customer-save');
    // זיהוי חובה: ת.ז ללקוח פרטי, ח.פ / ע.מ לחברה — בלעדיו אין לקוח, ובלעדיו הלקוח לא ייכנס לאיזור האישי
    if (cType === 'company') {
      if (!cForm.company_reg_number.value.trim()) { formError('חובה להזין ח.פ / ע.מ של החברה.'); cForm.company_reg_number.focus(); return; }
      if (!idValid(cForm.company_reg_number.value)) { formError('מספר ח.פ / ע.מ לא תקין — בדקו מול תעודת ההתאגדות.'); cForm.company_reg_number.focus(); return; }
    } else {
      if (!cForm.id_number.value.trim()) { formError('חובה להזין מספר תעודת זהות של הלקוח.'); cForm.id_number.focus(); return; }
      if (!idValid(cForm.id_number.value)) { formError('מספר תעודת הזהות לא תקין — בדקו מול התעודה (9 ספרות כולל ספרת ביקורת).'); cForm.id_number.focus(); return; }
    }
    var payload = {
      id: cForm.id.value || null, customer_type: cType,
      full_name: cForm.full_name.value, company_name: cForm.company_name.value, contact_person: cForm.contact_person.value,
      phone: cForm.phone.value, id_number: cForm.id_number.value, company_reg_number: cForm.company_reg_number.value,
      company_reg_type: cForm.company_reg_type.value, address: cForm.address.value, invoice_email: cForm.invoice_email.value, force: force
    };
    btn.disabled = true; btn.textContent = 'שומר…';
    var r;
    try { r = await YM.api('/customers/save', { token: session.token, customer: payload }); }
    catch (err) { r = { ok: false, message_he: err.message }; }
    btn.disabled = false; btn.textContent = 'שמירה';
    if (r.ok) {
      hide('customer-modal');
      notice(payload.id ? 'פרטי הלקוח עודכנו.' : 'הלקוח נוצר.', 'ok');
      if (cForm.lead_id.value) {
        await YM.api('/leads/update', { token: session.token, lead_id: cForm.lead_id.value, customer_id: r.customer.id, status: 'converted' });
        cForm.lead_id.value = '';
        loadLeads();
      }
      await load(false);
      openCard(r.customer.id);
      return;
    }
    if (r.error === 'DUPLICATE') { renderDup(r.candidates || [], true); return; }
    if (r.error === 'ID_TAKEN') { renderDup(r.candidates || [], false); return; }
    var box = document.getElementById('dup-box');
    box.hidden = false; box.className = 'banner';
    box.textContent = r.message_he || 'השמירה נכשלה.';
  }

  function renderDup(list, canForce) {
    var box = document.getElementById('dup-box');
    box.hidden = false; box.className = 'dup-box';
    box.innerHTML = '<div>' + (canForce ? 'נמצא לקוח קיים עם אותו מספר טלפון:' : 'כבר קיים לקוח עם מספר הזיהוי הזה — אי אפשר לפתוח לו כרטיס נוסף. פתחו את הכרטיס הקיים:') + '</div>' + list.map(function (c) {
      return '<div class="list-row"><div class="lines"><span class="t">' + E(c.name) + '</span><span class="s">' + E(YM.phoneHe(c.phone)) +
        (c.id_number ? ' · ' + E(c.id_number) : '') + '</span></div>' +
        '<div class="row-actions"><button class="btn-icon" type="button" data-open="' + E(c.id) + '">פתח את הלקוח הקיים</button></div></div>';
    }).join('') + (canForce ? '<div class="row-actions"><button class="btn-icon danger" type="button" id="dup-force">זה לקוח אחר עם אותו טלפון — ליצור כרטיס נפרד</button></div>' : '');
    box.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', async function () {
        hide('customer-modal');
        if (cForm.lead_id.value) {
          await YM.api('/leads/update', { token: session.token, lead_id: cForm.lead_id.value, customer_id: b.getAttribute('data-open'), status: 'converted' });
          cForm.lead_id.value = '';
          loadLeads();
        }
        openCard(b.getAttribute('data-open'));
      });
    });
    var force = document.getElementById('dup-force');
    if (force) force.addEventListener('click', function () { saveCustomer(true); });
  }

  /* ---------- טופס עסקה ---------- */
  var dForm = document.getElementById('deal-form');
  var dealEditId = null;
  var pickTimer;

  var dealCustomer = null;
  function regType() { var r = dForm.querySelector('input[name="registration_type"]:checked'); return r ? r.value : ''; }
  function syncDealHints() {
    var rt = regType(), c = dealCustomer || {};
    var isComp = c.customer_type === 'company';
    document.getElementById('reg-private').hidden = rt !== 'private';
    document.getElementById('reg-company').hidden = rt !== 'company';
    document.getElementById('reg-opt-customer').textContent = isComp ? 'על שם החברה — ' + (c.name || '') : 'על שם הלקוח עצמו — ' + (c.name || '');
    var cl = document.getElementById('reg-customer-line');
    cl.hidden = rt !== 'customer';
    if (rt === 'customer') {
      var idn = isComp ? c.company_reg_number : c.id_number;
      cl.innerHTML = 'ייכתב ברישיון: <b>' + E(c.name || '') + '</b> · ' + (isComp ? 'ח.פ ' : 'ת.ז ') + E(idn || '—') + ' · ' +
        (c.address ? E(c.address) : '<span class="warn-txt">חסרה כתובת בכרטיס הלקוח — השלימו ב"עריכת פרטים"</span>');
    }
    document.getElementById('fin-private-wrap').hidden = !dForm.financing_required.checked;
    if (!dForm.financing_required.checked) dForm.financing_on_private_name.checked = false;
    var priv = rt === 'private' || (rt === 'customer' && !isComp);
    var compReg = rt === 'company' || (rt === 'customer' && isComp);
    var who = rt === 'customer' ? (c.name || 'הלקוח') : rt === 'private' ? (dForm.end_user_name.value || 'אדם פרטי אחר') : rt === 'company' ? (dForm.registered_name.value || 'חברה אחרת') : 'טרם נבחר';
    var need = ['פרטים לחשבונית'];
    if (isComp) need.push('אישור בעלי מניות + מורשה חתימה');
    if (priv) need.push('צילום ת.ז של מי שהרכב נרשם על שמו');
    if (compReg) need.push('תעודת התאגדות של החברה שהרכב נרשם על שמה');
    if (dForm.financing_required.checked && dForm.financing_on_private_name.checked) need.push('ת.ז שני צדדים, רישיון נהיגה, ספח, פרטי אשראי');
    need.push('בדיקת תוקף התעודות', 'צילום רישיון הרכב אחרי הרישוי');
    document.getElementById('reg-hint').textContent = 'הרכב יירשם על שם: ' + who + '. מסמכים שייפתחו ב-checklist: ' + need.join(' · ') + '.';
  }
  dForm.querySelectorAll('input[name="registration_type"]').forEach(function (r) { r.addEventListener('change', syncDealHints); });
  dForm.end_user_name.addEventListener('input', syncDealHints);
  dForm.registered_name.addEventListener('input', syncDealHints);
  dForm.financing_required.addEventListener('change', syncDealHints);
  dForm.financing_on_private_name.addEventListener('change', syncDealHints);

  var dealOrderId = null;
  function openDealForm(customer, deal, orderId) {
    dForm.reset();
    dealEditId = deal ? deal.id : null;
    dealOrderId = deal ? null : (orderId || null);
    dForm.customer_id.value = customer.id;
    var ord = dealOrderId && ((state.orders && state.orders.orders) || []).filter(function (x) { return x.id === dealOrderId; })[0];
    document.getElementById('deal-modal-title').textContent = deal ? 'רכב ורישום' : (ord ? 'רכב נוסף להזמנה ' + ord.order_number : 'הזמנה חדשה');
    document.getElementById('deal-customer-line').textContent = 'לקוח: ' + customer.name + ' · ' + YM.phoneHe(customer.phone);
    document.getElementById('deal-save').textContent = deal ? 'שמירה' : (ord ? 'הוספה להזמנה' : 'פתיחת הזמנה');
    dealCustomer = customer;
    if (deal) {
      var rg = deal.registration || {};
      var t = rg.type || '';
      dForm.querySelectorAll('input[name="registration_type"]').forEach(function (r) { r.checked = r.value === t; });
      dForm.end_user_name.value = deal.end_user_name || ''; dForm.end_user_phone.value = deal.end_user_phone ? YM.phoneHe(deal.end_user_phone) : '';
      dForm.end_user_id_number.value = deal.end_user_id_number || '';
      if (t === 'private') dForm.registered_address_p.value = rg.address || '';
      if (t === 'company') {
        dForm.registered_name.value = rg.name || ''; dForm.registered_id_number.value = rg.id_number || '';
        dForm.registered_address_c.value = rg.address || ''; dForm.registered_phone.value = rg.phone ? YM.phoneHe(rg.phone) : '';
      }
      dForm.financing_required.checked = !!deal.financing_required;
      dForm.financing_on_private_name.checked = !!deal.financing_on_private_name;
    }
    syncDealHints();
    setPicked(null);
    document.getElementById('veh-list').innerHTML = '';
    hide('card-modal');
    show('deal-modal');
    searchVehicles('');
  }

  document.getElementById('veh-q').addEventListener('input', function (e) {
    clearTimeout(pickTimer);
    var q = e.target.value.trim();
    pickTimer = setTimeout(function () { searchVehicles(q); }, 250);
  });

  async function searchVehicles(q) {
    var host = document.getElementById('veh-list');
    host.innerHTML = '<div class="pick"><span class="s">מחפש…</span></div>';
    var r;
    try { r = await YM.api('/inventory/list', { token: session.token, q: q, make: '', status: '', limit: 30, offset: 0 }); }
    catch (err) { host.innerHTML = '<div class="pick"><span class="s">' + E(err.message) + '</span></div>'; return; }
    var list = (r.vehicles || []).filter(function (v) { return ['delivered', 'cancelled', 'assigned_to_customer'].indexOf(v.status) === -1; });
    if (!list.length) { host.innerHTML = '<div class="pick"><span class="s">לא נמצאו רכבים זמינים.</span></div>'; return; }
    host.innerHTML = list.map(function (v) {
      return '<div class="pick" data-id="' + E(v.id) + '" data-label="' + E((v.title || '') + ' · ' + (v.model_year || '') + ' · ' + (v.color || '') + ' · ' + (v.vin_tail || '')) + '">' +
        '<div><div class="t">' + E(v.title || '—') + '</div><div class="s">' + E([v.model_year, v.color, v.location, v.vin ? 'VIN ' + v.vin : null].filter(Boolean).join(' · ')) + '</div></div>' +
        '<span class="status-pill">' + E(v.status_he) + '</span></div>';
    }).join('');
    host.querySelectorAll('.pick').forEach(function (p) {
      p.addEventListener('click', function () { setPicked({ id: p.getAttribute('data-id'), label: p.getAttribute('data-label') }); });
    });
  }

  function setPicked(v) {
    var el = document.getElementById('veh-picked');
    dForm.vehicle_file_id.value = v ? v.id : '';
    if (!v) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<span class="t">' + E(v.label) + '</span><button class="btn-icon" type="button" id="veh-clear">הסרה</button>';
    document.getElementById('veh-clear').addEventListener('click', function () { setPicked(null); });
    document.getElementById('veh-list').innerHTML = '';
  }

  dForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('deal-save');
    var rt = regType();
    if (!rt) { notice('חובה לבחור על שם מי יירשם הרכב ברישיון.', 'err'); return; }
    if (rt === 'private') {
      if (!dForm.end_user_name.value.trim() || !dForm.end_user_phone.value.trim() || !dForm.registered_address_p.value.trim()) { notice('לרישום על שם אדם פרטי — חובה שם, ת.ז, טלפון וכתובת.', 'err'); return; }
      if (!idValid(dForm.end_user_id_number.value)) { notice('מספר תעודת הזהות של בעל הרישום לא תקין.', 'err'); dForm.end_user_id_number.focus(); return; }
    }
    if (rt === 'company') {
      if (!dForm.registered_name.value.trim() || !dForm.registered_address_c.value.trim()) { notice('לרישום על שם חברה — חובה שם החברה, ח.פ וכתובת.', 'err'); return; }
      if (!idValid(dForm.registered_id_number.value)) { notice('מספר ח.פ של החברה לא תקין.', 'err'); dForm.registered_id_number.focus(); return; }
    }
    var payload = {
      id: dealEditId, customer_id: dForm.customer_id.value,
      registration_type: rt,
      registered_name: dForm.registered_name.value, registered_id_number: dForm.registered_id_number.value,
      registered_address: rt === 'private' ? dForm.registered_address_p.value : dForm.registered_address_c.value,
      registered_phone: dForm.registered_phone.value,
      end_user_same_as_customer: rt !== 'private',
      end_user_name: dForm.end_user_name.value, end_user_phone: dForm.end_user_phone.value, end_user_id_number: dForm.end_user_id_number.value,
      vehicle_file_id: dForm.vehicle_file_id.value || null,
      order_id: dealEditId ? null : dealOrderId,
      financing_required: dForm.financing_required.checked, financing_on_private_name: dForm.financing_on_private_name.checked,
      sale_price: dForm.sale_price.value ? Number(String(dForm.sale_price.value).replace(/[^\d.]/g, '')) : null
    };
    btn.disabled = true; btn.textContent = 'שומר…';
    var r;
    try { r = await YM.api('/deals/save', { token: session.token, deal: payload }); }
    catch (err) { r = { ok: false, message_he: err.message }; }
    btn.disabled = false; btn.textContent = dealEditId ? 'שמירה' : (dealOrderId ? 'הוספה להזמנה' : 'פתיחת הזמנה');
    notice(r.message_he || (r.ok ? 'נשמר.' : 'השמירה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) { hide('deal-modal'); await load(false); openCard(dForm.customer_id.value); }
  });

  /* ---------- checklist רישוי ומסירה ---------- */
  async function loadChecklist(dealId, body, editable) {
    body.innerHTML = '<div class="empty small">טוען…</div>';
    var r;
    try { r = await YM.api('/deals/checklist', { token: session.token, deal_id: dealId }); }
    catch (err) { body.innerHTML = '<div class="empty small">' + E(err.message) + '</div>'; return; }
    if (r.ok !== true) { body.innerHTML = '<div class="empty small">' + E(r.message_he || 'לא ניתן לטעון.') + '</div>'; return; }
    var h = '';
    var ci = r.customer_items || [];
    if (ci.length) {
      var cpct = r.customer_total ? Math.round(100 * r.customer_done / r.customer_total) : 0;
      h += '<div class="cl-group"><div class="cl-title">מסמכי לקוח' +
        (r.context && r.context.registered_to_private ? ' · רישום על שם פרטי' : ' · רישום על שם החברה') +
        (r.context && r.context.financing_required ? ' · מימון' + (r.context.financing_on_private_name ? ' על שם פרטי' : '') : '') + '</div>' +
        '<div class="cl-progress"><div class="bar"><span style="width:' + cpct + '%"></span></div>' +
        '<div class="txt">' + r.customer_done + ' / ' + r.customer_total + ' אומתו' + (r.customer_docs_completed ? ' · <b>כל מסמכי הלקוח אומתו</b>' : '') +
        (r.invoice_gaps && r.invoice_gaps.length ? ' · חסר לחשבונית: ' + E(r.invoice_gaps.join(', ')) : '') + '</div></div>' +
        ci.map(function (it) { return itemHtml(it, editable); }).join('') + '</div>';
    }
    var vi = r.items || [];
    h += '<div class="cl-group"><div class="cl-title">רישוי ומסירה</div>';
    if (!vi.length) h += '<div class="empty small">' + E(r.message_he || 'אין דרישות.') + '</div>';
    else {
      var pct = r.total ? Math.round(100 * r.done / r.total) : 0;
      h += '<div class="cl-progress"><div class="bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="txt">' + r.done + ' / ' + r.total + ' אומתו · הרכב: ' + E(r.vehicle_status_he) + (r.licensing_completed ? ' · <b>הרישוי הושלם</b>' : '') + '</div></div>' +
        vi.map(function (it) { return itemHtml(it, editable); }).join('');
    }
    h += '</div>';
    body.innerHTML = h;
    body.querySelectorAll('.cl-item').forEach(function (row) {
      var rid = row.getAttribute('data-id');
      var sel = row.querySelector('.cl-status');
      if (sel) sel.addEventListener('change', function () { setRequirement(dealId, body, editable, { requirement_id: rid, status: sel.value }); });
      var nb = row.querySelector('.cl-note');
      if (nb) nb.addEventListener('click', function () {
        var cur = row.querySelector('.cl-notes'); var txt = prompt('הערה לדרישה:', cur ? cur.textContent : '');
        if (txt === null) return;
        setRequirement(dealId, body, editable, { requirement_id: rid, notes: txt });
      });
      var ob = row.querySelector('.cl-open');
      if (ob) ob.addEventListener('click', function () { setRequirement(dealId, body, editable, { requirement_id: rid, open_for_upload: true }); });
    });
  }

  function itemHtml(it, editable) {
    return '<div class="cl-item st-' + E(it.status) + '" data-id="' + E(it.id) + '">' +
      '<div class="cl-main"><div class="cl-label">' + E(it.label_he) + (it.is_open_for_upload ? ' <span class="doc open">פתוח ללקוח</span>' : '') + '</div>' +
        (it.description ? '<div class="cl-desc">' + E(it.description) + '</div>' : '') +
        (it.notes ? '<div class="cl-notes">' + E(it.notes) + '</div>' : '') + '</div>' +
      (editable
        ? '<div class="cl-ctl"><select class="small cl-status">' +
            [['missing','חסר'],['received','התקבל'],['verified','אומת']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === it.status ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select><button class="btn-icon cl-note" type="button" title="הערה">✎</button>' +
          (can('open_document_request') && !it.is_open_for_upload && it.key !== 'invoice_details' && it.key !== 'documents_validity' ? '<button class="btn-icon cl-open" type="button" title="לבקש מהלקוח">בקש מהלקוח</button>' : '') + '</div>'
        : '<div class="cl-ctl"><span class="doc">' + E(it.status_he) + '</span></div>') +
    '</div>';
  }

  async function setRequirement(dealId, body, editable, payload) {
    payload.token = session.token;
    var r;
    try { r = await YM.api('/deals/requirement', payload); } catch (err) { r = { ok: false, message_he: err.message }; }
    notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
    loadChecklist(dealId, body, editable);
    if (r.ok && (r.licensing_completed || r.scope === 'customer')) openCardQuiet();
  }

  // רענון שקט של כותרות העסקאות בכרטיס (ספירת מסמכי לקוח) בלי לסגור את ה-checklist הפתוח
  async function openCardQuiet() {
    var r; try { r = await YM.api('/customers/card', { token: session.token, id: state.cardId }); } catch (e) { return; }
    if (!r || r.ok !== true) return;
    state.card = r;
    (r.deals || []).forEach(function (d) {
      var el = document.querySelector('.deal[data-id="' + d.id + '"] .line');
      if (el && d.customer_docs && d.customer_docs.total) {
        el.innerHTML = el.innerHTML.replace(/ · מסמכי לקוח \d+\/\d+/, '') + ' · מסמכי לקוח ' + d.customer_docs.done + '/' + d.customer_docs.total;
      }
    });
    load(false);
  }

  /* ---------- האיזור האישי של הלקוח (ניהול) ----------
     כל הכללים בשרת (customer_portal_admin): איש מכירות — רק הלקוחות שלו; חסימה מנתקת מיד. */
  var portal = { data: null, customerId: null, msg: null };

  async function loadPortal(customerId) {
    var host = document.getElementById('portal-sect');
    if (!host) return;
    portal.customerId = customerId;
    var r;
    try { r = await YM.api('/customers/portal', { token: session.token, customer_id: customerId, action: 'status' }); }
    catch (err) { host.innerHTML = '<h3>האיזור האישי של הלקוח</h3><div class="empty small">' + E(err.message) + '</div>'; return; }
    if (state.cardId !== customerId) return;
    if (r.ok !== true) {
      if (r.error === 'PERMISSION_DENIED') { host.remove(); return; }
      host.innerHTML = '<h3>האיזור האישי של הלקוח</h3><div class="empty small">' + E(r.message_he || 'לא ניתן לטעון.') + '</div>'; return;
    }
    portal.data = r;
    host.innerHTML = portalHtml(r);
    bindPortal(host, r);
    if (portal.msg) { portalMsg(portal.msg.text, portal.msg.kind); portal.msg = null; }
  }

  function portalHtml(r) {
    var c = r.customer, s = r.sessions || {};
    var state1, cls;
    if (c.disabled_at) { state1 = 'הגישה חסומה' + (c.disabled_by ? ' ע"י ' + E(c.disabled_by) : '') + ' · ' + fmtDT(c.disabled_at) + (c.disabled_reason ? ' · ' + E(c.disabled_reason) : ''); cls = 'off'; }
    else if (!c.can_login) { state1 = 'אין מספר טלפון — הלקוח לא יכול להיכנס. יש להשלים טלפון בעריכת הפרטים.'; cls = 'off'; }
    else if (s.active_now) { state1 = 'מחובר עכשיו'; cls = 'on'; }
    else if (s.last_login) { state1 = 'נכנס לאחרונה ' + fmtDT(s.last_seen || s.last_login) + ' · ' + s.total + ' כניסות'; cls = 'on'; }
    else { state1 = 'עוד לא נכנס לאיזור האישי'; cls = 'idle'; }

    var h = '<h3>האיזור האישי של הלקוח</h3><div class="pt-msg" role="status"></div><div class="pt-box">' +
      '<div class="pt-status ' + cls + '"><span class="dot"></span><span>' + state1 + '</span></div>' +
      '<div class="pt-link"><span class="ltr">' + E(r.portal_url) + '</span> · כניסה עם ' + E(c.phone_he || 'הטלפון של הלקוח') + ' וקוד חד-פעמי</div>';

    // פעולות
    h += '<div class="actions">';
    if (!c.disabled_at && c.can_login) {
      h += '<button class="btn-primary small" type="button" data-pt="invite-wa">שליחת הזמנה בוואטסאפ</button>' +
           '<button class="btn-ghost small" type="button" data-pt="invite-email"' + (c.invoice_email ? '' : ' disabled title="אין ללקוח מייל"') + '>הזמנה במייל</button>';
      (r.end_users || []).forEach(function (u) {
        h += '<button class="btn-ghost small" type="button" data-pt="invite-eu" data-deal="' + E(u.deal_id) + '">הזמנה לנהג בפועל (' + E(u.name) + ')</button>';
      });
    }
    h += '<button class="btn-ghost small" type="button" data-pt="copy">העתקת הקישור</button>';
    if (s.open) h += '<button class="btn-icon" type="button" data-pt="revoke">ניתוק (' + s.open + ')</button>';
    h += c.disabled_at ? '<button class="btn-icon" type="button" data-pt="enable">פתיחת הגישה</button>'
                       : '<button class="btn-icon danger" type="button" data-pt="disable">חסימת גישה</button>';
    h += '</div></div>';

    // עסקאות: התקדמות + עדכונים
    (r.deals || []).forEach(function (d) {
      h += '<div class="pt-deal" data-deal="' + E(d.id) + '"><div class="pt-deal-head"><b>' + E(d.title) + '</b>' +
        (d.waiting_on_customer ? '<span class="pt-flag">ממתין ללקוח: ' + d.waiting_on_customer + ' מסמכים</span>' : '') +
        (d.agreement_pending ? '<span class="pt-flag">הסכם ממתין לחתימה</span>' : '') + '</div>';
      if (d.journey) h += journeyEditorHtml(d);
      if (!d.closed) {
        h += '<form class="pt-post"><textarea rows="2" maxlength="1500" placeholder="עדכון חופשי ללקוח — יופיע באיזור האישי שלו" required></textarea>' +
          '<div class="pt-post-row"><label class="check"><input type="checkbox" name="notify"' + (portal.data.customer.invoice_email ? '' : ' disabled') + '> לשלוח גם במייל' + (portal.data.customer.invoice_email ? '' : ' (אין מייל)') + '</label>' +
          '<button class="btn-primary small" type="submit">פרסום</button></div></form>';
      }
      var ups = d.updates || [];
      if (ups.length) {
        h += '<div class="pt-updates">' + ups.map(function (u) {
          return '<div class="pt-upd' + (u.hidden ? ' hidden-upd' : '') + '"><div class="t">' + fmtDT(u.at) + (u.by ? ' · ' + E(u.by) : '') +
            (u.notified_via === 'email' ? ' · נשלח במייל' : '') + (u.hidden ? ' · מוסתר מהלקוח' : '') + '</div>' +
            '<div class="b">' + E(u.body) + '</div>' +
            '<button class="linkish" type="button" data-upd="' + E(u.id) + '" data-hidden="' + (u.hidden ? '1' : '0') + '">' + (u.hidden ? 'להציג שוב' : 'הסתרה') + '</button></div>';
        }).join('') + '</div>';
      }
      h += '</div>';
    });

    // מה הלקוח העלה
    var ups2 = r.uploads || [];
    if (ups2.length) {
      h += '<div class="pt-sub">מה הלקוח העלה</div><div class="docs">' + ups2.map(function (x) {
        return '<span class="doc">' + (x.url ? '<a href="' + E(x.url) + '" target="_blank" rel="noopener">' + E(x.label) + '</a>' : E(x.label)) + ' · ' + fmtDate(x.at) + '</span>';
      }).join('') + '</div><div class="pt-hint">אחרי בדיקה — לסמן "אומת" ב-checklist של העסקה.</div>';
    }

    // היסטוריה
    var hist = (r.logins || []).map(function (l) { return { at: l.at, txt: 'כניסה' + (l.is_end_user ? ' (נהג בפועל)' : '') + ' · ' + l.device }; })
      .concat((r.invites || []).map(function (i) { return { at: i.at, txt: 'הזמנה ' + (i.channel === 'email' ? 'במייל' : 'בוואטסאפ') + ' ל-' + (i.to || '') + (i.by ? ' · ע"י ' + i.by : '') }; }))
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 10);
    if (hist.length) {
      h += '<details class="pt-hist"><summary>היסטוריית כניסות והזמנות</summary><div class="timeline">' + hist.map(function (x) {
        return '<div class="tl"><div class="t">' + fmtDT(x.at) + '</div><div>' + E(x.txt) + '</div></div>';
      }).join('') + '</div></details>';
    }
    return h;
  }

  /* ---------- מסלול הלקוח: איש המכירות מעדכן, הלקוח רואה מיד ----------
     תשלום → שיוך → זמן הגעה (אם לא בארץ) → בארץ → התקנות ‖ רישוי → מועד מסירה.
     כל עדכון יוצר הודעה אוטומטית באיזור האישי (ואם סומן — גם מייל). */
  function journeyEditorHtml(d) {
    var j = d.journey, r = j.raw || {}, by = {};
    (j.steps || []).forEach(function (x) { by[x.key] = x; });
    var closed = d.closed;
    var dis = closed ? ' disabled' : '';
    function row(label, state, body) {
      return '<div class="jr-row ' + state + '"><span class="dot"></span><span class="jr-l">' + label + '</span><div class="jr-c">' + body + '</div></div>';
    }
    function sel(cur) {
      return '<select class="small" data-j-status>' + [['', 'לא התחילו'], ['in_progress', 'בתהליך'], ['done', 'הסתיימו']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((cur || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>';
    }
    var h = '<div class="jr-ed"><div class="jr-ed-h">מסלול הלקוח <span>— כל עדכון מופיע ללקוח באיזור האישי</span></div>';

    // 1. תשלום
    h += row('השלמת התשלום', by.payment.state,
      r.payment_completed_at
        ? '<span class="jr-v">הושלם ' + fmtDate(r.payment_completed_at) + '</span><button class="linkish" type="button" data-j="payment" data-done="0"' + dis + '>ביטול הסימון</button>'
        : '<span class="jr-v">' + (r.balance > 0 ? 'יתרה ' + YM.nis(r.balance) : 'לא סומן') + '</span><button class="btn-ghost small" type="button" data-j="payment" data-done="1"' + dis + '>התשלום הושלם</button>');
    // 2. שיוך
    h += row('שיוך הרכב', by.assigned.state, '<span class="jr-v">' + (r.has_vehicle ? 'שויך · ' + E(r.vehicle_status_he || '') : 'לא שויך רכב — משייכים בעריכת העסקה') + '</span>');
    // 3. זמן הגעה (רק לרכב שלא בארץ)
    if (by.transit) {
      h += row('זמן הגעה משוער', by.transit.state, j.in_israel
        ? '<span class="jr-v">' + (r.arrival_eta ? 'היה משוער ל-' + fmtDate(r.arrival_eta) : '—') + '</span>'
        : '<input type="date" class="small" data-j-date value="' + E(r.arrival_eta || '') + '"' + dis + '><button class="btn-ghost small" type="button" data-j="eta"' + dis + '>' + (r.arrival_eta ? 'עדכון' : 'שמירה') + '</button>');
    }
    // 4. בארץ
    h += row('הרכב בארץ', by.arrived.state, j.in_israel
      ? '<span class="jr-v">' + (r.arrived_israel_at ? 'סומן ' + fmtDate(r.arrived_israel_at) : 'לפי סטטוס הרכב במלאי') + '</span>' +
        (r.arrived_israel_at ? '<button class="linkish" type="button" data-j="arrived" data-done="0"' + dis + '>ביטול הסימון</button>' : '')
      : '<button class="btn-ghost small" type="button" data-j="arrived" data-done="1"' + (r.has_vehicle && !closed ? '' : ' disabled') + '>הרכב הגיע לארץ</button>');
    // 5+6. במקביל
    h += row('התקנות', by.install.state, sel(r.install_status) +
      '<input type="text" class="small grow" data-j-note maxlength="300" placeholder="מה מותקן / צפי (מוצג ללקוח)" value="' + E(r.install_note || '') + '"' + dis + '>' +
      '<button class="btn-ghost small" type="button" data-j="install"' + dis + '>שמירה</button>');
    h += row('הוצאת רישיון', by.license.state, sel(r.license_status) +
      (r.licensing_completed ? '<span class="jr-v">צ׳קליסט הרישוי הושלם</span>' : '') +
      '<button class="btn-ghost small" type="button" data-j="license"' + dis + '>שמירה</button>');
    // 7. מסירה
    var dt = r.delivery_at ? toLocalInput(r.delivery_at) : '';
    h += row('מועד מסירה', by.delivery.state,
      '<input type="datetime-local" class="small" data-j-at value="' + E(dt) + '"' + dis + '>' +
      '<input type="text" class="small grow" data-j-place maxlength="200" placeholder="מקום / הערה (מוצג ללקוח)" value="' + E(r.delivery_note || '') + '"' + dis + '>' +
      '<button class="btn-ghost small" type="button" data-j="delivery"' + dis + '>' + (r.delivery_at ? 'עדכון' : 'קביעה') + '</button>' +
      (r.delivery_at ? '<button class="linkish" type="button" data-j="delivery-clear"' + dis + '>ביטול</button>' : ''));

    if (!closed) {
      h += '<div class="jr-opts"><input type="text" class="small grow" data-j-msg maxlength="1000" placeholder="תוספת להודעה ללקוח (לא חובה)">' +
        '<label class="check"><input type="checkbox" data-j-mail' + (portal.data.customer.invoice_email ? '' : ' disabled') + '> גם במייל' +
        (portal.data.customer.invoice_email ? '' : ' (אין מייל)') + '</label></div>';
    }
    return h + '</div>';
  }

  function toLocalInput(iso) {
    var d = new Date(iso), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function bindJourney(ed) {
    var dealId = ed.closest('.pt-deal').getAttribute('data-deal');
    ed.querySelectorAll('[data-j]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var row = b.closest('.jr-row'), step = b.getAttribute('data-j');
        var msg = ed.querySelector('[data-j-msg]'), mail = ed.querySelector('[data-j-mail]');
        var p = { action: 'journey', deal_id: dealId, message: msg ? msg.value.trim() : '', notify: mail && mail.checked ? 'email' : null };
        if (step === 'payment' || step === 'arrived') { p.step = step; p.done = b.getAttribute('data-done') === '1'; }
        else if (step === 'eta') {
          var dv = row.querySelector('[data-j-date]').value;
          if (!dv) { portalMsg('בחרו תאריך הגעה משוער.', 'err'); return; }
          p.step = 'eta'; p.value = dv;
        } else if (step === 'install' || step === 'license') {
          p.step = step; p.status = row.querySelector('[data-j-status]').value || null;
          if (step === 'install') p.note = row.querySelector('[data-j-note]').value;
        } else if (step === 'delivery' || step === 'delivery-clear') {
          var at = step === 'delivery' ? row.querySelector('[data-j-at]').value : '';
          if (step === 'delivery' && !at) { portalMsg('בחרו תאריך ושעה למסירה.', 'err'); return; }
          p.step = 'delivery'; p.at = at ? new Date(at).toISOString() : null;
          p.note = step === 'delivery' ? row.querySelector('[data-j-place]').value : '';
        }
        var res = await portalAction(p, b);
        if (res.ok) loadPortal(portal.customerId);
      });
    });
  }

  async function portalAction(payload, btn) {
    if (btn) btn.disabled = true;
    var r;
    try { r = await YM.api('/customers/portal', Object.assign({ token: session.token, customer_id: portal.customerId }, payload)); }
    catch (err) { r = { ok: false, message_he: err.message }; }
    if (btn) btn.disabled = false;
    var text = r.message_he || (r.ok ? 'בוצע.' : 'הפעולה נכשלה.'), kind = r.ok && !r.email_failed ? 'ok' : 'err';
    if (r.ok) portal.msg = { text: text, kind: kind };   // יוצג אחרי הרענון
    else portalMsg(text, kind);
    return r;
  }
  function portalMsg(text, kind) {
    var el = document.querySelector('#portal-sect .pt-msg');
    if (!el) { notice(text, kind); return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 6000);
  }

  function bindPortal(host, r) {
    host.querySelectorAll('[data-pt]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var act = b.getAttribute('data-pt'), res;
        if (act === 'invite-wa' || act === 'invite-eu') {
          // חלון נפתח מיד (בתוך הלחיצה) כדי שהדפדפן לא יחסום אותו; הכתובת נקבעת אחרי תשובת השרת
          var w = window.open('', '_blank');
          res = await portalAction({ action: 'invite', channel: 'whatsapp', end_user_deal_id: b.getAttribute('data-deal') || null }, b);
          if (res.ok && res.wa_phone) {
            var url = 'https://wa.me/' + res.wa_phone + '?text=' + encodeURIComponent(res.wa_text);
            if (w) w.location.href = url; else location.href = url;
          } else if (w) w.close();
        } else if (act === 'invite-email') {
          if (!confirm('לשלוח ללקוח מייל עם הקישור לאיזור האישי?')) return;
          res = await portalAction({ action: 'invite', channel: 'email' }, b);
        } else if (act === 'copy') {
          try { await navigator.clipboard.writeText(r.portal_url); portalMsg('הקישור הועתק.', 'ok'); } catch (e) { prompt('העתיקו את הקישור:', r.portal_url); }
          return;
        } else if (act === 'revoke') {
          if (!confirm('לנתק את הלקוח מהאיזור האישי? הוא יוכל להיכנס שוב עם קוד חדש.')) return;
          res = await portalAction({ action: 'revoke_sessions' }, b);
        } else if (act === 'disable') {
          var reason = prompt('חסימת הגישה של הלקוח לאיזור האישי. הלקוח ינותק מיד ולא יקבל קוד כניסה.\nסיבה (לא חובה, לא מוצגת ללקוח):', '');
          if (reason === null) return;
          res = await portalAction({ action: 'set_access', enabled: false, reason: reason }, b);
        } else if (act === 'enable') {
          res = await portalAction({ action: 'set_access', enabled: true }, b);
        }
        if (res && res.ok) loadPortal(portal.customerId);
      });
    });
    host.querySelectorAll('.jr-ed').forEach(bindJourney);
    host.querySelectorAll('.pt-post').forEach(function (f) {
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        var dealId = f.closest('.pt-deal').getAttribute('data-deal'), ta = f.querySelector('textarea');
        var body = ta.value.trim();
        if (body.length < 2) { portalMsg('כתבו את העדכון.', 'err'); return; }
        var res = await portalAction({ action: 'post_update', deal_id: dealId, body: body, notify: f.notify.checked ? 'email' : null }, f.querySelector('button'));
        if (res.ok) loadPortal(portal.customerId);
      });
    });
    host.querySelectorAll('[data-upd]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var hidden = b.getAttribute('data-hidden') === '1';
        var res = await portalAction({ action: 'hide_update', update_id: b.getAttribute('data-upd'), hidden: !hidden }, b);
        if (res.ok) loadPortal(portal.customerId);
      });
    });
  }

  /* ---------- העלאת קבצים ל-Drive ---------- */
  var fileInput = document.getElementById('file-input');
  var pendingUpload = null;
  function pickFile(ctx) { pendingUpload = ctx; fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !pendingUpload) return;
    if (f.size > 15 * 1024 * 1024) { notice('הקובץ גדול מדי (עד 15MB).', 'err'); return; }
    notice('מעלה את "' + f.name + '"…', 'info');
    var fd = new FormData();
    fd.append('token', session.token);
    fd.append('scope', pendingUpload.scope);
    fd.append('target_id', pendingUpload.target_id);
    if (pendingUpload.document_id) fd.append('document_id', pendingUpload.document_id);
    fd.append('doc_type', pendingUpload.doc_type);
    fd.append('file', f, f.name);
    var r;
    try {
      var resp = await fetch(YM.API_BASE + '/documents/upload', { method: 'POST', body: fd });
      r = await resp.json().catch(function () { return { ok: false, message_he: 'תשובה לא תקינה מהשרת.' }; });
    } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    notice(r.message_he || (r.ok ? 'הועלה.' : 'ההעלאה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) {
      var knownChecks = ((state.card && state.card.id_checks) || []).map(function (k) { return k.id; });
      openCard(state.cardId); load(false);
      if (['id_card', 'drivers_license', 'company_registration'].indexOf(pendingUpload.doc_type) > -1) {
        notice('התעודה הועלתה. סורקים אותה ומשווים לכרטיס — התוצאה תופיע בעוד כמה שניות.', 'ok');
        watchIdChecks(state.cardId, knownChecks);
      }
    }
    pendingUpload = null;
  });

  /* ---------- חלונות ---------- */
  function show(id) { document.getElementById(id).hidden = false; }
  function hide(id) { document.getElementById(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { hide(b.getAttribute('data-close')); });
  });
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; });
  });

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function fmtDT(iso) { return iso ? fmtDate(iso) + ' ' + YM.hhmm(new Date(iso)) : '—'; }

  var searchTimer;
  document.getElementById('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var v = e.target.value.trim();
    searchTimer = setTimeout(function () { state.q = v; load(false); }, 280);
  });
  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });
})();
