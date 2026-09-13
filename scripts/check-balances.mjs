import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';

// Same defaults/pool as mint-zeros.mjs
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
  rpcs.push('https://zerosmined.xyz/rpc');
  return [...new Set(rpcs.filter(Boolean))];
}

function loadWallets(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`Wallets file not found: ${fullPath}`);
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  const wallets = [];
  for (const raw0 of lines) {
    const raw = raw0.trim();
    if (!raw || raw.startsWith('#')) continue;
    const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
    try {
      const address = ethers.utils.computeAddress(pk);
      wallets.push({ index: wallets.length + 1, privateKey: pk, address, raw: raw0 });
    } catch {
      // ignore invalid line
    }
  }
  return wallets;
}

function parseArgs(argv) {
  const args = {
    walletsFile: 'wallet.txt',
    out: 'wallet_funded.txt',
    outUnfunded: 'wallet_unfunded.txt',
    rpc: null,
    minEth: null,      // if not given, computed live from gas price
    perWallet: 1,       // mints intended per wallet, scales the min threshold
    marginX: 3,         // safety multiplier over the raw gas cost
    gasLimit: 220000,
    concurrency: 20,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--out-unfunded') args.outUnfunded = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--min-eth') args.minEth = parseFloat(argv[++i]);
    else if (a === '--per-wallet' || a === '-p') args.perWallet = parseInt(argv[++i], 10);
    else if (a === '--margin') args.marginX = parseFloat(argv[++i]);
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
  }
  return args;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const rpcUrls = loadRpcs(args.rpc);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrls[0]);

  console.log(chalk.bold.cyan('Checking wallet balances against real mint gas cost...'));
  console.log(chalk.gray(`RPC: ${rpcUrls[0]}`));

  let liveGasPrice;
  try {
    liveGasPrice = await provider.getGasPrice();
  } catch {
    liveGasPrice = ethers.BigNumber.from('10000000'); // 0.01 gwei fallback, same as mint-zeros.mjs
  }

  let minWei;
  if (args.minEth != null) {
    minWei = ethers.utils.parseEther(String(args.minEth));
  } else {
    const perTx = liveGasPrice.mul(args.gasLimit);
    minWei = perTx.mul(Math.max(1, args.perWallet)).mul(Math.ceil(args.marginX));
  }

  console.log(chalk.gray(`Live gas price: ${ethers.utils.formatUnits(liveGasPrice, 'gwei')} gwei`));
  console.log(chalk.gray(`Required balance (per-wallet=${args.perWallet}, margin=${args.marginX}x): ${ethers.utils.formatEther(minWei)} ETH`));

  const wallets = loadWallets(args.walletsFile);
  console.log(chalk.cyan(`Loaded ${wallets.length} wallets from ${args.walletsFile}\n`));

  let funded = 0;
  let unfunded = 0;
  let errored = 0;
  const fundedLines = [];
  const unfundedLines = [];
  const rows = [];

  await mapWithConcurrency(wallets, args.concurrency, async (w) => {
    try {
      const bal = await provider.getBalance(w.address);
      const ok = bal.gte(minWei);
      rows.push({ index: w.index, address: w.address, balEth: ethers.utils.formatEther(bal), ok });
      if (ok) {
        funded++;
        fundedLines.push(w.raw.trim());
      } else {
        unfunded++;
        unfundedLines.push(w.raw.trim());
      }
    } catch (err) {
      errored++;
      rows.push({ index: w.index, address: w.address, balEth: 'ERROR', ok: false });
      unfundedLines.push(w.raw.trim());
    }
  });

  rows.sort((a, b) => a.index - b.index);
  for (const r of rows) {
    const tag = r.ok ? chalk.green('OK   ') : chalk.red('SKIP ');
    console.log(`${tag} #${String(r.index).padEnd(4)} ${r.address}  ${r.balEth} ETH`);
  }

  fs.writeFileSync(path.resolve(args.out), fundedLines.join('\n') + (fundedLines.length ? '\n' : ''));
  fs.writeFileSync(path.resolve(args.outUnfunded), unfundedLines.join('\n') + (unfundedLines.length ? '\n' : ''));

  console.log(chalk.bold.green(`\n========================================================================`));
  console.log(`Funded (sufficient):   ${chalk.bold.green(funded)}  -> written to ${args.out}`);
  console.log(`Unfunded (skipped):    ${chalk.bold.yellow(unfunded - errored)}`);
  if (errored) console.log(`Balance lookup errors: ${chalk.bold.red(errored)} (treated as unfunded)`);
  console.log(`Unfunded/errored list written to ${args.outUnfunded}`);
  console.log(chalk.bold.green(`========================================================================`));
  console.log(chalk.cyan(`\nRun the mint using only funded wallets:\n  node scripts/mint-zeros.mjs --wallets ${args.out}`));
}

main().catch((err) => {
  console.error(chalk.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
