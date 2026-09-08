import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Persistent, loopback-only development database. No global service; never deletes data.
const directory = resolve('.cache/pg-playground-dev');
const binary = process.env.PLAYGROUND_PG_BIN || resolve('.cache/pg-test/node_modules/@embedded-postgres/windows-x64/native/bin');
const suffix = process.platform === 'win32' ? '.exe' : '';
mkdirSync(directory, { recursive: true });
if (!existsSync(resolve(binary, `pg_ctl${suffix}`))) throw new Error('Set PLAYGROUND_PG_BIN to a PostgreSQL bin directory, or use your existing PostgreSQL with PLAYGROUND_DATABASE_URL. See docs/playground.md.');
const environment = { ...process.env };
// Embedded Windows PostgreSQL uses its bundled DLLs.
if (process.platform === 'win32') for (const key of Object.keys(environment)) if (key === 'PATH') delete environment[key];
function run(file, args, allowFailure = false) {
  const logPath = resolve(directory, `${file}.output.log`), output = openSync(logPath, 'w');
  const result = spawnSync(resolve(binary, `${file}${suffix}`), args, { cwd: directory, env: environment, windowsHide: true, stdio: ['ignore', output, output], timeout: 45_000 });
  closeSync(output);
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) { process.stderr.write(readFileSync(logPath, 'utf8')); throw new Error(`${file} exited with ${result.status}`); }
  return result.status;
}
const command = process.argv[2] ?? 'start';
if (!['start', 'stop', 'status'].includes(command)) throw new Error('Use start, stop or status.');
if (command === 'stop') run('pg_ctl', ['stop', '-D', 'data', '-m', 'fast', '-w', '-t', '30']);
else {
  if (!existsSync(resolve(directory, 'data/PG_VERSION'))) {
    if (command === 'status') process.exit(3);
    run('initdb', ['-D', 'data', '--username=playground_dev', '--auth=trust', '--locale=C', '--encoding=UTF8', '-c', 'listen_addresses=127.0.0.1', '-c', 'port=55433', '-c', 'max_connections=20', '-c', 'shared_buffers=32MB']);
  }
  const running = run('pg_ctl', ['status', '-D', 'data'], true) === 0;
  if (command === 'status') { process.stdout.write(running ? 'Local Playground database is running.\n' : 'Local Playground database is stopped.\n'); process.exit(running ? 0 : 3); }
  if (!running) run('pg_ctl', ['start', '-D', 'data', '-l', 'postgres.log', '-w', '-t', '30']);
  process.stdout.write('Persistent Playground database ready on 127.0.0.1:55433.\nSet PLAYGROUND_DATABASE_URL=postgresql://playground_dev@127.0.0.1:55433/postgres in .env.\n');
}
