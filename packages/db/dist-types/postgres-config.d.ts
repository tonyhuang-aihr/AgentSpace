export interface PostgresConnectionInput {
    databaseUrl?: string;
    env?: NodeJS.ProcessEnv;
}
export declare function resolvePostgresDatabaseUrl(input?: PostgresConnectionInput): string;
export declare function resolvePostgresDirectDatabaseUrl(input?: PostgresConnectionInput): string | undefined;
export declare function redactPostgresDatabaseUrl(databaseUrl: string): string;
