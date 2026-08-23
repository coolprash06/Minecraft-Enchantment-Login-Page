/* ===================================================================
   THE ENCHANTED ARCHIVE
   A voxel enchanting-table login scene.

   Everything you see is built at runtime: the block textures are drawn
   pixel-by-pixel into small <canvas> elements and sampled with
   NearestFilter, and the geometry is nothing but BoxGeometry. The book's
   page text is real DOM, transformed onto the 3D page surface with the
   same projection maths the renderer uses.
   =================================================================== */
(function () {
'use strict';

/* -------------------------------------------------------------------
   0. Configuration
   ------------------------------------------------------------------- */

var CONFIG = {
  /* Swap this one function for a real fetch() to wire up a backend. */
  credentials: { username: 'steve', password: 'diamondpickaxe' },
  redirectUrl: 'https://minecraft.wiki/w/Enchanting_Table',

  /* Paced flourish — 10s total, regardless of how fast auth resolves. */
  rites: [
    { word: 'Crafting',   dots: 5, hold: 4000 },
    { word: 'Enchanting', dots: 6, hold: 3000 },
    { word: 'Brewing',    dots: 5, hold: 3000 }
  ],
  verdictHold: 5000,
  burstFade: 5000
};

/** The single seam between this scene and a real auth backend. */
function authenticate(username, password) {
  return Promise.resolve(
    username.trim().toLowerCase() === CONFIG.credentials.username &&
    password === CONFIG.credentials.password
  );
}

/* Palette (design brief §2) ------------------------------------------ */
var C = {
  obsidian:   '#1a0f2e',
  wood:       '#4a3220',
  gemCore:    '#b46bff',
  gemShadow:  '#5a1fa3',
  lavender:   '#dcb8ff',
  leather:    '#5c3a1e',
  leatherDim: '#3c2410',
  gold:       '#d4af37',
  parchment:  '#f2e6c9',
  ink:        '#2b1d0e',
  green:      '#55ff6a',
  void:       0x08050f
};

/* Minecraft shades each cube face by a fixed multiplier rather than
   lighting it. These four values reproduce that, and land on the
   brief's obsidian shades (#1a0f2e -> #120a22 -> #0c0718). */
var FACE = { top: 1.0, ns: 0.72, ew: 0.52, bottom: 0.42 };

var HALF_PI = Math.PI / 2;

/* Book proportions, in blocks (1 unit = 1 Minecraft block) ----------- */
var BK = {
  leafW: 0.44,        // cover width, spine -> outer edge
  leafD: 0.58,        // cover height (runs away from the viewer)
  coverT: 0.028,
  pageT: 0.05,
  pageInset: 0.062,   // how far the paper sits inside its cover
  gutter: 0.015,      // half-width of the crease
  /* The paper lies dead flat so the DOM spread can be a single plane, which
     caps how far the covers may splay: past ~0.109rad a cover's outer half
     rises above its own page and occludes it. */
  openCover: 0.075,
  tilt: 0.735         // 42deg lectern tilt toward the camera
};
BK.leafCx = BK.gutter + BK.leafW / 2;
BK.pageW = BK.leafW - BK.pageInset;
BK.pageD = BK.leafD - BK.pageInset;
// The DOM spread covers exactly the paper, so CSS padding is pure margin.
BK.spreadW = 2 * (BK.leafCx + BK.pageW / 2);
BK.spreadD = BK.pageD;

var BOOK_Y = 1.09;    // hovers ~50px above the 0.75-tall table
var BOOK_LIFT = 0.30; // extra rise once it opens, to clear the table
var PPU = 900;        // DOM pixels per world unit on the page surface

/* -------------------------------------------------------------------
   1. Small utilities
   ------------------------------------------------------------------- */

var $ = function (sel) { return document.querySelector(sel); };
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var easeInOut = function (t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/** Deterministic PRNG so the textures are identical on every load. */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
var reduced = reduceQuery.matches;

/* -------------------------------------------------------------------
   2. Procedural pixel textures
   Every texture below is drawn one pixel at a time into a tiny canvas
   in the spirit of a 16x16 block texture. Nothing is sourced.
   ------------------------------------------------------------------- */

function canvasOf(size) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c: c, g: g, n: size };
}

/** Weighted pick from [[color, weight], ...] */
function pick(r, table) {
  var total = 0, i;
  for (i = 0; i < table.length; i++) total += table[i][1];
  var x = r() * total;
  for (i = 0; i < table.length; i++) {
    x -= table[i][1];
    if (x <= 0) return table[i][0];
  }
  return table[table.length - 1][0];
}

function noiseFill(g, n, table, r) {
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      g.fillStyle = pick(r, table);
      g.fillRect(x, y, 1, 1);
    }
  }
}

function speckle(g, n, r, color, count, w, h) {
  w = w || 1; h = h || 1;
  g.fillStyle = color;
  for (var i = 0; i < count; i++) {
    g.fillRect((r() * n) | 0, (r() * n) | 0, w, h);
  }
}

/* --- Obsidian: near-black violet with a faint crystalline sparkle --- */
function texObsidian() {
  var t = canvasOf(16), r = rng(0x0b51);
  noiseFill(t.g, 16, [
    [C.obsidian, 34], ['#160b28', 24], ['#211540', 13],
    ['#120a22', 18], ['#0e0719', 11]
  ], r);
  // crystal veins
  t.g.fillStyle = '#2a1a4d';
  for (var i = 0; i < 5; i++) {
    var x = (r() * 14) | 0, y = (r() * 14) | 0, len = 2 + ((r() * 3) | 0);
    for (var k = 0; k < len; k++) t.g.fillRect((x + k) % 16, (y + k) % 16, 1, 1);
  }
  speckle(t.g, 16, r, '#3d2568', 7);
  speckle(t.g, 16, r, '#5b3a94', 3);
  speckle(t.g, 16, r, '#7a55b8', 1);
  return t.c;
}

/* --- Table top: violet cloth inside a gold trim --------------------- */
function texTableTop() {
  var t = canvasOf(16), g = t.g, r = rng(0x2f10);
  noiseFill(g, 16, [['#150c26', 60], ['#1a0f2e', 30], ['#0f0820', 20]], r);

  // cloth field
  for (var y = 3; y < 13; y++) {
    for (var x = 3; x < 13; x++) {
      g.fillStyle = pick(r, [['#33195a', 42], ['#2b1548', 30], ['#3a1f63', 18], ['#251142', 16]]);
      g.fillRect(x, y, 1, 1);
    }
  }

  // a low-contrast diamond woven into the cloth
  g.fillStyle = '#4d2b80';
  var diamond = [[8, 4], [7, 5], [9, 5], [6, 6], [10, 6], [5, 7], [11, 7],
                 [6, 8], [10, 8], [7, 9], [9, 9], [8, 10]];
  for (var i = 0; i < diamond.length; i++) g.fillRect(diamond[i][0], diamond[i][1], 1, 1);

  // gold trim, lit on the top-left and tarnished on the bottom-right
  g.fillStyle = C.gold;
  g.fillRect(2, 2, 12, 1); g.fillRect(2, 2, 1, 12);
  g.fillStyle = '#8f7420';
  g.fillRect(3, 13, 11, 1); g.fillRect(13, 3, 1, 11);
  g.fillStyle = '#e8cf70';
  g.fillRect(2, 2, 1, 1); g.fillRect(13, 2, 1, 1); g.fillRect(2, 13, 1, 1);
  return t.c;
}

