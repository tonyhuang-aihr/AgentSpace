export declare const DAEMON_PROVIDER_IDS: readonly ["claude", "codex", "gemini", "opencode", "openclaw", "nanobot", "hermes"];
export type DaemonProvider = typeof DAEMON_PROVIDER_IDS[number];
export declare function isDaemonProvider(value: string): value is DaemonProvider;
export declare function formatDaemonProviderLabel(provider: string): string;
