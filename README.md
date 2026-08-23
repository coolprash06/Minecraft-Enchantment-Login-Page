# The Enchanted Archive

A Minecraft-styled login page built around a voxel enchanting table with a
floating book. Click the book, it opens, and the login flow plays out as
handwritten text on its pages.

Built to [`prd.md`](prd.md) (design #3 of the 12-week UI/UX portfolio series).

## Run it

Open **`index.html`** in a browser. That's the whole thing — one
self-contained file, no server, no network, no build step required to view it.
Three.js, both fonts, the CSS and the app code are all inlined.

**Demo credentials:** `steve` / `diamondpickaxe`

## What's in here

```
index.html      the deliverable — open this
welcome.html    the post-login landing page, opened in a new tab on success
build.mjs       inlines src/ into index.html and welcome.html
src/
  page.html     markup + the <style>/<script> slots
  styles.css    overlay chrome and book-page typography
  app.js        scene, textures, particles, page tracking, login flow
  welcome.html  source for the post-login landing page
  fonts/        two woff2 subsets (embedded at build time)
  vendor/       three.js r169
prd.md          the design brief
```

To rebuild after editing `src/`:

```
node build.mjs
```

`build.mjs` also rewrites three.js's trailing `export{...}` into a plain
global and wraps it in an IIFE, because ES module imports are blocked on
`file://` — that's what lets the built page open by double-click.

## Notes on the build

**Everything is drawn at runtime.** No Minecraft assets are used. Each block
texture is painted pixel-by-pixel into a 16×16 (or 32×32) `<canvas>` from a
seeded PRNG, then sampled with `NearestFilter` so it stays crisp and blocky at
any magnification. Obsidian, the gold-trimmed table cloth, amethyst, oak
planks, bookshelf spines, leather, page edges, parchment and deepslate are all
generated in `app.js` §2. The rune alphabet and the page sigil are invented
geometry, drawn as inline SVG.

**Minecraft-style face shading, not lighting.** The game shades each cube face
by a fixed multiplier rather than lighting it, so the scene uses
`MeshBasicMaterial` with a small `onBeforeCompile` patch that picks the
multiplier from the fragment's **world** normal — top 1.0, north/south 0.72,
east/west 0.52, bottom 0.42, applied as `pow(f, 2.2)` so the darkening happens
in gamma space and lands on the brief's obsidian ramp
(`#1a0f2e` → `#120a22` → `#0c0718`). Deriving it from the world normal rather
than baking it into the textures matters because the book rotates constantly —
baked shading would turn its cover black the moment it lay flat.

**The page text is real DOM.** A single `<div>` is projected onto the book's
paper with a `matrix3d` built from the same camera matrices the renderer uses,
so the text tracks the book through the open animation and the mouse parallax.
Two details were needed to make that work:

- The CSS transform chain is in pixels, and the half-viewport translate on the
  camera element gets acted on by the camera rotation. A scene measured in
  blocks would be swamped by it, so both matrices are conjugated into pixel
  space by `PPU`, with a matching `1/PPU` scale on the page anchor.
- The element's font-size is set from the on-screen scale, so page text is the
  same physical size on a phone and a 4K monitor, and each leaf then
  auto-shrinks its type until its content genuinely fits the paper.

**The covers can't splay far.** The paper lies dead flat so the DOM spread can
be a single plane. That caps the cover angle at about 0.109 rad — beyond it a
cover's outer half rises above its own page and occludes it.

**Portrait viewports roll the book.** Half a landscape spread is far too narrow
for a form at 375px, so on any portrait viewport the book turns 90° in its own
plane: the crease runs across the screen, the leaves stack, and each page gets
the full width. The DOM anchor counter-rotates so the text stays upright, and
the real gutter width is passed to CSS as `--crease` so nothing lands on the
spine.

## Wiring up real auth

`authenticate(username, password)` at the top of `app.js` is the only seam.
Replace its body with a `fetch` returning a promise of a boolean; everything
else is unchanged. The 10-second Crafting/Enchanting/Brewing sequence runs
independently of it — the brief calls for a paced flourish regardless of how
fast the check resolves, so the flow awaits both and uses whichever verdict
comes back.

`CONFIG` next to it holds the demo credentials, the post-login page, and the
timings for the rite and the verdicts.

## Behaviour details

- **Popup blocking.** No tab is opened until a successful verdict has fully
  played out — the user's focus stays on the main tab through the whole
  Crafting/Enchanting/Brewing sequence and verdict, on both the success and
  failure paths. On success, once the particle burst finishes, `window.open`
  is tried exactly once; this is well past the point browsers still treat it
  as gesture-triggered, so it's expected to be blocked. When it is, the page
  surfaces an "Enter the Archive" button instead of silently doing nothing —
  a real click is always a valid gesture. On invalid credentials, no tab is
  ever opened.
- **`prefers-reduced-motion`.** No bob, spin, parallax, camera move or
  particles; the book snaps open and shut and the typewriter prints instantly.
  The 10-second rite still runs — it's pacing, not motion. Toggling the setting
  mid-session clears any live particles.
- **Keyboard and screen readers.** The hint is a real button, so the book can
  be opened without a pointer; the input is a labelled form field submitted by
  Enter; each state change is announced through an `aria-live` region.
- **Empty submits** nudge the field rather than advancing.

`window.enchantedArchive` exposes the scene, camera and book for poking around
from the console.

## Licences

- **three.js** r169 — MIT (`src/vendor/three.LICENSE`)
- **Pixelify Sans** — SIL Open Font License 1.1
- **Special Elite** — Apache License 2.0

Both fonts are free lookalikes intended for exactly this kind of fan/portfolio
use. No Mojang fonts, textures or other assets are included.
