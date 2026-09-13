import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { ethers } from 'ethers';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  contractAddress: '0xd078008c3D887A52CE722A3cA0539cA1F4971dD1',
  chainId: 4663,
  chainName: 'Robinhood Chain',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  maxSupply: 8888,
  gasLimit: 220000,
};

const SELECTORS = {
  claim: '0x379607f5',     // claim(uint256 nonce)
  claimMany: '0xfc119fb1', // claimMany(uint256 count)
  state: '0xc19d93fb',     // state()
  depth: '0x3b5f9099',     // depth()
  priceOf: '0x64746fbb',   // priceOf(uint256 n)
  startBits: '0x3dc3d043', // startBits()
};

const PRSPCT_ABI = [
  'function state() view returns (tuple(uint256 depth, bytes32 seed, uint256 openAt, uint256 price, uint256 target, uint256 coinWeight, uint256 sweatWeight, uint256 coinIn, uint256 tillPaid, uint256 day, uint256 pot, bytes32 best, address who, uint256 companyOwed))',
  'function priceOf(uint256 n) view returns (uint256)',
  'function depth() view returns (uint256)',
  'function startBits() view returns (uint256)',
  'function claim(uint256 nonce) payable returns (uint256)',
  'function claimMany(uint256 count) payable returns (uint256)',
  'event Dug(uint256 indexed id, address indexed who, uint16 coinBps, uint256 paid, bytes32 assay, uint256 day)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed id)',
];

const contractInterface = new ethers.utils.Interface(PRSPCT_ABI);

function parseArgs(argv) {
  const defaultWallets = fs.existsSync('wallet_funded.txt')
    ? 'wallet_funded.txt'
    : fs.existsSync('wallet_ready.txt')
      ? 'wallet_ready.txt'
      : 'wallet.txt';

  const args = {
    help: false,
    dryRun: false,
    status: false,
    threads: Math.max(1, os.cpus().length - 1),
    start: 1,
    count: Infinity,
    perWallet: 1,
    concurrency: 5, // Default 5 parallel wallets per batch in buy mode
    walletsFile: defaultWallets,
    buy: false, // Instant buy mode with ETH (Coin) instead of PoW (Sweat)
    rpc: null,
    delay: 1000,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--status') args.status = true;
    else if (a === '--threads' || a === '-t') args.threads = parseInt(argv[++i], 10);
    else if (a === '--start' || a === '-s') args.start = parseInt(argv[++i], 10);
    else if (a === '--count' || a === '-c') args.count = parseInt(argv[++i], 10);
    else if (a === '--concurrency' || a === '-C' || a === '--parallel') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--per-wallet' || a === '-p') args.perWallet = parseInt(argv[++i], 10);
    else if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
    else if (a === '--buy' || a === '--coin') args.buy = true;
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--delay' || a === '-d') args.delay = parseInt(argv[++i], 10);
  }
  return args;
}

function printHelp() {
  console.log(chalk.bold.yellow(`
PRSPCT Parallel Miner & Batch Minter
Contract: ${CONFIG.contractAddress} (${CONFIG.chainName})

Usage:
  node scripts/mint-prspct.mjs [options]

Options:
  --status              Check contract state (depth, difficulty, price) and exit
  --threads, -t <num>   Mining CPU worker threads (default: ${Math.max(1, os.cpus().length - 1)})
  --concurrency, -C <N> Parallel wallets to process per batch (default: 5)
  --per-wallet, -p <N>  Number of shares to mint per wallet (default: 1)
  --wallets, -w <file>  Path to private keys file (default: wallet_funded.txt)
  --start, -s <index>   Start wallet index (1-based, default: 1)
  --count, -c <num>     Number of wallets to process (default: all)
  --buy, --coin         Buy instantly with ETH (bypasses Proof-of-Work hashing)
  --dry-run             Simulate mint without broadcasting transactions
  --delay, -d <ms>      Delay in ms between wallet batches (default: 1000)
  --rpc <url>           Custom RPC endpoint (default: rpc.txt + fallbacks)
  --help, -h            Show this help message
`));
}

