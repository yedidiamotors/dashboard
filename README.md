# Yedidia Motors — Staff Panel

**Live: https://panel.yedidia-motors.com** — GitHub Pages, `main` / `(root)`, no build step.

| File | Role |
|---|---|
| `login.html` | WhatsApp OTP sign-in (phone -> 6-digit code) |
| `index.html` | Overview screen shell |
| `app.css` | All design tokens from `design/Luxury Dashboard v3.dc.html` |
| `auth.js` | Shared API layer, session storage, formatting |
| `app.js` | Overview screen logic — load, role-aware render, filter, refresh |

The browser never talks to the database. Every call goes to n8n
(`https://yedidiamotors.duckdns.org/webhook/...`), which calls Postgres functions in
Supabase with the service key. **All permission filtering happens in the database** —
without `view_import_purchase_price`, prices and stock value never leave the server.

Auth endpoints: `/staff-auth/request-otp`, `/staff-auth/verify`, `/staff-auth/session`,
`/staff-auth/logout`. Data endpoint: `/dashboard/summary`.

> **Any new domain serving this panel must be added to `allowedOrigins` on every one of
> those n8n webhook nodes**, or the browser blocks the calls — and it looks exactly like
> a server outage.

The stack is plain static HTML/CSS/JS rather than the Vite + React setup suggested below:
the panel renders one JSON payload, so a build step would add an Action and an npm
dependency without changing the result. Revisit if the remaining six screens land with
real routing and state.

---

# Handoff: Yedidia Motors — Dealer Dashboard (RTL)

## Overview
A Hebrew (RTL) internal dashboard for a luxury / parallel-import car dealership (Yedidia Motors).
It serves four roles from one layout: salesperson, sales manager, inventory manager, owner.
The default view is the inventory screen with a role-aware KPI row, a vehicle inventory table,
brand mix, incoming shipments, and (for sales) today's test drives and personal leads.

Target hosting: **GitHub Pages** (static, no server). Implementation is being done with Claude Code.

## About the Design Files
The files in `design/` are **design references created in HTML** — a prototype showing the intended
look, content and responsive behavior. They are **not production code to copy directly**.
`.dc.html` is a design-tool format; treat it as a styled markup reference, not as a framework component.

The task is to **recreate this design in the target codebase's environment** using its established
patterns. If no codebase exists yet, the recommended stack for GitHub Pages is:

- Vite + React + TypeScript, or plain static HTML/CSS if no interactivity beyond navigation is needed
- `base: '/<repo-name>/'` in `vite.config.ts` so asset paths resolve on Pages
- Deploy via GitHub Actions (`actions/deploy-pages`) building to `dist/`
- Add `public/.nojekyll` so folders beginning with `_` are served

## Fidelity
**High-fidelity.** Colors, typography, spacing and copy are final. Recreate pixel-accurately.
The only placeholders are the vehicle thumbnails in the inventory table (diagonal-hatch boxes
labelled "car shot") — replace with real vehicle photography, 96×56 px, 5 px radius, `object-fit: cover`.

## Language & Direction
- Hebrew, **RTL**. Set `dir="rtl"` on the document root (`<html dir="rtl" lang="he">`).
- Use logical CSS properties (`padding-inline`, `border-inline-start`, `margin-inline-end`)
  so the layout is direction-safe.
- Numbers, prices and Latin model names stay LTR inside RTL text — they render correctly
  by default, but apply `font-variant-numeric: tabular-nums` to price and day columns.
- Brand names and model names are always Latin, uppercase for filter chips.

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | Page background |
| `--surface-nav` | `#101113` | Sidebar background |
| `--surface-card` | `#14161A` | Cards, table body |
| `--surface-raised` | `#16181B` | Sidebar stat box |
| `--surface-thead` | `#101216` | Table header row |
| `--surface-thumb` | `#1B1E22` | Image placeholder |
| `--surface-avatar` | `#1C1F23` | Avatar circle |
| `--accent` | `#C8102E` | Primary action, active nav marker, bars, alert dots |
| `--accent-hover` | `#E01B3B` | Primary button hover |
| `--accent-soft` | `#F0899C` | Accent text on dark (links, delta chips, times) |
| `--accent-tint` | `rgba(200,16,46,0.16)` | Delta chip background |
| `--text` | `#FFFFFF` | Headings, key figures |
| `--text-body` | `#EDEEF0` | Body text |
| `--text-strong` | `#DDE0E4` / `#D8DCE0` | Secondary emphasis |
| `--text-mid` | `#C4C8CD` | Table cells |
| `--text-muted` | `#B9BDC2` | Hero subcopy |
| `--text-dim` | `#9AA0A6` | Inactive nav items |
| `--text-faint` | `#8C9298` | Labels, captions |
| `--text-fainter` | `#7E848A` / `#71767C` / `#6E7378` | Table head, placeholder, tagline |
| `--dot-idle` | `#3A3D42` | Inactive nav dot |
| `--border` | `rgba(255,255,255,0.09)` | Card borders |
| `--border-soft` | `rgba(255,255,255,0.055)` | Table row divider |
| `--border-input` | `rgba(255,255,255,0.12)` | Search field |
| `--border-chip` | `rgba(255,255,255,0.14)` | Filter chips, status pills |
| `--chip-bg` | `rgba(255,255,255,0.07)` | Neutral tag background |
| `--hover-row` | `rgba(255,255,255,0.03)` | Table row hover |
| `--hover-nav` | `rgba(255,255,255,0.05)` | Nav item hover |
| `--nav-active` | `rgba(255,255,255,0.06)` | Active nav background |
| selection | `rgba(200,16,46,0.35)` | `::selection` |