/* --- Amethyst gem block -------------------------------------------- */
function texGem() {
  var t = canvasOf(16), g = t.g, r = rng(0x77a1);
  noiseFill(g, 16, [[C.gemShadow, 34], ['#6d2cbd', 26], ['#4a1489', 22], ['#7f3ad6', 18]], r);
  // facet: a bright diamond in the middle
  for (var y = 0; y < 16; y++) {
    for (var x = 0; x < 16; x++) {
      var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d < 4.2) { g.fillStyle = pick(r, [[C.gemCore, 60], ['#c88cff', 25], ['#9d55e8', 15]]); g.fillRect(x, y, 1, 1); }
      else if (d < 5.6 && r() > 0.55) { g.fillStyle = '#8a45d8'; g.fillRect(x, y, 1, 1); }
    }
  }
  g.fillStyle = '#efe0ff';
  g.fillRect(6, 5, 2, 1); g.fillRect(6, 6, 1, 1);
  g.fillStyle = '#3a0f6e';
  g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
  g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  return t.c;
}

/* --- Oak planks ----------------------------------------------------- */
function texPlank() {
  var t = canvasOf(16), g = t.g, r = rng(0x1234);
  for (var y = 0; y < 16; y++) {
    var band = pick(r, [['#3a2718', 38], [C.wood, 16], ['#32210f', 26], ['#2a1b0a', 20]]);
    for (var x = 0; x < 16; x++) {
      g.fillStyle = r() > 0.82 ? pick(r, [['#281a0d', 50], ['#43301c', 50]]) : band;
      g.fillRect(x, y, 1, 1);
    }
  }
  // plank seams
  g.fillStyle = '#2e1d10';
  g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
  g.fillRect(8, 0, 1, 8); g.fillRect(3, 8, 1, 8);
  // knots
  g.fillStyle = '#33210f';
  g.fillRect(11, 3, 2, 2); g.fillRect(5, 11, 2, 1);
  return t.c;
}

/* --- Bookshelf side: plank frame packed with book spines ------------ */
function texShelf() {
  var t = canvasOf(16), g = t.g, r = rng(0x5150);
  var plank = texPlank();
  g.drawImage(plank, 0, 0);
  var spines = ['#6d2f2f', '#2f4c6d', '#3f6130', '#61542f', '#552f61', '#6d4830', '#2f6159', '#853624'];
  g.fillStyle = '#241606';
  g.fillRect(0, 3, 16, 10);
  var x = 0;
  while (x < 16) {
    var w = 1 + ((r() * 2.4) | 0);
    if (x + w > 16) w = 16 - x;
    var col = spines[(r() * spines.length) | 0];
    var top = 3 + ((r() * 1.6) | 0);
    g.fillStyle = col;
    g.fillRect(x, top, w, 13 - top);
    // darker cap + a gold band on some spines
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(x, top, w, 1);
    if (r() > 0.62) { g.fillStyle = 'rgba(212,175,55,.75)'; g.fillRect(x, top + 3 + ((r() * 4) | 0), w, 1); }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(x + w - 1, top, 1, 13 - top);
    x += w;
  }
  return t.c;
}

/* --- Book leather --------------------------------------------------- */
function texLeather() {
  var t = canvasOf(16), g = t.g, r = rng(0x9911);
  noiseFill(g, 16, [[C.leather, 40], ['#523216', 24], ['#66452a', 18], ['#472a12', 18]], r);
  g.fillStyle = C.leatherDim;
  g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1);
  g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
  // tooled inset line
  g.strokeStyle = '#6f4c2c'; g.lineWidth = 1;
  g.strokeRect(2.5, 2.5, 11, 11);
  speckle(t.g, 16, r, '#3a2410', 6);
  return t.c;
}

function texGold() {
  var t = canvasOf(16), r = rng(0x4d4d);
  noiseFill(t.g, 16, [[C.gold, 40], ['#c49c2c', 26], ['#e8c95a', 20], ['#a8842a', 14]], r);
  t.g.fillStyle = '#f2dd8a'; t.g.fillRect(0, 0, 16, 1);
  t.g.fillStyle = '#8f7420'; t.g.fillRect(0, 15, 16, 1);
  return t.c;
}

/* --- Aged parchment ------------------------------------------------- */
function texParchment() {
  var t = canvasOf(32), g = t.g, r = rng(0xaced);
  noiseFill(g, 32, [[C.parchment, 62], ['#eee2c4', 22], ['#e8dcbb', 10], ['#f6ecd4', 10]], r);
  speckle(g, 32, r, '#ded0ae', 12);
  speckle(g, 32, r, '#d2c09b', 3);
  // darkened edge
  g.fillStyle = 'rgba(150,125,80,.35)';
  g.fillRect(0, 0, 32, 1); g.fillRect(0, 31, 32, 1);
  g.fillRect(0, 0, 1, 32); g.fillRect(31, 0, 1, 32);
  return t.c;
}

/** Stacked page edges, seen from the side of the block. */
function texPageEdge() {
  var t = canvasOf(16), g = t.g, r = rng(0xbeef);
  for (var y = 0; y < 16; y++) {
    g.fillStyle = pick(r, [[C.parchment, 42], ['#dfd0aa', 30], ['#e9dcbc', 28]]);
    g.fillRect(0, y, 16, 1);
  }
  return t.c;
}

/* --- Deepslate floor ------------------------------------------------ */
function texStone(seed, tint) {
  var t = canvasOf(16), g = t.g, r = rng(seed);
  noiseFill(g, 16, tint, r);
  speckle(g, 16, r, 'rgba(255,255,255,.04)', 8);
  // one soft seam per block edge -- no highlight, or the floor turns to graph paper
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  return t.c;
}

