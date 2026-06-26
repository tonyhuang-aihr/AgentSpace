export declare const DEFAULT_WORKSPACE_ID = "default";
export interface PreparedStatementResult {
    changes: number;
}
export interface PreparedStatementLike {
    all(...params: unknown[]): Array<Record<string, unknown>>;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): PreparedStatementResult;
}
export interface PostgresSyncDatabase {
    exec(sql: string): void;
    prepare(sql: string): PreparedStatementLike;
    close(): void;
}
export declare function getDatabase(): PostgresSyncDatabase;
export declare function getDataDirPath(): string;
export declare function getWorkspaceDataDirPath(workspaceId?: string): string;
export declare function getDatabaseConnectionLabel(): string;
export declare function resetDatabaseForTests(): void;
export declare function withTransaction<T>(db: PostgresSyncDatabase, work: () => T): T;
export declare function countRows(db: PostgresSyncDatabase, tableName: string): number;
export declare function readMetadataValue(db: PostgresSyncDatabase, key: string): string | undefined;
export declare function randomLikeId(): string;
export declare function resolveRepositoryRoot(): string;
