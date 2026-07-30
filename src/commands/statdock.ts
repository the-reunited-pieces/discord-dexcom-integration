import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import assert from "node:assert";
import { db } from "../db";

export async function handleStatdock(cmd: ChatInputCommandInteraction) {
    assert(cmd.guild !== null);

    if (cmd.options.getSubcommand() === "create") {
        const channel = await cmd.guild.channels.fetch(cmd.options.getChannel("channel", true).id).catch(() => null);
        const template = cmd.options.getString("template", true);

        if (channel === null) return await cmd.reply({ flags: MessageFlags.Ephemeral, content: "Error fetching that channel. Please try again." });

        if (!/\{mg\/dl\}|\{mmol\/l\}/i.test(template))
            return await cmd.reply({ flags: MessageFlags.Ephemeral, content: "Your template must include {mg/dL} and/or {mmol/L}." });

        await db.statdocks.updateOne({ channelId: channel.id }, { $set: { userId: cmd.user.id, template } }, { upsert: true });

        await cmd.reply({ flags: MessageFlags.Ephemeral, content: "Your statdock has been configured. It will be automatically updated soon." });
    } else if (cmd.options.getSubcommand() === "delete") {
        const channel = cmd.options.getChannel("channel", true);
        const { deletedCount } = await db.statdocks.deleteOne({ channelId: channel.id });

        await cmd.reply({
            flags: MessageFlags.Ephemeral,
            content:
                deletedCount > 0
                    ? "Your statdock has been deleted. The channel name will no longer automatically update, but the channel has not been deleted."
                    : "That is not a statdock.",
        });
    }
}
