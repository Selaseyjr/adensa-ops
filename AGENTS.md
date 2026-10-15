# Adensa Ops - frontend conventions

## Brand architecture (Adensa Group of Companies)

- **Master brand:** Adensa. Umbrella entity: **Adensa Group of Companies**.
- **Branches:** every legal entity is `Adensa <category>` (first branch:
  Adensa Supply & Logistics Ltd; future branches e.g. Adensa Real Estate).
- **Internal platform:** **AdensaOps** is a Group-level operations product. It
  serves every branch as a workspace/module (e.g. AdensaOps · Supply &
  Logistics). Never treat it as belonging to one branch, never rename it per
  branch, and never expose the name AdensaOps on customer-facing products.
- **Lockups:** the brand lockup is mark + ADENSA + category descriptor. The
  current "SUPPLY & LOGISTICS" descriptor makes the shipped lockups the Supply
  & Logistics *branch* lockups. Group and platform variants get their own
  descriptors, generated in the Logo Suite build scripts, never hand-edited.
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
- **Taglines:**
  - Business / product / professional surfaces (Adensa Ops, decks, quotes,
    client-facing material): **"Your project, Our Procurement."**
  - Brand identity material (logo suite, brand story, identity documents):
    **"The Night Never Falls."**
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
- The brand lockup images (`src/assets/adensa-lockup-day.svg` /
  `adensa-lockup-night.svg`) are the brand logo. They swap with the theme, are
  NOT styled as buttons, carry a hover (opacity) affordance, and return the user
  to the Dashboard when clicked. Do not reintroduce a single mark image or a
  button chrome around the logo.
- Day/night theme changes crossfade via the global colour transition in
  index.css (respects prefers-reduced-motion). Do not remove it; large surfaces
  should keep colour transitions so the toggle never flickers.
- The sidebar rail is theme-aware (surface/ink tokens in light, navy brand
  tokens under `.dark`).

## Data mode

- Demo mode shows simulated data, including the simulated notification feed.
- Real mode NEVER shows simulated data anywhere, including notifications.
- Real mode is PIN-gated (client-side speed bump). The PIN is not stored in
  this repository - ask the operator. Never write a PIN or seed into source.
