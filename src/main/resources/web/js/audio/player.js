// Professional audio playback with jitter buffer and packet loss concealment
// 参考 SimpleVoiceChat 的 AudioChannel 和 AudioPacketBuffer 实现

const FRAME_SIZE = 960; // 20ms @ 48kHz，与 SimpleVoiceChat 一致
const FRAME_DURATION = 0.02; // 20ms

class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.players = new Map(); // uuid -> PlayerAudio
        this.deafened = false;
        this.listenerPosition = { x: 0, y: 0, z: 0 };
        this.listenerYaw = 0;
    }

    async init() {
        this.audioContext = new AudioContext({ sampleRate: 48000 });
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
    }

    setVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
        }
    }

    setPlayerVolume(uuid, volume) {
        const playerAudio = this.players.get(uuid);
        if (playerAudio) {
            playerAudio.setIndividualVolume(volume);
        }
        // 保存设置以便后续使用
        if (!this.playerVolumes) {
            this.playerVolumes = new Map();
        }
        this.playerVolumes.set(uuid, volume);
    }

    updateListenerPosition(x, y, z, yaw) {
        this.listenerPosition = { x, y, z };
        this.listenerYaw = yaw;

        if (this.audioContext) {
            const listener = this.audioContext.listener;
            listener.positionX.setValueAtTime(x, this.audioContext.currentTime);
            listener.positionY.setValueAtTime(y, this.audioContext.currentTime);
            listener.positionZ.setValueAtTime(z, this.audioContext.currentTime);

            const yawRad = (yaw * Math.PI) / 180;
            listener.forwardX.setValueAtTime(-Math.sin(yawRad), this.audioContext.currentTime);
            listener.forwardY.setValueAtTime(0, this.audioContext.currentTime);
            listener.forwardZ.setValueAtTime(Math.cos(yawRad), this.audioContext.currentTime);
            listener.upX.setValueAtTime(0, this.audioContext.currentTime);
            listener.upY.setValueAtTime(1, this.audioContext.currentTime);
            listener.upZ.setValueAtTime(0, this.audioContext.currentTime);
        }
    }

    playAudio(senderUuid, audioData, volume, position) {
        if (this.deafened || !this.audioContext) return;

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        let playerAudio = this.players.get(senderUuid);
        if (!playerAudio) {
            playerAudio = new PlayerAudio(this.audioContext, this.masterGain);
            this.players.set(senderUuid, playerAudio);
        }

        if (position) {
            playerAudio.setPosition(position.x, position.y, position.z);
        }
        playerAudio.setVolume(volume);

        // Parse packet: [1 byte format] [4 bytes sequence] [audio data]
        const dataView = new DataView(audioData);
        const format = dataView.getUint8(0);
        const sequence = dataView.getUint32(1, false);
        const payload = audioData.slice(5);

        playerAudio.addPacket(sequence, format, payload);
    }

    setDeafened(deafened) {
        this.deafened = deafened;
    }

    removePlayer(uuid) {
        const playerAudio = this.players.get(uuid);
        if (playerAudio) {
            playerAudio.dispose();
            this.players.delete(uuid);
        }
    }

    dispose() {
        for (const playerAudio of this.players.values()) {
            playerAudio.dispose();
        }
        this.players.clear();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

/**
 * AudioPacketBuffer - 参考 SimpleVoiceChat 的 AudioPacketBuffer
 * 处理乱序到达的包，按序列号重排序
 */
class AudioPacketBuffer {
    constructor(packetThreshold = 3) {
        this.packetThreshold = packetThreshold; // 最多等待多少个包来重排序
        this.packetBuffer = [];
        this.lastSequenceNumber = -1;
        this.isFlushingBuffer = false;
    }

    /**
     * 添加包到缓冲区，返回可以播放的包（按顺序）
     */
    addPacket(packet) {
        const result = [];
        
        if (this.packetThreshold <= 0) {
            // 禁用重排序，直接返回
            result.push(packet);
            return result;
        }

        // 检查是否是下一个期望的包
        if (packet.sequence === this.lastSequenceNumber + 1 || this.lastSequenceNumber < 0) {
            this.lastSequenceNumber = packet.sequence;
            result.push(packet);
            
            // 检查缓冲区中是否有后续的包
            while (this.packetBuffer.length > 0) {
                const nextPacket = this.getNextInOrder();
                if (nextPacket) {
                    result.push(nextPacket);
                } else {
                    break;
                }
            }
        } else {
            // 乱序包，加入缓冲区
            this.addSorted(packet);
        }

        // 如果缓冲区超过阈值，强制输出
        while (this.packetBuffer.length > this.packetThreshold) {
            const forcedPacket = this.packetBuffer.shift();
            this.lastSequenceNumber = forcedPacket.sequence;
            result.push(forcedPacket);
        }

        return result;
    }

    addSorted(packet) {
        // 空包表示语音结束
        if (packet.payload.byteLength === 0) {
            this.isFlushingBuffer = true;
        }
        this.packetBuffer.push(packet);
        this.packetBuffer.sort((a, b) => a.sequence - b.sequence);
    }

    getNextInOrder() {
        if (this.packetBuffer.length === 0) return null;
        
        const first = this.packetBuffer[0];
        if (first.sequence === this.lastSequenceNumber + 1) {
            this.packetBuffer.shift();
            this.lastSequenceNumber = first.sequence;
            return first;
        }
        return null;
    }

    /**
     * 刷新缓冲区，返回所有剩余的包
     */
    flush() {
        const result = [...this.packetBuffer];
        this.packetBuffer = [];
        if (result.length > 0) {
            this.lastSequenceNumber = result[result.length - 1].sequence;
        }
        this.isFlushingBuffer = false;
        return result;
    }

    clear() {
        this.packetBuffer = [];
        this.lastSequenceNumber = -1;
        this.isFlushingBuffer = false;
    }
}

class PlayerAudio {
    constructor(audioContext, masterGain) {
        this.audioContext = audioContext;
        
        // 音频处理链
        this.gainNode = audioContext.createGain();
        this.pannerNode = audioContext.createPanner();
        
        // 3D 空间音频配置
        this.pannerNode.panningModel = 'HRTF';
        this.pannerNode.distanceModel = 'linear';
        this.pannerNode.maxDistance = 48;
        this.pannerNode.refDistance = 1;
        this.pannerNode.rolloffFactor = 1;

        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(masterGain);

        // 个人音量设置
        this.individualVolume = 1.0;
        this.distanceVolume = 1.0;

        // === 参考 SimpleVoiceChat 的配置 ===
        // AudioPacketBuffer - 乱序包重排序
        this.packetBuffer = new AudioPacketBuffer(3); // audioPacketThreshold = 3
        
        // 输出缓冲区 - 用于平滑播放
        this.outputBuffer = []; // 待播放的解码后音频帧
        this.outputBufferSize = 5; // outputBufferSize = 5 (100ms)
        
        // 播放状态
        this.nextPlayTime = 0;
        this.lastSequenceNumber = -1;
        this.isPlaying = false;
        this.playbackTimer = null;
        
        // Opus 解码器
        this.opusDecoder = null;
        this.initOpusDecoder();
    }

    async initOpusDecoder() {
        if (typeof OpusDecoderSync !== 'undefined') {
            try {
                this.opusDecoder = new OpusDecoderSync(48000, 1);
                await this.opusDecoder.init();
                console.log('Opus decoder initialized for player');
            } catch (e) {
                console.warn('Failed to init Opus decoder:', e);
                this.opusDecoder = null;
            }
        }
    }

    setPosition(x, y, z) {
        const now = this.audioContext.currentTime;
        this.pannerNode.positionX.setTargetAtTime(x, now, 0.1);
        this.pannerNode.positionY.setTargetAtTime(y, now, 0.1);
        this.pannerNode.positionZ.setTargetAtTime(z, now, 0.1);
    }

    setVolume(volume) {
        this.distanceVolume = volume;
        this.updateGain();
    }

    setIndividualVolume(volume) {
        this.individualVolume = volume;
        this.updateGain();
    }

    updateGain() {
        const finalVolume = this.distanceVolume * this.individualVolume;
        this.gainNode.gain.setTargetAtTime(finalVolume, this.audioContext.currentTime, 0.1);
    }

    addPacket(sequence, format, payload) {
        const packet = { sequence, format, payload };
        
        // 通过 AudioPacketBuffer 处理乱序包
        const orderedPackets = this.packetBuffer.addPacket(packet);
        
        for (const p of orderedPackets) {
            this.processPacket(p);
        }
    }

    processPacket(packet) {
        const { sequence, format, payload } = packet;
        
        // 空包处理 - 参考 SimpleVoiceChat
        if (payload.byteLength === 0) {
            // 语音结束，刷新缓冲区并重置状态
            this.flushAndReset();
            return;
        }

        // 跳过过旧的包
        if (this.lastSequenceNumber >= 0 && sequence <= this.lastSequenceNumber) {
            return;
        }

        // 计算丢失的包数量 - 参考 SimpleVoiceChat 的 packetsToCompensate
        let packetsToCompensate = 0;
        if (this.lastSequenceNumber >= 0) {
            packetsToCompensate = sequence - (this.lastSequenceNumber + 1);
            
            // 如果丢失太多包，重置解码器
            if (packetsToCompensate > this.outputBufferSize) {
                console.debug('Skipping compensation for', packetsToCompensate, 'packets');
                packetsToCompensate = 0;
                this.resetDecoder();
            } else if (packetsToCompensate > 0) {
                console.debug('Compensating', packetsToCompensate, 'packet(s)');
            }
        }

        this.lastSequenceNumber = sequence;

        // 解码音频 - 使用 FEC 补偿丢失的包
        const decodedFrames = this.decodeWithFEC(format, payload, packetsToCompensate + 1);
        
        for (const frame of decodedFrames) {
            this.outputBuffer.push(frame);
        }

        // 开始播放（如果缓冲足够）
        if (!this.isPlaying && this.outputBuffer.length >= this.outputBufferSize) {
            this.startPlayback();
        }
    }

    /**
     * 使用 FEC 解码 - 参考 SimpleVoiceChat 的 decoder.decode(data, frames)
     * @param format 音频格式
     * @param payload 音频数据
     * @param frames 需要解码的帧数（包括丢失的包）
     */
    decodeWithFEC(format, payload, frames) {
        const result = [];
        
        if (format === 0x01 && this.opusDecoder) {
            // Opus 解码
            const opusData = new Uint8Array(payload);
            
            if (frames <= 1) {
                // 没有丢包，正常解码
                const decoded = this.opusDecoder.decode(opusData);
                if (decoded) {
                    result.push(decoded);
                }
            } else {
                // 有丢包，使用 FEC 补偿
                // 参考 JavaOpusDecoderImpl.decode(byte[] data, int frames)
                
                // 前 frames-2 个包：使用 PLC（传 null 给解码器）
                for (let i = 0; i < frames - 2; i++) {
                    const plcFrame = this.opusDecoder.decodePLC();
                    if (plcFrame) {
                        result.push(plcFrame);
                    }
                }
                
                // 倒数第二个包：使用 FEC 解码（decode with FEC flag）
                if (frames > 1) {
                    const fecFrame = this.opusDecoder.decodeFEC(opusData);
                    if (fecFrame) {
                        result.push(fecFrame);
                    }
                }
                
                // 最后一个包：正常解码
                const normalFrame = this.opusDecoder.decode(opusData);
                if (normalFrame) {
                    result.push(normalFrame);
                }
            }
        } else {
            // PCM 原始数据
            const int16Array = new Int16Array(payload);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32767;
            }
            result.push(float32Array);
        }
        
        return result;
    }

    startPlayback() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.nextPlayTime = this.audioContext.currentTime + FRAME_DURATION;
        this.scheduleNextFrame();
    }

    scheduleNextFrame() {
        const now = this.audioContext.currentTime;
        const delay = Math.max(0, (this.nextPlayTime - now - FRAME_DURATION) * 1000);
        
        this.playbackTimer = setTimeout(() => {
            this.playNextFrame();
        }, delay);
    }

    playNextFrame() {
        this.playbackTimer = null;
        
        if (this.outputBuffer.length > 0) {
            const frame = this.outputBuffer.shift();
            this.playFloat32Audio(frame);
        } else {
            // 缓冲区空了，停止播放
            this.isPlaying = false;
            return;
        }
        
        // 继续调度下一帧
        if (this.outputBuffer.length > 0 || this.isPlaying) {
            this.scheduleNextFrame();
        }
    }

    playFloat32Audio(float32Array) {
        const now = this.audioContext.currentTime;
        
        // 确保播放时间不会落后太多
        if (this.nextPlayTime < now) {
            this.nextPlayTime = now;
        }
        
        // 创建音频缓冲
        const buffer = this.audioContext.createBuffer(1, float32Array.length, 48000);
        buffer.getChannelData(0).set(float32Array);

        // 创建音源
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.pannerNode);
        
        source.start(this.nextPlayTime);
        this.nextPlayTime += buffer.duration;
    }

    flushAndReset() {
        // 播放剩余的缓冲
        // 然后重置状态
        this.lastSequenceNumber = -1;
        this.packetBuffer.clear();
        this.resetDecoder();
    }

    resetDecoder() {
        if (this.opusDecoder && this.opusDecoder.resetState) {
            this.opusDecoder.resetState();
        }
    }

    dispose() {
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }
        this.outputBuffer = [];
        this.packetBuffer.clear();
        this.gainNode.disconnect();
        this.pannerNode.disconnect();
        if (this.opusDecoder) {
            this.opusDecoder.destroy();
            this.opusDecoder = null;
        }
    }
}

const audioPlayer = new AudioPlayer();
