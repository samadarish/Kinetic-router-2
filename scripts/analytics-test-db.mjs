import { spawnSync } from 'node:child_process';
import { existsSync, openSync, closeSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Disposable, loopback-only PostgreSQL. No machine-wide service or installation.
const directory = resolve('.cache/pg-test');
const binary = resolve(directory, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'PATH'));
function run(file, args) {
  const logPath = resolve(directory, `${file}.output.log`); const output = openSync(logPath, 'w');
  const result = spawnSync(resolve(binary, file), args, { cwd: directory, env: environment, windowsHide: true, stdio: ['ignore', output, output], timeout: 45_000 });
  closeSync(output); process.stdout.write(readFileSync(logPath, 'utf8'));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with ${result.status}`);
}
if (process.argv[2] === 'stop') {
  run('pg_ctl.exe', ['stop', '-D', 'data', '-m', 'fast', '-w', '-t', '30']);
} else {
  if (!existsSync(resolve(directory, 'data/PG_VERSION'))) run('initdb.exe', ['-D', 'data', '--username=analytics_test', '--auth=trust', '--locale=C', '--encoding=UTF8', '-c', 'listen_addresses=127.0.0.1', '-c', 'port=55432', '-c', 'max_connections=40', '-c', 'shared_buffers=64MB']);
  run('pg_ctl.exe', ['start', '-D', 'data', '-l', 'postgres.log', '-w', '-t', '30']);
}
