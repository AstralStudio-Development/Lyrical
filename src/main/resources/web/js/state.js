// Application state management

const state = {
    // Current player info
    uuid: null,
    name: null,
    muted: false,
    deafened: false,

    // Group config
    groupEnabled: true,

    // Group info
    groupId: null,
    groupName: null,

    // Available groups
    groups: new Map(), // groupId -> { name, memberCount, hasPassword }

    // Other players
    players: new Map(), // uuid -> { name, muted, deafened, position }

    // Position data
    positions: new Map(), // uuid -> { x, y, z, yaw, pitch, world }

    // My position (for listener)
    myPosition: { x: 0, y: 0, z: 0, yaw: 0 }
};

function updatePlayerState(uuid, data) {
    let player = state.players.get(uuid);
    if (!player) {
        player = { name: '', muted: false, deafened: false };
        state.players.set(uuid, player);
    }
    Object.assign(player, data);
    ui.updatePlayerList();
}

function removePlayer(uuid) {
    state.players.delete(uuid);
    state.positions.delete(uuid);
    audioPlayer.removePlayer(uuid);
    ui.updatePlayerList();
}

function updatePositions(players) {
    for (const p of players) {
        state.positions.set(p.uuid, {
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            pitch: p.pitch,
            world: p.world
        });

        // Update my position for audio listener
        if (p.uuid === state.uuid) {
            state.myPosition = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
            audioPlayer.updateListenerPosition(p.x, p.y, p.z, p.yaw);
        }
    }
}

function toggleMute() {
    state.muted = !state.muted;
    microphone.setMuted(state.muted);
    connection.send('player_state', { muted: state.muted });
    ui.updateControls();
    
    // 如果取消静音，恢复默认增益
    if (!state.muted) {
        document.getElementById('setting-gain').value = 150;
        microphone.setGain(1.5);
    }
}

function toggleDeafen() {
    state.deafened = !state.deafened;
    audioPlayer.setDeafened(state.deafened);
    connection.send('player_state', { deafened: state.deafened });
    ui.updateControls();
    
    // 如果取消静音，恢复默认音量
    if (!state.deafened) {
        document.getElementById('setting-volume').value = 100;
        audioPlayer.setVolume(1.0);
    }
}

// Group functions
function createGroup(name, password) {
    connection.send('group_create', { name, password: password || null });
}

function joinGroup(groupId, password) {
    connection.send('group_join', { groupId, password: password || null });
}

function leaveGroup() {
    connection.send('group_leave', {});
}

function handleGroupUpdate(data) {
    switch (data.action) {
        case 'created':
        case 'joined':
            state.groupId = data.groupId;
            state.groupName = data.name;
            ui.updateGroupUI();
            break;
        case 'left':
            state.groupId = null;
            state.groupName = null;
            ui.updateGroupUI();
            break;
        case 'error':
            alert(data.message);
            break;
        case 'list':
            state.groups.clear();
            for (const g of data.groups) {
                state.groups.set(g.id, {
                    name: g.name,
                    memberCount: g.memberCount,
                    hasPassword: g.hasPassword
                });
            }
            ui.updateGroupList();
            break;
    }
}

function requestGroupList() {
    connection.send('group_list', {});
}
