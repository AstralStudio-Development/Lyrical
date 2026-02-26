// RNNoise 降噪模块
// 使用 @jitsi/rnnoise-wasm 库

/**
 * RNNoise 降噪处理器
 * RNNoise 要求输入是 48kHz 单声道，帧大小为 480 样本 (10ms)
 */
class RNNoiseProcessor {
    constructor() {
        this.module = null;
        this.state = null;
        this.pcmInputIndex = null;
        this.pcmOutputIndex = null;
        this.frameSize = 480; // RNNoise 固定帧大小 10ms @ 48kHz
        this.enabled = true;
        this.initialized = false;
        
        // 用于累积样本的缓冲区
        this.inputBuffer = new Float32Array(0);
    }

    async init() {
        try {
            // 从本地加载 @jitsi/rnnoise-wasm
            this.module = await this.loadRNNoiseWasm();
            
            // 创建降噪状态
            this.state = this.module._rnnoise_create(0);
            if (!this.state) {
                throw new Error('Failed to create RNNoise state');
            }
            
            // 分配 WASM 内存 (480 samples * 4 bytes per float)
            const bufferBytes = this.frameSize * 4;
            this.pcmInputIndex = this.module._malloc(bufferBytes);
            this.pcmOutputIndex = this.module._malloc(bufferBytes);
            
            if (!this.pcmInputIndex || !this.pcmOutputIndex) {
                throw new Error('Failed to allocate WASM memory');
            }
            
            this.initialized = true;
            console.log('RNNoise processor initialized successfully');
            return true;
        } catch (e) {
            console.warn('Failed to init RNNoise:', e);
            this.initialized = false;
            return false;
        }
    }

    async loadRNNoiseWasm() {
        try {
            // 获取基础路径
            const basePath = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
            
            // 使用动态 import 加载 ES Module
            const rnnoiseModule = await import(basePath + '/js/lib/rnnoise/rnnoise.js');
            const createRNNWasmModule = rnnoiseModule.default;
            
            const module = await createRNNWasmModule({
                locateFile: (path) => basePath + '/js/lib/rnnoise/' + path
            });
            
            return module;
        } catch (e) {
            console.error('Failed to load RNNoise:', e);
            throw e;
        }
    }

    /**
     * 处理音频数据
     * @param {Float32Array} input - 输入音频 (48kHz, 单声道, 范围 -1 到 1)
     * @returns {Float32Array} - 降噪后的音频
     */
    process(input) {
        if (!this.enabled || !this.initialized || !this.state) {
            return input;
        }

        // 累积输入
        const newBuffer = new Float32Array(this.inputBuffer.length + input.length);
        newBuffer.set(this.inputBuffer);
        newBuffer.set(input, this.inputBuffer.length);
        this.inputBuffer = newBuffer;

        // 处理完整的帧
        const outputFrames = [];
        
        while (this.inputBuffer.length >= this.frameSize) {
            const frame = this.inputBuffer.slice(0, this.frameSize);
            this.inputBuffer = this.inputBuffer.slice(this.frameSize);
            
            const processedFrame = this.processFrame(frame);
            outputFrames.push(processedFrame);
        }

        // 合并输出
        if (outputFrames.length === 0) {
            return new Float32Array(0);
        }

        const totalLength = outputFrames.reduce((sum, f) => sum + f.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const frame of outputFrames) {
            result.set(frame, offset);
            offset += frame.length;
        }

        return result;
    }

    /**
     * 处理单个帧 (480 样本)
     */
    processFrame(frame) {
        try {
            // 将输入数据复制到 WASM 内存
            // RNNoise 期望输入范围是 -32768 到 32767
            const inputView = new Float32Array(
                this.module.HEAPF32.buffer,
                this.pcmInputIndex,
                this.frameSize
            );
            
            for (let i = 0; i < this.frameSize; i++) {
                inputView[i] = frame[i] * 32767;
            }

            // 调用 RNNoise 处理
            this.module._rnnoise_process_frame(
                this.state,
                this.pcmOutputIndex,
                this.pcmInputIndex
            );

            // 读取输出并转换回 -1 到 1 范围
            const outputView = new Float32Array(
                this.module.HEAPF32.buffer,
                this.pcmOutputIndex,
                this.frameSize
            );
            
            const result = new Float32Array(this.frameSize);
            for (let i = 0; i < this.frameSize; i++) {
                result[i] = outputView[i] / 32767;
            }

            return result;
        } catch (e) {
            console.error('RNNoise processFrame error:', e);
            return frame;
        }
    }

    /**
     * 刷新缓冲区
     */
    flush() {
        if (this.inputBuffer.length === 0) {
            return new Float32Array(0);
        }

        const remaining = this.inputBuffer.length;
        const paddedFrame = new Float32Array(this.frameSize);
        paddedFrame.set(this.inputBuffer);
        this.inputBuffer = new Float32Array(0);

        const processed = this.processFrame(paddedFrame);
        return processed.slice(0, remaining);
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        console.log('RNNoise', enabled ? 'enabled' : 'disabled');
    }

    isEnabled() {
        return this.enabled && this.initialized;
    }

    destroy() {
        if (this.module) {
            if (this.state) {
                try {
                    this.module._rnnoise_destroy(this.state);
                } catch (e) {}
                this.state = null;
            }
            if (this.pcmInputIndex) {
                try {
                    this.module._free(this.pcmInputIndex);
                } catch (e) {}
                this.pcmInputIndex = null;
            }
            if (this.pcmOutputIndex) {
                try {
                    this.module._free(this.pcmOutputIndex);
                } catch (e) {}
                this.pcmOutputIndex = null;
            }
        }
        this.inputBuffer = new Float32Array(0);
        this.initialized = false;
    }
}

// 导出
window.RNNoiseProcessor = RNNoiseProcessor;
