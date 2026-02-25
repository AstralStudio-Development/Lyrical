package moe.illusory.lyrical.listener;

import moe.illusory.lyrical.Lyrical;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

public class PlayerListener implements Listener {

    private final Lyrical plugin;

    public PlayerListener(Lyrical plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        // 玩家退出时断开语音连接
        plugin.getVoiceManager().removeConnection(event.getPlayer().getUniqueId());
    }
}
