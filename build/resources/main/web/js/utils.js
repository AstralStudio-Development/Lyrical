// Utility functions

function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
}

function uuidFromBytes(buffer, offset = 0) {
    const view = new DataView(buffer);
    const msb = view.getBigUint64(offset);
    const lsb = view.getBigUint64(offset + 8);
    
    const hex = msb.toString(16).padStart(16, '0') + lsb.toString(16).padStart(16, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getMinecraftHeadUrl(uuid) {
    return `https://mc-heads.net/avatar/${uuid.replace(/-/g, '')}/32`;
}
