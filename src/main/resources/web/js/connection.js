// WebSocket connection management with reconnection and heartbeat

class Connection {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.token = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this._onMessage = null;
        this.onBinaryMessage = null;
        this.onClose = null;
        this.onError = null;
        this.onReconnecting = null;
        this.onReconnected = null;
        
        // 消息队列，用于缓存在 onMessage 设置之前到达的消息
        this.messageQueue = [];
        
        // 心跳保活
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.heartbeatIntervalMs = 15000; // 每 15 秒发送心跳
        this.heartbeatTimeoutMs = 5000;   // 5 秒内没收到响应则认为断开
        this.lastPongTime = 0;
        
        // 网络质量监控
        this.latency = 0;
        this.packetLoss = 0;
    }

    // onMessage setter - 设置时处理队列中的消息
    set onMessage(handler) {
        this._onMessage = handler;
        if (handler && this.messageQueue.length > 0) {
            for (const msg of this.messageQueue) {
                handler(msg);
            }
            this.messageQueue = [];
        }
    }

    get onMessage() {
        return this._onMessage;
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
                            this._startHeartbeat();
                            // 更新 token 为 session token，用于重连
                            if (message.data.sessionToken) {
                                this.token = message.data.sessionToken;
                            }
                            resolve(message.data);
                        } else {
                            reject(new Error(message.data.message || 'Authentication failed'));
                        }
                    } else if (message.type === 'pong') {
                        this._handlePong(message.data);
                    } else if (this._onMessage) {
                        this._onMessage(message);
                    } else {
                        // 缓存消息，等待 onMessage 设置
                        this.messageQueue.push(message);
                    }
                }
            };

            this.ws.onclose = (event) => {
                this.connected = false;
                this._stopHeartbeat();
                
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

    _startHeartbeat() {
        this._stopHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                const pingTime = Date.now();
                this.send('ping', { timestamp: pingTime });
                
                // 设置超时检测
                this.heartbeatTimeout = setTimeout(() => {
                    console.warn('Heartbeat timeout, connection may be lost');
                    // 强制关闭并重连
                    if (this.ws) {
                        this.ws.close(4000, 'Heartbeat timeout');
                    }
                }, this.heartbeatTimeoutMs);
            }
        }, this.heartbeatIntervalMs);
    }

    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    _handlePong(data) {
        // 清除超时
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
        
        // 计算延迟
        if (data && data.timestamp) {
            this.latency = Date.now() - data.timestamp;
            this.lastPongTime = Date.now();
        }
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
        // 指数退避，但最大不超过 30 秒
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        
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

    getLatency() {
        return this.latency;
    }

    close() {
        this._stopHeartbeat();
        this.reconnectAttempts = this.maxReconnectAttempts;
        if (this.ws) {
            this.ws.close(1000);
        }
    }
}

const connection = new Connection();
