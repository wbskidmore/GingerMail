export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
export declare function ok<T>(value: T): Result<T, never>;
export declare function err<E>(error: E): Result<never, E>;
export declare function tryOr<T>(fn: () => T, fallback: T): T;
export declare function tryOrAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T>;
//# sourceMappingURL=result.d.ts.map