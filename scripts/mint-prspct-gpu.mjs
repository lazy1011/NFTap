import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG = {
  contractAddress: '0xd078008c3D887A52CE722A3cA0539cA1F4971dD1',
  chainId: 4663,
  chainName: 'Robinhood Chain',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  gasLimit: 220000,
  maxSupply: 8888,
};

const PRSPCT_ABI = [
  'function state() view returns (tuple(uint256 depth, bytes32 seed, uint256 openAt, uint256 price, uint256 target, uint256 coinWeight, uint256 sweatWeight, uint256 coinIn, uint256 tillPaid, uint256 day, uint256 pot, bytes32 best, address who, uint256 companyOwed))',
  'function claim(uint256 nonce) payable returns (uint256)',
  'event Dug(uint256 indexed id, address indexed who, uint16 coinBps, uint256 paid, bytes32 assay, uint256 day)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed id)',
];

const contractInterface = new ethers.utils.Interface(PRSPCT_ABI);

function loadRpcs() {
  const rpcs = [];
  const rpcFile = path.resolve(ROOT_DIR, 'rpc.txt');
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

function loadWallets(filePath) {
  const fullPath = path.resolve(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return [];
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  const wallets = [];
  let index = 1;
  for (const line of lines) {
    const clean = line.trim();
    if (clean.startsWith('0x') && clean.length >= 64) {
      try {
        const w = new ethers.Wallet(clean);
        wallets.push({ index: index++, address: w.address, privateKey: clean });
      } catch (_) {}
    }
  }
  return wallets;
}

function buildCudaMinerIfNeeded() {
  const binPath = path.resolve(ROOT_DIR, 'scripts/prspct_cuda_miner');
  const cuPath = path.resolve(ROOT_DIR, 'scripts/prspct_cuda_miner.cu');

  if (!fs.existsSync(binPath)) {
    console.log(chalk.bold.yellow('Compiling CUDA GPU Miner for RTX 4090...'));
    try {
      // Try compilation with architecture sm_89 (Ada Lovelace / RTX 4090)
      execSync(`nvcc -O3 -std=c++17 -arch=sm_89 "${cuPath}" -o "${binPath}" -lpthread`, { stdio: 'inherit' });
      console.log(chalk.bold.green('✓ Multi-GPU CUDA Miner compiled successfully!'));
    } catch (err) {
      console.log(chalk.yellow('Defaulting to general architecture compilation...'));
      execSync(`nvcc -O3 -std=c++17 "${cuPath}" -o "${binPath}" -lpthread`, { stdio: 'inherit' });
      console.log(chalk.bold.green('✓ Multi-GPU CUDA Miner compiled successfully!'));
    }
  }
  return binPath;
}

function runGpuMiner({ binPath, seed, sender, target }) {
  return new Promise((resolve, reject) => {
    const startNonce = String(Math.floor(Math.random() * 2 ** 45) + 1);
    const args = [seed, sender, target, startNonce];

    const child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdoutData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`GPU Miner exited with code ${code}`));
      }
      try {
        const jsonMatch = stdoutData.match(/\{"found":true[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return resolve(parsed);
        }
        reject(new Error('Failed to parse solution from GPU miner output'));
      } catch (err) {
        reject(err);
      }
    });

    child.on('error', (err) => reject(err));
  });
}

