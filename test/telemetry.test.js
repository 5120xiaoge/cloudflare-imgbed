import assert from 'node:assert/strict';
import { loadFunction, memoryDatabase } from './helpers/loadFunction.js';

const request = () => new Request('https://test/upload?authCode=fixture-secret', {
    headers: { Authorization: 'Bearer fixture-secret', Cookie: 'user_session=fixture-secret',
        'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'image/png' },
});
const load = (enabled, sentryPlugin) => loadFunction('functions/utils/middleware.js', {
    fetchOthersConfig: async () => ({ telemetry: { enabled } }),
    sentryPlugin, '@sentry/tracing': {},
});

describe('telemetry privacy and request isolation', () => {
    it('defaults to disabled and preserves explicit opt-in settings', async () => {
        const db = memoryDatabase();
        const config = await loadFunction('functions/api/manage/sysConfig/others.js');
        assert.equal((await config.getOthersConfig(db, {})).telemetry.enabled, false);
        assert.equal((await config.getOthersConfig(db, { disable_telemetry: 'false' })).telemetry.enabled, true);
        await db.put('manage@sysConfig@others', JSON.stringify({ telemetry: { enabled: false } }));
        assert.equal((await config.getOthersConfig(db, { disable_telemetry: 'false' })).telemetry.enabled, false);
    });

    it('does not initialize telemetry when disabled', async () => {
        const middleware = await load(false, () => assert.fail('Telemetry initialized while disabled'));
        let calls = 0;
        const context = { env: {}, data: {}, request: request(), next: () => { calls++; return new Response('ok'); } };
        assert.equal((await middleware.errorHandling(context)).status, 200);
        assert.equal((await middleware.telemetryData(context)).status, 200);
        assert.equal(calls, 2);
    });

    it('redacts SDK request data, cookies, user data and breadcrumbs', async () => {
        let options;
        const middleware = await load(true, supplied => {
            options = supplied;
            return context => context.next();
        });
        await middleware.errorHandling({ env: {}, data: {}, next: () => new Response('ok') });
        assert.equal(options.sendDefaultPii, false);
        for (const callback of [options.beforeSend, options.beforeSendTransaction]) {
            const event = callback({
                request: { url: request().url, headers: Object.fromEntries(request().headers), data: 'fixture-secret', cookies: 'fixture-secret' },
                user: { ip_address: '192.0.2.1' }, breadcrumbs: [{ message: 'fixture-secret' }],
            });
            assert.doesNotMatch(JSON.stringify(event), /fixture-secret|192\.0\.2\.1|authCode/);
            assert.equal(event.request.url, 'https://test/upload/*');
        }
    });

    it('records only non-sensitive request summaries and works without Cloudflare metadata', async () => {
        const recorded = [];
        let calls = 0, finished = 0;
        const middleware = await load(true);
        const context = { env: {}, request: request(), data: { sentry: {
            setTag: (...args) => recorded.push(args),
            setContext: (...args) => recorded.push(args),
            startTransaction: () => ({ finish() { finished++; } }),
        } }, next: () => { calls++; return new Response('ok'); } };
        assert.equal((await middleware.telemetryData(context)).status, 200);
        assert.equal(calls, 1);
        assert.equal(finished, 1);
        assert.doesNotMatch(JSON.stringify(recorded), /fixture-secret|192\.0\.2\.1|authCode|authorization|cookie/i);
    });

    it('does not retry a failed business operation or replace its error with a tracing error', async () => {
        const middleware = await load(true);
        const businessError = new Error('fixture-business-failure');
        let calls = 0;
        const context = { env: {}, request: request(), data: { sentry: {
            setTag() {}, setContext() {},
            startTransaction: () => ({ finish() { throw new Error('fixture-tracing-failure'); } }),
        } }, next: () => { calls++; throw businessError; } };
        await assert.rejects(() => middleware.telemetryData(context), error => error === businessError);
        assert.equal(calls, 1);
    });

    it('continues once if tracing setup fails or no SDK is present', async () => {
        const middleware = await load(true);
        for (const data of [{}, { sentry: { setTag() { throw new Error('fixture-tracing-failure'); } } }]) {
            let calls = 0;
            const response = await middleware.telemetryData({
                env: {}, request: request(), data,
                next: () => { calls++; return new Response('ok'); },
            });
            assert.equal(response.status, 200);
            assert.equal(calls, 1);
        }
    });
});
