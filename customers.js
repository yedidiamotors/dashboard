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
  }

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
        '<div><div class="c-name">' + E(c.name) + (c.customer_type === 'company' ? '<span class="badge company">חברה</span>' : '') + '</div>' +
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
      (c.company_reg_number ? '<span class="tag">ח.פ ' + E(c.company_reg_number) + '</span>' : '') + '</div></div>';

    h += '<div class="card-tools">' +
      '<button class="btn-primary small" type="button" id="card-new-deal">עסקה חדשה</button>' +
      '<button class="btn-ghost small" type="button" id="card-edit">עריכת פרטים</button></div>';

    h += '<div class="sect"><h3>עסקאות (' + deals.length + ')</h3>';
    if (!deals.length) h += '<div class="empty small">אין עסקאות עדיין.</div>';
    deals.forEach(function (d) { h += dealHtml(d, res.viewer); });
    h += '</div>';

    h += '<div class="sect"><h3>מסמכי לקוח קבועים</h3>' +
      (docs.length ? '<div class="docs">' + docs.map(function (x) {
        return '<span class="doc">' + (x.drive_url ? '<a href="' + E(x.drive_url) + '" target="_blank" rel="noopener">' + E(x.doc_type_he) + '</a>' : E(x.doc_type_he)) +
          (x.expires_at ? ' · עד ' + E(x.expires_at) : '') + '</span>';
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
        (!d.end_user_same_as_customer && d.end_user_name ? ' · נהג בפועל: ' + E(d.end_user_name) + (d.end_user_phone ? ' ' + E(YM.phoneHe(d.end_user_phone)) : '') : '') + '</div>';
    var docs = d.documents || [];
    h += '<div class="docs">' + docs.map(function (x) {
      var open = x.is_open_for_upload && !x.drive_url;
      return '<span class="doc' + (open ? ' open' : '') + '">' + (x.drive_url ? '<a href="' + E(x.drive_url) + '" target="_blank" rel="noopener">' + E(x.doc_type_he) + '</a>' : E(x.doc_type_he)) +
        (open ? ' · ממתין להעלאה' + (mine && !closed ? ' <button class="doc-up" type="button" data-doc="' + E(x.id) + '" data-type="' + E(x.doc_type) + '">העלאה</button>' : '') : '') + '</span>';
    }).join('') + '</div>';
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

    body.querySelectorAll('.deal').forEach(function (el) {
      var id = el.getAttribute('data-id');
      var sel = el.querySelector('.deal-status-sel');
      if (sel) sel.addEventListener('change', async function () {
        var st = sel.value;
        if ((st === 'cancelled' || st === 'completed') && !confirm(st === 'cancelled' ? 'לבטל את העסקה? הרכב ישוחרר חזרה למלאי.' : 'לסמן את העסקה כהושלמה? הרכב יסומן כנמסר.')) { openCard(state.cardId); return; }
        sel.disabled = true;
        var r = await YM.api('/deals/status', { token: session.token, deal_id: id, status: st });
        notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
        openCard(state.cardId); load(false);
      });
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
      var assign = el.querySelector('.deal-assign');
      if (assign) assign.addEventListener('click', function () {
        var d = (res.deals || []).filter(function (x) { return x.id === id; })[0];
        openDealForm(res.customer, d);
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

  function openCustomerForm(c) {
    cForm.reset();
    document.getElementById('dup-box').hidden = true;
    cForm.id.value = c ? c.id : '';
    document.getElementById('customer-modal-title').textContent = c ? 'עריכת לקוח' : 'לקוח חדש';
    setCustomerType(c ? c.customer_type : 'individual');
    if (c) {
      cForm.full_name.value = c.full_name || ''; cForm.company_name.value = c.company_name || '';
      cForm.contact_person.value = c.contact_person || ''; cForm.phone.value = YM.phoneHe(c.phone) || '';
      cForm.id_number.value = c.id_number || ''; cForm.company_reg_number.value = c.company_reg_number || '';
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
      phone: cForm.phone.value, id_number: cForm.id_number.value, company_reg_number: cForm.company_reg_number.value, force: force
    };
    btn.disabled = true; btn.textContent = 'שומר…';
    var r;
    try { r = await YM.api('/customers/save', { token: session.token, customer: payload }); }
    catch (err) { r = { ok: false, message_he: err.message }; }
    btn.disabled = false; btn.textContent = 'שמירה';
    if (r.ok) {
      hide('customer-modal');
      notice(payload.id ? 'פרטי הלקוח עודכנו.' : 'הלקוח נוצר.', 'ok');
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
      b.addEventListener('click', function () { hide('customer-modal'); openCard(b.getAttribute('data-open')); });
    });
    document.getElementById('dup-force').addEventListener('click', function () { saveCustomer(true); });
  }

  /* ---------- טופס עסקה ---------- */
  var dForm = document.getElementById('deal-form');
  var dealEditId = null;
  var pickTimer;

  dForm.end_user_same_as_customer.addEventListener('change', function () {
    document.getElementById('end-user-fields').hidden = dForm.end_user_same_as_customer.checked;
  });

  function openDealForm(customer, deal) {
    dForm.reset();
    dealEditId = deal ? deal.id : null;
    dForm.customer_id.value = customer.id;
    document.getElementById('deal-modal-title').textContent = deal ? 'שיוך רכב לעסקה' : 'עסקה חדשה';
    document.getElementById('deal-customer-line').textContent = 'לקוח: ' + customer.name + ' · ' + YM.phoneHe(customer.phone);
    document.getElementById('deal-save').textContent = deal ? 'שמירה' : 'פתיחת עסקה';
    if (deal) {
      dForm.end_user_same_as_customer.checked = deal.end_user_same_as_customer !== false;
      dForm.end_user_name.value = deal.end_user_name || ''; dForm.end_user_phone.value = deal.end_user_phone ? YM.phoneHe(deal.end_user_phone) : '';
      dForm.end_user_id_number.value = deal.end_user_id_number || '';
    }
    document.getElementById('end-user-fields').hidden = dForm.end_user_same_as_customer.checked;
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
