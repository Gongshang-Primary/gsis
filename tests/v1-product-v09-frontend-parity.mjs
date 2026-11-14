import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as builder from '../scripts/v1/build-web.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = JSON.parse(await readFile(path.join(root, 'v1/web/modules.json'), 'utf8'));
const { gsisBuildLabel } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = await mkdtemp(path.join(tmpdir(), 'gsis-v09-frontend-'));
const chrome = {
  roster: 'header > span',
  contacts: '.suite-release',
  calendar: '.release-label',
  venues: '.app-footer span',
  layout: '.suite-release',
  deploy: '.release-version',
  lord: 'title',
  starlord: 'title',
  overlord: 'title',
};

function readChrome(html, id) {
  const dom = new JSDOM(html);
  try {
    return [...dom.window.document.querySelectorAll(chrome[id])]
      .map(node => node.textContent.trim()).filter(Boolean);
  } finally { dom.window.close(); }
}

function assetQueries(html) {
  const dom = new JSDOM(html);
  try {
    return [...dom.window.document.querySelectorAll('script[src], link[href]')]
      .map(node => node.getAttribute('src') || node.getAttribute('href'))
      .filter(url => url.includes('?'))
      .map(url => url.slice(url.indexOf('?')));
  } finally { dom.window.close(); }
}

try {
  const sources = new Map(await Promise.all(modules.map(async module => [
    module.id, await readFile(path.join(root, module.source, 'index.html'), 'utf8'),
  ])));
  await builder.buildWeb(output);
  assert.equal(modules.length, 9);
  for (const module of modules) {
    const sourcePath = path.join(root, module.source, 'index.html');
    const source = sources.get(module.id);
    const built = await readFile(path.join(output, module.id, 'index.html'), 'utf8');
    const labels = readChrome(built, module.id);
    assert(labels.some(text => /\bv1\b/.test(text)), `${module.id}: built application chrome identifies v1; received ${JSON.stringify(labels)}`);
    assert(labels.every(text => !text.includes('v' + gsisBuildLabel)), `${module.id}: source release must not identify the v1 application`);
    assert.deepEqual(assetQueries(built), assetQueries(source), `${module.id}: preserve all asset query versions, including suffixes`);
    assert.equal(await readFile(sourcePath, 'utf8'), source, `${module.id}: building does not rewrite legacy source`);

    // Exercise a future label against the same nine source documents in memory;
    // neither package metadata nor a production source file is changed.
    const futureLabel = '0.9.9zz';
    const futureSource = source.replaceAll(gsisBuildLabel, futureLabel);
    const futureBuilt = builder.normaliseReleaseChrome(futureSource, futureLabel);
    assert(readChrome(futureBuilt, module.id).some(text => /\bv1\b/.test(text)), `${module.id}: future source label is not hardcoded`);
    assert.deepEqual(assetQueries(futureBuilt), assetQueries(futureSource), `${module.id}: future asset cache stamps remain intact`);
  }

  const label = '0.9.9zz';
  const fixture = `<!doctype html><html><head><title>GSiS &amp; test v${label}</title>
<link href="/app.css?v=${label}-suffix" rel="stylesheet"></head><body>
<header data-release="v${label}"><span>v${label}</span><span>Former v0.9.9x</span>
<script>const version='v${label}'; const historical='v0.8.6';</script></header>
<small class="suite-release">Contacts v${label}</small><span class="release-label">v${label}</span>
<footer class="app-footer">GSiS v${label}</footer>
<aside><div class="sidebar-footer">Snapshot v${label} · 2 Oct 2026</div></aside>
<section><h2>About v${label}</h2><p>Historical v${label}, v0.9.9x and v0.8.6.</p></section>
<script src="/app.js?v=${label}">/* v${label} */</script><!-- v${label} -->
</body></html>`;
  const expected = fixture
    .replace(`<title>GSiS &amp; test v${label}</title>`, '<title>GSiS &amp; test v1</title>')
    .replace(`<span>v${label}</span>`, '<span>v1</span>')
    .replace(`>Contacts v${label}</small>`, '>Contacts v1</small>')
    .replace(`class="release-label">v${label}</span>`, 'class="release-label">v1</span>')
    .replace(`class="app-footer">GSiS v${label}</footer>`, 'class="app-footer">GSiS v1</footer>');
  assert.equal(builder.normaliseReleaseChrome(fixture, label), expected,
    'patch only current chrome text bytes; retain attributes, entities, scripts, comments and historical versions exactly');

  const landmarkSource = await readFile(path.join(root, 'layout-update/public/landmark.html'), 'utf8');
  const landmarkBuilt = await readFile(path.join(output, 'layout/landmark.html'), 'utf8');
  const before = new JSDOM(landmarkSource), after = new JSDOM(landmarkBuilt);
  try {
    assert(after.window.document.title.includes('v1'));
    assert(after.window.document.querySelector('header').textContent.includes('Landmark v1'));
    for (const selector of ['.sidebar-footer', '#infoPanel']) {
      assert.equal(after.window.document.querySelector(selector).textContent,
        before.window.document.querySelector(selector).textContent, `${selector}: retain historical Landmark notes`);
    }
  } finally { before.window.close(); after.window.close(); }
  console.log('PASS all nine built v1 release labels, future-letter source labels, unchanged asset query versions/scripts/history and legacy sources');
} finally { await rm(output, { recursive: true, force: true }); }
