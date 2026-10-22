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

    h += '<div id="ph-progress" hidden></div>';

    if (s.can) h += '<div class="doc-tools"><button class="btn-icon" type="button" id="ph-up">הוספת תמונות</button>' +
      '<span class="note-inline">JPG/PNG/WebP · עד 15MB לתמונה</span></div>';
    else h += '<p class="note">אין לך הרשאה לשנות את תמונות האתר.</p>';

    host.innerHTML = h;
    bind();
    paint();
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

  /* ---------- העלאה ----------
     תור אחד לכל הדף, לא לכרטיס: אפשר לסגור את הכרטיס או לעבור לרכב אחר
     וההעלאה ממשיכה. ההתקדמות מוצגת בכרטיס של אותו רכב ובפס צף בתחתית
     הדף, ויציאה מהדף באמצע העלאה מבקשת אישור.
     העלאה ב-XMLHttpRequest — fetch לא מדווח על התקדמות שליחה. */
  var MAX = 15 * 1024 * 1024;
  var Q = { items: [], running: false, bytesSent: 0, sendMs: 0, procMs: [], doneTimer: null };
  var seq = 0;

  function queueFor(key) { return Q.items.filter(function (it) { return it.key === key; }); }
  function pending(it) { return it.status === 'wait' || it.status === 'up' || it.status === 'proc'; }
  function busyAny() { return Q.items.some(pending); }

  function enqueue(files) {
    var s = S;
    var c = s.conf;
    files.forEach(function (f) {
      var it = { id: ++seq, key: s.key, subject: s.subject, label: c.label || '', token: c.token,
                 file: f, name: f.name, size: f.size, loaded: 0, status: 'wait', err: null,
                 preview: null, onError: c.onError, onToast: c.onToast };
      if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
        it.status = 'fail'; it.err = 'לא קובץ תמונה';
      } else if (f.size > MAX) {
        it.status = 'fail'; it.err = 'גדול מ-15MB';
      } else {
        try { it.preview = URL.createObjectURL(f); } catch (e) {}
      }
      Q.items.push(it);
    });
    clearTimeout(Q.doneTimer);
    paint();
    run();
  }

  async function run() {
    if (Q.running) return;
    Q.running = true;
    var it;
    while ((it = Q.items.find(function (x) { return x.status === 'wait'; }))) {
      await sendOne(it);
      paint();
    }
    Q.running = false;
    finishBatch();
  }

  function sendOne(it) {
    return new Promise(function (resolve) {
      var fd = new FormData();
      fd.append('token', it.token);
      if (it.subject.trade_in_id) fd.append('trade_in_id', it.subject.trade_in_id);
      else fd.append('vehicle_id', it.subject.vehicle_id);
      fd.append('file', it.file, it.name);

      var xhr = new XMLHttpRequest();
      var t0 = Date.now(), tSent = null, lastLoaded = 0;
      it.status = 'up'; it.loaded = 0; it.err = null; it.t0 = t0;
      paint();

      xhr.upload.onprogress = function (e) {
        var now = e.lengthComputable ? Math.min(e.loaded, it.size) : it.loaded;
        Q.bytesSent += Math.max(0, now - lastLoaded);
        lastLoaded = now;
        it.loaded = now;
        paintSoon();
      };
      xhr.upload.onload = function () {
        Q.bytesSent += Math.max(0, it.size - lastLoaded);
        lastLoaded = it.size;
        it.loaded = it.size;
        tSent = Date.now();
        Q.sendMs += tSent - t0;
        it.status = 'proc';           // הקובץ נשלח; השרת שומר בדרייב ורושם
        paint();
      };
      xhr.onload = function () {
        var r = null;
        try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (tSent) Q.procMs.push(Date.now() - tSent);
        else Q.sendMs += Date.now() - t0;
        if (r && r.ok) {
          it.status = 'ok';
          if (S && S.key === it.key && r.photos) S.photos = r.photos;
          if (S && S.key === it.key) render();
        } else {
          it.status = 'fail';
          it.err = (r && r.message_he) || (xhr.status ? 'השרת החזיר שגיאה (' + xhr.status + ')' : 'ההעלאה נכשלה');
        }
        resolve();
      };
      xhr.onerror = xhr.ontimeout = function () {
        it.status = 'fail'; it.err = 'אין תקשורת עם השרת';
        resolve();
      };
      xhr.open('POST', YM.API_BASE + '/vehicle/photos/upload');
      xhr.timeout = 10 * 60 * 1000;
      xhr.send(fd);
    });
  }

  function finishBatch() {
    var done = Q.items.filter(function (x) { return x.status === 'ok'; });
    var failed = Q.items.filter(function (x) { return x.status === 'fail'; });
    var first = Q.items[0];
    if (first && done.length && !failed.length) {
      first.onToast(done.length === 1 ? 'התמונה הועלתה.' : 'כל ' + done.length + ' התמונות הועלו.');
    } else if (first && failed.length) {
      first.onError(failed.length + ' תמונות לא הועלו — אפשר לנסות שוב מהכרטיס או מהפס בתחתית.');
    }
    if (S) { var k = S.key; if (queueFor(k).some(function (x) { return x.status === 'ok'; })) load(); }
    paint();
    // אם הכל הצליח — מנקים את התור אחרי כמה שניות; אם יש כישלונות, הם נשארים עד "נסו שוב" או "ניקוי"
    if (!failed.length) Q.doneTimer = setTimeout(clearDone, 6000);
  }

  function clearDone() {
    Q.items = Q.items.filter(function (x) {
      var keep = pending(x) || x.status === 'fail';
      if (!keep && x.preview) { try { URL.revokeObjectURL(x.preview); } catch (e) {} }
      return keep;
    });
    if (!Q.items.length) { Q.bytesSent = 0; Q.sendMs = 0; Q.procMs = []; }
    paint();
  }

  function retryFailed(key) {
    Q.items.forEach(function (x) {
      if (x.status === 'fail' && (!key || x.key === key) && x.err !== 'לא קובץ תמונה' && x.err !== 'גדול מ-15MB') {
        x.status = 'wait'; x.err = null; x.loaded = 0;
      }
    });
    clearTimeout(Q.doneTimer);
    paint();
    run();
  }

  function dismissFailed(key) {
    Q.items = Q.items.filter(function (x) {
      var drop = x.status === 'fail' && (!key || x.key === key);
      if (drop && x.preview) { try { URL.revokeObjectURL(x.preview); } catch (e) {} }
      return !drop;
    });
    clearDone();
  }

  /* ---------- חישוב התקדמות וזמן ---------- */
  function stats(list) {
    var total = 0, sent = 0, okN = 0, failN = 0, waitN = 0, cur = null;
    list.forEach(function (x) {
      if (x.status === 'fail') { failN++; return; }
      total += x.size;
      sent += x.status === 'ok' || x.status === 'proc' ? x.size : x.loaded;
      if (x.status === 'ok') okN++;
      if (pending(x)) waitN++;
      if (x.status === 'up' || x.status === 'proc') cur = x;
    });
    var all = list.length - failN;
    // קצב שליחה מהנתונים שנאספו בפועל; זמן עיבוד בשרת — ממוצע הקבצים שכבר הסתיימו (או 4 שניות כהערכה ראשונה)
    var liveMs = Q.sendMs + (cur && cur.status === 'up' && cur.t0 ? Date.now() - cur.t0 : 0);
    var speed = liveMs > 1500 && Q.bytesSent > 0 ? Q.bytesSent / (liveMs / 1000) : 0;
    var proc = Q.procMs.length ? Q.procMs.reduce(function (a, b) { return a + b; }, 0) / Q.procMs.length / 1000 : 4;
    var eta = null;
    if (waitN) {
      var bytesLeft = Math.max(0, total - sent);
      if (speed > 0) eta = bytesLeft / speed + waitN * proc;
      else if (cur && cur.status === 'proc' && waitN === 1) eta = proc;
    }
    var pct = total ? Math.round(sent / total * 100) : (okN ? 100 : 0);
    if (waitN && pct >= 100) pct = 99;          // נשלח הכל אבל השרת עוד מעבד
    return { all: all, ok: okN, fail: failN, wait: waitN, pct: pct, eta: eta, cur: cur,
             pos: okN + (cur ? 1 : 0) };
  }

  function fmtEta(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return 'מחשב זמן…';
    sec = Math.ceil(sec);
    if (sec < 10) return 'עוד כמה שניות';
    if (sec < 60) return 'עוד כ-' + (Math.ceil(sec / 5) * 5) + ' שניות';
    var m = Math.round(sec / 60);
    return m <= 1 ? 'עוד כדקה' : 'עוד כ-' + m + ' דקות';
  }

  function fmtSize(b) {
    return b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
  }

  function headline(st) {
    if (st.wait) {
      var cur = st.cur && st.cur.status === 'proc' ? ' · שומר בשרת' : '';
      return 'מעלה ' + Math.min(st.pos || 1, st.all) + ' מתוך ' + st.all + cur + ' · ' + fmtEta(st.eta);
    }
    if (st.fail && st.ok) return (st.ok === 1 ? 'תמונה אחת הועלתה' : st.ok + ' הועלו') + ' · ' +
                                 (st.fail === 1 ? 'אחת נכשלה' : st.fail + ' נכשלו');
    if (st.fail) return st.fail === 1 ? 'התמונה לא הועלתה' : st.fail + ' תמונות לא הועלו';
    return st.ok === 1 ? 'התמונה הועלתה' : 'כל ' + st.ok + ' התמונות הועלו';
  }

  /* ---------- ציור: בכרטיס הפתוח ובפס הצף ---------- */
  var paintT = null;
  function paintSoon() { if (!paintT) paintT = setTimeout(function () { paintT = null; paint(); }, 200); }

  function paint() {
    paintCard();
    paintDock();
  }

  function itemTile(x) {
    var pct = x.size ? Math.round(x.loaded / x.size * 100) : 0;
    var label = x.status === 'wait' ? 'ממתין'
      : x.status === 'up' ? pct + '%'
      : x.status === 'proc' ? 'שומר…'
      : x.status === 'ok' ? 'הועלה ✓'
      : 'נכשל';
    return '<figure class="ph up-tile st-' + x.status + '" title="' + E(x.name + ' · ' + fmtSize(x.size) + (x.err ? ' · ' + x.err : '')) + '">' +
      (x.preview ? '<img src="' + E(x.preview) + '" alt="">' : '<div class="up-noimg"></div>') +
      '<div class="up-ov"><span>' + E(label) + '</span>' +
        (x.status === 'up' || x.status === 'proc'
          ? '<i class="up-bar"><b style="width:' + (x.status === 'proc' ? 100 : pct) + '%"></b></i>' : '') +
      '</div>' +
      '<figcaption>' + E(x.err || x.name) + '</figcaption></figure>';
  }

  function paintCard() {
    if (!S) return;
    var box = document.getElementById('ph-progress');
    var list = queueFor(S.key);
    if (!box) return;
    if (!list.length) { box.innerHTML = ''; box.hidden = true; return; }
    var st = stats(list);
    box.hidden = false;
    box.className = 'up-box' + (st.wait ? ' is-busy' : st.fail ? ' is-fail' : ' is-done');
    box.innerHTML =
      '<div class="up-head"><strong>' + E(headline(st)) + '</strong>' +
        (st.wait ? '<span class="up-pct">' + st.pct + '%</span>' : '') + '</div>' +
      '<i class="up-bar big"><b style="width:' + (st.wait ? st.pct : 100) + '%"></b></i>' +
      (st.wait ? '<p class="up-warn">אפשר לסגור את הכרטיס ולהמשיך לעבוד — אבל לא לצאת מהדף או לסגור אותו עד שההעלאה מסתיימת.</p>' : '') +
      // תמונה שהועלתה כבר מופיעה ברשת הרגילה למעלה — כאן רק מה שעוד בדרך או נכשל
      (list.some(function (x) { return x.status !== 'ok'; })
        ? '<div class="ph-grid up-grid">' + list.filter(function (x) { return x.status !== 'ok'; }).map(itemTile).join('') + '</div>' : '') +
      (st.fail && !st.wait
        ? '<div class="doc-tools"><button class="btn-icon" type="button" data-up="retry">לנסות שוב את מה שנכשל</button>' +
          '<button class="btn-icon" type="button" data-up="dismiss">ניקוי</button></div>' : '');
    box.querySelectorAll('[data-up]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-up') === 'retry') retryFailed(S.key); else dismissFailed(S.key);
      });
    });
    var up = document.getElementById('ph-up');
    if (up) up.textContent = st.wait ? 'הוספת עוד תמונות לתור' : 'הוספת תמונות';
  }

  function paintDock() {
    var dock = document.getElementById('up-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'up-dock'; dock.className = 'up-dock'; dock.hidden = true;
      dock.setAttribute('role', 'status'); dock.setAttribute('aria-live', 'polite');
      document.body.appendChild(dock);
    }
    if (!Q.items.length) { dock.hidden = true; return; }
    // כשהכרטיס של אותו רכב פתוח ויחיד בתור — החיווי כבר שם, אין צורך בפס
    var keys = Q.items.map(function (x) { return x.key; }).filter(function (k, i, a) { return a.indexOf(k) === i; });
    var cardShows = S && keys.length === 1 && keys[0] === S.key && document.getElementById('ph-progress');
    var modalOpen = cardShows && document.getElementById('ph-progress').offsetParent !== null;
    if (modalOpen) { dock.hidden = true; return; }

    var st = stats(Q.items);
    var labels = Q.items.map(function (x) { return x.label; }).filter(function (l, i, a) { return l && a.indexOf(l) === i; });
    dock.hidden = false;
    dock.className = 'up-dock' + (st.wait ? ' is-busy' : st.fail ? ' is-fail' : ' is-done');
    dock.innerHTML =
      '<div class="up-head"><strong>' + E(headline(st)) + '</strong>' +
        (st.wait ? '<span class="up-pct">' + st.pct + '%</span>' : '<button type="button" class="up-x" aria-label="סגירה">×</button>') + '</div>' +
      (labels.length ? '<div class="up-sub">' + E('רכב: ' + labels.join(' | ')) + '</div>' : '') +
      '<i class="up-bar"><b style="width:' + (st.wait ? st.pct : 100) + '%"></b></i>' +
      (st.wait ? '<div class="up-sub">לא לצאת מהדף עד הסיום</div>' : '') +
      (st.fail && !st.wait ? '<div class="up-acts"><button class="btn-icon" type="button" data-up="retry">לנסות שוב</button>' +
        '<button class="btn-icon" type="button" data-up="dismiss">ניקוי</button></div>' : '');
    var x = dock.querySelector('.up-x');
    if (x) x.addEventListener('click', function () { clearTimeout(Q.doneTimer); clearDone(); });
    dock.querySelectorAll('[data-up]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-up') === 'retry') retryFailed(null); else dismissFailed(null);
      });
    });
  }

  // יציאה מהדף (ניווט בתפריט, רענון, סגירת הלשונית) באמצע העלאה — הדפדפן מבקש אישור
  window.addEventListener('beforeunload', function (e) {
    if (!busyAny()) return;
    e.preventDefault();
    e.returnValue = 'ההעלאה עדיין לא הסתיימה.';
    return e.returnValue;
  });

  function bindUpload(c) {
    var input = document.getElementById(c.inputId);
    if (!input || bound) return;
    bound = true;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (!files.length || !S) return;
      enqueue(files);
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
        label:   conf.label || '',
        onError: conf.onError || noop,
        onToast: conf.onToast || conf.onError || noop
      };
      S = { conf: c, subject: subject, key: subjectKey(subject),
            photos: [], can: false, folder: null, loading: true, err: null };
      bindUpload(c);
      load();
    },
    close: function () { S = null; paintDock(); },
    busy: busyAny
  };
})();
