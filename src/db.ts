import { MongoClient } from "mongodb";

const client = new MongoClient(Bun.env.MONGODB_URI!);
await client.connect();

const database = client.db();
export const session = client.startSession();

export const db = {
    tokens: database.collection<{ id: string; access_token: string; refresh_token: string; expires_at: number }>("tokens"),
};
