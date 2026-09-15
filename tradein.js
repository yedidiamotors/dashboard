/* ============================================================
   ידידיה מוטורס — טרייד-אין
   מנהל המכירות פותח רכב, איש המכירות משלים פרטים ומעלה רישיון רכב,
   ומנהל הרכש קובע את המחירים. כל ההרשאות נבדקות בשרת.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var PAGE = 50;
  var state = { rows: [], total: 0, offset: 0, q: '', status: '', statuses: [], viewer: {}, loading: false };

  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }

  load(true);

  /* ---------- טעינה ---------- */
  async function load(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) state.offset = 0;

    var res;
    try {
      res = await YM.api('/trade-in/list', {
        token: session.token, q: state.q, status: state.status,
        limit: PAGE, offset: state.offset
      });
    } catch (err) {
      state.loading = false;
      if (reset) bootError(err.message); else notice(err.message, 'err');
      return;
    }
    state.loading = false;

    if (res.ok !== true) {
      if (res.__status === 401 || ['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE',
                                   'SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession(); location.replace('login.html'); return;
      }
      var msg = res.message_he || 'טעינת רכבי הטרייד-אין נכשלה.';
      if (reset) bootError(msg); else notice(msg, 'err');
      return;
    }

    state.rows     = reset ? (res.vehicles || []) : state.rows.concat(res.vehicles || []);
    state.total    = res.total || 0;
    state.statuses = res.statuses || [];
    state.viewer   = res.viewer || {};

    render();
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
  }

  function bootError(text) {
    var boot = document.getElementById('boot');
    boot.innerHTML = '<div class="mark">YEDIDIA MOTORS</div>' +
      '<div class="msg">' + E(text) + '</div>' +
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

  /* ---------- תצוגה ---------- */
  function render() {
    YM.renderNav('nav', 'tradein.html', session.permissions || []);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);
    document.getElementById('meta-line').textContent =
      state.total + ' רכבים · ' + (state.viewer.can_see_prices ? 'כולל מחירים' : 'ללא מחירים');
    document.getElementById('new-ti').hidden = !state.viewer.can_create;

    var inStock = (state.statuses.filter(function (s) { return s.key === 'in_stock'; })[0] || {}).units || 0;
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box">' +
        '<div class="label">טרייד-אין במלאי</div>' +
        '<div class="stat-figure">' + inStock + '</div>' +
        '<div class="stat-note">' + state.total + ' רכבים בסך הכול</div>' +
      '</div>';

    var sEl = document.getElementById('status-filters');
    sEl.innerHTML = chip('הכל', '', state.status === '') +
      state.statuses.map(function (s) {
        return chip(s.label_he + ' · ' + s.units, s.key, state.status === s.key);
      }).join('');
    sEl.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        state.status = c.getAttribute('data-val'); load(true);
      });
    });

    renderRows();
  }

  function chip(label, val, active) {
    return '<button class="chip' + (active ? ' is-active' : '') +
      '" type="button" data-val="' + E(val) + '">' + E(label) + '</button>';
  }

  function renderRows() {
    var host = document.getElementById('rows');
    if (!state.rows.length) {
      host.innerHTML = '<div class="empty">' +
        (state.q || state.status ? 'לא נמצאו רכבים התואמים לסינון.' : 'אין עדיין רכבי טרייד-אין.') + '</div>';
      document.getElementById('foot').innerHTML = '';
      return;
    }

    host.innerHTML = state.rows.map(function (v) {
      var gaps = v.gaps || [];
      var meta = [v.model_year, v.color, v.seller, v.status_he].filter(Boolean).join(' · ');
      return '<div class="ti-row" data-id="' + E(v.id) + '">' +
        '<div class="names">' +
          '<div class="model">' + E(v.title || '—') + '</div>' +
          '<div class="trim">' + E(v.color || '—') +
            (gaps.length ? ' <span class="gap-flag">חסר: ' + E(gaps.join(', ')) + '</span>' : '') + '</div>' +
          '<div class="ti-meta">' + E(meta) + '</div>' +
        '</div>' +
        '<div class="cell ltr c-plate">' + E(v.plate || '—') + '</div>' +
        '<div class="cell c-year">' + E(v.model_year || '—') + '</div>' +
        '<div class="cell c-km">' + (v.mileage_km != null ? Number(v.mileage_km).toLocaleString('en-US') : '—') + '</div>' +
        '<div class="cell c-hand">' + (v.ownership_hand ? 'יד ' + v.ownership_hand : '—') + '</div>' +
        '<div class="cell c-seller">' + E(v.seller || '—') + '</div>' +
        '<div class="price c-price">' + (v.resale_price != null ? E(YM.nis(v.resale_price)) : '—') + '</div>' +
        '<div class="c-status"><span class="status-pill">' + E(v.status_he) + '</span>' +
          (v.published_on_website ? '<span class="tag mini">באתר</span>' : '') + '</div>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.ti-row').forEach(function (r) {
      r.addEventListener('click', function () { openCard(r.getAttribute('data-id')); });
    });

    var shown = state.rows.length;
    document.getElementById('foot').innerHTML =
      'מוצגים ' + shown + ' מתוך ' + state.total +
      (shown < state.total
        ? '<button class="load-more" type="button" id="more" style="margin-top:10px">טעינת עוד ' +
          Math.min(PAGE, state.total - shown) + '</button>'
        : '');
    var more = document.getElementById('more');
    if (more) more.addEventListener('click', function () {
      more.disabled = true; more.textContent = 'טוען…';
      state.offset = state.rows.length; load(false);
    });
  }

  /* ---------- כרטיס הרכב ---------- */
  var cardId = null, card = null;

  async function openCard(id) {
    cardId = id; card = null;
    document.getElementById('card-body').innerHTML = '<div class="empty">טוען…</div>';
    document.getElementById('modal').hidden = false;

    var res;
    try { res = await YM.api('/trade-in/card', { token: session.token, id: id }); }
    catch (err) { document.getElementById('card-body').innerHTML = '<div class="empty">' + E(err.message) + '</div>'; return; }
    if (res.ok !== true) {
      document.getElementById('card-body').innerHTML =
        '<div class="empty">' + E(res.message_he || 'לא ניתן להציג את הרכב.') + '</div>';
      return;
    }
    card = res;
    document.getElementById('card-body').innerHTML = cardHtml(res);
    bindCard(res);
  }

  var TI_DOCS = [['vehicle_license','רישיון רכב'], ['memorandum','זיכרון דברים'],
                 ['id_copy','צילום תעודת זהות'], ['ownership_transfer_form','טופס העברת בעלות'],
                 ['signed_transfer','העברת בעלות חתומה'], ['levi_report','דוח לוי יצחק'],
                 ['condition_report','דוח מצב הרכב'], ['other','אחר']];

  var STATUSES = [['pending_appraisal','בקליטה והערכה'], ['accepted','אושר'], ['in_stock','במלאי'],
                  ['reserved','שמור ללקוח'], ['resold','נמכר'], ['rejected','נדחה']];

  function cardHtml(res) {
    var t = res.trade_in || {}, v = res.viewer || {}, gaps = res.gaps || [];

    var h = '<div class="card-head-v">' +
      '<h2>' + E(t.title || 'רכב טרייד-אין') + '</h2>' +
      '<div class="sub ltr">' + E(t.license_plate_number || '—') + '</div>' +
      '<div class="tags">' +
        '<span class="status-pill">' + E(t.status_he) + '</span>' +
        (t.model_year ? '<span class="tag">' + E(t.model_year) + '</span>' : '') +
        (t.for_sale ? '<span class="tag">למכירה</span>' : '') +
        (t.published_on_website ? '<span class="tag">מפורסם באתר</span>' : '') +
      '</div></div>';

    if (gaps.length) {
      h += '<div class="banner">כדי להעביר את הרכב למלאי ולמכור אותו חסר: ' + E(gaps.join(' · ')) + '</div>';
    }

    h += section('פרטי הרכב', [
      kv('יצרן ודגם', [t.make, t.model].filter(Boolean).join(' ')),
      kv('גימור', t.trim),
      kv('שנת דגם', t.model_year),
      kv('צבע', t.color),
      kv('מספר שלדה', t.vin),
      kv('יד', t.ownership_hand),
      kv('קילומטראז׳', t.mileage_km != null ? Number(t.mileage_km).toLocaleString('en-US') : null),
      kv('עלה לכביש', fmtDate(t.road_entry_date)),
      kv('טסט עד', fmtDate(t.roadworthiness_test_until)),
      kv('מפתח ספייר', t.has_spare_key === null || t.has_spare_key === undefined ? null : (t.has_spare_key ? 'כן' : 'לא')),
      kv('בעלים רשום', t.registered_owner_name),
      kv('נרכש מ', t.seller),
      kv('נרכש בתאריך', fmtDate(t.purchase_date))
    ]) + (t.condition_notes ? '<p class="note">מצב הרכב: ' + E(t.condition_notes) + '</p>' : '');

    if (v.can_edit) {
      h += '<div class="doc-tools"><button class="btn-icon" type="button" id="ti-edit">עדכון פרטי הרכב</button>' +
        '<span class="note-inline">השלמת הפרטים היא באחריות איש המכירות</span></div>';
    }

    /* מחירים */
    if (v.can_see_prices) {
      h += section('מחירים', [
        kv('מחיר קנייה מהלקוח', t.purchase_price_from_customer != null ? YM.nis(t.purchase_price_from_customer) : null, 'money'),
        kv('מחיר מכירה', t.planned_resale_price != null ? YM.nis(t.planned_resale_price) : null, 'money'),
        kv('מחירון לוי יצחק', t.levi_yitzhak_price != null ? YM.nis(t.levi_yitzhak_price) : null, 'money'),
        kv('תקרת הנחה', t.discount_cap != null ? YM.nis(t.discount_cap) : null, 'money')
      ]);
      if (!t.purchase_price_from_customer && !t.planned_resale_price) {
        h += '<p class="note">המחירים טרם נקבעו. קביעת מחיר היא בסמכות מנהל הרכש בלבד.</p>';
      }
      if (v.can_price) {
        h += '<div class="doc-tools"><button class="btn-icon primary" type="button" id="ti-price">קביעת מחירים</button>' +
          '<span class="note-inline">מנהל רכש</span></div>';
      } else {
        h += '<p class="note">מחירים נקבעים על ידי מנהל הרכש. אם צריך שינוי — פנה אליו.</p>';
      }
    }

    /* מסמכים */
    var docs = res.documents || [];
    var hasLicense = docs.some(function (d) { return d.doc_type === 'vehicle_license'; });
    h += '<div class="sect"><h3>מסמכים (' + docs.length + ')</h3>';
    if (!hasLicense) h += '<p class="note gap-flag">רישיון רכב הוא מסמך חובה ועדיין לא הועלה.</p>';
    h += docs.length
      ? '<div class="docs">' + docs.map(function (d) {
          return '<span class="doc">' +
            (d.drive_url ? '<a href="' + E(d.drive_url) + '" target="_blank" rel="noopener">' + E(d.doc_type_he) + '</a>' : E(d.doc_type_he)) +
            '<span class="m">' + E([fmtDT(d.created_at), d.uploaded_by_name].filter(Boolean).join(' · ')) + '</span></span>';
        }).join('') + '</div>'
      : '<p class="note">אין עדיין מסמכים.</p>';
    if (v.can_edit) {
      h += '<div class="doc-tools"><select id="ti-doc-type" aria-label="סוג מסמך">' +
        TI_DOCS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('') +
        '</select><button class="btn-icon" type="button" id="ti-doc-up">צירוף מסמך</button></div>';
    }
    h += '</div>';

    /* תמונות לאתר — הסדר והתמונה הראשית נקבעים כאן */
    h += '<div class="sect" id="photos-sect"><h3>תמונות לאתר</h3><p class="note">טוען…</p></div>';

    /* עסקה משויכת */
    if (res.deal) {
      h += section('העסקה המשויכת', [
        kv('לקוח', res.deal.customer),
        kv('סטטוס', res.deal.status_he),
        kv('זיכוי בעסקה', res.deal.trade_in_credit != null ? YM.nis(res.deal.trade_in_credit) : null, 'money')
      ]) + '<p class="note">זיכוי הטרייד-אין בעסקה נגזר ממחיר הקנייה שקבע מנהל הרכש.</p>';
    }

    /* פעולות */
    if (v.can_create) {
      h += '<div class="sect"><h3>סטטוס ופרסום</h3><div class="doc-tools">' +
        '<select id="ti-status" aria-label="סטטוס">' + STATUSES.map(function (s) {
          return '<option value="' + s[0] + '"' + (s[0] === t.status ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select>' +
        '<label class="tick"><input type="checkbox" id="ti-forsale"' + (t.for_sale ? ' checked' : '') + '> למכירה</label>' +
        '<label class="tick"><input type="checkbox" id="ti-pub"' + (t.published_on_website ? ' checked' : '') + '> מפורסם באתר</label>' +
        '</div></div>';
    }

    return h;
  }

  function bindCard(res) {
    var t = res.trade_in || {}, v = res.viewer || {};

    YM.photos.open({
      hostId: 'photos-sect', inputId: 'photo-input', token: session.token,
      onError: function (x) { notice(x, 'err'); },
      onToast: function (x) { notice(x, 'ok'); }
    }, { trade_in_id: t.id });

    var ed = document.getElementById('ti-edit');
    if (ed) ed.addEventListener('click', function () { openEdit(t); });

    var pr = document.getElementById('ti-price');
    if (pr) pr.addEventListener('click', function () { openPrice(t); });

    var up = document.getElementById('ti-doc-up');
    if (up) up.addEventListener('click', function () {
      pending = { scope: 'trade_in', target_id: t.id, doc_type: document.getElementById('ti-doc-type').value };
      fileInput.value = ''; fileInput.click();
    });

    var st = document.getElementById('ti-status');
    if (st) st.addEventListener('change', async function () {
      st.disabled = true;
      var r = await YM.api('/trade-in/status', { token: session.token, id: t.id, status: st.value });
      notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
      openCard(cardId); load(true);
    });

    ['ti-forsale', 'ti-pub'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', async function () {
        el.disabled = true;
        var r = await YM.api('/trade-in/publish', {
          token: session.token, id: t.id,
          for_sale: document.getElementById('ti-forsale').checked,
          published_on_website: document.getElementById('ti-pub').checked
        });
        notice(r.message_he || (r.ok ? 'עודכן.' : 'העדכון נכשל.'), r.ok ? 'ok' : 'err');
        openCard(cardId); load(true);
      });
    });
  }

  /* ---------- עריכת פרטים ---------- */
  function openEdit(t) {
    var f = [
      ['make', 'יצרן', t.make], ['model', 'דגם', t.model], ['trim', 'גימור', t.trim],
      ['model_year', 'שנת דגם', t.model_year], ['color', 'צבע', t.color],
      ['vin', 'מספר שלדה', t.vin], ['ownership_hand', 'יד', t.ownership_hand],
      ['mileage_km', 'קילומטראז׳', t.mileage_km],
      ['road_entry_date', 'עלה לכביש', (t.road_entry_date || '').slice(0, 10), 'date'],
      ['roadworthiness_test_until', 'טסט עד', (t.roadworthiness_test_until || '').slice(0, 10), 'date'],
      ['registered_owner_name', 'בעלים רשום', t.registered_owner_name],
      ['levi_yitzhak_code', 'קוד לוי יצחק', t.levi_yitzhak_code]
    ];
    document.getElementById('card-body').innerHTML =
      '<h2 class="edit-h">עדכון פרטי הרכב</h2>' +
      '<form id="ti-form" class="form"><div class="grid2">' +
      f.map(function (x) {
        return '<div class="field"><label for="e-' + x[0] + '">' + E(x[1]) + '</label>' +
          '<input id="e-' + x[0] + '" name="' + x[0] + '" type="' + (x[3] || 'text') + '"' +
          (x[3] === 'date' ? ' dir="ltr"' : '') + ' value="' + E(x[2] == null ? '' : x[2]) + '"></div>';
      }).join('') + '</div>' +
      '<label class="tick"><input type="checkbox" name="has_spare_key"' + (t.has_spare_key ? ' checked' : '') + '> מפתח ספייר</label>' +
      '<div class="field"><label for="e-cond">מצב הרכב</label><input id="e-cond" name="condition_notes" value="' + E(t.condition_notes || '') + '"></div>' +
      '<div class="hint">מחירים לא נקבעים כאן — זו סמכות מנהל הרכש.</div>' +
      '<div class="modal-actions"><button class="btn-primary" type="submit">שמירה</button>' +
      '<button class="btn-ghost" type="button" id="e-cancel">חזרה</button></div></form>';

    document.getElementById('e-cancel').addEventListener('click', function () { openCard(cardId); });
    document.getElementById('ti-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var body = { token: session.token, id: t.id };
      new FormData(e.target).forEach(function (val, key) { body[key] = val; });
      body.has_spare_key = e.target.has_spare_key.checked;
      var r = await YM.api('/trade-in/save', body);
      notice(r.message_he || (r.ok ? 'נשמר.' : 'השמירה נכשלה.'), r.ok ? 'ok' : 'err');
      openCard(cardId); load(true);
    });
  }

  /* ---------- קביעת מחירים (מנהל רכש) ---------- */
  function openPrice(t) {
    document.getElementById('card-body').innerHTML =
      '<h2 class="edit-h">קביעת מחירים</h2>' +
      '<p class="note">' + E(t.title || '') + ' · ' + E(t.license_plate_number || '') + '</p>' +
      '<form id="ti-price-form" class="form">' +
      '<div class="field"><label for="p-buy">מחיר קנייה מהלקוח (₪)</label>' +
      '<input id="p-buy" name="purchase_price" inputmode="decimal" dir="ltr" value="' +
        E(t.purchase_price_from_customer == null ? '' : t.purchase_price_from_customer) + '"></div>' +
      '<div class="field"><label for="p-sell">מחיר מכירה (₪)</label>' +
      '<input id="p-sell" name="list_price" inputmode="decimal" dir="ltr" value="' +
        E(t.planned_resale_price == null ? '' : t.planned_resale_price) + '"></div>' +
      '<div class="hint">מחיר הקנייה הוא גם הזיכוי שהלקוח מקבל בעסקה שלו. ' +
      'ממחיר המכירה מנהל המכירות יוכל לתת הנחה עד התקרה שנקבעה בהגדרות.</div>' +
      '<div class="modal-actions"><button class="btn-primary" type="submit">שמירה</button>' +
      '<button class="btn-ghost" type="button" id="p-cancel">חזרה</button></div></form>';

    document.getElementById('p-cancel').addEventListener('click', function () { openCard(cardId); });
    document.getElementById('ti-price-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var r = await YM.api('/vehicle/price', {
        token: session.token, kind: 'trade_in', id: t.id,
        purchase_price: e.target.purchase_price.value,
        list_price: e.target.list_price.value
      });
      notice(r.message_he || (r.ok ? 'נשמר.' : 'השמירה נכשלה.'), r.ok ? 'ok' : 'err');
      openCard(cardId); load(true);
    });
  }

  /* ---------- פתיחת רכב חדש ---------- */
  var newModal = document.getElementById('new-modal');
  document.getElementById('new-ti').addEventListener('click', function () {
    document.getElementById('new-form').reset();
    newModal.hidden = false;
  });
  document.getElementById('new-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = { token: session.token };
    new FormData(e.target).forEach(function (val, key) { if (val) body[key] = val; });
    if (!body.license_plate_number) { notice('מספר רכב הוא שדה חובה.', 'err'); return; }
    var r = await YM.api('/trade-in/create', body);
    notice(r.message_he || (r.ok ? 'נפתח.' : 'הפתיחה נכשלה.'), r.ok ? 'ok' : 'err');
    if (r.ok) {
      newModal.hidden = true;
      await load(true);
      if (r.trade_in && r.trade_in.id) openCard(r.trade_in.id);
    }
  });

  /* ---------- העלאת מסמך ---------- */
  var fileInput = document.getElementById('file-input');
  var pending = null;
  fileInput.addEventListener('change', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !pending) return;
    if (f.size > 15 * 1024 * 1024) { notice('הקובץ גדול מדי (עד 15MB).', 'err'); return; }
    var btn = document.getElementById('ti-doc-up');
    if (btn) { btn.disabled = true; btn.textContent = 'מעלה…'; }
    var fd = new FormData();
    fd.append('token', session.token);
    fd.append('scope', pending.scope);
    fd.append('target_id', pending.target_id);
    fd.append('doc_type', pending.doc_type);
    fd.append('file', f, f.name);
    var r;
    try {
      var resp = await fetch(YM.API_BASE + '/documents/upload', { method: 'POST', body: fd });
      r = await resp.json().catch(function () { return { ok: false }; });
    } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    pending = null;
    notice(r.message_he || (r.ok ? 'המסמך צורף.' : 'ההעלאה נכשלה.'), r.ok ? 'ok' : 'err');
    openCard(cardId); if (r.ok) load(true);
  });

  /* ---------- עזרים ---------- */
  function section(title, items) {
    var live = items.filter(Boolean);
    if (!live.length) return '';
    return '<div class="sect"><h3>' + E(title) + '</h3><div class="kv">' + live.join('') + '</div></div>';
  }
  function kv(label, value, cls) {
    if (value === null || value === undefined || value === '') return null;
    return '<div><span class="k">' + E(label) + '</span>' +
      '<span class="v ' + (cls || '') + '">' + E(value) + '</span></div>';
  }
  function fmtDate(d) {
    if (!d) return null;
    var x = new Date(d);
    if (isNaN(x)) return null;
    return String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0') + '.' + x.getFullYear();
  }
  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return fmtDate(iso) + ' ' + YM.hhmm(d);
  }

  /* ---------- אירועים ---------- */
  function closeCard() { document.getElementById('modal').hidden = true; YM.photos.close(); }
  document.getElementById('card-close').addEventListener('click', closeCard);
  document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target.id === 'modal') closeCard();
  });
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.getElementById(b.getAttribute('data-close')).hidden = true;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modal').hidden) closeCard();
    if (!newModal.hidden) newModal.hidden = true;
  });

  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });

  var searchTimer;
  document.getElementById('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var v = e.target.value.trim();
    searchTimer = setTimeout(function () { state.q = v; load(true); }, 280);
  });
})();
