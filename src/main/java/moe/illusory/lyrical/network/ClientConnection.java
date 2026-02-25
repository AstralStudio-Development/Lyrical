package moe.illusory.lyrical.network;

import io.netty.channel.Channel;
import moe.illusory.lyrical.voice.PlayerState;

import java.util.UUID;

public class ClientConnection {

    private final UUID playerUuid;
    private final String playerName;
    private final Channel channel;
    private final PlayerState state;
    private long lastActivity;

    public ClientConnection(UUID playerUuid, String playerName, Channel channel) {
        this.playerUuid = playerUuid;
        this.playerName = playerName;
        this.channel = channel;
        this.state = new PlayerState(playerUuid);
        this.lastActivity = System.currentTimeMillis();
    }

    public UUID getPlayerUuid() {
        return playerUuid;
    }

    public String getPlayerName() {
        return playerName;
    }

    public Channel getChannel() {
        return channel;
    }

    public PlayerState getState() {
        return state;
    }

    public long getLastActivity() {
        return lastActivity;
    }

    public void updateActivity() {
        this.lastActivity = System.currentTimeMillis();
    }

    public boolean isConnected() {
        return channel != null && channel.isActive();
    }

    public void close() {
        if (channel != null && channel.isActive()) {
            channel.close();
        }
    }
}
