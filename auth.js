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
    escapeHtml: escapeHtml
  };
})(window);