/** Soft halo, used only for glow effects -- never on a block face. */
function texGlow() {
  var t = canvasOf(64), g = t.g;
  var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.28)');
  grd.addColorStop(0.7, 'rgba(255,255,255,.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(t.c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Chunky glow sprite for particles — deliberately 8px, so it stays blocky. */
function texSpark() {
  var t = canvasOf(8), g = t.g;
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(1, 1, 6, 6);
  g.fillStyle = 'rgba(255,255,255,.60)'; g.fillRect(2, 2, 4, 4);
  g.fillStyle = 'rgba(255,255,255,1)';   g.fillRect(3, 3, 2, 2);
  var tex = new THREE.CanvasTexture(t.c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/* --- Canvas -> three.Texture ---------------------------------------- */
var maxAniso = 1;
var texCache = new Map();

function texture(canvas, rx, ry) {
  rx = rx || 1; ry = ry || 1;
  var key = [canvas.__id || (canvas.__id = ++texture._n), rx, ry].join('|');
  if (texCache.has(key)) return texCache.get(key);
  var t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  texCache.set(key, t);
  return t;
}
texture._n = 0;

/**
 * Minecraft-style block shading: no lights, just a fixed multiplier per
 * face. Deriving the multiplier from the WORLD normal (rather than baking
 * it into the texture) means a block keeps its top-lightest shading even
 * while it is rotated -- which the book is, constantly.
 *
 * The multiplier is applied as pow(f, 2.2) so the darkening happens in
 * gamma space, landing on the brief's obsidian ramp #1a0f2e / #120a22 / #0c0718.
 */
var FACE_CHUNK = [
  '{',
  '  vec3 wn = normalize(vWorldNormal);',
  '  float f;',
  '  if (wn.y > 0.5) f = ' + FACE.top.toFixed(3) + ';',
  '  else if (wn.y < -0.5) f = ' + FACE.bottom.toFixed(3) + ';',
  '  else if (abs(wn.x) > abs(wn.z)) f = ' + FACE.ew.toFixed(3) + ';',
  '  else f = ' + FACE.ns.toFixed(3) + ';',
  '  f = min(1.0, f + uGlow);',
  '  diffuseColor.rgb *= pow(f, 2.2);',
  '}'
].join('\n');

function blockMaterial(canvas, rx, ry, spec) {
  var glow = spec.glow ? 0.36 : 0.0;
  var mat = new THREE.MeshBasicMaterial({
    map: texture(canvas, rx, ry),
    fog: spec.fog !== false
  });
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uGlow = { value: glow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vWorldNormal = mat3(modelMatrix) * normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vWorldNormal;\nuniform float uGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FACE_CHUNK);
  };
  mat.customProgramCacheKey = function () { return 'voxel' + glow; };
  return mat;
}

/** A Minecraft block: BoxGeometry plus {top, side, bottom} pixel canvases. */
function voxel(w, h, d, spec) {
  var rep = spec.repeat || [1, 1];
  var side = spec.side || spec.top;
  var bottom = spec.bottom || side;
  var sx = rep[0], sy = rep[1], tx = rep[2] || 1, ty = rep[3] || 1;
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
  var mats = [
    blockMaterial(spec.ew || side, sx, sy, spec),
    blockMaterial(spec.ew || side, sx, sy, spec),
    blockMaterial(spec.top, tx, ty, spec),
    blockMaterial(bottom, tx, ty, spec),
    blockMaterial(spec.ns || side, sx, sy, spec),
    blockMaterial(spec.ns || side, sx, sy, spec)
  ];
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  mesh.matrixAutoUpdate = spec.dynamic !== false;
  return mesh;
}

/* -------------------------------------------------------------------
   3. Renderer, scene, camera
   ------------------------------------------------------------------- */

var canvas = $('#gl');
var renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', '<p id="noscript">This scene needs WebGL.</p>');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(C.void, 1);
maxAniso = renderer.capabilities.getMaxAnisotropy();

var sparkTex = texSpark();
var glowTex = texGlow();
var shelfSpots = [];

var scene = new THREE.Scene();
var FOG = { idle: [7, 19] };
scene.fog = new THREE.Fog(C.void, FOG.idle[0], FOG.idle[1]);

var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 120);

/* Textures, built once. */
var TX = {
  obsidian: texObsidian(),
  tableTop: texTableTop(),
  gem: texGem(),
  plank: texPlank(),
  shelf: texShelf(),
  leather: texLeather(),
  gold: texGold(),
  parchment: texParchment(),
  pageEdge: texPageEdge(),
  stoneA: texStone(0x31a1, [['#191527', 34], ['#141020', 26], ['#1f1a30', 18], ['#100d1b', 22]]),
  stoneB: texStone(0x31a2, [['#141020', 40], ['#100d1a', 30], ['#1a1629', 30]])
};

/* --- Floating island ------------------------------------------------ */
var island = new THREE.Group();
(function () {
  var tiers = [
    { s: 6, y: -0.5, tex: TX.stoneA },
    { s: 4, y: -1.5, tex: TX.stoneB },
    { s: 2, y: -2.5, tex: TX.stoneB }
  ];
  tiers.forEach(function (t) {
    var m = voxel(t.s, 1, t.s, {
      top: t.tex, side: t.tex, repeat: [t.s, 1, t.s, t.s], dynamic: false
    });
    m.position.y = t.y;
    m.updateMatrix();
    island.add(m);
  });
})();
scene.add(island);

/* --- Enchanting table ----------------------------------------------- */
var table = new THREE.Group();
(function () {
  // 16x4x16 obsidian plinth
  var plinth = voxel(1, 0.25, 1, { top: TX.obsidian, side: TX.obsidian, dynamic: false });
  plinth.position.y = 0.125;
  plinth.updateMatrix();
  table.add(plinth);

  // inset 14x8x14 upper block, cloth-topped
  var upper = voxel(0.875, 0.5, 0.875, { top: TX.tableTop, side: TX.obsidian, bottom: TX.obsidian, dynamic: false });
  upper.position.y = 0.5;
  upper.updateMatrix();
  table.add(upper);

  // four amethyst gems at the plinth corners
  var gemGlow = new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(C.gemCore),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, fog: false
  });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
    var gem = voxel(0.17, 0.17, 0.17, { top: TX.gem, side: TX.gem, glow: true, dynamic: false });
    gem.position.set(p[0] * 0.415, 0.335, p[1] * 0.415);
    gem.updateMatrix();
    table.add(gem);
    var halo = new THREE.Sprite(gemGlow);
    halo.scale.set(0.8, 0.8, 1);
    halo.position.copy(gem.position);
    table.add(halo);
  });
})();
scene.add(table);

/* --- Bookshelf alcove ------------------------------------------------ */
(function () {
  var spots = [];
  var x;
  for (x = -2; x <= 2; x++) { spots.push([x, 0.5, -2]); spots.push([x, 1.5, -2]); }
  [-1, 0, 1].forEach(function (z) { spots.push([-2, 0.5, z]); spots.push([2, 0.5, z]); });
  spots.push([-2, 1.5, -1], [2, 1.5, -1]);
  spots.forEach(function (p) {
    var b = voxel(1, 1, 1, { top: TX.plank, side: TX.shelf, dynamic: false });
    b.position.set(p[0], p[1], p[2]);
    b.updateMatrix();
    scene.add(b);
    shelfSpots.push(new THREE.Vector3(p[0], p[1], p[2]));
  });
})();

/* -------------------------------------------------------------------
   4. The book
   Local frame: spine runs along Z at x=0; leaves swing about Z.
   leafAngle 0 = spread flat, PI/2 = shut.
   ------------------------------------------------------------------- */

var bookHalo;                        // soft violet glow behind the shut book
var bookOuter = new THREE.Group();   // world placement, spin, lectern tilt
var bookRoll = new THREE.Group();    // spins the spread within its own plane
var bookInner = new THREE.Group();   // lays the shut book flat while idle
var pageUnroll = new THREE.Group();  // cancels the roll, keeping page text upright
var leafL = new THREE.Group();
var leafR = new THREE.Group();
var pagesL = new THREE.Group();      // counter-rotates so the spread reads flat
var pagesR = new THREE.Group();
var pageAnchor = new THREE.Object3D();

