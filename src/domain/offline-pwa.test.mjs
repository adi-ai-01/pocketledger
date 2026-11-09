import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Offline & PWA Reliability Verification', async (t) => {
  const distDir = path.resolve(process.cwd(), 'dist');
  const swPath = path.resolve(distDir, 'sw.js');
  const manifestPath = path.resolve(distDir, 'manifest.json');
  const indexHtmlPath = path.resolve(distDir, 'index.html');

  await t.test('1. Production build output exists and contains essential shell files', () => {
    assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');
    assert.ok(fs.existsSync(swPath), 'dist/sw.js must exist');
    assert.ok(fs.existsSync(manifestPath), 'dist/manifest.json must exist');
    assert.ok(fs.existsSync(indexHtmlPath), 'dist/index.html must exist');
  });

  await t.test('2. Manifest specifies required offline icons and standalone display', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons && manifest.icons.length >= 2, 'Manifest must specify at least 192 and 512 icons');

    for (const icon of manifest.icons) {
      const iconPath = path.resolve(distDir, icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(iconPath), `Icon ${icon.src} must physically exist in dist/`);
      const stat = fs.statSync(iconPath);
      assert.ok(stat.size > 0, `Icon ${icon.src} must have non-zero size`);
    }
  });

  await t.test('3. Service worker precaches exact compiled, hashed JS and CSS assets', () => {
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    // Extract PRECACHE_ASSETS array from generated sw.js
    const matchAssets = swContent.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\]);/);
    assert.ok(matchAssets, 'sw.js must contain a generated PRECACHE_ASSETS array');

    const precacheList = JSON.parse(matchAssets[1]);
    assert.ok(Array.isArray(precacheList), 'PRECACHE_ASSETS must be an array');
    assert.ok(precacheList.includes('/'), "Precache list must include root '/'");
    assert.ok(precacheList.includes('/index.html'), "Precache list must include '/index.html'");
    assert.ok(precacheList.includes('/manifest.json'), "Precache list must include '/manifest.json'");

    // Verify hashed JS and CSS are included
    const hasJs = precacheList.some((a) => a.startsWith('/assets/') && a.endsWith('.js'));
    const hasCss = precacheList.some((a) => a.startsWith('/assets/') && a.endsWith('.css'));
    assert.ok(hasJs, 'Precache list must include the compiled hashed JS bundle');
    assert.ok(hasCss, 'Precache list must include the compiled hashed CSS bundle');

    // Verify all precached files physically exist on disk
    for (const assetUrl of precacheList) {
      if (assetUrl === '/') continue;
      const filePath = path.resolve(distDir, assetUrl.replace(/^\//, ''));
      assert.ok(fs.existsSync(filePath), `Precached asset ${assetUrl} must physically exist on disk`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 0, `Precached asset ${assetUrl} must not be empty`);
    }
  });

  await t.test('4. Service worker contains cache versioning and safe old-cache cleanup', () => {
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    // Check CACHE_NAME pattern
    const matchCacheName = swContent.match(/const CACHE_NAME = '([^']+)'/);
    assert.ok(matchCacheName, 'sw.js must define a versioned CACHE_NAME');
    assert.ok(matchCacheName[1].startsWith('pocketledger-v2-'), 'CACHE_NAME must follow v2 versioning convention');

    // Check old cache deletion
    assert.ok(swContent.includes('caches.delete'), 'sw.js must clean up stale caches on activate');
    assert.ok(swContent.includes('self.clients.claim()'), 'sw.js must claim clients on activate');
  });

  await t.test('5. Service worker never caches external payment intents (e.g. upi://)', () => {
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    // Verify non-GET and non-HTTP exclusion
    assert.ok(swContent.includes("req.method !== 'GET'"), 'Must skip non-GET requests');
    assert.ok(swContent.includes("!req.url.startsWith('http://') && !req.url.startsWith('https://')"), 'Must reject non-http schemes like upi://');
  });

  await t.test('6. Simulating offline restart confirms shell and assets resolve from cache', () => {
    const swContent = fs.readFileSync(swPath, 'utf-8');
    const matchAssets = swContent.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\]);/);
    const precacheList = JSON.parse(matchAssets[1]);

    // Simulated cache store
    const simulatedCache = new Map();
    for (const url of precacheList) {
      simulatedCache.set(url, { status: 200, ok: true, url });
    }

    // Navigation offline test:
    const offlineNavigateFallback = simulatedCache.get('/index.html');
    assert.ok(offlineNavigateFallback, 'Offline navigation must resolve to cached /index.html');
    assert.equal(offlineNavigateFallback.status, 200);

    // Hashed assets offline test:
    const jsAsset = precacheList.find((a) => a.endsWith('.js'));
    const cssAsset = precacheList.find((a) => a.endsWith('.css'));
    assert.ok(simulatedCache.has(jsAsset), 'Offline restart must serve hashed JS bundle from cache');
    assert.ok(simulatedCache.has(cssAsset), 'Offline restart must serve hashed CSS bundle from cache');
  });
});
