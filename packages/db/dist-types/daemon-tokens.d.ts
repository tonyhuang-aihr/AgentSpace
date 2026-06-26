import type { DaemonApiTokenRecord } from "./types.ts";
export declare function createDaemonApiTokenSync(input: {
    workspaceId?: string;
    label: string;
    createdBy: string;
}): DaemonApiTokenRecord & {
    token: string;
};
export declare function listDaemonApiTokensSync(workspaceId?: string): DaemonApiTokenRecord[];
export declare function readDaemonApiTokenSync(id: string): DaemonApiTokenRecord | null;
export declare function validateDaemonApiTokenSync(token: string): DaemonApiTokenRecord | null;
export declare function revokeDaemonApiTokenSync(id: string): DaemonApiTokenRecord;
