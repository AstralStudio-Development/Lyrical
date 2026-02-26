package moe.illusory.lyrical.voice;

import moe.illusory.lyrical.Lyrical;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 管理玩家说话时的 nametag 喇叭图标显示
 */
public class SpeakingIndicator {

    private static final String SPEAKING_SUFFIX = " §a\uD83D\uDD0A";
    private static final String MUTED_SUFFIX = " §c\uD83D\uDD07";
    private static final long SPEAKING_TIMEOUT_TICKS = 10L; // 0.5秒后移除图标

    private final Lyrical plugin;
    private final Map<UUID, Long> speakingPlayers = new ConcurrentHashMap<>();
    private final Map<UUID, BukkitTask> timeoutTasks = new ConcurrentHashMap<>();
    private final Set<UUID> mutedPlayers = ConcurrentHashMap.newKeySet();
    private Scoreboard scoreboard;
    private Team speakingTeam;
    private Team mutedTeam;

    public SpeakingIndicator(Lyrical plugin) {
        this.plugin = plugin;
    }

    public void init() {
        // 在主线程初始化 Scoreboard
        Bukkit.getScheduler().runTask(plugin, () -> {
            scoreboard = Bukkit.getScoreboardManager().getMainScoreboard();
            
            // 获取或创建说话中的 Team
            speakingTeam = scoreboard.getTeam("lyrical_speaking");
            if (speakingTeam == null) {
                speakingTeam = scoreboard.registerNewTeam("lyrical_speaking");
            }
            speakingTeam.setPrefix("");
            speakingTeam.setSuffix(SPEAKING_SUFFIX);
            
            // 获取或创建静音的 Team
            mutedTeam = scoreboard.getTeam("lyrical_muted");
            if (mutedTeam == null) {
                mutedTeam = scoreboard.registerNewTeam("lyrical_muted");
            }
            mutedTeam.setPrefix("");
            mutedTeam.setSuffix(MUTED_SUFFIX);
            
            // 清理可能残留的玩家
            for (String entry : speakingTeam.getEntries()) {
                speakingTeam.removeEntry(entry);
            }
            for (String entry : mutedTeam.getEntries()) {
                mutedTeam.removeEntry(entry);
            }
        });
    }

    public void shutdown() {
        // 清理所有任务
        for (BukkitTask task : timeoutTasks.values()) {
            task.cancel();
        }
        timeoutTasks.clear();
        speakingPlayers.clear();
        mutedPlayers.clear();

        // 直接移除所有玩家的状态（onDisable 已经在主线程）
        if (speakingTeam != null) {
            for (String entry : speakingTeam.getEntries()) {
                speakingTeam.removeEntry(entry);
            }
        }
        if (mutedTeam != null) {
            for (String entry : mutedTeam.getEntries()) {
                mutedTeam.removeEntry(entry);
            }
        }
    }

    /**
     * 设置玩家静音状态
     */
    public void setMuted(UUID playerUuid, boolean muted) {
        // 检查功能是否启用
        if (!plugin.getLyricalConfig().isShowSpeakingIndicator()) {
            return;
        }
        
        if (muted) {
            mutedPlayers.add(playerUuid);
            // 从说话 Team 移除
            removeSpeakingInternal(playerUuid);
        } else {
            mutedPlayers.remove(playerUuid);
        }
        
        // 检查插件是否启用
        if (!plugin.isEnabled()) {
            return;
        }
        
        // 在主线程更新 Team
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(playerUuid);
            if (player == null) return;
            
            if (muted) {
                // 添加到静音 Team
                if (mutedTeam != null && !mutedTeam.hasEntry(player.getName())) {
                    speakingTeam.removeEntry(player.getName());
                    mutedTeam.addEntry(player.getName());
                }
            } else {
                // 从静音 Team 移除
                if (mutedTeam != null) {
                    mutedTeam.removeEntry(player.getName());
                }
            }
        });
    }

    /**
     * 标记玩家正在说话
     */
    public void markSpeaking(UUID playerUuid) {
        // 检查功能是否启用
        if (!plugin.getLyricalConfig().isShowSpeakingIndicator()) {
            return;
        }
        
        // 如果玩家静音或插件禁用，不显示说话图标
        if (mutedPlayers.contains(playerUuid) || !plugin.isEnabled()) {
            return;
        }
        
        speakingPlayers.put(playerUuid, System.currentTimeMillis());

        // 取消之前的超时任务
        BukkitTask existingTask = timeoutTasks.remove(playerUuid);
        if (existingTask != null) {
            existingTask.cancel();
        }

        // 在主线程添加到 Team
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(playerUuid);
            if (player != null && speakingTeam != null) {
                if (!speakingTeam.hasEntry(player.getName())) {
                    speakingTeam.addEntry(player.getName());
                }
            }
        });

        // 设置超时任务
        BukkitTask timeoutTask = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            removeSpeaking(playerUuid);
        }, SPEAKING_TIMEOUT_TICKS);
        timeoutTasks.put(playerUuid, timeoutTask);
    }

    /**
     * 移除玩家的说话状态
     */
    private void removeSpeaking(UUID playerUuid) {
        removeSpeakingInternal(playerUuid);

        // 检查插件是否启用
        if (!plugin.isEnabled()) {
            return;
        }

        // 在主线程从 Team 移除
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(playerUuid);
            if (player != null && speakingTeam != null) {
                speakingTeam.removeEntry(player.getName());
            }
        });
    }
    
    private void removeSpeakingInternal(UUID playerUuid) {
        speakingPlayers.remove(playerUuid);
        BukkitTask task = timeoutTasks.remove(playerUuid);
        if (task != null) {
            task.cancel();
        }
    }

    /**
     * 玩家断开连接时清理状态
     */
    public void removePlayer(UUID playerUuid) {
        removeSpeakingInternal(playerUuid);
        mutedPlayers.remove(playerUuid);
        
        // 检查插件是否启用
        if (!plugin.isEnabled()) {
            // 插件禁用时直接操作（已在主线程）
            Player player = Bukkit.getPlayer(playerUuid);
            if (player != null) {
                if (speakingTeam != null) {
                    speakingTeam.removeEntry(player.getName());
                }
                if (mutedTeam != null) {
                    mutedTeam.removeEntry(player.getName());
                }
            }
            return;
        }
        
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(playerUuid);
            if (player != null) {
                if (speakingTeam != null) {
                    speakingTeam.removeEntry(player.getName());
                }
                if (mutedTeam != null) {
                    mutedTeam.removeEntry(player.getName());
                }
            }
        });
    }

    /**
     * 检查玩家是否正在说话
     */
    public boolean isSpeaking(UUID playerUuid) {
        return speakingPlayers.containsKey(playerUuid);
    }
}
