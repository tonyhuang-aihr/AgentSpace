import type { AgentRouterDiagnostic, AgentRouterHarness, AgentRouterObserver, AgentRouterRunRequest, AgentRouterRunResult, HarnessErrorContext, HarnessLaunchPlan } from "../types.ts";
import type { ExecController } from "@agent-space/sandbox";
import { type SubprocessRunResult } from "../subprocess.ts";
export interface NativeRunOptions {
    parseEvents: (stdout: string, stderr: string, observer: AgentRouterObserver) => ParsedHarnessOutput;
    failureDiagnostics?: (processResult: SubprocessRunResult, parsed: ParsedHarnessOutput) => AgentRouterDiagnostic[];
    emptyMessage: string;
    nonZeroMessage: (exitCode: number | null) => string;
    timeoutMessage: (timeoutMs: number) => string;
    onReady?: (controller: ExecController, observer: AgentRouterObserver) => void;
    onStdout?: (chunk: string, observer: AgentRouterObserver) => void;
    onStderr?: (chunk: string, observer: AgentRouterObserver) => void;
}
export interface ParsedHarnessOutput {
    outputText?: string;
    sessionId?: string;
    diagnostics?: AgentRouterDiagnostic[];
}
export declare function runNativeHarness(harness: AgentRouterHarness, plan: HarnessLaunchPlan, observer: AgentRouterObserver, request: AgentRouterRunRequest, options: NativeRunOptions): Promise<AgentRouterRunResult>;
export declare function normalizeAdapterError(harness: AgentRouterHarness, error: unknown, context: HarnessErrorContext): AgentRouterDiagnostic;
export declare function parseJsonEventOutput(output: string): {
    events: Array<Record<string, unknown>>;
    diagnostics: AgentRouterDiagnostic[];
};
export declare function discoverSessionId(events: Array<Record<string, unknown>>, initial?: string): string | undefined;
export declare function emitSessionUpdate(observer: AgentRouterObserver, sessionId: string | undefined): void;
