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
  contractAddress: '0x637e3b374a3d4c550fa2aC0c5aD8115a19f1B07e',
  chainId: 4663,
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  defaultBatch: 250000,
  gasLimit: 220000,
  maxSupply: 3333,
};

const SELECTORS = {
  mint: '0xa0712d68',          // mint(uint256 nonce)
  seed: '0x7d94792a',          // seed()
  difficulty: '0x19cae462',    // difficulty()
  totalMinted: '0xa2309ff8',   // totalMinted()
  maxSupply: '0x32cb6b0c',     // maxSupply()
  mintIsOpen: '0xaa1152ab',    // mintIsOpen()
  mintOpensAt: '0xd28ed01c',   // mintOpensAt()
};

function parseArgs(argv) {
  const args = {
    help: false,
    dryRun: false,
    status: false,
    threads: Math.max(1, os.cpus().length - 1),
    start: 1,
    count: Infinity,
    perWallet: 1,
    walletsFile: 'wallet.txt',
    rpc: null,
    batch: CONFIG.defaultBatch,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--status') args.status = true;
    else if (a === '--threads' || a === '-t') args.threads = parseInt(argv[++i], 10);
    else if (a === '--start' || a === '-s') args.start = parseInt(argv[++i], 10);
    else if (a === '--count' || a === '-c') args.count = parseInt(argv[++i], 10);
    else if (a === '--per-wallet' || a === '-p') args.perWallet = parseInt(argv[++i], 10);
    else if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--batch') args.batch = parseInt(argv[++i], 10);
  }
  return args;
}