(function buildBook() {
  var W = BK.leafW, D = BK.leafD, cx = BK.leafCx;
  var coverY = -(BK.pageT / 2 + BK.coverT / 2);

  function leaf(sign, group, pages) {
    var cover = voxel(W, BK.coverT, D, { top: TX.leather, side: TX.leather, dynamic: false });
    cover.position.set(sign * cx, coverY, 0);
    cover.updateMatrix();
    group.add(cover);

    var stack = voxel(BK.pageW, BK.pageT, BK.pageD, {
      top: TX.parchment, side: TX.pageEdge, bottom: TX.parchment, dynamic: false
    });
    stack.position.set(sign * cx, 0, 0);
    stack.updateMatrix();
    pages.add(stack);
    group.add(pages);
    return cover;
  }

  leaf(-1, leafL, pagesL);
  leaf(1, leafR, pagesR);

  // spine: spans the shut book's full thickness
  var spine = voxel(0.16, 0.052, D + 0.02, { top: TX.leather, side: TX.leather, dynamic: false });
  spine.position.set(0, -0.062, 0);
  spine.updateMatrix();
  bookInner.add(spine, leafL, leafR);

  /* Gold clasp on the front cover — the face that ends up on top when
     the book is shut and lying flat. */
  var clasp = new THREE.Group();
  var outward = coverY - BK.coverT / 2;
  var band = voxel(W * 0.46, 0.014, 0.075, { top: TX.gold, side: TX.gold, dynamic: false });
  band.position.set(-cx, outward - 0.007, 0);
  band.updateMatrix();
  clasp.add(band);

  var jewel = voxel(0.055, 0.026, 0.055, { top: TX.gem, side: TX.gem, glow: true, dynamic: false });
  jewel.position.set(-cx, outward - 0.026, 0);
  jewel.updateMatrix();
  clasp.add(jewel);

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
    var stud = voxel(0.036, 0.012, 0.036, { top: TX.gold, side: TX.gold, dynamic: false });
    stud.position.set(-cx + p[0] * (W / 2 - 0.045), outward - 0.006, p[1] * (D / 2 - 0.045));
    stud.updateMatrix();
    clasp.add(stud);
  });
  leafL.add(clasp);

  /* The DOM spread rides just above the flat page surface. It hangs off a
     group that cancels `bookRoll`, so on a portrait viewport the book turns
     to put its crease across the screen while the text stays upright. */
  pageAnchor.position.set(0, BK.pageT / 2 + 0.006, 0);
  pageAnchor.rotation.x = -HALF_PI;
  pageAnchor.scale.setScalar(1 / PPU);
  pageUnroll.add(pageAnchor);
  bookInner.add(pageUnroll);

  // generous invisible click target
  var hit = new THREE.Mesh(
    new THREE.BoxGeometry(BK.spreadW + 0.14, 0.34, D + 0.14),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.name = 'bookHit';
  bookInner.add(hit);

  bookHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(C.gemCore),
    blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, opacity: 0, fog: false
  }));
  bookHalo.scale.set(1.15, 1.15, 1);

  bookRoll.add(bookInner);
  bookOuter.add(bookRoll);
  bookOuter.add(bookHalo);
  bookOuter.position.y = BOOK_Y;
  scene.add(bookOuter);
})();

var bookRollAngle = 0;   // HALF_PI once the layout goes portrait

/** Drives every part of the book from one 0..1 "shutness" value. */
function applyBook(k) {
  // the roll eases in as the book opens, so the idle pose is unaffected
  var roll = bookRollAngle * (1 - k);
  bookRoll.rotation.y = roll;
  pageUnroll.rotation.y = -roll;
  var coverA = lerp(BK.openCover, HALF_PI, k);
  var pageA = lerp(0, HALF_PI, k);
  leafL.rotation.z = -coverA;
  leafR.rotation.z = coverA;
  pagesL.rotation.z = coverA - pageA;
  pagesR.rotation.z = -(coverA - pageA);
  bookInner.rotation.z = -HALF_PI * k;
  bookInner.position.x = -BK.leafCx * k;
  bookOuter.rotation.x = lerp(BK.tilt, 0, k);
  bookOuter.rotation.y = spinFrozen * k;
  bookOuter.position.y = BOOK_Y + BOOK_LIFT * (1 - k) + bobOffset * k;
  // the halo belongs to the shut, clickable book; it fades as the covers open
  bookHalo.material.opacity = k * k * (0.3 + 0.09 * Math.sin(bobPhase * 0.8));
}

/* -------------------------------------------------------------------
   5. Particles — enchantment wisps, bookshelf runes, XP orbs
   ------------------------------------------------------------------- */

var MAX_PARTICLES = 0;
var P = null;

function buildParticles(count) {
  MAX_PARTICLES = count;
  var pos = new Float32Array(count * 3);
  var col = new Float32Array(count * 3);
  var alp = new Float32Array(count);
  var siz = new Float32Array(count);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

  var mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: sparkTex }, uScale: { value: 600 } },
    vertexShader: [
      'attribute vec3 aColor;',
      'attribute float aAlpha;',
      'attribute float aSize;',
      'varying vec3 vC;',
      'varying float vA;',
      'uniform float uScale;',
      'void main(){',
      '  vC = aColor; vA = aAlpha;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = aSize * uScale / max(0.001, -mv.z);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap;',
      'varying vec3 vC;',
      'varying float vA;',
      'void main(){',
      '  vec4 t = texture2D(uMap, gl_PointCoord);',
      '  float a = t.a * vA;',
      '  if (a < 0.01) discard;',
      '  gl_FragColor = vec4(vC * t.rgb * a, a);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  var points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    geo: geo, mat: mat, points: points,
    pos: pos, col: col, alp: alp, siz: siz,
    vx: new Float32Array(count), vy: new Float32Array(count), vz: new Float32Array(count),
    ax: new Float32Array(count), ay: new Float32Array(count), az: new Float32Array(count),
    life: new Float32Array(count), max: new Float32Array(count),
    base: new Float32Array(count),     // base size
    fadeIn: new Float32Array(count),
    cursor: 0
  };
}

var tmpColor = new THREE.Color();

function spawn(o) {
  var i = -1, n = MAX_PARTICLES, start = P.cursor;
  for (var s = 0; s < n; s++) {
    var j = (start + s) % n;
    if (P.life[j] <= 0) { i = j; break; }
  }
  if (i < 0) return;
  P.cursor = (i + 1) % n;

  P.pos[i * 3] = o.x; P.pos[i * 3 + 1] = o.y; P.pos[i * 3 + 2] = o.z;
  P.vx[i] = o.vx || 0; P.vy[i] = o.vy || 0; P.vz[i] = o.vz || 0;
  P.ax[i] = o.ax || 0; P.ay[i] = o.ay || 0; P.az[i] = o.az || 0;
  P.life[i] = P.max[i] = o.life;
  P.base[i] = o.size;
  P.fadeIn[i] = o.fadeIn === undefined ? 0.18 : o.fadeIn;
  tmpColor.set(o.color);
  P.col[i * 3] = tmpColor.r; P.col[i * 3 + 1] = tmpColor.g; P.col[i * 3 + 2] = tmpColor.b;
  P.alp[i] = 0;
  P.siz[i] = o.size;
}

