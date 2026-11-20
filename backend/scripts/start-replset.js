/**
 * Starts a local single-node MongoDB replica set (rs0) on port 27018 so that
 * multi-document transactions work without touching your existing standalone mongod.
 *
 *   npm run db:replset
 *
 * Data lives in backend/.data/rs0. Stop it by ending the mongod process (or Ctrl+C when run with --foreground).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongoose').mongo;

const PORT = Number(process.env.REPLSET_PORT || 27018);
const REPL_NAME = 'rs0';
const DB_PATH = path.join(__dirname, '..', '.data', 'rs0');
const foreground = process.argv.includes('--foreground');

function findMongod() {
  if (process.env.MONGOD_PATH && fs.existsSync(process.env.MONGOD_PATH)) return process.env.MONGOD_PATH;
  const roots = ['C:/Program Files/MongoDB/Server'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root).sort().reverse();
    for (const v of versions) {
      const p = path.join(root, v, 'bin', process.platform === 'win32' ? 'mongod.exe' : 'mongod');
      if (fs.existsSync(p)) return p;
    }
  }
  return 'mongod'; // rely on PATH (Linux / macOS / Homebrew)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    const client = new MongoClient(`mongodb://127.0.0.1:${PORT}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      return client;
    } catch (err) {
      lastErr = err;
      await client.close().catch(() => {});
      await sleep(500);
    }
  }
  throw lastErr || new Error('Timed out connecting to mongod');
}

async function ensureInitiated(client) {
  const admin = client.db('admin');
  try {
    await admin.command({ replSetGetStatus: 1 });
  } catch (err) {
    if (err.codeName !== 'NotYetInitialized' && err.code !== 94) throw err;
    console.log('Initiating replica set...');
    await admin.command({ replSetInitiate: { _id: REPL_NAME, members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] } });
  }
  for (let i = 0; i < 40; i += 1) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) return;
    await sleep(500);
  }
  throw new Error('Replica set did not become primary in time');
}

async function main() {
  let client;
  try {
    client = await connect(1500);
    console.log(`mongod already running on port ${PORT}`);
  } catch {
    fs.mkdirSync(DB_PATH, { recursive: true });
    const bin = findMongod();
    console.log(`Starting ${bin} on port ${PORT} (dbpath ${DB_PATH})`);
    const args = ['--replSet', REPL_NAME, '--port', String(PORT), '--dbpath', DB_PATH, '--bind_ip', '127.0.0.1'];
    const child = spawn(bin, args, foreground ? { stdio: 'inherit' } : { detached: true, stdio: 'ignore' });
    child.on('error', (e) => {
      console.error(`Could not start mongod (${e.message}). Set MONGOD_PATH to your mongod binary.`);
      process.exit(1);
    });
    if (!foreground) child.unref();
    client = await connect(30000);
  }

  await ensureInitiated(client);
  await client.close();
  console.log(`\nReplica set "${REPL_NAME}" is ready.`);
  console.log(`Use: MONGODB_URI=mongodb://127.0.0.1:${PORT}/stockflow?replicaSet=${REPL_NAME}`);
  if (foreground) console.log('Running in foreground - press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
