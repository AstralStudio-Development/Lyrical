// Main entry point

async function init() {
    const token = getAuthToken();
    if (!token) {
        ui.showError('未提供令牌。请在游戏中使用 /lyrical 命令获取连接链接。');
        return;
    }

    try {
        // Connect to server
        const authResult = await connection.connect(token);
        state.uuid = authResult.uuid;
        state.name = authResult.name;
        state.groupEnabled = authResult.groupEnabled !== false;

        // 保存 session token 用于刷新后重连
        if (authResult.sessionToken) {
            saveSessionToken(authResult.sessionToken);
            // 从 URL 中移除一次性 token，避免刷新时重复使用
            if (getTokenFromUrl()) {
                const url = new URL(window.location.href);
                url.searchParams.delete('token');
                window.history.replaceState({}, '', url.toString());
            }
        }

        // Initialize audio
        audioPlayer.init();
        const micStarted = await microphone.start();
        if (!micStarted) {
            ui.showError('无法访问麦克风。请允许麦克风权限后刷新页面。');
            return;
        }

        // Set up message handlers
        connection.onMessage = handleMessage;
        connection.onBinaryMessage = handleBinaryMessage;
        
        connection.onClose = () => {
            ui.setConnectionStatus('已断开');
        };

        connection.onReconnecting = (attempt, max) => {
            ui.setConnectionStatus(`重连中 (${attempt}/${max})...`);
        };

        connection.onReconnected = () => {
            ui.setConnectionStatus('已连接');
            // Re-sync state after reconnection
            connection.send('player_state', { 
                muted: state.muted, 
                deafened: state.deafened 
            });
        };

        // Set up audio sending
        microphone.onAudioData = (data) => {
            connection.sendBinary(data);
        };

        // Set up voice level callback for UI
        microphone.onVoiceLevel = (rms, speaking) => {
            updateVoiceLevel(rms, speaking);
        };

        // Show main UI
        ui.showMain(state.name);
        ui.setGroupEnabled(state.groupEnabled);
        initSettings();
        
        // 显示编码模式
        setTimeout(() => {
            const codecStatus = document.getElementById('codec-status');
            if (codecStatus) {
                if (microphone.useOpus && microphone.opusEncoder) {
                    codecStatus.textContent = '[Opus]';
                } else {
                    codecStatus.textContent = '[PCM]';
                }
            }
        }, 500);

    } catch (error) {
        console.error('Connection error:', error);
        // 连接失败时清除 session token
        clearSessionToken();
        ui.showError(error.message || '无法连接到语音服务器。');
    }
}

function handleMessage(message) {
    const { type, data } = message;

    switch (type) {
        case 'player_list':
            for (const player of data.players) {
                state.players.set(player.uuid, {
                    name: player.name,
                    muted: player.muted,
                    deafened: player.deafened
                });
            }
            ui.updatePlayerList();
            break;

        case 'player_join':
            updatePlayerState(data.uuid, { name: data.name });
            break;

        case 'player_leave':
            removePlayer(data.uuid);
            break;

        case 'player_state':
            updatePlayerState(data.uuid, {
                muted: data.muted,
                deafened: data.deafened
            });
            break;

        case 'position':
            updatePositions(data.players);
            break;

        case 'group_update':
            handleGroupUpdate(data);
            break;

        case 'group_list':
            handleGroupUpdate({ action: 'list', groups: data.groups });
            break;
    }
}

// Speaking timeout map for debouncing
const speakingTimeouts = new Map();

function handleBinaryMessage(buffer) {
    // Parse binary message: [16 bytes UUID] [8 bytes volume] [N bytes audio]
    const view = new DataView(buffer);
    const senderUuid = uuidFromBytes(buffer, 0);
    const volume = view.getFloat64(16);
    const audioData = buffer.slice(24);

    // Get sender position
    const position = state.positions.get(senderUuid);

    // Play audio
    audioPlayer.playAudio(senderUuid, audioData, volume, position);

    // Update UI to show speaking with debounce
    ui.setPlayerSpeaking(senderUuid, true);
    
    // Clear existing timeout for this player
    const existingTimeout = speakingTimeouts.get(senderUuid);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
        ui.setPlayerSpeaking(senderUuid, false);
        speakingTimeouts.delete(senderUuid);
    }, 300);
    speakingTimeouts.set(senderUuid, timeout);
}

// Start the app
init();

// Voice level UI update
function updateVoiceLevel(rms, speaking) {
    const fill = document.getElementById('voice-level-fill');
    const text = document.getElementById('voice-level-text');
    const marker = document.getElementById('voice-threshold-marker');
    
    // Convert RMS to percentage (0-100), capped at 0.1 RMS = 100%
    const percent = Math.min(rms / 0.1 * 100, 100);
    fill.style.width = percent + '%';
    fill.classList.toggle('speaking', speaking);
    
    // Display RMS value
    text.textContent = rms.toFixed(3);
    
    // Update threshold marker position
    const threshold = microphone.settings.vadThreshold;
    const markerPercent = Math.min(threshold / 0.1 * 100, 100);
    marker.style.left = markerPercent + '%';
}