function updateParticles(dt) {
  var pos = P.pos, alp = P.alp, siz = P.siz;
  for (var i = 0; i < MAX_PARTICLES; i++) {
    var l = P.life[i];
    if (l <= 0) { alp[i] = 0; continue; }
    l -= dt;
    if (l <= 0) { P.life[i] = 0; alp[i] = 0; siz[i] = 0; continue; }
    P.life[i] = l;

    P.vx[i] += P.ax[i] * dt; P.vy[i] += P.ay[i] * dt; P.vz[i] += P.az[i] * dt;
    pos[i * 3] += P.vx[i] * dt;
    pos[i * 3 + 1] += P.vy[i] * dt;
    pos[i * 3 + 2] += P.vz[i] * dt;

    var t = 1 - l / P.max[i];                       // 0 -> 1 over lifetime
    var fi = P.fadeIn[i];
    var a = t < fi ? t / fi : Math.min(1, (1 - t) / 0.45);
    alp[i] = a * a;
    siz[i] = P.base[i] * (0.55 + 0.45 * a);
  }
  P.geo.attributes.position.needsUpdate = true;
  P.geo.attributes.aAlpha.needsUpdate = true;
  P.geo.attributes.aSize.needsUpdate = true;
  P.geo.attributes.aColor.needsUpdate = true;
}

var wispAcc = 0, runeAcc = 0;
var WISP_COLORS = [C.lavender, C.gemCore, '#c79bff'];

function emitAmbient(dt) {
  wispAcc += dt;
  var every = 1 / 34;
  while (wispAcc > every) {
    wispAcc -= every;
    var a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
    spawn({
      x: Math.cos(a) * r, y: 0.76, z: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 0.06,
      vy: 0.16 + Math.random() * 0.24,
      vz: (Math.random() - 0.5) * 0.06,
      ay: 0.06,
      life: 2.2 + Math.random() * 1.6,
      size: 0.032 + Math.random() * 0.03,
      color: WISP_COLORS[(Math.random() * WISP_COLORS.length) | 0]
    });
  }

  // glyphs drifting out of the bookshelves toward the table
  if (!shelfSpots.length) return;
  runeAcc += dt;
  while (runeAcc > 0.33) {
    runeAcc -= 0.33;
    var s = shelfSpots[(Math.random() * shelfSpots.length) | 0];
    var ox = s.x + (Math.random() - 0.5) * 0.9;
    var oy = s.y + (Math.random() - 0.5) * 0.7;
    var oz = s.z + (Math.random() - 0.5) * 0.9;
    var life = 1.5 + Math.random() * 0.6;
    var tx = (Math.random() - 0.5) * 0.4, ty = 0.85 + Math.random() * 0.4, tz = (Math.random() - 0.5) * 0.4;
    var g = -1.6;
    spawn({
      x: ox, y: oy, z: oz,
      vx: (tx - ox) / life,
      vy: (ty - oy) / life - 0.5 * g * life,
      vz: (tz - oz) / life,
      ay: g,
      life: life,
      size: 0.026 + Math.random() * 0.014,
      color: C.lavender,
      fadeIn: 0.25
    });
  }
}

function burstXP(origin, count) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var up = 0.35 + Math.random() * 0.9;
    var sp = 0.35 + Math.random() * 1.15;
    spawn({
      x: origin.x + (Math.random() - 0.5) * 0.12,
      y: origin.y + (Math.random() - 0.5) * 0.08,
      z: origin.z + (Math.random() - 0.5) * 0.12,
      vx: Math.cos(a) * sp * 0.8, vy: up + Math.random() * 0.7, vz: Math.sin(a) * sp * 0.8,
      ay: -1.35,
      life: 2.8 + Math.random() * 2.2,
      size: 0.042 + Math.random() * 0.032,
      color: Math.random() > 0.25 ? C.green : '#c8ff8a',
      fadeIn: 0.06
    });
  }
}

function burstSpark(origin, count, color) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - HALF_PI;
    var sp = 0.3 + Math.random() * 0.7;
    spawn({
      x: origin.x, y: origin.y, z: origin.z,
      vx: Math.cos(a) * Math.cos(e) * sp,
      vy: Math.sin(e) * sp * 0.7 + 0.25,
      vz: Math.sin(a) * Math.cos(e) * sp,
      ay: -0.5,
      life: 0.8 + Math.random() * 0.7,
      size: 0.02 + Math.random() * 0.018,
      color: color,
      fadeIn: 0.05
    });
  }
}

/* --- Starfield -------------------------------------------------------- */
var stars;
function buildStars(count) {
  var pos = new Float32Array(count * 3);
  var col = new Float32Array(count * 3);
  var siz = new Float32Array(count);
  var pha = new Float32Array(count);
  var r = rng(0xfeed), c = new THREE.Color();
  for (var i = 0; i < count; i++) {
    var th = r() * Math.PI * 2;
    var ph = Math.acos(2 * r() - 1);
    var rad = 34 + r() * 12;
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
    pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * rad * 0.9 - 6;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad;
    c.set(r() > 0.72 ? C.lavender : '#ffffff');
    var v = 0.35 + r() * 0.65;
    col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
    siz[i] = 1 + r() * 2.2;
    pha[i] = r() * Math.PI * 2;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));
  var mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: sparkTex }, uTime: { value: 0 }, uTwinkle: { value: reduced ? 0 : 1 } },
    vertexShader: [
      'attribute vec3 aColor; attribute float aSize; attribute float aPhase;',
      'uniform float uTime; uniform float uTwinkle;',
      'varying vec3 vC; varying float vA;',
      'void main(){',
      '  vC = aColor;',
      '  vA = mix(1.0, 0.55 + 0.45 * sin(uTime * 1.1 + aPhase), uTwinkle);',
      '  gl_PointSize = aSize;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; varying vec3 vC; varying float vA;',
      'void main(){',
      '  vec4 t = texture2D(uMap, gl_PointCoord);',
      '  float a = t.a * vA;',
      '  if (a < 0.02) discard;',
      '  gl_FragColor = vec4(vC * a, a);',
      '}'
    ].join('\n'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
}

/* -------------------------------------------------------------------
   6. CSS3D — projecting the DOM spread onto the page surface
   This is the same maths three's CSS3DRenderer uses, pared down to the
   single element we need.
   ------------------------------------------------------------------- */

var css3d = $('#css3d');
var css3dCam = $('#css3d-cam');
var spread = $('#spread');

function eps(v) { return Math.abs(v) < 1e-10 ? 0 : v; }

/*
 * Projecting a DOM element onto a 3D surface.
 *
 * #css3d carries `perspective: d`, whose origin is the viewport centre, so
 * a point transformed to (X, Y, Z) lands at O + (P - O) / (1 - Z/d). To make
 * that agree with the WebGL projection -- sx = w/2 + d*xv/-zv -- a view-space
 * point (xv, yv, zv) has to arrive at:
 *
 *     X = w/2 + xv,  Y = h/2 - yv,  Z = d + zv
 *
 * which is `translate3d(w/2, h/2, d)` applied AFTER the view matrix, with the
 * view matrix's second row negated to flip into CSS's y-down space.
 *
 * The scale of that space cancels out of the projection, but not out of the
 * pixel-valued translate, so both matrices are conjugated into pixel units by
 * PPU. The page anchor carries a matching 1/PPU scale, so the element still
 * ends up exactly its world size.
 */
