// src/agent-router/types.ts
var AGENT_ROUTER_HARNESSES = ["claude", "codex", "opencode", "openclaw", "hermes"];

// src/agent-router/router.ts
import { resolve as resolve2 } from "node:path";

// src/agent-router/utils.ts
import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { platform } from "node:process";
var DEFAULT_AGENT_ROUTER_TIMEOUT_MS = 12 * 60 * 60 * 1e3;
var STDERR_TAIL_LIMIT = 8e3;
function resolveTimeoutMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_AGENT_ROUTER_TIMEOUT_MS;
}
async function findExecutableOnPath(command) {
  if (isPathLike(command)) {
    return await isExecutableCandidate(command) ? resolve(command) : null;
  }
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }
  const extensions = platform === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
  for (const baseDir of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(baseDir, command + extension);
      if (await isExecutableCandidate(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
async function resolveExecutablePath(command, executablePath) {
  const candidate = executablePath?.trim() || command;
  return findExecutableOnPath(candidate);
}
function buildBaseEnv(executablePath, extra, pathDirs = []) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  const currentPath = extra?.PATH ?? env.PATH ?? "";
  env.PATH = ensureExecutablePath(currentPath, executablePath, pathDirs);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      env[key] = key === "PATH" ? ensureExecutablePath(value, executablePath, pathDirs) : value;
    }
  }
  return env;
}
function ensureEnvPath(pathValue, paths) {
  const normalizedPaths = paths.map((path) => path.trim()).filter(Boolean);
  const parts = pathValue.split(delimiter).filter(Boolean);
  const existing = parts.filter((part) => !normalizedPaths.includes(part));
  return [...normalizedPaths, ...existing].filter(Boolean).join(delimiter);
}
function buildRedactions(env) {
  const redactions = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value || !isSecretEnvName(key)) {
      continue;
    }
    redactions.push({
      envName: key,
      pattern: escapeRegExp(value),
      replacement: `[redacted:${key}]`
    });
  }
  return redactions;
}
function redactText(value, redactions) {
  let result = value;
  for (const redaction of redactions) {
    if (redaction.pattern) {
      result = result.replace(new RegExp(redaction.pattern, "g"), redaction.replacement);
    }
  }
  return result;
}
function tailText(value, limit = STDERR_TAIL_LIMIT) {
  if (!value) {
    return void 0;
  }
  const trimmed = sanitizeDiagnosticText(value.trim());
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return trimmed.slice(trimmed.length - limit);
}
function createDiagnostic(code, message, options = {}) {
  return {
    code,
    severity: options.severity ?? (code === "harness.protocol_parse_failed" ? "warning" : "error"),
    message,
    rawProviderMessage: options.rawProviderMessage,
    stderrTail: options.stderrTail
  };
}
function parseJsonObjects(output) {
  const events = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed2 = line.trim();
    if (!trimmed2.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed2);
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      }
    } catch {
    }
  }
  if (events.length > 0) {
    return events;
  }
  const trimmed = output.trim();
  if (!trimmed.startsWith("{")) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return [parsed];
    }
  } catch {
  }
  return [];
}
function outputHasInvalidJsonCandidate(output) {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      JSON.parse(trimmed);
    } catch {
      return true;
    }
  }
  return false;
}
function readStringAtPaths(value, paths) {
  const candidate = readValueAtPaths(value, paths);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : void 0;
}
function readNumberAtPaths(value, paths) {
  const candidate = readValueAtPaths(value, paths);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : void 0;
}
function readValueAtPaths(value, paths) {
  for (const path of paths) {
    let cursor = value;
    let matched = true;
    for (const segment of path) {
      if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
        matched = false;
        break;
      }
      cursor = cursor[segment];
    }
    if (matched) {
      return cursor;
    }
  }
  return void 0;
}
function extractText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || void 0;
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => extractText(entry)).filter((entry) => Boolean(entry));
    return parts.length > 0 ? parts.join("\n") : void 0;
  }
  if (!value || typeof value !== "object") {
    return void 0;
  }
  const candidate = value;
  for (const key of ["payload", "result", "output", "response", "message", "content", "text", "answer", "assistant", "messages", "parts"]) {
    if (!(key in candidate)) {
      continue;
    }
    const extracted = extractText(candidate[key]);
    if (extracted) {
      return extracted;
    }
  }
  return void 0;
}
function extractSessionId(event) {
  return readStringAtPaths(event, [
    ["sessionID"],
    ["sessionId"],
    ["session_id"],
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["session", "id"],
    ["part", "sessionID"],
    ["part", "sessionId"],
    ["part", "session_id"],
    ["result", "sessionId"],
    ["result", "session_id"],
    ["result", "thread_id"],
    ["meta", "sessionId"],
    ["meta", "session_id"]
  ]);
}
function extractUsage(event) {
  const usageCandidate = readValueAtPaths(event, [
    ["usage"],
    ["lastCallUsage"],
    ["result", "usage"],
    ["result", "lastCallUsage"],
    ["result", "meta", "agentMeta", "lastCallUsage"],
    ["meta", "agentMeta", "lastCallUsage"]
  ]);
  if (!usageCandidate || typeof usageCandidate !== "object") {
    return void 0;
  }
  const usage = usageCandidate;
  const inputTokens = readNumberAtPaths(usage, [["input_tokens"], ["inputTokens"], ["promptTokens"]]) ?? 0;
  const outputTokens = readNumberAtPaths(usage, [["output_tokens"], ["outputTokens"], ["completionTokens"]]) ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) {
    return void 0;
  }
  return { inputTokens, outputTokens };
}
function appendLine(current, next) {
  return current ? `${current}
${next}` : next;
}
function normalizeSignal(signal) {
  return signal ?? null;
}
async function isExecutableCandidate(candidate) {
  if (!existsSync(candidate)) {
    return false;
  }
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function ensureExecutablePath(pathValue, executablePath, pathDirs) {
  return ensureEnvPath(pathValue, [
    dirname(executablePath),
    ...pathDirs,
    process.env.AGENT_SPACE_DAEMON_BIN ? dirname(process.env.AGENT_SPACE_DAEMON_BIN) : "",
    process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : "",
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin"
  ]);
}
function isPathLike(value) {
  return value.includes("/") || value.includes("\\");
}
function isSecretEnvName(name) {
  return /(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH|CREDENTIAL)/i.test(name);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizeDiagnosticText(value) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[redacted-secret]").replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|API[_-]?KEY)[A-Z0-9_]*\s*=\s*)[^\s"']+/gi, "$1[redacted]").replace(/([?&](?:access_token|refresh_token|token|api_key)=)[^&\s"']+/gi, "$1[redacted]");
}

