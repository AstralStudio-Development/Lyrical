# Lyrical

基于浏览器的 Minecraft 语音聊天插件，无需安装客户端模组。

## 特性

- **无需模组** - 玩家通过浏览器即可进行语音聊天
- **近距离语音** - 声音随距离衰减，支持 3D 空间音频
- **群组功能** - 创建/加入群组，群组内语音不受距离限制
- **简单部署** - 插件内嵌 HTTP/WebSocket 服务器，无需额外配置

## 环境要求

- Java 21+
- Paper/Spigot 1.21+
- 现代浏览器（Chrome、Firefox、Edge）

## 安装

1. 下载 [Releases](https://github.com/yourname/Lyrical/releases) 中的 jar 文件
2. 放入服务器 `plugins` 目录
3. 重启服务器

## 使用方法

1. 玩家在游戏内输入 `/lyrical`
2. 点击聊天中的链接，在浏览器中打开
3. 允许麦克风权限
4. 开始语音聊天

## 配置

```yaml
# config.yml
server:
  port: 25566                    # WebSocket 端口
  external-host: "localhost"     # 外部访问地址
  token-expire: 300              # Token 有效期（秒）

voice:
  max-distance: 48               # 最大传输距离（格）
  fade-distance: 8               # 开始衰减的距离
  position-update-interval: 5    # 位置更新间隔（tick）

group:
  enabled: true                  # 启用群组功能
  max-groups: 100                # 最大群组数量
  max-members: 50                # 每个群组最大人数
```

## 构建

```bash
./gradlew shadowJar
```

生成的文件位于 `build/libs/Lyrical-1.0.0.jar`

## 技术架构

```
浏览器 ◄──WebSocket──► Netty Server ◄──事件──► Paper Plugin
  │                        │
  │                        ├── 音频转发
  │                        ├── 位置同步
  │                        └── 认证管理
  │
  ├── 麦克风采集
  ├── 3D 空间音频
  └── 音量控制
```

## 许可证

MIT License
