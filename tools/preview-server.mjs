import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Loopback-only preview. All data is in memory; external storage is disabled.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'frontend-dist');
const functions = path.join(root, 'functions');
const port = Number(process.env.PREVIEW_PORT || 8900);
const records = new Map();
const objects = new Map();
const modules = new Map();
const cache = new Map();
const kv = {
    async get(key) { return records.get(key)?.value ?? null; },
    async getWithMetadata(key) { return records.get(key) ?? null; },
    async put(key, value, options = {}) { records.set(key, { value, metadata: options.metadata }); },
    async delete(key) { records.delete(key); },
    async list({ prefix = '', cursor = '', limit = 1000 } = {}) {
        const rows = [...records.entries()].filter(([key]) => key.startsWith(prefix) && key > (cursor || ''))
            .sort(([a], [b]) => a < b ? -1 : 1);
        const page = rows.slice(0, limit);
        return {
            keys: page.map(([name, record]) => ({ name, metadata: record.metadata })),
            cursor: rows.length > limit ? page.at(-1)[0] : null, list_complete: rows.length <= limit,
        };
    },
};
const bucket = {
    async put(key, file) { objects.set(key, Buffer.from(await file.arrayBuffer())); },
    async get(key) {
        const buffer = objects.get(key);
        if (!buffer) return null;
        return { size: buffer.length, body: new Blob([buffer]).stream(), writeHttpMetadata() {} };
    },
    async delete(key) { objects.delete(key); },
};
const env = { img_url: kv, img_r2: bucket, disable_telemetry: 'true' };
await kv.put('manage@sysConfig@others', JSON.stringify({ telemetry: { enabled: false }, publicBrowse: { enabled: true } }));
await kv.put('manage@index@meta', JSON.stringify({ totalCount: 0, chunkCount: 0 }));
if (process.env.PREVIEW_FIXTURES === '1') {
    const files = [];
    for (let i = 0; i < 9; i++) {
        const asset = i % 2 ? 'background-light.f17603bc.jpg' : 'logo.e8dbfa27.png';
        const buffer = fs.readFileSync(path.join(assets, 'img', asset));
        const extension = i % 2 ? '.jpg' : '.png';
        const id = (i > 5 ? 'sample-folder/' : '') + (i === 0
            ? 'long-filename-for-responsive-layout-validation-'.repeat(3) : `sample-${i}`) + extension;
        const metadata = { FileName: id.split('/').at(-1), FileType: i % 2 ? 'image/jpeg' : 'image/png',
            TimeStamp: Date.now() - i * 60000, FileSize: (buffer.length / 1048576).toFixed(2),
            Channel: 'CloudflareR2', ChannelName: 'local-preview', ListType: 'None', Label: 'None' };
        objects.set(id, buffer);
        await kv.put(id, '', { metadata });
        files.push({ id, metadata });
    }
    await kv.put('manage@index_0', JSON.stringify(files));
    await kv.put('manage@index@meta', JSON.stringify({ totalCount: files.length, chunkCount: 1, lastUpdated: Date.now() }));
}

const sandbox = vm.createContext({
    Request, Response, Headers, URL, URLSearchParams, FormData, Blob, File, TextEncoder, TextDecoder,
    Uint8Array, ArrayBuffer, ReadableStream, TransformStream, AbortController, AbortSignal,
    crypto: globalThis.crypto, Buffer, setTimeout, clearTimeout, console,
    caches: { default: {
        async match(key) { return cache.get(String(key))?.clone(); },
        async put(key, value) { cache.set(String(key), value.clone()); },
        async delete(key) { return cache.delete(String(key)); },
    } },
    fetch: async () => { throw new Error('External requests are disabled in local preview'); },
});
function load(filename) {
    if (!modules.has(filename)) modules.set(filename,
        new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context: sandbox, identifier: filename }));
    return modules.get(filename);
}
function linker(specifier, parent) {
    if (specifier.startsWith('@')) {
        if (!modules.has(specifier)) {
            const names = specifier === '@aws-sdk/client-s3'
                ? ['S3Client', 'PutObjectCommand', 'CreateMultipartUploadCommand', 'UploadPartCommand',
                    'AbortMultipartUploadCommand', 'CompleteMultipartUploadCommand', 'GetObjectCommand',
                    'CopyObjectCommand', 'DeleteObjectCommand']
                : specifier === '@cloudflare/pages-plugin-sentry' ? ['default'] : [];
            modules.set(specifier, new vm.SyntheticModule(names, function () {
                for (const name of names) this.setExport(name, name === 'default'
                    ? (() => context => context.next())
                    : class { async send() { throw new Error('External storage disabled in preview'); } });
            }, { context: sandbox, identifier: specifier }));
        }
        return modules.get(specifier);
    }
    let filename = path.resolve(path.dirname(parent.identifier), specifier);
    if (!path.extname(filename)) filename += '.js';
    return load(filename);
}
// Link once to resolve cycles before accepting concurrent browser requests.
const entries = [];
function discover(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        if (item.isSymbolicLink()) throw new Error('Preview refuses symbolic links');
        if (item.isDirectory()) discover(path.join(directory, item.name));
        else if (item.name.endsWith('.js')) entries.push(path.join(directory, item.name));
    }
}
discover(functions);
const entry = new vm.SourceTextModule(entries.map((filename, index) =>
    `import * as m${index} from ${JSON.stringify('./' + path.relative(root, filename).replaceAll('\\', '/'))};`).join('\n'),
{ context: sandbox, identifier: path.join(root, 'preview-entry.js') });
await entry.link(linker);
await entry.evaluate();

