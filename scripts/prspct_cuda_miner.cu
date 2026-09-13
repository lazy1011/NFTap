/**
 * PRSPCT High-Performance Multi-GPU CUDA Keccak-256 Miner
 * Supports 1x, 2x, 4x, 5x, 8x NVIDIA RTX 4090s simultaneously!
 *
 * Each GPU works on an independent, non-overlapping nonce space.
 * When ANY GPU finds a winning nonce, all GPUs stop and report the solution.
 */

#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <cstring>
#include <cstdint>
#include <thread>
#include <atomic>
#include <cuda_runtime.h>

#define ROTL64(x, y) (((x) << (y)) | ((x) >> (64 - (y))))

__constant__ uint64_t d_RC[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL,
    0x8000000080008000ULL, 0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL, 0x000000000000008aULL,
    0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL,
    0x8000000000008003ULL, 0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL, 0x8000000080008081ULL,
    0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
};

__device__ __forceinline__ void keccak_f1600(uint64_t state[25]) {
    #pragma unroll
    for (int round = 0; round < 24; ++round) {
        // Theta
        uint64_t C[5];
        C[0] = state[0] ^ state[5] ^ state[10] ^ state[15] ^ state[20];
        C[1] = state[1] ^ state[6] ^ state[11] ^ state[16] ^ state[21];
        C[2] = state[2] ^ state[7] ^ state[12] ^ state[17] ^ state[22];
        C[3] = state[3] ^ state[8] ^ state[13] ^ state[18] ^ state[23];
        C[4] = state[4] ^ state[9] ^ state[14] ^ state[19] ^ state[24];

        uint64_t D[5];
        D[0] = C[4] ^ ROTL64(C[1], 1);
        D[1] = C[0] ^ ROTL64(C[2], 1);
        D[2] = C[1] ^ ROTL64(C[3], 1);
        D[3] = C[2] ^ ROTL64(C[4], 1);
        D[4] = C[3] ^ ROTL64(C[0], 1);

        #pragma unroll
        for (int i = 0; i < 5; ++i) {
            state[i]      ^= D[i];
            state[i + 5]  ^= D[i];
            state[i + 10] ^= D[i];
            state[i + 15] ^= D[i];
            state[i + 20] ^= D[i];
        }

        // Rho and Pi
        uint64_t B[25];
        B[0]  = state[0];
        B[10] = ROTL64(state[1], 1);
        B[7]  = ROTL64(state[2], 62);
        B[11] = ROTL64(state[3], 28);
        B[17] = ROTL64(state[4], 27);
        B[18] = ROTL64(state[5], 36);
        B[3]  = ROTL64(state[6], 44);
        B[5]  = ROTL64(state[7], 6);
        B[16] = ROTL64(state[8], 55);
        B[8]  = ROTL64(state[9], 20);
        B[21] = ROTL64(state[10], 3);
        B[24] = ROTL64(state[11], 10);
        B[4]  = ROTL64(state[12], 43);
        B[15] = ROTL64(state[13], 25);
        B[23] = ROTL64(state[14], 39);
        B[19] = ROTL64(state[15], 41);
        B[9]  = ROTL64(state[16], 45);
        B[2]  = ROTL64(state[17], 15);
        B[20] = ROTL64(state[18], 21);
        B[14] = ROTL64(state[19], 8);
        B[22] = ROTL64(state[20], 18);
        B[1]  = ROTL64(state[21], 2);
        B[6]  = ROTL64(state[22], 61);
        B[12] = ROTL64(state[23], 56);
        B[13] = ROTL64(state[24], 14);

        // Chi
        #pragma unroll
        for (int j = 0; j < 25; j += 5) {
            state[j + 0] = B[j + 0] ^ ((~B[j + 1]) & B[j + 2]);
            state[j + 1] = B[j + 1] ^ ((~B[j + 2]) & B[j + 3]);
            state[j + 2] = B[j + 2] ^ ((~B[j + 3]) & B[j + 4]);
            state[j + 3] = B[j + 3] ^ ((~B[j + 4]) & B[j + 0]);
            state[j + 4] = B[j + 4] ^ ((~B[j + 0]) & B[j + 1]);
        }

        // Iota
        state[0] ^= d_RC[round];
    }
}

