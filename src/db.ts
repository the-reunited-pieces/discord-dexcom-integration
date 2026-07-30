import { MongoClient } from "mongodb";

const client = new MongoClient(Bun.env.MONGODB_URI!);
await client.connect();

const database = client.db();
export const session = client.startSession();

export const db = {
    users: database.collection<{
        id: string;
        access_token: string;
        refresh_token: string;
        expires_at: number;
        lastValueMmoll?: number;
        lastTrend?: string;
    }>("users"),
    statdocks: database.collection<{
        userId: string;
        channelId: string;
        template: string;
    }>("statdocks"),
};
