import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Codex/tools/pw/node_modules/playwright-core');
const map = JSON.parse(fs.readFileSync(path.join(root, 'frontend-dist/js/chunk-vendors.afbfd4cf.js.map'), 'utf8'));
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
});
try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
    for (const [name, icon, color] of [['music', 'faMusic', '#087f78'], ['compress', 'faImage', '#c23b61']]) {
        const index = map.sources.findIndex(source => source.endsWith(`/free-solid-svg-icons/${icon}.js`));
        if (index < 0) throw new Error(`Missing packaged icon: ${icon}`);
        const exports = {};
        vm.runInNewContext(map.sourcesContent[index], { exports, Object });
        const [width, height, , , glyph] = exports.definition.icon;
        await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="${color}"/><svg x="32" y="32" width="64" height="64" viewBox="0 0 ${width} ${height}"><path fill="white" d="${glyph}"/></svg></svg></body></html>`);
        const target = path.join(root, `frontend-dist/img/guolairen-${name}.png`);
        for (let current = target; ; current = path.dirname(current)) {
            if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Linked path: ${current}`);
            if (path.dirname(current) === current) break;
        }
        await page.screenshot({ path: target, omitBackground: true });
        console.log(`Generated ${target}`);
    }
} finally {
    await browser.close();
}
