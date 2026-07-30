import { Client, Events } from "discord.js";
import { commands } from "./commands";
import { handleDump } from "./commands/dump";
import { handleLogin } from "./commands/login";
import { lookupStateEntry } from "./state-cache";
import { db } from "./db";
import z from "zod";

process.on("uncaughtException", (err) => console.error(err));

const tokenResponseValidator = z.object({
    access_token: z.string(),
    expires_in: z.number(),
    token_type: z.literal("Bearer"),
    refresh_token: z.string(),
});

const client = new Client({ intents: 0 });

const promise = new Promise<Client<true>>((res) => client.on(Events.ClientReady, res));
await client.login(Bun.env.DISCORD_TOKEN);
const bot = await promise;

console.log(`Bot started as ${bot.user.tag}`);

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "dump") {
            await handleDump(interaction);
        } else if (interaction.commandName === "login") {
            await handleLogin(interaction);
        }
    }
});

await bot.application.commands.set(commands);

const server = Bun.serve({
    port: Bun.env.PORT ?? 3000,
    routes: {
        "/auth-callback": {
            GET: async (req) => {
                const url = new URL(req.url);

                const error = url.searchParams.get("error");
                const code = url.searchParams.get("code");
                const state = url.searchParams.get("state");

                if (error === "access_denied") return Response.redirect("/access-denied");
                if (!code || !state) return Response.redirect("/missing-data");

                const id = lookupStateEntry(state);
                if (!id) return Response.redirect("/state-mismatch");

                const res = await fetch(`${Bun.env.DEXCOM_API}/v3/oauth2/token`, {
                    method: "post",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: Bun.env.DEXCOM_CLIENT_ID!,
                        client_secret: Bun.env.DEXCOM_CLIENT_SECRET!,
                        code,
                        grant_type: "authorization_code",
                        redirect_uri: Bun.env.OAUTH_REDIRECT!,
                    }),
                });

                if (!res.ok) return Response.redirect("/dexcom-error");

                const data = await res
                    .json()
                    .then(async (data) => await tokenResponseValidator.parseAsync(data))
                    .catch(() => null);

                if (data === null) return Response.redirect("/dexcom-error");

                const { access_token, expires_in, refresh_token } = data;

                await db.tokens.updateOne({ id }, { $set: { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 } }, { upsert: true });

                return Response.redirect("/login-success");
            },
        },
        "/denied-access": Bun.file("./src/pages/denied-access.html"),
        "/missing-data": Bun.file("./src/pages/missing-data.html"),
        "/state-mismatch": Bun.file("./src/pages/state-mismatch.html"),
        "/dexcom-error": Bun.file("./src/pages/dexcom-error.html"),
        "/login-success": Bun.file("./src/pages/login-success.html"),
    },
});

console.log(`Server started at ${server.url}`);