function objectMatrix(m, k) {
  var e = m.elements;
  return 'matrix3d(' + [
    eps(e[0] * k), eps(e[1] * k), eps(e[2] * k), eps(e[3]),
    eps(-e[4] * k), eps(-e[5] * k), eps(-e[6] * k), eps(-e[7]),
    eps(e[8] * k), eps(e[9] * k), eps(e[10] * k), eps(e[11]),
    eps(e[12] * k), eps(e[13] * k), eps(e[14] * k), eps(e[15])
  ].join(',') + ')';
}

function cameraMatrix(m, k) {
  var e = m.elements;
  return 'matrix3d(' + [
    eps(e[0]), eps(-e[1]), eps(e[2]), eps(e[3]),
    eps(e[4]), eps(-e[5]), eps(e[6]), eps(e[7]),
    eps(e[8]), eps(-e[9]), eps(e[10]), eps(e[11]),
    eps(e[12] * k), eps(-e[13] * k), eps(e[14] * k), eps(e[15])
  ].join(',') + ')';
}

var view = { w: 1, h: 1 };

function updateCSS3D() {
  var persp = 0.5 * view.h / Math.tan((camera.fov * Math.PI / 180) / 2);
  css3d.style.perspective = persp + 'px';
  css3dCam.style.transform =
    'translate3d(' + (view.w / 2) + 'px,' + (view.h / 2) + 'px,' + persp + 'px)' +
    cameraMatrix(camera.matrixWorldInverse, PPU);
  spread.style.transform =
    'translate(-50%,-50%)' + objectMatrix(pageAnchor.matrixWorld, PPU);
}

/* -------------------------------------------------------------------
   7. Camera framing (responsive) + parallax
   ------------------------------------------------------------------- */

var framing = {
  idle: { target: new THREE.Vector3(0, 0.86, 0), elev: 0.47, dist: 5 },
  open: { target: new THREE.Vector3(0, BOOK_Y + BOOK_LIFT - 0.02, 0), elev: 0.52, dist: 2 }
};
var camK = 1;                       // 1 = idle framing, 0 = book framing
var parallax = { x: 0, y: 0, tx: 0, ty: 0 };

function fitDistance(worldW, worldH, fracW, fracH) {
  var halfH = Math.tan((camera.fov * Math.PI / 180) / 2);
  var halfW = halfH * camera.aspect;
  return Math.max((worldW / 2) / (fracW * halfW), (worldH / 2) / (fracH * halfH));
}

/* Half a landscape spread is too narrow for a form on an upright screen, so
   on any portrait viewport the book turns 90 degrees in its own plane: the
   crease runs across the screen and each page gets the full width. */
function isPortraitLayout() {
  return view.h > view.w * 1.12;
}

function computeFraming() {
  var portrait = isPortraitLayout();
  bookRollAngle = portrait ? HALF_PI : 0;

  // the spread's footprint, across and up the screen
  var fw = portrait ? BK.spreadD : BK.spreadW;
  var fh = portrait ? BK.spreadW : BK.spreadD;
  var fracW = portrait ? 0.94 : (view.w < 900 ? 0.62 : 0.48);
  var fracH = portrait ? 0.74 : 0.58;

  framing.idle.dist = clamp(fitDistance(5.4, 3.7, 0.88, 0.80), 3.6, 10);
  framing.open.dist = clamp(fitDistance(fw + 0.08, fh, fracW, fracH), 1.05, 4.6);
}

function pxPerWorldUnit(dist) {
  return (view.h / 2) / (Math.tan((camera.fov * Math.PI / 180) / 2) * dist);
}

/*
 * A page is a fixed rectangle of paper: whatever the viewport, the text has
 * to fit inside it. Rather than guess per breakpoint, shrink a leaf's type
 * until its content actually fits, and drop the decorative lore only if even
 * the smallest size will not do.
 */
function fitLeaf(leaf) {
  if (!leaf) return;
  leaf.style.fontSize = '';
  leaf.classList.remove('is-cramped');
  for (var step = 0; step < 7; step++) {
    if (leaf.scrollHeight <= leaf.clientHeight + 1) return;
    leaf.style.fontSize = (1 - (step + 1) * 0.05).toFixed(2) + 'em';
  }
  if (leaf.scrollHeight > leaf.clientHeight + 1) leaf.classList.add('is-cramped');
}

var fitQueued = false;
function fitPages() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(function () {
    fitQueued = false;
    fitLeaf(spread.querySelector('.leaf-l'));
    fitLeaf(spread.querySelector('.leaf-r'));
  });
}

/** Keeps page text at a constant on-screen size whatever the viewport. */
function updateSpreadMetrics() {
  var portrait = isPortraitLayout();
  var worldW = portrait ? BK.spreadD : BK.spreadW;
  var worldH = portrait ? BK.spreadW : BK.spreadD;
  var wpx = worldW * PPU;
  spread.style.width = wpx + 'px';
  spread.style.height = (worldH * PPU) + 'px';

  /* Half the paper-to-paper gap, in element pixels: the layout has to keep
     text off the spine, and the spread element spans both pages. */
  spread.style.setProperty('--crease',
    ((BK.leafCx - BK.pageW / 2) * PPU).toFixed(1) + 'px');

  var onScreen = worldW * pxPerWorldUnit(framing.open.dist);
  var scale = onScreen / wpx;
  var tight = onScreen < 470;
  spread.classList.toggle('is-portrait', portrait);
  spread.classList.toggle('is-tight', tight);
  spread.style.fontSize = ((tight ? 15 : 16.5) / Math.max(0.05, scale)).toFixed(2) + 'px';
  fitPages();
}

var camTarget = new THREE.Vector3();
function applyCamera() {
  var f = framing, k = easeInOut(camK);
  var target = camTarget.lerpVectors(f.open.target, f.idle.target, k);
  var dist = lerp(f.open.dist, f.idle.dist, k);
  var elev = lerp(f.open.elev, f.idle.elev, k) + parallax.y;
  var azim = parallax.x;
  camera.position.set(
    target.x + Math.sin(azim) * Math.cos(elev) * dist,
    target.y + Math.sin(elev) * dist,
    target.z + Math.cos(azim) * Math.cos(elev) * dist
  );
  camera.lookAt(target);
}

function resize() {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  camera.aspect = view.w / view.h;
  camera.updateProjectionMatrix();
  renderer.setSize(view.w, view.h, false);
  if (P) {
    P.mat.uniforms.uScale.value =
      renderer.getContext().drawingBufferHeight / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
  }
  computeFraming();
  updateSpreadMetrics();
}

/* -------------------------------------------------------------------
   8. Tween loop
   ------------------------------------------------------------------- */

var tweens = [];

function tween(ms, ease, onUpdate) {
  return new Promise(function (resolve) {
    if (reduced || ms <= 0) { onUpdate(1); resolve(); return; }
    tweens.push({ t: 0, ms: ms, ease: ease, onUpdate: onUpdate, resolve: resolve });
  });
}

