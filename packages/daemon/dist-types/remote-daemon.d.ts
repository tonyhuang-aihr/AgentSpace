export interface RemoteDaemonConfig {
    stateDir: string;
    daemonKey: string;
    deviceName: string;
    runtimeName: string;
    heartbeatIntervalMs: number;
    taskPollIntervalMs: number;
    taskTimeoutMs: number;
    serverUrl?: string;
    daemonToken?: string;
}
export interface RemoteDaemonRelaunchCommand {
    command: string;
    args: string[];
}
export declare function runRemoteDaemonCommand(subcommand: string | undefined, args: string[]): Promise<number>;
export declare function runRemoteDaemonForeground(config: RemoteDaemonConfig): Promise<number>;
export declare function buildRemoteDaemonConfig(flags: Record<string, string | boolean>, options?: {
    environment?: NodeJS.ProcessEnv;
    defaultStateDir?: string;
}): RemoteDaemonConfig;
export declare function printRemoteDaemonHelp(): void;
export declare function buildRemoteDaemonRelaunchCommand(config: RemoteDaemonConfig, options?: {
    argv?: string[];
    execPath?: string;
}): RemoteDaemonRelaunchCommand;
export declare function resolveRemoteTaskProviderSessionId(inputJson: string): string | undefined;
