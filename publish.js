/* ============================================================
   ידידיה מוטורס — הצגת רכב באתר הציבורי (מתג "מופיע באתר")

   מי שיש לו ההרשאה publish_vehicle_website (מנהל מכירות, מנהל מערכת)
   קובע מכרטיס הרכב אם הרכב מוצג באתר. הסימון בפאנל גובר על עמודת
   "מופיע באתר" בגיליון וננעל מולה. כל שינוי נרשם בלוג בשרת.

   השרת (vehicle_view) מחזיר ב-viewer:
     can_publish — האם מותר למשתמש לשנות
     website     — { published, by_panel, set_by, set_at }
   ו-vehicle.share קיים רק לרכב שכבר מופיע בפועל באתר.
   ============================================================ */
(function () {
  'use strict';
  var YM = window.YM = window.YM || {};

  function E(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* המצב כפי שהוא צריך להיות באתר: סימון מהפאנל אם קיים, אחרת מה שבפועל באתר (לפי הגיליון) */
  function current(res) {
    var v = res.vehicle || {};
    var w = (res.viewer || {}).website || {};
    var live = !!v.share;
    return {
      byPanel: w.by_panel === true,
      wanted: w.by_panel === true ? w.published === true : live,
      live: live,
      inSheet: v.from_sheet === true,
      setBy: w.set_by || '',
      setAt: w.set_at || ''
    };
  }

  function html(res) {
    var viewer = (res && res.viewer) || {};
    if (!viewer.website) return '';
    var c = current(res);

    var line;
    if (c.wanted && c.live) line = 'הרכב מוצג באתר.';
    else if (c.wanted && !c.inSheet) line = 'הרכב סומן להצגה. רכב שאינו בגיליון המלאי יופיע באתר אחרי שהאתר יעבור לקרוא מהמערכת.';
    else if (c.wanted) line = 'הרכב סומן להצגה ויופיע באתר בעדכון הבא של האתר.';
    else if (c.live) line = 'הרכב סומן כלא מוצג וירד מהאתר בעדכון הבא של האתר.';
    else line = 'הרכב לא מוצג באתר.';

    var src = c.byPanel
      ? 'נקבע בפאנל' + (c.setBy ? ' ע״י ' + c.setBy : '') + (c.setAt ? ' · ' + fmt(c.setAt) : '') + '. גובר על הגיליון.'
      : (c.inSheet ? 'לפי עמודת "מופיע באתר" בגיליון המלאי.' : 'עדיין לא נקבע בפאנל.');

    var h = '<div class="sect" id="pub-sect"><h3>הצגה באתר</h3>' +
      '<p class="note"><b>' + E(line) + '</b><br>' + E(src) + '</p>';

    if (viewer.can_publish) {
      h += '<div class="doc-tools">' +
        (c.wanted
          ? '<button class="btn-icon" type="button" data-pub="off">להסיר מהאתר</button>'
          : '<button class="btn-icon primary" type="button" data-pub="on">להציג באתר</button>') +
        (c.byPanel && c.inSheet
          ? ' <button class="btn-icon" type="button" data-pub="release">לחזור לפי הגיליון</button>' : '') +
        '</div>';
    }
    return h + '</div>';
  }

  /* opts: { token, showCard(res), error(text), toast(text) } */
  function bind(host, res, opts) {
    if (!host || !res || !opts) return;
    var box = host.querySelector('#pub-sect');
    if (!box) return;
    var v = res.vehicle || {};
    box.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-pub]');
      if (!b || b.disabled) return;
      var k = b.getAttribute('data-pub');
      var body = { token: opts.token, vehicle_id: v.id };
      if (k === 'release') body.release = true; else body.published = (k === 'on');
      box.querySelectorAll('[data-pub]').forEach(function (x) { x.disabled = true; });
      var old = b.textContent; b.textContent = 'שומר…';
      var r;
      try { r = await YM.api('/inventory/publish', body); }
      catch (err) { r = { ok: false, message_he: err.message }; }
      if (r && r.ok === true && r.card && r.card.ok === true) {
        if (opts.toast) opts.toast(r.message_he || 'עודכן.');
        opts.showCard(r.card);
      } else {
        box.querySelectorAll('[data-pub]').forEach(function (x) { x.disabled = false; });
        b.textContent = old;
        if (opts.error) opts.error((r && r.message_he) || 'הפעולה נכשלה.');
      }
    });
  }

  YM.publish = { html: html, bind: bind };
})();
