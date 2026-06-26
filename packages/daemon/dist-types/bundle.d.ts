import type { DaemonTaskInputBundle, DaemonTaskOutputBundle } from "./daemon-api.ts";
export declare function clearTaskOutputArtifacts(workDir: string): void;
export declare function materializeInputBundle(workDir: string, bundle: DaemonTaskInputBundle): void;
export declare function collectRuntimeOutputBundle(workDir: string): DaemonTaskOutputBundle | undefined;
export declare function sanitizePathSegment(value: string): string;
