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
try {
    for (const width of [320, 390, 1440]) for (const colorScheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'no-preference' });
        await context.route('**/*', intercepted => new URL(intercepted.request().url()).origin === base
            ? intercepted.continue() : intercepted.abort());
        const page = await context.newPage();
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !document.querySelector('#entry-loader'));
        const images = page.locator('.site-shortcuts img');
        const read = () => images.evaluateAll(elements => elements.map(element => {
            const style = getComputedStyle(element);
            return { name: style.animationName, duration: style.animationDuration,
                direction: style.animationDirection, state: style.animationPlayState, transform: style.transform };
        }));
        const readRings = () => page.locator('.site-music-link, .image-compress-button').evaluateAll(elements =>
            elements.flatMap(element => ['::before', '::after'].map(pseudo => {
                const style = getComputedStyle(element, pseudo);
                return { name: style.animationName, transform: style.transform, padding: style.paddingTop,
                    gradient: style.backgroundImage, pointerEvents: style.pointerEvents, state: style.animationPlayState };
            })));
        const before = await read();
        const ringsBefore = await readRings();
        assert.equal(ringsBefore.length, 4);
        assert.ok(ringsBefore.every(ring => ring.name === 'shortcut-ring-spin' &&
            ring.gradient.includes('conic-gradient') && parseFloat(ring.padding) <= 1.25 &&
            ring.pointerEvents === 'none'), 'Thin gradient border missing');
        assert.equal(before.length, 2);
        assert.deepEqual(before.map(image => image.name), ['shortcut-spin', 'shortcut-spin']);
        assert.deepEqual(before.map(image => image.direction), ['normal', 'reverse']);
        assert.deepEqual(before.map(image => image.duration), ['20s', '24s']);
        await page.waitForTimeout(300);
        const after = await read();
        assert.ok(after.every((image, index) => image.transform !== before[index].transform), 'Icons not moving');
        assert.ok((await readRings()).every((ring, index) => ring.transform !== ringsBefore[index].transform),
            'Gradient borders not moving');
        await page.locator('.site-music-link').hover();
        assert.equal((await read())[0].state, 'paused');
        assert.ok((await readRings()).slice(0, 2).every(ring => ring.state === 'paused'), 'Border hover pause missing');
        const paused = (await read())[0].transform;
        await page.waitForTimeout(150);
        assert.equal((await read())[0].transform, paused, 'Hover did not pause rotation');
        await page.mouse.move(width - 1, 899);
        await page.locator('.image-compress-button').focus();
        assert.equal((await read())[1].state, 'paused', 'Keyboard focus did not pause rotation');
        await page.locator('.image-compress-button').blur();
        assert.deepEqual((await read()).map(image => image.state), ['running', 'running']);
        assert.equal(await page.locator('.page-footer a').count(), 0);
        assert.doesNotMatch(await page.locator('.page-footer').innerText(), /sanyueqi/i);
        await page.screenshot({ path: path.join(output, `motion-${width}-${colorScheme}.png`), fullPage: true });
        console.log(`PASS icon motion ${width} ${colorScheme}`);
        await context.close();
    }
} finally {
    await browser.close();
}
