import type { Sandbox } from "./interface.ts";
import type { SandboxConnectOptions } from "./types.ts";
export declare function connectSandbox(options: SandboxConnectOptions): Promise<Sandbox>;