async function handle(request) {
    const pathname = new URL(request.url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (!['api', 'upload', 'file', 'random', 'dav'].includes(parts[0])) {
        const file = path.resolve(assets, '.' + pathname);
        if (path.relative(assets, file).startsWith('..')) return new Response('Forbidden', { status: 403 });
        const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(assets, 'index.html');
        const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.map': 'application/json' };
        return new Response(fs.readFileSync(target), { headers: {
            'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store',
        } });
    }
    let file, params = {};
    for (const candidate of [path.join(functions, ...parts) + '.js', path.join(functions, ...parts, 'index.js')]) {
        if (fs.existsSync(candidate)) { file = candidate; break; }
    }
    if (!file) for (let i = parts.length; i >= 1; i--) {
        const candidate = path.join(functions, ...parts.slice(0, i), '[[path]].js');
        if (fs.existsSync(candidate)) { file = candidate; params.path = parts.slice(i); break; }
    }
    if (!file) return new Response('Not found', { status: 404 });
    const handlers = [];
    for (let i = 0; i < parts.length; i++) {
        const middleware = modules.get(path.join(functions, ...parts.slice(0, i), '_middleware.js'))?.namespace.onRequest;
        if (middleware) handlers.push(...(Array.isArray(middleware) ? middleware : [middleware]));
    }
    const mod = load(file).namespace;
    const handler = mod['onRequest' + request.method[0] + request.method.slice(1).toLowerCase()] || mod.onRequest;
    if (!handler) return new Response('Method not allowed', { status: 405 });
    handlers.push(...(Array.isArray(handler) ? handler : [handler]));
    let index = 0;
    const context = { env, request, params, data: {}, waitUntil: promise => promise.catch(console.error),
        next: async () => handlers[index++]?.(context) ?? new Response('Not found', { status: 404 }) };
    return context.next();
}
if (process.env.PREVIEW_CHECK_ONLY === '1') {
    const assert = (await import('node:assert/strict')).default;
    for (const route of ['/api/userConfig', '/api/manage/list', '/api/manage/sysConfig/others', '/api/directoryTree']) {
        const response = await handle(new Request(`http://127.0.0.1:${port}${route}`));
        assert.equal(response.status, 200, route);
    }
    const settings = await (await handle(new Request(`http://127.0.0.1:${port}/api/manage/sysConfig/others`))).json();
    assert.equal(settings.telemetry.enabled, false);
    const invalidUpload = await handle(new Request(`http://127.0.0.1:${port}/upload`, {
        method: 'POST', body: new FormData(),
    }));
    assert.equal(invalidUpload.status, 400);
    const search = await handle(new Request(`http://127.0.0.1:${port}/api/manage/list?search=100%25`));
    assert.equal(search.status, 200);
    const files = await (await handle(new Request(`http://127.0.0.1:${port}/api/manage/list?count=-1&recursive=true`))).json();
    if (process.env.PREVIEW_FIXTURES === '1') {
        assert.equal(files.files.length, 9);
        assert.ok(files.files.some(file => file.name.length > 100));
    }
    console.log(`PASS sandbox imports and requests: ${entries.length} backend modules; no listener, disk data or external storage`);
} else http.createServer(async (incoming, outgoing) => {
    try {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
            method: incoming.method, headers: incoming.headers,
            body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks),
        });
        const response = await handle(request);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body && incoming.method !== 'HEAD') for await (const chunk of response.body) outgoing.write(chunk);
        outgoing.end();
    } catch (error) {
        console.error(error);
        outgoing.writeHead(error.status || 500, { 'Content-Type': 'text/plain' });
        outgoing.end('Preview request failed');
    }
}).listen(port, '127.0.0.1', () => console.log(`Local memory preview: http://127.0.0.1:${port}`));
