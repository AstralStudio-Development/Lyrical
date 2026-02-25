package moe.illusory.lyrical.voice;

import org.bukkit.Location;

import java.util.UUID;

public class PlayerState {

    private final UUID playerUuid;
    private boolean muted;
    private boolean deafened;
    private UUID groupId;
    
    // 位置信息 (从 Minecraft 同步)
    private double x;
    private double y;
    private double z;
    private float yaw;
    private float pitch;
    private String world;

    public PlayerState(UUID playerUuid) {
        this.playerUuid = playerUuid;
        this.muted = false;
        this.deafened = false;
        this.groupId = null;
    }

    public UUID getPlayerUuid() {
        return playerUuid;
    }

    public boolean isMuted() {
        return muted;
    }

    public void setMuted(boolean muted) {
        this.muted = muted;
    }

    public boolean isDeafened() {
        return deafened;
    }

    public void setDeafened(boolean deafened) {
        this.deafened = deafened;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public void setGroupId(UUID groupId) {
        this.groupId = groupId;
    }

    public boolean hasGroup() {
        return groupId != null;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getZ() {
        return z;
    }

    public float getYaw() {
        return yaw;
    }

    public float getPitch() {
        return pitch;
    }

    public String getWorld() {
        return world;
    }

    public void updatePosition(Location location) {
        this.x = location.getX();
        this.y = location.getY();
        this.z = location.getZ();
        this.yaw = location.getYaw();
        this.pitch = location.getPitch();
        this.world = location.getWorld().getName();
    }

    public double distanceTo(PlayerState other) {
        if (!this.world.equals(other.world)) {
            return Double.MAX_VALUE;
        }
        double dx = this.x - other.x;
        double dy = this.y - other.y;
        double dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}