### Typography
- Display / figures: **Cinzel** 400, 600 (Google Fonts) — headline `27px/400`, KPI values `30px/600`,
  sidebar figure `25px/600`, hero title `20px/400 letter-spacing .03em`.
- UI / body: **Heebo** 300, 400, 500, 700 (Google Fonts) — body `13.5–14.5px/400`,
  card titles `16px/500`, labels `12.5px`, micro-labels `11.5px letter-spacing .05–.16em`.
- Do not use Inter/Roboto substitutes; both families are loaded from Google Fonts:
  `https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&family=Cinzel:wght@400;600&display=swap`
- Heebo carries Hebrew; Cinzel is Latin-only and is used only for Latin/numeric display text.

### Spacing & shape
- Page padding: `26px 32px 44px` desktop → `20px` tablet → `16px 14px 32px` mobile.
- Section gap `20px`; card grid gap `14–16px`; inner card padding `18–19px 20–22px`.
- Radii: cards/hero `10px`, buttons/inputs/chips `6px`, pills/status `4px`, thumbnails `5px`, avatar `50%`.
- Borders: 1px. No drop shadows anywhere — separation comes from surface + border only.
- Active nav item uses `box-shadow: inset 2px 0 0 #C8102E` (inline-start edge in RTL).

## Layout

Root grid: `grid-template-columns: 236px 1fr`, `max-width: 1440px`, `min-height: 1024px`.

### Sidebar (236px)
Vertical flex, `gap: 28px`, padding `26px 18px`, background `#101113`, inline-start border.
1. **Logo** — `assets/logo.png`, full width, auto height. It contains the wordmark
   "YEDIDIA MOTORS", the rule with "רכבי יוקרה", and "ביבוא מקביל" in accent red.
2. **Nav** (7 items): סקירה כללית · מלאי רכבים (active) · הזמנות בדרך · לידים ולקוחות ·
   עסקאות ומימון · טסט דרייב · דוחות. Each: 5px dot + 14px label, `11px 12px` padding, 6px radius.
3. **Footer box** — role dependent (see Roles), then tagline `FOR PEOPLE WHO LOVE THE LIFE`,
   `11px letter-spacing .12em`, `#6E7378`, centered.

### Main column
1. **Top bar** — eyebrow label, `בוקר טוב, דניאל` (Cinzel 27px), meta line
   `{branch} · {role} · עודכן היום 08:40`; right side: search field (44px tall, 250px min),
   primary red button (44px), 44px avatar `ד.כ`. All controls are ≥44px for touch.
2. **Hero banner** — 168px, `assets/showroom.png` with
   `linear-gradient(90deg, rgba(10,10,11,.92) 30%, rgba(10,10,11,.25) 78%)` over
   `background-size: cover, 140%; background-position: center, center 32%`.
   Title `מגוון מותגים, מגוון רכבים · יבואן אחד`, brand line
   `Land Rover · Mercedes-Benz · BMW · Porsche · Jeep · RAM TRX`,
   three outline pills: 100% מימון · אחריות ושירות · שיטת שלם וסע.
3. **KPI row** — 4 equal cards: label, big Cinzel value + unit, delta chip + note.
4. **Split section** — `1.62fr 1fr`: inventory table left, stacked side cards right.

### Inventory table
Header row: filter chips (הכל active red, then LAND ROVER / MERCEDES / BMW / PORSCHE / JEEP).
Column grid `96px 1fr 54px 104px 54px 88px`, gap 10px, row padding `12px 22px`:
thumbnail · model + trim · year · price · days in stock · status pill.
Model and trim truncate with ellipsis. Footer link `הצג את כל 118 הרכבים ←` in `#F0899C`.

