import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// These config tests do not use external storage. Fail if a stub is invoked.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === '@aws-sdk/client-s3') {
            const exports = ['S3Client', 'PutObjectCommand', 'GetObjectCommand', 'CopyObjectCommand',
                'DeleteObjectCommand', 'CreateMultipartUploadCommand', 'UploadPartCommand',
                'AbortMultipartUploadCommand', 'CompleteMultipartUploadCommand'];
            const source = exports.map(name => `export class ${name} { constructor() { throw new Error("External storage must not run in config tests"); } }`).join('\n');
            return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});
const { onRequest } = await import('../functions/api/userConfig.js');
const { getPageConfig } = await import('../functions/api/manage/sysConfig/page.js');

function environment(userConfig, pageConfig) {
    const records = new Map();
    if (pageConfig) records.set('manage@sysConfig@page', JSON.stringify(pageConfig));
    return {
        USER_CONFIG: userConfig,
        img_url: {
            async get(key) { return records.get(key) ?? null; },
            async put(key, value) { records.set(key, value); },
        },
    };
}
async function read(env) {
    const response = await onRequest({ env });
    assert.equal(response.status, 200);
    return response.json();
}
const expected = {
    siteTitle: '过来人图床-免费的图片外链',
    ownerName: '过来人图床',
    logoUrl: '/img/guolairen-music.png',
    siteIcon: '/img/guolairen-music.png',
    logoLink: 'https://yinyue.520xg.dpdns.org/',
};
const defaults = await read(environment());
for (const [key, value] of Object.entries(expected)) assert.equal(defaults[key], value);
assert.equal(defaults.disableFooter, false);
assert.equal(defaults.showDirectorySuggestions, true);
assert.equal(defaults.fileExpiry.enabled, false);

const user = { ownerName: '自定义名称', logoLink: 'https://example.com/music', siteIcon: '/img/custom.png' };
const configured = await read(environment(JSON.stringify(user)));
for (const [key, value] of Object.entries(user)) assert.equal(configured[key], value);
const kv = await read(environment(JSON.stringify(user), {
    config: [
        { id: 'ownerName', value: '数据库名称' },
        { id: 'logoLink', value: 'https://example.com/kv' },
        { id: 'disableFooter', value: false },
        { id: 'siteTitle', value: '' },
    ],
}));
assert.equal(kv.ownerName, '数据库名称');
assert.equal(kv.logoLink, 'https://example.com/kv');
assert.equal(kv.siteIcon, user.siteIcon);
assert.equal(kv.disableFooter, false);
assert.equal(kv.siteTitle, expected.siteTitle);
assert.equal((await read(environment('{invalid'))).ownerName, expected.ownerName);
const page = await getPageConfig(environment().img_url, {});
for (const [key, value] of Object.entries(expected)) {
    assert.equal(page.config.find(item => item.id === key).default, value);
}
console.log('PASS: defaults, USER_CONFIG, KV precedence, empty values, malformed config, official feature defaults');
