import type { Sandbox } from "../interface.ts";
import type { ExecCommand, ExecResult, FileEntry, SandboxStatus } from "../types.ts";
export declare class LocalSandbox implements Sandbox {
    readonly id: string;
    readonly status: SandboxStatus;
    private readonly workDir;
    private readonly activeChildren;
    constructor(workDir: string, runtimeId: string);
    readFile(path: string): Promise<string>;
    writeFile(path: string, contents: string): Promise<void>;
    readDir(path: string): Promise<FileEntry[]>;
    exists(path: string): Promise<boolean>;
    exec(command: ExecCommand): Promise<ExecResult>;
    snapshot(): Promise<string>;
    stop(): Promise<void>;
    destroy(): Promise<void>;
    private resolveInsideSandbox;
    private resolveCommandCwd;
}
