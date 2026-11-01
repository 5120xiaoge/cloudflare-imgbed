import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Codex/tools/pw/node_modules/playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8900';
const output = process.env.TEST_OUTPUT || 'D:/Codex/图床/temp/official-guolairen-v1.3';
for (let current = output; ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked output path');
    if (path.dirname(current) === current) break;
}
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
});
const failures = [], results = [];
try {
    for (const viewport of [
        { width: 320, height: 640 }, { width: 390, height: 844 },
        { width: 768, height: 1024 }, { width: 1440, height: 900 },
        { width: 568, height: 320 },
    ]) for (const colorScheme of ['light', 'dark']) for (const route of ['/', '/login', '/adminLogin']) {
        const id = `${route === '/' ? 'upload' : route.slice(1)}-${viewport.width}x${viewport.height}-${colorScheme}`;
        const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', intercepted => {
            const url = new URL(intercepted.request().url());
            if (url.origin === base || url.protocol === 'data:' || url.protocol === 'blob:') return intercepted.continue();
            return intercepted.abort();
        });
        try {
            await page.goto(base + route, { waitUntil: 'networkidle' });
            await page.waitForSelector('#app:not([inert]) .site-shortcuts');
            await page.waitForFunction(() => !document.querySelector('#entry-loader'));
            const music = page.locator('.site-music-link');
            const compression = page.locator('.image-compress-button');
            assert.equal(await music.count(), 1);
            assert.equal(await compression.count(), 1);
            assert.equal(await music.getAttribute('href'), 'https://yinyue.520xg.dpdns.org/');
            assert.equal(await compression.getAttribute('href'), 'https://yasuo.520kx.dpdns.org/');
            assert.equal(await music.getAttribute('target'), '_blank');
            assert.equal(await compression.getAttribute('target'), '_blank');
            assert.match(await compression.getAttribute('rel'), /noopener/);
            assert.match(await page.title(), /过来人图床/);
            assert.match(await page.locator('.page-footer').innerText(), /过来人图床/);
            assert.doesNotMatch(await page.locator('.page-footer').innerText(), /sanyueqi/i);
            assert.equal(await page.locator('.page-footer a').count(), 0, 'Footer links remain');
            assert.equal(await page.locator('.page-footer svg').count(), 0, 'Footer portal icon remains');
            const animations = await page.locator('.site-shortcuts img').evaluateAll(images =>
                images.map(image => getComputedStyle(image).animationName));
            assert.deepEqual(animations, ['none', 'none'], 'Reduced motion ignored');
            const rings = await page.locator('.site-music-link, .image-compress-button').evaluateAll(elements =>
                elements.flatMap(element => ['::before', '::after'].map(pseudo =>
                    getComputedStyle(element, pseudo).animationName)));
            assert.deepEqual(rings, ['none', 'none', 'none', 'none'], 'Reduced motion border ignored');
            const dimensions = await page.evaluate(() => {
                const rect = element => {
                    const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
                    return { x, y, width, height, right, bottom };
                };
                const circle = element => ({ ...rect(element), radius: getComputedStyle(element).borderRadius });
                const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                const a = circle(document.querySelector('.site-music-link'));
                const b = circle(document.querySelector('.image-compress-button'));
                const controls = [...document.querySelectorAll('.toggle-dark, .language-switcher, .more-menu, .login-container, .header')];
                const intersections = controls.filter(element => {
                    const r = rect(element);
                    return r.width && r.height && (overlaps(a, r) || overlaps(b, r));
                }).map(element => element.className);
                return {
                    a, b, intersections,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    images: [...document.querySelectorAll('.site-shortcuts img')].map(image => image.complete && image.naturalWidth > 0),
                };
            });
            assert.ok(dimensions.a.width >= 44 && dimensions.b.width >= 44, 'Touch target too small');
            assert.equal(dimensions.a.width, dimensions.a.height);
            assert.equal(dimensions.b.radius, '50%');
            assert.ok(dimensions.a.right < dimensions.b.x, 'Shortcut overlap');
            assert.ok(dimensions.a.y >= 0 && dimensions.b.right <= viewport.width, 'Shortcut outside viewport');
            assert.equal(dimensions.overflow, false, 'Horizontal overflow');
            assert.ok(dimensions.images.every(Boolean), 'Missing icon');
            assert.deepEqual(dimensions.intersections, [], 'Shortcut overlaps page content');
            await music.focus();
            await page.keyboard.press('Tab');
            assert.ok(await compression.evaluate(element => element === document.activeElement), 'Keyboard focus order');
            if (route !== '/') {
                const fields = page.locator('.input-wrapper input');
                for (let i = 0; i < await fields.count(); i++) {
                    await fields.nth(i).fill(`local-test-${i}`);
                }
                for (let i = 0; i < await fields.count(); i++) {
                    assert.equal(await fields.nth(i).inputValue(), `local-test-${i}`, 'Login input reset');
                }
                const underlines = await page.locator('.input-name').evaluateAll(elements =>
                    elements.map(element => getComputedStyle(element).getPropertyValue('--underline-width')));
                assert.ok(underlines.length > 0, 'Missing input labels');
                assert.ok(underlines.every(value => /^\d+px$/.test(value.trim())), 'Broken input underline');
                for (let i = 0; i < await fields.count(); i++) await fields.nth(i).fill('');
            } else {
                assert.match(await page.locator('body').innerText(), /过来人图床/);
            }
            await compression.blur();
            await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true });
            assert.deepEqual(errors, [], 'Browser JS errors');
            results.push({ id, dimensions });
            console.log(`PASS ${id}`);
        } catch (error) {
            failures.push({ id, error: error.message, pageErrors: errors });
            console.log(`FAIL ${id}: ${error.message}`);
            await page.screenshot({ path: path.join(output, `${id}-failure.png`), fullPage: true });
        } finally {
            await context.close();
        }
    }
} finally {
    await browser.close();
}
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
assert.equal(failures.length, 0, `${failures.length} browser cases failed`);
console.log(`PASS ${results.length} responsive browser cases`);
