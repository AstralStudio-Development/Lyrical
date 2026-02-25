package moe.illusory.lyrical.command;

import moe.illusory.lyrical.Lyrical;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

public class LyricalCommand implements CommandExecutor {

    private final Lyrical plugin;

    public LyricalCommand(Lyrical plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, @NotNull String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("This command can only be used by players.").color(NamedTextColor.RED));
            return true;
        }

        // 生成 Token
        String token = plugin.getTokenManager().generateToken(player.getUniqueId(), player.getName());
        String url = plugin.getTokenManager().getConnectUrl(token);

        // 发送可点击的链接
        Component message = Component.text()
                .append(Component.text("[Lyrical] ").color(NamedTextColor.GOLD))
                .append(Component.text("Click here to connect to voice chat: ").color(NamedTextColor.WHITE))
                .append(Component.text(url)
                        .color(NamedTextColor.AQUA)
                        .decorate(TextDecoration.UNDERLINED)
                        .clickEvent(ClickEvent.openUrl(url)))
                .build();

        player.sendMessage(message);

        Component expireMessage = Component.text()
                .append(Component.text("[Lyrical] ").color(NamedTextColor.GOLD))
                .append(Component.text("This link will expire in " + plugin.getLyricalConfig().getTokenExpire() + " seconds.").color(NamedTextColor.GRAY))
                .build();

        player.sendMessage(expireMessage);

        return true;
    }
}