// src/agent-router/events.ts
function mapClaudeNativeEvent(event) {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "result") {
    const result = [];
    if (typeof event.usage === "object" && event.usage) {
      const usage = event.usage;
      result.push({
        type: "tool_output",
        tool: "usage",
        metadata: {
          input_tokens: usage.input_tokens ?? usage.inputTokens,
          output_tokens: usage.output_tokens ?? usage.outputTokens
        }
      });
    }
    result.push(...extractClaudePermissionDenials(event).map((denial) => ({
      type: "approval_requested",
      toolName: denial.toolName,
      toolInput: denial.toolInput,
      contentPreview: formatToolApprovalPreview(denial.toolName, denial.toolInput)
    })));
    return result;
  }
  if (type === "assistant") {
    const text = extractClaudeAssistantText(event);
    return text ? [{ type: "thought_delta", text }] : [];
  }
  if (type === "text" || type === "message") {
    const text = extractText(event.text ?? event.content);
    return text ? [{ type: "text_delta", text }] : [];
  }
  if (type === "content_block_delta" && event.delta && typeof event.delta === "object") {
    const text = extractText(event.delta.text);
    return text ? [{ type: "text_delta", text }] : [];
  }
  if (type === "tool_use") {
    return [{
      type: "tool_started",
      tool: typeof event.name === "string" ? event.name : "unknown",
      title: typeof event.name === "string" ? event.name : void 0,
      input: typeof event.input === "object" && event.input ? event.input : void 0
    }];
  }
  if (type === "tool_result") {
    const tool = typeof event.name === "string" ? event.name : "unknown";
    const output = extractText(event.output ?? event.content);
    return [
      { type: "tool_output", tool, output },
      { type: "tool_finished", tool, status: "completed" }
    ];
  }
  return [];
}
function mapCodexNativeEvent(event) {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "item.started" || type === "item.completed") {
    const item = event.item;
    if (!item || typeof item !== "object") {
      return [];
    }
    const typedItem = item;
    const itemType = normalizeCodexItemType(typedItem.type);
    if (itemType === "command_execution") {
      const command = typeof typedItem.command === "string" ? typedItem.command : readStringAtPaths(typedItem, [["input", "command"]]);
      if (type === "item.started") {
        return [{
          type: "tool_started",
          tool: "exec_command",
          title: command ? `bash: ${command}` : "bash",
          input: command ? { command } : void 0
        }];
      }
      const output = typeof typedItem.aggregatedOutput === "string" ? typedItem.aggregatedOutput : typeof typedItem.aggregated_output === "string" ? typedItem.aggregated_output : typeof typedItem.output === "string" ? typedItem.output : void 0;
      return [
        { type: "tool_output", tool: "exec_command", output },
        { type: "tool_finished", tool: "exec_command", status: "completed" }
      ];
    }
    if (itemType === "file_change") {
      return type === "item.started" ? [{ type: "tool_started", tool: "patch_apply", title: "file change" }] : [{ type: "tool_finished", tool: "patch_apply", status: "completed" }];
    }
    if (itemType === "agent_message" && typeof typedItem.text === "string") {
      return typedItem.phase === "final_answer" ? [{ type: "text_delta", text: typedItem.text }] : [{ type: "thought_delta", text: typedItem.text }];
    }
  }
  if (type === "thread.started") {
    const sessionId = readStringAtPaths(event, [["thread_id"], ["threadId"]]);
    return sessionId ? [{ type: "session_updated", sessionId }] : [];
  }
  return [];
}
function mapOpenClawNativeEvent(event) {
  const sessionId = readStringAtPaths(event, [
    ["sessionId"],
    ["session_id"],
    ["conversationId"],
    ["conversation_id"],
    ["result", "sessionId"],
    ["result", "session_id"],
    ["result", "conversationId"],
    ["result", "conversation_id"],
    ["meta", "sessionId"],
    ["meta", "session_id"]
  ]);
  const result = sessionId ? [{ type: "session_updated", sessionId }] : [];
  const type = typeof event.type === "string" ? event.type : "";
  const eventName = typeof event.event === "string" ? event.event : "";
  const status = readStringAtPaths(event, [
    ["status"],
    ["phase"],
    ["state"],
    ["result", "status"],
    ["message", "status"]
  ]);
  if ((type === "status" || eventName === "status" || status) && !isTerminalTextOpenClawEvent(event)) {
    const statusText = extractText(event.message ?? event.content ?? event.text ?? status);
    if (statusText) {
      result.push({ type: "thought_delta", text: statusText });
    }
  }
  const toolName = readStringAtPaths(event, [
    ["tool"],
    ["toolName"],
    ["tool_name"],
    ["name"],
    ["tool", "name"],
    ["message", "tool"],
    ["result", "tool"]
  ]);
  if (toolName && /tool|command|exec|function/i.test(`${type} ${eventName}`)) {
    if (/start|started|call|calling|tool_use/i.test(`${type} ${eventName}`)) {
      result.push({
        type: "tool_started",
        tool: toolName,
        title: toolName,
        input: readOpenClawToolInput(event)
      });
    } else if (/finish|finished|result|output|complete|completed|failed|error/i.test(`${type} ${eventName}`)) {
      const output = extractText(event.output ?? event.result ?? event.content ?? event.message);
      result.push({ type: "tool_output", tool: toolName, output });
      result.push({
        type: "tool_finished",
        tool: toolName,
        status: /fail|error|denied/i.test(`${type} ${eventName} ${status ?? ""}`) ? "failed" : "completed"
      });
    }
  }
  const text = extractTextFromOpenClawEvent(event);
  if (text) {
    result.push({ type: "text_delta", text });
  }
  const usage = extractUsage(event);
  if (usage) {
    result.push({
      type: "tool_output",
      tool: "usage",
      metadata: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens
      }
    });
  }
  return result;
}
function mapOpenCodeNativeEvent(event) {
  const result = [];
  const sessionId = extractSessionId(event);
  if (sessionId) {
    result.push({ type: "session_updated", sessionId });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const eventName = typeof event.event === "string" ? event.event : "";
  const part = event.part && typeof event.part === "object" ? event.part : void 0;
  const combinedType = `${type} ${eventName} ${typeof part?.type === "string" ? part.type : ""}`;
  const toolName = readOpenCodeToolName(event);
  if (toolName && /tool|command|exec|function/i.test(combinedType)) {
    if (/start|started|call|calling|tool_use/i.test(combinedType)) {
      result.push({
        type: "tool_started",
        tool: toolName,
        title: toolName,
        input: readOpenCodeToolInput(event)
      });
    } else if (/finish|finished|result|output|complete|completed|failed|error/i.test(combinedType)) {
      const output = extractText(event.output ?? event.result ?? part?.output ?? part?.result ?? event.content ?? event.message);
      result.push({ type: "tool_output", tool: toolName, output });
      result.push({
        type: "tool_finished",
        tool: toolName,
        status: /fail|error|denied/i.test(combinedType) ? "failed" : "completed"
      });
    }
  }
  const usage = extractOpenCodeUsage(event);
  if (usage) {
    result.push({
      type: "tool_output",
      tool: "usage",
      metadata: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens
      }
    });
  }
  if (type === "text" || type === "message") {
    const text = extractOpenCodeFinalText(event);
    if (text) {
      result.push({ type: "text_delta", text });
    }
    return result;
  }
  if (type === "step_start" || type === "step" || type === "status") {
    const text = extractOpenCodeStepText(event);
    if (text) {
      result.push({ type: "thought_delta", text });
    }
    return result;
  }
  const finalText = extractOpenCodeFinalText(event);
  if (finalText && !/step_finish|usage|debug/i.test(combinedType)) {
    result.push({ type: "text_delta", text: finalText });
  }
  return result;
}
function extractClaudeFallbackText(event) {
  if (event.type === "result" && typeof event.result === "string") {
    return event.result.trim() || void 0;
  }
  if (event.type === "assistant") {
    return extractClaudeAssistantText(event);
  }
  if (event.type === "text" || event.type === "message") {
    return extractText(event.text ?? event.content);
  }
  if (event.type === "content_block_delta" && event.delta && typeof event.delta === "object") {
    return extractText(event.delta.text);
  }
  return void 0;
}
function extractCodexFinalText(event) {
  const item = event.item;
  if (!item || typeof item !== "object") {
    return void 0;
  }
  const typedItem = item;
  if (normalizeCodexItemType(typedItem.type) === "agent_message" && typeof typedItem.text === "string") {
    if (typedItem.phase && typedItem.phase !== "final_answer") {
      return void 0;
    }
    return typedItem.text.trim() || void 0;
  }
  return void 0;
}
function extractOpenCodeFinalText(event) {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "step_start" || type === "step" || type === "status" || type === "step_finish" || type === "usage" || type === "debug") {
    return void 0;
  }
  return extractText(
    readValueAtPaths(event, [
      ["part", "text"],
      ["part", "content"],
      ["part", "message"],
      ["text"],
      ["content"],
      ["message"],
      ["result", "text"],
      ["result", "content"]
    ])
  );
}
function normalizeCodexItemType(value) {
  if (value === "commandExecution" || value === "command_execution") {
    return "command_execution";
  }
  if (value === "fileChange" || value === "file_change") {
    return "file_change";
  }
  if (value === "agentMessage" || value === "agent_message") {
    return "agent_message";
  }
  return typeof value === "string" ? value : "";
}
function extractClaudeAssistantText(event) {
  const message = event.message && typeof event.message === "object" ? event.message : void 0;
  return extractText(message?.content ?? event.content);
}
function extractTextFromOpenClawEvent(event) {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "usage" || type === "debug" || type === "status") {
    return void 0;
  }
  return extractText(event);
}
function extractOpenCodeStepText(event) {
  return extractText(
    readValueAtPaths(event, [
      ["part", "title"],
      ["part", "text"],
      ["message"],
      ["content"],
      ["text"]
    ])
  );
}
function extractOpenCodeUsage(event) {
  const sharedUsage = extractUsage(event);
  if (sharedUsage) {
    return sharedUsage;
  }
  const inputTokens = readNumberAtPaths(event, [
    ["tokens", "input"],
    ["tokens", "inputTokens"],
    ["tokens", "input_tokens"],
    ["part", "tokens", "input"],
    ["part", "tokens", "inputTokens"],
    ["part", "tokens", "input_tokens"]
  ]) ?? 0;
  const outputTokens = readNumberAtPaths(event, [
    ["tokens", "output"],
    ["tokens", "outputTokens"],
    ["tokens", "output_tokens"],
    ["part", "tokens", "output"],
    ["part", "tokens", "outputTokens"],
    ["part", "tokens", "output_tokens"]
  ]) ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) {
    return void 0;
  }
  return { inputTokens, outputTokens };
}
function readOpenCodeToolName(event) {
  return readStringAtPaths(event, [
    ["tool"],
    ["toolName"],
    ["tool_name"],
    ["name"],
    ["part", "tool"],
    ["part", "toolName"],
    ["part", "tool_name"],
    ["part", "name"]
  ]);
}
function readOpenCodeToolInput(event) {
  const part = event.part && typeof event.part === "object" ? event.part : void 0;
  return event.input ?? event.args ?? event.arguments ?? event.params ?? event.command ?? part?.input ?? part?.args ?? part?.arguments ?? part?.params ?? part?.command;
}
function isTerminalTextOpenClawEvent(event) {
  const type = typeof event.type === "string" ? event.type : "";
  return type === "message" || type === "text" || type === "result" || type === "assistant";
}
function readOpenClawToolInput(event) {
  return event.input ?? event.args ?? event.arguments ?? event.params ?? event.command;
}
function extractClaudePermissionDenials(event) {
  const denials = Array.isArray(event.permission_denials) ? event.permission_denials : [];
  return denials.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item;
    const toolName = typeof record.tool_name === "string" && record.tool_name.trim() ? record.tool_name.trim() : "unknown";
    const toolInput = record.tool_input && typeof record.tool_input === "object" ? record.tool_input : void 0;
    return [{ toolName, toolInput }];
  });
}
function formatToolApprovalPreview(toolName, toolInput) {
  if (toolName === "Bash" && typeof toolInput?.command === "string") {
    return `Bash: ${toolInput.command}`;
  }
  return `${toolName}: ${JSON.stringify(toolInput ?? {})}`;
}

