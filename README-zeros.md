# ZEROS (`zerosmined.xyz`) Multi-Wallet Free Proof-of-Work Minter

High-performance, multi-threaded Proof-of-Work (PoW) free NFT minter for **ZEROS** on **Robinhood Chain** (Arbitrum Orbit, Chain ID `4663`).

---

## ⚡ How It Works

* **Website**: [https://zerosmined.xyz/](https://zerosmined.xyz/)
* **Contract**: [`0x637e3b374a3d4c550fa2aC0c5aD8115a19f1B07e`](https://robinhoodchain.blockscout.com/address/0x637e3b374a3d4c550fa2aC0c5aD8115a19f1B07e)
* **Mechanism**:
  * The contract verifies proof-of-work:
    $$\text{uint256}(\text{keccak256}(\text{seed} \parallel \text{walletAddress} \parallel \text{nonce})) \le \frac{2^{256} - 1}{\text{difficulty}}$$
  * The script uses the official compiled WebAssembly miner (`zeros_wasm_bg.wasm`) across multi-core Node.js `worker_threads` to mine nonces at maximum speed (15–20+ MH/s).
  * When a valid nonce is found, it calls `mint(uint256 nonce)` costing **0 ETH** (free mint, minimal L2 gas only).

---

## 🚀 Parallel Concurrency & Batch Execution

### Option 1: Universal 1-Command Parallel Batch Runner (Recommended)

Run batches of 20 wallets concurrently in parallel using the master batch orchestrator:

```bash
node scripts/batch-runner.mjs --script zeros --total 60 --batch-size 20 --parallel
```
*Or using npm shortcut:*
```bash
npm run batch:zeros
```

---

### Option 2: Manual 3-Terminal Execution (Multi-Tab)

If you prefer running in separate terminal tabs or windows:

#### Terminal 1 (Wallets 1 to 20):
```bash
node scripts/mint-zeros.mjs --start 1 --count 20 --threads 4
```

#### Terminal 2 (Wallets 21 to 40):
```bash
node scripts/mint-zeros.mjs --start 21 --count 20 --threads 4
```

#### Terminal 3 (Wallets 41 to 60):
```bash
node scripts/mint-zeros.mjs --start 41 --count 20 --threads 4
```

---

## 🛠️ CLI Options Reference

| Option | Flag | Description | Default |
| :--- | :--- | :--- | :--- |
| **Threads** | `--threads, -t` | Number of CPU worker threads | `CPU cores - 1` |
| **Start Index** | `--start, -s` | Starting wallet number (1-based) | `1` |
| **Count** | `--count, -c` | Total wallets to process | All wallets |
| **Per Wallet** | `--per-wallet, -p` | Number of NFTs to mine per wallet | `1` |
| **Wallets File** | `--wallets, -w` | Path to private keys file | `wallet.txt` |
| **Custom RPC** | `--rpc` | Override RPC endpoint | Alchemy pool in `rpc.txt` |
| **Dry Run** | `--dry-run` | Test mining without live broadcast | `false` |
| **Status** | `--status` | Print contract stats & exit | `false` |

---

## 📋 Common Command Examples

### 1. Check Live Contract Status
```bash
npm run status:zeros
```

### 2. Mine 1 Token per Wallet for Wallets 1 to 10
```bash
node scripts/mint-zeros.mjs --start 1 --count 10
```

### 3. Dry-Run Simulation on 3 Wallets
```bash
node scripts/mint-zeros.mjs --dry-run --count 3
```
