import { type ApplicationCommandDataResolvable, ApplicationCommandType, ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";

export const commands: ApplicationCommandDataResolvable[] = [
    {
        type: ApplicationCommandType.ChatInput,
        name: "login",
        description: "Log in via Dexcom OAuth.",
        dmPermission: true,
    },
    {
        type: ApplicationCommandType.ChatInput,
        name: "dump",
        description: "Dump your user data.",
        dmPermission: true,
    },
    {
        type: ApplicationCommandType.ChatInput,
        name: "statdock",
        description: "Statdock management commands.",
        dmPermission: false,
        defaultMemberPermissions: PermissionFlagsBits.Administrator,
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: "create",
                description: "Create a statdock on an existing channel (run on an existing statdock to overwrite the template).",
                options: [
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: "channel",
                        description: "The channel to use as a statdock.",
                        required: true,
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: "template",
                        description: "The template for the statdock name (use {mg/dL} and {mmol/L} as placeholders).",
                        required: true,
                        maxLength: 128,
                    },
                ],
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: "delete",
                description: "Delete a statdock.",
                options: [
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: "channel",
                        description: "The channel whose statdock will be deleted (does not delete the channel itself).",
                        required: true,
                    },
                ],
            },
        ],
    },
];
