// UI management

const ui = {
    screens: {
        connecting: document.getElementById('connecting'),
        error: document.getElementById('error'),
        main: document.getElementById('main')
    },
    elements: {
        errorMessage: document.getElementById('error-message'),
        playerName: document.getElementById('player-name'),
        playerList: document.getElementById('player-list'),
        btnMute: document.getElementById('btn-mute'),
        btnDeafen: document.getElementById('btn-deafen'),
        connectionStatus: document.getElementById('connection-status'),
        // Group elements
        groupSection: document.getElementById('group-section'),
        groupInfo: document.getElementById('group-info'),
        groupName: document.getElementById('group-name'),
        groupActions: document.getElementById('group-actions'),
        // Modals
        modalCreateGroup: document.getElementById('modal-create-group'),
        modalJoinGroup: document.getElementById('modal-join-group'),
        inputGroupName: document.getElementById('input-group-name'),
        inputGroupPassword: document.getElementById('input-group-password'),
        selectGroup: document.getElementById('select-group'),
        inputJoinPassword: document.getElementById('input-join-password')
    },

    showScreen(name) {
        for (const [key, screen] of Object.entries(this.screens)) {
            screen.classList.toggle('hidden', key !== name);
        }
    },

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.showScreen('error');
    },

    showMain(playerName) {
        this.elements.playerName.textContent = playerName;
        document.getElementById('user-avatar').src = getMinecraftHeadUrl(playerName);
        this.showScreen('main');
    },

    updatePlayerList() {
        const list = this.elements.playerList;
        list.innerHTML = '';

        for (const [uuid, player] of state.players) {
            const li = document.createElement('li');
            li.id = `player-${uuid}`;
            
            if (player.muted) li.classList.add('player-muted');
            if (player.deafened) li.classList.add('player-deafened');

            li.innerHTML = `
                <img class="player-avatar" src="${getMinecraftHeadUrl(player.name)}" alt="">
                <div class="player-info">
                    <div class="name">${player.name}</div>
                    <div class="status"></div>
                </div>
            `;

            list.appendChild(li);
        }
    },

    updateControls() {
        this.elements.btnMute.classList.toggle('active', state.muted);
        this.elements.btnDeafen.classList.toggle('active', state.deafened);
    },

    setGroupEnabled(enabled) {
        if (enabled) {
            this.elements.groupSection.classList.remove('hidden');
        } else {
            this.elements.groupSection.classList.add('hidden');
        }
    },

    setPlayerSpeaking(uuid, speaking) {
        const li = document.getElementById(`player-${uuid}`);
        if (li) {
            li.classList.toggle('player-speaking', speaking);
        }
    },

    setConnectionStatus(status) {
        this.elements.connectionStatus.textContent = status;
    },

    // Group UI
    updateGroupUI() {
        const inGroup = state.groupId !== null;
        this.elements.groupSection.classList.toggle('in-group', inGroup);
        
        if (inGroup) {
            this.elements.groupName.textContent = `群组: ${state.groupName}`;
            this.elements.groupInfo.classList.remove('hidden');
        } else {
            this.elements.groupInfo.classList.add('hidden');
        }
    },

    updateGroupList() {
        const select = this.elements.selectGroup;
        select.innerHTML = '<option value="">选择群组...</option>';
        
        for (const [id, group] of state.groups) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${group.name} (${group.memberCount} 人)${group.hasPassword ? ' 🔒' : ''}`;
            select.appendChild(option);
        }
    },

    showCreateGroupModal() {
        this.elements.inputGroupName.value = '';
        this.elements.inputGroupPassword.value = '';
        this.elements.modalCreateGroup.classList.remove('hidden');
    },

    hideCreateGroupModal() {
        this.elements.modalCreateGroup.classList.add('hidden');
    },

    showJoinGroupModal() {
        requestGroupList();
        this.elements.inputJoinPassword.value = '';
        this.elements.modalJoinGroup.classList.remove('hidden');
    },

    hideJoinGroupModal() {
        this.elements.modalJoinGroup.classList.add('hidden');
    }
};

// Event listeners
document.getElementById('btn-mute').addEventListener('click', toggleMute);
document.getElementById('btn-deafen').addEventListener('click', toggleDeafen);

// Group event listeners
document.getElementById('btn-create-group').addEventListener('click', () => ui.showCreateGroupModal());
document.getElementById('btn-join-group').addEventListener('click', () => ui.showJoinGroupModal());
document.getElementById('btn-leave-group').addEventListener('click', () => leaveGroup());

document.getElementById('btn-cancel-create').addEventListener('click', () => ui.hideCreateGroupModal());
document.getElementById('btn-confirm-create').addEventListener('click', () => {
    const name = ui.elements.inputGroupName.value.trim();
    if (!name) {
        alert('请输入群组名称');
        return;
    }
    const password = ui.elements.inputGroupPassword.value;
    createGroup(name, password);
    ui.hideCreateGroupModal();
});

document.getElementById('btn-cancel-join').addEventListener('click', () => ui.hideJoinGroupModal());
document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const groupId = ui.elements.selectGroup.value;
    if (!groupId) {
        alert('请选择一个群组');
        return;
    }
    const password = ui.elements.inputJoinPassword.value;
    joinGroup(groupId, password);
    ui.hideJoinGroupModal();
});

// Close modals on backdrop click
document.getElementById('modal-create-group').addEventListener('click', (e) => {
    if (e.target.id === 'modal-create-group') ui.hideCreateGroupModal();
});
document.getElementById('modal-join-group').addEventListener('click', (e) => {
    if (e.target.id === 'modal-join-group') ui.hideJoinGroupModal();
});

// Settings (直接在页面上)
document.getElementById('btn-reset-settings').addEventListener('click', () => {
    document.getElementById('setting-threshold').value = 8;
    document.getElementById('setting-gain').value = 150;
    document.getElementById('setting-volume').value = 100;
    
    microphone.setThreshold(0.008);
    microphone.setGain(1.5);
    audioPlayer.setVolume(1.0);
    
    // 重置静音状态
    if (state.muted) {
        state.muted = false;
        microphone.setMuted(false);
        connection.send('player_state', { muted: false });
        ui.updateControls();
    }
    if (state.deafened) {
        state.deafened = false;
        audioPlayer.setDeafened(false);
        connection.send('player_state', { deafened: false });
        ui.updateControls();
    }
    
    updateSettingsDisplay();
});

document.getElementById('setting-threshold').addEventListener('input', (e) => {
    const value = e.target.value / 1000;
    microphone.setThreshold(value);
    document.getElementById('threshold-value').textContent = value.toFixed(3);
});

// 麦克风增益滑块
document.getElementById('setting-gain').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    microphone.setGain(value);
    
    // 如果拉到最低，自动静音
    if (e.target.value <= 50) {
        if (!state.muted) {
            state.muted = true;
            microphone.setMuted(true);
            connection.send('player_state', { muted: true });
            ui.updateControls();
        }
    } else {
        // 如果从最低拉起来，取消静音
        if (state.muted) {
            state.muted = false;
            microphone.setMuted(false);
            connection.send('player_state', { muted: false });
            ui.updateControls();
        }
    }
});

// 扬声器音量滑块
document.getElementById('setting-volume').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    audioPlayer.setVolume(value);
    
    // 如果拉到最低，自动静音
    if (e.target.value <= 0) {
        if (!state.deafened) {
            state.deafened = true;
            audioPlayer.setDeafened(true);
            connection.send('player_state', { deafened: true });
            ui.updateControls();
        }
    } else {
        // 如果从最低拉起来，取消静音
        if (state.deafened) {
            state.deafened = false;
            audioPlayer.setDeafened(false);
            connection.send('player_state', { deafened: false });
            ui.updateControls();
        }
    }
});

function initSettings() {
    const settings = microphone.getSettings();
    document.getElementById('setting-threshold').value = settings.vadThreshold * 1000;
    document.getElementById('setting-gain').value = settings.gain * 100;
    document.getElementById('setting-volume').value = 100;
    updateSettingsDisplay();
}

function updateSettingsDisplay() {
    const settings = microphone.getSettings();
    document.getElementById('threshold-value').textContent = settings.vadThreshold.toFixed(3);
}
