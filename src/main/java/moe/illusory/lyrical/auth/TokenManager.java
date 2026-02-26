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
    private final Map<String, SessionData> sessions;
    private final Map<UUID, String> playerNames;
    private final SecureRandom random;

    public TokenManager(Lyrical plugin) {
        this.plugin = plugin;
        this.tokens = new ConcurrentHashMap<>();
        this.sessions = new ConcurrentHashMap<>();
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

    /**
     * 生成 session token，用于刷新页面后重新连接
     */
    public String generateSessionToken(UUID playerUuid) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String sessionToken = "session_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        // Session token 有效期更长（1小时）
        long expireTime = System.currentTimeMillis() + (60 * 60 * 1000L);
        sessions.put(sessionToken, new SessionData(playerUuid, expireTime));

        return sessionToken;
    }

    /**
     * 验证 session token，不会删除（可重复使用）
     */
    public UUID validateSessionToken(String sessionToken) {
        SessionData data = sessions.get(sessionToken);
        if (data == null) {
            return null;
        }

        // 检查是否过期
        if (System.currentTimeMillis() > data.expireTime) {
            sessions.remove(sessionToken);
            return null;
        }

        return data.playerUuid;
    }

    /**
     * 使 session token 失效
     */
    public void invalidateSessionToken(String sessionToken) {
        sessions.remove(sessionToken);
    }

    /**
     * 使玩家的所有 session token 失效
     */
    public void invalidatePlayerSessions(UUID playerUuid) {
        sessions.entrySet().removeIf(entry -> entry.getValue().playerUuid.equals(playerUuid));
    }

    public String getPlayerName(UUID playerUuid) {
        return playerNames.getOrDefault(playerUuid, "Unknown");
    }

    public void cleanExpiredTokens() {
        long now = System.currentTimeMillis();
        tokens.entrySet().removeIf(entry -> now > entry.getValue().expireTime);
        sessions.entrySet().removeIf(entry -> now > entry.getValue().expireTime);
    }

    public String getConnectUrl(String token) {
        String host = plugin.getLyricalConfig().getExternalHost();
        int port = plugin.getLyricalConfig().getExternalPort();
        String protocol = plugin.getLyricalConfig().isUseHttps() ? "https" : "http";
        return protocol + "://" + host + ":" + port + "/?token=" + token;
    }

    private record TokenData(UUID playerUuid, long expireTime) {}
    private record SessionData(UUID playerUuid, long expireTime) {}
}
