import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const rpcUrl = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const inputFile = process.argv[2] || 'wallet.txt';
const outputFile = process.argv[3] || 'wallet_ready.txt';

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const gasPrice = await provider.getGasPrice();
const gasNeeded = gasPrice.mul(250000);

const inputPath = path.resolve(inputFile);
if (!fs.existsSync(inputPath)) {
  console.error(`Wallet file not found: ${inputPath}`);
  process.exit(1);
}

const seen = new Set();
const ready = [];
const lines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/);

for (const line of lines) {
  const key = line.trim();
  if (!key || key.startsWith('#')) continue;
  const pk = key.startsWith('0x') ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) continue;
  if (seen.has(pk)) continue;
  seen.add(pk);

  try {
    const wallet = new ethers.Wallet(pk);
    const eth = await provider.getBalance(wallet.address);
    if (eth.gte(gasNeeded)) {
      ready.push(pk);
    }
  } catch {
    // Ignore invalid/private key rows
  }
}

ready.sort();
fs.writeFileSync(path.resolve(outputFile), ready.join('\n') + (ready.length ? '\n' : ''));

console.log('rpc=' + rpcUrl);
console.log('gasPriceGwei=' + ethers.utils.formatUnits(gasPrice, 'gwei'));
console.log('gasNeededEth=' + ethers.utils.formatEther(gasNeeded));
console.log('walletsChecked=' + seen.size);
console.log('readyCount=' + ready.length);
console.log('output=' + path.resolve(outputFile));