function loadRpcs(customRpc) {
  const rpcs = [];
  if (customRpc) rpcs.push(customRpc);

  const rpcFile = path.resolve('rpc.txt');
  if (fs.existsSync(rpcFile)) {
    const lines = fs.readFileSync(rpcFile, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^RPC_URL=(https?:\/\/\S+)/i);
      if (match && match[1]) rpcs.push(match[1].trim());
    }
  }

  rpcs.push('https://rpc.mainnet.chain.robinhood.com');
  rpcs.push('https://voidborn.live/api/rpc');

  return [...new Set(rpcs.filter(Boolean))];
}

class FailoverProvider {
  constructor(urls) {
    this.urls = urls;
    this.currentIndex = 0;
    const network = { chainId: CONFIG.chainId, name: 'robinhood' };
    this.providers = urls.map((u) => new ethers.providers.JsonRpcProvider(u, network));
  }

  get activeProvider() {
    return this.providers[this.currentIndex];
  }

  get activeUrl() {
    return this.urls[this.currentIndex];
  }

  rotate() {
    this.currentIndex = (this.currentIndex + 1) % this.providers.length;
  }

  async execute(fn, retries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < this.providers.length * retries; attempt++) {
      try {
        return await fn(this.activeProvider);
      } catch (err) {
        lastError = err;
        this.rotate();
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw lastError || new Error('All RPC providers failed');
  }

  async call(tx) {
    return this.execute((p) => p.call(tx));
  }

  async getBalance(address) {
    return this.execute((p) => p.getBalance(address));
  }

  async getGasPrice() {
    return this.execute((p) => p.getGasPrice());
  }

  async sendTransaction(signedTx) {
    return this.execute((p) => p.sendTransaction(signedTx));
  }

  async waitForTransaction(hash, confirms = 1) {
    return this.execute((p) => p.waitForTransaction(hash, confirms, 90000));
  }
}

function loadWallets(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Wallets file not found: ${fullPath}`);
  }
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  const wallets = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
    try {
      const address = ethers.utils.getAddress(ethers.utils.computeAddress(pk));
      wallets.push({
        index: wallets.length + 1,
        privateKey: pk,
        address,
      });
    } catch {}
  }
  return wallets;
}

async function fetchContractState(rpcPool) {
  const sHex = await rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.state });
  const [s] = contractInterface.decodeFunctionResult('state', sHex);

  const depth = s.depth.toNumber();
  const startBits = 22;
  const difficultyBits = startBits + depth / 256;
  const expectedHashes = Math.pow(2, difficultyBits);

  return {
    depth,
    seed: s.seed,
    price: s.price,
    target: s.target,
    pot: s.pot,
    day: s.day.toNumber(),
    bestWho: s.who,
    difficultyBits,
    expectedHashes,
  };
}

async function printStatus(rpcPool) {
  console.log(chalk.bold.yellow('\n=== PRSPCT CONTRACT STATUS ==='));
  const state = await fetchContractState(rpcPool);

  console.log(`Contract:        ${chalk.cyan(CONFIG.contractAddress)}`);
  console.log(`Current Depth:   ${chalk.bold.green(state.depth)} / ${CONFIG.maxSupply} (${((state.depth / CONFIG.maxSupply) * 100).toFixed(1)}% dug)`);
  console.log(`Target:          ${chalk.gray(state.target.toHexString())}`);
  console.log(`Difficulty Bits: ${chalk.bold.yellow(state.difficultyBits.toFixed(2))} bits (~${(state.expectedHashes / 1e9).toFixed(1)}B expected hashes)`);
  console.log(`Full Coin Price: ${chalk.cyan(ethers.utils.formatEther(state.price))} ETH`);
  console.log(`Current Pot:     ${chalk.green(ethers.utils.formatEther(state.pot))} ETH`);
  console.log(`Current Seed:    ${chalk.gray(state.seed.slice(0, 18))}…`);
  console.log('===============================\n');
}

function createWorkerPool(numThreads) {
  const workerScript = path.resolve(__dirname, 'prspct-worker.mjs');
  const workers = [];
  const readyPromises = [];

  for (let i = 0; i < numThreads; i++) {
    const w = new Worker(workerScript, { workerData: { workerId: i } });
    const ready = new Promise((resolve, reject) => {
      const onMsg = (msg) => {
        if (msg.type === 'ready') {
          w.off('message', onMsg);
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
      };
      w.on('message', onMsg);
    });
    readyPromises.push(ready);
    workers.push(w);
  }

  return { workers, readyPromises };
}

function formatRate(hashesPerSec) {
  if (hashesPerSec >= 1e9) return (hashesPerSec / 1e9).toFixed(2) + ' GH/s';
  if (hashesPerSec >= 1e6) return (hashesPerSec / 1e6).toFixed(2) + ' MH/s';
  if (hashesPerSec >= 1e3) return (hashesPerSec / 1e3).toFixed(1) + ' kH/s';
  return hashesPerSec.toFixed(0) + ' H/s';
}

function shortAddr(addr) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function extractTokenId(receipt) {
  const iface = new ethers.utils.Interface([
    'event Dug(uint256 indexed id, address indexed who, uint16 coinBps, uint256 paid, bytes32 assay, uint256 day)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed id)',
  ]);
  for (const log of receipt.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'Dug' || parsed.name === 'Transfer') {
        return parsed.args.id.toString();
      }
    } catch {}
  }
  return null;
}

async function mineNonceForWallet({ walletAddress, seed, target, workers, logPrefix }) {
  return new Promise((resolve, reject) => {
    let solved = false;
    let totalHashed = 0;
    const rates = new Array(workers.length).fill(0);
    const startTime = performance.now();
    const stride = workers.length;
    const baseNonce = Math.floor(Math.random() * 2 ** 40);

    const handlers = [];

    workers.forEach((worker, i) => {
      const onMessage = (msg) => {
        if (msg.type === 'rate') {
          rates[i] = (msg.count * 1000) / Math.max(1, msg.ms);
          totalHashed += msg.count;
          const totalRate = rates.reduce((a, b) => a + b, 0);
          const elapsed = (performance.now() - startTime) / 1000;
          process.stdout.write(`\r${logPrefix} ${chalk.yellow('Mining:')} ${formatRate(totalRate)} | Total: ${(totalHashed / 1e6).toFixed(1)}M hashes (${elapsed.toFixed(1)}s)`);
        } else if (msg.type === 'found' && !solved) {
          solved = true;
          totalHashed += msg.count;
          const elapsed = (performance.now() - startTime) / 1000;

          // Stop all workers
          workers.forEach((w) => w.postMessage({ type: 'stop' }));
          cleanup();

          process.stdout.write(`\r${logPrefix} ${chalk.green('✓ Found Solution!')} Nonce: ${msg.nonce} | Hash: ${msg.hash.slice(0, 16)}… (${elapsed.toFixed(1)}s)\n`);
          resolve({ nonce: msg.nonce, hash: msg.hash, totalHashed, elapsed });
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      handlers.push({ worker, onMessage, onError });

      worker.postMessage({
        type: 'start',
        seed,
        sender: walletAddress,
        target: target.toString(),
        startNonce: baseNonce + i,
        stride,
      });
    });

    function cleanup() {
      handlers.forEach(({ worker, onMessage, onError }) => {
        worker.off('message', onMessage);
        worker.off('error', onError);
      });
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  const rpcUrls = loadRpcs(args.rpc);
  const rpcPool = new FailoverProvider(rpcUrls);

  if (args.status) {
    await printStatus(rpcPool);
    return;
  }

  console.log(chalk.bold.yellow('\n========================================'));
  console.log(chalk.bold.yellow('        PRSPCT MULTI-WALLET MINTER      '));
  console.log(chalk.bold.yellow('========================================'));
  console.log(`Network:   ${chalk.cyan(CONFIG.chainName)} (ID: ${CONFIG.chainId})`);
  console.log(`Contract:  ${chalk.cyan(CONFIG.contractAddress)}`);
  console.log(`Mode:      ${args.buy ? chalk.bold.magenta('COIN (Instant Buy with ETH)') : chalk.bold.green(`SWEAT (100% Free PoW on ${args.threads} CPU threads)`)}`);
  console.log(`RPCs:      ${rpcUrls.length} loaded (Active: ${rpcPool.activeUrl})`);

  let wallets;
  try {
    wallets = loadWallets(args.walletsFile);
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }

  console.log(`Wallets:   ${wallets.length} found in ${args.walletsFile}`);

  const startIdx = Math.max(1, args.start) - 1;
  const targetWallets = wallets.slice(startIdx, startIdx + args.count);

  console.log(`Selected:  ${targetWallets.length} wallets (index ${startIdx + 1} to ${startIdx + targetWallets.length})`);
  console.log(`Per Wallet:${args.perWallet} share(s)`);
  if (args.dryRun) console.log(chalk.yellow.bold('Mode:      DRY RUN (No transactions sent)'));
  console.log(chalk.bold.yellow('----------------------------------------\n'));

  // Initialize Worker Pool if in Sweat (mining) mode
  let workers = [];
  if (!args.buy) {
    process.stdout.write(chalk.gray(`Starting ${args.threads} CPU mining threads... `));
    const pool = createWorkerPool(args.threads);
    await Promise.all(pool.readyPromises);
    workers = pool.workers;
    console.log(chalk.green('Ready!\n'));
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  async function processWalletShare(w, m, totalShares, state) {
    const iterTag = totalShares > 1 ? ` (#${m + 1}/${totalShares})` : '';
    const logPrefix = chalk.gray(`[#${w.index}/${wallets.length}] ${shortAddr(w.address)}:`);

    try {
      const balance = await rpcPool.getBalance(w.address);

      let value = ethers.constants.Zero;
      let nonce = '0';

      if (args.buy) {
        const priceWithBuffer = state.price.add(state.price.div(50));
        value = priceWithBuffer;

        if (balance.lt(value)) {
          console.log(`${logPrefix}${iterTag} ${chalk.yellow(`Skipped (balance ${ethers.utils.formatEther(balance)} ETH < ${ethers.utils.formatEther(value)} ETH required for buy)`)}`);
          return { status: 'skipped' };
        }

        nonce = String(Math.floor(Math.random() * 2 ** 40));
        console.log(`${logPrefix}${iterTag} ${chalk.cyan(`Buying share at depth ${state.depth + 1} for ${ethers.utils.formatEther(state.price)} ETH...`)}`);
      } else {
        if (balance.lt(ethers.utils.parseEther('0.000005'))) {
          console.log(`${logPrefix}${iterTag} ${chalk.yellow('Skipped (insufficient gas balance)')}`);
          return { status: 'skipped' };
        }

        console.log(`${logPrefix}${iterTag} ${chalk.cyan(`Mining share for depth ${state.depth + 1} (Difficulty: ${state.difficultyBits.toFixed(2)} bits)...`)}`);
        const solution = await mineNonceForWallet({
          walletAddress: w.address,
          seed: state.seed,
          target: state.target,
          workers,
          logPrefix: `${logPrefix}${iterTag}`,
        });
        nonce = solution.nonce;
      }

      const calldata = contractInterface.encodeFunctionData('claim', [nonce]);

      // Pre-flight simulation
      try {
        await rpcPool.call({
          to: CONFIG.contractAddress,
          from: w.address,
          data: calldata,
          value,
        });
      } catch (simErr) {
        console.log(`${logPrefix}${iterTag} ${chalk.red(`Simulation failed: ${simErr.reason || simErr.message}`)}`);
        return { status: 'failed' };
      }

      if (args.dryRun) {
        console.log(`${logPrefix}${iterTag} ${chalk.green('✓ Simulation SUCCESSFUL (Dry Run - No TX sent)')}`);
        return { status: 'success' };
      }

      const signer = new ethers.Wallet(w.privateKey, rpcPool.activeProvider);
      const gasPrice = await rpcPool.getGasPrice();
      const finalGasPrice = gasPrice.gt(0) ? gasPrice.mul(120).div(100) : ethers.BigNumber.from('10000000');

      const tx = {
        to: CONFIG.contractAddress,
        data: calldata,
        value,
        gasLimit: CONFIG.gasLimit,
        gasPrice: finalGasPrice,
      };

      console.log(`${logPrefix}${iterTag} ${chalk.blue('Sending claim transaction...')}`);
      const txResponse = await signer.sendTransaction(tx);
      console.log(`${logPrefix}${iterTag} ${chalk.blue(`Tx sent: ${txResponse.hash.slice(0, 16)}… Waiting for receipt...`)}`);

      const receipt = await rpcPool.waitForTransaction(txResponse.hash, 1);

      if (receipt.status === 1) {
        const tokenId = extractTokenId(receipt);
        const tokenMsg = tokenId ? chalk.bold.green(`Share No. #${tokenId}`) : chalk.green('Share claimed');
        console.log(`${logPrefix}${iterTag} ${chalk.bold.green('✓ SUCCESS!')} ${tokenMsg} | Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`       ${chalk.gray(`${CONFIG.explorerUrl}/tx/${txResponse.hash}`)}`);
        return { status: 'success' };
      } else {
        console.log(`${logPrefix}${iterTag} ${chalk.red('✗ Transaction REVERTED on chain')}`);
        return { status: 'failed' };
      }
    } catch (err) {
      console.log(`${logPrefix}${iterTag} ${chalk.red(`Error: ${err.message}`)}`);
      return { status: 'failed' };
    }
  }

  const batchSize = args.buy ? args.concurrency : (args.concurrency > 1 ? args.concurrency : 1);

  try {
    for (let b = 0; b < targetWallets.length; b += batchSize) {
      const batch = targetWallets.slice(b, b + batchSize);
      const batchRange = `${batch[0].index}-${batch[batch.length - 1].index}`;

      // Refresh contract state for the batch
      const state = await fetchContractState(rpcPool);
      if (state.depth >= CONFIG.maxSupply) {
        console.log(chalk.bold.red('\nPRSPCT is completely sold out! (8888/8888 dug). Exiting.'));
        break;
      }

      if (batch.length > 1) {
        console.log(chalk.bold.cyan(`\n>>> Processing Batch [${batchRange}] (${batch.length} wallets in parallel)...`));
      }

      for (let m = 0; m < args.perWallet; m++) {
        const results = await Promise.all(
          batch.map((w) => processWalletShare(w, m, args.perWallet, state))
        );

        for (const res of results) {
          if (res.status === 'success') successCount++;
          else if (res.status === 'skipped') skippedCount++;
          else failedCount++;
        }
      }

      if (b + batchSize < targetWallets.length && args.delay > 0) {
        await new Promise((r) => setTimeout(r, args.delay));
      }
    }
  } finally {
    // Terminate workers on exit
    workers.forEach((w) => w.terminate());
  }

  console.log(chalk.bold.yellow('\n========================================'));
  console.log(chalk.bold.yellow('             MINING SUMMARY             '));
  console.log(chalk.bold.yellow('========================================'));
  console.log(`Total Target:   ${targetWallets.length}`);
  console.log(`Successful:     ${chalk.green(successCount)}`);
  console.log(`Skipped:        ${chalk.yellow(skippedCount)}`);
  console.log(`Failed:         ${chalk.red(failedCount)}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error(chalk.red.bold(`Fatal error: ${err.message}`));
  process.exit(1);
});
