/* ============================================================
   ידידיה מוטורס — תמונות הרכב לאתר (מודול משותף)

   אותו מודול משרת את מסך המלאי (רכבי יבוא, subject = {vehicle_id})
   ואת מסך הטרייד-אין (רכבים שנרכשו מלקוחות, subject = {trade_in_id}).

   הסדר כאן הוא הסדר באתר: הראשונה היא התמונה הראשית.
   המקור היחיד לאמת הוא vehicle_photos ב-Supabase; התיקייה בדרייב
   מסונכרנת אליו בכל פתיחה, ותמונה שנמחקה בפאנל לא חוזרת משם.
   ============================================================ */
(function () {
  'use strict';
  var YM = window.YM = window.YM || {};

  function E(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function subjectKey(sub) {
    return (sub && (sub.trade_in_id ? 'ti:' + sub.trade_in_id : 'v:' + sub.vehicle_id)) || '';
  }

  var S = null;          // המצב של הכרטיס הפתוח כרגע
  var bound = false;     // מאזין ההעלאה נרשם פעם אחת לדף

  function conf() { return S ? S.conf : null; }

  /* ---------- טעינה ---------- */
  async function load() {
    var s = S, key = s.key;
    render();
    var r;
    try { r = await YM.api('/vehicle/photos', Object.assign({ token: s.conf.token }, s.subject)); }
    catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (!S || S.key !== key) return;            // הכרטיס הוחלף בינתיים
    s.loading = false;
    if (r.ok !== true) { s.err = r.message_he || 'לא ניתן לטעון את התמונות.'; render(); return; }
    s.photos = r.photos || [];
    s.can    = r.can_manage === true;
    s.folder = r.folder_name || null;
    render();
  }

  /* ---------- תצוגה ---------- */
  function render() {
    if (!S) return;
    var host = document.getElementById(S.conf.hostId);
    if (!host) return;
    var s = S;
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
        // בלי loading="lazy": התמונות יושבות בתוך חלון גולל, והדפדפן לא מתחיל לטעון אותן שם
        '<img src="' + E(p.view_url || '') + '" alt="' + E(p.filename || 'תמונת רכב') + '" decoding="async">' +
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
    bind();
  }

  function bind() {
    var host = document.getElementById(S.conf.hostId);
    if (!host || !S.can) return;

    host.querySelectorAll('.ph-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var fig = b.closest('.ph');
        action(b.getAttribute('data-act'), fig.getAttribute('data-id'), Number(fig.getAttribute('data-i')));
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
    var input = document.getElementById(S.conf.inputId);
    if (up && input) up.addEventListener('click', function () { input.value = ''; input.click(); });
  }

  function moveTo(from, to) {
    var list = S.photos.slice();
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    S.photos = list;
    render();                       // תגובה מיידית; השרת מאשר מיד אחר כך
    saveOrder();
  }

  async function saveOrder() {
    var s = S, key = s.key;
    var r;
    try {
      r = await YM.api('/vehicle/photos/reorder', Object.assign({
        token: s.conf.token,
        photo_ids: s.photos.map(function (p) { return p.id; })
      }, s.subject));
    } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (!S || S.key !== key) return;
    if (r.ok !== true) { s.conf.onError(r.message_he || 'שמירת הסדר נכשלה.'); load(); return; }
    s.photos = r.photos || s.photos;
    render();
  }

  async function action(act, id, i) {
    if (act === 'fwd')  { moveTo(i, i - 1); return; }
    if (act === 'back') { moveTo(i, i + 1); return; }

    var s = S, key = s.key;
    var body = { token: s.conf.token }, path;
    if (act === 'primary') { path = '/vehicle/photos/update'; body.photo_id = id; body.is_primary = true; }
    else if (act === 'pub') {
      var p = s.photos[i] || {};
      path = '/vehicle/photos/update'; body.photo_id = id; body.published = !p.published;
    } else if (act === 'del') {
      if (!confirm('להסיר את התמונה מהאתר? הקובץ נשאר בדרייב, אבל הוא לא יחזור לרשימה.')) return;
      path = '/vehicle/photos/delete'; body.photo_id = id;
    } else return;

    var r;
    try { r = await YM.api(path, body); }
    catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
    if (!S || S.key !== key) return;
    if (r.ok !== true) { s.conf.onError(r.message_he || 'הפעולה נכשלה.'); return; }
    s.photos = r.photos || [];
    render();
  }

  /* ---------- העלאה ---------- */
  function bindUpload(c) {
    var input = document.getElementById(c.inputId);
    if (!input || bound) return;
    bound = true;
    input.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length || !S) return;
      var s = S, key = s.key;
      var btn = document.getElementById('ph-up');
      var done = 0, failed = [];

      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (btn) { btn.disabled = true; btn.textContent = 'מעלה ' + (i + 1) + ' מתוך ' + files.length + '…'; }
        if (f.size > 15 * 1024 * 1024) { failed.push(f.name + ' (גדול מ-15MB)'); continue; }
        var fd = new FormData();
        fd.append('token', s.conf.token);
        if (s.subject.trade_in_id) fd.append('trade_in_id', s.subject.trade_in_id);
        else fd.append('vehicle_id', s.subject.vehicle_id);
        fd.append('file', f, f.name);
        var r;
        try {
          var resp = await fetch(YM.API_BASE + '/vehicle/photos/upload', { method: 'POST', body: fd });
          r = await resp.json().catch(function () { return { ok: false }; });
        } catch (err) { r = { ok: false, message_he: 'אין תקשורת עם השרת.' }; }
        if (r.ok) { done++; s.photos = r.photos || s.photos; }
        else failed.push(f.name + (r.message_he ? ' — ' + r.message_he : ''));
      }

      input.value = '';
      if (!S || S.key !== key) return;
      render();
      if (failed.length) s.conf.onError('לא הועלו: ' + failed.join(' · '));
      else if (done) s.conf.onToast(done === 1 ? 'התמונה נוספה.' : done + ' תמונות נוספו.');
    });
  }

  /* ---------- API ציבורי ----------
     conf: { hostId, inputId, token, onError(text), onToast(text) }
     subject: { vehicle_id } או { trade_in_id } */
  YM.photos = {
    open: function (conf, subject) {
      var noop = function () {};
      var c = {
        hostId:  conf.hostId  || 'photos-sect',
        inputId: conf.inputId || 'photo-input',
        token:   conf.token,
        onError: conf.onError || noop,
        onToast: conf.onToast || conf.onError || noop
      };
      S = { conf: c, subject: subject, key: subjectKey(subject),
            photos: [], can: false, folder: null, loading: true, err: null };
      bindUpload(c);
      load();
    },
    close: function () { S = null; }
  };
})();
