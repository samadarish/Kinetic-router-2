import { spawnSync } from 'node:child_process';
if (!process.env.TEST_ANALYTICS_DATABASE_URL) throw new Error('Set TEST_ANALYTICS_DATABASE_URL to a disposable PostgreSQL database. Tests create and drop only their own randomly named schema.');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'test/analytics-postgres.test.ts'], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