// src/agent-router/capabilities.ts
import { spawnSync } from "node:child_process";
import { dirname as dirname2 } from "node:path";
var DEFAULT_TOOL_DIAGNOSTIC_TIMEOUT_MS = 5e3;
function normalizeRuntimeToolCapabilities(capabilities) {
  if (!capabilities || capabilities.length === 0) {
    return [];
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const capability of capabilities) {
    const command = capability.command.trim();
    const id = capability.id.trim() || command;
    if (!command || !id) {
      continue;
    }
    const normalized = {
      ...capability,
      id,
      command,
      displayName: capability.displayName?.trim() || void 0,
      binPath: capability.binPath?.trim() || void 0,
      binDir: capability.binDir?.trim() || void 0,
      pathDirs: normalizeStrings(capability.pathDirs),
      env: normalizeEnv(capability.env),
      allowedShellPatterns: normalizeShellPatterns(capability.allowedShellPatterns, command),
      diagnosticCommands: normalizeStrings(capability.diagnosticCommands),
      requiresApproval: capability.requiresApproval === true,
      status: capability.status,
      denialReason: capability.denialReason?.trim() || void 0
    };
    const key = normalized.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
function buildCapabilityPathDirs(capabilities) {
  const dirs = [];
  for (const capability of normalizeRuntimeToolCapabilities(capabilities)) {
    if (capability.status === "denied") {
      continue;
    }
    if (capability.binPath) {
      dirs.push(dirname2(capability.binPath));
    }
    if (capability.binDir) {
      dirs.push(capability.binDir);
    }
    dirs.push(...capability.pathDirs ?? []);
  }
  return dedupeStrings(dirs);
}
function buildCapabilityEnv(baseEnv, capabilities) {
  const env = { ...baseEnv };
  for (const capability of normalizeRuntimeToolCapabilities(capabilities)) {
    if (capability.status === "denied" || !capability.env) {
      continue;
    }
    for (const [key, value] of Object.entries(capability.env)) {
      env[key] = value;
    }
  }
  if (env.PATH) {
    env.PATH = ensureEnvPath(env.PATH, buildCapabilityPathDirs(capabilities));
  }
  return env;
}
function buildCapabilityAllowedTools(capabilities) {
  const tools = [];
  for (const capability of normalizeRuntimeToolCapabilities(capabilities)) {
    if (capability.status === "denied") {
      continue;
    }
    for (const pattern of capability.allowedShellPatterns) {
      tools.push(`Bash(${pattern})`);
    }
  }
  return dedupeStrings(tools);
}
function runCapabilityDiagnostics(input) {
  const diagnostics = [];
  for (const capability of normalizeRuntimeToolCapabilities(input.capabilities)) {
    if (capability.status === "denied") {
      diagnostics.push(createDiagnostic(
        "harness.tool_unauthorized",
        `${capability.displayName ?? capability.command} is not authorized for this task.`,
        {
          severity: "error",
          rawProviderMessage: capability.denialReason
        }
      ));
      continue;
    }
    if (capability.status === "missing") {
      diagnostics.push(createDiagnostic(
        "harness.tool_missing",
        `${capability.displayName ?? capability.command} is not installed on the runtime.`,
        {
          severity: "error",
          rawProviderMessage: capability.denialReason
        }
      ));
      continue;
    }
    const commands = capability.diagnosticCommands ?? [];
    if (commands.length === 0) {
      continue;
    }
    for (const command of commands) {
      const result = spawnSync("sh", ["-lc", command], {
        env: input.env,
        encoding: "utf8",
        timeout: DEFAULT_TOOL_DIAGNOSTIC_TIMEOUT_MS
      });
      if (result.error) {
        diagnostics.push(createDiagnostic(
          "harness.tool_missing",
          `${capability.displayName ?? capability.command} diagnostic failed: ${result.error.message}`,
          {
            severity: "error",
            stderrTail: tailText(`${command}
${result.error.message}`)
          }
        ));
        continue;
      }
      if (result.status !== 0) {
        diagnostics.push(createDiagnostic(
          "harness.tool_missing",
          `${capability.displayName ?? capability.command} diagnostic failed: ${command}`,
          {
            severity: "error",
            rawProviderMessage: tailText(`${result.stderr ?? ""}
${result.stdout ?? ""}`),
            stderrTail: tailText(result.stderr ?? result.stdout ?? "")
          }
        ));
      } else {
        diagnostics.push(createDiagnostic(
          "harness.tool_available",
          `${capability.displayName ?? capability.command} diagnostic passed: ${command}`,
          {
            severity: "info",
            rawProviderMessage: tailText(`${result.stdout ?? ""}
${result.stderr ?? ""}`)
          }
        ));
      }
    }
  }
  return dedupeDiagnostics(diagnostics);
}
function normalizeShellPatterns(patterns, command) {
  const normalized = normalizeStrings(patterns);
  return normalized.length > 0 ? normalized : [`${command} *`];
}
function normalizeStrings(values) {
  return dedupeStrings((values ?? []).map((value) => value.trim()).filter(Boolean));
}
function normalizeEnv(env) {
  if (!env) {
    return void 0;
  }
  const normalized = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.trim() && typeof value === "string") {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : void 0;
}
function dedupeStrings(values) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
function dedupeDiagnostics(diagnostics) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.rawProviderMessage ?? "",
      diagnostic.stderrTail ?? ""
    ].join("\0");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

// src/agent-router/subprocess.ts
import { spawn } from "node:child_process";
var KILL_GRACE_PERIOD_MS = 5e3;
async function runLaunchPlan(harness, plan, options = {}) {
  let child;
  try {
    child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (error) {
    return Promise.reject(error);
  }
  options.observer?.emit({
    type: "harness_started",
    harness,
    pid: child.pid,
    command: [plan.executable, ...redactArgs(plan.args, plan)]
  });
  if (child.stdin) {
    child.stdin.on("error", () => {
    });
    const stdinController = {
      writeStdin: (data) => {
        if (!child.stdin?.destroyed && child.stdin?.writable) {
          child.stdin.write(data);
        }
      },
      closeStdin: () => {
        if (!child.stdin?.destroyed && child.stdin?.writable) {
          child.stdin.end();
        }
      }
    };
    options.onReady?.(stdinController);
    if (plan.keepStdinOpen) {
      if (plan.stdin) {
        stdinController.writeStdin(plan.stdin);
      }
    } else {
      child.stdin.end(plan.stdin ?? "");
    }
  }
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let timeout;
  let killTimer;
  return await new Promise((resolve3, reject) => {
    child.stdout?.on("data", (chunk) => {
      const value = redactText(String(chunk), plan.redactions);
      stdout += value;
      options.onStdout?.(value);
    });
    child.stderr?.on("data", (chunk) => {
      const value = redactText(String(chunk), plan.redactions);
      stderr += value;
      options.onStderr?.(value);
    });
    if (plan.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, KILL_GRACE_PERIOD_MS);
      }, plan.timeoutMs);
    }
    child.on("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      const normalizedSignal = normalizeSignal(signal);
      options.observer?.emit({
        type: "harness_exited",
        exitCode,
        signal: normalizedSignal
      });
      resolve3({
        stdout,
        stderr,
        exitCode,
        signal: normalizedSignal,
        timedOut
      });
    });
  });
}
function redactArgs(args, plan) {
  return args.map((arg) => redactText(arg, plan.redactions));
}

