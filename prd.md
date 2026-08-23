# Design Brief — "The Enchanted Archive" Login Page

A Minecraft-themed login page built around an **enchanting table** with a
**closed book** resting on top. Clicking the book opens it, and the login
flow plays out as handwritten text appearing on its pages. Part of a 12-week
UI/UX portfolio series (design #3, following a calendar-flip login and a
1990s-desktop login).

Reference: https://minecraft.wiki/w/Enchanting_Table (for the block's real
proportions, colors, and gem placement — describe/rebuild in your own
words and your own textures, don't pull or trace Mojang's actual texture
files; build original pixel art in this style instead, since we want this
to be a clean portfolio piece).

---

## 1. Art direction

Genuine Minecraft voxel look, not a flat/smooth CSS approximation:

- **True 3D block geometry**, not skewed 2D parallelograms. Use Three.js
  (or Babylon.js) with `BoxGeometry` blocks — this is what makes it read
  as "Minecraft" rather than "generic isometric crystal."
- **Hard-edged, low-poly, no smoothing.** No rounded corners, no soft
  drop shadows, no gradients standing in for texture. Minecraft's whole
  visual identity is flat-shaded cubes with pixelated surface texture.
- **Pixelated textures**, not gradients. Each block face should look like
  a tiled 16×16-style pixel texture (blocky noise/speckle pattern), not a
  smooth linear-gradient. If using Three.js, generate small procedural
  canvas textures (e.g. 16×16 or 32×32 px) and apply them with
  `texture.magFilter = THREE.NearestFilter` so they stay crisp and
  pixelated when scaled up — never blurred.
- **Lighting**: simple flat/ambient + one directional light, Minecraft-style
  — each visible cube face a slightly different shade of the same hue
  (top lightest, side faces darker), like in-game block shading. No PBR,
  no reflections, no bloom on the blocks themselves (save glow effects
  for the enchantment particles only).
- **Camera**: fixed isometric-ish 3D perspective (slight orbit/parallax
  on mouse move is a nice touch, but keep it subtle — a few degrees).

## 2. Color palette

| Element | Color | Hex |
|---|---|---|
| Table top face | Obsidian purple-black | `#1a0f2e` |
| Table side faces (2 shades, darker) | `#120a22` / `#0c0718` |
| Bookshelf/base texture accents | Warm brown wood | `#4a3220` |
| Gem / enchantment glow | Bright violet | `#b46bff` core, `#5a1fa3` shadow |
| Ambient particles / runes | Light lavender glow | `#dcb8ff` |
| Book cover (closed) | Leather brown | `#5c3a1e` → `#3c2410` |
| Book trim / clasp | Gold | `#d4af37` |
| Book page (open) | Aged parchment | `#f2e6c9` |
| Page ink | Dark brown-black | `#2b1d0e` |
| Success text | Minecraft "enchant" green | `#55ff6a` glow |
| Error text | Minecraft error red | `#ff5b5b` |
| Background | Night sky / void, near-black with faint stars | `#08050f` |

## 3. Typography

- **UI/system text** (page title, status text like "CRAFTING...",
  buttons): a blocky pixel font in the Minecraft family style — e.g.
  **Monocraft** (free, open-source, on GitHub) or **Minecraftia** /
  **Minecraft Ten** (free fan-made lookalikes widely used for Minecraft
  fan projects). Don't use Mojang's actual proprietary font file; these
  lookalikes are built for exactly this kind of fan/portfolio use.
- **Book page text** (username/password prompts, in-book copy): a
  handwritten/typewriter serif — this mimics the actual in-game book UI
  font. Google Fonts "**Special Elite**" or "**IM Fell English**" both work.

## 4. Scene layout

```
                [ THE ENCHANTED ARCHIVE ]   <- pixel-font title, top center

                     .  ·    ·  .
                   ·   (ambient particles)
                        📖  <- closed book, floating/bobbing
                            slowly above table, slight idle rotation
                  ◆              ◆
                 ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲   <- enchanting table, 3D voxel cube
                │  obsidian top    │      with 4 amethyst/gem blocks at
                │   ◆          ◆  │      each corner, faint particle
                ╰──────────────────╯      wisps rising off it continuously

                     click the book to begin   <- hint text below
```

- Table: a single obsidian-textured cube base, 4 smaller glowing gem
  cubes at the corners (as in the reference), continuous faint upward
  purple particle wisps (small glowing quads that drift up and fade,
  like in-game enchanting table particles).
- Book: floats ~40–60px above the table, idle animation = gentle vertical
  bob (±10–15px) + slow slight rotation, looping indefinitely while closed.
  Closed book is fully shut (no visible pages), leather cover with a gold
  clasp/gem in the center front — matches the closed-book reference image.

## 5. Interaction flow & states

**State 1 — Closed (idle).**
Book floats/bobs above the table. Hint text below: `click the book to begin`.
Clicking the book triggers the open animation.

**State 2 — Opening.**
Book stops bobbing, rotates to face the viewer, cover(s) swing open
(hinge rotation, ~0.8–1s, eased) revealing blank/lined pages. Idle
floating pauses while the book is open.

**State 3 — Username prompt.**
Page text (typewriter-style, characters appearing one at a time) prints:
`Enter your username`
A text input + submit control appears below it on the page. Enter key or
button click submits.

**State 4 — Password prompt.**
Page clears, prints: `Enter your password`
Password-type input appears. Submit advances to checking.

**State 5 — Checking credentials (10s total).**
Lines print in sequence, each staying visible once shown, with the
previous line getting a checkmark when the next begins:
1. `Crafting.....` — visible for 4s
2. `Enchanting......` — visible for 3s
3. `Brewing.....` — visible for 3s

Total: 10 seconds, even if the actual credential check resolves
instantly — this is a deliberate paced flourish, not a real loading time.

**State 6a — Success.**
Page shows `SUCCESS` in green pixel font for 5s. Book then closes
(reverse of opening animation). Once closed, a burst of green
"experience orb" particles (small glowing green squares/cubes, Minecraft
XP-orb style) erupts from the book and fades over ~5s. After that,
redirect to a fresh browser tab.

**State 6b — Invalid credentials.**
Page shows `INVALID CREDENTIALS` in red pixel font for 5s. Book closes.
No particle burst. Returns to State 1 (idle, closed) — hint text updates
to `tap the book to try again`.

## 6. Technical notes

- Recommended stack: **Three.js** for the 3D table/book/particles, layered
  with an **HTML/CSS overlay** for the actual book page text and form
  inputs (much easier to get crisp, accessible text and inputs in DOM
  than in WebGL) — positioned to track the book's on-screen projection.
- Keep all textures procedurally generated or hand-drawn originals (e.g.
  small `<canvas>`-drawn pixel patterns converted to textures) rather
  than sourcing actual Minecraft game texture files — this keeps the
  piece fully original for portfolio use.
- Respect `prefers-reduced-motion`: fall back to instant state changes
  (no bob, no particle animation, no rotation) if set.
- Keep it responsive: table/book scene should scale down gracefully on
  mobile viewports (test at ~375px wide).
- Demo credentials (since there's no real backend): pick any placeholder
  username/password pair and hardcode the check client-side for now;
  structure it so swapping in a real auth call later is a one-function
  change.