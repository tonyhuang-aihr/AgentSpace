export interface GoogleWorkspaceReadiness {
    checkedAt: string;
    executor: string;
    agentSpaceOutput: CommandReadiness;
    gws: CommandReadiness;
    bwrap: CommandReadiness & {
        supportsPerms?: boolean;
    };
}
export interface CommandReadiness {
    available: boolean;
    path?: string;
    version?: string;
    error?: string;
}
export declare function readGoogleWorkspaceReadiness(environment?: NodeJS.ProcessEnv): GoogleWorkspaceReadiness;
