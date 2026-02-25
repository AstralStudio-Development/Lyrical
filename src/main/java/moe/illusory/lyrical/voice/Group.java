package moe.illusory.lyrical.voice;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public class Group {

    private final UUID id;
    private final String name;
    private final UUID ownerId;
    private final Set<UUID> members;
    private String password;

    public Group(String name, UUID ownerId) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.ownerId = ownerId;
        this.members = new HashSet<>();
        this.password = null;
        
        // 创建者自动加入
        this.members.add(ownerId);
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public Set<UUID> getMembers() {
        return new HashSet<>(members);
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public boolean hasPassword() {
        return password != null && !password.isEmpty();
    }

    public boolean checkPassword(String input) {
        if (!hasPassword()) {
            return true;
        }
        return password.equals(input);
    }

    public void addMember(UUID playerUuid) {
        members.add(playerUuid);
    }

    public void removeMember(UUID playerUuid) {
        members.remove(playerUuid);
    }

    public boolean isMember(UUID playerUuid) {
        return members.contains(playerUuid);
    }

    public boolean isEmpty() {
        return members.isEmpty();
    }

    public int size() {
        return members.size();
    }
}
