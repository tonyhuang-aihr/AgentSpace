export declare function findRepositoryRoot(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}): string | null;
export declare function resolveRepositoryRoot(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}): string;
export declare function resolveRepositoryEnvFilePath(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}): string | null;
export declare function readRepositoryEnvValues(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}): Record<string, string>;
export declare function readRepositoryEnvValue(name: string, input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}): string | undefined;
export declare function readEffectiveRuntimeEnv(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
    repositoryOverridesEnv?: boolean;
}): NodeJS.ProcessEnv;
export declare function loadRepositoryEnvIntoProcess(input?: {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
    override?: boolean;
}): void;
export declare function parseDotEnv(raw: string): Record<string, string>;
