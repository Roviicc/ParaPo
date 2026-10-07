// A signboard's SVG made drawing only (src/features/routes/model/signboard-svg.ts),
// the cleaning the studio does before an upload and the publish does again
// before a board lands on the map's own domain.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/signboard-svg-test.mjs
//
// Why this exists: an SVG can run script when opened on its own, and the
// boards are served beside the map. Each case is a way one could, and must
// come out without it; and a board as Figma exports it must come out whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNBOARD_MAX_BYTES,
  cleanSignboardSvg,
  keepsAttribute,
} from '../../src/features/routes/model/signboard-svg.ts';

const clean = (s) => {
  const r = cleanSignboardSvg(s);
  assert.ok('svg' in r, `refused: ${r.error}`);
  return r.svg;
};

test('a board as Figma exports it comes out whole', () => {
  const figma = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="98" height="40" viewBox="0 0 98 40" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="98" height="40" fill="#111111"/>
<path d="M8 8H20V20H8Z" fill="url(#paint0_linear_1_2)"/>
<text x="10" y="30" font-family="Cubao" font-size="12" fill="#7CFC00">BAYAN &amp; SIMBAHAN</text>
<defs>
<linearGradient id="paint0_linear_1_2" x1="0" y1="0" x2="1" y2="1" gradientUnits="userSpaceOnUse">
<stop stop-color="#7CFC00"/>
<stop offset="1" stop-color="#FFD000"/>
</linearGradient>
</defs>
</svg>`;
  const out = clean(figma);
  assert.match(out, /^<svg width="98" height="40" viewBox="0 0 98 40"/);
  assert.match(out, /fill="url\(#paint0_linear_1_2\)"/);
  assert.match(out, />BAYAN &amp; SIMBAHAN</);
  assert.match(out, /<stop offset="1" stop-color="#FFD000"\/>/);
  assert.doesNotMatch(out, /<\?xml/);
});

test('scripts, handlers and foreign HTML go, with all they hold', () => {
  const out = clean(`<svg viewBox="0 0 10 10" onload="alert(1)">
    <script>alert(2)</script><script><![CDATA[alert(3)]]></script>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(4)"/></div></foreignObject>
    <rect width="10" height="10" onclick="alert(5)" OnMouseOver="alert(6)"/>
    <set attributeName="onmouseover" to="alert(7)"/><animate attributeName="href" values="javascript:alert(8)"/>
  </svg>`);
  assert.doesNotMatch(out, /alert|script|foreignObject|onload|onclick|onmouseover|<set|<animate/i);
  assert.match(out, /<rect width="10" height="10"\/>/);
});

test('links go anywhere but its own parts, and pictures only as data', () => {
  const out = clean(`<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink">
    <a href="https://example.com"><rect width="1" height="1"/></a>
    <use href="#mark"/><use xlink:href="https://evil.example/x.svg#a"/><use href=" javascript:alert(1)"/>
    <image href="https://evil.example/track.png"/><image xlink:href="data:image/png;base64,iVBORw0KGgo="/>
    <image href="data:image/svg+xml;base64,PHN2Zz4="/>
    <rect fill="url(https://evil.example/x)" stroke="url(#ok)" style="fill: url( 'http://evil' )"/>
    <rect style="background:url(#g); color: red"/>
  </svg>`);
  assert.doesNotMatch(out, /example|javascript|svg\+xml|http:\/\/evil/);
  assert.match(out, /<use href="#mark"\/>/);
  assert.match(out, /<image xlink:href="data:image\/png;base64,iVBORw0KGgo="\/>/);
  assert.match(out, /<rect stroke="url\(#ok\)"\/>/);
  assert.match(out, /<rect style="background:url\(#g\); color: red"\/>/);
  // `<a>` goes with what it held.
  assert.doesNotMatch(out, /<rect width="1"/);
});

test('a look that fetches or runs is dropped, a plain one kept', () => {
  assert.equal(keepsAttribute('rect', 'fill', '#fff'), true);
  assert.equal(keepsAttribute('rect', 'style', 'fill:#fff;stroke-width:2'), true);
  assert.equal(keepsAttribute('rect', 'style', '@import "x.css"'), false);
  assert.equal(keepsAttribute('rect', 'style', 'width: expression(alert(1))'), false);
  assert.equal(keepsAttribute('rect', 'fill', 'url("#g")'), true);
  assert.equal(keepsAttribute('rect', 'filter', 'url(x.svg#f)'), false);
  assert.equal(keepsAttribute('rect', 'onbegin', 'x'), false);
  assert.equal(keepsAttribute('use', 'href', 'java\nscript:alert(1)'), false);
});

test('quotes in a value cannot open a new attribute', () => {
  const out = clean(`<svg viewBox="0 0 1 1"><text font-family='Say "hi" onload=x'>A</text></svg>`);
  assert.match(out, /font-family="Say &quot;hi&quot; onload=x"/);
});

test('what is not one readable <svg> is refused, in words', () => {
  for (const [why, s] of [
    ['empty', ''],
    ['HTML', '<html><body><svg/></body></html>'],
    ['two roots', '<svg></svg><svg></svg>'],
    ['text outside', 'hello <svg></svg>'],
    ['unclosed', '<svg><g></svg>'],
    ['broken tag', '<svg><rect width="1></svg>'],
    ['entities', '<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'],
    ['too big', `<svg>${' '.repeat(SIGNBOARD_MAX_BYTES)}</svg>`],
  ]) {
    const r = cleanSignboardSvg(s);
    assert.ok('error' in r && r.error.length > 0, `${why} was taken`);
  }
});

test('cleaning a clean board changes nothing', () => {
  const once = clean(
    '<svg viewBox="0 0 4 4"><g fill="#000"><path d="M0 0h4v4z"/></g><text>A &lt; B</text></svg>',
  );
  assert.equal(clean(once), once);
});

test('a look spelled with character references is read as the browser reads it (review of 2026-10-03)', () => {
  // `&#117;` is "u": tested raw, this was no url() at all, and kept.
  assert.equal(keepsAttribute('rect', 'fill', '&#117;rl(https://evil.example/x.svg#p)'), false);
  assert.equal(keepsAttribute('rect', 'fill', '&#x75;rl(https://evil.example/x.svg#p)'), false);
  assert.equal(keepsAttribute('use', 'href', '&#106;avascript:alert(1)'), false);
  assert.equal(keepsAttribute('use', 'href', '&#35;mark'), true);
  const out = clean(`<svg viewBox="0 0 1 1">
    <rect fill="&#117;rl(https://evil.example/x.svg#p)" style="fill:&#x75;rl(//evil.example/y)"/>
    <use href="&#x6A;avascript:alert(1)"/>
    <text font-family="&quot;Cubao&quot;">A</text>
  </svg>`);
  assert.doesNotMatch(out, /evil|javascript|&#/i);
  assert.match(out, /<rect\/>/);
  assert.match(out, /font-family="&quot;Cubao&quot;"/);
});

test('a bare & in a text or a value comes out escaped, so the file still reads as XML', () => {
  const out = clean(
    '<svg viewBox="0 0 1 1"><text font-family="A & B">TALA & FAIRVIEW &amp; &#38; &nbsp;</text></svg>',
  );
  assert.match(out, /font-family="A &amp; B"/);
  assert.match(out, />TALA &amp; FAIRVIEW &amp; &amp; &amp;nbsp;</);
  assert.doesNotMatch(out, /&(?!amp;|lt;|gt;|quot;)/);
  assert.equal(clean(out), out);
});

test('a look spelled with CSS escapes, or fetching through image-set(), is dropped', () => {
  assert.equal(keepsAttribute('rect', 'fill', '\\75 rl(https://evil.example/x)'), false);
  assert.equal(keepsAttribute('rect', 'style', 'fill:\\75rl(//evil.example/y)'), false);
  assert.equal(
    keepsAttribute('rect', 'style', "background-image:image-set('https://evil.example/x.png' 1x)"),
    false,
  );
  assert.equal(
    keepsAttribute('rect', 'style', "background-image:-webkit-image-set('x.png' 1x)"),
    false,
  );
  assert.equal(keepsAttribute('rect', 'style', 'fill:#7CFC00;font-family:Cubao'), true);
});
