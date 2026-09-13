# PRSPCT (`prspct.xyz`) Multi-Wallet Parallel Miner & Batch Minter

High-performance, multi-threaded Proof-of-Work (PoW) miner and parallel batch minter for **PRSPCT Consolidated Mining & Dividend Company** on **Robinhood Chain** (Chain ID `4663`).

---

## ⚡ How It Works

* **Website**: [https://prspct.xyz/](https://prspct.xyz/)
* **Contract**: [`0xd078008c3D887A52CE722A3cA0539cA1F4971dD1`](https://robinhoodchain.blockscout.com/address/0xd078008c3D887A52CE722A3cA0539cA1F4971dD1)
* **Total Supply**: 8,888 shares
* **Mint Mechanisms**:
  1. **100% Sweat (Proof-of-Work)**: **FREE (0 ETH, gas only)**!
     * Hashing rule:
       $$\text{uint256}(\text{keccak256}(\text{seed} \parallel \text{walletAddress} \parallel \text{nonce})) \le \text{target}$$
     * The script uses multi-threaded Node.js worker threads to search for matching nonces across CPU cores.
     * When found, it executes `claim(uint256 nonce)` with `value: 0`.
  2. **100% Coin (Instant Buy)**:
     * Instant purchase via bonding curve pricing.
     * Bypasses Proof-of-Work hashing completely using `--buy` / `--coin`.
* **Limits**:
  * **Wallet Limit**: None (unlimited claims per address).
  * **Block Limit**: None (no circuit breaker or gate cooldown).

---

## 🚀 Parallel Concurrency & Batch Execution

### Option 1: Universal 1-Command Parallel Batch Runner (Recommended)

Run batches of 20 wallets in parallel simultaneously:

#### Instant Buy Mode (50 Wallets in Parallel Batches):
```bash
node scripts/batch-runner.mjs --script prspct --batch-size 20 --buy --parallel
```
*Or using npm shortcut:*
```bash
npm run batch:prspct:buy
```

#### Free Mining Mode (Batches in Parallel):
```bash
node scripts/batch-runner.mjs --script prspct --batch-size 10 --threads 4 --parallel
```

---

### Option 2: Manual 3-Terminal Execution (Multi-Tab)

If running across separate terminal tabs or windows:

#### In Instant Buy Mode (`--buy`):

##### Terminal 1 (Wallets 1 to 20):
```bash
node scripts/mint-prspct.mjs --buy --start 1 --count 20 --concurrency 5
```

##### Terminal 2 (Wallets 21 to 40):
```bash
node scripts/mint-prspct.mjs --buy --start 21 --count 20 --concurrency 5
```

##### Terminal 3 (Wallets 41 to 60):
```bash
node scripts/mint-prspct.mjs --buy --start 41 --count 20 --concurrency 5
```

---

#### In Free PoW Mining Mode:

##### Terminal 1 (Wallets 1 to 5):
```bash
node scripts/mint-prspct.mjs --start 1 --count 5 --threads 6
```

##### Terminal 2 (Wallets 6 to 10):
```bash
node scripts/mint-prspct.mjs --start 6 --count 5 --threads 6
```

---

## 🛠️ CLI Options Reference

| Option | Flag | Description | Default |
| :--- | :--- | :--- | :--- |
| **Concurrency** | `--concurrency, -C` | Parallel wallets to process per batch | `5` |
| **Threads** | `--threads, -t` | Number of CPU worker threads for PoW | `CPU cores - 1` |
| **Per Wallet** | `--per-wallet, -p` | Number of shares to mint per wallet | `1` |
| **Start Index** | `--start, -s` | Starting wallet index (1-based) | `1` |
| **Count** | `--count, -c` | Total wallets to process | All wallets |
| **Wallets File**| `--wallets, -w` | Path to private keys file | `wallet_funded.txt` |
| **Buy Mode** | `--buy, --coin` | Instant buy with ETH instead of PoW | `false` |
| **Dry Run** | `--dry-run` | Test execution without broadcasting | `false` |
| **Status** | `--status` | Print contract stats & exit | `false` |
| **Delay** | `--delay, -d` | Delay between batches in ms | `1000` |
| **RPC** | `--rpc` | Custom RPC endpoint | `rpc.txt` pool |

---

## 📋 Common Command Examples

### 1. Check Live Contract Status
```bash
npm run status:prspct
```
*Outputs current vein depth, total dug, target, difficulty bits, and coin price.*

### 2. Dry-Run Simulation on 5 Wallets
```bash
node scripts/mint-prspct.mjs --buy --dry-run --start 1 --count 5
```

### 3. Mine 2 Shares on Wallet #1
```bash
node scripts/mint-prspct.mjs --start 1 --count 1 --per-wallet 2
```
