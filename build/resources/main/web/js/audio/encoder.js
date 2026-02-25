// Opus encoder using WebCodecs API

class OpusEncoder {
    constructor() {
        this.encoder = null;
        this.supported = 'AudioEncoder' in window;
        this.onEncodedData = null;
        this.sampleRate = 48000;
        this.channels = 1;
    }

    async init() {
        if (!this.supported) {
            console.warn('WebCodecs AudioEncoder not supported, falling back to PCM');
            return false;
        }

        try {
            this.encoder = new AudioEncoder({
                output: (chunk, metadata) => {
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    if (this.onEncodedData) {
                        this.onEncodedData(data.buffer);
                    }
                },
                error: (error) => {
                    console.error('Encoder error:', error);
                }
            });

            await this.encoder.configure({
                codec: 'opus',
                sampleRate: this.sampleRate,
                numberOfChannels: this.channels,
                bitrate: 64000
            });

            return true;
        } catch (error) {
            console.error('Failed to initialize Opus encoder:', error);
            this.supported = false;
            return false;
        }
    }

    encode(float32Data) {
        if (!this.encoder || this.encoder.state === 'closed') {
            return null;
        }

        const audioData = new AudioData({
            format: 'f32',
            sampleRate: this.sampleRate,
            numberOfFrames: float32Data.length,
            numberOfChannels: this.channels,
            timestamp: performance.now() * 1000,
            data: float32Data
        });

        this.encoder.encode(audioData);
        audioData.close();
    }

    close() {
        if (this.encoder && this.encoder.state !== 'closed') {
            this.encoder.close();
        }
    }
}

const opusEncoder = new OpusEncoder();
