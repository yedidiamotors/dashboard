/* ============================================================
   ידידיה מוטורס — פאנל הצוות, מסך הסקירה
   הנתונים מגיעים מ-POST /webhook/dashboard/summary (n8n → Supabase).
   כל סינון ההרשאות נעשה בבסיס הנתונים; כאן רק תצוגה.
   ============================================================ */
(function () {
  'use strict';

  var E = YM.escapeHtml;
  var state = { data: null, brandFilter: 'all', search: '' };
  var REFRESH_MS = 5 * 60 * 1000;

  /* ---------- אתחול ---------- */
  var session = YM.getSession();
  if (!session) { location.replace('login.html'); return; }

  load();

  function bootError(text, retry) {
    var boot = document.getElementById('boot');
    boot.innerHTML =
      '<div class="mark">YEDIDIA MOTORS</div>' +
      '<div class="msg">' + E(text) + '</div>' +
      (retry ? '<button class="btn-primary" type="button" id="boot-retry">נסו שוב</button>' : '');
    boot.hidden = false;
    if (retry) {
      document.getElementById('boot-retry').addEventListener('click', function () {
        location.reload();
      });
    }
  }

  async function load(silent) {
    if (!silent) document.getElementById('boot').hidden = false;
    var res;
    try {
      res = await YM.api('/dashboard/summary', { token: session.token });
    } catch (err) {
      if (silent) { notice(err.message, 'err'); return; }
      bootError(err.message, true);
      return;
    }

    if (res.ok !== true) {
      if (res.__status === 401 || ['INVALID_TOKEN', 'SESSION_EXPIRED', 'USER_INACTIVE',
                                   'SESSION_INVALID'].indexOf(res.error) > -1) {
        YM.clearSession();
        location.replace('login.html');
        return;
      }
      var text = res.message_he || 'טעינת הנתונים נכשלה. נסו שוב בעוד רגע.';
      if (silent) { notice(text, 'err'); } else { bootError(text, true); }
      return;
    }

    state.data = res;
    // רענון פרטי המשתמש בסשן המקומי — הרשאות יכולות להשתנות בין כניסות
    try {
      var s = YM.getSession() || {};
      s.user = res.user; s.permissions = res.permissions;
      localStorage.setItem('ym_staff_session', JSON.stringify(s));
    } catch (e) {}

    render();
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = false;
  }

  function notice(text, kind) {
    var el = document.getElementById('notice');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="banner ' + (kind === 'err' ? '' : 'info') + '">' + E(text) + '</div>';
  }

  /* ---------- תצוגה ---------- */
  function render() {
    var d = state.data;
    var user = d.user || {};
    var perms = d.permissions || [];
    var isSales = user.role === 'sales';
    var isManager = !isSales;
    var canPrice = perms.indexOf('view_import_purchase_price') > -1;
    var canFiles = perms.indexOf('view_vehicle_files') > -1;
    var now = new Date();

    /* כותרת עליונה */
    document.getElementById('greeting').textContent =
      YM.greetingFor(now) + ', ' + (user.name || '');
    document.getElementById('eyebrow').textContent = isSales ? 'יום המכירות שלי' : 'סקירת מלאי';
    document.getElementById('meta-line').textContent =
      YM.roleHe(user.role) + ' · עודכן היום ' + YM.hhmm(new Date(d.generated_at || now));
    document.getElementById('avatar').textContent = YM.initials(user.name);
    document.getElementById('inventory-title').textContent =
      isSales ? 'זמין להצעה ללקוח' : 'רכבים במלאי';

    /* קופסת הסרגל */
    var box = document.getElementById('side-box');
    if (isManager && canPrice) {
      box.innerHTML =
        '<div class="stat-box">' +
          '<div class="row"><span class="label">שווי המלאי במגרש</span>' +
          '<span class="badge-admin">הנהלה</span></div>' +
          '<div class="stat-figure">' + E(YM.shortNis(d.stock_value)) + '</div>' +
          '<div class="stat-note">' + d.kpis.total + ' רכבים · ' +
            d.kpis.avg_days_in_stock + ' ימי מלאי בממוצע</div>' +
        '</div>';
    } else if (isSales) {
      var delivered = d.kpis.my_deliveries_this_month;
      var goal = 10;
      box.innerHTML =
        '<div class="stat-box">' +
          '<div class="label">היעד שלי החודש</div>' +
          '<div style="display:flex;align-items:baseline;gap:6px">' +
            '<span class="stat-figure">' + delivered + '</span>' +
            '<span style="font-size:13px;color:var(--text-faint)">מתוך ' + goal + ' מסירות</span>' +
          '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' +
            Math.min(100, Math.round(delivered / goal * 100)) + '%"></div></div>' +
          '<div class="stat-note">' + d.kpis.my_open_deals + ' עסקאות פתוחות בטיפולי</div>' +
        '</div>';
    } else {
      box.innerHTML =
        '<div class="stat-box">' +
          '<div class="label">מלאי פעיל</div>' +
          '<div class="stat-figure">' + d.kpis.total + '</div>' +
          '<div class="stat-note">' + d.kpis.avg_days_in_stock + ' ימי מלאי בממוצע</div>' +
        '</div>';
    }

    /* מדדים */
    var kpis = isSales ? [
      { label: 'מסירות שלי החודש', value: d.kpis.my_deliveries_this_month, unit: 'מתוך יעד 10',
        delta: Math.round(d.kpis.my_deliveries_this_month / 10 * 100) + '%', note: 'מהיעד החודשי' },
      { label: 'עסקאות פתוחות שלי', value: d.kpis.my_open_deals, unit: 'עסקאות',
        delta: '', note: 'בטיפול פעיל' },
      { label: 'לידים פתוחים', value: d.kpis.open_leads, unit: 'פניות',
        delta: '', note: 'מהאתר, ממתינים למענה' },
      { label: 'זמין להצעה', value: d.kpis.available, unit: 'רכבים',
        delta: '', note: d.kpis.in_transit + ' נוספים בדרך' }
    ] : [
      { label: 'רכבים זמינים למסירה', value: d.kpis.available, unit: 'מתוך ' + d.kpis.total,
        delta: '', note: 'במלאי בארץ' },
      { label: 'שמורים ללקוח', value: d.kpis.reserved, unit: 'רכבים',
        delta: '', note: 'משויכים לעסקה' },
      { label: 'ימי מלאי ממוצע', value: d.kpis.avg_days_in_stock, unit: 'ימים',
        delta: '', note: 'מהגעה לארץ' },
      { label: 'מעל 90 ימים במלאי', value: d.kpis.over_90_days, unit: 'רכבים',
        delta: d.kpis.over_90_days > 0 ? 'לתמחור מחדש' : '', note: '' }
    ];

    document.getElementById('kpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi">' +
        '<div class="label">' + E(k.label) + '</div>' +
        '<div class="value-row"><span class="value">' + E(k.value) + '</span>' +
          '<span class="unit">' + E(k.unit) + '</span></div>' +
        '<div class="foot">' +
          (k.delta ? '<span class="delta">' + E(k.delta) + '</span>' : '') +
          E(k.note) +
        '</div>' +
      '</div>';
    }).join('');

    /* צ׳יפים של יצרנים */
    var brands = d.brands || [];
    var chips = ['<button class="chip' + (state.brandFilter === 'all' ? ' is-active' : '') +
                 '" data-brand="all" type="button">הכל</button>'];
    brands.slice(0, 5).forEach(function (b) {
      chips.push('<button class="chip' + (state.brandFilter === b.name ? ' is-active' : '') +
                 '" data-brand="' + E(b.name) + '" type="button">' + E(b.name) + '</button>');
    });
    var filtersEl = document.getElementById('filters');
    filtersEl.innerHTML = brands.length ? chips.join('') : '';
    filtersEl.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        state.brandFilter = c.getAttribute('data-brand');
        render();
      });
    });

    /* טבלת המלאי */
    var list = (d.inventory || []).filter(function (v) {
      if (state.brandFilter !== 'all' &&
          String(v.make || '').toUpperCase() !== state.brandFilter) return false;
      if (state.search) {
        var hay = [v.model, v.trim, v.vin_tail, v.order_number, v.lot, v.status_he]
          .join(' ').toLowerCase();
        if (hay.indexOf(state.search) === -1) return false;
      }
      return true;
    });

    var rowsEl = document.getElementById('rows');
    if (!canFiles) {
      rowsEl.innerHTML = '<div class="empty">אין לך הרשאה לצפות בתיקי רכב.<br>' +
        'לפתיחת הרשאה — פנו למנהל המערכת.</div>';
    } else if (!list.length) {
      rowsEl.innerHTML = '<div class="empty">' +
        (d.kpis.total === 0
          ? 'אין עדיין רכבים במערכת.<br>תיקי רכב נפתחים אוטומטית מהמיילים ומהמדבקות בוואטסאפ.'
          : 'לא נמצאו רכבים התואמים לסינון.') +
        '</div>';
    } else {
      rowsEl.innerHTML = list.map(function (v) {
        var meta = [v.year, v.days + ' ימים במלאי', v.status_he].filter(Boolean).join(' · ');
        var priceCell = v.price === null || v.price === undefined
          ? '<div class="price hidden-perm cell-hide">—</div>'
          : '<div class="price">' + E(YM.nis(v.price)) + '</div>';
        return '<div class="row" data-id="' + E(v.id) + '">' +
          '<div class="thumb"><span>' + E(v.vin_tail || '—') + '</span></div>' +
          '<div class="names">' +
            '<div class="model">' + E(v.model || '—') + '</div>' +
            '<div class="trim">' + E(v.trim || '—') + '</div>' +
            '<div class="row-meta">' + E(meta) + '</div>' +
          '</div>' +
          '<div class="year cell-hide">' + E(v.year || '—') + '</div>' +
          priceCell +
          '<div class="days cell-hide">' + E(v.days) + '</div>' +
          '<div class="status-pill cell-hide">' + E(v.status_he) + '</div>' +
        '</div>';
      }).join('');
    }

    document.getElementById('inventory-foot').textContent =
      canFiles && d.kpis.total
        ? 'מוצגים ' + list.length + ' מתוך ' + d.kpis.total + ' תיקי רכב פעילים'
        : '';

    /* כרטיסי צד */
    var side = [];

    if (isSales && (d.leads || []).length) {
      side.push(card('הלידים שלי לטיפול', d.leads.length + ' פניות',
        '<div class="list">' + d.leads.map(function (l) {
          return listRow(l.name, l.interest || l.phone, l.tag);
        }).join('') + '</div>'));
    } else if (isSales) {
      side.push(card('הלידים שלי לטיפול', '',
        '<div class="empty small">אין פניות פתוחות מהאתר.</div>'));
    }

    if (canFiles) {
      var maxUnits = brands.reduce(function (m, b) { return Math.max(m, b.units); }, 0) || 1;
      side.push(card('תמהיל מלאי לפי יצרן', d.kpis.total + ' רכבים',
        brands.length
          ? '<div class="list">' + brands.map(function (b) {
              return '<div class="brand-row">' +
                '<div class="top"><span class="name">' + E(b.name) + '</span>' +
                  '<span class="units">' + b.units + ' רכבים</span></div>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' +
                  Math.round(b.units / maxUnits * 100) + '%"></div></div>' +
              '</div>';
            }).join('') + '</div>'
          : '<div class="empty small">אין עדיין רכבים במלאי.</div>'));

      if (isManager) {
        side.push(card('דורש תשומת לב', '',
          (d.alerts || []).length
            ? '<div class="list">' + d.alerts.map(function (a) {
                return '<div class="alert-row"><span class="dot"></span><div class="lines">' +
                  '<span class="t">' + E(a.title) + '</span>' +
                  '<span class="s">' + E(a.detail) + '</span></div></div>';
              }).join('') + '</div>'
            : '<div class="empty small">אין כרגע פריטים שדורשים טיפול.</div>'));
      }

      side.push(card('מכולות בדרך', (d.incoming || []).length + ' מכולות',
        (d.incoming || []).length
          ? '<div class="list">' + d.incoming.map(function (c) {
              var note = [c.models || (c.vehicles + ' רכבים'), c.vessel]
                .filter(Boolean).join(' · ');
              var eta = c.eta ? etaText(c.eta) : c.status_he;
              return listRow(c.container_number, note, eta);
            }).join('') + '</div>'
          : '<div class="empty small">אין מכולות פעילות במעקב.</div>'));
    }

    document.getElementById('side-col').innerHTML = side.join('');
  }

  function card(title, count, inner) {
    return '<div class="card pad">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<h2>' + E(title) + '</h2>' +
        (count ? '<span class="card-count">' + E(count) + '</span>' : '') +
      '</div>' + inner + '</div>';
  }

  function listRow(t, s, tag) {
    return '<div class="list-row"><div class="lines">' +
      '<span class="t">' + E(t || '—') + '</span>' +
      '<span class="s">' + E(s || '') + '</span></div>' +
      (tag ? '<span class="tag">' + E(tag) + '</span>' : '') + '</div>';
  }

  function etaText(iso) {
    var days = Math.round((new Date(iso + 'T00:00:00') - new Date()) / 86400000);
    if (days < 0) return 'הגיעה';
    if (days === 0) return 'היום';
    if (days === 1) return 'מחר';
    if (days < 14) return days + ' ימים';
    return Math.round(days / 7) + ' שבועות';
  }

  /* ---------- אירועים ---------- */
  document.getElementById('signout').addEventListener('click', function () { YM.logout(); });

  document.getElementById('primary-action').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'מרענן…';
    notice('');
    load(true).then(function () {
      btn.disabled = false;
      btn.textContent = 'רענון נתונים';
    });
  });

  var searchTimer;
  document.getElementById('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var v = e.target.value.trim().toLowerCase();
    searchTimer = setTimeout(function () {
      state.search = v;
      if (state.data) render();
    }, 180);
  });

  // רענון שקט כשחוזרים ללשונית, ובכל 5 דקות
  setInterval(function () { if (!document.hidden) load(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.data) {
      var age = Date.now() - new Date(state.data.generated_at).getTime();
      if (age > 60000) load(true);
    }
  });
})();
