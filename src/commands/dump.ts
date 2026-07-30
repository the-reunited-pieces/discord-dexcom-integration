import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { api } from "../api";

export async function handleDump(cmd: ChatInputCommandInteraction) {
    const { error, value } = await api.egvs(cmd.user.id, new Date(Date.now() - 5 * 60 * 60 * 1000), new Date(Date.now() - 4 * 60 * 60 * 1000));

    if (error !== null)
        return await cmd.reply({
            flags: MessageFlags.Ephemeral,
            content:
                {
                    auth: "An authentication-related error occurred. Please log in again using </login:1532238192592420985>.",
                    dexcom: "Dexcom rejected this request. This is probably our error.",
                    parse: "The response from Dexcom had an OK status but the data failed the validation or was not a valid JSON object.",
                }[error] ?? "An unknown error has occurred.",
        });

    await cmd.reply({
        files: [{ attachment: Buffer.from(JSON.stringify(value, null, 4)), name: "data.json" }],
    });
}
