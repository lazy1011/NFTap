import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import init, { ZerosMiner, nonceBase, meetsTarget } from './zeros_wasm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let miner = null;
let running = false;
let currentAddress = null;
let currentDifficulty = null;
let currentSeed = null;
let BATCH = 250000;

async function setup() {
  const wasmPath = path.join(__dirname, 'zeros_wasm_bg.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);
  await init({ module_or_path: wasmBuffer });
  parentPort.postMessage({ type: 'ready' });
}

function mineLoop() {
  if (!running || !miner) return;

  const t0 = performance.now();
  let res;
  try {
    res = miner.run(BATCH);
  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message || String(err) });
    return;
  }
  const dt = (performance.now() - t0) / 1000;

  // Send progress update
  parentPort.postMessage({
    type: 'progress',
    hashed: res.hashed,
    rate: dt > 0 ? res.hashed / dt : 0,
    zeros: res.zeros,
    nonce: res.nonce,
    valid: res.valid,
    improved: res.improved,
  });

  if (res.valid) {
    running = false;
    parentPort.postMessage({
      type: 'found',
      nonce: res.nonce,
      hash: res.hash,
      zeros: res.zeros,
      address: currentAddress,
    });
    return;
  }

  // Yield to message queue so stop/reseed messages can be processed immediately
  setImmediate(mineLoop);
}

parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    currentSeed = msg.seed;
    currentAddress = msg.addr;
    currentDifficulty = msg.difficulty.toString();
    if (msg.batch) BATCH = msg.batch;

    const rand1 = Math.floor(Math.random() * 0xffffffff);
    const rand2 = Math.floor(Math.random() * 0xffffffff);
    const base = nonceBase(0, msg.workerId, rand1, rand2);

    miner = new ZerosMiner(currentSeed, currentAddress, currentDifficulty, base);
    running = true;
    mineLoop();
  } else if (msg.type === 'stop') {
    running = false;
  } else if (msg.type === 'reseed') {
    currentDifficulty = msg.difficulty.toString();
    currentSeed = msg.seed;
    if (miner) {
      miner.reseed(currentSeed, currentDifficulty, currentAddress);
    }
  }
});

setup().catch((err) => {
  parentPort.postMessage({ type: 'error', message: `Setup failed: ${err.message}` });
});
