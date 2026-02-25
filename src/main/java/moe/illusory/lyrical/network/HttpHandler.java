package moe.illusory.lyrical.network;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.*;
import io.netty.util.CharsetUtil;
import moe.illusory.lyrical.Lyrical;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class HttpHandler extends SimpleChannelInboundHandler<FullHttpRequest> {

    private final Lyrical plugin;

    public HttpHandler(Lyrical plugin) {
        this.plugin = plugin;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) throws Exception {
        String uri = request.uri();
        
        // WebSocket 升级请求，传递给下一个处理器
        if (uri.startsWith("/ws")) {
            ctx.fireChannelRead(request.retain());
            return;
        }

        // 处理静态文件请求
        String path = uri.split("\\?")[0]; // 移除查询参数
        if (path.equals("/")) {
            path = "/index.html";
        }

        // 从资源加载文件
        String resourcePath = "web" + path;
        byte[] content = loadResource(resourcePath);

        if (content == null) {
            sendError(ctx, HttpResponseStatus.NOT_FOUND);
            return;
        }

        String contentType = getContentType(path);
        FullHttpResponse response = new DefaultFullHttpResponse(
                HttpVersion.HTTP_1_1,
                HttpResponseStatus.OK,
                Unpooled.wrappedBuffer(content)
        );

        response.headers().set(HttpHeaderNames.CONTENT_TYPE, contentType);
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, content.length);
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");

        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
    }

    private byte[] loadResource(String path) {
        try (InputStream is = plugin.getClass().getClassLoader().getResourceAsStream(path)) {
            if (is == null) {
                return null;
            }
            return is.readAllBytes();
        } catch (Exception e) {
            return null;
        }
    }

    private String getContentType(String path) {
        if (path.endsWith(".html")) {
            return "text/html; charset=UTF-8";
        } else if (path.endsWith(".css")) {
            return "text/css; charset=UTF-8";
        } else if (path.endsWith(".js")) {
            return "application/javascript; charset=UTF-8";
        } else if (path.endsWith(".json")) {
            return "application/json; charset=UTF-8";
        } else if (path.endsWith(".png")) {
            return "image/png";
        } else if (path.endsWith(".ico")) {
            return "image/x-icon";
        } else if (path.endsWith(".wasm")) {
            return "application/wasm";
        }
        return "application/octet-stream";
    }

    private void sendError(ChannelHandlerContext ctx, HttpResponseStatus status) {
        ByteBuf content = Unpooled.copiedBuffer("404 Not Found", CharsetUtil.UTF_8);
        FullHttpResponse response = new DefaultFullHttpResponse(
                HttpVersion.HTTP_1_1,
                status,
                content
        );
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain; charset=UTF-8");
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, content.readableBytes());
        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        ctx.close();
    }
}
