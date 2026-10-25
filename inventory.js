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
  (function () {
    var st = new URLSearchParams(location.search).get('status');
    if (st) state.status = st;
  })();

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

    var nb = document.getElementById('new-vehicle');
    if (nb) nb.hidden = !(state.viewer && state.viewer.can_create);

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
          '<div class="model">' + E(v.title || '—') + fcFlag(v) + '</div>' +
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

  /* ---------- טופסי IMR (משרד התחבורה) ----------
     מעלים לתיק את ה-IMR החתום של השנה; המערכת קוראת אותו וממלאת אוטומטית את טופס השנה הבאה
     (על גבי הטופס המקורי של משרד התחבורה) לרכב שעדיין במלאי. רק למי שיש manage_imr_forms. */
  function imrHtml(v) {
    var m = v.imr;
    if (!m) return '';
    var forms = m.forms || [];
    var h = '<div class="sect" id="imr-sect"><h3>טופסי IMR — משרד התחבורה</h3>';
    if (!(m.templates || []).length) {
      h += '<p class="note">עדיין לא נקלטו טפסי המקור של משרד התחבורה. מעלים אותם פעם אחת לתיקיית ה-Drive "IMR — טפסי משרד התחבורה (מקור)".</p>';
    }
    if (!forms.length) {
      h += '<p class="note">לא הועלה טופס IMR חתום. אחרי ההעלאה המערכת קוראת אותו וממלאת את טופס השנה הבאה להחתמת היצרן.</p>';
    } else {
      h += '<div class="imr-list">' + forms.map(function (f) {
        var cls = f.status === 'error' ? 'bad' : (f.status === 'needs_review' ? 'warn' : (f.status === 'ready' ? 'ok' : ''));
        var title = 'IMR ' + (f.year || '—') + (f.variant_he ? ' · ' + f.variant_he : '') +
          (f.origin === 'uploaded' ? ' · חתום' : ' · מולא אוטומטית');
        var rev = f.review || [];
        var r = '<div class="imr-row">' +
          '<div class="imr-main"><b>' + E(title) + '</b> <span class="imr-st ' + cls + '">' + E(f.status_he || f.status) + '</span>' +
          (f.download_url ? ' <a class="btn-icon' + (f.origin === 'generated' ? ' primary' : '') + '" href="' + E(f.download_url) + '" target="_blank" rel="noopener">' +
            (f.origin === 'generated' ? 'הורדה להחתמה' : 'צפייה') + '</a>' : '') + '</div>';
        if (f.error) r += '<div class="m">' + E(f.error) + '</div>';
        if (f.notes_he && f.origin === 'uploaded') r += '<div class="m">' + E(f.notes_he) + '</div>';
        if (rev.length) {
          r += '<details class="imr-rev"><summary>' + rev.length + (f.origin === 'generated' ? ' סעיפים לבדיקה לפני השליחה ליצרן' : ' דברים לבדוק') + '</summary><ul>' +
            rev.map(function (x) { return '<li>' + E([x.code, x.subject].filter(Boolean).join(' — ')) + (x.reason_he ? ' · <span class="m">' + E(x.reason_he) + '</span>' : '') + '</li>'; }).join('') +
            '</ul></details>';
        }
        return r + '</div>';
      }).join('') + '</div>';
      if (forms.some(function (f) { return f.status === 'pending' || f.status === 'processing'; })) {
        h += '<p class="note">הטופס בעבודה — הקריאה והמילוי לוקחים כמה דקות.</p>';
      }
    }
    if (!m.eligible) h += '<p class="note">הרכב נמסר או נרשם — לא יופק טופס לשנה הבאה.</p>';
    h += '<div class="doc-tools"><button class="btn-icon" type="button" id="imr-up">העלאת IMR חתום</button>' +
         (forms.length ? ' <button class="btn-icon" type="button" id="imr-refresh">רענון</button>' : '') + '</div></div>';
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
    YM.share.bind(document.getElementById('card-body'), v.share);
    var eb = document.getElementById('v-edit');
    if (eb) eb.addEventListener('click', function () { YM.vehicleForm.openEdit(res); });
    var iu = document.getElementById('imr-up');
    if (iu) iu.addEventListener('click', function () { pickFile({ scope: 'vehicle', target_id: v.id, doc_type: 'imr', btn: 'imr-up' }); });
    var ir = document.getElementById('imr-refresh');
    if (ir) ir.addEventListener('click', function () { openCard(cardRef); });
    var up = document.getElementById('vdoc-up');
    if (up) up.addEventListener('click', function () {
      pickFile({ scope: 'vehicle', target_id: v.id, doc_type: document.getElementById('vdoc-type').value });
    });
    loadPhotos(v.id, [v.title, v.vin_tail].filter(Boolean).join(' · '));
    bindFileChecks();
  }

  /* ---------- בדיקת התאמה של קבצים לרכב ----------
     כל תמונה ומסמך בתיק נקראים אוטומטית (Gemini) ומושווים לתיק:
     מספר שלדה, שלדה של רכב שבוטל והוחלף (מההערות), שלדה של תיק אחר, מספר חשבונית ויצרן.
     השרת (vehicle_view → file_checks) מחזיר רק את מה שהצופה רשאי לראות. */
  function fcFlag(v) {
    var c = (v.file_checks && v.file_checks.counts) || {};
    if (!c.open) return '';
    return ' <span class="fc-flag' + (c.open_high ? ' high' : '') + '" title="קבצים בתיק שלא תואמים לרכב">⚠ ' + c.open + '</span>';
  }

  function fileChecksHtml(v, viewer) {
    var fc = v.file_checks;
    var c = (fc && fc.counts) || {};
    if (!c.total) return '';
    var items = fc.items || [];
    var open = items.filter(function (i) { return !i.resolved_at; });
    var summary = [
      c.match ? c.match + ' תואמים' : '',
      c.no_vin ? c.no_vin + ' בלי מספר שלדה גלוי (לא נמצאה סתירה)' : '',
      c.pending ? c.pending + ' עדיין בבדיקה' : ''
    ].filter(Boolean).join(' · ');
    var h = '<div class="sect fc' + (open.length ? ' has-open' : '') + '" id="fc-sect"><h3>בדיקת התאמה של קבצים לרכב</h3>';
    if (open.length) {
      h += '<div class="fc-head">⚠ ' + (open.length === 1 ? 'קובץ אחד לא תואם' : open.length + ' קבצים לא תואמים') + ' לרכב הזה</div>';
    } else if (!items.length) {
      h += '<p class="note">לא נמצאה אי-התאמה. ' + E(summary) + '</p>';
    }
    h += items.map(function (i) { return fcItemHtml(i, viewer.can_edit); }).join('');
    if (items.length && summary) h += '<p class="note">שאר הקבצים: ' + E(summary) + '</p>';
    return h + '</div>';
  }

  function fcItemHtml(i, canEdit) {
    var sev = i.severity || 'warn';
    var lines = (i.mismatches || []).filter(function (m) { return m.severity === 'high' || m.severity === 'warn'; });
    var info = (i.mismatches || []).filter(function (m) { return m.severity === 'info'; });
    var name = E(i.file_he || 'קובץ') + (i.filename ? ' · ' + E(i.filename) : '');
    var h = '<div class="fc-item sev-' + E(sev) + (i.resolved_at ? ' is-resolved' : '') + '">' +
      '<div class="fc-top">' + (i.url ? '<a href="' + E(i.url) + '" target="_blank" rel="noopener">' + name + '</a>' : '<span>' + name + '</span>') +
      '<span class="m">' + E(fmtDT(i.checked_at)) + '</span></div>' +
      lines.map(function (m) { return '<div class="fc-text">' + E(m.text) + '</div>'; }).join('') +
      info.map(function (m) { return '<div class="fc-info">' + E(m.text) + '</div>'; }).join('');
    if (i.resolved_at) {
      h += '<div class="fc-res">נסגר' + (i.resolved_by_name ? ' ע״י ' + E(i.resolved_by_name) : '') + ' · ' + E(fmtDT(i.resolved_at)) +
        (i.resolution ? ' — ' + E(i.resolution) : '') + '</div>';
      if (canEdit) h += '<div class="fc-tools"><button class="btn-icon fc-reopen" type="button" data-id="' + E(i.id) + '">פתיחה מחדש</button></div>';
    } else if (canEdit) {
      h += '<div class="fc-tools"><input class="fc-note" type="text" maxlength="300" placeholder="למה זה תקין? למשל: חשבונית מתוקנת בדרך / הקובץ הועבר לתיק הנכון" aria-label="סיבת הסגירה">' +
        '<button class="btn-icon fc-resolve" type="button" data-id="' + E(i.id) + '">סגירת ההתראה</button></div>';
    }
    return h + '</div>';
  }

  function bindFileChecks() {
    var sect = document.getElementById('fc-sect');
    if (!sect) return;
    sect.querySelectorAll('.fc-resolve, .fc-reopen').forEach(function (b) {
      b.addEventListener('click', async function () {
        var reopen = b.classList.contains('fc-reopen');
        var noteEl = b.parentNode.querySelector('.fc-note');
        var note = noteEl ? noteEl.value.trim() : '';
        if (!reopen && !note) { noteEl.focus(); cardNotice('צריך לכתוב למה ההתראה נסגרת.'); return; }
        b.disabled = true;
        var r;
        try {
          r = await YM.api('/inventory/file-check', { token: session.token, check_id: b.getAttribute('data-id'), resolution: note, reopen: reopen });
        } catch (err) { r = { ok: false, message_he: err.message }; }
        if (r.ok === true) { openCard(cardRef); load(true); notice(reopen ? 'ההתראה נפתחה מחדש.' : 'ההתראה נסגרה.', 'ok'); }
        else { b.disabled = false; cardNotice(r.message_he || 'הפעולה נכשלה.'); }
      });
    });
  }

  /* ---------- תמונות לאתר ----------
     המימוש עצמו יושב ב-photos.js ומשותף עם מסך הטרייד-אין. */
  function loadPhotos(vehicleId, label) {
    YM.photos.open({
      hostId: 'photos-sect', inputId: 'photo-input', token: session.token, label: label,
      onError: cardNotice,
      onToast: function (t) { notice(t, 'ok'); }
    }, { vehicle_id: vehicleId });
  }

  /* ---------- העלאת קובץ לתיק הרכב (Drive דרך n8n) ---------- */
  var fileInput = document.getElementById('file-input');
  var pendingUpload = null;
  function pickFile(ctx) { pendingUpload = ctx; fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !pendingUpload) return;
    if (f.size > 15 * 1024 * 1024) { cardNotice('הקובץ גדול מדי (עד 15MB).'); return; }
    var btn = document.getElementById(pendingUpload.btn || 'vdoc-up');
    var btnText = btn ? btn.textContent : '';
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
    else { if (btn) { btn.disabled = false; btn.textContent = btnText; } cardNotice(r.message_he || 'ההעלאה נכשלה.'); }
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
      '</div>' +
      (res.viewer && res.viewer.can_edit
        ? '<div class="card-tools"><button class="btn-icon primary" type="button" id="v-edit">עריכת פרטי הרכב</button></div>'
        : '') +
      '</div>';

    h += YM.share.html(v.share);
    h += fileChecksHtml(v, res.viewer || {});

    h += section('זיהוי', [
      kv('מספר שלדה', v.vin, 'num'),
      kv('מספר רישוי', v.license_plate_number, 'num'),
      kv('מספר הזמנה', v.order_number),
      kv('מספר לוט', v.stock_lot_number),
      kv('ריפוד', v.upholstery)
    ]);

    h += specHtml(v);

    var feat = v.features || {};
    h += section('רישוי ואבזור', [
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

    h += section('הערות', [
      kv('הערות טיפול', v.handling_notes),
      kv('הערות', v.misc_notes),
      kv('הערת איתורן', v.tracking_note),
      kv('אביזרים שסופקו', v.supplied_accessories)
    ]);

    h += YM.vehicleForm.locksHtml(v);

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
    h += imrHtml(v);
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

  /* ---------- עריכה ופתיחת רכב (vehicle-form.js) ---------- */
  YM.vehicleForm.init({
    session: session,
    host: function () { return document.getElementById('card-body'); },
    showModal: function () { document.getElementById('modal').hidden = false; },
    makes: function () { return ((state.facets || {}).makes || []).map(function (m) { return m.name; }); },
    showCard: function (res) {
      cardRef = (res.vehicle && (res.vehicle.vin || res.vehicle.id)) || cardRef;
      document.getElementById('card-body').innerHTML = cardHtml(res);
      bindCard(res);
    },
    backToCard: function () { openCard(cardRef); },
    reloadList: function () { load(true); },
    toast: function (t) { notice(t, 'ok'); }
  });
  var newBtn = document.getElementById('new-vehicle');
  if (newBtn) newBtn.addEventListener('click', function () { YM.vehicleForm.openCreate(); });

  /* ---------- אירועים ---------- */
  function closeCard() { document.getElementById('modal').hidden = true; YM.photos.close(); }
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
