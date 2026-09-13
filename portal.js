/* ============================================================
   ידידיה מוטורס — האיזור האישי ללקוח
   כל הלוגיקה בשרת; הדף רק מציג, מצייר חתימה ושולח.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var KEY = 'ym_portal_session';
  var session = null, data = null, currentAgreement = null;

  /* ---------- סשן ---------- */
  function saveSession(res) {
    session = { token: res.session_token, expires_at: res.expires_at || null, customer: res.customer || null };
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) {}
  }
  function loadSession() {
    var raw; try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    var s; try { s = JSON.parse(raw); } catch (e) { return null; }
    if (!s || !s.token) return null;
    if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) { clearSession(); return null; }
    return s;
  }
  function clearSession() { try { localStorage.removeItem(KEY); } catch (e) {} session = null; }

  async function api(path, body) {
    body = body || {};
    if (session && session.token) body.token = session.token;
    return YM.api(path, body);
  }

  /* ---------- כניסה ---------- */
  var gate = document.getElementById('gate');
  var app = document.getElementById('app');
  var stepPhone = document.getElementById('step-phone');
  var stepCode = document.getElementById('step-code');
  var phoneIn = document.getElementById('phone');
  var codeIn = document.getElementById('code');
  var phoneMsg = document.getElementById('phone-msg');
  var codeMsg = document.getElementById('code-msg');
  var phoneBtn = document.getElementById('phone-btn');
  var codeBtn = document.getElementById('code-btn');
  var resendBtn = document.getElementById('resend-btn');
  var currentPhone = '', resendTimer = null;

  function show(el, text, kind) { el.textContent = text; el.className = 'msg ' + (kind || 'err'); }
  function hide(el) { el.className = 'msg err hidden'; }

  function cooldown(seconds) {
    var left = seconds;
    resendBtn.disabled = true;
    clearInterval(resendTimer);
    resendBtn.textContent = 'שליחת קוד חדש (' + left + ')';
    resendTimer = setInterval(function () {
      left--;
      resendBtn.textContent = left > 0 ? 'שליחת קוד חדש (' + left + ')' : 'שליחת קוד חדש';
      if (left <= 0) { clearInterval(resendTimer); resendBtn.disabled = false; }
    }, 1000);
  }

  async function requestOtp(phone) {
    var res = await YM.api('/portal/otp/request', { phone: phone });
    if (res.error === 'LOCKED') throw new Error(res.message_he || 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.');
    if (res.ok !== true) throw new Error('השירות אינו זמין כרגע. נסו שוב בעוד מספר דקות.');
    return res;
  }

  stepPhone.addEventListener('submit', async function (e) {
    e.preventDefault(); hide(phoneMsg);
    var phone = phoneIn.value.trim();
    if (!YM.looksLikePhone(phone)) { show(phoneMsg, 'מספר הטלפון אינו תקין. לדוגמה: 050-000-0000'); return; }
    phoneBtn.disabled = true; phoneBtn.textContent = 'שולח…';
    try {
      await requestOtp(phone);
      currentPhone = phone;
      document.getElementById('phone-echo').textContent = phone;
      stepPhone.classList.add('hidden'); stepCode.classList.remove('hidden');
      codeIn.focus(); cooldown(45);
    } catch (err) { show(phoneMsg, err.message); }
    finally { phoneBtn.disabled = false; phoneBtn.textContent = 'שלחו לי קוד'; }
  });

  resendBtn.addEventListener('click', async function () {
    hide(codeMsg); resendBtn.disabled = true;
    try { await requestOtp(currentPhone); show(codeMsg, 'נשלח קוד חדש.', 'ok'); cooldown(45); }
    catch (err) { show(codeMsg, err.message); resendBtn.disabled = false; }
  });

  document.getElementById('back-btn').addEventListener('click', function () {
    clearInterval(resendTimer); codeIn.value = ''; hide(codeMsg);
    stepCode.classList.add('hidden'); stepPhone.classList.remove('hidden'); phoneIn.focus();
  });

  codeIn.addEventListener('input', function () { codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 6); });

  stepCode.addEventListener('submit', async function (e) {
    e.preventDefault(); hide(codeMsg);
    var code = codeIn.value.trim();
    if (code.length !== 6) { show(codeMsg, 'יש להזין קוד בן 6 ספרות.'); return; }
    codeBtn.disabled = true; codeBtn.textContent = 'מאמת…';
    try {
      var res = await YM.api('/portal/otp/verify', { phone: currentPhone, code: code });
      if (res.ok !== true || !res.session_token) { show(codeMsg, res.message_he || 'הקוד שגוי או שפג תוקפו.'); return; }
      saveSession(res); await enter();
    } catch (err) { show(codeMsg, err.message); }
    finally { codeBtn.disabled = false; codeBtn.textContent = 'כניסה'; }
  });

  document.getElementById('signout').addEventListener('click', async function () {
    try { await api('/portal/logout'); } catch (e) {}
    clearSession(); location.reload();
  });

  /* ---------- טעינת האיזור האישי ---------- */
  async function enter() {
    var res;
    try { res = await api('/portal/home'); }
    catch (err) { show(phoneMsg, err.message); return; }
    if (res.ok !== true) { clearSession(); location.reload(); return; }
    data = res;
    gate.hidden = true; app.hidden = false;
    document.getElementById('p-name').textContent = res.customer.name;
    var b = res.brand || {};
    document.getElementById('p-contact').textContent =
      (b.name || 'ידידיה מוטורס') + (b.phone ? ' · ' + b.phone : '');
    render();
  }

  function render() {
    var host = document.getElementById('deals');
    if (!data.deals.length) {
      host.innerHTML = '<div class="d-card"><div class="d-sec">אין כרגע עסקה פעילה בתיק שלך. לכל שאלה — אנחנו כאן.</div></div>';
      return;
    }
    host.innerHTML = data.deals.map(dealHtml).join('');
    host.querySelectorAll('[data-agr]').forEach(function (b) {
      b.addEventListener('click', function () { openAgreement(b.getAttribute('data-agr')); });
    });
  }

  function dealHtml(d) {
    var v = d.vehicle, p = d.price || {};
    var reqs = (d.requirements || []).filter(function (r) { return r.status !== 'not_required'; });
    var done = reqs.filter(function (r) { return r.status === 'verified' || r.status === 'received'; }).length;

    var head = '<div class="d-top"><div><div class="d-title">' +
      (v ? E(v.title) + (v.trim ? ' · ' + E(v.trim) : '') : 'העסקה שלך') + '</div>' +
      '<div class="d-sub">' + (v ? E([v.model_year, v.color, v.vin ? 'שלדה ' + v.vin : null].filter(Boolean).join(' · ')) : '') + '</div></div>' +
      '<span class="pill' + (d.deal_status === 'completed' ? ' done' : '') + '">' + E(v ? v.status_he : d.status_he) + '</span></div>';

    var facts = '<div class="d-sec"><h3>העסקה</h3><div class="kv">' +
      (p.total != null ? kv('מחיר הרכב', nis(p.total), true) : '') +
      (p.down_payment ? kv('מקדמה ששולמה', nis(p.down_payment)) : '') +
      (p.trade_in_credit ? kv('זיכוי טרייד-אין', nis(p.trade_in_credit)) : '') +
      (p.financing_amount ? kv('מימון', nis(p.financing_amount)) : '') +
      (p.balance != null ? kv('יתרה לתשלום', nis(p.balance), true) : '') +
      kv('מועד מסירה משוער', d.expected_delivery_date ? fmtDate(d.expected_delivery_date) : 'ייקבע בהמשך') +
      '</div></div>';

    var agr = '';
    if (d.agreement) {
      var a = d.agreement;
      agr = '<div class="d-sec"><h3>הסכם המכירה</h3><div class="agr-box"><div>' +
        '<div class="t">' + (a.status === 'signed' ? 'ההסכם נחתם' : 'ההסכם ממתין לחתימתך') + '</div>' +
        '<div class="s">' + (a.status === 'signed'
            ? 'נחתם ב-' + fmtDT(a.signed_at)
            : 'הונפק ב-' + fmtDate(a.issued_at) + (a.expires_at ? ' · תקף עד ' + fmtDate(a.expires_at) : '')) + '</div></div>' +
        (a.status === 'signed'
          ? (a.pdf_drive_url ? '<a class="btn-ghost" href="' + E(a.pdf_drive_url) + '" target="_blank" rel="noopener">צפייה בהסכם</a>' : '<span class="pill done">חתום</span>')
          : '<button class="btn-primary" type="button" data-agr="' + E(a.id) + '">קריאה וחתימה</button>') +
        '</div></div>';
    }

    var reqHtml = reqs.length ? '<div class="d-sec"><h3>מה נדרש מכם (' + done + '/' + reqs.length + ')</h3>' +
      reqs.map(function (r) {
        var ok = r.status === 'verified' || r.status === 'received';
        return '<div class="req' + (ok ? ' done' : '') + '"><span class="dot"></span><span>' + E(r.label_he) + '</span>' +
          '<span class="st">' + (ok ? 'התקבל' : (r.is_open_for_upload ? 'ממתין להעלאה' : 'חסר')) + '</span></div>';
      }).join('') + '</div>' : '';

    var docs = (d.documents || []).length ? '<div class="d-sec"><h3>מסמכים בתיק</h3>' +
      d.documents.map(function (x) {
        return '<div class="doc-row"><span>' + E(docHe(x.doc_type)) + '</span><span class="n">' + E(x.filename || '') + '</span></div>';
      }).join('') + '</div>' : '';

    return '<div class="d-card">' + head + facts + agr + reqHtml + docs + '</div>';
  }

  function kv(k, v, big) {
    return '<div><span class="k">' + E(k) + '</span><span class="v' + (big ? ' big' : '') + '">' + E(v) + '</span></div>';
  }
  function nis(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '₪' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  var DOC_HE = {
    purchase_agreement: 'הסכם מכירה', memorandum_of_understanding: 'זיכרון דברים',
    financing_agreement: 'הסכם מימון', trade_in_agreement: 'הסכם טרייד-אין',
    signed_order_form: 'טופס הזמנה חתום', other: 'מסמך'
  };
  function docHe(t) { return DOC_HE[t] || t; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function fmtDT(iso) { return iso ? fmtDate(iso) + ' ' + YM.hhmm(new Date(iso)) : '—'; }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="msg ' + (kind === 'ok' ? 'ok' : 'err') + '">' + E(text) + '</div>';
    if (kind === 'ok') setTimeout(function () { el.innerHTML = ''; }, 6000);
  }

  /* ---------- ההסכם ---------- */
  var agrModal = document.getElementById('agr-modal');
  var agrBody = document.getElementById('agr-body');
  var agrMsg = document.getElementById('agr-msg');
  var consent = document.getElementById('agr-consent');
  var otpWrap = document.getElementById('otp-wrap');
  var signCode = document.getElementById('sign-code');
  var btnStart = document.getElementById('sig-start');
  var btnSubmit = document.getElementById('sig-submit');

  async function openAgreement(id) {
    hide(agrMsg);
    var res = await api('/portal/agreement', { agreement_id: id });
    if (res.ok !== true) { notice(res.message_he || 'לא ניתן לפתוח את ההסכם.'); return; }
    currentAgreement = res;
    agrBody.innerHTML = res.html;
    document.getElementById('agr-consent-text').textContent = res.consent_text || 'קראתי ואני מאשר/ת את ההסכם.';
    document.getElementById('agr-sign').hidden = !res.can_sign;
    document.getElementById('agr-done').classList.add('hidden');
    consent.checked = false;
    otpWrap.classList.add('hidden'); signCode.value = '';
    btnStart.classList.remove('hidden'); btnSubmit.classList.add('hidden');
    clearSig();
    if (!res.can_sign && res.expired) notice('תוקף ההסכם פג. פנו אלינו להנפקת הסכם מעודכן.');
    agrModal.hidden = false;
    agrBody.scrollTop = 0;
  }

  btnStart.addEventListener('click', async function () {
    hide(agrMsg);
    if (!consent.checked) { show(agrMsg, 'יש לאשר את הצהרת ההסכמה לפני החתימה.'); return; }
    if (isSigEmpty()) { show(agrMsg, 'חסרה חתימה — ציירו את חתימתכם במסגרת.'); return; }
    btnStart.disabled = true; btnStart.textContent = 'שולח קוד…';
    try {
      var res = await api('/portal/sign/start', { agreement_id: currentAgreement.agreement.id });
      if (res.ok !== true) { show(agrMsg, res.message_he || 'שליחת הקוד נכשלה.'); return; }
      otpWrap.classList.remove('hidden');
      btnStart.classList.add('hidden'); btnSubmit.classList.remove('hidden');
      show(agrMsg, res.message_he || 'שלחנו קוד אימות לטלפון שלך.', 'ok');
      signCode.focus();
    } catch (err) { show(agrMsg, err.message); }
    finally { btnStart.disabled = false; btnStart.textContent = 'שלחו לי קוד לחתימה'; }
  });

  signCode.addEventListener('input', function () { signCode.value = signCode.value.replace(/\D/g, '').slice(0, 6); });

  btnSubmit.addEventListener('click', async function () {
    hide(agrMsg);
    if (!consent.checked) { show(agrMsg, 'יש לאשר את הצהרת ההסכמה.'); return; }
    if (isSigEmpty()) { show(agrMsg, 'חסרה חתימה.'); return; }
    if (signCode.value.length !== 6) { show(agrMsg, 'יש להזין את הקוד בן 6 הספרות.'); return; }
    btnSubmit.disabled = true; btnSubmit.textContent = 'חותם…';
    try {
      var res = await api('/portal/sign', {
        agreement_id: currentAgreement.agreement.id,
        code: signCode.value,
        consent: true,
        signature_png: canvas.toDataURL('image/png')
      });
      if (res.ok !== true) { show(agrMsg, res.message_he || 'החתימה נכשלה.'); return; }
      document.getElementById('agr-sign').hidden = true;
      var done = document.getElementById('agr-done');
      done.classList.remove('hidden');
      var link = document.getElementById('agr-pdf');
      if (res.pdf_url) { link.href = res.pdf_url; link.classList.remove('hidden'); }
      else link.classList.add('hidden');
      await enter();
    } catch (err) { show(agrMsg, err.message); }
    finally { btnSubmit.disabled = false; btnSubmit.textContent = 'חתימה על ההסכם'; }
  });

  document.getElementById('agr-print').addEventListener('click', function () { window.print(); });

  /* ---------- קנבס החתימה ---------- */
  var canvas = document.getElementById('sig');
  var ctx = canvas.getContext('2d');
  var drawing = false, dirty = false, last = null;

  function sizeCanvas() {
    var ratio = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 640, h = canvas.clientHeight || 180;
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  }
  function clearSig() { sizeCanvas(); dirty = false; }
  function isSigEmpty() { return !dirty; }
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    drawing = true; dirty = true; last = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + 0.1, last.y); ctx.stroke();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drawing = false; });
  });
  document.getElementById('sig-clear').addEventListener('click', clearSig);
  window.addEventListener('resize', function () { if (!dirty) sizeCanvas(); });

  /* ---------- כללי ---------- */
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { document.getElementById(b.getAttribute('data-close')).hidden = true; });
  });
  agrModal.addEventListener('click', function (e) { if (e.target === agrModal) agrModal.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') agrModal.hidden = true; });

  session = loadSession();
  if (session) enter(); else phoneIn.focus();
})();
