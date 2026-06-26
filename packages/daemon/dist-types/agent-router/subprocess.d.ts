import type { ExecController } from "@agent-space/sandbox";
import type { AgentRouterObserver, HarnessLaunchPlan } from "./types.ts";
export interface SubprocessRunResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
}
export interface SubprocessRunOptions {
    observer?: AgentRouterObserver;
    onReady?: (controller: ExecController) => void;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}
export declare function runLaunchPlan(harness: string, plan: HarnessLaunchPlan, options?: SubprocessRunOptions): Promise<SubprocessRunResult>;
