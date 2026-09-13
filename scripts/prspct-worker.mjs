import { parentPort, workerData } from 'worker_threads';
import { absorbOne, packed, targetBytes, keccakF, digest, below, hex } from './prspct_keccak.js';

let running = false;
let currentSeed = null;
let currentSender = null;
let currentTarget = null;
let baseState = null;
let tgtBytes = null;

const BATCH_SIZE = 8192;
const s = new Uint32Array(50);
const dig = new Uint8Array(32);

function mineBatch(startNonce, stride) {
  let nonce = startNonce;
  let count = 0;
  let t0 = performance.now();

  function loop() {
    if (!running) return;

    for (let i = 0; i < BATCH_SIZE; i++) {
      const hi = Math.floor(nonce / 4294967296);
      const lo = nonce >>> 0;

      s.set(baseState);
      s[19] ^= ((hi & 0xff) << 24) | (((hi >>> 8) & 0xff) << 16) | (((hi >>> 16) & 0xff) << 8) | (hi >>> 24);
      s[20] ^= ((lo & 0xff) << 24) | (((lo >>> 8) & 0xff) << 16) | (((lo >>> 16) & 0xff) << 8) | (lo >>> 24);

      keccakF(s);
      digest(s, dig);
      count++;

      if (below(dig, tgtBytes)) {
        running = false;
        parentPort.postMessage({
          type: 'found',
          nonce: String(nonce),
          hash: hex(dig),
          count,
        });
        return;
      }

      nonce += stride;
    }

    const now = performance.now();
    if (now - t0 >= 500) {
      parentPort.postMessage({
        type: 'rate',
        count,
        ms: now - t0,
      });
      t0 = now;
      count = 0;
    }

    setImmediate(loop);
  }

  loop();
}

parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    currentSeed = msg.seed;
    currentSender = msg.sender;
    currentTarget = BigInt(msg.target);

    baseState = absorbOne(packed(currentSeed, currentSender, 0));
    tgtBytes = targetBytes(currentTarget);
    running = true;

    mineBatch(msg.startNonce, msg.stride);
  } else if (msg.type === 'stop') {
    running = false;
  }
});

parentPort.postMessage({ type: 'ready' });
