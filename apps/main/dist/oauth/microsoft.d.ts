import type { Account } from '@gingermail/core';
export interface MicrosoftAuthOutcome {
    account: Account;
    tokens: {
        access_token: string;
        refresh_token?: string;
        expires_on?: number;
        home_account_id?: string;
    };
}
export declare class MicrosoftOAuthFlow {
    private readonly clientId;
    private readonly tenant;
    constructor(clientId: string, tenant?: string);
    run(): Promise<MicrosoftAuthOutcome>;
}
//# sourceMappingURL=microsoft.d.ts.map