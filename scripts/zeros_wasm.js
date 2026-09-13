/* @ts-self-types="./zeros_wasm.d.ts" */

/**
 * Результат одного прокручивания. Отдельная структура, а не JSON-объект:
 * без serde бандл меньше, а поля читаются из JS как обычные геттеры.
 */
export class StepResult {
    static __wrap(ptr) {
        const obj = Object.create(StepResult.prototype);
        obj.__wbg_ptr = ptr;
        StepResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StepResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stepresult_free(ptr, 0);
    }
    /**
     * Лучший хэш, 0x-hex. Пустая строка, пока ничего не найдено.
     * @returns {string}
     */
    get hash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.stepresult_hash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Сколько хэшей прокручено этим вызовом — для расчёта хешрейта в UI.
     * @returns {number}
     */
    get hashed() {
        const ret = wasm.stepresult_hashed(this.__wbg_ptr);
        return ret;
    }
    /**
     * Улучшился ли рекорд именно на этом вызове.
     * @returns {boolean}
     */
    get improved() {
        const ret = wasm.stepresult_improved(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Нонс лучшего хэша, десятичный — его же передавать в `mint(epoch, nonce)`.
     * @returns {string}
     */
    get nonce() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.stepresult_nonce(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get tier() {
        const ret = wasm.stepresult_tier(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get tierName() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.stepresult_tierName(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Пройдёт ли лучший хэш проверку `mint` при текущей сложности.
     * @returns {boolean}
     */
    get valid() {
        const ret = wasm.stepresult_valid(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get zeros() {
        const ret = wasm.stepresult_zeros(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) StepResult.prototype[Symbol.dispose] = StepResult.prototype.free;

export class ZerosMiner {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ZerosMinerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_zerosminer_free(ptr, 0);
    }
    /**
     * Текущий лучший результат без прокручивания — для восстановления UI.
     * @returns {StepResult}
     */
    best() {
        const ret = wasm.zerosminer_best(this.__wbg_ptr);
        return StepResult.__wrap(ret);
    }
    /**
     * Нонс, на котором остановились — можно сохранить и продолжить позже.
     * @returns {string}
     */
    get currentNonce() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.zerosminer_currentNonce(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * `seed` — 0x + 64 hex (seedOf(epoch)), `addr` — 0x + 40 hex,
     * `difficulty` — десятичная строка или 0x-hex из difficulty(),
     * `start_nonce` — десятичная/0x-строка; пустая = 0.
     *
     * Стартовый нонс ОБЯЗАН быть случайным у каждой вкладки и каждого воркера,
     * иначе все посетители сайта переберут ровно один и тот же диапазон.
     * Готовую разводку даёт [`nonce_base`].
     * @param {string} seed
     * @param {string} addr
     * @param {string} difficulty
     * @param {string} start_nonce
     */
    constructor(seed, addr, difficulty, start_nonce) {
        const ptr0 = passStringToWasm0(seed, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(addr, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(difficulty, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(start_nonce, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.zerosminer_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ZerosMinerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Минимум ведущих нулей, без которого решение не примут при этой сложности.
     * @returns {number}
     */
    get requiredZeros() {
        const ret = wasm.zerosminer_requiredZeros(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Новая эпоха: меняются сид и сложность, рекорд сбрасывается.
     *
     * Пересоздавать майнер незачем — Preimage всё равно пересчитывается,
     * а вот терять позицию нонса и заново её рандомить не надо.
     * @param {string} seed
     * @param {string} difficulty
     * @param {string} addr
     */
    reseed(seed, difficulty, addr) {
        const ptr0 = passStringToWasm0(seed, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(difficulty, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(addr, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.zerosminer_reseed(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Прокрутить `iterations` хэшей и вернуть текущий лучший результат.
     *
     * Рекомендуемый размер порции — 200–500 тысяч: это десятки миллисекунд
     * в воркере, то есть UI обновляется несколько раз в секунду, а накладные
     * расходы на вызов не видны в хешрейте.
     * @param {number} iterations
     * @returns {StepResult}
     */
    run(iterations) {
        const ret = wasm.zerosminer_run(this.__wbg_ptr, iterations);
        return StepResult.__wrap(ret);
    }
    /**
     * Всего прокручено с момента создания.
     * @returns {number}
     */
    get totalHashes() {
        const ret = wasm.zerosminer_totalHashes(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) ZerosMiner.prototype[Symbol.dispose] = ZerosMiner.prototype.free;

/**
 * Число ведущих нулевых бит хэша. Та же величина, что `zerosOf` в контракте.
 * @param {string} hash
 * @returns {number}
 */
export function leadingZeros(hash) {
    const ptr0 = passStringToWasm0(hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.leadingZeros(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Проходит ли хэш проверку `uint256(hash) <= max/difficulty`.
 * @param {string} hash
 * @param {string} difficulty
 * @returns {boolean}
 */
export function meetsTarget(hash, difficulty) {
    const ptr0 = passStringToWasm0(hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(difficulty, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.meetsTarget(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Стартовый нонс с разводкой, как в CPU- и GPU-майнере:
 * старшие биты — номер устройства и воркера, дальше случайность, младшие 64 —
 * счётчик. `rand_hi`/`rand_mid` брать из `crypto.getRandomValues`.
 * @param {number} device_id
 * @param {number} worker_id
 * @param {number} rand_hi
 * @param {number} rand_mid
 * @returns {string}
 */
export function nonceBase(device_id, worker_id, rand_hi, rand_mid) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.nonceBase(device_id, worker_id, rand_hi, rand_mid);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Минимум ведущих нулей для этой сложности.
 * @param {string} difficulty
 * @returns {number}
 */
export function requiredZerosFor(difficulty) {
    const ptr0 = passStringToWasm0(difficulty, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.requiredZerosFor(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}

/**
 * Selftest ядра прямо в браузере. Возвращает отчёт или бросает исключение.
 * ПОЧЕМУ он есть и здесь: WASM собирается отдельной командой и может отстать
 * от боевого кода — без проверки расхождение всплывёт только на минте.
 * @returns {string}
 */
export function selftest() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.selftest();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * keccak256(abi.encodePacked(seed, addr, nonce)) — одиночная проверка.
 * @param {string} seed
 * @param {string} addr
 * @param {string} nonce
 * @returns {string}
 */
export function solutionHash(seed, addr, nonce) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(seed, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(addr, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(nonce, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.solutionHash(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {number} zeros
 * @returns {string}
 */
export function tierName(zeros) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.tierName(zeros);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * 0 Common, 1 Rare, 2 Epic, 3 Legendary — границы из контракта.
 * @param {number} zeros
 * @returns {number}
 */
export function tierOf(zeros) {
    const ret = wasm.tierOf(zeros);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./zeros_wasm_bg.js": import0,
    };
}

const StepResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stepresult_free(ptr, 1));
const ZerosMinerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_zerosminer_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('zeros_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
