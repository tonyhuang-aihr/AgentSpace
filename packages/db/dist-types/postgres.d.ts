import { type PostgresTableName } from "./postgres-schema.ts";
import { redactPostgresDatabaseUrl, resolvePostgresDatabaseUrl, type PostgresConnectionInput } from "./postgres-config.ts";
type DatabaseSync = import("node:sqlite").DatabaseSync;
type JsonColumnName = "human_member_names_json" | "employee_names_json" | "traits_json" | "labels_json" | "profile_json" | "state_json" | "metadata_json" | "config_json" | "input_json" | "result_json" | "registry_json" | "command_plan_json" | "options_json" | "snapshot_json" | "audit_data_json" | "data_json" | "source_event_ids_json";
export type { PostgresConnectionInput } from "./postgres-config.ts";
export interface PostgresStatus {
    engine: "postgres";
    databaseUrl: string;
    schemaVersion: string;
    tables: Array<{
        tableName: PostgresTableName;
        rowCount: number;
    }>;
}
export interface MigrationTableReport {
    tableName: string;
    sourceCount: number;
    insertedCount: number;
    skippedCount: number;
}
export interface SqliteToPostgresMigrationReport {
    sourceSqlitePath: string;
    targetDatabaseUrl?: string;
    sourceSchemaVersion: string;
    targetSchemaVersion: string;
    dryRun: boolean;
    reset: boolean;
    startedAt: string;
    finishedAt: string;
    warnings: string[];
    tables: MigrationTableReport[];
}
export interface SqliteToPostgresMigrationInput extends PostgresConnectionInput {
    sqlitePath?: string;
    dryRun?: boolean;
    reset?: boolean;
}
export interface PostgresToPostgresMigrationInput {
    sourceDatabaseUrl: string;
    targetDatabaseUrl: string;
    dryRun?: boolean;
    reset?: boolean;
}
export interface PostgresToPostgresMigrationReport {
    sourceDatabaseUrl: string;
    targetDatabaseUrl: string;
    dryRun: boolean;
    reset: boolean;
    startedAt: string;
    finishedAt: string;
    tables: Array<{
        tableName: string;
        sourceCount: number;
        insertedCount: number;
        skippedCount: number;
    }>;
}
type MigrationRow = Record<string, unknown>;
interface TableMigrationSnapshot {
    tableName: string;
    conflictColumns: string[];
    jsonColumns: JsonColumnName[];
    rows: MigrationRow[];
}
export { redactPostgresDatabaseUrl, resolvePostgresDatabaseUrl };
export declare function ensurePostgresSchema(input?: PostgresConnectionInput): Promise<PostgresStatus>;
export declare function getPostgresStatus(input?: PostgresConnectionInput): Promise<PostgresStatus>;
export declare function migrateSqliteToPostgres(input?: SqliteToPostgresMigrationInput): Promise<SqliteToPostgresMigrationReport>;
export declare function migratePostgresToPostgres(input: PostgresToPostgresMigrationInput): Promise<PostgresToPostgresMigrationReport>;
export declare function collectSqliteMigrationSnapshotSync(sourceDb: DatabaseSync, fallbackTimestamp?: string): {
    tables: TableMigrationSnapshot[];
    warnings: string[];
};
export declare function renderPostgresCutoverPlan(): string;
export declare function getDefaultSqliteMigrationPath(): string;
