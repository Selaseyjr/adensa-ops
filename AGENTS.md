# Adensa Ops - frontend conventions

## Brand architecture (Adensa Group of Companies)

- **Master brand:** Adensa. Umbrella entity: **Adensa Group of Companies**.
- **Branches:** every legal entity is `Adensa <category>` (first branch:
  Adensa Supply & Logistics Ltd; future branches e.g. Adensa Real Estate).
- **Internal platform:** **AdensaOps** is a Group-level operations product. It
  serves every branch as a workspace/module (e.g. AdensaOps · Supply &
  Logistics). Never treat it as belonging to one branch, never rename it per
  branch, and never expose the name AdensaOps on customer-facing products.
- **Mark:** "First Light": a gold half-sun with five rays rising over two
  stepped bars (navy bars on light surfaces, ivory bars on dark). One geometry
  lives in `src/components/brand.tsx` and is mirrored by
  `scripts/build-brand-assets.mjs`; `brand.test.ts` fails if they drift.
- **Lockups:** the brand lockup is mark + ADENSA (Poppins, the only place the
  face is used) + category descriptor. The current "SUPPLY & LOGISTICS"
  descriptor makes the shipped lockups the Supply & Logistics *branch*
  lockups. Group and platform variants get their own descriptors via the
  `descriptor` prop / build script, never hand-edited. Static files (favicons,
  `public/brand/*.svg`) come from `npm run brand:assets`; never edit them by hand.
- The sidebar footer "Adensa Supply & Logistics Ltd." is correct while the
  platform serves one branch; make it workspace-aware when branch two lands.

## Copy rules (apply to ALL user-facing text)

- **No em dashes (—) or en dashes in prose, labels, tooltips or data strings.**
  Use periods, commas, colons or ` · ` separators instead. (Code comments are
  exempt; screen text never is.)
- **No tutorial copy.** The product must read like a professional digital
  product, not a walkthrough. No "start there to see…", "click a marker for
  details", "Demo data. Synthetic records…" banners, or on-screen instructions
  telling users how to use a feature. The Demo/Real toggle already communicates
  the data mode; do not add mode banners.
- Keep on-screen text short. Placeholders in tables are `N/A` (never a dash).
- **Slogan:** **"Your project. Our procurement."** on every product, business
  and client-facing surface (AdensaOps, splash, quotes, decks). The older
  "The Night Never Falls." line is retired from product surfaces.
- Product name: **AdensaOps** (one word, as the operator writes it) in titles,
  aria labels and on-screen nameplates. The company name stays
  "Adensa Supply & Logistics Ltd."
- Landing page carries an **AdensaOps** nameplate eyebrow above the
  "Welcome back!" heading; keep it.
- Notification copy: plain, brief, factual. Empty state: "You're all caught
  up" + one short line. No enumerations of features in the empty state.

## UI conventions

- Clickables: visible hover state AND `cursor-pointer` (there is a global
  `button:not(:disabled), [role="button"], a[href]` cursor rule in index.css).
- The logo is the inline `<AdensaLogo />` component (`src/components/brand.tsx`).
  It follows the theme through tokens (no image swap), is NOT styled as a
  button, carries a hover (opacity) affordance, and returns the user to the
  Dashboard when clicked. Do not reintroduce image lockups or button chrome
  around the logo.
- Day/night theme changes crossfade via the global colour transition in
  index.css (respects prefers-reduced-motion). Do not remove it; large surfaces
  should keep colour transitions so the toggle never flickers.
- The sidebar rail is slim and grouped (Operate: Dashboard, Orders, Quotes ·
  Source: Suppliers, Compare prices · Money: Cash · People: Customers). It uses
  the surface tokens in light and the navy surface under `.dark`.
- Top bar: breadcrumbs (group › page), "Search or jump to" (Ctrl+K), theme
  toggle, Demo/Real switch, notifications, navy "New quote" button.

## Design tokens (First Light)

- Light: canvas #F6F5F1, surface #FFFFFF, border #E8E5DD, text #0E1B2C,
  muted #566072, primary (buttons) #0E1B2C, accent gold #D4A21E, gold text on
  white #8A6A12. Dark: canvas #0A1220, surface #101C2E, border #1E2C43,
  text #E8ECF2, muted #9AA6B8, primary #E0B23A (navy text on it).
- Status only: success #1F8A5B, warning #A86400, danger #C0392B, info #2F6FDB
  with soft backgrounds #E6F4EC, #FDF3E1, #FCEDEB, #E8EFFC. Use the semantic
  utilities (`text-warning`, `bg-danger-soft`, `bg-primary text-on-primary`),
  never raw Tailwind palette colours (amber/rose/teal...).
- Type: Inter for all UI, with tabular numbers (`.num`, tables). Poppins only
  inside the logo. No mono or serif faces.
- Surfaces: thin 1px borders, no heavy coloured tiles, no chamfered/HUD panels.
- Chart series colours are validated (CVD-safe in both themes): order stages
  use one ordinal navy ramp; categories use the categorical tokens.

## Business rules (enforced in `src/lib/rules.ts`)

- A 70% deposit confirms an order; the balance is due before offloading.
- Established clients (3+ fully paid orders) may confirm with 50%.
- Supplier prices older than 14 days are stale; re-check before quoting.
- Payments only into the company MoMo merchant or bank account.
- Rule-break flags: "Delivered with balance owing", "Deposit below 70%",
  "Late", "Quote expiring", "Stale price". Show them wherever orders are
  listed; never hide a flag to make a screen look clean.
- Money model: `depositGhs` is the confirming deposit (matches its
  `deposit_in` cash entries). Every later payment is a `balance_in` cash
  entry only. Never add balance payments to `depositGhs`.

## Data mode

- Demo mode shows simulated data, including the simulated notification feed.
- Demo seed dates are offsets from today (`day(n)` in `src/data/demo.ts`), so
  the demo never goes stale. Never hard-code calendar dates in demo data.
- Demo data follows the business rules; the only breaks are one deliberate
  example per flag (guarded by `src/data/demo.test.ts`). The simulation
  follows the rules too.
- Real mode NEVER shows simulated data anywhere, including notifications.
- Real mode is PIN-gated (client-side speed bump). The PIN is not stored in
  this repository - ask the operator. Never write a PIN or seed into source.
