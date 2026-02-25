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
                <img class="player-avatar" src="${getMinecraftHeadUrl(uuid)}" alt="">
                <div class="player-info">
                    <div class="name">${player.name}</div>
                    <div class="status">In voice</div>
                </div>
                <div class="volume-bar">
                    <div class="volume-bar-fill" style="height: 0%"></div>
                </div>
            `;

            list.appendChild(li);
        }
    },

    updateControls() {
        this.elements.btnMute.classList.toggle('active', state.muted);
        this.elements.btnDeafen.classList.toggle('active', state.deafened);
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
            this.elements.groupName.textContent = `Group: ${state.groupName}`;
            this.elements.groupInfo.classList.remove('hidden');
        } else {
            this.elements.groupInfo.classList.add('hidden');
        }
    },

    updateGroupList() {
        const select = this.elements.selectGroup;
        select.innerHTML = '<option value="">Select a group...</option>';
        
        for (const [id, group] of state.groups) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${group.name} (${group.memberCount} members)${group.hasPassword ? ' 🔒' : ''}`;
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
        alert('Please enter a group name');
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
        alert('Please select a group');
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
