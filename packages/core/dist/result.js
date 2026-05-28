export function ok(value) {
    return { ok: true, value };
}
export function err(error) {
    return { ok: false, error };
}
export function tryOr(fn, fallback) {
    try {
        return fn();
    }
    catch {
        return fallback;
    }
}
export async function tryOrAsync(fn, fallback) {
    try {
        return await fn();
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=result.js.map