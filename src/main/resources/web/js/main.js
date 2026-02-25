// Main entry point

async function init() {
    const token = getTokenFromUrl();
    if (!token) {
        ui.showError('No token provided. Please use /lyrical in game to get a connection link.');
        return;
    }

    try {
        // Connect to server
        const authResult = await connection.connect(token);
        state.uuid = authResult.uuid;
        state.name = authResult.name;

        // Initialize audio
        audioPlayer.init();
        const micStarted = await microphone.start();
        if (!micStarted) {
            ui.showError('Failed to access microphone. Please allow microphone access and refresh.');
            return;
        }

        // Set up message handlers
        connection.onMessage = handleMessage;
        connection.onBinaryMessage = handleBinaryMessage;
        
        connection.onClose = () => {
            ui.setConnectionStatus('Disconnected');
        };

        connection.onReconnecting = (attempt, max) => {
            ui.setConnectionStatus(`Reconnecting (${attempt}/${max})...`);
        };

        connection.onReconnected = () => {
            ui.setConnectionStatus('Connected');
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

        // Show main UI
        ui.showMain(state.name);

    } catch (error) {
        console.error('Connection error:', error);
        ui.showError(error.message || 'Failed to connect to voice server.');
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

    // Update UI to show speaking
    ui.setPlayerSpeaking(senderUuid, true);
    setTimeout(() => ui.setPlayerSpeaking(senderUuid, false), 200);
}

// Start the app
init();
