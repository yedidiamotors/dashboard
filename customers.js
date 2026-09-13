/* ============================================================
   ידידיה מוטורס — לקוחות ועסקאות
   כל הלוגיקה (כפילויות, כלל 2.1 לשיוך רכב, הרשאות) בשרת.
   המסך מציג את מה שהגיע ומעביר פעולות ל-n8n → Supabase.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }
  var perms = session.permissions || [];
  var can = function (k) { return perms.indexOf(k) > -1; };

  var state = { rows: [], total: 0, q: '', type: '', loading: false, card: null, cardId: null };
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
      res = await YM.api('/customers/list', { token: session.token, q: state.q, type: state.type || null, limit: 100 });
    } catch (err) {
      state.loading = false;
      if (first) bootError(err.message); else notice(err.message, 'err');
      return;
    }
    state.loading = false;
    if (res.ok !== true) {
      if (res.__status === 401 || ['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE','SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession(); location.replace('login.html'); return;
      }
      if (first) bootError(res.message_he || 'טעינת הלקוחות נכשלה.'); else notice(res.message_he, 'err');
      return;
    }
    state.rows = res.customers || [];
    state.total = res.total || 0;
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
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 4500);
  }

  function render() {
    YM.renderNav('nav', 'customers.html', perms);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);
    document.getElementById('meta-line').textContent = state.total + ' לקוחות' + (state.q ? ' · חיפוש: ' + state.q : '');

    var open = state.rows.reduce(function (s, c) { return s + (Number(c.deals_open) || 0); }, 0);
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box"><div class="label">לקוחות</div><div class="stat-figure">' + state.total + '</div>' +
      '<div class="stat-note">' + open + ' עסקאות פתוחות</div></div>';

    var tf = document.getElementById('type-filters');
    tf.innerHTML = TYPES.map(function (t) {
      return '<button class="chip' + (state.type === t.key ? ' is-active' : '') + '" type="button" data-type="' + t.key + '">' + t.label + '</button>';
    }).join('');
    tf.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () { state.type = c.getAttribute('data-type'); load(false); });
    });
    renderRows();
    if (!leads.loaded) loadLeads();
  }

  /* ---------- לידים מהאתר ---------- */
  async function loadLeads() {
    var r;
    try { r = await YM.api('/leads/list', { token: session.token, status: leads.filter || null, limit: 200 }); }
    catch (err) { document.getElementById('lead-rows').innerHTML = '<div class="empty">' + E(err.message) + '</div>'; return; }
    if (r.ok !== true) { document.getElementById('lead-rows').innerHTML = '<div class="empty">' + E(r.message_he || 'טעינת הלידים נכשלה.') + '</div>'; return; }
    leads.rows = r.leads || []; leads.counts = r.counts || {}; leads.loaded = true;
    var open = (Number(leads.counts.new) || 0) + (Number(leads.counts.contacted) || 0);
    var badge = document.getElementById('leads-count');
    badge.textContent = open; badge.hidden = !open;
    renderLeadFilters();
    renderLeads();
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
        '<div class="ltr l-phone">' + E(YM.phoneHe(l.phone)) + '</div>' +
        '<div class="l-int">' + E(interest || '—') + (l.source ? '<div class="l-sub">' + E(l.source) + '</div>' : '') + '</div>' +
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
      host.innerHTML = '<div class="empty">' + (state.q || state.type ? 'לא נמצאו לקוחות התואמים לחיפוש.' : 'עדיין אין לקוחות. פתחו את הראשון בכפתור "לקוח חדש".') + '</div>';
      document.getElementById('foot').innerHTML = '';
      return;
    }
    host.innerHTML = state.rows.map(function (c) {
      var last = c.last_deal;
      var lastTxt = last ? (last.vehicle ? E(last.vehicle) + ' · ' : '') + '<span class="deal-status ' + E(last.status) + '">' + E(last.status_he) + '</span>' : '<span class="c-sub">—</span>';
      var idTxt = c.customer_type === 'company' ? (c.company_reg_number ? 'ח.פ ' + c.company_reg_number : '—') : (c.id_number || '—');
      return '<div class="cust-row" data-id="' + E(c.id) + '">' +
        '<div><div class="c-name">' + E(c.name) + (c.customer_type === 'company' ? '<span class="badge company">חברה</span>' : '') +
          (c.needs_contact_details ? '<span class="badge missing">חסרים פרטי קשר</span>' : '') + '</div>' +
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
    var res;
    try { res = await YM.api('/customers/card', { token: session.token, id: id }); }
    catch (err) { document.getElementById('card-body').innerHTML = '<div class="empty">' + E(err.message) + '</div>'; return; }
    if (res.ok !== true) { document.getElementById('card-body').innerHTML = '<div class="empty">' + E(res.message_he || 'לא ניתן להציג את הלקוח.') + '</div>'; return; }
    state.card = res;
    document.getElementById('card-body').innerHTML = cardHtml(res);
    bindCard(res);
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
      (c.invoice_gaps && c.invoice_gaps.length ? '<div class="gap-note">חסר לחשבונית: ' + E(c.invoice_gaps.join(', ')) + ' — <button class="linkish" type="button" id="card-fix-invoice">להשלים</button></div>' : '') + '</div>';

    h += '<div class="card-tools">' +
      '<button class="btn-primary small" type="button" id="card-new-deal">עסקה חדשה</button>' +
      '<button class="btn-ghost small" type="button" id="card-edit">עריכת פרטים</button></div>';

    h += '<div class="sect"><h3>עסקאות (' + deals.length + ')</h3>';
    if (!deals.length) h += '<div class="empty small">אין עסקאות עדיין.</div>';
    deals.forEach(function (d) { h += dealHtml(d, res.viewer); });
    h += '</div>';

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
        (!d.end_user_same_as_customer && d.end_user_name ? ' · נהג בפועל: ' + E(d.end_user_name) + (d.end_user_phone ? ' ' + E(YM.phoneHe(d.end_user_phone)) : '') : '') +
        (d.financing_required ? ' · במימון' + (d.financing_on_private_name ? ' (על שם פרטי)' : '') : '') +
        (d.customer_docs && d.customer_docs.total ? ' · מסמכי לקוח ' + d.customer_docs.done + '/' + d.customer_docs.total : '') + '</div>';
    h += ownerHtml(d);
    var docs = d.documents || [];
    h += '<div class="docs">' + docs.map(function (x) {
      var open = x.is_open_for_upload && !x.drive_url;
      return '<span class="doc' + (open ? ' open' : '') + '">' + (x.drive_url ? '<a href="' + E(x.drive_url) + '" target="_blank" rel="noopener">' + E(x.doc_type_he) + '</a>' : E(x.doc_type_he)) +
        (open ? ' · ממתין להעלאה' + (mine && !closed ? ' <button class="doc-up" type="button" data-doc="' + E(x.id) + '" data-type="' + E(x.doc_type) + '">העלאה</button>' : '') : '') + '</span>';
    }).join('') + '</div>';
    h += termsHtml(d, mine, closed);
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

  /* ---------- תנאים מסחריים והסכם מכירה ---------- */
  function termsHtml(d, mine, closed) {
    var t = d.terms || {}, b = t.breakdown || {};
    var has = t.sale_price != null;
    var rows = has ? [
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
      '</div>';
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

  function bindCard(res) {
    var body = document.getElementById('card-body');
    var cdocUp = document.getElementById('cdoc-up');
    if (cdocUp) cdocUp.addEventListener('click', function () {
      pickFile({ scope: 'customer', target_id: res.customer.id, document_id: null, doc_type: document.getElementById('cdoc-type').value });
    });
    var newDeal = document.getElementById('card-new-deal');
    if (newDeal) newDeal.addEventListener('click', function () { openDealForm(res.customer, null); });
    var edit = document.getElementById('card-edit');
    if (edit) edit.addEventListener('click', function () { openCustomerForm(res.customer); });
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

  async function saveCustomer(force) {
    var btn = document.getElementById('customer-save');
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
    if (r.error === 'DUPLICATE') { renderDup(r.candidates || []); return; }
    var box = document.getElementById('dup-box');
    box.hidden = false; box.className = 'banner';
    box.textContent = r.message_he || 'השמירה נכשלה.';
  }

  function renderDup(list) {
    var box = document.getElementById('dup-box');
    box.hidden = false; box.className = 'dup-box';
    box.innerHTML = '<div>נמצא לקוח קיים עם אותו טלפון או מספר זיהוי:</div>' + list.map(function (c) {
      return '<div class="list-row"><div class="lines"><span class="t">' + E(c.name) + '</span><span class="s">' + E(YM.phoneHe(c.phone)) +
        (c.id_number ? ' · ' + E(c.id_number) : '') + '</span></div>' +
        '<div class="row-actions"><button class="btn-icon" type="button" data-open="' + E(c.id) + '">פתח את הלקוח הקיים</button></div></div>';
    }).join('') + '<div class="row-actions"><button class="btn-icon danger" type="button" id="dup-force">צור בכל זאת לקוח נפרד</button></div>';
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
    document.getElementById('dup-force').addEventListener('click', function () { saveCustomer(true); });
  }

  /* ---------- טופס עסקה ---------- */
  var dForm = document.getElementById('deal-form');
  var dealEditId = null;
  var pickTimer;

  var dealCustomer = null;
  function syncDealHints() {
    document.getElementById('end-user-fields').hidden = dForm.end_user_same_as_customer.checked;
    document.getElementById('fin-private-wrap').hidden = !dForm.financing_required.checked;
    if (!dForm.financing_required.checked) dForm.financing_on_private_name.checked = false;
    var c = dealCustomer || {};
    var priv = c.customer_type === 'individual' || !dForm.end_user_same_as_customer.checked;
    var who = dForm.end_user_same_as_customer.checked ? (c.customer_type === 'company' ? 'החברה (' + (c.name || '') + ')' : 'הלקוח (' + (c.name || '') + ')') : 'הנהג בפועל (אדם פרטי)';
    var need = ['פרטים לחשבונית'];
    if (c.customer_type === 'company') need.push('אישור בעלי מניות + מורשה חתימה');
    if (priv) need.push('צילום ת.ז של מי שהרכב נרשם על שמו');
    if (dForm.financing_required.checked && dForm.financing_on_private_name.checked) need.push('ת.ז שני צדדים, רישיון נהיגה, ספח, פרטי אשראי');
    need.push('בדיקת תוקף התעודות');
    document.getElementById('reg-hint').textContent = 'הרכב יירשם על שם: ' + who + '. מסמכים שייפתחו ב-checklist: ' + need.join(' · ') + '.';
  }
  dForm.end_user_same_as_customer.addEventListener('change', syncDealHints);
  dForm.financing_required.addEventListener('change', syncDealHints);
  dForm.financing_on_private_name.addEventListener('change', syncDealHints);

  function openDealForm(customer, deal) {
    dForm.reset();
    dealEditId = deal ? deal.id : null;
    dForm.customer_id.value = customer.id;
    document.getElementById('deal-modal-title').textContent = deal ? 'שיוך רכב לעסקה' : 'עסקה חדשה';
    document.getElementById('deal-customer-line').textContent = 'לקוח: ' + customer.name + ' · ' + YM.phoneHe(customer.phone);
    document.getElementById('deal-save').textContent = deal ? 'שמירה' : 'פתיחת עסקה';
    dealCustomer = customer;
    if (deal) {
      dForm.end_user_same_as_customer.checked = deal.end_user_same_as_customer !== false;
      dForm.end_user_name.value = deal.end_user_name || ''; dForm.end_user_phone.value = deal.end_user_phone ? YM.phoneHe(deal.end_user_phone) : '';
      dForm.end_user_id_number.value = deal.end_user_id_number || '';
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
    var payload = {
      id: dealEditId, customer_id: dForm.customer_id.value,
      end_user_same_as_customer: dForm.end_user_same_as_customer.checked,
      end_user_name: dForm.end_user_name.value, end_user_phone: dForm.end_user_phone.value, end_user_id_number: dForm.end_user_id_number.value,
      vehicle_file_id: dForm.vehicle_file_id.value || null,
      financing_required: dForm.financing_required.checked, financing_on_private_name: dForm.financing_on_private_name.checked,
      sale_price: dForm.sale_price.value ? Number(String(dForm.sale_price.value).replace(/[^\d.]/g, '')) : null
    };
    btn.disabled = true; btn.textContent = 'שומר…';
    var r;
    try { r = await YM.api('/deals/save', { token: session.token, deal: payload }); }
    catch (err) { r = { ok: false, message_he: err.message }; }
    btn.disabled = false; btn.textContent = dealEditId ? 'שמירה' : 'פתיחת עסקה';
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
    if (r.ok) { openCard(state.cardId); load(false); }
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