### Side cards
`תמהיל מלאי לפי מותג` (5 brand bars, 4px track, accent fill),
`דורש תשומת לב` (managers only), `הזמנות בדרך`,
plus `טסט דרייב היום` and `הלידים שלי לטיפול` for sales roles.

## Roles (state)
Single state variable `viewMode`: `איש מכירות` | `מנהל מכירות` | `מנהל מלאי` | `בעלים`.
Derived: `isManager = viewMode !== 'איש מכירות'`, `isSales = !isManager`.
Second variable `branchName` (default `מגרש ראשי`).

| Element | Sales | Manager / Owner |
|---|---|---|
| Sidebar footer box | My monthly goal: 7 of 10 deliveries, 70% bar, expected commission ₪31.4K | **Stock value ₪74.6M** + `הנהלה` badge, 118 vehicles, 41 avg days |
| Eyebrow label | יום המכירות שלי | מלאי רכבים |
| Primary button | עסקה חדשה | הוספת רכב למלאי |
| Table title | זמין להצעה ללקוח | רכבים במלאי |
| KPI row | my deliveries / expected commission / open leads / test drives today | available for delivery / reserved / avg days in stock / over 90 days |
| `טסט דרייב היום` + `הלידים שלי` cards | shown | hidden |
| `דורש תשומת לב` card | hidden | shown |

**Stock value (₪74.6M) must never render for the salesperson role** — enforce this server-side/at the
data layer too, not only in the view.

## Responsive behavior
Three breakpoints, driven by container width:

**≤1180px (tablet)**
- Single-column shell; sidebar becomes a horizontal top bar (`flex-direction: row`, padding `14px 20px`,
  horizontal scroll), logo fixed at 190px, nav horizontal, footer box inline, tagline hidden.
- KPI grid → 2 columns. Split section → 1 column. Side cards → 2-up grid.
- Main padding `20px`.

**≤760px (mobile)**
- Sidebar wraps; nav moves to its own full-width scrollable row (`order: 3`).
- Top bar stacks; search field hidden (surface it behind an icon in production).
- Hero loses fixed height, gradient becomes vertical (`180deg`), padding `22px 18px`.
- KPI grid stays 2 columns, gap 10px. Side cards → 1 column.
- Table header row hidden; each row becomes `72px 1fr auto` (thumb · text · price) and the
  year / days / status columns collapse into one muted meta line under the trim:
  `2026 · 12 ימים במלאי · זמין`.
- Card headers stack; filter chips scroll horizontally.

Touch targets: minimum 44×44px (buttons, avatar, search, filter chips at `6px 10px` + 44px row height on mobile).

## Interactions
- Nav items, table rows, filter chips and the primary button have hover states only (listed in tokens).
  No transitions were specified; `120ms ease` on background/border color is a safe default.
- Filter chips: single-select, filter the inventory list client-side.
- Table row click → vehicle detail screen (not yet designed).
- Footer link → full inventory screen (not yet designed).
- No loading/error/empty states are designed yet. Suggested: skeleton rows matching the
  `96px 1fr 54px 104px 54px 88px` grid; empty state inside the table card using `#8C9298` text.

## Data shape
```ts
type Vehicle = {
  model: string;      // "Land Rover Defender 110"
  trim: string;       // "X-Dynamic HSE · אפור אייגר"
  year: number;       // 2026
  price: number;      // 689000 → formatted "₪689,000" (en-US grouping)
  days: number;       // days in stock
  status: 'זמין' | 'שמור' | 'בהכנה' | 'לתמחור';
  imageUrl?: string;
};
type BrandMix   = { name: string; units: number };            // bar width = units / max
type Alert      = { title: string; detail: string };
type TestDrive  = { time: string; client: string; car: string };
type Lead       = { name: string; interest: string; tag: string };
type Incoming   = { model: string; note: string; eta: string };
```
Price formatting: `'₪' + n.toLocaleString('en-US')`.
All sample content in the prototype is dummy data — replace with the real inventory feed.

## Assets
- `design/assets/logo.png` — Yedidia Motors logo, cropped from the brand image supplied by the client.
  Request a vector (SVG) original before shipping; the PNG is a raster crop.
- `design/assets/showroom.png` — exterior photograph of the showroom, used as the hero background.
- Vehicle thumbnails: **not supplied**. Placeholders in the prototype.
- Brand logos (Land Rover, Mercedes-Benz, BMW, Porsche, Jeep, RAM) are referenced as **text only** in
  this design. If real marks are added later, confirm usage rights with each manufacturer.

## Files
- `design/Luxury Dashboard v3.dc.html` — the current design (role-aware, responsive).
- `design/assets/` — logo and showroom image.

## Not yet designed
Vehicle detail page, full inventory screen, leads/customer screens, deals & financing,
reports, settings, login, and all empty/error/loading states.
