package moe.illusory.lyrical.auth;

import moe.illusory.lyrical.Lyrical;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class TokenManager {

    private final Lyrical plugin;
    private final Map<String, TokenData> tokens;
    private final Map<UUID, String> playerNames;
    private final SecureRandom random;

    public TokenManager(Lyrical plugin) {
        this.plugin = plugin;
        this.tokens = new ConcurrentHashMap<>();
        this.playerNames = new ConcurrentHashMap<>();
        this.random = new SecureRandom();
    }

    public String generateToken(UUID playerUuid, String playerName) {
        // 生成随机 token
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        // 存储 token 数据
        long expireTime = System.currentTimeMillis() + (plugin.getLyricalConfig().getTokenExpire() * 1000L);
        tokens.put(token, new TokenData(playerUuid, expireTime));
        playerNames.put(playerUuid, playerName);

        return token;
    }

    public UUID validateToken(String token) {
        TokenData data = tokens.remove(token);
        if (data == null) {
            return null;
        }

        // 检查是否过期
        if (System.currentTimeMillis() > data.expireTime) {
            return null;
        }

        return data.playerUuid;
    }

    public String getPlayerName(UUID playerUuid) {
        return playerNames.getOrDefault(playerUuid, "Unknown");
    }

    public void cleanExpiredTokens() {
        long now = System.currentTimeMillis();
        tokens.entrySet().removeIf(entry -> now > entry.getValue().expireTime);
    }

    public String getConnectUrl(String token) {
        String host = plugin.getLyricalConfig().getExternalHost();
        int port = plugin.getLyricalConfig().getPort();
        return "http://" + host + ":" + port + "/?token=" + token;
    }

    private record TokenData(UUID playerUuid, long expireTime) {}
}
