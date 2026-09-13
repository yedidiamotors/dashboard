/* ============================================================
   ידידיה מוטורס — מסך מלאי רכבים
   השרת מחזיר רק שדות שהמשתמש רשאי לראות (vehicle_view).
   המסך מרנדר את מה שהגיע — אין כאן שום לוגיקת הרשאות.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var state = { rows: [], total: 0, offset: 0, q: '', make: '', status: '',
                facets: null, viewer: null, loading: false };
  var PAGE = 50;

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
      res = await YM.api('/inventory/list', {
        token: session.token, q: state.q, make: state.make,
        status: state.status, limit: PAGE, offset: state.offset
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
      var msg = res.message_he || 'טעינת המלאי נכשלה.';
      if (reset) bootError(msg); else notice(msg, 'err');
      return;
    }

    state.rows   = reset ? (res.vehicles || []) : state.rows.concat(res.vehicles || []);
    state.total  = res.total || 0;
    state.facets = res.facets || { makes: [], statuses: [] };
    state.viewer = res.viewer || {};

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
    document.getElementById('boot-retry')
      .addEventListener('click', function () { location.reload(); });
  }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 4000);
  }

  /* ---------- תצוגה ---------- */
  function render() {
    var perms = session.permissions || [];
    YM.renderNav('nav', 'inventory.html', perms);
    document.getElementById('avatar').textContent =
      YM.initials(session.user && session.user.name);

    var scopeNote = state.viewer && state.viewer.sales_scope
      ? 'מוצגים רכבים שנמצאים בארץ בלבד'
      : 'כולל רכבים בדרך ובתהליך יבוא';
    document.getElementById('meta-line').textContent =
      state.total + ' רכבים · ' + scopeNote;
    document.getElementById('eyebrow').textContent =
      YM.roleHe(session.user && session.user.role);

    renderSideBox();
    renderFilters();
    renderRows();
  }

  function renderSideBox() {
    var f = state.facets || {};
    var byStatus = (f.statuses || []).map(function (s) {
      return '<div class="list-row"><div class="lines">' +
        '<span class="t">' + E(s.label_he) + '</span></div>' +
        '<span class="tag">' + s.units + '</span></div>';
    }).join('');
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box">' +
        '<div class="label">רכבים במעקב</div>' +
        '<div class="stat-figure">' + state.total + '</div>' +
        '<div class="stat-note">' + (f.makes || []).length + ' יצרנים</div>' +
      '</div>' + (byStatus ? '<div class="list" style="margin-top:12px">' + byStatus + '</div>' : '');
  }

  function renderFilters() {
    var f = state.facets || {};
    var sEl = document.getElementById('status-filters');
    sEl.innerHTML = chip('הכל', '', state.status === '', 'status') +
      (f.statuses || []).map(function (s) {
        return chip(s.label_he + ' · ' + s.units, s.key, state.status === s.key, 'status');
      }).join('');

    var mEl = document.getElementById('make-filters');
    mEl.innerHTML = (f.makes || []).length > 1
      ? chip('כל היצרנים', '', state.make === '', 'make') +
        (f.makes || []).map(function (m) {
          return chip(m.name + ' · ' + m.units, m.name, state.make === m.name, 'make');
        }).join('')
      : '';

    [sEl, mEl].forEach(function (host) {
      host.querySelectorAll('.chip').forEach(function (c) {
        c.addEventListener('click', function () {
          var kind = c.getAttribute('data-kind');
          state[kind] = c.getAttribute('data-val');
          load(true);
        });
      });
    });
  }

  function chip(label, val, active, kind) {
    return '<button class="chip' + (active ? ' is-active' : '') +
      '" type="button" data-kind="' + kind + '" data-val="' + E(val) + '">' +
      E(label) + '</button>';
  }

  function renderRows() {
    var host = document.getElementById('rows');
    if (!state.rows.length) {
      host.innerHTML = '<div class="empty">' +
        (state.q || state.make || state.status
          ? 'לא נמצאו רכבים התואמים לסינון.'
          : 'אין כרגע רכבים במעקב.') + '</div>';
      document.getElementById('foot').innerHTML = '';
      return;
    }

    host.innerHTML = state.rows.map(function (v) {
      var hasPrice = v.total_landed_cost_estimate != null || v.purchase_price != null;
      var priceTxt = '—';
      if (v.total_landed_cost_estimate != null) {
        priceTxt = YM.nis(v.total_landed_cost_estimate);
      } else if (v.purchase_price != null) {
        // מחיר רכישה נקוב במטבע הספק — לא להציג כשקלים
        var cur = v.purchase_currency || 'ILS';
        priceTxt = cur === 'ILS' ? YM.nis(v.purchase_price)
          : cur + ' ' + Number(v.purchase_price).toLocaleString('en-US');
      }
      var meta = [v.model_year, v.color, v.location,
                  v.days_in_stock + ' ימים', v.status_he].filter(Boolean).join(' · ');
      return '<div class="inv-row" data-ref="' + E(v.vin || v.id) + '">' +
        '<div class="thumb"><span>' + E(v.vin_tail || '—') + '</span></div>' +
        '<div class="names">' +
          '<div class="model">' + E(v.title || '—') + '</div>' +
          '<div class="trim">' + E(v.trim || v.color || '—') + '</div>' +
          '<div class="inv-meta">' + E(meta) + '</div>' +
        '</div>' +
        '<div class="cell c-year">' + E(v.model_year || '—') + '</div>' +
        '<div class="cell c-loc">' + E(v.location || '—') + '</div>' +
        '<div class="cell c-days">' + E(v.days_in_stock) + '</div>' +
        '<div class="price' + (hasPrice ? '' : ' none') + '">' + E(priceTxt) + '</div>' +
        '<div class="status-pill c-status">' + E(v.status_he) + '</div>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.inv-row').forEach(function (r) {
      r.addEventListener('click', function () { openCard(r.getAttribute('data-ref')); });
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
      state.offset = state.rows.length;
      load(false);
    });
  }

  /* ---------- כרטיס רכב ---------- */
  var cardRef = null;
  async function openCard(ref) {
    cardRef = ref;
    document.getElementById('card-body').innerHTML = '<div class="empty">טוען…</div>';
    document.getElementById('modal').hidden = false;

    var res;
    try {
      res = await YM.api('/inventory/card', { token: session.token, ref: ref });
    } catch (err) {
      document.getElementById('card-body').innerHTML =
        '<div class="empty">' + E(err.message) + '</div>';
      return;
    }
    if (res.ok !== true) {
      document.getElementById('card-body').innerHTML =
        '<div class="empty">' + E(res.message_he || 'לא ניתן להציג את הרכב.') + '</div>';
      return;
    }
    document.getElementById('card-body').innerHTML = cardHtml(res);
    bindCard(res);
  }

  var VEHICLE_DOCS = [['invoice', 'חשבונית ספק'], ['order_form', 'טופס הזמנה'], ['order_amendment', 'תיקון הזמנה'],
                      ['booking_doc', 'מסמך בוקינג'], ['customs_doc', 'מסמך מכס'], ['licensing_doc', 'מסמך רישוי'],
                      ['signed_form', 'טופס חתום'], ['spec_sheet', 'מפרט'], ['sticker_photo', 'צילום מדבקה'], ['other', 'אחר']];

  function specHtml(v) {
    var s = v.vin_spec;
    if (!s) {
      if (!v.vin) return '';
      return '<div class="sect"><h3>מפרט מה-VIN</h3><p class="note">' +
        E(v.vin_decode_error ? 'הפענוח נכשל: ' + v.vin_decode_error : 'עדיין לא פוענח — הפענוח רץ אוטומטית כל 20 דקות.') + '</p></div>';
    }
    var h = section('מפרט מה-VIN (NHTSA)', [
      kv('שנת דגם', s.model_year, 'num'),
      kv('יצרן / דגם', [s.make, s.model].filter(Boolean).join(' ')),
      kv('גימור', s.trim || null),
      kv('סדרה', s.series || null),
      kv('מנוע', s.engine || null),
      kv('הנעה', s.drive || null),
      kv('דלק', s.fuel || null),
      kv('תיבת הילוכים', s.transmission || null),
      kv('מרכב', s.body || null),
      kv('דלתות', s.doors, 'num'),
      kv('מושבים', s.seats, 'num'),
      kv('משקל כולל', s.gvwr || null),
      kv('חישוקים', s.wheels_in ? s.wheels_in + ' אינץ׳' : null),
      kv('ארץ ייצור', s.plant_country ? s.plant_country + (s.plant_city ? ' · ' + s.plant_city : '') : null)
    ]);
    if (s.safety && s.safety.length) {
      h += '<div class="sect"><h3>בטיחות ועזרי נהיגה (סטנדרט לגימור)</h3><div class="chips">' +
        s.safety.map(function (x) { return '<span class="doc">' + E(x) + '</span>'; }).join('') + '</div></div>';
    }
    if (v.vin_decode_error) h += '<p class="note">הערת NHTSA: ' + E(v.vin_decode_error) + '</p>';
    return h;
  }

  function docsHtml(v) {
    var docs = v.documents || [];
    var h = '<div class="sect"><h3>מסמכי התיק (' + docs.length + ')</h3>';
    if (!docs.length) h += '<p class="note">אין מסמכים בתיק עדיין. מה שיאיר שולח במייל ומה שמועלה כאן נשמר בתיקיית הרכב ב-Drive.</p>';
    else h += '<div class="docs">' + docs.map(function (d) {
      var via = d.uploaded_via === 'email' ? 'מהמייל' : d.uploaded_via === 'staff_dashboard' ? 'מהפאנל' : d.uploaded_via === 'staff_whatsapp' ? 'מוואטסאפ' : d.uploaded_via === 'customer_portal' ? 'מהלקוח' : (d.uploaded_via || '');
      return '<span class="doc">' +
        (d.drive_url ? '<a href="' + E(d.drive_url) + '" target="_blank" rel="noopener">' + E(d.doc_type_he) + (d.filename ? ' · ' + E(d.filename) : '') + '</a>' : E(d.doc_type_he)) +
        '<span class="m">' + E([fmtDT(d.created_at), via, d.uploaded_by_name].filter(Boolean).join(' · ')) + '</span>' +
        (d.summary ? '<span class="m">' + E(d.summary) + '</span>' : '') + '</span>';
    }).join('') + '</div>';
    h += '<div class="doc-tools"><select id="vdoc-type" aria-label="סוג מסמך">' + VEHICLE_DOCS.map(function (x) {
      return '<option value="' + x[0] + '">' + x[1] + '</option>';
    }).join('') + '</select><button class="btn-icon" type="button" id="vdoc-up">צירוף קובץ לתיק הרכב</button></div></div>';
    return h;
  }

  function sourcesHtml(v) {
    var src = v.sources || [];
    if (!src.length) return '';
    return '<div class="sect"><h3>מאיפה הגיעו הנתונים</h3>' + src.map(function (s) {
      var what = s.channel === 'gmail' ? 'מייל' : s.channel === 'whatsapp' ? 'וואטסאפ' : s.source === 'sheet_import' ? 'גיליון המלאי' : (s.source || '');
      var who = s.from ? String(s.from).replace(/<.*?>/, '').replace(/"/g, '').trim() : '';
      return '<div class="src">' + E([what, who, s.document_type === 'invoice' ? 'חשבונית' : s.document_type, s.subject].filter(Boolean).join(' · ')) +
        '<span class="m">' + E([fmtDT(s.received_at), (s.attachments || []).join(', ')].filter(Boolean).join(' · ')) + '</span>' +
        (s.summary_he ? '<span class="m">' + E(s.summary_he) + '</span>' : '') +
        (s.notes ? '<span class="m">' + E(s.notes) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ' ' + YM.hhmm(d);
  }

  function bindCard(res) {
    var v = res.vehicle || {};
    var up = document.getElementById('vdoc-up');
    if (up) up.addEventListener('click', function () {
      pickFile({ scope: 'vehicle', target_id: v.id, doc_type: document.getElementById('vdoc-type').value });
    });
  }

  /* ---------- העלאת קובץ לתיק הרכב (Drive דרך n8n) ---------- */
  var fileInput = document.getElementById('file-input');
  var pendingUpload = null;
  function pickFile(ctx) { pendingUpload = ctx; fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !pendingUpload) return;
    if (f.size > 15 * 1024 * 1024) { cardNotice('הקובץ גדול מדי (עד 15MB).'); return; }
    var btn = document.getElementById('vdoc-up');
    if (btn) { btn.disabled = true; btn.textContent = 'מעלה…'; }
    var fd = new FormData();
    fd.append('token', session.token);
    fd.append('scope', pendingUpload.scope);
    fd.append('target_id', pendingUpload.target_id);
    fd.append('doc_type', pendingUpload.doc_type);
    fd.append('file', f, f.name);
    var r;
    try {
      var resp = await fetch(YM.API_BASE + '/documents/upload', { method: 'POST', body: fd });
      r = await resp.json().catch(function () { return { ok: false, message_he: 'תשובה לא תקינה מהשרת.' }; });
    } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    pendingUpload = null;
    if (r.ok) { openCard(cardRef); }
    else { if (btn) { btn.disabled = false; btn.textContent = 'צירוף קובץ לתיק הרכב'; } cardNotice(r.message_he || 'ההעלאה נכשלה.'); }
  });
  function cardNotice(text) {
    var body = document.getElementById('card-body');
    var el = document.createElement('div');
    el.className = 'banner'; el.textContent = text;
    body.insertBefore(el, body.firstChild);
    setTimeout(function () { el.remove(); }, 5000);
  }

  function cardHtml(res) {
    var v = res.vehicle || {};
    var h = '<div class="card-head-v">' +
      '<h2>' + E(v.title || '—') + '</h2>' +
      '<div class="sub">' + E([v.trim, v.color].filter(Boolean).join(' · ') || '—') + '</div>' +
      '<div class="tags">' +
        '<span class="status-pill">' + E(v.status_he) + '</span>' +
        (v.location ? '<span class="tag">' + E(v.location) + '</span>' : '') +
        (v.model_year ? '<span class="tag">' + E(v.model_year) + '</span>' : '') +
        '<span class="tag">' + E(v.days_in_stock) + ' ימים במלאי</span>' +
      '</div></div>';

    h += section('זיהוי', [
      kv('מספר שלדה', v.vin, 'num'),
      kv('מספר הזמנה', v.order_number),
      kv('מספר לוט', v.stock_lot_number),
      kv('ריפוד', v.upholstery)
    ]);

    h += specHtml(v);

    var feat = v.features || {};
    h += section('רישוי ואבזור (מהגיליון)', [
      kv('תקן', feat.standard || v.standard_type),
      kv('מפתח ספייר', boolHe(v.has_spare_key)),
      kv('איתורן', boolHe(v.tracking_device_installed)),
      kv('טסט עד', v.roadworthiness_test_until),
      kv('רישוי הושלם', boolHe(v.licensing_completed)),
      kv('דרגת זיהום', v.co2_emission_class, 'num'),
      kv('חניה אוטומטית', boolHe(feat.auto_park)),
      kv('וו גרירה', boolHe(feat.tow_hitch)),
      kv('התנעה מרחוק', boolHe(feat.remote_start))
    ]);

    h += section('מחירון לוי יצחק', [
      kv('קוד', v.levi_yitzhak_code),
      kv('מחיר', v.levi_yitzhak_price != null ? YM.nis(v.levi_yitzhak_price) : null, 'money')
    ]);

    // הסעיפים הבאים מופיעים רק אם השרת שלח אותם — כלומר רק אם יש הרשאה
    h += section('ספק ומיסוי יבוא', [
      kv('ספק', v.supplier_name),
      kv('ארץ רכישה', v.purchase_country),
      kv('סטטוס אישור תקן', v.type_approval_status),
      kv('מכס', v.customs_duty_estimate != null ? YM.nis(v.customs_duty_estimate) : null, 'money'),
      kv('מס קנייה', v.purchase_tax_estimate != null ? YM.nis(v.purchase_tax_estimate) : null, 'money'),
      kv('מע״מ', v.vat_estimate != null ? YM.nis(v.vat_estimate) : null, 'money'),
      kv('הובלה', v.shipping_cost_estimate != null ? YM.nis(v.shipping_cost_estimate) : null, 'money'),
      kv('עמלות נוספות', v.other_fees_estimate != null ? YM.nis(v.other_fees_estimate) : null, 'money')
    ]);

    h += section('עלות רכישה', [
      kv('מחיר רכישה', v.purchase_price != null
          ? (v.purchase_currency || '') + ' ' + Number(v.purchase_price).toLocaleString('en-US')
          : null, 'money'),
      kv('עלות נחיתה כוללת', v.total_landed_cost_estimate != null
          ? YM.nis(v.total_landed_cost_estimate) : null, 'money'),
      kv('חושב בתאריך', v.tax_calc_date ? String(v.tax_calc_date).slice(0, 10) : null),
      kv('עודכן ידנית', v.manually_overridden === true ? 'כן' : null)
    ]);

    h += docsHtml(v);
    h += sourcesHtml(v);

    if (res.message_he) {
      h += '<div class="wa-preview"><h3>כך הרכב הזה נשלח בוואטסאפ</h3>' +
        '<p class="why">ההודעה נבנית מאותם שדות מסוננים שמוצגים כאן — ' +
        'מי שאינו רשאי לראות שדה, לא יקבל אותו גם בהודעה.</p>' +
        '<div class="wa-bubble">' + E(res.message_he) + '</div></div>';
    }
    return h;
  }

  function section(title, items) {
    var live = items.filter(Boolean);
    if (!live.length) return '';
    return '<div class="sect"><h3>' + E(title) + '</h3><div class="kv">' +
      live.join('') + '</div></div>';
  }

  function kv(label, value, cls) {
    if (value === null || value === undefined || value === '') return null;
    return '<div><span class="k">' + E(label) + '</span>' +
      '<span class="v ' + (cls || '') + '">' + E(value) + '</span></div>';
  }

  function boolHe(b) {
    if (b === null || b === undefined) return null;
    return b ? 'כן' : 'לא';
  }

  /* ---------- אירועים ---------- */
  function closeCard() { document.getElementById('modal').hidden = true; }
  document.getElementById('card-close').addEventListener('click', closeCard);
  document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target.id === 'modal') closeCard();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeCard();
  });

  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });

  var searchTimer;
  document.getElementById('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var v = e.target.value.trim();
    searchTimer = setTimeout(function () { state.q = v; load(true); }, 280);
  });
})();
