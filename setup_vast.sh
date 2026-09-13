#!/bin/bash
set -e

echo "================================================================================"
echo "          SETTING UP PRSPCT RTX 4090 GPU MINER ON VAST.AI / RUNPOD             "
echo "================================================================================"

# 1. Update and install Node.js 20 if needed
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js..."
    apt-get update -y
    apt-get install -y curl build-essential
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[1/4] Node.js is already installed ($(node -v))"
fi

# 2. Install npm dependencies
echo "[2/4] Installing project dependencies..."
npm install

# 3. Check NVIDIA CUDA compiler (nvcc)
echo "[3/4] Checking CUDA compiler..."
if ! command -v nvcc &> /dev/null; then
    echo "ERROR: nvcc (CUDA compiler) not found!"
    echo "Make sure you selected a 'PyTorch' or 'CUDA Devel' template on Vast.ai."
    exit 1
fi
echo "CUDA Version: $(nvcc --version | grep release)"

echo "[4/4] Compiling Multi-GPU PRSPCT CUDA Miner for RTX 4090s..."
rm -f scripts/prspct_cuda_miner
nvcc -O3 -std=c++17 -arch=sm_89 scripts/prspct_cuda_miner.cu -o scripts/prspct_cuda_miner -lpthread || nvcc -O3 -std=c++17 scripts/prspct_cuda_miner.cu -o scripts/prspct_cuda_miner -lpthread

echo "================================================================================"
echo "                   SETUP COMPLETE! STARTING GPU MINER...                        "
echo "================================================================================"

node scripts/mint-prspct-gpu.mjs
