// Keccak-256 on 32 bit lanes, for the miner and for the preview. Every lane of the 1600 bit state is two Uint32 (low
// word first), the state is a Uint32Array of fifty words indexed 2 * (x + 5 * y). No dependencies, works in a Worker.
// The claim hash is keccak256(abi.encodePacked(seed, sender, nonce)): 32 + 20 + 32 bytes, one block of the 136 byte
// rate; the miner keeps that block absorbed once and only rewrites the nonce lanes.
export const RC64 = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
export const RC_LO = new Uint32Array(RC64.map((v) => Number(v & 0xffffffffn)));
export const RC_HI = new Uint32Array(RC64.map((v) => Number(v >> 32n)));
// rotation offsets r[x][y] by lane index x + 5y, and the lane each one moves to in pi: y + 5 * ((2x + 3y) mod 5)
export const ROT = new Uint8Array([0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]);
export const DST = new Uint8Array(25);
for (let l = 0; l < 25; l++) {
  const x = l % 5, y = (l - x) / 5;
  DST[l] = y + 5 * ((2 * x + 3 * y) % 5);
}
export const KC = new Uint32Array(10), KD = new Uint32Array(10), KB = new Uint32Array(50);

export function keccakF(s) {
  for (let r = 0; r < 24; r++) {
    for (let x = 0; x < 5; x++) {
      const i = 2 * x;
      KC[i] = s[i] ^ s[i + 10] ^ s[i + 20] ^ s[i + 30] ^ s[i + 40];
      KC[i + 1] = s[i + 1] ^ s[i + 11] ^ s[i + 21] ^ s[i + 31] ^ s[i + 41];
    }
    for (let x = 0; x < 5; x++) {
      const a = 2 * ((x + 4) % 5), b = 2 * ((x + 1) % 5);
      const lo = KC[b], hi = KC[b + 1];
      KD[2 * x] = KC[a] ^ ((lo << 1) | (hi >>> 31));
      KD[2 * x + 1] = KC[a + 1] ^ ((hi << 1) | (lo >>> 31));
    }
    for (let l = 0; l < 25; l++) {
      const x = 2 * (l % 5), i = 2 * l;
      let lo = s[i] ^ KD[x], hi = s[i + 1] ^ KD[x + 1];
      const r = ROT[l];
      if (r !== 0) {
        if (r < 32) {
          const t = (lo << r) | (hi >>> (32 - r));
          hi = (hi << r) | (lo >>> (32 - r));
          lo = t;
        } else if (r === 32) {
          const t = lo;
          lo = hi;
          hi = t;
        } else {
          const q = r - 32;
          const t = (hi << q) | (lo >>> (32 - q));
          hi = (lo << q) | (hi >>> (32 - q));
          lo = t;
        }
      }
      const d = 2 * DST[l];
      KB[d] = lo;
      KB[d + 1] = hi;
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        const i = 2 * (y + x), j = 2 * (y + ((x + 1) % 5)), k = 2 * (y + ((x + 2) % 5));
        s[i] = KB[i] ^ (~KB[j] & KB[k]);
        s[i + 1] = KB[i + 1] ^ (~KB[j + 1] & KB[k + 1]);
      }
    }
    s[0] ^= RC_LO[r];
    s[1] ^= RC_HI[r];
  }
}

// the state after absorbing one padded block of at most 135 bytes: the miner patches the nonce into a copy of it
export function absorbOne(bytes) {
  if (bytes.length > 135) throw new Error("one block only");
  const block = new Uint8Array(136);
  block.set(bytes);
  block[bytes.length] ^= 0x01;
  block[135] ^= 0x80;
  const v = new DataView(block.buffer);
  const s = new Uint32Array(50);
  for (let l = 0; l < 17; l++) {
    s[2 * l] = v.getUint32(8 * l, true);
    s[2 * l + 1] = v.getUint32(8 * l + 4, true);
  }
  return s;
}

// the first 32 bytes of the squeezed state, big endian as a hash reads
export function digest(s, out) {
  const o = out || new Uint8Array(32);
  for (let l = 0; l < 4; l++) {
    const lo = s[2 * l], hi = s[2 * l + 1];
    o[8 * l] = lo & 0xff; o[8 * l + 1] = (lo >>> 8) & 0xff; o[8 * l + 2] = (lo >>> 16) & 0xff; o[8 * l + 3] = lo >>> 24;
    o[8 * l + 4] = hi & 0xff; o[8 * l + 5] = (hi >>> 8) & 0xff; o[8 * l + 6] = (hi >>> 16) & 0xff; o[8 * l + 7] = hi >>> 24;
  }
  return o;
}

// keccak256 of a short message (one block), as bytes
export function keccak256(bytes) {
  const s = absorbOne(bytes);
  keccakF(s);
  return digest(s);
}

export function hex(bytes) {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(h, n) {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (n !== undefined && s.length !== 2 * n) throw new Error(`expected ${n} bytes`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}

// abi.encodePacked(bytes32 seed, address sender, uint256 nonce) with the nonce as a BigInt or a safe integer
export function packed(seedHex, senderHex, nonce) {
  const m = new Uint8Array(84);
  m.set(fromHex(seedHex, 32), 0);
  m.set(fromHex(senderHex, 20), 32);
  let v = BigInt(nonce);
  for (let i = 83; i >= 52; i--) {
    m[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return m;
}

export function claimHash(seedHex, senderHex, nonce) {
  return hex(keccak256(packed(seedHex, senderHex, nonce)));
}

// a 256 bit target as 32 big endian bytes, for byte by byte comparison with a digest
export function targetBytes(target) {
  const out = new Uint8Array(32);
  let v = BigInt(target);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// true when the digest, read as a big endian number, is below the target
export function below(dig, tgt) {
  for (let i = 0; i < 32; i++) {
    if (dig[i] !== tgt[i]) return dig[i] < tgt[i];
  }
  return false;
}
