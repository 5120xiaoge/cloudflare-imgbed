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
const failures = [];
try {
    for (const width of [320, 390, 768, 1440]) for (const route of ['/', '/login', '/adminLogin', '/dashboard', '/customerConfig', '/systemConfig']) {
        const id = `${route === '/' ? 'upload' : route.slice(1)}-${width}`;
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.route('**/*', intercepted => new URL(intercepted.request().url()).origin === base
            ? intercepted.continue() : intercepted.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.goto(base + route, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#app:not([inert]) .site-home-link');
            await page.waitForFunction(() => !document.querySelector('#entry-loader'));
            const warning = page.getByRole('button', { name: '我知道了', exact: true });
            if (await warning.isVisible()) {
                await warning.click();
                await page.getByRole('dialog', { name: '安全提示', exact: true }).waitFor({ state: 'hidden' });
            }
            const home = page.getByRole('link', { name: '回到首页', exact: true });
            await home.waitFor({ state: 'visible' });
            assert.equal(await home.count(), 1);
            assert.equal(await home.getAttribute('href'), '/');
            assert.equal(await home.getAttribute('target'), null);
            assert.equal(await home.locator('svg[data-icon="house"]').count(), 1, 'Home icon missing');
            const geometry = await home.evaluate(element => {
                const a = element.getBoundingClientRect();
                const overlap = b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                const adjacent = element.classList.contains('site-home-link--admin')
                    ? element.previousElementSibling
                    : element.closest('.login')
                        ? document.querySelector('.login .language-switcher')
                        : [...document.querySelectorAll('.more-button, .mobile-more-button')]
                            .find(control => control.getBoundingClientRect().width > 0);
                if (!adjacent) throw new Error('Adjacent control missing');
                const measure = control => {
                    const r = control.getBoundingClientRect();
                    const svg = control.querySelector('svg').getBoundingClientRect();
                    return { width: r.width, height: r.height, y: r.y,
                        radius: getComputedStyle(control).borderRadius, iconWidth: svg.width, iconHeight: svg.height };
                };
                return {
                    width: a.width, height: a.height, x: a.x, y: a.y, right: a.right,
                    home: measure(element), adjacent: measure(adjacent),
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    collisions: [...document.querySelectorAll('button, a, input, .toggle-dark, .language-switcher')]
                        .filter(other => other !== element && !element.contains(other) &&
                            other.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
                            overlap(other.getBoundingClientRect()))
                        .map(other => other.className),
                };
            });
            assert.ok(geometry.x >= 0 && geometry.right <= width);
            assert.ok(geometry.y < 160, 'Home link not in header');
            for (const property of ['width', 'height', 'y', 'iconWidth', 'iconHeight']) {
                assert.ok(Math.abs(geometry.home[property] - geometry.adjacent[property]) < .1,
                    `Home ${property} does not match adjacent control`);
            }
            assert.equal(geometry.home.radius, geometry.adjacent.radius, 'Home radius differs from adjacent control');
            assert.deepEqual(geometry.collisions, [], 'Home control overlaps another control');
            assert.equal(geometry.overflow, false, 'Horizontal overflow');
            await home.focus();
            assert.ok(await home.evaluate(element => element === document.activeElement));
            await home.blur();
            await page.screenshot({ path: path.join(output, `home-${id}.png`), clip: { x: 0, y: 0, width, height: 180 } });
            await Promise.all([
                page.waitForURL(base + '/'),
                home.click(),
            ]);
            await page.waitForSelector('#app:not([inert]) .site-shortcuts');
            assert.equal(new URL(page.url()).pathname, '/');
            assert.deepEqual(errors, [], 'Page errors');
            console.log(`PASS home navigation ${id}`);
        } catch (error) {
            failures.push({ id, error: error.message });
            console.log(`FAIL home navigation ${id}: ${error.message}`);
        } finally {
            await context.close();
        }
    }
} finally {
    await browser.close();
}
fs.writeFileSync(path.join(output, 'home-results.json'), JSON.stringify({ failures }, null, 2));
assert.equal(failures.length, 0, `${failures.length} home navigation cases failed`);
