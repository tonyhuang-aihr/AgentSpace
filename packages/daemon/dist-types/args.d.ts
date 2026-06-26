export interface ParsedArgs {
    positionals: string[];
    flags: Record<string, string | boolean>;
}
export declare function parseArgs(args: string[]): ParsedArgs;
export declare function getStringFlag(flags: Record<string, string | boolean>, key: string): string | undefined;
