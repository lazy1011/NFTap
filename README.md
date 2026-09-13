# Robinhood Chain Minter Suite (Arbitrum Nitro / Orbit)

High-performance, automated multi-wallet minters and parallel batch runners for Robinhood Chain (`Chain ID: 4663`).

---

## 📦 Projects & Supported Contracts

| Project | Website | Contract | Type | Documentation |
| :--- | :--- | :--- | :--- | :--- |
| **VOIDBORN** | [voidborn.live](https://voidborn.live/) | `0x1953c7DF117822c6Cb82DD9a4Fdaad002DD7807A` | Free Mint / Gate / Paid Bypass | [README-voidborn.md](file:///Users/pratikmohanty/Downloads/Script/README-voidborn.md) |
| **PRSPCT** | [prspct.xyz](https://prspct.xyz/) | `0xd078008c3D887A52CE722A3cA0539cA1F4971dD1` | Free PoW (Sweat) / Instant Buy (Coin) | [README-prspct.md](file:///Users/pratikmohanty/Downloads/Script/README-prspct.md) |
| **ZEROS** | [zerosmined.xyz](https://zerosmined.xyz/) | `0x637e3b374a3d4c550fa2aC0c5aD8115a19f1B07e` | Wasm Proof-of-Work Free Mint | [README-zeros.md](file:///Users/pratikmohanty/Downloads/Script/README-zeros.md) |

---

## ⚡ Master Parallel & Batch Runner (`batch-runner.mjs`)

The universal batch orchestrator [`scripts/batch-runner.mjs`](file:///Users/pratikmohanty/Downloads/Script/scripts/batch-runner.mjs) allows you to run any script across wallet batches simultaneously in parallel or sequentially.

### 1. VOIDBORN Parallel Batches (e.g. 60 wallets in 3 parallel batches):
```bash
node scripts/batch-runner.mjs --script voidborn --total 60 --batch-size 20 --parallel
```
*Or via npm:*
```bash
npm run batch:voidborn
```

### 2. PRSPCT Parallel Batches (Instant Buy mode):
```bash
node scripts/batch-runner.mjs --script prspct --batch-size 20 --buy --parallel
```
*Or via npm:*
```bash
npm run batch:prspct:buy
```

### 3. ZEROS Parallel Batches:
```bash
node scripts/batch-runner.mjs --script zeros --total 60 --batch-size 20 --parallel
```
*Or via npm:*
```bash
npm run batch:zeros
```

---

## 🖥️ Manual Multi-Terminal Batch Execution (e.g. 1-20, 21-40, 41-60)

If you prefer opening multiple terminal tabs:

### VOIDBORN:
* **Terminal 1**: `node scripts/mint-voidborn.mjs --start 1 --count 20 --concurrency 5`
* **Terminal 2**: `node scripts/mint-voidborn.mjs --start 21 --count 20 --concurrency 5`
* **Terminal 3**: `node scripts/mint-voidborn.mjs --start 41 --count 20 --concurrency 5`

### PRSPCT (Buy Mode):
* **Terminal 1**: `node scripts/mint-prspct.mjs --buy --start 1 --count 20 --concurrency 5`
* **Terminal 2**: `node scripts/mint-prspct.mjs --buy --start 21 --count 20 --concurrency 5`
* **Terminal 3**: `node scripts/mint-prspct.mjs --buy --start 41 --count 20 --concurrency 5`

### ZEROS (PoW Mode):
* **Terminal 1**: `node scripts/mint-zeros.mjs --start 1 --count 20 --threads 4`
* **Terminal 2**: `node scripts/mint-zeros.mjs --start 21 --count 20 --threads 4`
* **Terminal 3**: `node scripts/mint-zeros.mjs --start 41 --count 20 --threads 4`

---

## 📊 Live Contract Status Checks

Check contract conditions, supplies, prices, or gate timers anytime:

```bash
npm run status:voidborn   # Gate status, rolling blocks, minted count
npm run status:prspct     # Vein depth, difficulty bits, coin price
npm run status:zeros      # Total minted, difficulty, seed
```
