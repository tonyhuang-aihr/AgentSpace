import type { Sandbox } from "../interface.ts";
import type { ExecCommand, ExecResult, FileEntry, SandboxConnectOptions, SandboxStatus } from "../types.ts";
import type { CubeSandboxConnection } from "./cube-client.ts";
export declare const CUBE_EXEC_NOT_READY_MESSAGE: string;
export declare class CubeSandbox implements Sandbox {
    readonly id: string;
    private readonly config;
    private readonly client;
    private readonly localFiles;
    private connection;
    private statusValue;
    private constructor();
    static connect(options: SandboxConnectOptions): Promise<CubeSandbox>;
    get status(): SandboxStatus;
    get remoteWorkDir(): string | undefined;
    get connectionInfo(): CubeSandboxConnection;
    readFile(path: string): Promise<string>;
    writeFile(path: string, contents: string): Promise<void>;
    readDir(path: string): Promise<FileEntry[]>;
    exists(path: string): Promise<boolean>;
    exec(_command: ExecCommand): Promise<ExecResult>;
    snapshot(): Promise<string>;
    stop(): Promise<void>;
    destroy(): Promise<void>;
    refreshStatus(): Promise<SandboxStatus>;
}
