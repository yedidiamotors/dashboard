/* ============================================================
   ידידיה מוטורס — לוג משתמשים
   מי היה איפה, כמה זמן, ומה נגע. הכל מגיע מ-admin_user_log
   (Supabase) דרך n8n — ההרשאה view_access_log נבדקת בשרת.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }

  var state = { days: 7, userId: '', kind: '', data: null, loading: false };
  var KINDS = [
    { key: '',       label: 'הכל' },
    { key: 'login',  label: 'כניסות' },
    { key: 'view',   label: 'צפיות' },
    { key: 'action', label: 'פעולות' },
    { key: 'deal',   label: 'עסקאות' }
  ];

  load();

  async function load() {
    if (state.loading) return;
    state.loading = true;
    var res;
    try {
      res = await YM.api('/admin/user-log', {
        token: session.token, days: state.days, user_id: state.userId || null, limit: 300
      });
    } catch (err) { state.loading = false; bootError(err.message); return; }
    state.loading = false;

    if (res.ok !== true) {
      if (res.__status === 401 || ['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE',
                                   'SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession(); location.replace('login.html'); return;
      }
      bootError(res.message_he || 'טעינת הלוג נכשלה.');
      return;
    }
    state.data = res;
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

  /* ---------- תצוגה ---------- */
  function render() {
    var d = state.data;
    YM.renderNav('nav', 'log.html', session.permissions || []);
    document.getElementById('avatar').textContent = YM.initials(session.user && session.user.name);
    document.getElementById('eyebrow').textContent = YM.roleHe(session.user && session.user.role);

    renderDays();
    renderUsers(d.users || []);
    renderKinds();
    renderRows(d.events || []);
    renderSideBox(d);
  }

  function renderDays() {
    var host = document.getElementById('days-filters');
    host.innerHTML = [7, 30, 90].map(function (n) {
      return '<button class="chip' + (state.days === n ? ' is-active' : '') +
        '" type="button" data-days="' + n + '">' + n + ' ימים</button>';
    }).join('');
    host.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () { state.days = Number(c.getAttribute('data-days')); load(); });
    });
  }

  function renderKinds() {
    var host = document.getElementById('kind-filters');
    host.innerHTML = KINDS.map(function (k) {
      return '<button class="chip' + (state.kind === k.key ? ' is-active' : '') +
        '" type="button" data-kind="' + k.key + '">' + k.label + '</button>';
    }).join('');
    host.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        state.kind = c.getAttribute('data-kind'); renderKinds(); renderRows(state.data.events || []);
      });
    });
  }

  function renderUsers(users) {
    var host = document.getElementById('users-strip');
    var all = { id: '', name: 'כל המשתמשים', role: null,
      sessions: sum(users, 'sessions'), active_minutes: sum(users, 'active_minutes'),
      views: sum(users, 'views'), actions: sum(users, 'actions'), last_seen_at: maxDate(users) };
    host.innerHTML = [all].concat(users).map(function (u) {
      var seen = seenText(u.last_seen_at);
      return '<div class="user-card' + (state.userId === (u.id || '') ? ' is-active' : '') +
        '" data-id="' + E(u.id || '') + '" role="button" tabindex="0">' +
        '<div class="head"><div><div class="name">' + E(u.name) + '</div>' +
          (u.role ? '<div class="role">' + E(YM.roleHe(u.role)) + '</div>' : '') + '</div>' +
          '<div class="seen' + (seen.online ? ' online' : '') + '">' + E(seen.text) + '</div></div>' +
        '<div class="stats">' +
          stat(u.sessions, 'כניסות') + stat(minutes(u.active_minutes), 'זמן פעיל') +
          stat(u.views, 'צפיות') + stat(u.actions, 'פעולות') +
        '</div></div>';
    }).join('');
    host.querySelectorAll('.user-card').forEach(function (c) {
      c.addEventListener('click', function () { state.userId = c.getAttribute('data-id'); load(); });
    });
  }

  function stat(v, label) {
    return '<div class="stat"><b>' + E(v === null || v === undefined ? '—' : v) + '</b><span>' + label + '</span></div>';
  }
  function sum(arr, k) { return arr.reduce(function (s, u) { return s + (Number(u[k]) || 0); }, 0); }
  function maxDate(arr) {
    return arr.reduce(function (m, u) { return (u.last_seen_at && (!m || u.last_seen_at > m)) ? u.last_seen_at : m; }, null);
  }
  function minutes(m) {
    m = Number(m) || 0;
    if (m < 60) return m + ' דק׳';
    return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' ש׳';
  }
  function seenText(iso) {
    if (!iso) return { text: 'לא נכנס/ה', online: false };
    var diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 5) return { text: 'מחובר/ת עכשיו', online: true };
    if (diff < 60) return { text: 'לפני ' + Math.round(diff) + ' דק׳', online: false };
    if (diff < 60 * 24) return { text: 'היום ' + YM.hhmm(new Date(iso)), online: false };
    return { text: fmtDate(iso), online: false };
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function dayKey(iso) { var d = new Date(iso); return d.toDateString(); }
  function dayLabel(iso) {
    var d = new Date(iso), t = new Date();
    if (d.toDateString() === t.toDateString()) return 'היום · ' + fmtDate(iso);
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'אתמול · ' + fmtDate(iso);
    return ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][d.getDay()] + ' · ' + fmtDate(iso);
  }

  function renderRows(events) {
    var host = document.getElementById('rows');
    var list = events.filter(function (e) {
      if (!state.kind) return true;
      if (state.kind === 'login') return e.kind === 'login' || e.kind === 'logout';
      return e.kind === state.kind;
    });
    if (!list.length) {
      host.innerHTML = '<div class="empty">אין אירועים בטווח הזה.</div>';
      document.getElementById('foot').innerHTML = '';
      return;
    }
    var h = '', lastDay = '';
    list.forEach(function (e) {
      var k = dayKey(e.at);
      if (k !== lastDay) { h += '<div class="day-sep">' + E(dayLabel(e.at)) + '</div>'; lastDay = k; }
      h += '<div class="log-row">' +
        '<div class="when">' + YM.hhmm(new Date(e.at)) + '<small>' + E(fmtDate(e.at)) + '</small></div>' +
        '<div class="who">' + E(e.user_name || '—') + '</div>' +
        '<div><span class="kind ' + E(e.kind) + '">' + kindHe(e.kind) + '</span></div>' +
        '<div class="what" data-who="' + E(e.user_name || '') + '">' + E(e.label || '—') + '</div>' +
        '<div class="det">' + details(e) + '</div>' +
      '</div>';
    });
    host.innerHTML = h;
    var total = (state.data.events || []).length;
    document.getElementById('foot').innerHTML =
      'מוצגים ' + list.length + (list.length !== total ? ' מתוך ' + total : '') + ' אירועים ב-' + state.days + ' הימים האחרונים' +
      (total >= (state.data.limit || 300) ? ' · הוצגו ' + total + ' האחרונים בלבד' : '');
  }

  function kindHe(k) {
    return { login: 'כניסה', logout: 'יציאה', view: 'צפייה', action: 'פעולה', deal: 'עסקה' }[k] || k;
  }

  function details(e) {
    var d = e.details || {};
    switch (e.kind) {
      case 'login':
        return [
          d.duration_min != null ? 'משך: ' + minutes(d.duration_min) : null,
          d.requests != null ? d.requests + ' בקשות' : null,
          d.ip ? '<span class="mono">' + E(d.ip) + '</span>' : null,
          d.user_agent ? E(ua(d.user_agent)) : null
        ].filter(Boolean).join(' · ');
      case 'view':
        return d.vehicle ? '<span class="mono">' + E(d.vehicle) + '</span>' : '';
      case 'action':
        return actionDetails(d);
      case 'deal':
        return d.field
          ? E(d.field) + ': ' + (d.old != null ? '<span class="mono">' + E(d.old) + '</span> ← ' : '') + '<span class="mono">' + E(d.new == null ? '—' : d.new) + '</span>'
          : '';
      default: return '';
    }
  }

  function actionDetails(d) {
    var x = d.details || {};
    var parts = [];
    if (x.name) parts.push(E(x.name));
    if (x.phone) parts.push(E(YM.phoneHe(x.phone)));
    if (x.role) parts.push(E(YM.roleHe(x.role)));
    if (x.permission_key) parts.push(E(x.permission_key) + (x.enabled === true ? ' ✓' : x.enabled === false ? ' ✗' : ''));
    if (x.target_role) parts.push('תפקיד: ' + E(YM.roleHe(x.target_role)));
    if (x.target_name) parts.push(E(x.target_name));
    if (!parts.length && d.target_type) parts.push(E(d.target_type));
    return parts.join(' · ');
  }

  function ua(s) {
    s = String(s || '');
    var os = /Windows/.test(s) ? 'Windows' : /iPhone/.test(s) ? 'iPhone' : /Android/.test(s) ? 'Android' : /Mac OS/.test(s) ? 'Mac' : '';
    var br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /Firefox\//.test(s) ? 'Firefox' : '';
    return [br, os].filter(Boolean).join(' · ');
  }

  function renderSideBox(d) {
    var users = d.users || [];
    var online = users.filter(function (u) { return seenText(u.last_seen_at).online; }).length;
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box">' +
        '<div class="label">משתמשים במערכת</div>' +
        '<div class="stat-figure">' + users.length + '</div>' +
        '<div class="stat-note">' + online + ' מחוברים עכשיו · ' + (d.events || []).length + ' אירועים</div>' +
      '</div>';
  }

  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });
})();
