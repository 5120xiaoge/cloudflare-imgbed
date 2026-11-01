import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Codex/tools/pw/node_modules/playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8900';
const output = process.env.TEST_OUTPUT || 'D:/Codex/图床/temp/official-guolairen-v1.4';
const directory = '/test/mobile/directory';
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
    for (const width of [320, 360, 390, 480, 768]) for (const colorScheme of ['light', 'dark']) {
        const id = `${width}-${colorScheme}`;
        const context = await browser.newContext({
            viewport: { width, height: 844 }, colorScheme, reducedMotion: 'reduce', isMobile: true, hasTouch: true,
        });
        await context.route('**/*', intercepted => new URL(intercepted.request().url()).origin === base
            ? intercepted.continue() : intercepted.abort());
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.goto(base, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => !document.querySelector('#entry-loader'));
            const input = page.locator('.upload-folder input');
            await input.waitFor({ state: 'visible' });
            const measure = () => page.evaluate(() => {
                const rect = selector => {
                    const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect();
                    return { x, y, width, height, right, bottom };
                };
                const controls = ['.upload-folder', '.directory-tree-trigger', '.mobile-more-button', '.site-home-link'];
                const field = document.querySelector('.upload-folder input');
                const style = getComputedStyle(field);
                const canvas = document.createElement('canvas');
                const painter = canvas.getContext('2d');
                painter.font = `${style.fontSize} ${style.fontFamily}`;
                return {
                    controls: controls.map(rect),
                    left: rect('.image-compress-button'),
                    inputWidth: field.getBoundingClientRect().width,
                    placeholderWidth: painter.measureText(field.placeholder).width,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                };
            });
            const check = dimensions => {
                const { controls, left } = dimensions;
                assert.equal(dimensions.overflow, false, 'Horizontal overflow');
                assert.ok(controls[0].x - left.right >= 6, 'Toolbar overlaps left shortcut');
                assert.ok(dimensions.inputWidth >= dimensions.placeholderWidth, 'Directory placeholder clipped');
                for (let index = 0; index < controls.length; index++) {
                    const control = controls[index];
                    assert.ok(Math.abs(control.y - controls[0].y) < .1, 'Toolbar controls not on one row');
                    assert.ok(Math.abs(control.height - 32) < .1, 'Control height changed');
                    if (index) {
                        assert.ok(Math.abs(control.width - 32) < .1, 'Icon control width changed');
                        assert.ok(control.x - controls[index - 1].right >= 7.9, 'Toolbar controls overlap');
                    }
                    assert.ok(control.x >= 0 && control.right <= width, 'Control outside viewport');
                }
            };
            const normal = await measure();
            check(normal);
            await page.screenshot({ path: path.join(output, `toolbar-${id}.png`),
                clip: { x: 0, y: 0, width, height: 140 } });
            await input.fill(directory);
            await page.waitForTimeout(450);
            const focused = await measure();
            check(focused);
            assert.equal(focused.controls[0].width, normal.controls[0].width, 'Focused input expands into toolbar');
            assert.equal(await input.inputValue(), directory);
            await page.screenshot({ path: path.join(output, `toolbar-${id}-focused.png`),
                clip: { x: 0, y: 0, width, height: 140 } });
            await page.locator('.directory-tree-trigger').click();
            const drawer = page.getByRole('dialog', { name: '选择目录', exact: true });
            await drawer.waitFor({ state: 'visible' });
            await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click();
            await drawer.waitFor({ state: 'hidden' });
            assert.equal(await input.inputValue(), directory, 'Opening tree resets directory');
            await page.locator('.mobile-more-button').click();
            const menu = page.getByRole('menu');
            await menu.waitFor({ state: 'visible' });
            await input.click();
            await menu.waitFor({ state: 'hidden' });
            assert.equal(await input.inputValue(), directory, 'Opening menu resets directory');
            await Promise.all([
                page.waitForURL(base + '/'),
                page.getByRole('link', { name: '回到首页', exact: true }).click(),
            ]);
            await page.waitForSelector('#app:not([inert]) .site-shortcuts');
            assert.deepEqual(errors, [], 'Browser errors');
            results.push({ id, normal, focused });
            console.log(`PASS mobile toolbar ${id}`);
        } catch (error) {
            failures.push({ id, error: error.message });
            console.log(`FAIL mobile toolbar ${id}: ${error.message}`);
            await page.screenshot({ path: path.join(output, `toolbar-${id}-failure.png`), fullPage: true });
        } finally {
            await context.close();
        }
    }
} finally {
    await browser.close();
}
fs.writeFileSync(path.join(output, 'toolbar-results.json'), JSON.stringify({ results, failures }, null, 2));
assert.equal(failures.length, 0, `${failures.length} mobile toolbar cases failed`);
console.log(`PASS ${results.length} mobile toolbar cases (normal and focused)`);
