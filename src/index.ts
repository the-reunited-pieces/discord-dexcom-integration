import { Client, Events } from "discord.js";
import { api } from "./api";
import { commands } from "./commands";
import { handleDump } from "./commands/dump";
import { handleLogin } from "./commands/login";
import { handleStatdock } from "./commands/statdock";
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

const trendArrows: Record<string, string> = {
    doubleUp: "⇈",
    singleUp: "↑",
    fortyFiveUp: "↗",
    flat: "→",
    fortyFiveDown: "↘",
    singleDown: "↓",
    doubleDown: "⇊",
    none: "⋯",
    notComputable: "✗",
    rateOutOfRange: "‼",
};

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
        } else if (interaction.commandName === "statdock") {
            await handleStatdock(interaction);
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

                await db.users.updateOne({ id }, { $set: { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 } }, { upsert: true });

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

const lastSyncAt = new Map<string, number>();

async function sync() {
    const statdocks = await db.statdocks.find().toArray();
    const statdocksByUser = new Map<string, typeof statdocks>();

    for (const statdock of statdocks) {
        const { userId } = statdock;

        if (!statdocksByUser.has(userId)) statdocksByUser.set(userId, []);
        statdocksByUser.get(userId)!.push(statdock);
    }

    for await (const user of db.users.find()) {
        let reauth = false;

        if (user.expires_at <= Date.now()) reauth = true;
        else if (user.expires_at <= Date.now() + 10 * 60 * 60 * 1000) {
            const res = await fetch(`${Bun.env.DEXCOM_API}/v3/oauth2/token`, {
                method: "post",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: Bun.env.DEXCOM_CLIENT_ID!,
                    client_secret: Bun.env.DEXCOM_CLIENT_SECRET!,
                    grant_type: "refresh_token",
                    refresh_token: user.refresh_token,
                }),
            });

            if (!res.ok) reauth = true;
            else {
                const data = await res
                    .json()
                    .then(async (data) => await tokenResponseValidator.parseAsync(data))
                    .catch(() => null);

                if (data === null) reauth = true;
                else {
                    const { access_token, expires_in, refresh_token } = data;

                    await db.users.updateOne(
                        { id: user.id },
                        { $set: { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 } },
                        { upsert: true },
                    );
                }
            }
        }

        if (reauth)
            for (const { channelId } of statdocksByUser.get(user.id) ?? []) {
                const channel = await bot.channels.fetch(channelId).catch(() => null);
                if (channel === null || channel.isDMBased()) continue;

                await channel.setName("Please /login again!").catch(() => null);
            }
        else {
            const { start, end } = lastSyncAt.has(user.id)
                ? { start: lastSyncAt.get(user.id)!, end: Date.now() + 24 * 60 * 60 * 1000 }
                : ((await api
                      .dataRange(user.id)
                      .then(({ error, value }) => (error ? null : value?.egvs))
                      .then((value) =>
                          value ? { start: new Date(value.start.systemTime + "Z").getTime(), end: new Date(value.end.systemTime + "Z").getTime() } : null,
                      )
                      .catch(() => null)) ?? { start: Date.now() - 24 * 60 * 60 * 1000, end: Date.now() + 24 * 60 * 60 * 1000 });

            const { error, value } = await api.egvs(user.id, new Date(Math.max(start, end - 30 * 60 * 60 * 1000)), new Date(end));

            if (typeof error === "string") continue;
            if (value.records.length === 0) continue;

            const record = value.records.at(-1)!;

            const newValue = record.valueInMmoll ?? user.lastValueMmoll;
            const newTrend = record.trend ?? user.lastTrend;

            await db.users.updateOne({ id: user.id }, { $set: { lastValueMmoll: newValue, lastTrend: newTrend } });

            for (const { channelId, template } of statdocksByUser.get(user.id) ?? []) {
                const channel = await bot.channels.fetch(channelId).catch(() => null);
                if (channel === null || channel.isDMBased()) continue;

                await channel.setName(
                    template
                        .replace(
                            /\{mg\/dl\}/gi,
                            `${newValue === undefined ? "[unknown]" : Math.round(newValue * 18 * 10) / 10} ${trendArrows[newTrend ?? ""] ?? "⋯"}`,
                        )
                        .replace(
                            /\{mmol\/l\}/gi,
                            `${newValue === undefined ? "[unknown]" : Math.round(newValue * 10) / 10} ${trendArrows[newTrend ?? ""] ?? "⋯"}`,
                        ),
                );
            }
        }
    }
}

sync();

// const INTERVAL = 5 * 60 * 1000;

// setTimeout(
//     () => {
//         sync();
//         setInterval(() => sync(), INTERVAL);
//     },
//     INTERVAL - (Date.now() % INTERVAL),
// );
