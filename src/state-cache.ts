const cache = new Map<string, string>();

export function createStateEntryForUser(id: string) {
    const state = new Array(32)
        .fill(0)
        .map(() => "abcdef0123456789"[Math.floor(Math.random() * 16)])
        .join("");

    cache.set(state, id);
    setTimeout(() => cache.delete(state), 10 * 60 * 1000);
    return state;
}

export function lookupStateEntry(state: string) {
    return cache.get(state);
}
