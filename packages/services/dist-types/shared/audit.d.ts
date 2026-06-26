type AuditValue = string | number | boolean | null | undefined;
export declare function recordWorkspaceAuditEventSync(input: {
    workspaceId: string;
    title: string;
    note: string;
    code?: string;
    data?: Record<string, AuditValue>;
}): void;
export declare function tryRecordWorkspaceAuditEventSync(input: {
    workspaceId: string;
    title: string;
    note: string;
    code?: string;
    data?: Record<string, AuditValue>;
}): boolean;
export {};