__global__ void mine_kernel(
    const uint64_t* __restrict__ base_state,
    uint64_t target_w0, uint64_t target_w1, uint64_t target_w2, uint64_t target_w3,
    uint64_t nonce_offset,
    uint32_t* __restrict__ d_found,
    uint64_t* __restrict__ d_sol_nonce,
    uint8_t* __restrict__ d_sol_hash
) {
    if (*d_found) return;

    uint64_t tid = blockDim.x * (uint64_t)blockIdx.x + threadIdx.x;
    uint64_t nonce = nonce_offset + tid;

    uint64_t state[25];
    #pragma unroll
    for (int i = 0; i < 25; ++i) {
        state[i] = base_state[i];
    }

    uint32_t hi32 = (uint32_t)(nonce >> 32);
    uint32_t lo32 = (uint32_t)(nonce & 0xffffffffULL);

    uint32_t hi_be = __byte_perm(hi32, 0, 0x0123);
    uint32_t lo_be = __byte_perm(lo32, 0, 0x0123);

    // Lane 9: bytes 72..79 (hi 32 bits of nonce at 76..79)
    state[9] = ((uint64_t)hi_be << 32);

    // Lane 10: bytes 80..87 (lo 32 bits at 80..83, byte 84 = 0x01 padding)
    state[10] = (uint64_t)lo_be | (0x01ULL << 32);

    // Lane 16: byte 135 has 0x80 padding
    state[16] = 0x8000000000000000ULL;

    keccak_f1600(state);

    // Compare first 32 bytes (big endian) against target
    uint64_t h0 = __builtin_bswap64(state[0]);
    uint64_t h1 = __builtin_bswap64(state[1]);
    uint64_t h2 = __builtin_bswap64(state[2]);
    uint64_t h3 = __builtin_bswap64(state[3]);

    bool valid = false;
    if (h0 < target_w0) valid = true;
    else if (h0 == target_w0) {
        if (h1 < target_w1) valid = true;
        else if (h1 == target_w1) {
            if (h2 < target_w2) valid = true;
            else if (h2 == target_w2) {
                if (h3 <= target_w3) valid = true;
            }
        }
    }

    if (valid) {
        if (atomicExch(d_found, 1) == 0) {
            *d_sol_nonce = nonce;
            for (int l = 0; l < 4; ++l) {
                uint64_t w = state[l];
                for (int b = 0; b < 8; ++b) {
                    d_sol_hash[l * 8 + b] = (uint8_t)(w >> (b * 8));
                }
            }
        }
    }
}

static uint8_t hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

static std::vector<uint8_t> hex_to_bytes(std::string hex) {
    if (hex.substr(0, 2) == "0x" || hex.substr(0, 2) == "0X") hex = hex.substr(2);
    if (hex.length() % 2 != 0) hex = "0" + hex;
    std::vector<uint8_t> bytes(hex.length() / 2);
    for (size_t i = 0; i < bytes.size(); ++i) {
        bytes[i] = (hex_val(hex[i * 2]) << 4) | hex_val(hex[i * 2 + 1]);
    }
    return bytes;
}

// Global atomic flag to stop all GPUs once one finds a nonce
std::atomic<bool> g_solution_found(false);
std::atomic<uint64_t> g_total_hashes(0);
uint64_t g_winning_nonce = 0;
uint8_t g_winning_hash[32] = {0};

void gpu_worker(
    int device_id,
    const uint64_t* h_base_state,
    uint64_t target_w0, uint64_t target_w1, uint64_t target_w2, uint64_t target_w3,
    uint64_t start_nonce_for_gpu
) {
    cudaSetDevice(device_id);

    uint64_t* d_base_state;
    uint32_t* d_found;
    uint64_t* d_sol_nonce;
    uint8_t* d_sol_hash;

    cudaMalloc(&d_base_state, 25 * sizeof(uint64_t));
    cudaMalloc(&d_found, sizeof(uint32_t));
    cudaMalloc(&d_sol_nonce, sizeof(uint64_t));
    cudaMalloc(&d_sol_hash, 32 * sizeof(uint8_t));

    cudaMemcpy(d_base_state, h_base_state, 25 * sizeof(uint64_t), cudaMemcpyHostToDevice);
    cudaMemset(d_found, 0, sizeof(uint32_t));

    const int threads_per_block = 512;
    const int num_blocks = 4096;
    const uint64_t batch_hashes = (uint64_t)num_blocks * threads_per_block; // ~2.1M hashes per step

    uint64_t current_nonce = start_nonce_for_gpu;

    while (!g_solution_found.load(std::memory_order_relaxed)) {
        mine_kernel<<<num_blocks, threads_per_block>>>(
            d_base_state,
            target_w0, target_w1, target_w2, target_w3,
            current_nonce,
            d_found,
            d_sol_nonce,
            d_sol_hash
        );
        cudaDeviceSynchronize();

        current_nonce += batch_hashes;
        g_total_hashes.fetch_add(batch_hashes, std::memory_order_relaxed);

        uint32_t h_found = 0;
        cudaMemcpy(&h_found, d_found, sizeof(uint32_t), cudaMemcpyDeviceToHost);

        if (h_found) {
            bool expected = false;
            if (g_solution_found.compare_exchange_strong(expected, true)) {
                cudaMemcpy(&g_winning_nonce, d_sol_nonce, sizeof(uint64_t), cudaMemcpyDeviceToHost);
                cudaMemcpy(g_winning_hash, d_sol_hash, 32 * sizeof(uint8_t), cudaMemcpyDeviceToHost);
            }
            break;
        }
    }

    cudaFree(d_base_state);
    cudaFree(d_found);
    cudaFree(d_sol_nonce);
    cudaFree(d_sol_hash);
}

