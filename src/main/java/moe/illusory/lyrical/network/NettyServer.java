package moe.illusory.lyrical.network;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.stream.ChunkedWriteHandler;
import moe.illusory.lyrical.Lyrical;

import java.util.logging.Level;

public class NettyServer {

    private final Lyrical plugin;
    private final int port;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;

    public NettyServer(Lyrical plugin, int port) {
        this.plugin = plugin;
        this.port = port;
    }

    public void start() {
        // 优化线程数：boss 1个，worker 根据 CPU 核心数
        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup(Math.max(2, Runtime.getRuntime().availableProcessors()));

        try {
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ChannelPipeline pipeline = ch.pipeline();
                            
                            // HTTP 编解码
                            pipeline.addLast(new HttpServerCodec());
                            pipeline.addLast(new HttpObjectAggregator(65536));
                            pipeline.addLast(new ChunkedWriteHandler());
                            
                            // HTTP 请求处理 (静态文件 + WebSocket 升级)
                            pipeline.addLast(new HttpHandler(plugin));
                            
                            // WebSocket 协议处理，增大帧大小限制
                            pipeline.addLast(new WebSocketServerProtocolHandler("/ws", null, true, 65536 * 2));
                            
                            // WebSocket 消息处理
                            pipeline.addLast(new WebSocketHandler(plugin));
                        }
                    })
                    // 连接队列大小
                    .option(ChannelOption.SO_BACKLOG, 256)
                    // TCP 保活
                    .childOption(ChannelOption.SO_KEEPALIVE, true)
                    // 禁用 Nagle 算法，减少延迟
                    .childOption(ChannelOption.TCP_NODELAY, true)
                    // 发送缓冲区
                    .childOption(ChannelOption.SO_SNDBUF, 65536)
                    // 接收缓冲区
                    .childOption(ChannelOption.SO_RCVBUF, 65536);

            ChannelFuture future = bootstrap.bind(port).sync();
            serverChannel = future.channel();
            plugin.getLogger().info("Lyrical server started on port " + port);

        } catch (Exception e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to start Lyrical server", e);
            shutdown();
        }
    }

    public void shutdown() {
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }
        plugin.getLogger().info("Lyrical server stopped");
    }
}
