/* מחיר לפני מע"מ ↔ כולל מע"מ — מקלידים אחד מהם, המערכת משלימה את השני.
   הערך שנשמר הוא תמיד המחיר כולל מע"מ (כך מחושבות החשבוניות). */
(function () {
  'use strict';
  var DEFAULT_RATE = 18;
  function num(s) {
    var t = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
    if (t === '' || t === '.') return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }
  function fmt(n) { return String(Math.round(n * 100) / 100); }
  function toGross(net, rate) { return Math.round(net * (100 + rate)) / 100; }
  function toNet(gross, rate) { return Math.round(gross / (1 + rate / 100) * 100) / 100; }

  /* gross = שדה "כולל מע"מ" הקיים. מוסיף לפניו שדה "לפני מע"מ" ומקשר ביניהם. */
  function attach(gross, opts) {
    if (!gross || gross._vat) return gross && gross._vat;
    opts = opts || {};
    var field = gross.closest('.field') || gross.parentNode;
    var wrap = document.createElement('div');
    wrap.className = 'field vat-net-field';
    var id = (gross.id || 'price') + '-net';
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = opts.netLabel || 'מחיר לפני מע"מ (₪)';
    var net = document.createElement('input');
    net.id = id; net.setAttribute('inputmode', 'decimal'); net.dir = 'ltr'; net.autocomplete = 'off';
    wrap.appendChild(lab); wrap.appendChild(net);
    field.parentNode.insertBefore(wrap, field);
    var hint = document.createElement('small');
    hint.className = 'vat-hint muted';
    field.appendChild(hint);

    var last = 'gross';
    function rate() {
      var r = opts.rateInput ? num(opts.rateInput.value) : null;
      return r == null || r < 0 || r > 100 ? (opts.rate != null ? opts.rate : DEFAULT_RATE) : r;
    }
    function showHint() {
      var g = num(gross.value), n = num(net.value);
      hint.textContent = g != null && n != null
        ? 'מע"מ ' + rate() + '%: ' + (Math.round((g - n) * 100) / 100).toLocaleString('he-IL') + ' ₪' : '';
    }
    function fromGross() { var g = num(gross.value); net.value = g == null ? '' : fmt(toNet(g, rate())); showHint(); }
    function fromNet() { var n = num(net.value); gross.value = n == null ? '' : fmt(toGross(n, rate())); showHint(); }
    gross.addEventListener('input', function () { last = 'gross'; fromGross(); });
    net.addEventListener('input', function () { last = 'net'; fromNet(); });
    if (opts.rateInput) opts.rateInput.addEventListener('input', function () { if (last === 'net') fromNet(); else fromGross(); });
    gross._vat = { net: net, sync: function () { last = 'gross'; fromGross(); } };
    fromGross();
    return gross._vat;
  }
  function sync(gross) { if (gross && gross._vat) gross._vat.sync(); }
  window.YMVat = { attach: attach, sync: sync, toGross: toGross, toNet: toNet, num: num, DEFAULT_RATE: DEFAULT_RATE };
})();
