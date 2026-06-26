export type SandboxStatus = "provisioning" | "active" | "hibernating" | "hibernated" | "stopped" | "failed";
export interface ExecCommand {
    command: string;
    args?: string[];
    cwd?: string;
    input?: string;
    keepStdinOpen?: boolean;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    onReady?: (controller: ExecController) => void;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}
export interface ExecController {
    writeStdin(data: string): void;
    closeStdin(): void;
}
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: NodeJS.Signals;
    durationMs: number;
    timedOut: boolean;
}
export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
}
export type SandboxProvider = "local" | "cube";
export interface SandboxConnectOptions {
    runtimeId: string;
    workDir: string;
    provider?: SandboxProvider;
    env?: NodeJS.ProcessEnv;
}
export declare const SANDBOX_TASK_TIMEOUT_ENV = "AGENT_SPACE_TASK_TIMEOUT_MS";
export declare const DEFAULT_SANDBOX_TASK_TIMEOUT_MS: number;
export declare function resolveSandboxTaskTimeoutMs(value?: number | string): number;
