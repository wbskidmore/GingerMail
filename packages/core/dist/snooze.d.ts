export interface SnoozePreset {
    id: string;
    label: string;
    compute: (now: Date) => Date;
}
export declare const SNOOZE_PRESETS: SnoozePreset[];
export declare function applySnoozePreset(presetId: string, now?: Date): number | null;
//# sourceMappingURL=snooze.d.ts.map