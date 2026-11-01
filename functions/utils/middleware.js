import sentryPlugin from "@cloudflare/pages-plugin-sentry";
import '@sentry/tracing';
import { fetchOthersConfig } from "./sysConfig";
import { checkDatabaseConfig as checkDbConfig } from './databaseAdapter.js';

function telemetryRequest(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const path = parts[0] === 'api'
    ? `/api/${['manage', 'auth'].includes(parts[1]) ? parts[1] + '/*' : '*'}`
    : `/${['upload', 'file', 'dav', 'random'].includes(parts[0]) ? parts[0] : '*'}/*`;
  const headers = {};
  for (const name of ['content-type', 'content-length']) {
    if (request.headers.has(name)) headers[name] = request.headers.get(name);
  }
  return { headers, url: url.origin + path, method: request.method, path };
}

function sanitizeTelemetryEvent(event) {
  if (event.request) {
    const request = event.request;
    let url;
    try { url = telemetryRequest(new Request(request.url)).url; } catch {}
    event.request = { method: request.method, url };
  }
  delete event.user;
  delete event.breadcrumbs;
  return event;
}

export async function errorHandling(context) {
  // 读取KV中的设置
  const othersConfig = await fetchOthersConfig(context.env);
  const disableTelemetry = !othersConfig.telemetry.enabled;

  const env = context.env;
  if (!disableTelemetry) {
    context.data.telemetry = true;
    // 直接使用本地配置，默认采样率为 100%，无需请求远程配置。
    const configuredSampleRate = Number(env.sampleRate ?? 1);
    const sampleRate = Number.isFinite(configuredSampleRate)
      && configuredSampleRate >= 0 && configuredSampleRate <= 1
      ? configuredSampleRate
      : 1;
    return sentryPlugin({
      dsn: "https://44b7b443108ec6d298044b125ff89d28@o4507644548022272.ingest.us.sentry.io/4507644555100160",
      tracesSampleRate: sampleRate,
      sendDefaultPii: false,
      beforeSend: sanitizeTelemetryEvent,
      beforeSendTransaction: sanitizeTelemetryEvent,
    })(context);
  }

  return context.next();
}

export async function telemetryData(context) {
  // 读取KV中的设置
  const othersConfig = await fetchOthersConfig(context.env);
  const disableTelemetry = !othersConfig.telemetry.enabled;
  
  if (!disableTelemetry && context.data.sentry) {
    let transaction;
    try {
      const data = telemetryRequest(context.request);
      context.data.sentry.setTag("path", data.path);
      context.data.sentry.setTag("url", data.url);
      context.data.sentry.setTag("method", context.request.method);
      context.data.sentry.setContext("request", data);
      transaction = context.data.sentry.startTransaction({ name: `${context.request.method} ${data.path}` });
      context.data.transaction = transaction;
    } catch {
      console.warn('Request telemetry unavailable');
    }
    // Telemetry failure must never retry or hide a business operation.
    try {
      return await context.next();
    } finally {
      try { transaction?.finish(); } catch { console.warn('Request telemetry could not finish'); }
    }
  }

  return context.next();
}

export async function traceData(context, span, op, name) {
  const data = context.data
  if (data.telemetry && data.transaction) {
    if (span) {
      console.log("span finish")
      span.finish();
    } else {
      console.log("span start")
      span = await context.data.transaction.startChild(
        { op: op, name: name },
      );
    }
  }
}

// 检查数据库是否配置
export async function checkDatabaseConfig(context) {
  var env = context.env;

  var dbConfig = checkDbConfig(env);

  if (!dbConfig.configured) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "数据库未配置 / Database not configured",
        message: "请配置 KV 存储 (env.img_url) 或 D1 数据库 (env.img_d1)。 / Please configure KV storage (env.img_url) or D1 database (env.img_d1)."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // 继续执行
  return await context.next();
}
