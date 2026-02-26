// Microphone capture with professional voice processing and settings

class Microphone {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.onAudioData = null;
        this.onVoiceLevel = null; // 音量回调
        this.muted = false;
        
        // === 可调节设置 ===
        this.settings = {
            vadThreshold: 0.008,      // 语音检测阈值
            gain: 2.5,                // 麦克风增益
            hangoverFrames: 12,       // 尾部延迟帧数
            denoiseEnabled: true      // 降噪开关
        };
        
        // === VAD (Voice Activity Detection) ===
        this.isSpeaking = false;
        this.vadSmoothingFrames = 3;
        this.consecutiveVoiceFrames = 0;
        this.consecutiveSilenceFrames = 0;
        
        // === 前导缓冲 ===
        this.leadingBuffer = [];
        this.maxLeadingBuffer = 3;
        
        // === 音频处理节点 ===
        this.gainNode = null;
        
        // === 序列号 ===
        this.sequenceNumber = 0;
        
        // === Opus 编码器 ===
        this.opusEncoder = null;
        this.useOpus = true;
        
        // === 音频帧累积缓冲 (参考 SimpleVoiceChat) ===
        this.FRAME_SIZE = 960; // 20ms @ 48kHz，与 SimpleVoiceChat 一致
        this.audioBuffer = new Float32Array(0);
        
        // === RNNoise 降噪器 ===
        this.denoiser = null;
        
