/**
 * build.mjs — bundles src/ into a single self-contained index.html
 *
 * Everything (three.js, both fonts, CSS, app code) is inlined so the file
 * works from file:// with no network and no server.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(root, 'src', p), 'utf8');
const b64 = (p) => readFileSync(join(root, 'src', p)).toString('base64');

/* three.js ships as an ES module. Opening a file:// page blocks module
   imports, so we rewrite the trailing `export{a as Foo,...}` into a plain
   global and wrap the whole thing in an IIFE. */
function threeAsGlobal() {
  const code = src('vendor/three.module.min.js');
  const at = code.lastIndexOf('export{');
  if (at === -1) throw new Error('three.js: export statement not found');
  const close = code.indexOf('}', at);
  const body = code.slice(0, at);
  const pairs = code.slice(at + 'export{'.length, close)
    .split(',')
    .map((entry) => {
      const [local, exported] = entry.split(' as ').map((s) => s.trim());
      return `${JSON.stringify(exported ?? local)}:${local}`;
    })
    .join(',');
  return `var THREE=(function(){${body}\nreturn{${pairs}};})();`;
}

const html = src('page.html')
  .replace('/*{{FONT_PIXEL}}*/', b64('fonts/pixelify-latin.woff2'))
  .replace('/*{{FONT_HAND}}*/', b64('fonts/specialelite-latin.woff2'))
  .replace('/*{{CSS}}*/', () => src('styles.css'))
  .replace('/*{{THREE}}*/', () => threeAsGlobal())
  .replace('/*{{APP}}*/', () => src('app.js'));

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html written — ${(html.length / 1024).toFixed(0)} KB`);