// src/agent-router/adapters/shared.ts
async function runNativeHarness(harness, plan, observer, request, options) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const events = [];
  const teeObserver = {
    emit: (event) => {
      events.push(event);
      observer.emit(event);
    }
  };
  let processResult;
  try {
    processResult = await runLaunchPlan(harness, plan, {
      observer: teeObserver,
      onReady: options.onReady ? (controller) => options.onReady?.(controller, teeObserver) : void 0,
      onStdout: options.onStdout ? (chunk) => options.onStdout?.(chunk, teeObserver) : void 0,
      onStderr: options.onStderr ? (chunk) => options.onStderr?.(chunk, teeObserver) : void 0
    });
  } catch (error) {
    const diagnostic = createDiagnostic("harness.unknown_failure", error instanceof Error ? error.message : String(error));
    return {
      status: "failed",
      harness,
      events,
      diagnostics: [diagnostic],
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const stderrTail = tailText(processResult.stderr);
  if (processResult.timedOut) {
    return {
      status: "timeout",
      harness,
      events,
      diagnostics: [
        createDiagnostic("harness.timeout", options.timeoutMessage(plan.timeoutMs), { stderrTail })
      ],
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const parsed = options.parseEvents(processResult.stdout, processResult.stderr, teeObserver);
  const diagnostics = [...parsed.diagnostics ?? []];
  if (processResult.exitCode !== 0) {
    diagnostics.push(...options.failureDiagnostics?.(processResult, parsed) ?? []);
    diagnostics.push(createDiagnostic("harness.exited_nonzero", options.nonZeroMessage(processResult.exitCode), {
      rawProviderMessage: tailText(`${processResult.stderr}
${processResult.stdout}`),
      stderrTail
    }));
    return {
      status: "failed",
      harness,
      sessionId: parsed.sessionId,
      outputText: parsed.outputText,
      events,
      diagnostics: dedupeDiagnostics2(diagnostics),
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  if (!parsed.outputText?.trim()) {
    diagnostics.push(createDiagnostic("harness.empty_response", options.emptyMessage, { stderrTail }));
    return {
      status: "failed",
      harness,
      sessionId: parsed.sessionId,
      events,
      diagnostics: dedupeDiagnostics2(diagnostics),
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "completed",
    harness,
    sessionId: parsed.sessionId,
    outputText: parsed.outputText.trim(),
    events,
    diagnostics: dedupeDiagnostics2(diagnostics),
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function normalizeAdapterError(harness, error, context) {
  if (context.timedOut) {
    return createDiagnostic("harness.timeout", `${harness} timed out.`, { stderrTail: context.stderrTail });
  }
  const message = error instanceof Error ? error.message : String(error);
  return createDiagnostic("harness.unknown_failure", message, { stderrTail: context.stderrTail });
}
function parseJsonEventOutput(output) {
  const events = parseJsonObjects(output);
  const diagnostics = [];
  if (events.length === 0 && outputHasInvalidJsonCandidate(output)) {
    diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "Harness output contained invalid JSON events."));
  }
  return { events, diagnostics };
}
function discoverSessionId(events, initial) {
  let sessionId = initial;
  for (const event of events) {
    sessionId = extractSessionId(event) ?? sessionId;
  }
  return sessionId;
}
function emitSessionUpdate(observer, sessionId) {
  if (sessionId) {
    observer.emit({ type: "session_updated", sessionId });
  }
}
function dedupeDiagnostics2(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.message}:${diagnostic.rawProviderMessage ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

// src/agent-router/adapters/versions.ts
import { spawn as spawn2 } from "node:child_process";
async function runVersionCommand(executable, args) {
  return await new Promise((resolve3) => {
    const child = spawn2(executable, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => {
      resolve3("");
    });
    child.on("close", (exitCode) => {
      resolve3(exitCode === 0 ? output.trim().split(/\r?\n/)[0] ?? "" : "");
    });
  });
}

// src/agent-router/adapters/claude.ts
var CLAUDE_ROOT_BASE_ALLOWED_TOOLS = [
  "Bash(command -v *)",
  "Bash(mkdir -p runtime-output/artifacts/sheets)",
  "Bash(mkdir -p runtime-output/artifacts)",
  "Bash(cat runtime-output/artifacts/sheets/*)",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep"
];
var claudeAdapter = {
  id: "claude",
  label: "Claude Code",
  detect: detectClaude,
  buildLaunch: buildClaudeLaunch,
  run: runClaude,
  normalizeError: (error, context) => normalizeAdapterError("claude", error, context)
};
async function detectClaude() {
  const executable = await findExecutableOnPath("claude");
  if (!executable) {
    return { id: "claude", label: "Claude Code", status: "missing" };
  }
  return {
    id: "claude",
    label: "Claude Code",
    status: "available",
    path: executable,
    version: await runVersionCommand(executable, ["--version"])
  };
}
async function buildClaudeLaunch(input) {
  const executable = await resolveExecutablePath("claude", input.executablePath);
  if (!executable) {
    throw new Error("Claude Code CLI was not found on PATH.");
  }
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose"
  ];
  if (input.maxTurns && input.maxTurns > 0) {
    args.push("--max-turns", String(Math.floor(input.maxTurns)));
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  const permissionMode = input.permissionMode ?? input.mode;
  if (permissionMode) {
    args.push("--permission-mode", permissionMode);
  }
  if (input.dangerouslyBypassPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  if (input.sessionId) {
    args.push("--resume", input.sessionId);
  }
  const allowedTools = dedupeStrings2([
    ...input.allowedTools ?? [],
    ...buildCapabilityAllowedTools(input.runtimeToolCapabilities),
    ...input.temporaryAllowedTools ?? []
  ]);
  if (allowedTools.length > 0) {
    args.push("--allowedTools", ...dedupeStrings2([
      ...allowedTools
    ]));
  }
  if (input.claudeTools) {
    args.push("--tools", input.claudeTools);
  }
  const env = buildBaseEnv(
    executable,
    buildCapabilityEnv(sanitizeClaudeEnv(input.env) ?? {}, input.runtimeToolCapabilities),
    buildCapabilityPathDirs(input.runtimeToolCapabilities)
  );
  return {
    executable,
    args,
    cwd: input.cwd,
    env,
    stdin: buildClaudeStreamJsonInput(input.prompt),
    keepStdinOpen: input.handleControlRequests === true,
    timeoutMs: resolveTimeoutMs(input.timeoutMs),
    redactions: buildRedactions(env)
  };
}
async function runClaude(plan, observer, request) {
  let discoveredSessionId = request.sessionId;
  let stdinController;
  let stdoutBuffer = "";
  const processLine = (line, runObserver) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      return;
    }
    try {
      const event = JSON.parse(trimmed);
      discoveredSessionId = discoverSessionId([event], discoveredSessionId);
      if (request.handleControlRequests) {
        void buildClaudeControlResponse(event, request, discoveredSessionId).then((controlResponse) => {
          if (controlResponse) {
            stdinController?.writeStdin(`${controlResponse}
`);
          }
        }).catch((error) => {
          runObserver.emit({
            type: "tool_output",
            tool: "approval",
            output: `Runtime approval failed: ${error instanceof Error ? error.message : String(error)}`
          });
        });
      }
      if (event.type === "result") {
        stdinController?.closeStdin();
      }
    } catch {
    }
  };
  return runNativeHarness("claude", plan, observer, request, {
    emptyMessage: "Claude Code returned an empty response.",
    nonZeroMessage: (exitCode) => `Claude Code exited with code ${exitCode}.`,
    timeoutMessage: (timeoutMs) => `claude timed out after ${timeoutMs}ms.`,
    onReady: (controller) => {
      stdinController = controller;
    },
    onStdout: (chunk, runObserver) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line, runObserver);
      }
    },
    parseEvents: (stdout, stderr, runObserver) => {
      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer, runObserver);
        stdoutBuffer = "";
      }
      const events = parseJsonObjects(stdout);
      const diagnostics = [];
      let outputText = "";
      if (events.length === 0 && stdout.trim().startsWith("{")) {
        diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "Claude Code stream-json output could not be parsed.", {
          rawProviderMessage: formatClaudeParseDiagnostic(events, stdout),
          stderrTail: tailText(stderr)
        }));
      }
      if (events.length === 0 && stdout.trim() && !stdout.trim().startsWith("{")) {
        diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "Claude Code emitted non-JSON stream output.", {
          severity: "error",
          rawProviderMessage: formatClaudeParseDiagnostic(events, stdout),
          stderrTail: tailText(stderr)
        }));
      }
      for (const event of events) {
        for (const mapped of mapClaudeNativeEvent(event)) {
          runObserver.emit(mapped);
        }
        diagnostics.push(...buildClaudePermissionDenialDiagnostics(event));
        const text = extractClaudeFallbackText(event);
        if (text) {
          outputText = appendOutputText(outputText, text);
        }
      }
      const resultEvent = events.find((event) => event.type === "result" && typeof event.result === "string");
      if (resultEvent && typeof resultEvent.result === "string") {
        outputText = resultEvent.result.trim();
      }
      const sessionId = discoverSessionId(events, request.sessionId);
      emitSessionUpdate(runObserver, sessionId);
      if (!outputText.trim()) {
        diagnostics.push(createDiagnostic("harness.empty_response", "Claude Code returned an empty response.", {
          rawProviderMessage: formatClaudeParseDiagnostic(events, stdout),
          stderrTail: tailText(stderr)
        }));
      }
      return { outputText, sessionId, diagnostics };
    }
  });
}
function buildClaudeStreamJsonInput(prompt) {
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }]
    }
  })}
`;
}
function sanitizeClaudeEnv(extra) {
  if (!extra) {
    return void 0;
  }
  const env = { ...extra };
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDECODE_") || key.startsWith("CLAUDE_CODE_")) {
      delete env[key];
    }
  }
  return env;
}
function appendOutputText(current, next) {
  return current ? `${current}
