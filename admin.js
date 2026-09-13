/* ============================================================
   ידידיה מוטורס — מסך משתמשים והרשאות
   כל הסמכות בבסיס הנתונים; המסך רק מציג ושולח.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var state = { users: [], roles: [], matrix: null, editing: null, tab: 'users' };

  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }


  boot();

  async function boot() {
    var res = await call('/admin/users', {});
    if (!res) return;
    state.users = res.users || [];
    state.roles = res.roles || [];

    document.getElementById('meta-line').textContent =
      state.users.length + ' משתמשים פעילים · ' + YM.roleHe(session.user && session.user.role);
    document.getElementById('avatar').textContent =
      YM.initials(session.user && session.user.name);

    renderNav();
    renderUsers();
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
    loadLockouts();
  }

  /* ---------- נעילות כניסה ----------
     חמישה ניסיונות קוד שגויים או שלוש בקשות קוד בעשר דקות נועלים ל-15 דקות.
     מנהל כללי ומנהל מכירות יכולים לשחרר — עד 3 פעמים לאותו משתמש ב-24 שעות. */
  async function loadLockouts() {
    var host = document.getElementById('lockouts');
    if (!host) return;
    host.innerHTML = '<div class="card pad lockouts"><div class="lk-head">' +
      '<h2>נעילות כניסה</h2><span class="card-count">בודק…</span></div></div>';

    var res = await call('/admin/lockouts', {}, true);
    if (!res) { host.innerHTML = ''; return; }

    var rows = res.lockouts || [];
    host.innerHTML = '<div class="card pad lockouts">' +
      '<div class="lk-head"><h2>נעילות כניסה</h2>' +
        '<button class="btn-icon" type="button" id="lk-refresh">רענון</button></div>' +
      (rows.length
        ? rows.map(function (l) {
            return '<div class="lk-row">' +
              '<div class="lines"><span class="t">' + E(l.name || '—') + '</span>' +
              '<span class="s">' + E(l.reason_he) + ' · נעול עד ' + E(hhmm(l.locked_until)) +
                (l.unlocks_today ? ' · ' + l.unlocks_today + ' שחרורים ב-24 שעות' : '') + '</span></div>' +
              (l.can_release
                ? '<button class="btn-icon lk-free" type="button" data-key="' + E(l.subject_key) + '">שחרור</button>'
                : '<span class="tag">' + (res.can_release ? 'מוצו 3 שחרורים' : 'אין הרשאה') + '</span>') +
            '</div>';
          }).join('') +
          '<div class="hint">שחרור מבטל את הנעילה ומאפשר לבקש קוד חדש ולנסות חמש פעמים נוספות. ' +
          'עד 3 שחרורים לאותו משתמש ב-24 שעות, וכל שחרור נרשם בלוג.</div>'
        : '<div class="empty small">אף אחד לא נעול כרגע.</div>') +
    '</div>';

    var rf = document.getElementById('lk-refresh');
    if (rf) rf.addEventListener('click', loadLockouts);

    host.querySelectorAll('.lk-free').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true; b.textContent = 'משחרר…';
        var r = await call('/admin/lockouts/release', { subject_key: b.getAttribute('data-key') });
        if (r) notice(r.message_he || 'שוחרר.', 'ok');
        loadLockouts();
      });
    });
  }

  function hhmm(iso) {
    if (!iso) return '';
    try { return YM.hhmm(new Date(iso)); } catch (e) { return ''; }
  }

  /* ---------- קריאות API ---------- */
  async function call(path, body, silent) {
    var res;
    try {
      body = body || {};
      body.token = session.token;
      res = await YM.api(path, body);
    } catch (err) {
      notice(err.message, 'err');
      return null;
    }
    if (res.ok !== true) {
      if (['INVALID_TOKEN','SESSION_EXPIRED','USER_INACTIVE','SESSION_INVALID']
            .indexOf(res.error) > -1) {
        YM.clearSession(); location.replace('login.html'); return null;
      }
      if (!silent) notice(res.message_he || 'הפעולה נכשלה.', 'err');
      return null;
    }
    return res;
  }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
    if (kind !== 'err') setTimeout(function () { el.innerHTML = ''; }, 4000);
  }

  /* ---------- ניווט ---------- */
  function renderNav() {
    YM.renderNav('nav', 'users.html', session.permissions || []);
    document.getElementById('side-box').innerHTML =
      '<div class="stat-box">' +
        '<div class="row"><span class="label">משתמשי המערכת</span>' +
        '<span class="badge-admin">הנהלה</span></div>' +
        '<div class="stat-figure">' + state.users.length + '</div>' +
        '<div class="stat-note">' +
          state.users.filter(function (u) { return u.status === 'active'; }).length + ' פעילים · ' +
          state.users.filter(function (u) { return u.status === 'suspended'; }).length + ' מושהים' +
        '</div></div>';
  }

  /* ---------- טבלת המשתמשים ---------- */
  function renderUsers() {
    var el = document.getElementById('user-rows');
    if (!state.users.length) {
      el.innerHTML = '<div class="empty">אין משתמשים להצגה.</div>';
      return;
    }
    el.innerHTML = state.users.map(function (u) {
      var statusPill = u.status === 'active'
        ? '<span class="pill ok">פעיל</span>'
        : '<span class="pill warn">מושהה</span>';
      var last = u.last_login ? relDays(u.last_login) : 'טרם נכנס';
      var ov = u.override_count > 0
        ? ' <span class="u-self">' + u.override_count + ' חריגות</span>' : '';
      return '<div class="user-row" data-id="' + E(u.id) + '">' +
        '<div class="u-name">' + E(u.name) +
          (u.is_self ? '<span class="u-self">אני</span>' : '') +
          '<div class="u-meta">' + E(YM.roleHe(u.role)) + ' · ' + E(YM.phoneHe(u.phone)) + '</div></div>' +
        '<div class="ltr c-phone">' + E(YM.phoneHe(u.phone)) + '</div>' +
        '<div class="ltr c-email">' + E(u.email || '—') + '</div>' +
        '<div class="c-role">' + E(YM.roleHe(u.role)) + '</div>' +
        '<div>' + statusPill + '</div>' +
        '<div class="c-perms">' + u.permission_count + ov + '</div>' +
        '<div class="c-login">' + E(last) + '</div>' +
        '<div class="row-actions">' +
          '<button class="btn-icon" type="button" data-act="edit">עריכה</button>' +
          '<button class="btn-icon danger" type="button" data-act="remove"' +
            (u.is_self ? ' disabled title="אי אפשר להסיר את עצמך"' : '') + '>הסרה</button>' +
        '</div></div>';
    }).join('');

    el.querySelectorAll('.user-row').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('[data-act="edit"]').addEventListener('click', function () { openModal(id); });
      var rm = row.querySelector('[data-act="remove"]');
      if (!rm.disabled) rm.addEventListener('click', function () { removeUser(id); });
    });
  }

  function relDays(iso) {
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d <= 0) return 'היום';
    if (d === 1) return 'אתמול';
    if (d < 30) return 'לפני ' + d + ' ימים';
    return 'לפני ' + Math.round(d / 30) + ' חודשים';
  }

  async function removeUser(id) {
    var u = state.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    if (!confirm('להסיר את ' + u.name + ' מהמערכת?\nהסשנים שלו ינותקו מיד. הפעולה נרשמת בלוג.')) return;
    var res = await call('/admin/user/remove', { user_id: id });
    if (!res) return;
    notice(res.removed_name + ' הוסר מהמערכת.', 'info');
    await boot();
  }

  /* ---------- חלון עריכה ---------- */
  function openModal(id) {
    var u = id ? state.users.filter(function (x) { return x.id === id; })[0] : null;
    state.editing = u || null;

    document.getElementById('modal-title').textContent = u ? 'עריכת משתמש' : 'משתמש חדש';
    document.getElementById('f-name').value   = u ? u.name : '';
    document.getElementById('f-phone').value  = u ? YM.phoneHe(u.phone) : '';
    document.getElementById('f-email').value  = u && u.email ? u.email : '';
    document.getElementById('f-status').value = u ? (u.status === 'suspended' ? 'suspended' : 'active') : 'active';

    var sel = document.getElementById('f-role');
    sel.innerHTML = state.roles.map(function (r) {
      return '<option value="' + E(r.key) + '">' + E(r.label_he) + '</option>';
    }).join('');
    sel.value = u ? u.role : 'sales';
    updateRoleHint();

    var msg = document.getElementById('form-msg');
    msg.className = 'msg err hidden';

    document.getElementById('overrides-box').hidden = true;
    if (u) loadOverrides(u);

    document.getElementById('modal').hidden = false;
    document.getElementById('f-name').focus();
  }

  function updateRoleHint() {
    var hints = {
      admin: 'רואה הכל, כולל מחירי רכישה ושווי מלאי. יכול לנהל משתמשים והרשאות.',
      sales_manager: 'מכירות, לקוחות וטרייד-אין כולל מחירים. בלי נתוני יבוא.',
      import_manager: 'יבוא, מכס, ספקים ונזקים. בלי גישה למכירות ולקוחות.',
      sales: 'מלאי בארץ ולקוחות. בלי מחירי רכישה ובלי נתוני יבוא.'
    };
    document.getElementById('role-hint').textContent =
      hints[document.getElementById('f-role').value] || '';
  }

  async function loadOverrides(u) {
    if ((session.permissions || []).indexOf('manage_permissions') === -1) return;
    var m = state.matrix || await call('/admin/permissions', {}, true);
    if (!m) return;
    state.matrix = m;

    var mine = (m.overrides || []).filter(function (o) { return o.user_id === u.id; });
    var byKey = {};
    mine.forEach(function (o) { byKey[o.permission_key] = o.enabled; });

    document.getElementById('overrides-list').innerHTML = m.permissions.map(function (p) {
      var fromRole = !!(p.roles || {})[u.role];
      var ov = byKey.hasOwnProperty(p.key) ? byKey[p.key] : null;
      if (ov === null && !fromRole) return '';
      return ovRow(p, ov);
    }).join('') +
      '<div class="ov-row"><div><span class="ov-label">הוספת חריגה</span>' +
      '<span class="ov-src">בחר הרשאה שאינה בתפקיד שלו</span></div>' +
      '<select id="ov-add" style="height:34px;background:#101216;border:1px solid var(--border-input);' +
      'border-radius:5px;color:var(--text-body);font-size:12.5px;padding:0 8px">' +
      '<option value="">—</option>' +
      m.permissions.filter(function (p) {
        return !(p.roles || {})[u.role] && !byKey.hasOwnProperty(p.key);
      }).map(function (p) {
        return '<option value="' + E(p.key) + '">' + E(p.label_he) + '</option>';
      }).join('') + '</select></div>';

    wireOverrides(u);
    document.getElementById('overrides-box').hidden = false;
  }

  function ovRow(p, ov) {
    var src = ov === null ? 'מהתפקיד' : (ov ? 'חריגה: מודלק' : 'חריגה: מכובה');
    return '<div class="ov-row" data-key="' + E(p.key) + '">' +
      '<div><span class="ov-label">' + E(p.label_he) + '</span>' +
      '<span class="ov-src">' + E(src) + '</span></div>' +
      '<div class="ov-pick">' +
        '<button type="button" data-v="on"' + (ov === true ? ' class="is-on"' : '') + '>מודלק</button>' +
        '<button type="button" data-v="off"' + (ov === false ? ' class="is-on"' : '') + '>מכובה</button>' +
        '<button type="button" data-v="clear"' + (ov === null ? ' class="is-on"' : '') + '>לפי תפקיד</button>' +
      '</div></div>';
  }

  function wireOverrides(u) {
    var box = document.getElementById('overrides-list');
    box.querySelectorAll('.ov-row[data-key]').forEach(function (row) {
      var key = row.getAttribute('data-key');
      row.querySelectorAll('.ov-pick button').forEach(function (b) {
        b.addEventListener('click', async function () {
          var v = b.getAttribute('data-v');
          var res = await call('/admin/permission/user', {
            user_id: u.id, permission_key: key,
            enabled: v === 'on' ? true : v === 'off' ? false : null
          });
          if (!res) return;
          state.matrix = null;
          notice('החריגה עודכנה.', 'info');
          await loadOverrides(u);
        });
      });
    });
    var add = document.getElementById('ov-add');
    if (add) add.addEventListener('change', async function () {
      if (!add.value) return;
      var res = await call('/admin/permission/user',
        { user_id: u.id, permission_key: add.value, enabled: true });
      if (!res) return;
      state.matrix = null;
      notice('החריגה נוספה.', 'info');
      await loadOverrides(u);
    });
  }

  document.getElementById('f-role').addEventListener('change', updateRoleHint);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal();
  });
  function closeModal() {
    document.getElementById('modal').hidden = true;
    state.editing = null;
  }

  var lastError = null;
  var origApi = YM.api;
  YM.api = function (path, body) {
    return origApi(path, body).then(function (r) {
      if (r && r.ok !== true) lastError = r.message_he || null;
      return r;
    });
  };

  document.getElementById('user-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = document.getElementById('form-msg');
    msg.className = 'msg err hidden';
    var btn = document.getElementById('modal-save');
    btn.disabled = true; btn.textContent = 'שומר…';

    var payload = {
      name: document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      role: document.getElementById('f-role').value,
      status: document.getElementById('f-status').value
    };
    if (state.editing) payload.id = state.editing.id;

    var res = await call('/admin/user/save', { user: payload }, true);
    btn.disabled = false; btn.textContent = 'שמירה';

    if (!res) {
      msg.textContent = lastError || 'השמירה נכשלה.';
      msg.className = 'msg err';
      return;
    }
    closeModal();
    notice(res.restored ? res.user.name + ' הוחזר למערכת.'
         : res.created  ? res.user.name + ' נוסף למערכת.'
                        : 'הפרטים נשמרו.', 'info');
    await boot();
  });

  document.getElementById('add-user').addEventListener('click', function () { openModal(null); });
  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });

  /* ---------- לשוניות ---------- */
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', async function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('is-active'); });
      t.classList.add('is-active');
      var tab = t.getAttribute('data-tab');
      document.getElementById('panel-users').hidden = tab !== 'users';
      document.getElementById('panel-perms').hidden = tab !== 'perms';
      if (tab === 'perms') await renderMatrix();
    });
  });

  /* ---------- מטריצת ההרשאות ---------- */
  async function renderMatrix() {
    var host = document.getElementById('matrix');
    if ((session.permissions || []).indexOf('manage_permissions') === -1) {
      host.innerHTML = '<div class="empty">אין לך הרשאה לערוך את מטריצת ההרשאות.</div>';
      return;
    }
    if (!state.matrix) {
      host.innerHTML = '<div class="empty">טוען…</div>';
      state.matrix = await call('/admin/permissions', {});
      if (!state.matrix) return;
    }
    var m = state.matrix;
    var locked = m.locked || [];

    document.getElementById('perm-count').textContent =
      m.permissions.length + ' הרשאות · ' + m.roles.length + ' תפקידים';
    document.getElementById('perm-foot').textContent =
      'שינוי נשמר מיד ומשפיע על כל המשתמשים באותו תפקיד. כל שינוי נרשם בלוג הפעילות.';

    var CATS = { import: 'יבוא', customers: 'לקוחות', documents: 'מסמכים',
                 trade_in: 'טרייד-אין', logs: 'לוגים', admin: 'ניהול' };
    var html = '<div class="matrix-head"><div>הרשאה</div>' +
      m.roles.map(function (r) { return '<div>' + E(r.label_he) + '</div>'; }).join('') + '</div>';

    var cat = null;
    m.permissions.forEach(function (p) {
      if (p.category !== cat) {
        cat = p.category;
        html += '<div class="matrix-cat">' + E(CATS[cat] || cat) + '</div>';
      }
      html += '<div class="matrix-row">' +
        '<div><span class="p-label">' + E(p.label_he) + '</span>' +
        '<span class="p-key">' + E(p.key) + '</span></div>' +
        m.roles.map(function (r) {
          var isLocked = r.key === 'admin' && locked.indexOf(p.key) > -1;
          var on = !!(p.roles || {})[r.key];
          return '<div><input class="sw" type="checkbox"' + (on ? ' checked' : '') +
            (isLocked ? ' disabled' : '') +
            ' data-role="' + E(r.key) + '" data-key="' + E(p.key) + '">' +
            (isLocked ? '<span class="locked-note">נעול</span>' : '') + '</div>';
        }).join('') + '</div>';
    });
    host.innerHTML = html;

    host.querySelectorAll('.sw').forEach(function (sw) {
      sw.addEventListener('change', async function () {
        var role = sw.getAttribute('data-role');
        var key  = sw.getAttribute('data-key');
        var want = sw.checked;
        sw.classList.add('is-saving'); sw.disabled = true;
        var res = await call('/admin/permission/role',
          { role: role, permission_key: key, enabled: want });
        sw.classList.remove('is-saving'); sw.disabled = false;
        if (!res) { sw.checked = !want; return; }
        var p = state.matrix.permissions.filter(function (x) { return x.key === key; })[0];
        if (p) { p.roles = p.roles || {}; p.roles[role] = want; }
        notice('ההרשאה עודכנה.', 'info');
      });
    });
  }
})();
