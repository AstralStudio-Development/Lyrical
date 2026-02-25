package moe.illusory.lyrical.network;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.netty.buffer.ByteBuf;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import moe.illusory.lyrical.Lyrical;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class WebSocketHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

    private static final Gson GSON = new Gson();
    private static final Map<Channel, UUID> channelToPlayer = new ConcurrentHashMap<>();

    private final Lyrical plugin;

    public WebSocketHandler(Lyrical plugin) {
        this.plugin = plugin;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        if (frame instanceof TextWebSocketFrame textFrame) {
            handleTextMessage(ctx, textFrame.text());
        } else if (frame instanceof BinaryWebSocketFrame binaryFrame) {
            handleBinaryMessage(ctx, binaryFrame.content());
        }
    }

    private void handleTextMessage(ChannelHandlerContext ctx, String text) {
        try {
            JsonObject json = JsonParser.parseString(text).getAsJsonObject();
            String type = json.get("type").getAsString();
            JsonObject data = json.has("data") ? json.getAsJsonObject("data") : new JsonObject();

            switch (type) {
                case "auth" -> handleAuth(ctx, data);
                case "player_state" -> handlePlayerState(ctx, data);
                case "group_create" -> handleGroupCreate(ctx, data);
                case "group_join" -> handleGroupJoin(ctx, data);
                case "group_leave" -> handleGroupLeave(ctx);
                case "group_list" -> handleGroupList(ctx);
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to parse WebSocket message: " + e.getMessage());
        }
    }

    private void handleAuth(ChannelHandlerContext ctx, JsonObject data) {
        String token = data.get("token").getAsString();
        
        // 验证 Token
        UUID playerUuid = plugin.getTokenManager().validateToken(token);
        if (playerUuid == null) {
            sendJson(ctx, "auth_result", Map.of("success", false, "message", "Invalid token"));
            ctx.close();
            return;
        }

        String playerName = plugin.getTokenManager().getPlayerName(playerUuid);
        
        // 创建连接
        ClientConnection connection = new ClientConnection(playerUuid, playerName, ctx.channel());
        plugin.getVoiceManager().addConnection(connection);
        channelToPlayer.put(ctx.channel(), playerUuid);

        // 发送认证成功
        sendJson(ctx, "auth_result", Map.of(
                "success", true,
                "uuid", playerUuid.toString(),
                "name", playerName
        ));

        // 通知其他玩家
        broadcastPlayerJoin(playerUuid, playerName);
        
        // 发送当前在线玩家列表
        sendOnlinePlayers(ctx, playerUuid);
    }

    private void handlePlayerState(ChannelHandlerContext ctx, JsonObject data) {
        UUID playerUuid = channelToPlayer.get(ctx.channel());
        if (playerUuid == null) return;

        ClientConnection connection = plugin.getVoiceManager().getConnection(playerUuid);
        if (connection == null) return;

        if (data.has("muted") && !data.get("muted").isJsonNull()) {
            connection.getState().setMuted(data.get("muted").getAsBoolean());
        }
        if (data.has("deafened") && !data.get("deafened").isJsonNull()) {
            connection.getState().setDeafened(data.get("deafened").getAsBoolean());
        }

        // 广播状态变化
        broadcastPlayerState(playerUuid, connection.getState().isMuted(), connection.getState().isDeafened());
    }

    private void handleGroupCreate(ChannelHandlerContext ctx, JsonObject data) {
        UUID playerUuid = channelToPlayer.get(ctx.channel());
        if (playerUuid == null) return;

        String name = data.get("name").getAsString();
        String password = (data.has("password") && !data.get("password").isJsonNull()) 
                ? data.get("password").getAsString() : null;

        var group = plugin.getVoiceManager().createGroup(name, playerUuid);
        if (password != null && !password.isEmpty()) {
            group.setPassword(password);
        }

        ClientConnection connection = plugin.getVoiceManager().getConnection(playerUuid);
        if (connection != null) {
            connection.getState().setGroupId(group.getId());
        }

        sendJson(ctx, "group_update", Map.of(
                "action", "created",
                "groupId", group.getId().toString(),
                "name", name
        ));
    }

    private void handleGroupJoin(ChannelHandlerContext ctx, JsonObject data) {
        UUID playerUuid = channelToPlayer.get(ctx.channel());
        if (playerUuid == null) return;

        UUID groupId = UUID.fromString(data.get("groupId").getAsString());
        String password = (data.has("password") && !data.get("password").isJsonNull()) 
                ? data.get("password").getAsString() : null;

        var group = plugin.getVoiceManager().getGroup(groupId);
        if (group == null) {
            sendJson(ctx, "group_update", Map.of("action", "error", "message", "Group not found"));
            return;
        }

        if (!group.checkPassword(password)) {
            sendJson(ctx, "group_update", Map.of("action", "error", "message", "Wrong password"));
            return;
        }

        plugin.getVoiceManager().joinGroup(playerUuid, groupId);
        sendJson(ctx, "group_update", Map.of(
                "action", "joined",
                "groupId", groupId.toString(),
                "name", group.getName()
        ));
    }

    private void handleGroupLeave(ChannelHandlerContext ctx) {
        UUID playerUuid = channelToPlayer.get(ctx.channel());
        if (playerUuid == null) return;

        plugin.getVoiceManager().leaveGroup(playerUuid);
        sendJson(ctx, "group_update", Map.of("action", "left"));
    }

    private void handleGroupList(ChannelHandlerContext ctx) {
        var groups = plugin.getVoiceManager().getGroups().stream()
                .map(g -> Map.of(
                        "id", g.getId().toString(),
                        "name", g.getName(),
                        "memberCount", g.size(),
                        "hasPassword", g.hasPassword()
                ))
                .toList();

        sendJson(ctx, "group_list", Map.of("groups", groups));
    }

    private void handleBinaryMessage(ChannelHandlerContext ctx, ByteBuf buf) {
        UUID senderUuid = channelToPlayer.get(ctx.channel());
        if (senderUuid == null) return;

        ClientConnection sender = plugin.getVoiceManager().getConnection(senderUuid);
        if (sender == null || sender.getState().isMuted()) return;

        sender.updateActivity();

        // 读取音频数据
        byte[] audioData = new byte[buf.readableBytes()];
        buf.readBytes(audioData);

        // 检查是否在群组中
        if (sender.getState().hasGroup()) {
            broadcastToGroup(senderUuid, audioData);
        } else {
            broadcastToProximity(senderUuid, audioData);
        }
    }

    private void broadcastToGroup(UUID senderUuid, byte[] audioData) {
        ClientConnection sender = plugin.getVoiceManager().getConnection(senderUuid);
        if (sender == null) return;

        UUID groupId = sender.getState().getGroupId();
        var group = plugin.getVoiceManager().getGroup(groupId);
        if (group == null) return;

        for (UUID memberId : group.getMembers()) {
            if (memberId.equals(senderUuid)) continue;

            ClientConnection receiver = plugin.getVoiceManager().getConnection(memberId);
            if (receiver == null || receiver.getState().isDeafened()) continue;

            sendAudio(receiver.getChannel(), senderUuid, audioData, 1.0);
        }
    }

    private void broadcastToProximity(UUID senderUuid, byte[] audioData) {
        double maxDistance = plugin.getLyricalConfig().getMaxDistance();
        var receivers = plugin.getVoiceManager().getPlayersInRange(senderUuid, maxDistance);

        for (ClientConnection receiver : receivers) {
            if (receiver.getState().isDeafened()) continue;

            // 如果接收者在群组中且群组是隔离的，跳过
            if (receiver.getState().hasGroup()) {
                continue;
            }

            double volume = plugin.getVoiceManager().calculateVolume(senderUuid, receiver.getPlayerUuid());
            if (volume > 0) {
                sendAudio(receiver.getChannel(), senderUuid, audioData, volume);
            }
        }
    }

    private void sendAudio(Channel channel, UUID senderUuid, byte[] audioData, double volume) {
        // 使用 Netty 池化 ByteBuf 提升性能
        ByteBuf buf = channel.alloc().buffer(16 + 8 + audioData.length);
        buf.writeLong(senderUuid.getMostSignificantBits());
        buf.writeLong(senderUuid.getLeastSignificantBits());
        buf.writeDouble(volume);
        buf.writeBytes(audioData);

        channel.writeAndFlush(new BinaryWebSocketFrame(buf));
    }

    private void broadcastPlayerJoin(UUID playerUuid, String playerName) {
        for (ClientConnection connection : plugin.getVoiceManager().getConnections()) {
            if (connection.getPlayerUuid().equals(playerUuid)) continue;
            sendJson(connection.getChannel(), "player_join", Map.of(
                    "uuid", playerUuid.toString(),
                    "name", playerName
            ));
        }
    }

    private void broadcastPlayerState(UUID playerUuid, boolean muted, boolean deafened) {
        for (ClientConnection connection : plugin.getVoiceManager().getConnections()) {
            if (connection.getPlayerUuid().equals(playerUuid)) continue;
            sendJson(connection.getChannel(), "player_state", Map.of(
                    "uuid", playerUuid.toString(),
                    "muted", muted,
                    "deafened", deafened
            ));
        }
    }

    private void sendOnlinePlayers(ChannelHandlerContext ctx, UUID excludeUuid) {
        var players = plugin.getVoiceManager().getConnections().stream()
                .filter(c -> !c.getPlayerUuid().equals(excludeUuid))
                .map(c -> Map.of(
                        "uuid", c.getPlayerUuid().toString(),
                        "name", c.getPlayerName(),
                        "muted", c.getState().isMuted(),
                        "deafened", c.getState().isDeafened()
                ))
                .toList();

        sendJson(ctx, "player_list", Map.of("players", players));
    }

    private void sendJson(ChannelHandlerContext ctx, String type, Map<String, Object> data) {
        sendJson(ctx.channel(), type, data);
    }

    private void sendJson(Channel channel, String type, Map<String, Object> data) {
        JsonObject json = new JsonObject();
        json.addProperty("type", type);
        json.add("data", GSON.toJsonTree(data));
        channel.writeAndFlush(new TextWebSocketFrame(json.toString()));
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        UUID playerUuid = channelToPlayer.remove(ctx.channel());
        if (playerUuid != null) {
            String playerName = "";
            ClientConnection connection = plugin.getVoiceManager().getConnection(playerUuid);
            if (connection != null) {
                playerName = connection.getPlayerName();
            }
            
            plugin.getVoiceManager().removeConnection(playerUuid);

            // 通知其他玩家
            for (ClientConnection conn : plugin.getVoiceManager().getConnections()) {
                sendJson(conn.getChannel(), "player_leave", Map.of(
                        "uuid", playerUuid.toString(),
                        "name", playerName
                ));
            }
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        plugin.getLogger().warning("WebSocket error: " + cause.getMessage());
        ctx.close();
    }
}
