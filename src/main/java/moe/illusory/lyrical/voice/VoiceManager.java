package moe.illusory.lyrical.voice;

import moe.illusory.lyrical.Lyrical;
import moe.illusory.lyrical.network.ClientConnection;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class VoiceManager {

    private final Lyrical plugin;
    private final Map<UUID, ClientConnection> connections;
    private final Map<UUID, Group> groups;

    public VoiceManager(Lyrical plugin) {
        this.plugin = plugin;
        this.connections = new ConcurrentHashMap<>();
        this.groups = new ConcurrentHashMap<>();
    }

    public void addConnection(ClientConnection connection) {
        connections.put(connection.getPlayerUuid(), connection);
        plugin.getLogger().info("Player " + connection.getPlayerName() + " connected to voice chat");
    }

    public void removeConnection(UUID playerUuid) {
        ClientConnection connection = connections.remove(playerUuid);
        if (connection != null) {
            // 离开群组
            if (connection.getState().hasGroup()) {
                leaveGroup(playerUuid);
            }
            plugin.getLogger().info("Player " + connection.getPlayerName() + " disconnected from voice chat");
        }
    }

    public ClientConnection getConnection(UUID playerUuid) {
        return connections.get(playerUuid);
    }

    public Collection<ClientConnection> getConnections() {
        return connections.values();
    }

    public boolean isConnected(UUID playerUuid) {
        return connections.containsKey(playerUuid);
    }

    public List<ClientConnection> getPlayersInRange(UUID senderUuid, double maxDistance) {
        ClientConnection sender = connections.get(senderUuid);
        if (sender == null) {
            return Collections.emptyList();
        }

        PlayerState senderState = sender.getState();
        List<ClientConnection> result = new ArrayList<>();

        for (ClientConnection connection : connections.values()) {
            if (connection.getPlayerUuid().equals(senderUuid)) {
                continue;
            }
            
            PlayerState receiverState = connection.getState();
            double distance = senderState.distanceTo(receiverState);
            
            if (distance <= maxDistance) {
                result.add(connection);
            }
        }

        return result;
    }

    public double calculateVolume(UUID senderUuid, UUID receiverUuid) {
        ClientConnection sender = connections.get(senderUuid);
        ClientConnection receiver = connections.get(receiverUuid);
        
        if (sender == null || receiver == null) {
            return 0;
        }

        double distance = sender.getState().distanceTo(receiver.getState());
        double maxDistance = plugin.getLyricalConfig().getMaxDistance();
        double fadeDistance = plugin.getLyricalConfig().getFadeDistance();

        if (distance > maxDistance) {
            return 0;
        } else if (distance > maxDistance - fadeDistance) {
            return 1.0 - (distance - (maxDistance - fadeDistance)) / fadeDistance;
        } else {
            return 1.0;
        }
    }

    // 群组管理
    public Group createGroup(String name, UUID ownerId) {
        Group group = new Group(name, ownerId);
        groups.put(group.getId(), group);
        return group;
    }

    public Group getGroup(UUID groupId) {
        return groups.get(groupId);
    }

    public void deleteGroup(UUID groupId) {
        Group group = groups.remove(groupId);
        if (group != null) {
            for (UUID memberId : group.getMembers()) {
                ClientConnection connection = connections.get(memberId);
                if (connection != null) {
                    connection.getState().setGroupId(null);
                }
            }
        }
    }

    public boolean joinGroup(UUID playerUuid, UUID groupId) {
        Group group = groups.get(groupId);
        ClientConnection connection = connections.get(playerUuid);
        
        if (group == null || connection == null) {
            return false;
        }

        // 先离开当前群组
        if (connection.getState().hasGroup()) {
            leaveGroup(playerUuid);
        }

        group.addMember(playerUuid);
        connection.getState().setGroupId(groupId);
        return true;
    }

    public void leaveGroup(UUID playerUuid) {
        ClientConnection connection = connections.get(playerUuid);
        if (connection == null || !connection.getState().hasGroup()) {
            return;
        }

        UUID groupId = connection.getState().getGroupId();
        Group group = groups.get(groupId);
        
        if (group != null) {
            group.removeMember(playerUuid);
            
            // 如果群组为空，删除群组
            if (group.isEmpty()) {
                groups.remove(groupId);
            }
        }
        
        connection.getState().setGroupId(null);
    }

    public Collection<Group> getGroups() {
        return groups.values();
    }

    public void shutdown() {
        for (ClientConnection connection : connections.values()) {
            connection.close();
        }
        connections.clear();
        groups.clear();
    }
}
