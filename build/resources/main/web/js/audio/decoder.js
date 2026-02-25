// Opus decoder using WebCodecs API

class OpusDecoder {
    constructor() {
        this.decoder = null;
        this.supported = 'AudioDecoder' in window;
        this.onDecodedData = null;
        this.sampleRate = 48000;
        this.channels = 1;
    }

    async init() {
        if (!this.supported) {
            console.warn('WebCodecs AudioDecoder not supported, falling back to PCM');
            return false;
        }

        try {
            this.decoder = new AudioDecoder({
                output: (audioData) => {
                    const float32Data = new Float32Array(audioData.numberOfFrames);
                    audioData.copyTo(float32Data, { planeIndex: 0 });
                    if (this.onDecodedData) {
                        this.onDecodedData(float32Data);
                    }
                    audioData.close();
                },
                error: (error) => {
                    console.error('Decoder error:', error);
                }
            });

            await this.decoder.configure({
                codec: 'opus',
                sampleRate: this.sampleRate,
                numberOfChannels: this.channels
            });

            return true;
        } catch (error) {
            console.error('Failed to initialize Opus decoder:', error);
            this.supported = false;
            return false;
        }
    }

    decode(opusData) {
        if (!this.decoder || this.decoder.state === 'closed') {
            return;
        }

        const chunk = new EncodedAudioChunk({
            type: 'key',
            timestamp: performance.now() * 1000,
            data: opusData
        });

        this.decoder.decode(chunk);
    }

    close() {
        if (this.decoder && this.decoder.state !== 'closed') {
            this.decoder.close();
        }
    }
}

const opusDecoder = new OpusDecoder();
