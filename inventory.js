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
    if (reset && !deepLinked) {
      deepLinked = true;
      var ref = new URLSearchParams(location.search).get('ref');
      if (ref) openCard(ref);
    }
  }
  var deepLinked = false;

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
    loadPhotos(v.id);
  }

  /* ---------- תמונות לאתר ----------
     הסדר כאן הוא הסדר באתר: הראשונה היא התמונה הראשית.
     המקור היחיד לאמת הוא vehicle_photos ב-Supabase; התיקייה בדרייב מסונכרנת אליו בכל פתיחה. */
  var photoState = { vehicle_id: null, photos: [], can: false, folder: null, loading: false, err: null };

  async function loadPhotos(vehicleId) {
    photoState = { vehicle_id: vehicleId, photos: [], can: false, folder: null, loading: true, err: null };
    renderPhotos();
    var r;
    try { r = await YM.api('/vehicle/photos', { token: session.token, vehicle_id: vehicleId }); }
    catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (photoState.vehicle_id !== vehicleId) return;   // הכרטיס הוחלף בינתיים
    photoState.loading = false;
    if (r.ok !== true) { photoState.err = r.message_he || 'לא ניתן לטעון את התמונות.'; renderPhotos(); return; }
    photoState.photos = r.photos || [];
    photoState.can = r.can_manage === true;
    photoState.folder = r.folder_name || null;
    renderPhotos();
  }

  function renderPhotos() {
    var host = document.getElementById('photos-sect');
    if (!host) return;
    var s = photoState;
    var h = '<h3>תמונות לאתר' + (s.folder ? ' · <span class="ltr">' + E(s.folder) + '</span>' : '') + '</h3>';

    if (s.loading) { host.innerHTML = h + '<p class="note">טוען תמונות…</p>'; return; }
    if (s.err)     { host.innerHTML = h + '<p class="note">' + E(s.err) + '</p>'; return; }

    h += '<p class="note">הסדר כאן הוא הסדר באתר, והראשונה היא התמונה הראשית. ' +
         'שינוי נכנס לאתר בבנייה הבאה שלו.</p>';

    if (!s.photos.length) h += '<p class="note">אין עדיין תמונות לרכב הזה.</p>';
    else h += '<div class="ph-grid">' + s.photos.map(function (p, i) {
      var first = i === 0 && p.published;
      return '<figure class="ph' + (p.published ? '' : ' is-hidden') + (first ? ' is-primary' : '') + '"' +
          (s.can ? ' draggable="true"' : '') + ' data-id="' + E(p.id) + '" data-i="' + i + '">' +
        '<img src="' + E(p.view_url || '') + '" alt="' + E(p.filename || 'תמונת רכב') + '" loading="lazy">' +
        '<figcaption>' + (first ? 'ראשית' : String(i + 1)) + (p.published ? '' : ' · לא באתר') + '</figcaption>' +
        (s.can ? '<div class="ph-acts">' +
          '<button type="button" class="ph-b" data-act="fwd" ' + (i === 0 ? 'disabled' : '') + '>קדימה</button>' +
          '<button type="button" class="ph-b" data-act="back" ' + (i === s.photos.length - 1 ? 'disabled' : '') + '>אחורה</button>' +
          (first ? '' : '<button type="button" class="ph-b" data-act="primary">ראשית</button>') +
          '<button type="button" class="ph-b" data-act="pub">' + (p.published ? 'הסתרה' : 'החזרה') + '</button>' +
          '<button type="button" class="ph-b danger" data-act="del">מחיקה</button>' +
        '</div>' : '') +
      '</figure>';
    }).join('') + '</div>';

    if (s.can) h += '<div class="doc-tools"><button class="btn-icon" type="button" id="ph-up">הוספת תמונות</button>' +
      '<span class="note-inline">JPG/PNG/WebP · עד 15MB לתמונה</span></div>';
    else h += '<p class="note">אין לך הרשאה לשנות את תמונות האתר.</p>';

    host.innerHTML = h;
    bindPhotos();
  }

  function bindPhotos() {
    var host = document.getElementById('photos-sect');
    if (!host || !photoState.can) return;

    host.querySelectorAll('.ph-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var fig = b.closest('.ph');
        photoAction(b.getAttribute('data-act'), fig.getAttribute('data-id'), Number(fig.getAttribute('data-i')));
      });
    });

    var dragFrom = null;
    host.querySelectorAll('.ph').forEach(function (fig) {
      fig.addEventListener('dragstart', function (e) {
        dragFrom = Number(fig.getAttribute('data-i'));
        fig.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (x) {}
      });
      fig.addEventListener('dragend', function () { fig.classList.remove('dragging'); dragFrom = null; });
      fig.addEventListener('dragover', function (e) { e.preventDefault(); fig.classList.add('drop-here'); });
      fig.addEventListener('dragleave', function () { fig.classList.remove('drop-here'); });
      fig.addEventListener('drop', function (e) {
        e.preventDefault(); fig.classList.remove('drop-here');
        var from = dragFrom;
        if (from === null || from === undefined) { var t = Number(e.dataTransfer.getData('text/plain')); from = isNaN(t) ? null : t; }
        var to = Number(fig.getAttribute('data-i'));
        if (from === null || from === to) return;
        moveTo(from, to);
      });
    });

    var up = document.getElementById('ph-up');
    if (up) up.addEventListener('click', function () { photoInput.value = ''; photoInput.click(); });
  }

  function moveTo(from, to) {
    var list = photoState.photos.slice();
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    photoState.photos = list;
    renderPhotos();                       // תגובה מיידית; השרת מאשר מיד אחר כך
    saveOrder();
  }

  async function saveOrder() {
    var r = await YM.api('/vehicle/photos/reorder', {
      token: session.token, vehicle_id: photoState.vehicle_id,
      photo_ids: photoState.photos.map(function (p) { return p.id; })
    });
    if (r.ok !== true) { cardNotice(r.message_he || 'שמירת הסדר נכשלה.'); loadPhotos(photoState.vehicle_id); return; }
    photoState.photos = r.photos || photoState.photos;
    renderPhotos();
  }

  async function photoAction(act, id, i) {
    if (act === 'fwd')  { moveTo(i, i - 1); return; }
    if (act === 'back') { moveTo(i, i + 1); return; }

    var body = { token: session.token }, path;
    if (act === 'primary') { path = '/vehicle/photos/update'; body.photo_id = id; body.is_primary = true; }
    else if (act === 'pub') {
      var p = photoState.photos[i] || {};
      path = '/vehicle/photos/update'; body.photo_id = id; body.published = !p.published;
    } else if (act === 'del') {
      if (!confirm('להסיר את התמונה מהאתר? הקובץ נשאר בדרייב, אבל הוא לא יחזור לרשימה.')) return;
      path = '/vehicle/photos/delete'; body.photo_id = id;
    } else return;

    var r;
    try { r = await YM.api(path, body); }
    catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (r.ok !== true) { cardNotice(r.message_he || 'הפעולה נכשלה.'); return; }
    photoState.photos = r.photos || [];
    renderPhotos();
  }

  /* ---------- העלאת תמונות לאתר ---------- */
  var photoInput = document.getElementById('photo-input');
  if (photoInput) photoInput.addEventListener('change', async function () {
    var files = Array.prototype.slice.call(photoInput.files || []);
    if (!files.length) return;
    var vid = photoState.vehicle_id;
    var btn = document.getElementById('ph-up');
    var done = 0, failed = [];

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (btn) { btn.disabled = true; btn.textContent = 'מעלה ' + (i + 1) + ' מתוך ' + files.length + '…'; }
      if (f.size > 15 * 1024 * 1024) { failed.push(f.name + ' (גדול מ-15MB)'); continue; }
      var fd = new FormData();
      fd.append('token', session.token);
      fd.append('vehicle_id', vid);
      fd.append('file', f, f.name);
      var r;
      try {
        var resp = await fetch(YM.API_BASE + '/vehicle/photos/upload', { method: 'POST', body: fd });
        r = await resp.json().catch(function () { return { ok: false }; });
      } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
      if (r.ok) { done++; photoState.photos = r.photos || photoState.photos; }
      else failed.push(f.name + (r.message_he ? ' — ' + r.message_he : ''));
    }

    photoInput.value = '';
    if (photoState.vehicle_id !== vid) return;
    renderPhotos();
    if (failed.length) cardNotice('לא הועלו: ' + failed.join(' · '));
    else if (done) notice(done === 1 ? 'התמונה נוספה.' : done + ' תמונות נוספו.', 'ok');
  });

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

    h += '<div class="sect" id="photos-sect"><h3>תמונות לאתר</h3><p class="note">טוען…</p></div>';
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
