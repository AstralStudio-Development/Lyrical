// Audio playback with jitter buffer for smooth playback

class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.players = new Map(); // uuid -> PlayerAudio
        this.deafened = false;
        this.listenerPosition = { x: 0, y: 0, z: 0 };
        this.listenerYaw = 0;
    }

    async init() {
        this.audioContext = new AudioContext({ sampleRate: 48000 });
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

        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        let playerAudio = this.players.get(senderUuid);
        if (!playerAudio) {
            playerAudio = new PlayerAudio(this.audioContext);
            this.players.set(senderUuid, playerAudio);
        }

        if (position) {
            playerAudio.setPosition(position.x, position.y, position.z);
        }
        playerAudio.setVolume(volume);

        // Check format marker
        const dataView = new Uint8Array(audioData);
        const format = dataView[0];
        const payload = audioData.slice(1);

        playerAudio.playAudio(payload);
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

class PlayerAudio {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.gainNode = audioContext.createGain();
        this.pannerNode = audioContext.createPanner();
        
        this.pannerNode.panningModel = 'HRTF';
        this.pannerNode.distanceModel = 'linear';
        this.pannerNode.maxDistance = 48;
        this.pannerNode.refDistance = 1;
        this.pannerNode.rolloffFactor = 1;

        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(audioContext.destination);

        // Track next play time for seamless playback
        this.nextPlayTime = 0;
    }

    setPosition(x, y, z) {
        this.pannerNode.positionX.setValueAtTime(x, this.audioContext.currentTime);
        this.pannerNode.positionY.setValueAtTime(y, this.audioContext.currentTime);
        this.pannerNode.positionZ.setValueAtTime(z, this.audioContext.currentTime);
    }

    setVolume(volume) {
        this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }

    playAudio(audioData) {
        // Convert Int16Array to Float32Array
        const int16Array = new Int16Array(audioData);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }

        // Create buffer
        const buffer = this.audioContext.createBuffer(1, float32Array.length, 48000);
        buffer.getChannelData(0).set(float32Array);

        // Create source
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.pannerNode);

        // Calculate start time
        const now = this.audioContext.currentTime;
        
        // If nextPlayTime is in the past or too far ahead, reset it
        if (this.nextPlayTime < now || this.nextPlayTime > now + 0.5) {
            this.nextPlayTime = now + 0.05; // Small buffer of 50ms
        }

        source.start(this.nextPlayTime);
        this.nextPlayTime += buffer.duration;
    }

    dispose() {
        this.gainNode.disconnect();
        this.pannerNode.disconnect();
    }
}

const audioPlayer = new AudioPlayer();