int main(int argc, char* argv[]) {
    if (argc < 4) {
        std::cerr << "Usage: " << argv[0] << " <seed_hex> <sender_hex> <target_hex> [start_nonce]" << std::endl;
        return 1;
    }

    int device_count = 0;
    cudaGetDeviceCount(&device_count);
    if (device_count == 0) {
        std::cerr << "Error: No CUDA GPUs detected!" << std::endl;
        return 1;
    }

    std::string seed_str = argv[1];
    std::string sender_str = argv[2];
    std::string target_str = argv[3];
    uint64_t base_start_nonce = (argc >= 5) ? std::stoull(argv[4]) : 1ULL;

    std::vector<uint8_t> seed = hex_to_bytes(seed_str);
    std::vector<uint8_t> sender = hex_to_bytes(sender_str);
    std::vector<uint8_t> target = hex_to_bytes(target_str);

    while (seed.size() < 32) seed.insert(seed.begin(), 0);
    while (sender.size() < 20) sender.insert(sender.begin(), 0);
    while (target.size() < 32) target.insert(target.begin(), 0);

    uint8_t block[136] = {0};
    memcpy(block, seed.data(), 32);
    memcpy(block + 32, sender.data(), 20);

    uint64_t h_base_state[25] = {0};
    for (int l = 0; l < 17; ++l) {
        uint64_t w = 0;
        for (int b = 0; b < 8; ++b) {
            w |= ((uint64_t)block[l * 8 + b]) << (b * 8);
        }
        h_base_state[l] = w;
    }

    uint64_t target_w[4] = {0};
    for (int i = 0; i < 4; ++i) {
        uint64_t w = 0;
        for (int b = 0; b < 8; ++b) {
            w = (w << 8) | target[i * 8 + b];
        }
        target_w[i] = w;
    }

    std::cerr << "[PRSPCT Miner] Detected " << device_count << " NVIDIA CUDA GPU(s)!" << std::endl;
    for (int d = 0; d < device_count; ++d) {
        cudaDeviceProp prop;
        cudaGetDeviceProperties(&prop, d);
        std::cerr << "  GPU #" << d << ": " << prop.name << " (" << prop.multiProcessorCount << " SMs)" << std::endl;
    }

    auto start_time = std::chrono::high_resolution_clock::now();
    g_solution_found.store(false);
    g_total_hashes.store(0);

    // Launch worker thread per GPU with distinct partition
    const uint64_t partition_stride = 100000000000ULL; // 100 Billion per GPU
    std::vector<std::thread> threads;
    for (int d = 0; d < device_count; ++d) {
        uint64_t gpu_nonce = base_start_nonce + (uint64_t)d * partition_stride;
        threads.emplace_back(
            gpu_worker,
            d,
            h_base_state,
            target_w[0], target_w[1], target_w[2], target_w[3],
            gpu_nonce
        );
    }

    // Progress display thread
    while (!g_solution_found.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        auto now = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double>(now - start_time).count();
        double total_h = (double)g_total_hashes.load();
        double hashrate_gh = (total_h / elapsed) / 1e9;
        std::cerr << "[Mining] Hashrate: " << hashrate_gh << " GH/s across " << device_count
                  << " GPUs | Tested: " << (total_h / 1e9) << "B hashes\r" << std::flush;
    }

    for (auto& t : threads) {
        if (t.joinable()) t.join();
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double total_sec = std::chrono::duration<double>(end_time - start_time).count();

    char hash_hex[67];
    hash_hex[0] = '0'; hash_hex[1] = 'x';
    const char hex_chars[] = "0123456789abcdef";
    for (int i = 0; i < 32; ++i) {
        hash_hex[2 + i * 2] = hex_chars[(g_winning_hash[i] >> 4) & 0xf];
        hash_hex[2 + i * 2 + 1] = hex_chars[g_winning_hash[i] & 0xf];
    }
    hash_hex[66] = '\0';

    std::cout << "\n{\"found\":true,\"nonce\":\"" << g_winning_nonce << "\",\"hash\":\""
              << hash_hex << "\",\"hashes\":" << g_total_hashes.load()
              << ",\"devices\":" << device_count
              << ",\"elapsed\":" << total_sec << "}" << std::endl;

    return 0;
}
