# WOBB Robinhood Chain mint stack

This workspace already contains Robinhood Chain mining and minting scripts. I added a small, dedicated flow for the WOBB jelly NFT collection that matches the addresses in your notes.

## Files

- `scripts/wobb-status.mjs` — checks the live token and collection state.
- `scripts/mint-wobb.mjs` — prepares and executes the approval + mint flow.

## Quick status check

```bash
cd /Users/pratikmohanty/Downloads/Script
node scripts/wobb-status.mjs
```

## Mint flow

```bash
cd /Users/pratikmohanty/Downloads/Script
node scripts/mint-wobb.mjs --private-key <your_private_key> --yes
```

Optional overrides:

```bash
node scripts/mint-wobb.mjs \
  --private-key 0x... \
  --rpc https://rpc.mainnet.chain.robinhood.com \
  --token 0x55ac0167265b3f3a1f54637a86edf78f01688efa \
  --collection 0x9A17A4A04Ef39d2A57b91203761075bb41411973 \
  --approve-amount 1000000000000000000000 \
  --mint-method mint \
  --yes
```

## Important note

The collection contract uses a custom mint model with a live approval flow and may expose a non-standard method name. This script is designed to detect the compatible `mint`, `cast`, `claim`, or `mintTo` method automatically before sending a transaction.

If the live mint method differs from the standard pattern, the script will print the selected method and fail safely rather than guessing a wrong signature.
