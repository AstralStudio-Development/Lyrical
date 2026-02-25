// WebSocket connection management with reconnection

class Connection {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.token = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.onMessage = null;
        this.onBinaryMessage = null;
        this.onClose = null;
        this.onError = null;
        this.onReconnecting = null;
        this.onReconnected = null;
    }

    connect(token) {
        this.token = token;
        return this._connect();
    }

    _connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                // Send auth message
                this.send('auth', { token: this.token });
            };

            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    if (this.onBinaryMessage) {
                        this.onBinaryMessage(event.data);
                    }
                } else {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'auth_result') {
                        if (message.data.success) {
                            this.connected = true;
                            this.reconnectAttempts = 0;
                            resolve(message.data);
                        } else {
                            reject(new Error(message.data.message || 'Authentication failed'));
                        }
                    } else if (this.onMessage) {
                        this.onMessage(message);
                    }
                }
            };

            this.ws.onclose = (event) => {
                this.connected = false;
                
                // Don't reconnect if it was a clean close or auth failure
                if (event.code === 1000 || event.code === 1008) {
                    if (this.onClose) {
                        this.onClose();
                    }
                    return;
                }

                // Attempt reconnection
                this._attemptReconnect();
            };

            this.ws.onerror = (error) => {
                if (this.onError) {
                    this.onError(error);
                }
                if (!this.connected) {
                    reject(error);
                }
            };
        });
    }

    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            if (this.onClose) {
                this.onClose();
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        if (this.onReconnecting) {
            this.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts);
        }

        setTimeout(() => {
            this._connect()
                .then(() => {
                    console.log('Reconnected successfully');
                    if (this.onReconnected) {
                        this.onReconnected();
                    }
                })
                .catch((error) => {
                    console.error('Reconnection failed:', error);
                    // Will trigger onclose which will attempt reconnect again
                });
        }, delay);
    }

    send(type, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
        }
    }

    sendBinary(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    close() {
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
        if (this.ws) {
            this.ws.close(1000); // Normal closure
        }
    }
}

const connection = new Connection();