function stepTweens(dt) {
  for (var i = tweens.length - 1; i >= 0; i--) {
    var tw = tweens[i];
    tw.t += dt * 1000;
    var k = Math.min(1, tw.t / tw.ms);
    tw.onUpdate(tw.ease(k));
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
}

/* -------------------------------------------------------------------
   9. Page DOM + the login flow
   ------------------------------------------------------------------- */

var el = {
  body: document.body,
  promptText: $('#prompt-text'),
  caret: $('#caret'),
  form: $('#form'),
  entry: $('#entry'),
  label: $('#entry-label'),
  ritual: $('#ritual'),
  verdict: $('#verdict'),
  steps: $('#steps').children,
  hint: $('#hint-btn'),
  archive: $('#archive-link'),
  live: $('#live')
};

function say(msg) { el.live.textContent = msg; }

/* --- Left-page ornaments, drawn as pixel art -------------------------- */
(function drawOrnaments() {
  var SIGIL = [
    '.....#.....',
    '....#.#....',
    '...#...#...',
    '..#..*..#..',
    '.#..***..#.',
    '#..*****..#',
    '.#..***..#.',
    '..#..*..#..',
    '...#...#...',
    '....#.#....',
    '.....#.....'
  ];
  var rects = '';
  for (var y = 0; y < SIGIL.length; y++) {
    for (var x = 0; x < SIGIL[y].length; x++) {
      var ch = SIGIL[y][x];
      if (ch === '.') continue;
      rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' +
        (ch === '*' ? '#5a1fa3' : C.ink) + '"/>';
    }
  }
  $('.sigil').innerHTML =
    '<svg viewBox="0 0 11 11" width="100%" height="100%" shape-rendering="crispEdges">' + rects + '</svg>';

  // Invented rune alphabet — line segments on an 8x8 grid.
  var RUNES = [
    [[4, 0, 4, 8], [4, 2, 7, 0], [4, 4, 1, 2]],
    [[1, 0, 1, 8], [1, 4, 7, 4], [7, 0, 7, 8]],
    [[4, 0, 4, 8], [1, 2, 7, 2], [2, 6, 6, 6]],
    [[1, 8, 4, 0], [4, 0, 7, 8], [2, 5, 6, 5]],
    [[1, 0, 7, 0], [4, 0, 4, 8], [1, 8, 7, 8]],
    [[4, 0, 4, 8], [4, 3, 7, 6], [4, 3, 1, 6]],
    [[2, 0, 2, 8], [2, 0, 6, 2], [2, 4, 6, 6]],
    [[1, 2, 7, 2], [4, 2, 4, 8], [2, 8, 6, 8]]
  ];
  var r = rng(0x51ce), row = '', count = 7;
  for (var i = 0; i < count; i++) {
    var glyph = RUNES[(r() * RUNES.length) | 0], d = '';
    for (var s = 0; s < glyph.length; s++) {
      var g = glyph[s];
      d += 'M' + (g[0] + i * 10) + ' ' + g[1] + 'L' + (g[2] + i * 10) + ' ' + g[3];
    }
    row += '<path d="' + d + '"/>';
  }
  $('.runerow').innerHTML =
    '<svg viewBox="-1 -1 ' + (count * 10) + ' 10" width="100%" height="100%" ' +
    'fill="none" stroke="' + C.ink + '" stroke-width="1.1" stroke-linecap="square">' + row + '</svg>';
})();

/* --- Typewriter ------------------------------------------------------- */
function typeText(node, text) {
  if (reduced) { node.textContent = text; return Promise.resolve(); }
  node.textContent = '';
  var i = 0;
  return new Promise(function (resolve) {
    (function next() {
      if (i >= text.length) { resolve(); return; }
      var ch = text[i++];
      node.textContent += ch;
      setTimeout(next, ch === ' ' ? 34 : 24 + Math.random() * 18);
    })();
  });
}

function setStep(i, state) {
  if (el.steps[i]) el.steps[i].setAttribute('data-state', state);
}

function showField(type, labelText, autocomplete) {
  el.entry.type = type;
  el.entry.name = type === 'password' ? 'password' : 'username';
  el.entry.autocomplete = autocomplete;
  el.label.textContent = labelText;
  el.entry.value = '';
  el.form.setAttribute('data-show', 'true');
  try { el.entry.focus({ preventScroll: true }); } catch (e) { el.entry.focus(); }
}

function hideField() {
  el.form.setAttribute('data-show', 'false');
  el.entry.blur();
}

/*
 * One permanent submit handler, always preventing the default. Attaching it
 * per-step would let an Enter pressed a moment too early fall through to a
 * native submit, which reloads the page and drops the whole flow.
 */
var pendingSubmit = null;

el.form.addEventListener('submit', function (e) {
  e.preventDefault();
  if (!pendingSubmit) return;
  var value = el.entry.value;
  if (!value.trim()) {
    el.form.setAttribute('data-nudge', 'true');
    setTimeout(function () { el.form.removeAttribute('data-nudge'); }, 360);
    el.entry.focus();
    return;
  }
  var resolve = pendingSubmit;
  pendingSubmit = null;
  resolve(value);
});

/** Resolves with the submitted value; nudges on an empty submit. */
function awaitSubmit() {
  return new Promise(function (resolve) { pendingSubmit = resolve; });
}

/* --- The 10-second rite ---------------------------------------------- */
function addRite(rite) {
  var li = document.createElement('li');
  li.setAttribute('data-done', 'false');
  li.innerHTML = '<i class="tick"></i><span class="word"></span><span class="dots"></span>';
  li.querySelector('.word').textContent = rite.word;
  el.ritual.appendChild(li);
  fitPages();

  var dots = li.querySelector('.dots');
  if (reduced) {
    dots.textContent = new Array(rite.dots + 1).join('.');
  } else {
    var n = 0, step = Math.max(180, (rite.hold * 0.62) / rite.dots);
    var timer = setInterval(function () {
      if (n >= rite.dots) { clearInterval(timer); return; }
      n++;
      dots.textContent = new Array(n + 1).join('.');
    }, step);
    li.__timer = timer;
  }
  return li;
}

async function performRite() {
  el.ritual.innerHTML = '';
  var prev = null;
  for (var i = 0; i < CONFIG.rites.length; i++) {
    if (prev) prev.setAttribute('data-done', 'true');
    var rite = CONFIG.rites[i];
    prev = addRite(rite);
    say(rite.word);
    await sleep(rite.hold);
  }
  if (prev) prev.setAttribute('data-done', 'true');
}

/* --- Book open / close ------------------------------------------------ */
var shutness = 1;         // 1 = closed, 0 = open
var spinFrozen = 0;
var spinIdle = 0;
var bobOffset = 0;
var bobPhase = 0;

async function openBook() {
  state = 'opening';
  spinFrozen = spinIdle;
  el.body.setAttribute('data-open', 'true');
  say('The book opens.');

  var bookPos = new THREE.Vector3();
  bookOuter.getWorldPosition(bookPos);
  if (!reduced) burstSpark(bookPos, 26, C.gemCore);

  await Promise.all([
    tween(950, easeInOut, function (t) { shutness = 1 - t; }),
    tween(1100, easeInOut, function (t) { camK = 1 - t; })
  ]);
  shutness = 0; camK = 0;
  spread.setAttribute('data-open', 'true');
}

async function closeBook() {
  hideField();
  spread.setAttribute('data-open', 'false');
  await sleep(reduced ? 0 : 260);
  await Promise.all([
    tween(850, easeInOut, function (t) { shutness = t; }),
    tween(950, easeInOut, function (t) { camK = t; })
  ]);
  shutness = 1; camK = 1;
  spinIdle = spinFrozen;
  el.body.setAttribute('data-open', 'false');
}

function resetPage() {
  pendingSubmit = null;
  el.promptText.textContent = '';
  el.caret.setAttribute('data-on', 'false');
  el.ritual.innerHTML = '';
  el.verdict.setAttribute('data-show', 'false');
  el.verdict.textContent = '';
  el.entry.value = '';
  hideField();
  for (var i = 0; i < el.steps.length; i++) setStep(i, 'idle');
}

/* --- Redirect --------------------------------------------------------- */
function enterArchive() {
  var tab = window.open(CONFIG.redirectUrl, '_blank');
  if (tab) {
    try { tab.opener = null; } catch (e) { /* cross-origin */ }
    return true;
  }
  /* Blocked, as it will be this long after the click. Surface a button so the
     redirect is one gesture away rather than silently failing. */
  el.archive.hidden = false;
  el.hint.textContent = 'the archive awaits';
  return false;
}

/* --- The flow --------------------------------------------------------- */
var state = 'idle';
var runToken = 0;

async function runFlow() {
  var token = ++runToken;
  var alive = function () { return token === runToken; };

  resetPage();
  await openBook();
  if (!alive()) return;

  // State 3 — username
  state = 'user';
  setStep(0, 'active');
  el.caret.setAttribute('data-on', 'true');
  await typeText(el.promptText, 'Enter your username');
  if (!alive()) return;
  say('Enter your username');
  el.caret.setAttribute('data-on', 'false');
  showField('text', 'Username', 'username');
  var username = await awaitSubmit();
  if (!alive()) return;

  // State 4 — password
  state = 'pass';
  setStep(0, 'done'); setStep(1, 'active');
  hideField();
  el.caret.setAttribute('data-on', 'true');
  await typeText(el.promptText, 'Enter your password');
  if (!alive()) return;
  say('Enter your password');
  el.caret.setAttribute('data-on', 'false');
  showField('password', 'Password', 'current-password');
  var password = await awaitSubmit();
  if (!alive()) return;

  // State 5 — the rite (always 10s)
  state = 'check';
  setStep(1, 'done'); setStep(2, 'active');
  hideField();
  el.promptText.textContent = '';
  var verdictPromise = authenticate(username, password).catch(function () { return false; });
  await performRite();
  if (!alive()) return;
  var ok = await verdictPromise;
  setStep(2, 'done');

  // State 6 — verdict
  state = 'verdict';
  el.verdict.textContent = ok ? 'Success' : 'Invalid credentials';
  el.verdict.setAttribute('data-kind', ok ? 'ok' : 'bad');
  el.verdict.setAttribute('data-show', 'true');
  fitPages();
  say(ok ? 'Success' : 'Invalid credentials');
  await sleep(CONFIG.verdictHold);
  if (!alive()) return;

  await closeBook();
  if (!alive()) return;

  if (ok) {
    state = 'done';
    var pos = new THREE.Vector3();
    bookOuter.getWorldPosition(pos);
    if (!reduced) burstXP(pos, 120);
    el.hint.textContent = 'the archive opens';
    await sleep(reduced ? 600 : CONFIG.burstFade);
    if (!alive()) return;
    enterArchive();
  } else {
    state = 'idle';
    resetPage();
    el.hint.textContent = 'tap the book to try again';
  }
}

/* -------------------------------------------------------------------
   10. Input
   ------------------------------------------------------------------- */

var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();

function pointerOverBook(clientX, clientY) {
  pointer.x = (clientX / view.w) * 2 - 1;
  pointer.y = -(clientY / view.h) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(bookOuter, true).length > 0;
}

function tryOpen() {
  if (state !== 'idle') return;
  el.archive.hidden = true;
  runFlow();
}

canvas.addEventListener('pointerdown', function (e) {
  if (state !== 'idle') return;
  if (pointerOverBook(e.clientX, e.clientY)) tryOpen();
});

canvas.addEventListener('pointermove', function (e) {
  if (e.pointerType === 'mouse') {
    parallax.tx = ((e.clientX / view.w) * 2 - 1) * 0.055;
    parallax.ty = -((e.clientY / view.h) * 2 - 1) * 0.045;
  }
  canvas.style.cursor = (state === 'idle' && pointerOverBook(e.clientX, e.clientY)) ? 'pointer' : '';
});

window.addEventListener('pointerleave', function () { parallax.tx = 0; parallax.ty = 0; });

el.hint.addEventListener('click', tryOpen);
el.archive.addEventListener('click', function () {
  window.open(CONFIG.redirectUrl, '_blank', 'noopener');
});

window.addEventListener('resize', resize);
if (reduceQuery.addEventListener) {
  reduceQuery.addEventListener('change', function (e) {
    reduced = e.matches;
    if (stars) stars.material.uniforms.uTwinkle.value = reduced ? 0 : 1;
    if (reduced && P) {
      P.life.fill(0);
      P.alp.fill(0);
      P.geo.attributes.aAlpha.needsUpdate = true;
    }
  });
}

/* -------------------------------------------------------------------
   11. Boot + render loop
   ------------------------------------------------------------------- */

function boot() {
  var lowPower = window.innerWidth < 620 || (navigator.hardwareConcurrency || 4) <= 4;
  P = buildParticles(lowPower ? 220 : 420);
  buildStars(lowPower ? 420 : 780);
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPages);
  applyBook(1);
  applyCamera();
  requestAnimationFrame(frame);
}

