import type { AgentRouterEvent } from "./types.ts";
export declare function mapClaudeNativeEvent(event: Record<string, unknown>): AgentRouterEvent[];
export declare function mapCodexNativeEvent(event: Record<string, unknown>): AgentRouterEvent[];
export declare function mapOpenClawNativeEvent(event: Record<string, unknown>): AgentRouterEvent[];
export declare function mapOpenCodeNativeEvent(event: Record<string, unknown>): AgentRouterEvent[];
export declare function extractClaudeFallbackText(event: Record<string, unknown>): string | undefined;
export declare function extractCodexFinalText(event: Record<string, unknown>): string | undefined;
export declare function extractOpenCodeFinalText(event: Record<string, unknown>): string | undefined;
