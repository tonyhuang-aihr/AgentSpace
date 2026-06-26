import type { AgentRouterDiagnostic, HarnessLaunchPlan } from "./types.ts";
export declare const DEFAULT_AGENT_ROUTER_TIMEOUT_MS: number;
export declare const STDERR_TAIL_LIMIT = 8000;
export declare function resolveTimeoutMs(value: number | undefined): number;
export declare function findExecutableOnPath(command: string): Promise<string | null>;
export declare function resolveExecutablePath(command: string, executablePath?: string): Promise<string | null>;
export declare function buildBaseEnv(executablePath: string, extra?: Record<string, string>, pathDirs?: string[]): Record<string, string>;
export declare function ensureEnvPath(pathValue: string, paths: string[]): string;
export declare function buildRedactions(env: Record<string, string>): HarnessLaunchPlan["redactions"];
export declare function redactText(value: string, redactions: HarnessLaunchPlan["redactions"]): string;
export declare function tailText(value: string | undefined, limit?: number): string | undefined;
export declare function createDiagnostic(code: AgentRouterDiagnostic["code"], message: string, options?: {
    severity?: AgentRouterDiagnostic["severity"];
    rawProviderMessage?: string;
    stderrTail?: string;
}): AgentRouterDiagnostic;
export declare function parseJsonObjects(output: string): Array<Record<string, unknown>>;
export declare function outputHasInvalidJsonCandidate(output: string): boolean;
export declare function readStringAtPaths(value: unknown, paths: string[][]): string | undefined;
export declare function readNumberAtPaths(value: unknown, paths: string[][]): number | undefined;
export declare function readValueAtPaths(value: unknown, paths: string[][]): unknown;
export declare function extractText(value: unknown): string | undefined;
export declare function extractSessionId(event: Record<string, unknown>): string | undefined;
export declare function extractUsage(event: Record<string, unknown>): {
    inputTokens: number;
    outputTokens: number;
} | undefined;
export declare function appendLine(current: string, next: string): string;
export declare function normalizeSignal(signal: NodeJS.Signals | null): string | null;