${next}` : next;
}
function formatClaudeParseDiagnostic(events, stdout) {
  const eventCounts = /* @__PURE__ */ new Map();
  for (const event of events) {
    const type = typeof event.type === "string" && event.type.trim() ? event.type.trim() : "unknown";
    eventCounts.set(type, (eventCounts.get(type) ?? 0) + 1);
  }
  const eventTypes = eventCounts.size === 0 ? "none" : [...eventCounts.entries()].map(([type, count]) => `${type}:${count}`).join(",");
  const stdoutLines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nonJsonLineCount = stdoutLines.filter((line) => !line.startsWith("{")).length;
  const parseErrorCount = stdoutLines.filter((line) => {
    if (!line.startsWith("{")) {
      return false;
    }
    try {
      JSON.parse(line);
      return false;
    } catch {
      return true;
    }
  }).length;
  const resultEvent = events.some((event) => event.type === "result");
  const textEvent = events.some((event) => Boolean(extractClaudeFallbackText(event)));
  const toolEvent = events.some((event) => event.type === "tool_use" || event.type === "tool_result");
  const parts = [
    `events=${eventTypes}`,
    `resultEvent=${resultEvent}`,
    `textEvent=${textEvent}`,
    `toolEvent=${toolEvent}`,
    `parseErrors=${parseErrorCount}`,
    `nonJsonLines=${nonJsonLineCount}`
  ];
  const stdoutTail = tailText(stdout);
  if (stdoutTail) {
    parts.push(`stdoutTail=${JSON.stringify(stdoutTail)}`);
  }
  return parts.join("; ");
}
function buildClaudePermissionDenialDiagnostics(event) {
  const denials = Array.isArray(event.permission_denials) ? event.permission_denials : [];
  return denials.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item;
    const toolName = typeof record.tool_name === "string" && record.tool_name.trim() ? record.tool_name.trim() : "unknown";
    const command = record.tool_input && typeof record.tool_input === "object" ? record.tool_input.command : void 0;
    const commandPreview = typeof command === "string" && command.trim() ? `: ${command.trim()}` : "";
    return [createDiagnostic(
      "harness.tool_permission_denied",
      `Claude Code denied ${toolName}${commandPreview}.`,
      {
        rawProviderMessage: tailText(JSON.stringify(record))
      }
    )];
  });
}
function buildDefaultClaudeAllowedTools() {
  return [...CLAUDE_ROOT_BASE_ALLOWED_TOOLS];
}
function dedupeStrings2(values) {
  return [...new Set(values.filter((value) => value.trim()))];
}
async function buildClaudeControlResponse(event, request, sessionId) {
  if (event.type !== "control_request") {
    return null;
  }
  const requestId = typeof event.request_id === "string" ? event.request_id : "";
  if (!requestId) {
    return null;
  }
  const controlRequest = event.request && typeof event.request === "object" ? event.request : {};
  const input = controlRequest.input && typeof controlRequest.input === "object" ? controlRequest.input : {};
  if (request.onApprovalRequest) {
    const toolName = typeof controlRequest.tool_name === "string" ? controlRequest.tool_name : "unknown";
    const decision = await request.onApprovalRequest({
      harness: "claude",
      sessionId,
      toolName,
      toolInput: input,
      contentPreview: formatToolApprovalPreview2(toolName, input)
    });
    if (decision.decision !== "approved") {
      return JSON.stringify({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            behavior: "deny",
            message: decision.comment ?? "Rejected in AgentSpace."
          }
        }
      });
    }
  }
  return JSON.stringify({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: {
        behavior: "allow",
        updatedInput: input
      }
    }
  });
}
function formatToolApprovalPreview2(toolName, toolInput) {
  if (toolName === "Bash" && typeof toolInput?.command === "string") {
    return `Bash: ${toolInput.command}`;
  }
  return `${toolName}: ${JSON.stringify(toolInput ?? {})}`;
}

// src/agent-router/adapters/codex.ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname3, join as join2 } from "node:path";
var CODEX_OUTPUT_ENV = "AGENT_ROUTER_CODEX_OUTPUT_FILE";
var codexAdapter = {
  id: "codex",
  label: "Codex CLI",
  detect: detectCodex,
  buildLaunch: buildCodexLaunch,
  run: runCodex,
  normalizeError: (error, context) => normalizeAdapterError("codex", error, context)
};
async function detectCodex() {
  const executable = await findExecutableOnPath("codex");
  if (!executable) {
    return { id: "codex", label: "Codex CLI", status: "missing" };
  }
  return {
    id: "codex",
    label: "Codex CLI",
    status: "available",
    path: executable,
    version: await runVersionCommand(executable, ["--version"])
  };
}
async function buildCodexLaunch(input) {
  const executable = await resolveExecutablePath("codex", input.executablePath);
  if (!executable) {
    throw new Error("Codex CLI was not found on PATH.");
  }
  const outputDir = mkdtempSync(join2(tmpdir(), "agent-router-codex-"));
  const outputFile = join2(outputDir, "last-message.txt");
  const baseArgs = [
    "--json",
    "--skip-git-repo-check",
    "-o",
    outputFile
  ];
  if (input.model) {
    baseArgs.push("--model", input.model);
  }
  if (input.mode) {
    baseArgs.push("--sandbox", input.mode);
  }
  if (input.dangerouslyBypassPermissions) {
    baseArgs.push(
      "--dangerously-bypass-approvals-and-sandbox",
      "-c",
      'sandbox_mode="danger-full-access"',
      "-c",
      'approval_policy="never"',
      "-c",
      'shell_environment_policy.inherit="all"'
    );
  }
  const args = input.sessionId ? ["exec", "resume", ...baseArgs, input.sessionId, input.prompt] : ["exec", ...baseArgs, "--cd", input.cwd, input.prompt];
  const env = buildBaseEnv(
    executable,
    buildCapabilityEnv({ ...input.env, [CODEX_OUTPUT_ENV]: outputFile }, input.runtimeToolCapabilities),
    buildCapabilityPathDirs(input.runtimeToolCapabilities)
  );
  return {
    executable,
    args,
    cwd: input.cwd,
    env,
    timeoutMs: resolveTimeoutMs(input.timeoutMs),
    redactions: buildRedactions(env)
  };
}
async function runCodex(plan, observer, request) {
  try {
    return await runNativeHarness("codex", plan, observer, request, {
      emptyMessage: "Codex CLI returned an empty final message.",
      nonZeroMessage: (exitCode) => `Codex CLI exited with code ${exitCode}.`,
      timeoutMessage: (timeoutMs) => `Codex CLI timed out after ${timeoutMs}ms.`,
      parseEvents: (stdout, stderr, runObserver) => {
        const parsed = parseJsonEventOutput(stdout);
        const diagnostics = [...parsed.diagnostics];
        let outputText = readCodexOutputFile(plan.env[CODEX_OUTPUT_ENV]);
        for (const event of parsed.events) {
          for (const mapped of mapCodexNativeEvent(event)) {
            runObserver.emit(mapped);
          }
          const finalText = extractCodexFinalText(event);
          if (finalText) {
            outputText = finalText;
          }
        }
        if (!outputText && parsed.events.length === 0 && stdout.trim() && !stdout.trim().startsWith("{")) {
          outputText = stdout.trim();
        }
        if (parsed.diagnostics.length > 0) {
          diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "Codex JSON event output could not be fully parsed.", {
            stderrTail: tailText(stderr)
          }));
        }
        const sessionId = discoverSessionId(parsed.events, request.sessionId);
        emitSessionUpdate(runObserver, sessionId);
        return { outputText, sessionId, diagnostics };
      }
    });
  } finally {
    cleanupCodexOutputFile(plan.env[CODEX_OUTPUT_ENV]);
  }
}
function readCodexOutputFile(outputFile) {
  if (!outputFile) {
    return "";
  }
  try {
    return readFileSync(outputFile, "utf8").trim();
  } catch {
    return "";
  }
}
function cleanupCodexOutputFile(outputFile) {
  if (!outputFile) {
    return;
  }
  rmSync(dirname3(outputFile), { recursive: true, force: true });
}

// src/agent-router/adapters/hermes.ts
var HERMES_COMMANDS = ["hermes", "hermes-agent"];
var hermesAdapter = {
  id: "hermes",
  label: "Hermes Agent",
  detect: detectHermes,
  buildLaunch: buildHermesLaunch,
  run: runHermes,
  normalizeError: (error, context) => normalizeAdapterError("hermes", error, context)
};
async function detectHermes() {
  const executable = await findFirstHermesExecutable();
  if (!executable) {
    return { id: "hermes", label: "Hermes Agent", status: "missing" };
  }
  return {
    id: "hermes",
    label: "Hermes Agent",
    status: "available",
    path: executable,
    version: await detectHermesVersion(executable)
  };
}
async function buildHermesLaunch(input) {
  const executable = await resolveHermesExecutable(input.executablePath);
  if (!executable) {
    throw new Error("Hermes Agent CLI was not found on PATH.");
  }
  const args = ["-z", input.prompt, "--yolo"];
  if (input.model) {
    args.push("--model", input.model);
  }
  const env = buildBaseEnv(
    executable,
    buildCapabilityEnv(input.env ?? {}, input.runtimeToolCapabilities),
    buildCapabilityPathDirs(input.runtimeToolCapabilities)
  );
  return {
    executable,
    args,
    cwd: input.cwd,
    env,
    timeoutMs: resolveTimeoutMs(input.timeoutMs),
    redactions: buildRedactions(env)
  };
}
async function runHermes(plan, observer, request) {
  return runNativeHarness("hermes", plan, observer, request, {
    emptyMessage: "Hermes Agent returned an empty response.",
    nonZeroMessage: (exitCode) => `Hermes Agent exited with code ${exitCode}.`,
    timeoutMessage: (timeoutMs) => `Hermes Agent timed out after ${timeoutMs}ms.`,
    parseEvents: (stdout) => ({ outputText: stdout.trim() })
  });
}
async function findFirstHermesExecutable() {
  for (const command of HERMES_COMMANDS) {
    const executable = await findExecutableOnPath(command);
    if (executable) {
      return executable;
    }
  }
  return null;
}
async function resolveHermesExecutable(executablePath) {
  if (executablePath?.trim()) {
    return resolveExecutablePath("hermes", executablePath);
  }
  return findFirstHermesExecutable();
}
async function detectHermesVersion(executable) {
  const version = await runVersionCommand(executable, ["--version"]);
  if (version) {
    return version;
  }
  return runVersionCommand(executable, ["version"]);
}

// src/agent-router/adapters/opencode.ts
var opencodeAdapter = {
  id: "opencode",
  label: "OpenCode",
  detect: detectOpenCode,
  buildLaunch: buildOpenCodeLaunch,
  run: runOpenCode,
  normalizeError: (error, context) => normalizeAdapterError("opencode", error, context)
};
async function detectOpenCode() {
  const executable = await findExecutableOnPath("opencode");
  if (!executable) {
    return { id: "opencode", label: "OpenCode", status: "missing" };
  }
  return {
    id: "opencode",
    label: "OpenCode",
    status: "available",
    path: executable,
    version: await detectOpenCodeVersion(executable)
  };
}
async function buildOpenCodeLaunch(input) {
  const executable = await resolveExecutablePath("opencode", input.executablePath);
  if (!executable) {
    throw new Error("OpenCode CLI was not found on PATH.");
  }
  const args = ["run", "--format", "json"];
  if (input.sessionId) {
    args.push("--session", input.sessionId);
  }
  const model = input.model?.trim();
  if (model && model !== "opencode-default") {
    args.push("--model", model);
  }
  args.push(input.prompt);
  const env = buildBaseEnv(
    executable,
    buildCapabilityEnv(input.env ?? {}, input.runtimeToolCapabilities),
    buildCapabilityPathDirs(input.runtimeToolCapabilities)
  );
  return {
    executable,
    args,
    cwd: input.cwd,
    env,
    timeoutMs: resolveTimeoutMs(input.timeoutMs),
    redactions: buildRedactions(env)
  };
}
async function runOpenCode(plan, observer, request) {
  return runNativeHarness("opencode", plan, observer, request, {
    emptyMessage: "OpenCode returned an empty response.",
    nonZeroMessage: (exitCode) => `OpenCode exited with code ${exitCode}.`,
    timeoutMessage: (timeoutMs) => `OpenCode timed out after ${timeoutMs}ms.`,
    parseEvents: (stdout, stderr, runObserver) => {
      const parsed = parseJsonEventOutput(stdout);
      const diagnostics = [...parsed.diagnostics];
      let outputText = "";
      if (parsed.events.length > 0 && outputHasInvalidJsonCandidate(stdout)) {
        diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "OpenCode JSON event output could not be fully parsed.", {
          rawProviderMessage: tailText(stdout),
          stderrTail: tailText(stderr)
        }));
      }
      for (const event of parsed.events) {
        for (const mapped of mapOpenCodeNativeEvent(event)) {
          runObserver.emit(mapped);
        }
        const finalText = extractOpenCodeFinalText(event);
        if (finalText) {
          outputText = appendLine(outputText, finalText);
        }
      }
      if (!outputText && parsed.events.length === 0 && stdout.trim() && !stdout.trim().startsWith("{")) {
        outputText = stdout.trim();
        diagnostics.push(createDiagnostic("harness.protocol_parse_failed", "OpenCode stdout did not contain JSON events; using plain text fallback.", {
          rawProviderMessage: tailText(stdout),
          stderrTail: tailText(stderr)
        }));
      }
      const sessionId = discoverSessionId(parsed.events, request.sessionId);
      emitSessionUpdate(runObserver, sessionId);
      return { outputText, sessionId, diagnostics };
    }
  });
}
async function detectOpenCodeVersion(executable) {
  const version = await runVersionCommand(executable, ["--version"]);
  if (version) {
    return version;
  }
  return runVersionCommand(executable, ["version"]);
}

// src/agent-router/adapters/openclaw.ts
import { randomUUID } from "node:crypto";
import { spawnSync as spawnSync2 } from "node:child_process";

// src/openclaw-health.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join3 } from "node:path";
function inspectOpenClawDaemonAuthHealth(input = {}) {
  const env = input.env ?? process.env;
  const homeDir = input.homeDir ?? env.HOME ?? homedir();
  const profile = input.profile?.trim() || env.OPENCLAW_PROFILE?.trim() || void 0;
  const model = input.model?.trim() || env.OPENCLAW_MODEL?.trim() || void 0;
  const explicitConfigPath = env.OPENCLAW_CONFIG_PATH?.trim() || void 0;
  const openclawConfigPath = explicitConfigPath ?? join3(homeDir, profile ? `.openclaw-${profile}` : ".openclaw", "openclaw.json");
  const authProfilesPath = input.workDir ? join3(input.workDir, "agent", "auth-profiles.json") : void 0;
  const modelsPath = input.workDir ? join3(input.workDir, "agent", "models.json") : void 0;
  const hasOpenClawConfig = existsSync2(openclawConfigPath);
  const authProfiles = authProfilesPath ? readJsonObject(authProfilesPath) : void 0;
  const models = modelsPath ? readJsonObject(modelsPath) : void 0;
  const authProfileCount = authProfiles ? countProfiles(authProfiles) : void 0;
  const hasTaskAuthProfiles = (authProfileCount ?? 0) > 0;
  const hasTaskModels = Boolean(models && Object.keys(models).length > 0);
  const requiresTaskFiles = input.requireTaskFiles ?? (Boolean(input.workDir) || isDaemonTaskWorkDir(input.workDir, env));
  const checkedAt = (input.now ?? /* @__PURE__ */ new Date()).toISOString();
  const base = {
    provider: "openclaw",
    checkedAt,
    authSource: {
      profile,
      openclawConfigPath,
      authProfilesPath,
      modelsPath
    },
    details: {
      profile,
      model,
      hasExplicitConfigPath: Boolean(explicitConfigPath),
      hasOpenClawConfig,
      hasTaskAuthProfiles,
      hasTaskModels,
      requiresTaskFiles,
      authProfileCount
    }
  };
  if (requiresTaskFiles && hasTaskAuthProfiles && hasTaskModels) {
    return {
      ...base,
      status: "healthy",
      usable: true
    };
  }
  if (requiresTaskFiles && !hasTaskAuthProfiles) {
    return {
      ...base,
      status: "broken",
      usable: false,
      error: buildOpenClawError(
        "provider.profile_missing",
        "profile",
        "OpenClaw task auth profile is missing; daemon copied files are not sufficient for execution."
      )
    };
  }
  if (requiresTaskFiles && !hasTaskModels) {
    return {
      ...base,
      status: "broken",
      usable: false,
      error: buildOpenClawError(
        "provider.model_unavailable",
        "model",
        "OpenClaw task model mapping is missing; daemon cannot prove the provider/model route is usable."
      )
    };
  }
  if (profile || hasOpenClawConfig) {
    return {
      ...base,
      status: "degraded",
      usable: true,
      error: buildOpenClawError(
        "provider.profile_missing",
        "profile",
        "OpenClaw config exists, but task-local auth/model files have not been verified yet."
      )
    };
  }
  if (input.requireTaskFiles === false) {
    return {
      ...base,
      status: "unknown",
      usable: false
    };
  }
  return {
    ...base,
    status: "broken",
    usable: false,
    error: buildOpenClawError(
      "provider.profile_missing",
      "profile",
      "OpenClaw auth profile is missing for the daemon user."
    )
  };
}
function buildOpenClawProviderHealthSnapshot(health) {
  const reason = health.error?.message ?? (health.status === "healthy" ? "OpenClaw provider preflight passed." : health.status === "degraded" ? "OpenClaw provider is available but task-local auth/model files have not been verified." : health.status === "unknown" ? "OpenClaw provider health has not been checked." : "OpenClaw provider is currently unavailable.");
  return {
    status: health.status,
    reason,
    checkedAt: health.checkedAt,
    error: health.error ? {
      provider: "openclaw",
      code: health.error.code,
      category: health.error.category,
      message: health.error.message,
      rawProviderMessage: health.error.rawProviderMessage
    } : void 0
  };
}
function normalizeOpenClawProviderError(rawMessage) {
  const trimmed = sanitizeOpenClawDiagnosticOutput(rawMessage.trim());
  if (!trimmed) {
    return void 0;
  }
  if (/\b401\b|user not found|unauthorized|invalid api key|authentication failed|auth(?:orization)? failed/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.auth_invalid",
      "auth",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1A\u8BA4\u8BC1\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 daemon \u7EE7\u627F\u7684 OpenClaw/OpenRouter profile\u3002",
      trimmed
    );
  }
  if (/session .*not found|session.*missing|conversation .*not found|conversation.*missing|agent .*not found|agent.*missing|unknown session/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.session_invalid",
      "runtime",
      "OpenClaw \u5F53\u524D\u4F1A\u8BDD\u4E0D\u53EF\u7528\uFF1A\u65E7 session/conversation/agent \u4E0D\u5B58\u5728\uFF0C\u9700\u8981\u91CD\u65B0\u5F00\u542F\u4F1A\u8BDD\u3002",
      trimmed
    );
  }
  if (/auth-profiles\.json|profile .*not found|profile.*missing|missing .*profile|no auth profiles?/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.profile_missing",
      "profile",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1Adaemon \u6267\u884C\u76EE\u5F55\u7F3A\u5C11\u53EF\u7528 auth profile\u3002",
      trimmed
    );
  }
  if (/model .*not found|model.*unavailable|provider .*not found|no such model|model .*denied|unknown model|invalid model/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.model_unavailable",
      "model",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1A\u5F53\u524D profile \u65E0\u6CD5\u4F7F\u7528\u914D\u7F6E\u7684 provider/model\u3002",
      trimmed
    );
  }
  if (/command not found|no such file or directory|tool .*not found|missing .*tool|executable .*not found|not in path/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.tool_missing",
      "tool",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1A\u4EFB\u52A1\u9700\u8981\u7684 CLI/tool \u4E0D\u5B58\u5728\u6216\u4E0D\u5728 PATH\u3002",
      trimmed
    );
  }
  if (/tool .*unauthorized|not authorized|workspace grant|permission .*required|requires approval/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.tool_unauthorized",
      "tool",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1A\u4EFB\u52A1\u9700\u8981\u7684 tool \u672A\u88AB\u6388\u6743\u3002",
      trimmed
    );
  }
  if (/permission denied|operation not permitted|tool .*denied|provider rejected .*tool|tool call rejected/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.tool_permission_denied",
      "tool",
      "OpenClaw \u5F53\u524D\u4E0D\u53EF\u7528\uFF1Aprovider \u62D2\u7EDD\u4E86 tool \u8C03\u7528\u3002",
      trimmed
    );
  }
  if (/invalid json|json parse|parse.*json|protocol/i.test(trimmed)) {
    return buildOpenClawError(
      "provider.protocol_parse_failed",
      "protocol",
      "OpenClaw \u8F93\u51FA\u534F\u8BAE\u65E0\u6CD5\u89E3\u6790\u3002",
      trimmed
    );
  }
  return void 0;
}
function buildOpenClawError(code, category, message, rawProviderMessage = message) {
  return {
    provider: "openclaw",
    code,
    category,
    message,
    rawProviderMessage: sanitizeOpenClawDiagnosticOutput(rawProviderMessage)
  };
}
function isDaemonTaskWorkDir(workDir, env) {
  if (env.AGENT_SPACE_CONTEXT_TASK_ID?.trim()) {
    return true;
  }
  if (!workDir) {
    return false;
  }
  return existsSync2(join3(workDir, "task.json")) || existsSync2(join3(workDir, "prompt.txt"));
}
function readJsonObject(path) {
  if (!existsSync2(path)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function countProfiles(value) {
  const profiles = value.profiles;
  if (profiles && typeof profiles === "object" && !Array.isArray(profiles)) {
    return Object.keys(profiles).length;
  }
  return Object.keys(value).length;
}
function sanitizeOpenClawDiagnosticOutput(value) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[redacted-secret]").replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|API[_-]?KEY|AUTH)[A-Z0-9_]*\s*=\s*)[^\s"']+/gi, "$1[redacted]").replace(/([?&](?:access_token|refresh_token|token|api_key)=)[^&\s"']+/gi, "$1[redacted]").replace(/("(?:token|accessToken|refreshToken|apiKey|api_key|secret|profileSecret|profile_secret|authorization)"\s*:\s*")[^"]+/gi, "$1[redacted]").replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[redacted]");
}

// src/agent-router/adapters/openclaw.ts
var openClawAdapter = {
  id: "openclaw",
  label: "OpenClaw",
  detect: detectOpenClaw,
  buildLaunch: buildOpenClawLaunch,
  run: runOpenClaw,
  normalizeError: (error, context) => normalizeAdapterError("openclaw", error, context)
};
async function detectOpenClaw() {
  const executable = await findExecutableOnPath("openclaw");
  if (!executable) {
    return { id: "openclaw", label: "OpenClaw", status: "missing" };
  }
  return {
    id: "openclaw",
    label: "OpenClaw",
    status: "available",
    path: executable,
    version: await runVersionCommand(executable, ["--version"])
  };
}
async function buildOpenClawLaunch(input) {
  const executable = await resolveExecutablePath("openclaw", input.executablePath);
  if (!executable) {
    throw new Error("OpenClaw CLI was not found on PATH.");
  }
  const contract = resolveOpenClawContract(input);
  const env = buildBaseEnv(
    executable,
    buildCapabilityEnv(contract.env, input.runtimeToolCapabilities),
    buildCapabilityPathDirs(input.runtimeToolCapabilities)
  );
  const health = inspectOpenClawDaemonAuthHealth({
    workDir: input.cwd,
    env,
    profile: contract.profile,
    model: contract.model,
    requireTaskFiles: isDaemonTaskOpenClawRun(input, env) ? true : false
  });
  const args = buildOpenClawGlobalArgs(contract);
  const agentName = input.openClawEphemeralAgent && !input.sessionId ? `agent-space-${randomUUID().slice(0, 8)}` : void 0;
  args.push("agent", "--local");
  if (agentName) {
    args.push("--agent", agentName);
  }
  args.push("--message", input.prompt, "--json");
  if (input.sessionId) {
    args.push("--session-id", input.sessionId);
  }
  if (input.mode && isOpenClawThinkingMode(input.mode)) {
    args.push("--thinking", input.mode);
  }
  return {
    executable,
    args,
    cwd: input.cwd,
    env,
    metadata: buildOpenClawPlanMetadata(health, contract, agentName),
    timeoutMs: resolveTimeoutMs(input.timeoutMs),
    redactions: buildRedactions(env)
  };
}
async function runOpenClaw(plan, observer, request) {
  const preflightDiagnostics = readOpenClawPreflightDiagnostics(plan);
  const brokenPreflight = preflightDiagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (brokenPreflight) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      status: "failed",
      harness: "openclaw",
      events: [],
      diagnostics: [brokenPreflight],
      startedAt: now,
      finishedAt: now
    };
  }
  try {
    const setupResult = await setupEphemeralAgent(plan, observer);
    if (setupResult) {
      return withPreflightDiagnostics(setupResult, preflightDiagnostics);
    }
    const result = await runNativeHarness("openclaw", plan, observer, request, {
      emptyMessage: "OpenClaw returned an empty response.",
      nonZeroMessage: (exitCode) => `OpenClaw exited with code ${exitCode}.`,
      timeoutMessage: (timeoutMs) => `OpenClaw timed out after ${timeoutMs}ms.`,
      failureDiagnostics: (processResult) => buildOpenClawFailureDiagnostics(
        "run",
        processResult.stderr,
        processResult.stdout,
        processResult.exitCode
      ),
      parseEvents: (stdout, _stderr, runObserver) => {
        const parsed = parseJsonEventOutput(stdout);
        const diagnostics = [...parsed.diagnostics];
        let outputText = "";
        for (const event of parsed.events) {
          for (const mapped of mapOpenClawNativeEvent(event)) {
            runObserver.emit(mapped);
          }
          const text = extractText(event);
          if (text) {
            outputText = text;
          }
        }
        if (!outputText && parsed.events.length === 0 && stdout.trim() && !stdout.trim().startsWith("{")) {
          outputText = stdout.trim();
        }
        if (parsed.events.length === 0 && stdout.trim()) {
          diagnostics.push(createDiagnostic(
            "harness.protocol_parse_failed",
            "OpenClaw stdout did not contain JSON events; using plain text fallback.",
            {
              severity: "warning",
              rawProviderMessage: tailText(stdout)
            }
          ));
        }
        diagnostics.push(...buildOpenClawEventDiagnostics(parsed.events));
        const sessionId = discoverSessionId(parsed.events, request.sessionId);
        emitSessionUpdate(runObserver, sessionId);
        return { outputText, sessionId, diagnostics };
      }
    });
    return withPreflightDiagnostics(result, preflightDiagnostics);
  } finally {
    cleanupEphemeralAgent(plan, observer);
  }
}
function buildOpenClawGlobalArgs(contract) {
  return contract.profile ? ["--profile", contract.profile] : [];
}
function resolveOpenClawContract(input) {
  const env = { ...input.env ?? {} };
  const profile = env.AGENT_SPACE_OPENCLAW_PROFILE_OVERRIDE?.trim() || env.OPENCLAW_PROFILE?.trim() || process.env.OPENCLAW_PROFILE?.trim() || void 0;
  const model = env.AGENT_SPACE_OPENCLAW_MODEL_OVERRIDE?.trim() || input.model?.trim() || env.OPENCLAW_MODEL?.trim() || process.env.OPENCLAW_MODEL?.trim() || void 0;
  delete env.AGENT_SPACE_OPENCLAW_PROFILE_OVERRIDE;
  delete env.AGENT_SPACE_OPENCLAW_MODEL_OVERRIDE;
  if (profile) {
    env.OPENCLAW_PROFILE = profile;
  }
  if (model) {
    env.OPENCLAW_MODEL = model;
  }
  return { profile, model, env };
}
function isOpenClawThinkingMode(mode) {
  return ["off", "minimal", "low", "medium", "high"].includes(mode);
}
function cleanupEphemeralAgent(plan, observer) {
  const agentName = plan.metadata?.openClawEphemeralAgentName;
  if (!agentName) {
    return;
  }
  const args = [...extractOpenClawGlobalArgs(plan.args), "agents", "delete", agentName, "--force", "--json"];
  const result = spawnSync2(plan.executable, args, {
    cwd: plan.cwd,
    env: plan.env,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    observer.emit({
      type: "tool_output",
      tool: "openclaw_cleanup",
      output: `openclaw cleanup warning: ${result.error?.message ?? result.stderr?.trim() ?? "failed to delete temporary agent"}`
    });
  }
}
async function setupEphemeralAgent(plan, observer) {
  const agentName = plan.metadata?.openClawEphemeralAgentName;
  if (!agentName) {
    return void 0;
  }
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const setupPlan = {
    ...plan,
    args: [...extractOpenClawGlobalArgs(plan.args), "agents", "add", agentName, "--workspace", plan.cwd, "--non-interactive", "--json"],
    stdin: void 0,
    keepStdinOpen: false
  };
  const result = await runLaunchPlan("openclaw", setupPlan, { observer });
  if (result.timedOut) {
    return {
      status: "timeout",
      harness: "openclaw",
      events: [],
      diagnostics: [
        createDiagnostic("harness.timeout", `OpenClaw setup timed out after ${plan.timeoutMs}ms.`, {
          stderrTail: tailText(result.stderr)
        })
      ],
      exitCode: result.exitCode,
      signal: result.signal,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  if (result.exitCode !== 0) {
    const diagnostics = buildOpenClawFailureDiagnostics("setup", result.stderr, result.stdout, result.exitCode);
    return {
      status: "failed",
      harness: "openclaw",
      events: [],
      diagnostics,
      exitCode: result.exitCode,
      signal: result.signal,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return void 0;
}
function extractOpenClawGlobalArgs(args) {
  if (args[0] === "--profile" && args[1]) {
    return ["--profile", args[1]];
  }
  return [];
}
function buildOpenClawPlanMetadata(health, contract, agentName) {
  const snapshot = buildOpenClawProviderHealthSnapshot(health);
  return {
    ...agentName ? { openClawEphemeralAgentName: agentName } : {},
    openClawProviderHealth: JSON.stringify(snapshot),
    openClawProviderHealthStatus: snapshot.status,
    openClawProviderHealthReason: snapshot.reason ?? "",
    openClawProfile: contract.profile ?? "",
    openClawModel: contract.model ?? ""
  };
}
function readOpenClawPreflightDiagnostics(plan) {
  const raw = plan.metadata?.openClawProviderHealth;
  if (!raw) {
    return [];
  }
  try {
    const health = JSON.parse(raw);
    if (health.status === "healthy" || health.status === "unknown") {
      return [];
    }
    const diagnostic = createDiagnostic(
      mapOpenClawProviderErrorCodeToHarnessCode(health.error?.code),
      health.reason || health.error?.message || "OpenClaw provider preflight did not pass.",
      {
        severity: health.status === "broken" ? "error" : "warning",
        rawProviderMessage: health.error?.rawProviderMessage
      }
    );
    return [diagnostic];
  } catch {
    return [];
  }
}
function withPreflightDiagnostics(result, diagnostics) {
  if (diagnostics.length === 0) {
    return result;
  }
  return {
    ...result,
    diagnostics: dedupeOpenClawDiagnostics([...diagnostics, ...result.diagnostics])
  };
}
function buildOpenClawFailureDiagnostics(phase, stderr, stdout, exitCode) {
  const raw = tailText(`${stderr}
