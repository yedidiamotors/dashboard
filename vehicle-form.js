/* ============================================================
   ידידיה מוטורס — עריכת פרטי רכב ופתיחת רכב חדש
   ההרשאות נבדקות בשרת (vehicle_save / vehicle_create).
   שדה שנערך כאן ננעל מול הגיליון: ייבוא הגיליון לא דורס אותו
   עד שמשחררים אותו בחזרה ("לחזור לעדכון מהגיליון").
   ============================================================ */
(function (global) {
  'use strict';

  var YM = global.YM;
  var E = YM.escapeHtml;
  var ctx = null;

  var LOCATIONS = ['אולם', 'חזית', 'מחסן', 'מחסן אולם', 'צדדי', 'גדר'];

  /* type: text | num | date | select | bool3 | tick | area */
  var GROUPS = [
    { title: 'זיהוי', fields: [
      { k: 'vin', label: 'מספר שלדה (VIN)', type: 'text', ltr: true, req: true },
      { k: 'license_plate_number', label: 'מספר רישוי', type: 'text', ltr: true, mode: 'numeric' },
      { k: 'order_number', label: 'מספר הזמנה', type: 'text', ltr: true },
      { k: 'stock_lot_number', label: 'מספר לוט', type: 'text', ltr: true }
    ]},
    { title: 'הרכב', fields: [
      { k: 'make', label: 'יצרן', type: 'text', list: 'makes', hint: 'ריק = מזוהה אוטומטית מה-VIN' },
      { k: 'model', label: 'דגם', type: 'text', req: true },
      { k: 'trim', label: 'גימור', type: 'text' },
      { k: 'model_year', label: 'שנת דגם', type: 'num', ltr: true, hint: 'ריק = לפי ה-VIN' },
      { k: 'color', label: 'צבע', type: 'text' },
      { k: 'upholstery', label: 'ריפוד', type: 'text' },
      { k: 'production_date', label: 'תאריך ייצור', type: 'date' },
      { k: 'standard_type', label: 'תקן', type: 'select', opts: [['', '—'], ['canadian', 'קנדית'], ['federal', 'פדרלית'], ['other', 'אחר']] }
    ]},
    { title: 'מיקום ורישוי', fields: [
      { k: 'location', label: 'מיקום', type: 'text', list: 'locations' },
      { k: 'roadworthiness_test_until', label: 'טסט עד', type: 'date' },
      { k: 'co2_emission_class', label: 'דרגת זיהום (1–15)', type: 'num', ltr: true },
      { k: 'has_spare_key', label: 'מפתח ספייר', type: 'bool3' },
      { k: 'licensing_completed', label: 'רישוי הושלם', type: 'tick' },
      { k: 'tracking_device_installed', label: 'איתורן הותקן', type: 'tick' }
    ]},
    { title: 'אבזור', fields: [
      { k: 'auto_park', label: 'חניה אוטומטית', type: 'tick', feature: true },
      { k: 'tow_hitch', label: 'וו גרירה', type: 'tick', feature: true },
      { k: 'remote_start', label: 'התנעה מרחוק', type: 'tick', feature: true }
    ]},
    { title: 'מחירון לוי יצחק', fields: [
      { k: 'levi_yitzhak_code', label: 'קוד', type: 'text', ltr: true },
      { k: 'levi_yitzhak_price', label: 'מחיר (₪)', type: 'num', ltr: true, mode: 'decimal' }
    ]},
    { title: 'הערות', fields: [
      { k: 'handling_notes', label: 'הערות טיפול', type: 'area' },
      { k: 'misc_notes', label: 'הערות', type: 'area' },
      { k: 'tracking_note', label: 'הערת איתורן', type: 'area' },
      { k: 'supplied_accessories', label: 'אביזרים שסופקו', type: 'area' }
    ]}
  ];

  var ALL = [];
  GROUPS.forEach(function (g) { g.fields.forEach(function (f) { ALL.push(f); }); });

  function lockKey(f) { return f.feature ? 'features.' + f.k : f.k; }

  var LABELS = {};
  ALL.forEach(function (f) { LABELS[lockKey(f)] = f.label.replace(/ \(.*\)$/, ''); });

  /* ---------- ערכים ---------- */
  function original(v, f) {
    var raw = f.feature ? (v.features || {})[f.k] : v[f.k];
    if (f.type === 'tick') return raw === true;
    if (f.type === 'bool3') return raw === true ? 'true' : raw === false ? 'false' : '';
    if (raw === null || raw === undefined) return '';
    if (f.type === 'date') return String(raw).slice(0, 10);
    return norm(raw);
  }

  function current(form, f) {
    var el = form.elements[f.k];
    if (!el) return null;
    if (f.type === 'tick') return el.checked;
    return norm(el.value);
  }

  // אותו נרמול שהשרת עושה — כדי שרווח מיותר בגיליון לא ייחשב "שינוי" וינעל שדה
  function norm(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }

  function payloadValue(f, val) {
    if (f.type === 'tick') return !!val;
    if (f.type === 'bool3') return val === '' ? null : val === 'true';
    return val;
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' +
      d.getFullYear() + ' ' + YM.hhmm(d);
  }

  /* ---------- סימון נעילות בכרטיס ---------- */
  function locksHtml(v) {
    var m = v.manual_fields || {};
    var keys = Object.keys(m).filter(function (k) { return k !== 'features.standard' && LABELS[k]; });
    if (!keys.length) return '';
    var note = v.from_sheet
      ? 'השדות האלה נערכו ידנית בפאנל — עדכון מהגיליון לא משנה אותם. אפשר להחזיר כל שדה לעדכון מהגיליון במסך העריכה.'
      : 'השדות האלה הוזנו ידנית בפאנל. אם הרכב יתווסף לגיליון, הגיליון ישלים רק שדות ריקים.';
    return '<div class="sect"><h3>נערך ידנית — גובר על הגיליון</h3>' +
      '<p class="note">' + E(note) + '</p><div class="chips">' +
      keys.map(function (k) {
        var s = m[k] || {};
        return '<span class="doc lock-chip" title="' + E([s.by_name, fmtWhen(s.at)].filter(Boolean).join(' · ')) + '">' +
          E(LABELS[k]) + '<span class="m">' + E([s.by_name, fmtWhen(s.at)].filter(Boolean).join(' · ')) + '</span></span>';
      }).join('') + '</div></div>';
  }

  /* ---------- בניית הטופס ---------- */
  function fieldHtml(f, v, mode) {
    var id = 'vf-' + f.k;
    var val = v ? original(v, f) : (f.type === 'tick' ? false : '');
    var lock = v && v.manual_fields ? v.manual_fields[lockKey(f)] : null;
    var vinLocked = mode === 'edit' && f.k === 'vin' && v && v.from_sheet;
    var input;

    if (f.type === 'select' || f.type === 'bool3') {
      var opts = f.type === 'bool3' ? [['', 'לא ידוע'], ['true', 'כן'], ['false', 'לא']] : f.opts;
      input = '<select id="' + id + '" name="' + f.k + '">' + opts.map(function (o) {
        return '<option value="' + E(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + E(o[1]) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'tick') {
      return '<div class="vf-tick" data-field="' + f.k + '"><label class="tick"><input type="checkbox" name="' + f.k + '"' +
        (val ? ' checked' : '') + '> ' + E(f.label) + '</label>' + lockLine(f, lock, v, mode) +
        '<span class="f-err" hidden></span></div>';
    } else if (f.type === 'area') {
      input = '<textarea id="' + id + '" name="' + f.k + '" rows="2">' + E(val) + '</textarea>';
    } else {
      input = '<input id="' + id + '" name="' + f.k + '" type="' + (f.type === 'date' ? 'date' : 'text') + '"' +
        (f.ltr || f.type === 'date' ? ' dir="ltr"' : '') +
        (f.type === 'num' ? ' inputmode="' + (f.mode || 'numeric') + '"' : f.mode ? ' inputmode="' + f.mode + '"' : '') +
        (f.list ? ' list="vf-list-' + f.list + '"' : '') +
        (vinLocked ? ' readonly' : '') +
        (f.k === 'vin' ? ' autocapitalize="characters" spellcheck="false"' : '') +
        ' value="' + E(val) + '">';
    }

    var hint = vinLocked ? 'מספר השלדה של רכב מהגיליון הוא מפתח ההתאמה — מתקנים אותו בגיליון.'
             : (mode === 'create' && f.hint) ? f.hint : '';
    return '<div class="field' + (f.type === 'area' ? ' wide' : '') + '" data-field="' + f.k + '">' +
      '<label for="' + id + '">' + E(f.label) + (f.req ? ' *' : '') + '</label>' + input +
      (hint ? '<span class="f-hint">' + E(hint) + '</span>' : '') +
      lockLine(f, lock, v, mode) + '<span class="f-err" hidden></span></div>';
  }

  function lockLine(f, lock, v, mode) {
    if (mode !== 'edit' || !lock) return '';
    var who = [lock.by_name, fmtWhen(lock.at)].filter(Boolean).join(' · ');
    return '<span class="f-lock">נערך ידנית' + (who ? ' · ' + E(who) : '') +
      (v.from_sheet
        ? ' <label class="rel"><input type="checkbox" data-release="' + E(lockKey(f)) + '"> לחזור לעדכון מהגיליון</label>'
        : '') + '</span>';
  }

  function formHtml(v, mode) {
    var makes = ctx.makes ? ctx.makes() : [];
    var h = '<h2 class="edit-h">' + (mode === 'edit'
      ? 'עריכת פרטי הרכב'
      : 'רכב חדש במלאי') + '</h2>';
    if (mode === 'edit') {
      h += '<p class="note vf-sub">' + E([v.title, v.model_year, v.vin].filter(Boolean).join(' · ')) + '</p>';
      h += '<div class="hint vf-intro">' + (v.from_sheet
        ? 'הרכב מגיע מגיליון המלאי. שדה שתשנו כאן יינעל — הגיליון לא ידרוס אותו בסנכרון הבא.'
        : 'הרכב לא מגיע מהגיליון — מה שנשמר כאן הוא מקור הנתונים.') + '</div>';
    } else {
      h += '<div class="hint vf-intro">מה שתזינו כאן גובר על הגיליון: אם הרכב יופיע בגיליון (לפי מספר השלדה), ' +
        'הגיליון ישלים רק את השדות שנשארו ריקים. מחירי רכב נקבעים בנפרד ע״י מנהל הרכש.</div>';
    }

    h += '<form id="vf-form" class="form vf-form" novalidate>';
    if (mode === 'create') {
      h += '<div class="vf-group"><h4>סטטוס</h4><div class="field" data-field="status">' +
        '<label for="vf-status">איפה הרכב</label><select id="vf-status" name="status">' +
        '<option value="in_stock_israel">במלאי בארץ</option>' +
        '<option value="pending_approval">הזמנה חדשה — ממתינה לאישור מנהל הרכש</option>' +
        '</select><span class="f-hint">הזמנה חדשה מופיעה במסך "הזמנות בדרך" ונדרש בה מספר הזמנה.</span></div></div>';
    }
    GROUPS.forEach(function (g) {
      var ticks = g.fields.every(function (f) { return f.type === 'tick'; });
      h += '<div class="vf-group"><h4>' + E(g.title) + '</h4><div class="' + (ticks ? 'vf-ticks' : 'grid2') + '">' +
        g.fields.map(function (f) { return fieldHtml(f, v, mode); }).join('') + '</div></div>';
    });
    h += '<datalist id="vf-list-makes">' + makes.map(function (m) { return '<option value="' + E(m) + '">'; }).join('') + '</datalist>';
    h += '<datalist id="vf-list-locations">' + LOCATIONS.map(function (m) { return '<option value="' + E(m) + '">'; }).join('') + '</datalist>';
    h += '<div class="vf-foot"><div id="vf-msg"></div>' +
      '<div class="modal-actions"><button class="btn-primary" type="submit" id="vf-submit">' +
      (mode === 'edit' ? 'שמירה' : 'פתיחת הרכב') + '</button>' +
      '<button class="btn-ghost" type="button" id="vf-cancel">' + (mode === 'edit' ? 'חזרה לכרטיס' : 'ביטול') + '</button></div></div>';
    h += '</form>';
    return h;
  }

  /* ---------- שגיאות ---------- */
  function showErrors(form, res) {
    form.querySelectorAll('.has-err').forEach(function (el) { el.classList.remove('has-err'); });
    form.querySelectorAll('.f-err').forEach(function (el) { el.hidden = true; el.textContent = ''; });
    var errs = (res && res.errors) || {};
    var first = null;
    Object.keys(errs).forEach(function (k) {
      var box = form.querySelector('[data-field="' + k + '"]');
      if (!box) return;
      box.classList.add('has-err');
      var e = box.querySelector('.f-err');
      if (e) { e.textContent = errs[k]; e.hidden = false; }
      if (!first) first = box;
    });
    var msg = document.getElementById('vf-msg');
    msg.innerHTML = res && res.ok === false
      ? '<div class="banner">' + E(Object.keys(errs).length ? 'יש שדות שצריך לתקן — מסומנים באדום.' : (res.message_he || 'הפעולה נכשלה.')) + '</div>'
      : '';
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function busy(on, label) {
    var b = document.getElementById('vf-submit');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
  }

  function expired(res) {
    if (res.__status === 401 || ['INVALID_TOKEN', 'SESSION_EXPIRED', 'USER_INACTIVE', 'SESSION_INVALID'].indexOf(res.error) > -1) {
      YM.clearSession(); location.replace('login.html'); return true;
    }
    return false;
  }

  /* ---------- עריכה ---------- */
  function openEdit(cardRes) {
    var v = cardRes.vehicle || {};
    var host = ctx.host();
    host.innerHTML = formHtml(v, 'edit');
    document.getElementById('modal').scrollTop = 0;
    var form = document.getElementById('vf-form');

    document.getElementById('vf-cancel').addEventListener('click', function () { ctx.backToCard(); });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fields = {}, n = 0;
      ALL.forEach(function (f) {
        if (f.k === 'vin' && v.from_sheet) return;
        var now = current(form, f);
        if (now === null) return;
        if (now !== original(v, f)) { fields[f.k] = payloadValue(f, now); n++; }
      });
      var release = [];
      form.querySelectorAll('input[data-release]:checked').forEach(function (c) {
        var k = c.getAttribute('data-release');
        release.push(k);
        if (k === 'standard_type') release.push('features.standard');
      });
      if (!n && !release.length) { showErrors(form, { ok: false, message_he: 'לא שיניתם אף שדה.' }); return; }

      busy(true, 'שומר…');
      var res;
      try {
        res = await YM.api('/inventory/save', { token: ctx.session.token, vehicle_id: v.id, fields: fields, release: release });
      } catch (err) { busy(false); showErrors(form, { ok: false, message_he: err.message }); return; }
      busy(false);
      if (res.ok !== true) { if (!expired(res)) showErrors(form, res); return; }

      ctx.toast(res.message_he || 'נשמר.');
      if (res.card && res.card.ok) ctx.showCard(res.card); else ctx.backToCard();
      ctx.reloadList();
    });
  }

  /* ---------- רכב חדש ---------- */
  function openCreate() {
    var host = ctx.host();
    host.innerHTML = formHtml(null, 'create');
    ctx.showModal();
    document.getElementById('modal').scrollTop = 0;
    var form = document.getElementById('vf-form');
    document.getElementById('vf-cancel').addEventListener('click', function () {
      document.getElementById('modal').hidden = true;
    });
    form.elements.vin.focus();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fields = {};
      ALL.forEach(function (f) {
        var now = current(form, f);
        if (f.type === 'tick') { if (now) fields[f.k] = true; return; }
        if (now !== null && now !== '') fields[f.k] = payloadValue(f, now);
      });
      busy(true, 'פותח…');
      var res;
      try {
        res = await YM.api('/inventory/create', { token: ctx.session.token, status: form.elements.status.value, fields: fields });
      } catch (err) { busy(false); showErrors(form, { ok: false, message_he: err.message }); return; }
      busy(false);
      if (res.ok !== true) { if (!expired(res)) showErrors(form, res); return; }

      ctx.toast(res.message_he || 'הרכב נפתח.');
      if (res.card && res.card.ok) ctx.showCard(res.card);
      ctx.reloadList();
    });
  }

  YM.vehicleForm = {
    init: function (c) { ctx = c; },
    openEdit: openEdit,
    openCreate: openCreate,
    locksHtml: locksHtml
  };
})(window);
