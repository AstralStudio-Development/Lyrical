// Microphone capture with PCM encoding

class Microphone {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.onAudioData = null;
        this.muted = false;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 48000 });
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Use smaller buffer for lower latency (2048 samples = ~42ms at 48kHz)
            this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
            
            this.processor.onaudioprocess = (event) => {
                if (this.muted || !this.onAudioData) return;

                const inputData = event.inputBuffer.getChannelData(0);
                
                // Voice activity detection
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                
                // Lower threshold for better sensitivity
                if (rms > 0.005) {
                    const int16Data = this.float32ToInt16(inputData);
                    // Prepend format marker (0x00 = PCM)
                    const packet = new Uint8Array(int16Data.byteLength + 1);
                    packet[0] = 0x00;
                    packet.set(new Uint8Array(int16Data.buffer), 1);
                    this.onAudioData(packet.buffer);
                }
            };

            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            return true;
        } catch (error) {
            console.error('Failed to start microphone:', error);
            return false;
        }
    }

    float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }

    setMuted(muted) {
        this.muted = muted;
    }

    stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
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
    }
}

const microphone = new Microphone();
