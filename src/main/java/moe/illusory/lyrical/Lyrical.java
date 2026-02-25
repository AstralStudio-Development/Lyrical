package moe.illusory.lyrical;

import moe.illusory.lyrical.auth.TokenManager;
import moe.illusory.lyrical.command.LyricalCommand;
import moe.illusory.lyrical.config.LyricalConfig;
import moe.illusory.lyrical.listener.PlayerListener;
import moe.illusory.lyrical.listener.PositionTracker;
import moe.illusory.lyrical.network.NettyServer;
import moe.illusory.lyrical.voice.VoiceManager;
import org.bukkit.plugin.java.JavaPlugin;

public final class Lyrical extends JavaPlugin {

    private LyricalConfig lyricalConfig;
    private TokenManager tokenManager;
    private VoiceManager voiceManager;
    private NettyServer nettyServer;
    private PositionTracker positionTracker;

    @Override
    public void onEnable() {
        // 加载配置
        lyricalConfig = new LyricalConfig(this);

        // 初始化管理器
        tokenManager = new TokenManager(this);
        voiceManager = new VoiceManager(this);

        // 启动 Netty 服务器
        nettyServer = new NettyServer(this, lyricalConfig.getPort());
        nettyServer.start();

        // 启动位置追踪
        positionTracker = new PositionTracker(this);
        positionTracker.start();

        // 注册命令
        var command = getCommand("lyrical");
        if (command != null) {
            command.setExecutor(new LyricalCommand(this));
        }

        // 注册事件监听
        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        getLogger().info("Lyrical enabled!");
    }

    @Override
    public void onDisable() {
        // 停止位置追踪
        if (positionTracker != null) {
            positionTracker.stop();
        }

        // 关闭语音管理器
        if (voiceManager != null) {
            voiceManager.shutdown();
        }

        // 关闭 Netty 服务器
        if (nettyServer != null) {
            nettyServer.shutdown();
        }

        getLogger().info("Lyrical disabled!");
    }

    public LyricalConfig getLyricalConfig() {
        return lyricalConfig;
    }

    public TokenManager getTokenManager() {
        return tokenManager;
    }

    public VoiceManager getVoiceManager() {
        return voiceManager;
    }
}
