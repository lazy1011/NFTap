import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  contractAddress: '0x1953c7DF117822c6Cb82DD9a4Fdaad002DD7807A',
  chainId: 4663,
  chainName: 'Robinhood Chain',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  proofsBaseUrl: 'https://voidborn-proofs.pages.dev',
  maxSupply: 3333,
  secPerBlock: 12,
  gasLimit: 180000,
};

const SELECTORS = {
  mint: '0xa0712d68',          // mint(uint256)
  mintWithProof: '0x0865d4c2', // mintWithProof(uint256,bytes32[])
  mintPaid: '0x26c7f77c',      // mintPaid(uint256)
  walletStatus: '0x4d6d0af8',  // walletStatus(address)
  collectionStatus: '0x3a15826f', // collectionStatus()
  gateStatus: '0x2d6e9dc4',    // gateStatus()
  l1BlockCall: '0x435f5260205ff3', // EVM block.number probe
  transferTopic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
};

const CONTRACT_ABI = [
  'function mint(uint256 quantity)',
  'function mintWithProof(uint256 quantity, bytes32[] proof)',
  'function mintPaid(uint256 quantity) payable',
  'function walletStatus(address minter) view returns (bool freeUsed, uint256 paidCount, uint256 totalMinted, uint256 mutations, uint256 maxMintableNow)',
  'function collectionStatus() view returns (uint256 minted, uint256 supply, uint256 burned, uint256 mutants, uint256 priceWei, bool active, bool mutationsOpen, bool soldOut)',
  'function gateStatus() view returns (uint8 mode, bool hot, uint256 hotUntil, uint256 inWindow, uint256 windowStart, uint256 windowBlocks, uint256 threshold, uint256 holdBlocks, uint256 collections)',
];

const contractInterface = new ethers.utils.Interface(CONTRACT_ABI);

const ERROR_NAMES = {
  '0x343295c4': 'MintInactive',
  '0xf4f5b733': 'ZeroQuantity',
  '0xe6143220': 'ContractMintersBlocked',
  '0xd05cb609': 'MaxSupplyReached',
  '0x83ebf0b2': 'WalletCapExceeded',
  '0xb23bee05': 'WrongPayment',
  '0x0db8982c': 'TreasuryPayFailed',
  '0xa6e41dbb': 'MutationsClosed',
  '0x201b580a': 'SameToken',
  '0x1c6ba68a': 'NotTokenOwner',
  '0x53b6ed02': 'AlreadyMutated',
  '0x5e5c8cc2': 'LegendaryNotBurnable',
  '0x731576a0': 'LegendaryNotMutable',
  '0x6eb4ef39': 'MutantNotBurnable',
  '0x2d1749cd': 'HoldersOnly (Gate Sealed)',
  '0x4992976a': 'BlockCapReached',
};

function parseRevertReason(raw) {
  let hex = '';
  if (typeof raw === 'string') {
    hex = raw;
  } else if (raw) {
    if (typeof raw.data === 'string') hex = raw.data;
    else if (raw.error && typeof raw.error.data === 'string') hex = raw.error.data;
    else if (raw.data && typeof raw.data.data === 'string') hex = raw.data.data;
    else if (raw.message) {
      const match = raw.message.match(/0x[0-9a-fA-F]{8}/);
      if (match) hex = match[0];
    }
  }
  const prefix = hex.slice(0, 10).toLowerCase();
  return ERROR_NAMES[prefix] || (hex && hex !== '0x' ? `Revert: ${hex.slice(0, 10)}` : (raw?.reason || raw?.message || 'Unknown error'));
}

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
    start: 1,
    count: Infinity,
    concurrency: 5, // Default 5 parallel wallets!
    walletsFile: defaultWallets,
    rpc: null,
    delay: 1500,
    noWait: false,
    door: false, // fallback to mintPaid if user sets --door
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--status') args.status = true;
    else if (a === '--start' || a === '-s') args.start = parseInt(argv[++i], 10);
    else if (a === '--count' || a === '-c') args.count = parseInt(argv[++i], 10);
    else if (a === '--concurrency' || a === '-p' || a === '--parallel') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--delay' || a === '-d') args.delay = parseInt(argv[++i], 10);
    else if (a === '--no-wait') args.noWait = true;
    else if (a === '--door') args.door = true;
  }
  return args;
}