function printHelp() {
  console.log(chalk.bold.cyan(`
ZEROS Multi-Wallet Proof-of-Work Free Minter
Usage:
  node scripts/mint-zeros.mjs [options]

Options:
  --dry-run             Mine nonce and simulate without broadcasting transaction
  --status              Check contract live status, difficulty, total minted & exit
  --threads, -t <num>   Mining CPU worker threads (default: ${Math.max(1, os.cpus().length - 1)})
  --start, -s <index>   Start wallet index (1-based, default: 1)
  --count, -c <num>     Number of wallets to process (default: all)
  --per-wallet, -p <N>  Number of NFTs to mint per wallet (default: 1)
  --wallets, -w <file>  Private keys file path (default: wallet.txt)
  --rpc <url>           Custom RPC endpoint (default: rpc.txt + Robinhood RPC pool)
  --batch <num>         Hashes per step per worker (default: 250,000)
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

  // Fallbacks
  rpcs.push('https://rpc.mainnet.chain.robinhood.com');
  rpcs.push('https://zerosmined.xyz/rpc');

  return [...new Set(rpcs.filter(Boolean))];
}

class FailoverProvider {
  constructor(urls) {
    this.urls = urls;
    this.currentIndex = 0;
    this.providers = urls.map((u) => new ethers.providers.JsonRpcProvider(u));
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
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    throw lastError || new Error('All RPC providers failed');
  }

  async call(tx) {
    return this.execute((p) => p.call(tx));
  }

  async getBlockNumber() {
    return this.execute((p) => p.getBlockNumber());
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
    return this.execute((p) => p.waitForTransaction(hash, confirms, 60000));
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
      const address = ethers.utils.computeAddress(pk);
      wallets.push({
        index: wallets.length + 1,
        privateKey: pk,
        address,
      });
    } catch {
      // ignore invalid line
    }
  }
  return wallets;
}

async function fetchContractState(rpcPool) {
  const [mintedHex, diffHex, seedHex, openHex] = await Promise.all([
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.totalMinted }),
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.difficulty }),
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.seed }),
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.mintIsOpen }),
  ]);

  return {
    totalMinted: Number(BigInt(mintedHex)),
    difficulty: BigInt(diffHex),
    seed: seedHex,
    mintIsOpen: Number(BigInt(openHex)) === 1,
  };
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

function createWorkerPool(numThreads) {
  const workerScript = path.resolve(__dirname, 'zeros-worker.mjs');
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

async function mineNonceForWallet({
  walletAddress,
  seed,
  difficulty,
  workers,
  rpcPool,
  batchSize,
  logPrefix,
}) {
  return new Promise((resolve, reject) => {
    let solved = false;
    let totalHashed = 0;
    const rates = new Array(workers.length).fill(0);
    let bestZeros = 0;
    const t0 = Date.now();

    // Required zero bits estimate
    const maxUint256 = (1n << 256n) - 1n;
    const target = maxUint256 / difficulty;
    const requiredZeros = 256 - target.toString(2).length;

    // Periodic state poller to detect difficulty or seed change
    const pollInterval = setInterval(async () => {
      if (solved) return;
      try {
        const state = await fetchContractState(rpcPool);
        if (state.difficulty !== difficulty || state.seed !== seed) {
          difficulty = state.difficulty;
          seed = state.seed;
          for (const w of workers) {
            w.postMessage({
              type: 'reseed',
              seed,
              difficulty: difficulty.toString(),
            });
          }
        }
      } catch {}
    }, 15000);

    const cleanup = () => {
      clearInterval(pollInterval);
      for (const w of workers) {
        w.removeAllListeners('message');
        w.postMessage({ type: 'stop' });
      }
    };

    let lastLogTime = 0;

    // Attach listeners
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      w.on('message', (msg) => {
        if (solved) return;

        if (msg.type === 'error') {
          cleanup();
          reject(new Error(msg.message));
          return;
        }

        if (msg.type === 'progress') {
          rates[i] = msg.rate;
          totalHashed += msg.hashed;
          if (msg.zeros > bestZeros) bestZeros = msg.zeros;

          const now = Date.now();
          if (now - lastLogTime >= 350) {
            lastLogTime = now;
            const sumRate = rates.reduce((a, b) => a + b, 0);
            const elapsed = ((now - t0) / 1000).toFixed(1);
            process.stdout.write(
              `\r${logPrefix} ${chalk.yellow('⚡')} ${chalk.bold.green(formatRate(sumRate))} | ` +
              `Zeros: ${chalk.cyan(bestZeros)}/${requiredZeros} | ` +
              `Total: ${(totalHashed / 1e6).toFixed(1)}M hashes | ` +
              `Time: ${elapsed}s  `
            );
          }
        }

        if (msg.type === 'found') {
          solved = true;
          process.stdout.write('\n');
          cleanup();
          resolve({
            nonce: msg.nonce,
            hash: msg.hash,
            zeros: msg.zeros,
            totalHashed,
            elapsedSec: (Date.now() - t0) / 1000,
          });
        }
      });

      // Start worker
      w.postMessage({
        type: 'start',
        seed,
        addr: walletAddress,
        difficulty: difficulty.toString(),
        workerId: i,
        batch: batchSize,
      });
    }
  });
}

function encodeUint256(val) {
  return BigInt(val).toString(16).padStart(64, '0');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  console.log(chalk.bold.green('========================================================================'));
  console.log(chalk.bold.green('                     ZEROS PROOF-OF-WORK FREE MINTER                     '));
  console.log(chalk.bold.green('========================================================================'));

  const rpcUrls = loadRpcs(args.rpc);
  const rpcPool = new FailoverProvider(rpcUrls);
  console.log(chalk.gray(`RPC Endpoints (${rpcUrls.length}): ${rpcUrls[0]} ${rpcUrls.length > 1 ? `(+${rpcUrls.length - 1} pool)` : ''}`));

  // Fetch contract state
  process.stdout.write(chalk.gray('Connecting to Robinhood Chain and reading contract state... '));
  let state = await fetchContractState(rpcPool);
  console.log(chalk.bold.green('Connected!'));

  console.log(chalk.gray('------------------------------------------------------------------------'));
  console.log(`Contract:     ${chalk.yellow(CONFIG.contractAddress)}`);
  console.log(`Supply:       ${chalk.bold.cyan(state.totalMinted)} / ${CONFIG.maxSupply} (${((state.totalMinted / CONFIG.maxSupply) * 100).toFixed(1)}% minted)`);
  console.log(`Difficulty:   ${chalk.bold.yellow(state.difficulty.toString())}`);
  console.log(`Current Seed: ${chalk.gray(state.seed)}`);
  console.log(`Mint Status:  ${state.mintIsOpen ? chalk.bold.green('OPEN') : chalk.bold.red('CLOSED')}`);
  console.log(chalk.gray('------------------------------------------------------------------------'));

  if (args.status) {
    console.log(chalk.green('Status check complete.'));
    return;
  }

  if (!state.mintIsOpen) {
    console.log(chalk.red('Mint is currently not open according to contract (mintIsOpen == false).'));
    return;
  }

  if (state.totalMinted >= CONFIG.maxSupply) {
    console.log(chalk.red('ZEROS collection is SOLD OUT (3333/3333)!'));
    return;
  }

  // Load Wallets
  const allWallets = loadWallets(args.walletsFile);
  console.log(chalk.cyan(`Loaded ${allWallets.length} wallets from ${args.walletsFile}`));

  const startIndex = Math.max(1, args.start) - 1;
  const targetWallets = allWallets.slice(startIndex, startIndex + args.count);

  if (targetWallets.length === 0) {
    console.log(chalk.red(`No wallets to process in range (start: ${args.start}, count: ${args.count})`));
    return;
  }

  console.log(chalk.cyan(`Queue range: Wallet #${targetWallets[0].index} to #${targetWallets[targetWallets.length - 1].index} (${targetWallets.length} wallets)`));
  console.log(chalk.cyan(`Worker Threads: ${args.threads} CPU cores`));
  if (args.dryRun) {
    console.log(chalk.bold.magenta('MODE: DRY-RUN (Mining simulation only, no tx broadcast)'));
  }
  console.log(chalk.gray('========================================================================\n'));

  // Initialize Worker Pool
  process.stdout.write(chalk.gray(`Initializing ${args.threads} mining threads with WebAssembly... `));
  const { workers, readyPromises } = createWorkerPool(args.threads);
  await Promise.all(readyPromises);
  console.log(chalk.bold.green('Ready!\n'));

  let successfulMints = 0;
  let skippedWallets = 0;

  try {
    for (let wIdx = 0; wIdx < targetWallets.length; wIdx++) {
      const wInfo = targetWallets[wIdx];
      const logPrefix = chalk.bold.blue(`[#${wInfo.index} ${shortAddr(wInfo.address)}]`);

      // Refresh total minted before starting
      state = await fetchContractState(rpcPool);
      if (state.totalMinted >= CONFIG.maxSupply) {
        console.log(chalk.bold.red(`\nCollection sold out at ${state.totalMinted}/${CONFIG.maxSupply}. Stopping.`));
        break;
      }

      // Check wallet balance
      const balance = await rpcPool.getBalance(wInfo.address);
      const balEth = ethers.utils.formatEther(balance);

      if (balance.lt(ethers.utils.parseEther('0.000001'))) {
        console.log(`${logPrefix} ${chalk.yellow(`Balance ${balEth} ETH is too low for gas. Skipping.`)}`);
        skippedWallets++;
        continue;
      }

      for (let m = 0; m < args.perWallet; m++) {
        const iterTag = args.perWallet > 1 ? ` (Mint ${m + 1}/${args.perWallet})` : '';
        console.log(`${logPrefix}${iterTag} ${chalk.gray(`Balance: ${balEth} ETH | Mining solution...`)}`);

        // Mine valid nonce
        const solution = await mineNonceForWallet({
          walletAddress: wInfo.address,
          seed: state.seed,
          difficulty: state.difficulty,
          workers,
          rpcPool,
          batchSize: args.batch,
          logPrefix,
        });

        console.log(
          `${logPrefix} ${chalk.bold.green('✓ Found Valid Nonce!')} ` +
          `Nonce: ${chalk.cyan(solution.nonce)} | ` +
          `Hash: ${chalk.gray(solution.hash.slice(0, 18))}… | ` +
          `Zeros: ${solution.zeros} (${solution.elapsedSec.toFixed(1)}s)`
        );

        // Submit transaction
        if (args.dryRun) {
          console.log(`${logPrefix} ${chalk.magenta('Dry-run enabled: skipping live broadcast.')}`);
          successfulMints++;
          continue;
        }

        console.log(`${logPrefix} ${chalk.yellow('Broadcasting free mint transaction...')}`);
        try {
          const signer = new ethers.Wallet(wInfo.privateKey, rpcPool.activeProvider);
          const txData = SELECTORS.mint + encodeUint256(solution.nonce);

          let gasPrice = await rpcPool.getGasPrice().catch(() => ethers.BigNumber.from('10000000')); // 0.01 gwei
          if (gasPrice.lt('10000000')) gasPrice = ethers.BigNumber.from('10000000');

          const tx = {
            to: CONFIG.contractAddress,
            data: txData,
            value: 0,
            gasLimit: CONFIG.gasLimit,
            gasPrice,
          };

          const txResponse = await signer.sendTransaction(tx);
          console.log(`${logPrefix} ${chalk.gray(`Tx sent: ${txResponse.hash.slice(0, 14)}… waiting for block confirmation`)}`);

          const receipt = await rpcPool.waitForTransaction(txResponse.hash, 1);
          if (receipt.status === 1) {
            // Find minted token ID from Transfer event (topic 0 == Transfer)
            let tokenId = 'Unknown';
            for (const log of receipt.logs) {
              if (
                log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                log.topics[3]
              ) {
                tokenId = '#' + parseInt(log.topics[3], 16).toString();
                break;
              }
            }

            successfulMints++;
            console.log(
              `${logPrefix} ${chalk.bold.green('🎉 SUCCESS!')} ` +
              `Minted Token ${chalk.bold.yellow(tokenId)} ` +
              `(Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed.toString()})`
            );
            console.log(`${logPrefix} ${chalk.underline.cyan(`${CONFIG.explorerUrl}/tx/${txResponse.hash}`)}\n`);
          } else {
            console.log(`${logPrefix} ${chalk.bold.red('Transaction reverted on-chain.')}\n`);
          }
        } catch (err) {
          console.log(`${logPrefix} ${chalk.bold.red(`Broadcast error: ${err.message || err}`)}\n`);
        }
      }
    }
  } finally {
    // Terminate worker pool cleanly
    for (const w of workers) {
      w.terminate();
    }
  }

  console.log(chalk.bold.green('\n========================================================================'));
  console.log(chalk.bold.green('                           MINING COMPLETE                              '));
  console.log(chalk.bold.green('========================================================================'));
  console.log(`Total Mints Succeeded: ${chalk.bold.green(successfulMints)}`);
  console.log(`Wallets Skipped (unfunded): ${chalk.yellow(skippedWallets)}`);
  console.log(chalk.bold.green('========================================================================'));
}

main().catch((err) => {
  console.error(chalk.red(`Fatal execution error: ${err.message}`));
  process.exit(1);
});
