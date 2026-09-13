import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SCRIPT_MAP = {
  voidborn: 'scripts/mint-voidborn.mjs',
  prspct: 'scripts/mint-prspct.mjs',
  zeros: 'scripts/mint-zeros.mjs',
};

function parseArgs(argv) {
  const args = {
    script: 'voidborn',
    batchSize: 20,
    start: 1,
    total: null,
    batches: null,
    parallel: true, // Default to parallel batch execution!
    concurrency: 5,  // Inside each batch, run 5 wallets in parallel
    walletsFile: null,
    dryRun: false,
    extraArgs: [],
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--script') args.script = argv[++i];
    else if (a === '--batch-size' || a === '-b') args.batchSize = parseInt(argv[++i], 10);
    else if (a === '--start' || a === '-s') args.start = parseInt(argv[++i], 10);
    else if (a === '--total' || a === '-t') args.total = parseInt(argv[++i], 10);
    else if (a === '--batches' || a === '-n') args.batches = parseInt(argv[++i], 10);
    else if (a === '--sequential' || a === '--seq') args.parallel = false;
    else if (a === '--parallel' || a === '-p') args.parallel = true;
    else if (a === '--concurrency' || a === '-c') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--wallets' || a === '-w') args.walletsFile = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else {
      // Pass other flags (e.g. --buy, --door, --rpc, etc.) through
      args.extraArgs.push(a);
    }
  }

  return args;
}

function printHelp() {
  console.log(chalk.bold.cyan(`
================================================================================
                    UNIVERSAL PARALLEL & BATCH RUNNER
================================================================================
Runs any minter across wallet batches in parallel or sequence.

Usage:
  node scripts/batch-runner.mjs [options] [-- extra_args]

Options:
  --script <name>       Target script: voidborn | prspct | zeros (default: voidborn)
  --batch-size, -b <N>  Number of wallets per batch (default: 20)
  --start, -s <index>   Starting wallet index (default: 1)
  --total, -t <N>       Total wallets to process (default: all available)
  --batches, -n <N>     Maximum number of batches to run (default: all)
  --parallel, -p        Run all batches concurrently in parallel (default: true)
  --sequential, --seq   Run batches sequentially one after another
  --concurrency, -c <N> Wallets per sub-batch inside each runner (default: 5)
  --wallets, -w <file>  Private keys file path (default: auto-detected)
  --dry-run             Forward dry-run flag to all batches
  --help, -h            Show this help screen

Passthrough Flags:
  Any extra flags (e.g. --buy, --door, --rpc, --threads) are automatically
  passed to the target script.

Examples:
  # 1. Run 3 batches of 20 wallets in parallel (1-20, 21-40, 41-60) for VOIDBORN:
  node scripts/batch-runner.mjs --script voidborn --total 60 --batch-size 20 --parallel

  # 2. Run PRSPCT Buy in parallel batches across 50 funded wallets:
  node scripts/batch-runner.mjs --script prspct --batch-size 20 --buy

  # 3. Dry-run test across 40 wallets in 2 batches:
  node scripts/batch-runner.mjs --script voidborn --total 40 --batch-size 20 --dry-run
================================================================================
`));
}

function countWallets(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('0x') && l.length >= 64).length;
}

