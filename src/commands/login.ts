import { ButtonStyle, type ChatInputCommandInteraction, ComponentType, MessageFlags } from "discord.js";
import { createStateEntryForUser } from "../state-cache";

export async function handleLogin(cmd: ChatInputCommandInteraction) {
    const state = createStateEntryForUser(cmd.user.id);

    await cmd.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components: [
            {
                type: ComponentType.TextDisplay,
                content: "Click the button below to log in via the Dexcom website.",
            },
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Link,
                        url: `${Bun.env.DEXCOM_API}/v3/oauth2/login?client_id=${Bun.env.DEXCOM_CLIENT_ID}&redirect_uri=${Bun.env.OAUTH_REDIRECT}&response_type=code&scope=offline_access&state=${state}`,
                        label: "Log In",
                    },
                ],
            },
        ],
    });
}