function parseArgs(argv) {
  const args = {
    start: 1,
    count: Infinity,
    perWallet: 1,
    walletsFile: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start' || a === '-s') args.start = parseInt(argv[++i], 10);
    else if (a === '--count' || a === '-c') args.count = parseInt(argv[++i], 10);
    else if (a === '--per-wallet' || a === '-p') args.perWallet = parseInt(argv[++i], 10);
    else if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(chalk.bold.green('\n================================================================================'));
  console.log(chalk.bold.green('                 PRSPCT RTX 4090 CUDA GPU AUTOMATED MINTER'));
  console.log(chalk.bold.green('================================================================================'));

  const binPath = buildCudaMinerIfNeeded();

  const rpcs = loadRpcs();
  const provider = new ethers.providers.JsonRpcProvider(rpcs[0], { chainId: CONFIG.chainId, name: 'robinhood' });
  const contract = new ethers.Contract(CONFIG.contractAddress, PRSPCT_ABI, provider);

  const defaultWalletsFile = args.walletsFile || (fs.existsSync(path.resolve(ROOT_DIR, 'wallet_funded.txt'))
    ? 'wallet_funded.txt'
    : 'wallet.txt');
  const allWallets = loadWallets(defaultWalletsFile);
  const startIdx = Math.max(1, args.start) - 1;
  const wallets = allWallets.slice(startIdx, startIdx + args.count);

  console.log(`RPC Endpoint: ${chalk.cyan(rpcs[0])}`);
  console.log(`Wallets:      ${chalk.bold.white(wallets.length)} selected (index ${startIdx + 1} to ${startIdx + wallets.length})`);
  console.log(`Per Wallet:   ${chalk.yellow(args.perWallet)} share(s)`);
  console.log(`Target:       ${CONFIG.contractAddress} (${CONFIG.chainName})`);
  console.log(chalk.bold.green('--------------------------------------------------------------------------------\n'));

  let totalMints = 0;

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const logPrefix = chalk.bold.blue(`[#${w.index}/${allWallets.length} ${w.address.slice(0, 6)}…${w.address.slice(-4)}]:`);

    for (let m = 0; m < args.perWallet; m++) {
      const iterTag = args.perWallet > 1 ? ` (Share ${m + 1}/${args.perWallet})` : '';

    // Check balance
    const balance = await provider.getBalance(w.address);
    if (balance.lt(ethers.utils.parseEther('0.000005'))) {
      console.log(`${logPrefix} ${chalk.yellow(`Skipped (balance ${ethers.utils.formatEther(balance)} ETH too low for gas)`)}`);
      continue;
    }

    // Read current contract state
    const state = await contract.state();
    const depth = state.depth.toNumber();
    if (depth >= CONFIG.maxSupply) {
      console.log(chalk.bold.red('\nPRSPCT completely sold out! (8,888 / 8,888 shares dug). Stopping.'));
      break;
    }

    const seed = state.seed;
    const targetHex = ethers.utils.hexZeroPad(state.target.toHexString(), 32);

    console.log(`${logPrefix} Mining share at depth #${depth + 1} with RTX 4090 GPU...`);

    const startTime = Date.now();
    let solution;
    try {
      solution = await runGpuMiner({
        binPath,
        seed,
        sender: w.address,
        target: targetHex,
      });
    } catch (err) {
      console.log(`${logPrefix} ${chalk.red(`Mining error: ${err.message}`)}`);
      continue;
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `${logPrefix} ${chalk.bold.green('✓ Winning Nonce Found on GPU!')} ` +
      `Nonce: ${chalk.yellow(solution.nonce)} | ` +
      `Hash: ${chalk.gray(solution.hash.slice(0, 18))}… (${elapsedSec}s)`
    );

    // Broadcast on-chain
    console.log(`${logPrefix} Broadcasting free claim transaction on Robinhood Chain...`);
    try {
      const signer = new ethers.Wallet(w.privateKey, provider);
      const calldata = contractInterface.encodeFunctionData('claim', [solution.nonce]);

      const gasPrice = await provider.getGasPrice();
      const finalGasPrice = gasPrice.gt(0) ? gasPrice.mul(120).div(100) : ethers.BigNumber.from('10000000');

      const tx = await signer.sendTransaction({
        to: CONFIG.contractAddress,
        data: calldata,
        value: 0,
        gasLimit: CONFIG.gasLimit,
        gasPrice: finalGasPrice,
      });

      console.log(`${logPrefix} Tx sent: ${chalk.gray(tx.hash.slice(0, 16))}… waiting for confirmation`);
      const receipt = await tx.wait(1);

      if (receipt.status === 1) {
        totalMints++;
        console.log(`${logPrefix} ${chalk.bold.green('🎉 SUCCESS! Share minted on-chain!')} (Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed.toString()})`);
        console.log(`     ${CONFIG.explorerUrl}/tx/${tx.hash}\n`);
      } else {
        console.log(`${logPrefix} ${chalk.red('✗ Transaction reverted on-chain.\n')}`);
      }
      } catch (err) {
        console.log(`${logPrefix} ${chalk.red(`Broadcast error: ${err.message}\n`)}`);
      }
    }
  }

  console.log(chalk.bold.green('\n================================================================================'));
  console.log(`Mining Session Complete! Total Shares Minted: ${chalk.bold.yellow(totalMints)}`);
  console.log(chalk.bold.green('================================================================================\n'));
}

main().catch((err) => {
  console.error(chalk.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
