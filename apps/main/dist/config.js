let cached;
export function getBuildConfig() {
    if (cached)
        return cached;
    cached = {
        googleClientId: process.env.GM_GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GM_GOOGLE_CLIENT_SECRET,
        microsoftClientId: process.env.GM_MICROSOFT_CLIENT_ID,
        microsoftTenant: process.env.GM_MICROSOFT_TENANT ?? 'common',
    };
    return cached;
}
//# sourceMappingURL=config.js.map