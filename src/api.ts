import z from "zod";
import { db } from "./db";

async function makeRequest<T extends z.ZodObject>(
    id: string,
    path: string,
    validator: T,
): Promise<{ error: string; value: null } | { error: null; value: z.infer<T> }> {
    const doc = await db.users.findOne({ id });
    if (!doc || doc.expires_at <= Date.now()) return { error: "auth", value: null };

    const res = await fetch(`${Bun.env.DEXCOM_API}/v3/users/self${path}`, { headers: { Authorization: `Bearer ${doc.access_token}` } });

    if (res.status === 401 || res.status === 403) return { error: "auth", value: null };

    if (!res.ok) return { error: "dexcom", value: null };

    const data = await res
        .json()
        .then(async (data) => await validator.parseAsync(data))
        .catch(() => null);

    if (data === null) return { error: "parse", value: null };

    return { error: null, value: data };
}

export const api = {
    egvs: async (id: string, start: Date, end: Date) =>
        await makeRequest(
            id,
            `/egvs?${new URLSearchParams({ startDate: start.toISOString().slice(0, -1), endDate: end.toISOString().slice(0, -1) })}`,
            egvsValidator,
        ),
    dataRange: async (id: string) => await makeRequest(id, "/dataRange", dataRangeValidator),
};

const systemAndDisplayTime = z.object({
    systemTime: z.string(),
    displayTime: z.string(),
});

const startAndEnd = z.object({
    start: systemAndDisplayTime,
    end: systemAndDisplayTime,
});

const dataRangeValidator = z.object({
    recordType: z.literal("dataRange"),
    recordVersion: z.string(),
    userId: z.string(),
    calibrations: startAndEnd.optional(),
    egvs: startAndEnd.optional(),
    events: startAndEnd.optional(),
});

const egvsValidator = z.object({
    recordType: z.literal("egv"),
    recordVersion: z.string(),
    userId: z.string(),
    records: z
        .object({
            recordId: z.string(),
            systemTime: z.string(),
            displayTime: z.string(),
            transmitterId: z.string().optional(),
            transmitterTicks: z.number(),
            value: z.number().optional(),
            status: z.string().optional(),
            trend: z.string().optional(),
            trendRate: z.number().optional(),
            unit: z.literal("mg/dL"),
            rateUnit: z.literal("mg/dL/min"),
            displayDevice: z.string(),
            transmitterGeneration: z.string(),
            transmitterGenerationVariant: z.string().optional(),
            displayApp: z.string().optional(),
        })
        .transform((obj) => ({
            ...obj,
            valueInMgdl: obj.value,
            valueInMmoll: obj.value === undefined ? undefined : obj.value / 18,
            rateInMgdlmin: obj.trendRate,
            rateInMmollmin: obj.trendRate === undefined ? undefined : obj.trendRate / 18,
        }))
        .array(),
});
