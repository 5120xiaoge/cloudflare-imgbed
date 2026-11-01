/**
 * 远程资源代理读取 API
 * 负责在鉴权后拉取请求体中指定 URL 的资源并透传响应内容
 */
import { dualAuthCheck } from '../utils/auth/dualAuth.js';

const IS_NODE_RUNTIME = typeof process !== 'undefined' && Boolean(process.versions?.node);
const HOP_BY_HOP_HEADERS = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
];

/**
 * Build response headers that are safe to send on a new proxy response.
 * Node's fetch transparently decompresses upstream bodies while retaining
 * Content-Encoding/Content-Length, so those headers must be removed there.
 *
 * @param {Headers} responseHeaders - headers returned by the upstream server
 * @returns {Headers}
 */
function createProxyHeaders(responseHeaders) {
    const headers = new Headers(responseHeaders);
    headers.delete('set-cookie');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');

    for (const name of HOP_BY_HOP_HEADERS) {
        headers.delete(name);
    }

    if (IS_NODE_RUNTIME) {
        headers.delete('content-encoding');
        headers.delete('content-length');
    }

    return headers;
}

async function fetchTarget(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const options = { redirect: 'manual', signal: controller.signal };
    if (IS_NODE_RUNTIME) {
        options.headers = { 'Accept-Encoding': 'identity' };
    }
    try {
        return await fetch(url.toString(), options);
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Determine whether a hostname refers to a private, loopback, link-local,
 * cloud-metadata, or otherwise internal network address. Used to prevent
 * SSRF against internal services from the proxy endpoint.
 *
 * @param {string} hostname - hostname or IP literal from a parsed URL
 * @returns {boolean}
 */
function isPrivateHostname(hostname) {
    if (!hostname) return true;
    let h = hostname.toLowerCase().replace(/\.$/, '');
    // Strip IPv6 brackets
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1);
    }

    // Obvious local names
    if (h === 'localhost' || h === 'ip6-localhost' || h === 'ip6-loopback') return true;
    if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;

    // Cloud metadata service hostnames
    if (h === 'metadata.google.internal' || h === 'metadata.goog') return true;

    // IPv4 literal check
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
        if (a === 10) return true;                              // 10.0.0.0/8
        if (a === 127) return true;                             // loopback
        if (a === 0) return true;                               // 0.0.0.0/8
        if (a === 169 && b === 254) return true;                // link-local / AWS metadata 169.254.169.254
        if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
        if (a === 192 && b === 168) return true;                // 192.168.0.0/16
        if (a === 192 && b === 0) return true;                  // special-purpose addresses
        if (a === 198 && (b === 18 || b === 19)) return true;    // benchmark networks
        if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT 100.64.0.0/10
        if (a >= 224) return true;                              // multicast / reserved
        return false;
    }

    // URL canonicalization converts mapped dotted IPv4 to hexadecimal IPv6.
    if (h.includes(':')) {
        const [left, right] = h.split('::');
        const before = left ? left.split(':') : [];
        const after = right ? right.split(':') : [];
        const parts = right === undefined ? before : [...before, ...Array(8 - before.length - after.length).fill('0'), ...after];
        if (parts.length !== 8) return true;
        const words = parts.map(part => parseInt(part, 16));
        if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
            return isPrivateHostname(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
        }
        // Only global unicast (2000::/3), excluding documentation addresses.
        return (words[0] & 0xe000) !== 0x2000 ||
            (words[0] === 0x2001 && (words[1] === 0xdb8 || words[1] === 2));
    }

    return false;
}

export async function onRequest(context) {
    // 获取请求体中URL的内容
    const {
        request,
        env,
        params,
        waitUntil,
        next,
        data
    } = context;

    // 双重鉴权检查
    const url = new URL(request.url);
    const { authorized } = await dualAuthCheck(env, url, request);
    if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    let jsonRequest;
    try {
        jsonRequest = await request.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }
    const targetUrl = jsonRequest?.url;
    if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
        return new Response('URL is required', { status: 400 })
    }

    // Validate the target URL to mitigate SSRF (CWE-918).
    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Only allow http(s); block file:, gopher:, data:, ftp:, blob:, etc.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'Only http(s) URLs are allowed' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Refuse embedded credentials (used to smuggle auth into internal targets).
    if (parsed.username || parsed.password) {
        return new Response(JSON.stringify({ error: 'Credentials in URL are not allowed' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Block private / loopback / link-local / metadata targets.
    if (isPrivateHostname(parsed.hostname)) {
        return new Response(JSON.stringify({ error: 'Access to internal addresses is not allowed' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Follow redirects manually so a permitted host cannot redirect us onto
    // an internal address without re-validation.
    try {
        let currentUrl = parsed;
        let response = await fetchTarget(currentUrl);
        let hops = 0;
        while (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            const location = response.headers.get('location');
            try { await response.body?.cancel(); } catch {}
            if (hops >= 5) {
                return new Response('Too many redirects', { status: 502 });
            }
            const next = new URL(location, currentUrl);
            if ((next.protocol !== 'http:' && next.protocol !== 'https:') ||
                next.username || next.password ||
                isPrivateHostname(next.hostname)) {
                return new Response(JSON.stringify({ error: 'Redirect to disallowed target' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            currentUrl = next;
            response = await fetchTarget(currentUrl);
            hops++;
        }

        const headers = createProxyHeaders(response.headers);
        return new Response(response.body, { headers, status: response.status });
    } catch {
        return new Response(JSON.stringify({ error: 'Unable to fetch remote resource' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
    }
}
