package moe.illusory.lyrical.config;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public class LyricalConfig {

    private final JavaPlugin plugin;

    // 服务器设置
    private int port;
    private String externalHost;
    private int externalPort;
    private boolean useHttps;
    private int tokenExpire;

    // 语音设置
    private double maxDistance;
    private double fadeDistance;
    private int positionUpdateInterval;
    private int sampleRate;
    private int bitrate;
    private boolean showSpeakingIndicator;

    // 群组设置
    private boolean groupEnabled;
    private int maxGroups;
    private int maxMembers;

    public LyricalConfig(JavaPlugin plugin) {
        this.plugin = plugin;
        load();
    }

    public void load() {
        plugin.saveDefaultConfig();
        plugin.reloadConfig();
        FileConfiguration config = plugin.getConfig();

        // 服务器设置
        this.port = config.getInt("server.port", 25566);
        this.externalHost = config.getString("server.external-host", "localhost");
        this.externalPort = config.getInt("server.external-port", 0);
        this.useHttps = config.getBoolean("server.use-https", false);
        this.tokenExpire = config.getInt("server.token-expire", 300);

        // 语音设置
        this.maxDistance = config.getDouble("voice.max-distance", 48.0);
        this.fadeDistance = config.getDouble("voice.fade-distance", 8.0);
        this.positionUpdateInterval = config.getInt("voice.position-update-interval", 5);
        this.sampleRate = config.getInt("voice.sample-rate", 48000);
        this.bitrate = config.getInt("voice.bitrate", 64000);
        this.showSpeakingIndicator = config.getBoolean("voice.show-speaking-indicator", true);

        // 群组设置
        this.groupEnabled = config.getBoolean("group.enabled", true);
        this.maxGroups = config.getInt("group.max-groups", 100);
        this.maxMembers = config.getInt("group.max-members", 50);
    }

    public int getPort() {
        return port;
    }

    public String getExternalHost() {
        return externalHost;
    }

    public int getExternalPort() {
        return externalPort > 0 ? externalPort : port;
    }

    public boolean isUseHttps() {
        return useHttps;
    }

    public int getTokenExpire() {
        return tokenExpire;
    }

    public double getMaxDistance() {
        return maxDistance;
    }

    public double getFadeDistance() {
        return fadeDistance;
    }

    public int getPositionUpdateInterval() {
        return positionUpdateInterval;
    }

    public int getSampleRate() {
        return sampleRate;
    }

    public int getBitrate() {
        return bitrate;
    }

    public boolean isShowSpeakingIndicator() {
        return showSpeakingIndicator;
    }

    public boolean isGroupEnabled() {
        return groupEnabled;
    }

    public int getMaxGroups() {
        return maxGroups;
    }

    public int getMaxMembers() {
        return maxMembers;
    }
}
