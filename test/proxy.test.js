import assert from 'node:assert/strict';
import { loadFunction } from './helpers/loadFunction.js';

const endpoint = 'https://test/api/fetchRes';
const request = value => new Request(endpoint, { method: 'POST', body: JSON.stringify({ url: value }) });
const authorized = { dualAuthCheck: async () => ({ authorized: true }) };

describe('remote resource proxy', () => {
    it('requires authentication and rejects malformed bodies before fetching', async () => {
        const globals = { fetch: () => assert.fail('Invalid request reached fetch') };
        const denied = await loadFunction('functions/api/fetchRes.js', { dualAuthCheck: async () => ({ authorized: false }) }, globals);
        assert.equal((await denied.onRequest({ request: request('https://example.com'), env: {} })).status, 401);
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, globals);
        for (const req of [
            new Request(endpoint),
            new Request(endpoint, { method: 'POST', body: '{' }),
            new Request(endpoint, { method: 'POST', body: 'null' }),
            request(null), request({}), request(''),
        ]) {
            assert.ok([400, 405].includes((await proxy.onRequest({ request: req, env: {} })).status));
        }
    });

    it('blocks canonicalized IPv4, private IPv6 and local hostnames', async () => {
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, {
            fetch: () => assert.fail('Internal target reached fetch'),
        });
        for (const url of [
            'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001',
            'http://10.0.0.1', 'http://192.168.1.1', 'http://169.254.169.254',
            'http://198.18.0.1', 'http://localhost.', 'http://service.local.',
            'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[::ffff:7f00:1]',
            'http://[fe90::1]', 'http://[fec0::1]', 'http://[fd00::1]',
            'http://[ff02::1]', 'http://[64:ff9b::7f00:1]',
            'file:///fixture', 'https://name:fixture@example.com',
        ]) {
            assert.equal((await proxy.onRequest({ request: request(url), env: {} })).status, 400, url);
        }
    });

    it('streams public resources without setting cookies or stale encoding headers', async () => {
        const timers = new Set();
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, {
            setTimeout: () => { const id = {}; timers.add(id); return id; },
            clearTimeout: id => timers.delete(id),
            fetch: async (url, options) => {
                assert.equal(options.redirect, 'manual');
                assert.ok(options.signal instanceof AbortSignal);
                return new Response('fixture-image', { headers: {
                    'Content-Type': 'image/png', 'Content-Encoding': 'gzip', 'Content-Length': '2',
                    'Set-Cookie': 'admin_session=fixture', Connection: 'keep-alive',
                } });
            },
        });
        for (const url of ['https://example.com/image', 'http://[::ffff:8.8.8.8]', 'https://[2606:4700:4700::1111]']) {
            const response = await proxy.onRequest({ request: request(url), env: {} });
            assert.equal(response.status, 200);
            assert.equal(await response.text(), 'fixture-image');
            for (const header of ['set-cookie', 'content-encoding', 'content-length', 'connection']) {
                assert.equal(response.headers.get(header), null);
            }
            assert.equal(response.headers.get('Content-Type'), 'image/png');
            assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
            assert.equal(timers.size, 0);
        }
    });

    it('cancels redirect bodies and revalidates the next target', async () => {
        let calls = 0, cancelled = 0;
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, {
            fetch: async () => {
                calls++;
                return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
                    status: 302, headers: { Location: 'http://[::ffff:7f00:1]' },
                });
            },
        });
        assert.equal((await proxy.onRequest({ request: request('https://example.com'), env: {} })).status, 400);
        assert.equal(calls, 1);
        assert.equal(cancelled, 1);
    });

    it('does not expose a redirect after the hop limit or upstream failures', async () => {
        let calls = 0, cancelled = 0;
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, {
            fetch: async () => {
                calls++;
                return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
                    status: 302, headers: { Location: '/next' },
                });
            },
        });
        assert.equal((await proxy.onRequest({ request: request('https://example.com'), env: {} })).status, 502);
        assert.equal(calls, 6);
        assert.equal(cancelled, 6);
        const failed = await loadFunction('functions/api/fetchRes.js', authorized, {
            fetch: async () => { throw new Error('fixture-sensitive-upstream-error'); },
        });
        const response = await failed.onRequest({ request: request('https://example.com'), env: {} });
        assert.equal(response.status, 502);
        assert.doesNotMatch(await response.text(), /fixture-sensitive/);
    });

    it('aborts a stalled upstream connection and clears the timer', async () => {
        let expire, cleared = false;
        const proxy = await loadFunction('functions/api/fetchRes.js', authorized, {
            setTimeout: callback => { expire = callback; return 1; },
            clearTimeout: () => { cleared = true; },
            fetch: (url, options) => new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('timeout')));
            }),
        });
        const pending = proxy.onRequest({ request: request('https://example.com'), env: {} });
        await new Promise(resolve => setImmediate(resolve));
        expire();
        assert.equal((await pending).status, 502);
        assert.equal(cleared, true);
    });
});
