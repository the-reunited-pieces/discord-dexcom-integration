import { Client, Events } from "discord.js";

const client = new Client({ intents: 0 });

const promise = new Promise<Client<true>>((res) => client.on(Events.ClientReady, res));
await client.login(Bun.env.DISCORD_TOKEN);
const bot = await promise;

console.log(`Bot started as ${bot.user.tag}`);