var last = performance.now();
var clockT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clockT += dt;

  stepTweens(dt);

  if (!reduced) {
    if (state === 'idle') {
      spinIdle += dt * 0.28;
      spinFrozen = spinIdle;
      bobPhase += dt * 1.35;
    }
    bobOffset = Math.sin(bobPhase) * 0.042;
    parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 4);
    parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 4);
    emitAmbient(dt);
    updateParticles(dt);
    if (stars) stars.material.uniforms.uTime.value = clockT;
  }

  applyBook(shutness);
  applyCamera();

  /* Pull focus: the library falls into shadow as the book takes the frame.
     Measured from the camera's own distance so the book never fogs itself,
     whatever framing the viewport ended up with. */
  var fk = easeInOut(camK);
  var d = framing.open.dist;
  scene.fog.near = lerp(d * 1.18, FOG.idle[0], fk);
  scene.fog.far = lerp(d * 2.35, FOG.idle[1], fk);

  camera.updateMatrixWorld();
  scene.updateMatrixWorld();
  updateCSS3D();

  renderer.render(scene, camera);
}

/* Small debug handle — handy for tuning the scene from the console. */
window.enchantedArchive = {
  scene: scene,
  camera: camera,
  book: bookOuter,
  get state() { return state; },
  bookScreenPos: function () {
    var v = new THREE.Vector3();
    bookOuter.getWorldPosition(v).project(camera);
    return { x: (v.x * 0.5 + 0.5) * view.w, y: (-v.y * 0.5 + 0.5) * view.h };
  }
};

boot();

})();
