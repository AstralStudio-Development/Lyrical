// Utility functions

function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
}

function getSessionToken() {
    // 尝试获取当前标签页的 session token
    const tabSessionToken = sessionStorage.getItem('lyrical_session_token');
    if (tabSessionToken) {
        return tabSessionToken;
    }
    return null;
}

function saveSessionToken(token) {
    // 使用 sessionStorage 而不是 localStorage，这样每个标签页独立
    sessionStorage.setItem('lyrical_session_token', token);
}

function clearSessionToken() {
    sessionStorage.removeItem('lyrical_session_token');
}

function getAuthToken() {
    // 优先使用 URL 中的 token（新连接），否则使用保存的 session token（刷新）
    const urlToken = getTokenFromUrl();
    if (urlToken) {
        return urlToken;
    }
    return getSessionToken();
}

function uuidFromBytes(buffer, offset = 0) {
    const view = new DataView(buffer);
    const msb = view.getBigUint64(offset);
    const lsb = view.getBigUint64(offset + 8);
    
    const hex = msb.toString(16).padStart(16, '0') + lsb.toString(16).padStart(16, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getMinecraftHeadUrl(name) {
    // 使用 mc-heads 的 avatar 模式，只显示正面头像（2D 平面，包含帽子层）
    return `https://mc-heads.net/avatar/${name}/128`;
}
