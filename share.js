/* ============================================================
   ידידיה מוטורס — שיתוף מודעת רכב (משותף למלאי ולטרייד-אין)

   הקישור המקוצר yedidia-motors.com/v/<קוד> מגיע מהשרת (site_share_for)
   רק לרכב שמתפרסם באתר. וואטסאפ, פייסבוק ואינסטגרם מושכים ממנו
   תמונה וטקסט קצר (og:image / og:title) — העמוד הקצר נבנה באתר.
   ============================================================ */
(function () {
  'use strict';
  var YM = window.YM = window.YM || {};

  function E(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ICON = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.2 15 3.8 13.5 3.8 12c0-4.5 3.7-8.2 8.2-8.2s8.2 3.7 8.2 8.2-3.7 8.2-8.2 8.2z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3A4.7 4.7 0 1 0 16.7 12 4.7 4.7 0 0 0 12 7.3zm0 7.7a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm6-7.9a1.1 1.1 0 1 1-1.1-1.1A1.1 1.1 0 0 1 18 7.1zM21.9 8.2a5.4 5.4 0 0 0-1.5-3.9 5.4 5.4 0 0 0-3.9-1.5C15 2.7 9 2.7 7.5 2.8a5.4 5.4 0 0 0-3.9 1.5 5.4 5.4 0 0 0-1.5 3.9C2 9.8 2 14.2 2.1 15.8a5.4 5.4 0 0 0 1.5 3.9 5.4 5.4 0 0 0 3.9 1.5c1.6.1 7.4.1 9 0a5.4 5.4 0 0 0 3.9-1.5 5.4 5.4 0 0 0 1.5-3.9c.1-1.6.1-6 0-7.6zm-2.1 9.9a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.3.4s-4.1.1-5.3-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.3s-.1-4.1.4-5.3a3 3 0 0 1 1.7-1.7c1.2-.5 4-.4 5.3-.4s4.1-.1 5.3.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 4 .4 5.3s.1 4.1-.4 5.3z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zm-1.8 4.9-1.4 1.4a3.5 3.5 0 0 1-5-5l3.5-3.5a3.5 3.5 0 0 1 4.6-.3 1 1 0 1 1-1.2 1.6 1.5 1.5 0 0 0-2 .1L3.8 16.1a1.5 1.5 0 0 0 2.1 2.1l1.4-1.4a1 1 0 0 1 1.5 1.5zm12.6-15.6a3.5 3.5 0 0 0-5 0L15 4.1a1 1 0 0 0 1.5 1.5l1.4-1.4a1.5 1.5 0 0 1 2.1 2.1l-3.5 3.5a1.5 1.5 0 0 1-2 .1 1 1 0 1 0-1.2 1.6 3.5 3.5 0 0 0 4.6-.3l3.5-3.5a3.5 3.5 0 0 0 0-5z"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7a3 3 0 0 0 .1.8L8.4 11.2a3 3 0 1 0 0 1.6l6.7 3.4A3 3 0 1 0 18 16z"/></svg>'
  };

  /* מחזיר HTML של הסעיף. share = {url, text, title, image, page, status_he} או null */
  function html(share, opts) {
    opts = opts || {};
    var h = '<div class="sect share-sect"><h3>שיתוף המודעה</h3>';
    if (!share) {
      return h + '<p class="note">' + E(opts.hidden_note ||
        'הרכב לא מתפרסם כרגע באתר, ולכן אין לו קישור מודעה. ' +
        'כשיסומן "מופיע באתר" ויעלה לאתר, הקישור יופיע כאן.') + '</p></div>';
    }
    var short = share.url.replace(/^https:\/\//, '');
    h += '<div class="share-row">' +
      (share.image ? '<img class="share-img" src="' + E(share.image) + '" alt="" onerror="this.remove()">' : '') +
      '<div class="share-main">' +
        '<div class="share-url"><a href="' + E(share.url) + '" target="_blank" rel="noopener" dir="ltr">' + E(short) + '</a>' +
          (share.status_he ? '<span class="tag">' + E(share.status_he) + ' באתר</span>' : '') + '</div>' +
        '<div class="share-btns">' +
          '<a class="sh-b wa" href="https://wa.me/?text=' + encodeURIComponent(share.text || share.url) + '" target="_blank" rel="noopener" title="וואטסאפ">' + ICON.wa + '<span>וואטסאפ</span></a>' +
          '<a class="sh-b fb" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(share.url) + '" target="_blank" rel="noopener" title="פייסבוק">' + ICON.fb + '<span>פייסבוק</span></a>' +
          '<button class="sh-b ig" type="button" data-sh="ig" title="אינסטגרם">' + ICON.ig + '<span>אינסטגרם</span></button>' +
          '<button class="sh-b" type="button" data-sh="link" title="העתקת הקישור">' + ICON.link + '<span>העתקת קישור</span></button>' +
          '<button class="sh-b" type="button" data-sh="text" title="העתקת המודעה — טקסט וקישור">' + ICON.text + '<span>העתקת מודעה</span></button>' +
          (navigator.share ? '<button class="sh-b" type="button" data-sh="more" title="אפליקציה אחרת">' + ICON.more + '<span>עוד…</span></button>' : '') +
        '</div>' +
        '<div class="share-msg" role="status" aria-live="polite"></div>' +
      '</div></div></div>';
    return h;
  }

  function copy(s) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacy(s); });
    }
    return Promise.resolve(legacy(s));
  }
  function legacy(s) {
    var ta = document.createElement('textarea');
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  }

  /* מחבר את הכפתורים בתוך host (אלמנט שמכיל את הסעיף) */
  function bind(host, share) {
    if (!host || !share) return;
    var box = host.querySelector('.share-sect');
    if (!box) return;
    var msg = box.querySelector('.share-msg'), t;
    function say(x) { msg.textContent = x; msg.classList.add('on'); clearTimeout(t); t = setTimeout(function () { msg.classList.remove('on'); msg.textContent = ''; }, 5000); }

    // תמונת המודעה נטענת מראש — בטלפון תפריט השיתוף חייב להיפתח מיד בלחיצה
    var file = null;
    if (share.image && navigator.canShare) {
      fetch(share.image).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
        if (b) file = new File([b], 'yedidia-motors.jpg', { type: 'image/jpeg' });
      }).catch(function () {});
    }

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sh]'); if (!b) return;
      var k = b.getAttribute('data-sh');
      if (k === 'link') copy(share.url).then(function (ok) { say(ok ? 'הקישור הועתק.' : share.url); });
      else if (k === 'text') copy(share.text || share.url).then(function (ok) { say(ok ? 'המודעה הועתקה — טקסט וקישור, מוכנה להדבקה.' : 'ההעתקה נכשלה.'); });
      else if (k === 'more') navigator.share({ title: share.title, text: (share.text || '').replace(share.url, '').trim(), url: share.url }).catch(function () {});
      else if (k === 'ig') {
        // אינסטגרם לא מקבל קישור מהדפדפן: משתפים את תמונת המודעה ומעתיקים את הקישור
        if (file && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: share.title }).catch(function () {});
          copy(share.url).then(function () { say('הקישור הועתק — בסטורי הוסיפו "מדבקת קישור" והדביקו.'); });
        } else {
          if (share.image) {
            var a = document.createElement('a');
            a.href = share.image; a.download = 'yedidia-motors.jpg'; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
          }
          copy(share.url).then(function () { say('הקישור הועתק ותמונת המודעה נפתחה — שמרו אותה, העלו לאינסטגרם והדביקו את הקישור.'); });
        }
      }
    });
  }

  YM.share = { html: html, bind: bind };
})();