function getColors() {
  return [
    chalk.cyan,
    chalk.yellow,
    chalk.magenta,
    chalk.green,
    chalk.blue,
    chalk.red,
    chalk.whiteBright,
  ];
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  // Resolve target script
  const scriptRelPath = SCRIPT_MAP[args.script.toLowerCase()] || args.script;
  const scriptFullPath = path.resolve(ROOT_DIR, scriptRelPath);

  if (!fs.existsSync(scriptFullPath)) {
    console.error(chalk.red(`Error: Script not found: ${scriptFullPath}`));
    process.exit(1);
  }

  // Detect wallet file
  const defaultWallets = fs.existsSync(path.resolve(ROOT_DIR, 'wallet_funded.txt'))
    ? 'wallet_funded.txt'
    : fs.existsSync(path.resolve(ROOT_DIR, 'wallet_ready.txt'))
      ? 'wallet_ready.txt'
      : 'wallet.txt';

  const walletsFile = args.walletsFile || defaultWallets;
  const totalWalletsInFile = countWallets(path.resolve(ROOT_DIR, walletsFile));

  const startIndex = Math.max(1, args.start);
  const maxAvailable = Math.max(0, totalWalletsInFile - (startIndex - 1));
  const totalToRun = args.total ? Math.min(args.total, maxAvailable) : maxAvailable;

  if (totalToRun <= 0) {
    console.log(chalk.red(`No wallets available in ${walletsFile} starting from index ${startIndex}.`));
    return;
  }

  // Build batch ranges
  const batches = [];
  for (let current = startIndex; current < startIndex + totalToRun; current += args.batchSize) {
    const count = Math.min(args.batchSize, startIndex + totalToRun - current);
    batches.push({
      batchNum: batches.length + 1,
      start: current,
      count,
      end: current + count - 1,
    });
    if (args.batches && batches.length >= args.batches) break;
  }

  console.log(chalk.bold.cyan('\n================================================================================'));
  console.log(chalk.bold.cyan('                     PARALLEL BATCH ORCHESTRATOR'));
  console.log(chalk.bold.cyan('================================================================================'));
  console.log(`Target Script: ${chalk.bold.white(scriptRelPath)}`);
  console.log(`Wallets File:  ${chalk.white(walletsFile)} (${totalWalletsInFile} total wallets)`);
  console.log(`Queue Range:   Wallets #${startIndex} to #${startIndex + totalToRun - 1} (${totalToRun} wallets)`);
  console.log(`Batch Size:    ${chalk.yellow(args.batchSize)} wallets per batch`);
  console.log(`Total Batches: ${chalk.bold.yellow(batches.length)} batches`);
  console.log(`Execution Mode:${args.parallel ? chalk.bold.green(' PARALLEL (All batches run simultaneously)') : chalk.bold.blue(' SEQUENTIAL')}`);
  console.log(`Sub-Batch:     ${chalk.magenta(`${args.concurrency} parallel wallets`)} per batch`);
  if (args.dryRun) console.log(chalk.bold.yellow('Dry Run:       ENABLED'));
  if (args.extraArgs.length > 0) console.log(`Extra Flags:   ${chalk.gray(args.extraArgs.join(' '))}`);
  console.log(chalk.bold.cyan('--------------------------------------------------------------------------------'));

  console.log(chalk.bold.white('\nPlanned Batches:'));
  batches.forEach((b) => {
    console.log(`  Batch #${b.batchNum}: Wallets #${b.start} - #${b.end} (${b.count} wallets)`);
  });

  console.log(chalk.bold.white('\nManual Terminal Commands (if running in separate terminal tabs):'));
  batches.forEach((b) => {
    const extra = args.extraArgs.join(' ');
    const dry = args.dryRun ? ' --dry-run' : '';
    const w = args.walletsFile ? ` --wallets ${args.walletsFile}` : '';
    console.log(chalk.gray(`  node ${scriptRelPath} --start ${b.start} --count ${b.count} --concurrency ${args.concurrency}${w}${dry}${extra ? ' ' + extra : ''}`));
  });
  console.log(chalk.bold.cyan('================================================================================\n'));

  const colors = getColors();

  function runBatch(batch) {
    return new Promise((resolve) => {
      const color = colors[(batch.batchNum - 1) % colors.length];
      const prefix = color(`[Batch ${batch.batchNum}: ${batch.start}-${batch.end}] `);

      const cmdArgs = [
        scriptFullPath,
        '--start', String(batch.start),
        '--count', String(batch.count),
        '--concurrency', String(args.concurrency),
      ];

      if (args.walletsFile) {
        cmdArgs.push('--wallets', args.walletsFile);
      }
      if (args.dryRun) {
        cmdArgs.push('--dry-run');
      }
      if (args.extraArgs.length > 0) {
        cmdArgs.push(...args.extraArgs);
      }

      console.log(prefix + chalk.bold.green(`Starting process...`));

      const child = spawn('node', cmdArgs, {
        cwd: ROOT_DIR,
        env: process.env,
      });

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim().length > 0) {
            process.stdout.write(prefix + line + '\n');
          }
        }
      });

      child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim().length > 0) {
            process.stderr.write(prefix + chalk.red(line) + '\n');
          }
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(prefix + chalk.bold.green(`✓ Completed successfully (Exit code: 0)`));
        } else {
          console.log(prefix + chalk.bold.red(`✗ Exited with error code: ${code}`));
        }
        resolve({ batch, code });
      });

      child.on('error', (err) => {
        console.log(prefix + chalk.bold.red(`Failed to start: ${err.message}`));
        resolve({ batch, code: -1, error: err });
      });
    });
  }

  const startTime = Date.now();

  if (args.parallel) {
    console.log(chalk.bold.green(`>>> Spawning all ${batches.length} batches simultaneously in parallel...\n`));
    const results = await Promise.all(batches.map((b) => runBatch(b)));
    printSummary(results, startTime);
  } else {
    console.log(chalk.bold.blue(`>>> Running ${batches.length} batches sequentially...\n`));
    const results = [];
    for (const b of batches) {
      const res = await runBatch(b);
      results.push(res);
    }
    printSummary(results, startTime);
  }
}

function printSummary(results, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter((r) => r.code === 0).length;
  const failed = results.filter((r) => r.code !== 0).length;

  console.log(chalk.bold.cyan('\n================================================================================'));
  console.log(chalk.bold.cyan('                          BATCH RUN COMPLETE'));
  console.log(chalk.bold.cyan('================================================================================'));
  console.log(`Total Batches:      ${results.length}`);
  console.log(`Successful:         ${chalk.green(successful)}`);
  console.log(`Failed / Errors:    ${failed > 0 ? chalk.red(failed) : chalk.green(0)}`);
  console.log(`Total Elapsed Time: ${chalk.yellow(`${elapsed}s`)}`);
  console.log(chalk.bold.cyan('================================================================================\n'));
}

main().catch((err) => {
  console.error(chalk.red(`Fatal orchestrator error: ${err.message}`));
  process.exit(1);
});
