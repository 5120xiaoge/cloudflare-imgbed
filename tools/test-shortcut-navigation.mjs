import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Codex/tools/pw/node_modules/playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8900';
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
});
try {
    for (const route of ['/', '/login', '/adminLogin']) {
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await context.newPage();
        await context.route('**/*', intercepted => {
            const url = new URL(intercepted.request().url());
            if (url.origin === base) return intercepted.continue();
            // Check real new-tab navigation without contacting the remote sites.
            if (['yasuo.520kx.dpdns.org', 'yinyue.520xg.dpdns.org'].includes(url.hostname)) {
                return intercepted.fulfill({ contentType: 'text/html', body: '<title>Local navigation fixture</title>' });
            }
            return intercepted.abort();
        });
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.waitForSelector('#app:not([inert]) .site-shortcuts');
        await page.waitForFunction(() => !document.querySelector('#entry-loader'));
        for (const [selector, url] of [
            ['.site-music-link', 'https://yinyue.520xg.dpdns.org/'],
            ['.image-compress-button', 'https://yasuo.520kx.dpdns.org/'],
        ]) {
            const [popup] = await Promise.all([
                context.waitForEvent('page'),
                page.locator(selector).click(),
            ]);
            await popup.waitForLoadState('domcontentloaded');
            assert.equal(popup.url(), url);
            assert.equal(await popup.evaluate(() => window.opener), null);
            await popup.close();
        }
        console.log(`PASS new-tab navigation ${route}`);
        await context.close();
    }
    for (const custom of [true, false]) {
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        await context.route(base + '/api/userConfig', intercepted => custom
            ? intercepted.fulfill({ json: {
                ownerName: '自定义图床',
                siteTitle: '自定义网站标题',
                logoLink: 'https://example.com/custom-music',
                logoUrl: '/img/logo.e8dbfa27.png',
                siteIcon: '/img/logo.e8dbfa27.png',
            } })
            : intercepted.fulfill({ status: 503, body: 'Local config outage fixture' }));
        const page = await context.newPage();
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForSelector('#app:not([inert]) .site-shortcuts');
        assert.equal(await page.locator('.site-music-link').getAttribute('href'),
            custom ? 'https://example.com/custom-music' : 'https://yinyue.520xg.dpdns.org/');
        assert.equal(await page.title(), custom ? '自定义网站标题' : '过来人图床-免费的图片外链');
        assert.match(await page.locator('.page-footer').innerText(), custom ? /自定义图床/ : /过来人图床/);
        assert.ok(await page.locator('.site-music-link img').evaluate(image => image.complete && image.naturalWidth > 0));
        assert.equal(await page.locator('.image-compress-button').getAttribute('href'), 'https://yasuo.520kx.dpdns.org/');
        console.log(`PASS ${custom ? 'custom config' : 'config outage fallback'}`);
        await context.close();
    }
} finally {
    await browser.close();
}
