import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';

// Run the compatible, dependency-free suites without installing Mocha.
// This is a focused check, not a replacement for the complete official CI.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
Object.assign(globalThis, { describe, it, before, after, beforeEach, afterEach });
for (const suite of [
    'auth', 'upload', 'read', 'proxy', 'telemetry', 'fileTypes', 'uploadFormat',
    'delete', 'update', 'imageProcessing', 'ai', 'aiUpload', 'dedupScan', 'runtime',
]) {
    await import(`../test/${suite}.test.js`);
}
