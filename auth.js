/* ============================================================
   ידידיה מוטורס — שכבת הזדהות משותפת
   כל הקריאות עוברות דרך n8n; הדפדפן לא נוגע ב-Supabase.
   ============================================================ */
(function (global) {
  'use strict';

  var API_BASE = 'https://yedidiamotors.duckdns.org/webhook';
  var STORAGE_KEY = 'ym_staff_session';

  function api(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        data.__status = r.status;
        return data;
      });
    }).catch(function () {
      throw new Error('אין תקשורת עם השרת. בדקו את החיבור לאינטרנט ונסו שוב.');
    });
  }

  function looksLikePhone(v) {
    var digits = String(v || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function saveSession(verifyResponse) {
    var payload = {
      token: verifyResponse.session_token,
      expires_at: verifyResponse.expires_at || null,
      user: verifyResponse.user || null,
      permissions: verifyResponse.permissions || []
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    return payload;
  }

  function getSession() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return null; }
    if (!s || !s.token) return null;
    if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return s;
  }

  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function logout() {
    var s = getSession();
    clearSession();
    var done = function () { location.replace('login.html'); };
    if (!s) { done(); return; }
    api('/staff-auth/logout', { token: s.token }).then(done, done);
  }

  /* ---- עזרי תצוגה ---- */
  var ROLE_HE = {
    admin: 'מנהל מערכת',
    sales_manager: 'מנהל מכירות',
    import_manager: 'מנהל יבוא',
    sales: 'איש מכירות'
  };

  function roleHe(role) { return ROLE_HE[role] || role || '—'; }

  // 972544480122 → 054-448-0122
  function phoneHe(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    if (d.length === 10) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
    if (d.length === 9)  return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
    return p || '—';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2);
    return parts[0][0] + '.' + parts[1][0];
  }

  function nis(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '₪' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function shortNis(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var v = Number(n);
    if (v >= 1e6) return '₪' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '₪' + Math.round(v / 1e3) + 'K';
    return '₪' + v;
  }

  function greetingFor(date) {
    var h = date.getHours();
    if (h < 5)  return 'לילה טוב';
    if (h < 12) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 21) return 'ערב טוב';
    return 'לילה טוב';
  }

  function hhmm(date) {
    return String(date.getHours()).padStart(2, '0') + ':' +
           String(date.getMinutes()).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }


  /* ---- ניווט משותף לכל המסכים ---- */
  var NAV = [
    { label: 'סקירה כללית',       href: 'index.html' },
    { label: 'מלאי רכבים', href: 'inventory.html', perm: 'view_vehicle_files' },
    { label: 'הזמנות בדרך',        href: 'orders.html', perm: 'view_vehicle_files', notRoles: ['sales'] },
    { label: 'לקוחות ועסקאות',     href: 'customers.html', perm: 'create_customer_deal' },
    { label: 'משתמשים והרשאות',    href: 'users.html', perm: 'manage_staff_users' },
    { label: 'לוג משתמשים',        href: 'log.html',   perm: 'view_access_log' }
  ];

  /* ---- תפריט המבורגר למסכי טלפון ---- */
  function mountDrawer(host) {
    var aside = host.closest ? host.closest('.aside') : null;
    if (!aside || aside.querySelector('.nav-toggle')) return;

    var drawer = document.createElement('div');
    drawer.className = 'aside-drawer';
    aside.insertBefore(drawer, host);
    drawer.appendChild(host);
    var foot = aside.querySelector('.aside-foot');
    if (foot) drawer.appendChild(foot);

    var btn = document.createElement('button');
    btn.className = 'nav-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', '\u05ea\u05e4\u05e8\u05d9\u05d8');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';
    aside.insertBefore(btn, aside.firstChild);

    function setOpen(on) {
      aside.classList.toggle('is-open', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!aside.classList.contains('is-open'));
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('.nav-item, .signout')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!aside.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) setOpen(false);
    });
  }

  function renderNav(containerId, currentHref, permissions) {
    var host = document.getElementById(containerId);
    if (!host) return;
    var perms = permissions || [];
    var s = getSession();
    var role = s && s.user ? s.user.role : '';
    host.innerHTML = NAV.map(function (n) {
      if (n.perm && perms.indexOf(n.perm) === -1) return '';
      if (n.notRoles && n.notRoles.indexOf(role) > -1) return '';
      var active = n.href && n.href === currentHref;
      var cls = 'nav-item' + (active ? ' is-active' : (n.soon ? ' is-soon' : ''));
      return '<button class="' + cls + '" type="button" data-href="' + (n.href || '') + '"' +
             (n.soon ? ' title="\u05d1\u05d1\u05e0\u05d9\u05d9\u05d4"' : '') +
             '><span class="dot"></span>' + escapeHtml(n.label) + '</button>';
    }).join('');
    host.querySelectorAll('.nav-item').forEach(function (b) {
      var href = b.getAttribute('data-href');
      if (href && !b.classList.contains('is-active')) {
        b.addEventListener('click', function () { location.href = href; });
      }
    });
    mountDrawer(host);
  }

  global.YM = {
    API_BASE: API_BASE,
    api: api,
    looksLikePhone: looksLikePhone,
    saveSession: saveSession,
    getSession: getSession,
    clearSession: clearSession,
    logout: logout,
    roleHe: roleHe,
    initials: initials,
    nis: nis,
    shortNis: shortNis,
    greetingFor: greetingFor,
    hhmm: hhmm,
    escapeHtml: escapeHtml,
    renderNav: renderNav,
    phoneHe: phoneHe
  };
})(window);