function printHelp() {
  console.log(chalk.bold.magenta(`
VOIDBORN Automated Free Minter (Parallel Concurrency)
Contract: ${CONFIG.contractAddress} (${CONFIG.chainName})

Usage:
  node scripts/mint-voidborn.mjs [options]

Options:
  --concurrency, -p <num>  Number of wallets to run in parallel (default: 5)
  --status                 Check contract & gate status and exit
  --dry-run                Simulate mint calls without sending transactions
  --wallets, -w <file>     Path to private keys file (default: wallet_funded.txt)
  --start, -s <index>      Start wallet index (1-based, default: 1)
  --count, -c <num>        Number of wallets to process (default: all)
  --delay, -d <ms>         Delay in ms between batches (default: 1500)
  --rpc <url>              Custom RPC endpoint (default: rpc.txt + fallbacks)
  --no-wait                Skip wallets if gate is sealed instead of waiting
  --door                   Use paid mint (mintPaid) if gate is sealed (~0.0002 ETH)
  --help, -h               Show this help message
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
      if (match && match[1]) {
        const u = match[1].trim();
        // Skip known expired / invalid keys
        if (!u.includes('2mLwK8sr1SFm') && !u.includes('Z0PayQ7P7PET')) {
          rpcs.push(u);
        }
      }
    }
  }

  // Official & public fallbacks
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
    } catch {
      // ignore invalid lines
    }
  }
  return wallets;
}

// Memory cache for allowlist proofs
const proofCache = new Map();

async function getProofForAddress(address) {
  const lower = address.toLowerCase();
  const prefix = lower.slice(2, 4);

  if (!proofCache.has(prefix)) {
    try {
      const url = `${CONFIG.proofsBaseUrl}/${prefix}.json`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        proofCache.set(prefix, data);
      } else {
        proofCache.set(prefix, {});
      }
    } catch {
      proofCache.set(prefix, {});
    }
  }

  const map = proofCache.get(prefix);
  if (map && map[lower] && Array.isArray(map[lower])) {
    return map[lower];
  }
  return null;
}

async function fetchContractState(rpcPool) {
  const [colHex, gateHex, l1Hex] = await Promise.all([
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.collectionStatus }),
    rpcPool.call({ to: CONFIG.contractAddress, data: SELECTORS.gateStatus }),
    rpcPool.call({ data: SELECTORS.l1BlockCall }),
  ]);

  const col = contractInterface.decodeFunctionResult('collectionStatus', colHex);
  const gate = contractInterface.decodeFunctionResult('gateStatus', gateHex);
  const l1Block = Number(BigInt(l1Hex || '0x0'));

  const hotUntil = gate.hotUntil.toNumber();
  // Gate remains sealed while EVM block <= hotUntil (inclusive)
  const isGateHot = gate.hot && l1Block <= hotUntil;
  const blocksLeft = Math.max(0, (hotUntil + 1) - l1Block);

  return {
    minted: col.minted.toNumber(),
    supply: col.supply.toNumber(),
    burned: col.burned.toNumber(),
    mutants: col.mutants.toNumber(),
    priceWei: col.priceWei,
    active: col.active,
    mutationsOpen: col.mutationsOpen,
    soldOut: col.soldOut,
    gate: {
      mode: gate.mode,
      hot: isGateHot,
      hotUntil,
      l1Block,
      blocksLeft: isGateHot ? blocksLeft : 0,
      inWindow: gate.inWindow.toNumber(),
      threshold: gate.threshold.toNumber(),
      holdBlocks: gate.holdBlocks.toNumber(),
    },
  };
}

async function printStatus(rpcPool) {
  console.log(chalk.bold.magenta('\n=== VOIDBORN CONTRACT STATUS ==='));
  const state = await fetchContractState(rpcPool);

  console.log(`Contract:     ${chalk.cyan(CONFIG.contractAddress)}`);
  console.log(`Mint Active:  ${state.active ? chalk.green('YES') : chalk.red('NO')}`);
  console.log(`Sold Out:     ${state.soldOut ? chalk.red('YES') : chalk.green('NO')}`);
  console.log(`Minted:       ${chalk.bold.yellow(state.minted)} / ${CONFIG.maxSupply}`);
  console.log(`Circulating:  ${chalk.bold.white(state.supply)} (Burned: ${state.burned}, Radiant: ${state.mutants})`);
  console.log(`Paid Price:   ${chalk.cyan(ethers.utils.formatEther(state.priceWei))} ETH`);

  console.log(chalk.bold.magenta('\n=== THE GATE STATUS ==='));
  const g = state.gate;
  const gateOpen = !g.hot;
  console.log(`Gate State:   ${gateOpen ? chalk.bold.green('OPEN (Free Claims Active)') : chalk.bold.red(`SEALED (${g.blocksLeft} blocks left, ~${g.blocksLeft * CONFIG.secPerBlock}s)`)}`);
  console.log(`In Window:    ${g.inWindow} / ${g.threshold} free claims`);
  console.log(`Current L1:   Block ${g.l1Block}`);
  console.log(`Hot Until:    Block ${g.hotUntil}`);
  console.log('================================\n');
}

/**
 * Actively tests simulation until the gate opens and call returns '0x'
 */
async function waitForGateToOpen(rpcPool, testFromAddress, logPrefix) {
  const calldata = contractInterface.encodeFunctionData('mint', [1]);

  while (true) {
    let simResult;
    try {
      simResult = await rpcPool.call({
        to: CONFIG.contractAddress,
        from: testFromAddress,
        data: calldata,
      });
    } catch (e) {
      simResult = e.data || '0xerror';
    }

    const state = await fetchContractState(rpcPool);
    const left = state.gate.blocksLeft;
    const estSec = left * CONFIG.secPerBlock;

    // When simulation returns '0x' OR L1 block passed hotUntil, gate is OPEN!
    if (simResult === '0x' || (!state.gate.hot && left === 0)) {
      process.stdout.write(`\r${logPrefix} ${chalk.bold.green('Gate is now OPEN! Proceeding to mint...                                    \n')}`);
      return true;
    }

    process.stdout.write(`\r${logPrefix} ${chalk.yellow(`[GATE SEALED] Waiting for seam to open: ~${left} blocks left (~${estSec}s)...`)}`);

    // Rapid polling near the seam opening (300ms when <= 1 block, 800ms when <= 3)
    const sleepMs = left <= 1 ? 300 : left <= 3 ? 800 : 2500;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

function shortAddr(addr) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function extractTokenId(receipt) {
  const iface = new ethers.utils.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  ]);
  for (const log of receipt.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'Transfer' && parsed.args.from === ethers.constants.AddressZero) {
        return parsed.args.tokenId.toString();
      }
    } catch {}
  }
  return null;
}

async function processWallet({ w, totalWallets, rpcPool, args, contractState }) {
  const logPrefix = chalk.gray(`[${w.index}/${totalWallets}] ${shortAddr(w.address)}:`);

  try {
    let calldata;
    let txValue = ethers.constants.Zero;

    if (w.hasProof) {
      console.log(`${logPrefix} ${chalk.cyan('Sigil Allowlist Proof detected! Bypassing gate.')}`);
      calldata = contractInterface.encodeFunctionData('mintWithProof', [1, w.proof]);
    } else if (contractState.gate.hot && args.door) {
      console.log(`${logPrefix} ${chalk.yellow('Using --door paid mint (~0.0002 ETH)...')}`);
      calldata = contractInterface.encodeFunctionData('mintPaid', [1]);
      txValue = contractState.priceWei;
    } else {
      calldata = contractInterface.encodeFunctionData('mint', [1]);
    }

    if (args.dryRun) {
      let simResult;
      try {
        simResult = await rpcPool.call({
          to: CONFIG.contractAddress,
          from: w.address,
          data: calldata,
          value: txValue,
        });
      } catch (simErr) {
        simResult = simErr.data || '0xerror';
      }

      if (simResult && simResult !== '0x') {
        const reason = parseRevertReason(simResult);
        console.log(`${logPrefix} ${chalk.red(`Simulation failed: ${reason}`)}`);
        return { status: 'failed', index: w.index };
      }
      console.log(`${logPrefix} ${chalk.green('✓ Simulation SUCCESSFUL (Dry Run - No TX sent)')}`);
      return { status: 'success', index: w.index };
    }

    const signer = new ethers.Wallet(w.privateKey, rpcPool.activeProvider);
    const gasPrice = await rpcPool.getGasPrice();
    // 125% gasPrice to guarantee front-running in the new block
    const finalGasPrice = gasPrice.gt(0) ? gasPrice.mul(125).div(100) : ethers.BigNumber.from('10000000');

    const tx = {
      to: CONFIG.contractAddress,
      data: calldata,
      value: txValue,
      gasLimit: CONFIG.gasLimit,
      gasPrice: finalGasPrice,
    };

    console.log(`${logPrefix} ${chalk.blue('Sending free mint transaction...')}`);
    const txResponse = await signer.sendTransaction(tx);
    console.log(`${logPrefix} ${chalk.blue(`Tx sent: ${txResponse.hash.slice(0, 16)}… Waiting for receipt...`)}`);

    const receipt = await rpcPool.waitForTransaction(txResponse.hash, 1);

    if (receipt.status === 1) {
      const tokenId = extractTokenId(receipt);
      const tokenMsg = tokenId ? chalk.bold.green(`Token ID #${tokenId}`) : chalk.green('Token minted');
      console.log(`${logPrefix} ${chalk.bold.green('✓ SUCCESS!')} ${tokenMsg} | Gas: ${receipt.gasUsed.toString()}`);
      console.log(`       ${chalk.gray(`${CONFIG.explorerUrl}/tx/${txResponse.hash}`)}`);
      return { status: 'success', index: w.index };
    } else {
      console.log(`${logPrefix} ${chalk.red('✗ Transaction REVERTED on chain')}`);
      return { status: 'failed', index: w.index };
    }
  } catch (err) {
    console.log(`${logPrefix} ${chalk.red(`Error: ${parseRevertReason(err)}`)}`);
    return { status: 'failed', index: w.index };
  }
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

  console.log(chalk.bold.magenta('\n========================================'));
  console.log(chalk.bold.magenta('       VOIDBORN FREE MINT SCRIPT        '));
  console.log(chalk.bold.magenta('========================================'));
  console.log(`Network:      ${chalk.cyan(CONFIG.chainName)} (ID: ${CONFIG.chainId})`);
  console.log(`Contract:     ${chalk.cyan(CONFIG.contractAddress)}`);
  console.log(`Concurrency:  ${chalk.bold.yellow(`${args.concurrency} wallets parallel`)}`);
  console.log(`RPCs:         ${rpcUrls.length} loaded (Active: ${rpcPool.activeUrl})`);

  let wallets;
  try {
    wallets = loadWallets(args.walletsFile);
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }

  console.log(`Wallets:      ${wallets.length} found in ${args.walletsFile}`);

  const startIdx = Math.max(1, args.start) - 1;
  const count = args.count;
  const targetWallets = wallets.slice(startIdx, startIdx + count);

  console.log(`Selected:     ${targetWallets.length} wallets (index ${startIdx + 1} to ${startIdx + targetWallets.length})`);
  if (args.dryRun) console.log(chalk.yellow.bold('Mode:         DRY RUN (Simulations only, no transactions sent)'));
  console.log(chalk.bold.magenta('----------------------------------------\n'));

  // Initial status check
  const initialState = await fetchContractState(rpcPool);
  if (!initialState.active) {
    console.log(chalk.red.bold('Mint is currently INACTIVE on the contract. Aborting.'));
    return;
  }
  if (initialState.soldOut || initialState.minted >= CONFIG.maxSupply) {
    console.log(chalk.red.bold('VOIDBORN is SOLD OUT! All 3,333 minted.'));
    return;
  }

  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // Process wallets in parallel batches
  for (let batchStart = 0; batchStart < targetWallets.length; batchStart += args.concurrency) {
    const batch = targetWallets.slice(batchStart, batchStart + args.concurrency);
    const batchRange = `${batch[0].index}-${batch[batch.length - 1].index}`;
    console.log(chalk.bold.cyan(`\n>>> Processing Batch [${batchRange}] (${batch.length} wallets in parallel)...`));

    // 1. Pre-filter batch: verify balances & eligibility in parallel
    const checkedWallets = await Promise.all(batch.map(async (w) => {
      const logPrefix = chalk.gray(`[${w.index}/${wallets.length}] ${shortAddr(w.address)}:`);
      try {
        const balance = await rpcPool.getBalance(w.address);
        if (balance.lt(ethers.utils.parseEther('0.000002'))) {
          console.log(`${logPrefix} ${chalk.yellow('Skipped (insufficient gas balance)')}`);
          return { eligible: false, skipped: true, w };
        }

        const wsHex = await rpcPool.call({
          to: CONFIG.contractAddress,
          data: contractInterface.encodeFunctionData('walletStatus', [w.address]),
        });
        const [freeUsed, paidCount, totalMinted, mutations, maxMintableNow] =
          contractInterface.decodeFunctionResult('walletStatus', wsHex);

        if (freeUsed) {
          console.log(`${logPrefix} ${chalk.yellow(`Already claimed free mint (total held: ${totalMinted}). Skipped.`)}`);
          return { eligible: false, skipped: true, w };
        }

        if (maxMintableNow.eq(0)) {
          console.log(`${logPrefix} ${chalk.yellow('Wallet cap reached. Skipped.')}`);
          return { eligible: false, skipped: true, w };
        }

        const proof = await getProofForAddress(w.address);
        return { eligible: true, w, proof, hasProof: !!(proof && proof.length > 0) };
      } catch (err) {
        console.log(`${logPrefix} ${chalk.red(`Pre-check failed: ${err.message}`)}`);
        return { eligible: false, skipped: false, failed: true, w };
      }
    }));

    const eligibleWallets = checkedWallets.filter((c) => c.eligible);
    const skippedCount = checkedWallets.filter((c) => c.skipped).length;
    const failedCount = checkedWallets.filter((c) => c.failed).length;

    totalSkipped += skippedCount;
    totalFailed += failedCount;

    if (eligibleWallets.length === 0) {
      console.log(chalk.gray(`Batch [${batchRange}] had no eligible wallets to mint.`));
      continue;
    }

    // 2. Check Gate Status: if any wallet in this batch needs an open gate, wait once!
    let contractState = await fetchContractState(rpcPool);
    if (contractState.soldOut || contractState.minted >= CONFIG.maxSupply) {
      console.log(chalk.red.bold('\nCollection has SOLD OUT! Exiting.'));
      break;
    }

    const needsOpenGate = eligibleWallets.some((c) => !c.hasProof && !args.door);
    if (needsOpenGate && contractState.gate.hot) {
      if (args.noWait) {
        console.log(chalk.yellow(`Gate is sealed and --no-wait specified. Skipping ${eligibleWallets.length} wallets.`));
        totalSkipped += eligibleWallets.length;
        continue;
      }
      const testAddr = eligibleWallets.find((c) => !c.hasProof).w.address;
      await waitForGateToOpen(rpcPool, testAddr, chalk.gray(`[Batch ${batchRange}]:`));
      contractState = await fetchContractState(rpcPool);
    }

    // 3. Dispatch ALL eligible wallets in this batch SIMULTANEOUSLY!
    console.log(chalk.bold.green(`Launching ${eligibleWallets.length} parallel mint transactions for Batch [${batchRange}]...`));
    const results = await Promise.all(eligibleWallets.map((item) =>
      processWallet({
        w: { ...item.w, proof: item.proof, hasProof: item.hasProof },
        totalWallets: wallets.length,
        rpcPool,
        args,
        contractState,
      })
    ));

    for (const res of results) {
      if (res.status === 'success') totalSuccess++;
      else if (res.status === 'failed') totalFailed++;
    }

    if (batchStart + args.concurrency < targetWallets.length && args.delay > 0) {
      await new Promise((r) => setTimeout(r, args.delay));
    }
  }

  console.log(chalk.bold.magenta('\n========================================'));
  console.log(chalk.bold.magenta('             MINT SUMMARY               '));
  console.log(chalk.bold.magenta('========================================'));
  console.log(`Total Target:   ${targetWallets.length}`);
  console.log(`Successful:     ${chalk.green(totalSuccess)}`);
  console.log(`Skipped:        ${chalk.yellow(totalSkipped)}`);
  console.log(`Failed:         ${chalk.red(totalFailed)}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error(chalk.red.bold(`Fatal error: ${err.message}`));
  process.exit(1);
});
