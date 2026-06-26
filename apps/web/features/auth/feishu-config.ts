/**
 * Client-safe Feishu OAuth configuration check.
 * The actual env read happens server-side; this file exports
 * a flag that the server component passes down as a prop.
 */

export function feishuLoginEnabled(envValue?: string): boolean {
  return envValue === "1";
}