        // 加载保存的设置
        this.loadSettings();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('lyrical_mic_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load mic settings:', e);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('lyrical_mic_settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Failed to save mic settings:', e);
        }
    }

    setThreshold(value) {
        this.settings.vadThreshold = value;
        this.saveSettings();
    }

    setGain(value) {
        this.settings.gain = value;
        if (this.gainNode) {
            this.gainNode.gain.value = value;
        }
        this.saveSettings();
    }

    setHangover(frames) {
        this.settings.hangoverFrames = frames;
        this.saveSettings();
    }

    setDenoiseEnabled(enabled) {
        this.settings.denoiseEnabled = enabled;
        if (this.denoiser) {
            this.denoiser.setEnabled(enabled);
        }
        this.saveSettings();
    }

    isDenoiseEnabled() {
        return this.settings.denoiseEnabled && this.denoiser && this.denoiser.isEnabled();
    }

    getSettings() {
        return { ...this.settings };
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false, // 禁用浏览器降噪，使用 RNNoise
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 1
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 48000 });
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            
            // 增益节点
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.settings.gain;

            // 初始化 RNNoise 降噪器
            if (this.settings.denoiseEnabled && typeof RNNoiseProcessor !== 'undefined') {
                try {
                    this.denoiser = new RNNoiseProcessor();
                    const success = await this.denoiser.init();
                    if (success) {
                        console.log('RNNoise denoiser initialized');
                    } else {
                        this.denoiser = null;
                    }
                } catch (e) {
                    console.warn('Failed to init RNNoise denoiser:', e);
                    this.denoiser = null;
                }
            }

            // 初始化 Opus 编码器 (同步版本)
            if (this.useOpus && typeof OpusEncoderSync !== 'undefined') {
                try {
                    this.opusEncoder = new OpusEncoderSync(48000, 1);
                    await this.opusEncoder.init();
                    console.log('Opus encoder initialized');
                } catch (e) {
                    console.warn('Failed to init Opus encoder, falling back to PCM:', e);
                    this.useOpus = false;
                }
            } else {
                this.useOpus = false;
            }

            this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);
            
            this.processor.onaudioprocess = (event) => {
                if (this.muted || !this.onAudioData) return;
                this.processAudio(event.inputBuffer.getChannelData(0));
            };

            // 简化音频处理链：source -> gain -> processor
            this.source.connect(this.gainNode);
            this.gainNode.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            return true;
        } catch (error) {
            console.error('Failed to start microphone:', error);
            return false;
        }
    }

    processAudio(inputData) {
        const rms = this.calculateRMS(inputData);
        
        // 回调音量级别（用于 UI 显示）
        if (this.onVoiceLevel) {
            this.onVoiceLevel(rms, this.isSpeaking);
        }
        
        // 保存到前导缓冲（使用标准帧大小）
        const frameCopy = new Float32Array(inputData);
        this.leadingBuffer.push(frameCopy);
        if (this.leadingBuffer.length > this.maxLeadingBuffer) {
            this.leadingBuffer.shift();
        }
        
        // VAD 检测
        const hasVoice = rms > this.settings.vadThreshold;
        
        if (hasVoice) {
            this.consecutiveVoiceFrames++;
            this.consecutiveSilenceFrames = 0;
            
            if (!this.isSpeaking && this.consecutiveVoiceFrames >= this.vadSmoothingFrames) {
                this.isSpeaking = true;
                // 发送前导缓冲
                for (const frame of this.leadingBuffer) {
                    this.accumulateAndSend(frame);
                }
                this.leadingBuffer = [];
            } else if (this.isSpeaking) {
                this.accumulateAndSend(inputData);
            }
        } else {
            this.consecutiveSilenceFrames++;
            this.consecutiveVoiceFrames = 0;
            
            if (this.isSpeaking) {
                if (this.consecutiveSilenceFrames <= this.settings.hangoverFrames) {
                    this.accumulateAndSend(inputData);
                } else {
                    this.isSpeaking = false;
                    // 发送剩余缓冲（补零）
                    this.flushAudioBuffer();
                }
            }
        }
    }

    // 累积音频样本并按 FRAME_SIZE (960) 发送，参考 SimpleVoiceChat 的处理方式
    accumulateAndSend(inputData) {
        // 应用 RNNoise 降噪
        let processedData = inputData;
        if (this.denoiser && this.denoiser.isEnabled()) {
            processedData = this.denoiser.process(inputData);
            if (processedData.length === 0) {
                // 降噪器还在累积数据，等待下一帧
                return;
            }
        }
        
        // 合并新数据到缓冲
        const newBuffer = new Float32Array(this.audioBuffer.length + processedData.length);
        newBuffer.set(this.audioBuffer);
        newBuffer.set(processedData, this.audioBuffer.length);
        this.audioBuffer = newBuffer;
        
        // 当累积够 FRAME_SIZE 时发送
        while (this.audioBuffer.length >= this.FRAME_SIZE) {
            const frame = this.audioBuffer.slice(0, this.FRAME_SIZE);
            this.sendAudio(frame);
            this.audioBuffer = this.audioBuffer.slice(this.FRAME_SIZE);
        }
    }

    // 刷新剩余缓冲（语音结束时调用）
    flushAudioBuffer() {
        if (this.audioBuffer.length > 0) {
            // 补零到 FRAME_SIZE
            const frame = new Float32Array(this.FRAME_SIZE);
            frame.set(this.audioBuffer);
            this.sendAudio(frame);
            this.audioBuffer = new Float32Array(0);
        }
        // 发送空包表示语音结束 - 参考 SimpleVoiceChat 的 sendStopPacket
        this.sendStopPacket();
    }

    // 发送停止包 - 参考 SimpleVoiceChat 的 MicThread.sendStopPacket()
    sendStopPacket() {
        if (!this.onAudioData) return;
        
        // 空包：只有头部，没有音频数据
        const packet = new Uint8Array(1 + 4);
        const view = new DataView(packet.buffer);
        
        packet[0] = this.useOpus ? 0x01 : 0x00; // 保持格式一致
        view.setUint32(1, this.sequenceNumber++, false);
        // 没有音频数据，payload 长度为 0
        
        this.onAudioData(packet.buffer);
    }

    calculateRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }

    sendAudio(inputData) {
        if (this.useOpus && this.opusEncoder) {
            // Opus 编码 - 同步
            const encoded = this.opusEncoder.encode(inputData);
            if (encoded) {
                const packet = new Uint8Array(1 + 4 + encoded.length);
                const view = new DataView(packet.buffer);
                packet[0] = 0x01; // Opus format
                view.setUint32(1, this.sequenceNumber++, false);
                packet.set(encoded, 5);
                this.onAudioData(packet.buffer);
            }
        } else {
            // PCM 原始数据
            const int16Data = this.float32ToInt16(inputData);
            const audioPayload = new Uint8Array(int16Data.buffer);
            
            const packet = new Uint8Array(1 + 4 + audioPayload.length);
            const view = new DataView(packet.buffer);
            
            packet[0] = 0x00; // PCM format
            view.setUint32(1, this.sequenceNumber++, false);
            packet.set(audioPayload, 5);
            
            this.onAudioData(packet.buffer);
        }
    }

    float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            // 简单的转换，参考 simple-voice-chat
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = Math.round(s * 32767);
        }
        return int16Array;
    }

    setMuted(muted) {
        this.muted = muted;
        if (muted) {
            this.isSpeaking = false;
            this.consecutiveVoiceFrames = 0;
            this.consecutiveSilenceFrames = 0;
            this.leadingBuffer = [];
            this.audioBuffer = new Float32Array(0);
        }
    }

    stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.opusEncoder) {
            this.opusEncoder.destroy();
            this.opusEncoder = null;
        }
        if (this.denoiser) {
            this.denoiser.destroy();
            this.denoiser = null;
        }
        this.audioBuffer = new Float32Array(0);
    }
}

const microphone = new Microphone();
