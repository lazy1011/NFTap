# VOIDBORN (`voidborn.live`) Multi-Wallet Parallel & Batch Minter

Automated, high-concurrency free minter for **VOIDBORN** on **Robinhood Chain** (Arbitrum Nitro stack, Chain ID `4663`).

---

## ⚡ Contract & Mint Dynamics

* **Website**: [https://voidborn.live/](https://voidborn.live/)
* **Contract**: [`0x1953c7DF117822c6Cb82DD9a4Fdaad002DD7807A`](https://robinhoodchain.blockscout.com/address/0x1953c7DF117822c6Cb82DD9a4Fdaad002DD7807A)
* **Total Supply**: 3,333 tokens
* **Free Mint**: 1 per wallet via `mint(1)` (cost: 0 ETH, gas only)
* **The Gate (Circuit Breaker)**:
  * The contract monitors rolling mint volume.
  * When **7–8 free claims** occur within a 3-block rolling window, the gate **seals shut**.
  * When sealed, free mint attempts revert with `0x2d1749cd` (`HoldersOnly`).
  * The gate remains sealed for **15 L1 blocks (~2.5 to 3 minutes)** until the seam reopens.
* **The Door (`mintPaid`)**:
  * Any wallet can call `mintPaid(quantity)` for ~0.0002018 ETH to bypass the gate entirely.
* **Merkle Proofs**:
  * Qualified addresses fetch cryptographic proofs from `https://voidborn-proofs.pages.dev/proofs/{address}.json` to mint regardless of gate state via `mintWithProof`.

---

## 🚀 Parallel Concurrency & Batch Execution

The minter supports **parallel concurrency** (dispatching 5 wallets simultaneously per batch) and **multi-terminal batching** (dividing 60+ wallets across concurrent processes).

### Option 1: Universal 1-Command Parallel Batch Runner (Recommended)

Run 60 wallets in 3 parallel batches (Wallets 1–20, 21–40, 41–60) all at once with a single command:

```bash
node scripts/batch-runner.mjs --script voidborn --total 60 --batch-size 20 --parallel
```
*Or using npm shortcut:*
```bash
npm run batch:voidborn
```

* Each batch is tagged with its own color (`[Batch 1: 1-20]`, `[Batch 2: 21-40]`, `[Batch 3: 41-60]`).
* Inside each batch, 5 wallets are dispatched concurrently (`--concurrency 5`).

---

### Option 2: Manual 3-Terminal Execution (Multi-Tab)

If you prefer running in separate terminal tabs/windows, open 3 terminals and run:

#### Terminal 1 (Wallets 1 to 20):
```bash
node scripts/mint-voidborn.mjs --start 1 --count 20 --concurrency 5
```

#### Terminal 2 (Wallets 21 to 40):
```bash
node scripts/mint-voidborn.mjs --start 21 --count 20 --concurrency 5
```

#### Terminal 3 (Wallets 41 to 60):
```bash
node scripts/mint-voidborn.mjs --start 41 --count 20 --concurrency 5
```

---

## 🛠️ CLI Options Reference

| Option | Flag | Description | Default |
| :--- | :--- | :--- | :--- |
| **Concurrency** | `--concurrency, -p` | Number of wallets to process in parallel per batch | `5` |
| **Start Index** | `--start, -s` | Starting wallet index (1-based) | `1` |
| **Count** | `--count, -c` | Total wallets to process | All wallets |
| **Wallets File**| `--wallets, -w` | Path to private keys file | `wallet_funded.txt` |
| **Dry Run** | `--dry-run` | Pre-flight simulate without sending live transactions | `false` |
| **Status** | `--status` | Check collection & gate status and exit | `false` |
| **Door Mode** | `--door` | Fallback to `mintPaid` (~0.0002 ETH) to bypass gate | `false` |
| **No Wait** | `--no-wait` | Skip wallets if gate is sealed instead of waiting | `false` |
| **Delay** | `--delay, -d` | Delay between parallel batches in ms | `1500` |
| **RPC** | `--rpc` | Custom RPC endpoint | RPC Pool (`rpc.txt`) |

---

## 📋 Common Command Examples

### 1. Check Live Gate & Supply Status
```bash
npm run status:voidborn
```
*Outputs current minted count, gate mode, whether the gate is HOT (sealed), and remaining blocks.*

### 2. Dry-Run Simulation on First 10 Wallets
```bash
node scripts/mint-voidborn.mjs --dry-run --count 10
```

### 3. Run Door Bypass (Paid Instant Mint)
```bash
node scripts/mint-voidborn.mjs --door --start 1 --count 10
```

### 4. Sequential Batching (Batch 1, then Batch 2, then Batch 3)
```bash
node scripts/batch-runner.mjs --script voidborn --total 60 --batch-size 20 --sequential
```
