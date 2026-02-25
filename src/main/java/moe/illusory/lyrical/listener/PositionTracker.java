package moe.illusory.lyrical.listener;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import moe.illusory.lyrical.Lyrical;
import moe.illusory.lyrical.network.ClientConnection;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PositionTracker {

    private static final Gson GSON = new Gson();

    private final Lyrical plugin;
    private BukkitTask task;

    public PositionTracker(Lyrical plugin) {
        this.plugin = plugin;
    }

    public void start() {
        int interval = plugin.getLyricalConfig().getPositionUpdateInterval();
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::updatePositions, interval, interval);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void updatePositions() {
        List<Map<String, Object>> positions = new ArrayList<>();

        for (ClientConnection connection : plugin.getVoiceManager().getConnections()) {
            Player player = Bukkit.getPlayer(connection.getPlayerUuid());
            if (player == null || !player.isOnline()) continue;

            // 更新服务端状态
            connection.getState().updatePosition(player.getLocation());

            // 收集位置数据
            positions.add(Map.of(
                    "uuid", connection.getPlayerUuid().toString(),
                    "x", player.getLocation().getX(),
                    "y", player.getLocation().getY(),
                    "z", player.getLocation().getZ(),
                    "yaw", player.getLocation().getYaw(),
                    "pitch", player.getLocation().getPitch(),
                    "world", player.getWorld().getName()
            ));
        }

        if (positions.isEmpty()) return;

        // 广播位置更新
        JsonObject json = new JsonObject();
        json.addProperty("type", "position");
        json.add("data", GSON.toJsonTree(Map.of("players", positions)));
        String message = json.toString();

        for (ClientConnection connection : plugin.getVoiceManager().getConnections()) {
            if (connection.isConnected()) {
                connection.getChannel().writeAndFlush(new TextWebSocketFrame(message));
            }
        }
    }
}
