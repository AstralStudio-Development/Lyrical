// Opus 编解码器封装 - 使用 @geut/opus 库

let opusEncoderModule = null;
let opusDecoderModule = null;

// 加载编码器模块
async function loadOpusEncoder() {
    if (opusEncoderModule) return opusEncoderModule;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/lib/opus-encoder.js';
        script.onload = () => {
            if (typeof Opus !== 'undefined') {
                Opus().then(module => {
                    opusEncoderModule = module;
                    resolve(module);
                }).catch(reject);
            } else {
                reject(new Error('Opus encoder not loaded'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 加载解码器模块
async function loadOpusDecoder() {
    if (opusDecoderModule) return opusDecoderModule;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/lib/opus-decoder.js';
        script.onload = () => {
            // 解码器模块可能用不同的名字
            const OpusDecoder = window.OpusDecoderModule || window.Opus;
            if (OpusDecoder) {
                OpusDecoder().then(module => {
                    opusDecoderModule = module;
                    resolve(module);
                }).catch(reject);
            } else {
                reject(new Error('Opus decoder not loaded'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

class OpusEncoderSync {
    constructor(sampleRate = 48000, channels = 1, application = 2048) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.application = application; // 2048 = VOIP
        this.frameSize = 960; // 20ms at 48kHz，与 SimpleVoiceChat 一致
        this.encoder = null;
        this.module = null;
        this.inputPtr = null;
        this.outputPtr = null;
    }

    async init() {
        this.module = await loadOpusEncoder();
        
        const errorPtr = this.module._malloc(4);
        this.encoder = this.module._opus_encoder_create(
            this.sampleRate,
            this.channels,
            this.application,
            errorPtr
        );
        
        const error = this.module.getValue(errorPtr, 'i32');
        this.module._free(errorPtr);
        
        if (error !== 0 || !this.encoder) {
            throw new Error('Failed to create Opus encoder: ' + error);
        }

        // 设置比特率 (OPUS_SET_BITRATE = 4002)
        // 参考 SimpleVoiceChat，不显式设置比特率，使用默认值
        // this.module._opus_encoder_ctl(this.encoder, 4002, 32000);
        
        // 启用 FEC (OPUS_SET_INBAND_FEC = 4012)
        this.module._opus_encoder_ctl(this.encoder, 4012, 1);
        
        // 设置丢包率 (OPUS_SET_PACKET_LOSS_PERC = 4014)，参考 SimpleVoiceChat 设为 5%
        this.module._opus_encoder_ctl(this.encoder, 4014, 5);
        
        // 分配输入输出缓冲区
        this.inputPtr = this.module._malloc(this.frameSize * 4); // float32
        this.outputPtr = this.module._malloc(1024); // max opus frame，参考 SimpleVoiceChat 的 DEFAULT_MAX_PAYLOAD_SIZE
        
        console.log('Opus encoder created successfully');
    }

    encode(float32Data) {
        if (!this.encoder || !this.module) return null;
        
        // 确保输入数据长度正确
        if (float32Data.length !== this.frameSize) {
            console.warn('Opus encode: input size mismatch', float32Data.length, 'vs', this.frameSize);
        }
        
        // 复制输入数据到 WASM 内存
        const inputHeap = new Float32Array(
            this.module.HEAPF32.buffer,
            this.inputPtr,
            this.frameSize
        );
        
        // 只复制 frameSize 个样本
        const samplesToEncode = Math.min(float32Data.length, this.frameSize);
        for (let i = 0; i < samplesToEncode; i++) {
            inputHeap[i] = float32Data[i];
        }
        // 填充剩余部分为 0
        for (let i = samplesToEncode; i < this.frameSize; i++) {
            inputHeap[i] = 0;
        }

        const encodedLength = this.module._opus_encode_float(
            this.encoder,
            this.inputPtr,
            this.frameSize,
            this.outputPtr,
            1024
        );

        if (encodedLength < 0) {
            console.error('Opus encode error:', encodedLength);
            return null;
        }

        // 复制编码后的数据
        const result = new Uint8Array(encodedLength);
        for (let i = 0; i < encodedLength; i++) {
            result[i] = this.module.HEAPU8[this.outputPtr + i];
        }

        return result;
    }

    destroy() {
        if (this.module) {
            if (this.encoder) {
                this.module._opus_encoder_destroy(this.encoder);
                this.encoder = null;
            }
            if (this.inputPtr) {
                this.module._free(this.inputPtr);
                this.inputPtr = null;
            }
            if (this.outputPtr) {
                this.module._free(this.outputPtr);
                this.outputPtr = null;
            }
        }
    }
}

class OpusDecoderSync {
    constructor(sampleRate = 48000, channels = 1) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.frameSize = 960; // 20ms at 48kHz，与 SimpleVoiceChat 一致
        this.decoder = null;
        this.module = null;
        this.inputPtr = null;
        this.outputPtr = null;
    }

    async init() {
        this.module = await loadOpusDecoder();
        
        const errorPtr = this.module._malloc(4);
        this.decoder = this.module._opus_decoder_create(
            this.sampleRate,
            this.channels,
            errorPtr
        );

        const error = this.module.getValue(errorPtr, 'i32');
        this.module._free(errorPtr);

        if (error !== 0 || !this.decoder) {
            throw new Error('Failed to create Opus decoder: ' + error);
        }

        // 分配缓冲区
        this.inputPtr = this.module._malloc(1024); // 与编码器的 max payload size 一致
        this.outputPtr = this.module._malloc(this.frameSize * 4); // float32
        
        console.log('Opus decoder created successfully');
    }

    /**
     * 正常解码 - 参考 SimpleVoiceChat 的 decode(data) with fec=false
     */
    decode(opusData) {
        if (!this.decoder || !this.module) return null;

        // 复制 Opus 数据到 WASM 内存
        for (let i = 0; i < opusData.length; i++) {
            this.module.HEAPU8[this.inputPtr + i] = opusData[i];
        }

        // fec = 0 表示正常解码
        const decodedSamples = this.module._opus_decode_float(
            this.decoder,
            this.inputPtr,
            opusData.length,
            this.outputPtr,
            this.frameSize,
            0  // fec = 0
        );

        if (decodedSamples < 0) {
            console.error('Opus decode error:', decodedSamples);
            return null;
        }

        // 复制解码后的数据
        const result = new Float32Array(decodedSamples);
        const outputHeap = new Float32Array(
            this.module.HEAPF32.buffer,
            this.outputPtr,
            decodedSamples
        );
        result.set(outputHeap);

        return result;
    }

    /**
     * FEC 解码 - 参考 SimpleVoiceChat 的 decode(data) with fec=true
     * 使用当前包的 FEC 数据恢复前一个丢失的包
     */
    decodeFEC(opusData) {
        if (!this.decoder || !this.module) return null;

        // 复制 Opus 数据到 WASM 内存
        for (let i = 0; i < opusData.length; i++) {
            this.module.HEAPU8[this.inputPtr + i] = opusData[i];
        }

        // fec = 1 表示使用 FEC 解码
        const decodedSamples = this.module._opus_decode_float(
            this.decoder,
            this.inputPtr,
            opusData.length,
            this.outputPtr,
            this.frameSize,
            1  // fec = 1
        );

        if (decodedSamples < 0) {
            console.error('Opus decode FEC error:', decodedSamples);
            return null;
        }

        // 复制解码后的数据
        const result = new Float32Array(decodedSamples);
        const outputHeap = new Float32Array(
            this.module.HEAPF32.buffer,
            this.outputPtr,
            decodedSamples
        );
        result.set(outputHeap);

        return result;
    }

    /**
     * PLC 解码 - 参考 SimpleVoiceChat 的 decode(null)
     * 当没有数据时，让解码器生成补偿音频
     */
    decodePLC() {
        if (!this.decoder || !this.module) return null;

        // 传入 null/0 表示丢包，让解码器进行 PLC
        const decodedSamples = this.module._opus_decode_float(
            this.decoder,
            0,      // null pointer
            0,      // 0 length
            this.outputPtr,
            this.frameSize,
            0       // fec = 0 for PLC
        );

        if (decodedSamples < 0) {
            console.error('Opus decode PLC error:', decodedSamples);
            return null;
        }

        // 复制解码后的数据
        const result = new Float32Array(decodedSamples);
        const outputHeap = new Float32Array(
            this.module.HEAPF32.buffer,
            this.outputPtr,
            decodedSamples
        );
        result.set(outputHeap);

        return result;
    }

    /**
     * 重置解码器状态 - 参考 SimpleVoiceChat 的 decoder.resetState()
     */
    resetState() {
        if (!this.decoder || !this.module) return;
        
        // OPUS_RESET_STATE = 4028
        this.module._opus_decoder_ctl(this.decoder, 4028);
    }

    destroy() {
        if (this.module) {
            if (this.decoder) {
                this.module._opus_decoder_destroy(this.decoder);
                this.decoder = null;
            }
            if (this.inputPtr) {
                this.module._free(this.inputPtr);
                this.inputPtr = null;
            }
            if (this.outputPtr) {
                this.module._free(this.outputPtr);
                this.outputPtr = null;
            }
        }
    }
}

// 导出
window.OpusEncoderSync = OpusEncoderSync;
window.OpusDecoderSync = OpusDecoderSync;