${stdout}`) ?? "";
  const providerError = normalizeOpenClawProviderError(raw);
  const stderrTail = tailText(stderr);
  if (providerError) {
    const diagnostic = createDiagnostic(
      mapOpenClawProviderErrorCodeToHarnessCode(providerError.code),
      providerError.message,
      {
        rawProviderMessage: providerError.rawProviderMessage,
        stderrTail
      }
    );
    return [diagnostic];
  }
  return [
    createDiagnostic("harness.exited_nonzero", `OpenClaw ${phase} exited with code ${exitCode}.`, {
      rawProviderMessage: raw,
      stderrTail
    })
  ];
}
function buildOpenClawEventDiagnostics(events) {
  const diagnostics = [];
  for (const event of events) {
    const rawError = extractOpenClawEventError(event);
    if (!rawError) {
      continue;
    }
    const providerError = normalizeOpenClawProviderError(rawError);
    if (!providerError) {
      continue;
    }
    diagnostics.push(createDiagnostic(
      mapOpenClawProviderErrorCodeToHarnessCode(providerError.code),
      providerError.message,
      {
        rawProviderMessage: providerError.rawProviderMessage
      }
    ));
  }
  return dedupeOpenClawDiagnostics(diagnostics);
}
function extractOpenClawEventError(event) {
  for (const key of ["error", "errors", "message", "stderr", "diagnostic"]) {
    const value = event[key];
    const text = typeof value === "string" ? value : Array.isArray(value) ? value.filter((item) => typeof item === "string").join("\n") : void 0;
    if (text && /error|unauthorized|auth|profile|model|session|conversation|agent|tool|permission|json|protocol/i.test(text)) {
      return text;
    }
  }
  return void 0;
}
function mapOpenClawProviderErrorCodeToHarnessCode(code) {
  if (code === "provider.cli_missing") return "harness.cli_missing";
  if (code === "provider.auth_invalid") return "harness.auth_invalid";
  if (code === "provider.profile_missing") return "harness.profile_missing";
  if (code === "provider.model_unavailable") return "harness.model_unavailable";
  if (code === "provider.session_invalid") return "harness.session_missing";
  if (code === "provider.tool_missing") return "harness.tool_missing";
  if (code === "provider.tool_unauthorized") return "harness.tool_unauthorized";
  if (code === "provider.tool_permission_denied") return "harness.tool_permission_denied";
  if (code === "provider.empty_response") return "harness.empty_response";
  if (code === "provider.protocol_parse_failed") return "harness.protocol_parse_failed";
  if (code === "provider.timeout") return "harness.timeout";
  return "harness.exited_nonzero";
}
function isDaemonTaskOpenClawRun(input, env) {
  if (!input.openClawEphemeralAgent) {
    return false;
  }
  return Boolean(env.AGENT_SPACE_CONTEXT_TASK_ID?.trim());
}
function dedupeOpenClawDiagnostics(diagnostics) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.message}:${diagnostic.rawProviderMessage ?? ""}:${diagnostic.stderrTail ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

// src/agent-router/adapters/index.ts
var HARNESS_ADAPTERS = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
  openclaw: openClawAdapter,
  hermes: hermesAdapter
};
function getHarnessAdapter(harness) {
  return HARNESS_ADAPTERS[harness];
}

// src/agent-router/router.ts
function listAgentRouterHarnesses() {
  return AGENT_ROUTER_HARNESSES.map((id) => ({
    id,
    label: HARNESS_ADAPTERS[id].label
  }));
}
async function detectAgentRouterHarnesses() {
  const harnesses = await Promise.all(AGENT_ROUTER_HARNESSES.map((id) => HARNESS_ADAPTERS[id].detect()));
  return { harnesses };
}
async function runAgentRouter(request, observer = { emit: () => {
} }) {
  const validationError = validateRunRequest(request);
  if (validationError) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      status: "failed",
      harness: isAgentRouterHarness(request.harness) ? request.harness : "codex",
      events: [],
      diagnostics: [createDiagnostic("harness.unknown_failure", validationError)],
      startedAt: now,
      finishedAt: now
    };
  }
  const adapter = getHarnessAdapter(request.harness);
  const events = [];
  const teeObserver = {
    emit: (event) => {
      events.push(event);
      observer.emit(event);
    }
  };
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const detection = request.executablePath ? await detectRequestedExecutable(request.harness, request.executablePath) : await adapter.detect();
    if (detection.status === "available") {
      teeObserver.emit({
        type: "harness_detected",
        harness: detection.id,
        path: detection.path,
        version: detection.version
      });
    }
    if (detection.status !== "available") {
      return {
        status: "failed",
        harness: request.harness,
        events,
        diagnostics: [
          createDiagnostic("harness.cli_missing", `${adapter.label} CLI was not found on PATH.`)
        ],
        startedAt,
        finishedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const plan = await adapter.buildLaunch({
      ...request,
      cwd: resolve2(request.cwd)
    });
    const capabilityDiagnostics = runCapabilityDiagnostics({
      env: plan.env,
      capabilities: request.runtimeToolCapabilities
    });
    if (capabilityDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return {
        status: "failed",
        harness: request.harness,
        events,
        diagnostics: capabilityDiagnostics,
        startedAt,
        finishedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const result = await adapter.run(plan, teeObserver, request);
    return {
      ...result,
      events: mergeEventStreams(events, result.events),
      diagnostics: mergeDiagnostics(capabilityDiagnostics, result.diagnostics)
    };
  } catch (error) {
    return {
      status: "failed",
      harness: request.harness,
      events,
      diagnostics: [adapter.normalizeError(error, { request })],
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
async function detectRequestedExecutable(harness, executablePath) {
  const path = await resolveExecutablePath(harness, executablePath);
  if (!path) {
    return {
      id: harness,
      label: HARNESS_ADAPTERS[harness].label,
      status: "missing"
    };
  }
  return {
    id: harness,
    label: HARNESS_ADAPTERS[harness].label,
    status: "available",
    path
  };
}
function isAgentRouterHarness(value) {
  return AGENT_ROUTER_HARNESSES.includes(value);
}
function validateRunRequest(request) {
  if (request.version !== 1) {
    return "AgentRouter request version must be 1.";
  }
  if (!isAgentRouterHarness(request.harness)) {
    return `Unsupported harness "${request.harness}".`;
  }
  if (!request.prompt.trim()) {
    return "Prompt is required.";
  }
  if (!request.cwd.trim()) {
    return "cwd is required.";
  }
  return void 0;
}
function mergeEventStreams(first, second) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const event of [...first, ...second]) {
    const key = JSON.stringify(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(event);
  }
  return result;
}
function mergeDiagnostics(first, second) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const diagnostic of [...first, ...second]) {
    const key = `${diagnostic.code}:${diagnostic.message}:${diagnostic.rawProviderMessage ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}
export {
  AGENT_ROUTER_HARNESSES,
  buildCapabilityAllowedTools,
  buildCapabilityPathDirs,
  buildDefaultClaudeAllowedTools,
  detectAgentRouterHarnesses,
  isAgentRouterHarness,
  listAgentRouterHarnesses,
  normalizeRuntimeToolCapabilities,
  runAgentRouter
};
