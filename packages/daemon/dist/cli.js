#!/usr/bin/env node

// src/cli.ts
import { pathToFileURL } from "node:url";

// src/remote-daemon.ts
import { createReadStream, existsSync as existsSync9, mkdirSync as mkdirSync5, rmSync as rmSync5, statSync as statSync4, writeFileSync as writeFileSync5 } from "node:fs";
import { spawn as spawn5 } from "node:child_process";
import { resolve as resolve10 } from "node:path";

// ../db/src/database.ts
var DEFAULT_WORKSPACE_ID = "default";
var WORKER_REQUEST_TIMEOUT_MS = resolveWorkerRequestTimeoutMs();
var WORKER_SIGNAL_BUFFER = new SharedArrayBuffer(4);
var WORKER_SIGNAL = new Int32Array(WORKER_SIGNAL_BUFFER);
var POSTGRES_SYNC_WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { Client, types } = require(workerData.pgModulePath);
const responseSignal = new Int32Array(workerData.responseSignalBuffer);

types.setTypeParser(types.builtins.JSON, (value) => value);
types.setTypeParser(types.builtins.JSONB, (value) => value);
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => value);
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

let port = null;
let client = null;
let connectedDatabaseUrl = null;

parentPort?.on("message", (message) => {
  if (!isPortMessage(message)) {
    return;
  }

  port = message.port;
  port.on("message", (request) => {
    void handleRequest(request);
  });
  port.start();
});

async function handleRequest(message) {
  if (!port || !isWorkerRequest(message)) {
    return;
  }

  const request = message;
  const response = {
    requestId: request.requestId,
    ok: true,
  };

  try {
    if (request.action === "close") {
      await closeClient();
      response.value = { closed: true };
    } else if (request.action === "exec") {
      const db = await ensureClient(request.databaseUrl);
      await db.query(normalizeExecSql(request.sql));
      response.value = { rowCount: 0, rows: [] };
    } else {
      const db = await ensureClient(request.databaseUrl);
      const result = await db.query(request.sql, request.params);
      response.value = {
        rowCount: result.rowCount ?? 0,
        rows: normalizeRows(result.rows),
      };
    }
  } catch (error) {
    response.ok = false;
    response.error = serializeError(error);
  }

  postResponse(response);
}

function postResponse(response) {
  port.postMessage(response);
  Atomics.add(responseSignal, 0, 1);
  Atomics.notify(responseSignal, 0, 1);
}

async function ensureClient(databaseUrl) {
  if (client && connectedDatabaseUrl === databaseUrl) {
    return client;
  }

  await closeClient();
  client = new Client({
    connectionString: databaseUrl,
  });
  await client.connect();
  connectedDatabaseUrl = databaseUrl;
  return client;
}

async function closeClient() {
  if (!client) {
    connectedDatabaseUrl = null;
    return;
  }

  const activeClient = client;
  client = null;
  connectedDatabaseUrl = null;
  await activeClient.end();
}

function normalizeExecSql(sql) {
  const trimmed = sql.trim();
  if (/^BEGIN\\s+IMMEDIATE$/i.test(trimmed)) {
    return "BEGIN";
  }
  return sql;
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function isPortMessage(value) {
  return typeof value === "object" && value !== null && "port" in value;
}

function isWorkerRequest(value) {
  if (typeof value !== "object" || value === null || !("requestId" in value) || !("action" in value)) {
    return false;
  }

  return typeof value.requestId === "string"
    && (value.action === "exec" || value.action === "query" || value.action === "close");
}

const NORMALIZED_ROW_KEY_ALIASES = new Map([
  ["acceptedat", "acceptedAt"],
  ["acceptedagentname", "acceptedAgentName"],
  ["acceptedruntimeid", "acceptedRuntimeId"],
  ["addedby", "addedBy"],
  ["agentid", "agentId"],
  ["auditdatajson", "auditDataJson"],
  ["appname", "appName"],
  ["appsource", "appSource"],
  ["assignmentmode", "assignmentMode"],
  ["avatarurl", "avatarUrl"],
  ["boundat", "boundAt"],
  ["channelname", "channelName"],
  ["channelmemberaccess", "channelMemberAccess"],
  ["claimedat", "claimedAt"],
  ["commandplanjson", "commandPlanJson"],
  ["configjson", "configJson"],
  ["connectedat", "connectedAt"],
  ["conversationkey", "conversationKey"],
  ["createdat", "createdAt"],
  ["createdby", "createdBy"],
  ["createdbyuserid", "createdByUserId"],
  ["datajson", "dataJson"],
  ["daemonconnectionid", "daemonConnectionId"],
  ["daemonkey", "daemonKey"],
  ["deviceinfo", "deviceInfo"],
  ["decidedat", "decidedAt"],
  ["decidedbyuserid", "decidedByUserId"],
  ["decisionnote", "decisionNote"],
  ["devicename", "deviceName"],
  ["displayname", "displayName"],
  ["documentid", "documentId"],
  ["emailverified", "emailVerified"],
  ["employeename", "employeeName"],
  ["employeenamesjson", "employeeNamesJson"],
  ["errorcode", "errorCode"],
  ["errormessage", "errorMessage"],
  ["externalfileid", "externalFileId"],
  ["externalprovider", "externalProvider"],
  ["externalurl", "externalUrl"],
  ["errortext", "errorText"],
  ["entrypoint", "entryPoint"],
  ["expiresat", "expiresAt"],
  ["finishedat", "finishedAt"],
  ["forkinvitationid", "forkInvitationId"],
  ["grantedbyuserid", "grantedByUserId"],
  ["googleemail", "googleEmail"],
  ["googleoauthcredentialid", "googleOAuthCredentialId"],
  ["googlesubject", "googleSubject"],
  ["humanmembercount", "humanMemberCount"],
  ["humanmembernamesjson", "humanMemberNamesJson"],
  ["importmode", "importMode"],
  ["importedat", "importedAt"],
  ["inputjson", "inputJson"],
  ["installcmd", "installCmd"],
  ["installstrategy", "installStrategy"],
  ["installedat", "installedAt"],
  ["installedbyuserid", "installedByUserId"],
  ["invitedby", "invitedBy"],
  ["invitationid", "invitationId"],
  ["ipaddress", "ipAddress"],
  ["issueid", "issueId"],
  ["joinedat", "joinedAt"],
  ["labelsjson", "labelsJson"],
  ["lasterror", "lastError"],
  ["lastheartbeatat", "lastHeartbeatAt"],
  ["lastcheckedat", "lastCheckedAt"],
  ["lastloginat", "lastLoginAt"],
  ["lastseenat", "lastSeenAt"],
  ["lastusedat", "lastUsedAt"],
  ["knowledgepageid", "knowledgePageId"],
  ["approvalid", "approvalId"],
  ["assignedemployeenamesjson", "assignedEmployeeNamesJson"],
  ["baseupdatedat", "baseUpdatedAt"],
  ["contentmarkdown", "contentMarkdown"],
  ["createdknowledgepageid", "createdKnowledgePageId"],
  ["metadatajson", "metadataJson"],
  ["memorysummary", "memorySummary"],
  ["owneruserid", "ownerUserId"],
  ["optionsjson", "optionsJson"],
  ["primaryemail", "primaryEmail"],
  ["profilejson", "profileJson"],
  ["providersubject", "providerSubject"],
  ["providersessionid", "providerSessionId"],
  ["queuedat", "queuedAt"],
  ["readat", "readAt"],
  ["remarkname", "remarkName"],
  ["resultjson", "resultJson"],
  ["requestedbydisplayname", "requestedByDisplayName"],
  ["requestedbyuserid", "requestedByUserId"],
  ["requestedbyagentname", "requestedByAgentName"],
  ["requestedforchannelname", "requestedForChannelName"],
  ["requestedrole", "requestedRole"],
  ["requestedat", "requestedAt"],
  ["requesteruserid", "requesterUserId"],
  ["requesttype", "requestType"],
  ["requirestext", "requiresText"],
  ["resolvedat", "resolvedAt"],
  ["resolvedby", "resolvedBy"],
  ["resolveruserid", "resolverUserId"],
  ["respondedat", "respondedAt"],
  ["respondedby", "respondedBy"],
  ["accesstokenencrypted", "accessTokenEncrypted"],
  ["removedat", "removedAt"],
  ["recipientid", "recipientId"],
  ["recipienttype", "recipientType"],
  ["refreshtokenencrypted", "refreshTokenEncrypted"],
  ["registryjson", "registryJson"],
  ["revokedat", "revokedAt"],
  ["runtimeid", "runtimeId"],
  ["runtimeappid", "runtimeAppId"],
  ["runtimename", "runtimeName"],
  ["routersessionid", "routerSessionId"],
  ["runid", "runId"],
  ["sessionid", "sessionId"],
  ["snapshotjson", "snapshotJson"],
  ["skillmd", "skillMd"],
  ["skillid", "skillId"],
  ["skillname", "skillName"],
  ["safestderrtail", "safeStderrTail"],
  ["safestdouttail", "safeStdoutTail"],
  ["sortorder", "sortOrder"],
  ["sourcetype", "sourceType"],
  ["sourceurl", "sourceUrl"],
  ["sourceagentname", "sourceAgentName"],
  ["sourcechannelname", "sourceChannelName"],
  ["sourceeventidsjson", "sourceEventIdsJson"],
  ["sourcetaskid", "sourceTaskId"],
  ["sourcetaskqueueid", "sourceTaskQueueId"],
  ["parentid", "parentId"],
  ["reviewercomment", "reviewerComment"],
  ["subjectid", "subjectId"],
  ["tagsjson", "tagsJson"],
  ["targetknowledgepageid", "targetKnowledgePageId"],
  ["targetchannelname", "targetChannelName"],
  ["targetuserid", "targetUserId"],
  ["subjecttype", "subjectType"],
  ["syncedat", "syncedAt"],
  ["snapshottype", "snapshotType"],
  ["startedat", "startedAt"],
  ["taskid", "taskId"],
  ["taskqueueid", "taskQueueId"],
  ["tokenhash", "tokenHash"],
  ["traitsjson", "traitsJson"],
  ["triggertype", "triggerType"],
  ["updatedat", "updatedAt"],
  ["updatecmd", "updateCmd"],
  ["updatedby", "updatedBy"],
  ["updatedbyuserid", "updatedByUserId"],
  ["uninstallcmd", "uninstallCmd"],
  ["useragent", "userAgent"],
  ["userid", "userId"],
  ["workdir", "workDir"],
  ["workspaceid", "workspaceId"],
  ["actionhref", "actionHref"],
  ["archivedat", "archivedAt"],
  ["actorid", "actorId"],
  ["actortype", "actorType"],
  ["attemptid", "attemptId"],
  ["dedupekey", "dedupeKey"],
  ["handoffsnapshotid", "handoffSnapshotId"],
  ["resourceid", "resourceId"],
  ["resourcetype", "resourceType"],
]);

function normalizeRows(rows) {
  return rows.map((row) => normalizeRow(row));
}

function normalizeRow(row) {
  const normalized = { ...row };
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeRowKey(key);
    if (normalizedKey && !(normalizedKey in normalized)) {
      normalized[normalizedKey] = value;
    }
  }
  return normalized;
}

function normalizeRowKey(key) {
  const alias = NORMALIZED_ROW_KEY_ALIASES.get(key);
  if (alias) {
    return alias;
  }
  return key.includes("_") ? key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) : undefined;
}
`;
function resolveWorkerRequestTimeoutMs() {
  const parsed = Number.parseInt(process.env.AGENT_SPACE_DB_WORKER_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1e4;
}

// ../db/src/storage-paths.ts
import { join, resolve } from "node:path";
var LOCAL_DAEMON_STATE_DIR = join("data", "daemon");
function getDaemonWorkspaceExecutionRootDir(stateDir, workspaceId = DEFAULT_WORKSPACE_ID) {
  return join(resolve(stateDir), "workspaces", sanitizeStoragePathSegment(workspaceId, DEFAULT_WORKSPACE_ID));
}
function getDaemonTaskWorkDirPath(stateDir, input) {
  return join(
    getDaemonWorkspaceExecutionRootDir(stateDir, input.workspaceId ?? DEFAULT_WORKSPACE_ID),
    "workdirs",
    sanitizeStoragePathSegment(input.taskId, "task")
  );
}
function getDaemonChannelWorkDirPath(stateDir, input) {
  return join(
    getDaemonWorkspaceExecutionRootDir(stateDir, input.workspaceId ?? DEFAULT_WORKSPACE_ID),
    "workdirs",
    "channels",
    sanitizeStoragePathSegment(input.threadId, "channel"),
    sanitizeStoragePathSegment(input.agentId, "agent")
  );
}
function sanitizeStoragePathSegment(value, fallback = "item") {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

// ../domain/src/workspace.ts
var navItems = [
  { href: "/im", label: "Channels", note: "Team conversation" },
  { href: "/contacts", label: "Contacts", note: "Direct messages" },
  { href: "/market", label: "Market", note: "In development" }
];
var defaultActiveEmployees = [];
var defaultWorkspaceState = {
  organizationName: "AgentSpace",
  pendingHandoffs: 0,
  humanMembers: [],
  skills: [],
  activeEmployees: defaultActiveEmployees,
  directConversations: [],
  conversationExecutionWorkspaces: [],
  channels: [],
  channelDocuments: [],
  channelDocumentVersions: [],
  channelDocumentBlocks: [],
  channelDocumentAccesses: [],
  channelDocumentChangeSets: [],
  channelDocumentConflicts: [],
  channelDocumentPresences: [],
  channelDocumentRuns: [],
  channelDocumentRunSteps: [],
  externalSheetOperationRuns: [],
  collaborationCommentThreads: [],
  collaborationComments: [],
  collaborationActivities: [],
  collaborationChangeProposals: [],
  materials: [],
  knowledgePages: [],
  messages: [],
  tasks: [],
  approvals: [],
  dataTables: [],
  automationRules: [],
  scheduledTasks: [],
  templates: [],
  ledger: []
};
function createDefaultWorkspaceState() {
  return structuredClone(defaultWorkspaceState);
}
function createWorkspaceSnapshot(state) {
  return {
    navItems,
    stats: [
      { label: "Active Agents", value: formatCount(state.activeEmployees.length) },
      { label: "Open Handoffs", value: formatCount(state.pendingHandoffs) },
      { label: "Human Members", value: formatCount(state.humanMembers.length) }
    ],
    channels: state.channels.map((channel) => ({
      name: channel.name,
      members: `${channel.humanMembers} humans / ${channel.employeeNames.length} agents`
    })),
    skills: state.skills,
    channelDocuments: state.channelDocuments,
    channelDocumentVersions: state.channelDocumentVersions,
    channelDocumentBlocks: state.channelDocumentBlocks,
    channelDocumentAccesses: state.channelDocumentAccesses,
    channelDocumentChangeSets: state.channelDocumentChangeSets,
    channelDocumentConflicts: state.channelDocumentConflicts,
    channelDocumentPresences: state.channelDocumentPresences,
    channelDocumentRuns: state.channelDocumentRuns,
    channelDocumentRunSteps: state.channelDocumentRunSteps,
    externalSheetOperationRuns: state.externalSheetOperationRuns,
    collaborationCommentThreads: state.collaborationCommentThreads,
    collaborationComments: state.collaborationComments,
    collaborationActivities: state.collaborationActivities,
    collaborationChangeProposals: state.collaborationChangeProposals,
    materials: state.materials,
    knowledgePages: state.knowledgePages,
    messages: state.messages,
    activeEmployees: state.activeEmployees,
    tasks: state.tasks,
    approvals: state.approvals,
    dataTables: state.dataTables,
    automationRules: state.automationRules,
    scheduledTasks: state.scheduledTasks,
    templates: state.templates,
    ledger: state.ledger
  };
}
var workspaceSnapshot = createWorkspaceSnapshot(createDefaultWorkspaceState());
function formatCount(value) {
  return String(value).padStart(2, "0");
}

// ../domain/src/daemon-provider.ts
var DAEMON_PROVIDER_IDS = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "nanobot",
  "hermes"
];
var DAEMON_PROVIDER_LABELS = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  nanobot: "NanoBot",
  hermes: "Hermes Agent"
};
function isDaemonProvider(value) {
  return DAEMON_PROVIDER_IDS.includes(value);
}
function formatDaemonProviderLabel(provider) {
  return isDaemonProvider(provider) ? DAEMON_PROVIDER_LABELS[provider] : provider;
}

// ../domain/src/agent-templates.ts
var SYSTEM_AGENT_TEMPLATE_PRESETS = [
  {
    id: "finance-analyst",
    version: 1,
    category: "finance",
    displayName: "\u8D22\u52A1\u5206\u6790 Agent",
    shortDescription: "\u9884\u7B97\u3001\u6210\u672C\u3001\u62A5\u8868\u548C\u7ECF\u8425\u5206\u6790\u3002\u9002\u5408\u628A\u6570\u5B57\u62C6\u6210\u5047\u8BBE\u3001\u5DEE\u5F02\u548C\u98CE\u9669\u3002",
    defaultAgentName: "finance-analyst",
    defaultRemarkName: "\u8D22\u52A1\u5206\u6790 Agent",
    defaultTitle: "Finance Analyst",
    summary: "Analyzes budgets, costs, financial reports, and operating metrics with explicit assumptions and risk notes.",
    fit: "Best for budget reviews, cost breakdowns, variance analysis, and finance-ready summaries.",
    traits: ["finance", "analysis", "budget", "risk-aware"],
    instructions: [
      "Role",
      "You are a finance analysis agent for this workspace. You help with budgets, cost reviews, financial reports, variance explanations, and operating-metric interpretation.",
      "",
      "Responsibilities",
      "- Separate facts, assumptions, estimates, and recommendations.",
      "- Keep currency, period, data source, and calculation basis explicit.",
      "- Explain material changes, risks, sensitivities, and missing inputs.",
      "- Prefer tables, formulas, reconciliation notes, and decision-ready summaries.",
      "- Turn repeated finance work into reusable checklists or structured documents when appropriate.",
      "",
      "Working Style",
      "- Ask for missing source data before making numeric claims.",
      "- If you must estimate, state every assumption and mark the result as an estimate.",
      "- Keep analysis concise enough for an operator to act on, but preserve the audit trail.",
      "",
      "Escalation Rules",
      "- Do not present investment, tax, legal, or accounting conclusions as professional advice.",
      "- Ask for human confirmation before recommending irreversible financial actions.",
      "- Flag stale, incomplete, or internally inconsistent data instead of smoothing it over.",
      "",
      "Boundaries",
      "- Do not invent financial data.",
      "- Do not imply certainty where the input only supports directional analysis."
    ].join("\n"),
    skillRecommendations: [
      {
        key: "financial-analysis-agent",
        label: "Financial Analysis Agent",
        requirement: "recommended",
        sourceType: "skills.sh",
        sourceUrl: "https://skills.sh/qodex-ai/ai-agent-skills/financial-analysis-agent",
        description: "Skill Hub recommendation for finance analysis workflows, ratio review, forecasts, and reporting discipline.",
        aliases: [
          "financial-analysis-agent",
          "financial analysis agent",
          "financial analysis",
          "finance analyst",
          "financial analyst"
        ],
        searchTerms: ["finance", "financial", "budget", "variance", "forecast", "ratio"]
      }
    ]
  },
  {
    id: "product-manager",
    version: 1,
    category: "product",
    displayName: "\u4EA7\u54C1\u7ECF\u7406 Agent",
    shortDescription: "PRD\u3001\u8DEF\u7EBF\u56FE\u3001\u9700\u6C42\u62C6\u89E3\u548C\u9A8C\u6536\u6807\u51C6\u3002\u9002\u5408\u628A\u8BA8\u8BBA\u6C89\u6DC0\u6210\u53EF\u6267\u884C\u8BA1\u5212\u3002",
    defaultAgentName: "product-manager",
    defaultRemarkName: "\u4EA7\u54C1\u7ECF\u7406 Agent",
    defaultTitle: "Product Manager",
    summary: "Turns ambiguous product discussions into structured PRDs, scope decisions, acceptance criteria, and task breakdowns.",
    fit: "Best for product discovery, requirements shaping, roadmap tradeoffs, and delivery handoff.",
    traits: ["product", "requirements", "planning", "collaboration"],
    instructions: [
      "Role",
      "You are a product manager agent for this workspace. You help shape ambiguous requests into clear product decisions, PRDs, acceptance criteria, and delivery tasks.",
      "",
      "Responsibilities",
      "- Convert rough ideas into problem, user, goal, scope, non-goals, risks, and acceptance criteria.",
      "- Maintain a clear distinction between confirmed requirements, assumptions, open questions, and proposals.",
      "- Break product work into milestones and tasks without inventing team commitments or dates.",
      "- Capture decisions and tradeoffs in documents or tasks when the conversation becomes durable work.",
      "",
      "Working Style",
      "- Ask clarifying questions when user, business goal, success metric, or constraint is missing.",
      "- Prefer structured outputs: PRD sections, user stories, launch checklists, task tables, and review notes.",
      "- Keep stakeholders, dependencies, and rollout risks visible.",
      "",
      "Escalation Rules",
      "- Request human approval before changing scope, priority, launch messaging, or customer-facing commitments.",
      "- Flag conflicts between business goals, user needs, engineering constraints, and timeline pressure.",
      "",
      "Boundaries",
      "- Do not pretend a requirement is validated when it is only a hypothesis.",
      "- Do not promise delivery dates or resource allocations on behalf of the team."
    ].join("\n"),
    skillRecommendations: [
      {
        key: "product-manager",
        label: "Product Manager",
        requirement: "recommended",
        sourceType: "skills.sh",
        sourceUrl: "https://skills.sh/aj-geddes/claude-code-bmad-skills/product-manager",
        description: "Skill Hub recommendation for PRD work, product strategy, backlog shaping, and stakeholder-ready planning.",
        aliases: [
          "product-manager",
          "product manager",
          "pm",
          "prd",
          "requirements"
        ],
        searchTerms: ["product", "prd", "requirements", "roadmap", "backlog", "acceptance criteria"]
      }
    ]
  },
  {
    id: "product-designer",
    version: 1,
    category: "design",
    displayName: "\u4EA7\u54C1\u8BBE\u8BA1 Agent",
    shortDescription: "UX\u3001\u4FE1\u606F\u67B6\u6784\u3001\u4EA4\u4E92\u72B6\u6001\u548C\u754C\u9762\u8BC4\u5BA1\u3002\u9002\u5408\u628A\u4F53\u9A8C\u95EE\u9898\u53D8\u6210\u8BBE\u8BA1\u5EFA\u8BAE\u3002",
    defaultAgentName: "product-designer",
    defaultRemarkName: "\u4EA7\u54C1\u8BBE\u8BA1 Agent",
    defaultTitle: "Product Designer",
    summary: "Reviews product flows, UX states, information architecture, accessibility, and interface copy with design-system awareness.",
    fit: "Best for UX audits, interface reviews, design handoff notes, and product-flow improvements.",
    traits: ["design", "ux", "interface", "accessibility"],
    instructions: [
      "Role",
      "You are a product design agent for this workspace. You help improve user flows, information architecture, interaction states, accessibility, interface copy, and design-system consistency.",
      "",
      "Responsibilities",
      "- Start from user goals, task flow, hierarchy, and edge cases before discussing visual polish.",
      "- Review screens for clarity, density, affordance, state coverage, accessibility, and consistency.",
      "- Produce actionable design notes, not vague taste judgments.",
      "- Suggest copy, layout, component behavior, empty states, loading states, and error states when useful.",
      "",
      "Working Style",
      "- Ask for audience, platform, brand constraints, and design-system context when missing.",
      "- Use concise review sections: issue, impact, recommendation, and priority.",
      "- Prefer practical alternatives that a product team can implement and test.",
      "",
      "Escalation Rules",
      "- Ask for human confirmation before changing brand-sensitive language, pricing presentation, legal copy, or accessibility-critical behavior.",
      "- Flag design-system gaps instead of silently inventing inconsistent patterns.",
      "",
      "Boundaries",
      "- Do not claim a design is validated without research or usage evidence.",
      "- Do not replace formal accessibility, legal, or brand review where those reviews are required."
    ].join("\n"),
    skillRecommendations: [
      {
        key: "product-designer",
        label: "Product Designer",
        requirement: "recommended",
        sourceType: "skills.sh",
        sourceUrl: "https://skills.sh/borghei/claude-skills/product-designer",
        description: "Skill Hub recommendation for product design critique, UX review, design strategy, and interface improvement.",
        aliases: [
          "product-designer",
          "product designer",
          "ux designer",
          "ux design",
          "design review"
        ],
        searchTerms: ["design", "ux", "ui", "interface", "prototype", "accessibility"]
      }
    ]
  }
];

// ../db/src/workspace-invitations.ts
var DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;

// ../db/src/channel-access.ts
var CHANNEL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;

// src/args.ts
function parseArgs(args) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = nextValue;
    index += 1;
  }
  return { positionals, flags };
}
function getStringFlag(flags, key) {
  const value = flags[key];
  return typeof value === "string" ? value : void 0;
}

// src/bundle.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join4, relative as relative2, resolve as resolve3 } from "node:path";

// src/runtime-output.ts
import { join as join2 } from "node:path";
var RUNTIME_OUTPUT_DIR = "runtime-output";
var RUNTIME_OUTPUT_ARTIFACTS_DIR = "artifacts";
var RUNTIME_OUTPUT_MANIFEST_FILE = "agent-output.json";
var RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE = "channel-documents.json";
var RUNTIME_OUTPUT_SKILL_IMPORTS_FILE = "skill-imports.json";
var RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_FILE = "knowledge-proposals.json";
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE = "external-sheets.json";
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE = "external-sheets-results.json";
var RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE = "external-google-docs.json";
var RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE = "external-documents.json";
var RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE = "permission-requests.json";
var RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_MANIFEST_FILE}`;
var RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE}`;
var RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_SKILL_IMPORTS_FILE}`;
var RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_FILE}`;
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE}`;
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE}`;
var RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE}`;
var RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE}`;
var RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE}`;
var RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR = `${RUNTIME_OUTPUT_DIR}/${RUNTIME_OUTPUT_ARTIFACTS_DIR}`;
function getRuntimeOutputDir(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR);
}
function getRuntimeOutputManifestPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_MANIFEST_FILE);
}
function getRuntimeOutputChannelDocumentsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE);
}
function getRuntimeOutputSkillImportsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_SKILL_IMPORTS_FILE);
}
function getRuntimeOutputKnowledgeProposalsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_FILE);
}
function getRuntimeOutputExternalSheetsResultsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE);
}
function getRuntimeOutputExternalGoogleDocsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE);
}
function getRuntimeOutputExternalDocumentsPath(workDir) {
  return join2(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE);
}

// src/runtime-output-manifests.ts
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join as join3, parse, relative, resolve as resolve2 } from "node:path";
var MAX_OUTPUT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
var MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;
var MAX_RUNTIME_OUTPUT_BUNDLE_FILES = 64;
var MAX_RUNTIME_OUTPUT_BUNDLE_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
var MAX_RUNTIME_OUTPUT_BUNDLE_TOTAL_BYTES = 25 * 1024 * 1024;
var MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES = 256 * 1024;
var RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATHS = [
  RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH,
  RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH,
  RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH,
  RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH,
  RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH,
  RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH,
  RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH,
  RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH,
  RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH
];
function collectRuntimeOutputBundleFiles(workDir) {
  const files = /* @__PURE__ */ new Map();
  const runtimeOutputDir = resolve2(workDir, "runtime-output");
  if (!existsSync(runtimeOutputDir)) {
    return [];
  }
  for (const manifestPath of RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATHS) {
    const absoluteManifestPath = resolve2(workDir, manifestPath);
    if (existsSync(absoluteManifestPath)) {
      files.set(manifestPath, absoluteManifestPath);
    }
  }
  addAgentOutputBundleReferences(workDir, files);
  addChannelDocumentBundleReferences(workDir, files);
  addKnowledgeProposalBundleReferences(workDir, files);
  addSkillImportBundleReferences(workDir, files);
  addExternalSheetResultBundleReferences(workDir, files);
  addExternalGoogleDocsBundleReferences(workDir, files);
  addExternalDocumentBundleReferences(workDir, files);
  const bundleFiles = [];
  let totalBytes = 0;
  const sorted = [...files.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
  if (sorted.length > MAX_RUNTIME_OUTPUT_BUNDLE_FILES) {
    throw new Error(`Runtime output bundle has too many files; max is ${MAX_RUNTIME_OUTPUT_BUNDLE_FILES}.`);
  }
  for (const [relativePath, absolutePath] of sorted) {
    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
      continue;
    }
    if (stats.size > MAX_RUNTIME_OUTPUT_BUNDLE_SINGLE_FILE_BYTES) {
      throw new Error(`Runtime output bundle file exceeds 10 MB: ${relativePath}`);
    }
    totalBytes += stats.size;
    if (totalBytes > MAX_RUNTIME_OUTPUT_BUNDLE_TOTAL_BYTES) {
      throw new Error("Runtime output bundle total size exceeds 25 MB.");
    }
    bundleFiles.push({
      path: relativePath,
      contentBase64: readFileSync(absolutePath).toString("base64")
    });
  }
  return bundleFiles;
}
function addAgentOutputBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.attachments)) {
    return;
  }
  for (const attachment of parsed.attachments) {
    if (!isRecord(attachment)) {
      continue;
    }
    addBundlePathReference(workDir, attachment.path, files, { allowDirectory: false });
  }
}
function addChannelDocumentBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputChannelDocumentsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.documents)) {
    return;
  }
  for (const document of parsed.documents) {
    if (!isRecord(document)) {
      continue;
    }
    addBundlePathReference(workDir, document.contentPath, files, { allowDirectory: false });
    const operations = Array.isArray(document.operations) ? document.operations : [];
    for (const operation of operations) {
      if (isRecord(operation)) {
        addBundlePathReference(workDir, operation.contentPath, files, { allowDirectory: false });
      }
    }
  }
}
function addKnowledgeProposalBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputKnowledgeProposalsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.proposals)) {
    return;
  }
  for (const proposal of parsed.proposals) {
    if (!isRecord(proposal)) {
      continue;
    }
    addBundlePathReference(workDir, proposal.contentPath, files, { allowDirectory: false, requireArtifacts: true });
  }
}
function addSkillImportBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputSkillImportsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.imports)) {
    return;
  }
  for (const entry of parsed.imports) {
    if (!isRecord(entry)) {
      continue;
    }
    addBundlePathReference(workDir, entry.path, files, { allowDirectory: true, requireArtifacts: true });
    addBundlePathReference(workDir, entry.archivePath, files, { allowDirectory: false, requireArtifacts: true });
  }
}
function addExternalSheetResultBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputExternalSheetsResultsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
    return;
  }
  for (const result of parsed.results) {
    if (!isRecord(result)) {
      continue;
    }
    addBundlePathReference(workDir, result.resultPath, files, { allowDirectory: false, requireArtifacts: true });
  }
}
function addExternalGoogleDocsBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputExternalGoogleDocsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  const operations = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations : [];
  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }
    addBundlePathReference(workDir, operation.textPath, files, { allowDirectory: false, requireArtifacts: true });
    addBundlePathReference(workDir, operation.requestsPath, files, { allowDirectory: false, requireArtifacts: true });
  }
}
function addExternalDocumentBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputExternalDocumentsPath(workDir);
  const parsed = existsSync(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
  if (!isRecord(parsed) || !Array.isArray(parsed.operations)) {
    return;
  }
  for (const operation of parsed.operations) {
    if (!isRecord(operation) || operation.operationType !== "create_google_sheet") {
      continue;
    }
    addBundlePathReference(workDir, operation.resultPath, files, { allowDirectory: false, requireArtifacts: true });
  }
}
function addBundlePathReference(workDir, value, files, options) {
  const normalized = normalizeManifestRelativePath(value);
  if (!normalized) {
    return;
  }
  if (options.requireArtifacts && !isRuntimeOutputArtifactsReference(normalized.relativePath)) {
    return;
  }
  if (!isRuntimeOutputReference(normalized.relativePath)) {
    return;
  }
  const absolutePath = resolve2(workDir, normalized.relativePath);
  if (!existsSync(absolutePath)) {
    return;
  }
  const linkStats = lstatSync(absolutePath);
  if (linkStats.isSymbolicLink()) {
    throw new Error(`Runtime output bundle path cannot be a symlink: ${normalized.relativePath}`);
  }
  const stats = statSync(absolutePath);
  if (stats.isDirectory()) {
    if (!options.allowDirectory) {
      return;
    }
    addBundleDirectory(workDir, normalized.relativePath, absolutePath, files);
    return;
  }
  if (stats.isFile()) {
    files.set(normalized.relativePath, absolutePath);
  }
}
function addBundleDirectory(workDir, relativeDir, absoluteDir, files) {
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    const absolutePath = join3(absoluteDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Runtime output bundle path cannot be a symlink: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      addBundleDirectory(workDir, normalizePathSeparators(relativePath), absolutePath, files);
      continue;
    }
    if (entry.isFile()) {
      if (!isRuntimeOutputArtifactsReference(relativePath)) {
        continue;
      }
      const resolved = resolveManifestPath(workDir, relativePath);
      if (resolved && existsSync(resolved.absolutePath)) {
        files.set(resolved.relativePath, resolved.absolutePath);
      }
    }
  }
}
function normalizeManifestRelativePath(value) {
  if (typeof value !== "string") {
    return null;
  }
  const relativePath = value.replace(/\\/g, "/").trim();
  if (!relativePath || isAbsolute(relativePath)) {
    return null;
  }
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return { relativePath: segments.join("/") };
}
function resolveManifestPath(workDir, relativePath) {
  const normalized = normalizeManifestRelativePath(relativePath);
  if (!normalized) {
    return null;
  }
  const absolutePath = resolve2(workDir, normalized.relativePath);
  if (!isPathInside(resolve2(workDir), absolutePath)) {
    return null;
  }
  if (existsSync(absolutePath)) {
    const realWorkDir = realpathSync(workDir);
    const realPath = realpathSync(absolutePath);
    if (!isPathInside(realWorkDir, realPath)) {
      return null;
    }
  }
  return {
    relativePath: normalized.relativePath,
    absolutePath
  };
}
function isRuntimeOutputReference(value) {
  return value === "runtime-output" || value.startsWith("runtime-output/");
}
function isRuntimeOutputArtifactsReference(value) {
  return value === RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR || value.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`);
}
function parseJsonManifestQuiet(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isPathInside(rootDir, candidatePath) {
  const relativePath = relative(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
function normalizePathSeparators(value) {
  return value.replace(/\\/g, "/");
}

// src/bundle.ts
function clearTaskOutputArtifacts(workDir) {
  rmSync(join4(workDir, "last-message.txt"), { force: true });
  rmSync(getRuntimeOutputDir(workDir), { recursive: true, force: true });
}
function materializeInputBundle(workDir, bundle) {
  for (const file of bundle.files) {
    const targetPath = resolveBundleTargetPath(workDir, file.path);
    mkdirSync2(dirname2(targetPath), { recursive: true });
    writeFileSync2(targetPath, Buffer.from(file.contentBase64, "base64"));
  }
}
function collectRuntimeOutputBundle(workDir) {
  const runtimeOutputDir = getRuntimeOutputDir(workDir);
  if (!existsSync2(runtimeOutputDir)) {
    return void 0;
  }
  const files = collectRuntimeOutputBundleFiles(workDir);
  if (files.length === 0) {
    return void 0;
  }
  return {
    version: 1,
    format: "json-inline-v1",
    files
  };
}
function resolveBundleTargetPath(workDir, bundlePath) {
  const candidatePath = bundlePath.trim();
  if (!candidatePath) {
    throw new Error("Bundle file path is required.");
  }
  if (isAbsolute2(candidatePath)) {
    throw new Error(`Bundle file path must be relative: ${candidatePath}`);
  }
  const resolvedPath = resolve3(workDir, candidatePath);
  const relativePath = relative2(workDir, resolvedPath);
  if (relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute2(relativePath)) {
    return resolvedPath;
  }
  throw new Error(`Bundle file path escapes workDir: ${candidatePath}`);
}

// src/daemon-client.ts
var HttpDaemonClient = class {
  serverUrl;
  daemonToken;
  retryDelayMs;
  maxRetryAttempts;
  constructor(serverUrl, daemonToken, options) {
    this.serverUrl = serverUrl;
    this.daemonToken = daemonToken;
    this.retryDelayMs = options?.retryDelayMs ?? 250;
    this.maxRetryAttempts = Math.max(1, options?.maxRetryAttempts ?? 3);
  }
  async register(request) {
    return this.postJson("/api/daemon/register", request);
  }
  async sendHeartbeat(daemonKey) {
    return this.postJson("/api/daemon/heartbeat", { daemonKey }, { retryable: true });
  }
  async sendHeartbeatWithMetadata(daemonKey, metadata, runtimes) {
    return this.postJson("/api/daemon/heartbeat", { daemonKey, metadata, runtimes }, { retryable: true });
  }
  async claimTask(runtimeId) {
    return this.postJson(`/api/daemon/runtimes/${encodeURIComponent(runtimeId)}/tasks/claim`, {}, { retryable: true });
  }
  async claimRuntimeAppOperation(runtimeId) {
    return this.postJson(`/api/daemon/runtimes/${encodeURIComponent(runtimeId)}/apps/operations/claim`, {}, { retryable: true });
  }
  async startRuntimeAppOperation(operationId, body = {}) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/start`, body);
  }
  async completeRuntimeAppOperation(operationId, body) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/complete`, body);
  }
  async failRuntimeAppOperation(operationId, body) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/fail`, body);
  }
  async startTask(taskId) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/start`, {});
  }
  async getInputBundle(taskId) {
    return this.getJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/input-bundle`, { retryable: true });
  }
  async reportMessages(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/messages`, body);
  }
  async createRuntimeApproval(taskId, body) {
    return this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/runtime-approvals`, body);
  }
  async getRuntimeApproval(taskId, approvalId) {
    return this.getJson(
      `/api/daemon/tasks/${encodeURIComponent(taskId)}/runtime-approvals/${encodeURIComponent(approvalId)}`,
      { retryable: true }
    );
  }
  async uploadOutputBundle(taskId, bundle) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/output-bundle`, bundle);
  }
  async completeTask(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/complete`, body);
  }
  async failTask(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/fail`, body);
  }
  async deregister(daemonKey, lastError) {
    await this.postJson("/api/daemon/deregister", {
      daemonKey,
      lastError
    });
  }
  async getJson(path, options) {
    return this.requestJson(path, {
      method: "GET",
      retryable: options?.retryable
    });
  }
  async postJson(path, body, options) {
    return this.requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
      retryable: options?.retryable
    });
  }
  buildHeaders() {
    return {
      authorization: `Bearer ${this.daemonToken}`,
      "content-type": "application/json"
    };
  }
  resolveUrl(path) {
    return new URL(path, this.serverUrl).toString();
  }
  async requestJson(path, options) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt += 1) {
      try {
        const response = await fetch(this.resolveUrl(path), {
          method: options.method,
          headers: this.buildHeaders(),
          body: options.body
        });
        if (options.retryable && response.status >= 500 && attempt < this.maxRetryAttempts) {
          await sleep(this.retryDelayMs);
          continue;
        }
        return this.readJson(response);
      } catch (error) {
        lastError = error;
        if (!options.retryable || attempt >= this.maxRetryAttempts) {
          throw error;
        }
        await sleep(this.retryDelayMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Daemon client request failed.");
  }
  async readJson(response) {
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload.error) {
          message = payload.error;
        }
      } catch {
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return void 0;
    }
    return response.json();
  }
};
function sleep(ms) {
  return new Promise((resolve11) => setTimeout(resolve11, ms));
}

// src/skill-imports.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readdirSync as readdirSync2, readFileSync as readFileSync2, realpathSync as realpathSync2, rmSync as rmSync2, statSync as statSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { basename as basename2, dirname as dirname3, extname as extname2, isAbsolute as isAbsolute3, join as join5, relative as relative3, resolve as resolve4 } from "node:path";

// ../services/src/automations/auto-continuation.ts
var HOUR_MS = 60 * 60 * 1e3;

// ../services/src/realtime/events.ts
import { EventEmitter } from "node:events";
var emitter = new EventEmitter();
emitter.setMaxListeners(0);

// src/skill-imports.ts
var PACKAGED_SKILL_IMPORTS_RELATIVE_DIR = `${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/skills`;
var IMPORTABLE_TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".csv",
  ".js",
  ".ts",
  ".py",
  ".sh"
]);
function prepareSkillImportOperationArtifacts(workDir) {
  const warnings = [];
  const operationsPath = getRuntimeOutputSkillImportsPath(workDir);
  if (!existsSync3(operationsPath)) {
    return { warnings, packaged: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync2(operationsPath, "utf8"));
  } catch (error) {
    warnings.push(`\u68C0\u6D4B\u5230 ${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}\uFF0C\u4F46\u672C\u5730 skill \u6253\u5305\u524D JSON \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    return { warnings, packaged: 0 };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { warnings, packaged: 0 };
  }
  const manifest = parsed;
  if (!Array.isArray(manifest.imports)) {
    return { warnings, packaged: 0 };
  }
  let packaged = 0;
  let changed = false;
  const nextImports = manifest.imports.map((operation, index) => {
    const prepared = prepareSingleSkillImportArtifact(operation, index, workDir, warnings);
    if (!prepared) {
      return operation;
    }
    if (prepared.packaged) {
      packaged += 1;
    }
    changed = true;
    return prepared.entry;
  });
  if (changed) {
    writeFileSync3(
      operationsPath,
      `${JSON.stringify({ ...parsed, imports: nextImports }, null, 2)}
`,
      "utf8"
    );
  }
  return { warnings, packaged };
}
function prepareSingleSkillImportArtifact(entry, index, workDir, warnings) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const candidate = entry;
  const sourceFields = [
    typeof candidate.url === "string" && candidate.url.trim().length > 0 ? "url" : "",
    typeof candidate.path === "string" && candidate.path.trim().length > 0 ? "path" : "",
    typeof candidate.archivePath === "string" && candidate.archivePath.trim().length > 0 ? "archivePath" : ""
  ].filter(Boolean);
  if (sourceFields.length !== 1) {
    return null;
  }
  const sourceField = sourceFields[0];
  const rawSource = String(candidate[sourceField]).trim();
  if (sourceField !== "url" && isRelativeRuntimeArtifactReference(rawSource)) {
    return null;
  }
  const existingArtifactPath = resolveExistingRuntimeArtifactReference(rawSource, sourceField, workDir);
  if (existingArtifactPath) {
    const rewritten2 = { ...entry };
    delete rewritten2.url;
    delete rewritten2.path;
    delete rewritten2.archivePath;
    rewritten2[sourceField === "archivePath" ? "archivePath" : "path"] = existingArtifactPath;
    return { entry: rewritten2, packaged: false };
  }
  const localSource = resolvePackableLocalSkillSource(rawSource, sourceField, workDir);
  if (!localSource) {
    return null;
  }
  let packaged;
  try {
    packaged = packageLocalSkillImportSource(localSource, workDir, warnings);
  } catch (error) {
    warnings.push(`\u672C\u5730 Skill \u6253\u5305\u5931\u8D25\uFF08imports[${index}].${sourceField}: ${rawSource}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const rewritten = { ...entry };
  delete rewritten.url;
  delete rewritten.path;
  delete rewritten.archivePath;
  if (packaged.archive) {
    rewritten.archivePath = packaged.relativePath;
  } else {
    rewritten.path = packaged.relativePath;
  }
  return { entry: rewritten, packaged: true };
}
function isRelativeRuntimeArtifactReference(value) {
  const normalized = value.replace(/\\/g, "/").trim();
  return !isAbsolute3(normalized) && (normalized === RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR || normalized.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`));
}
function resolveExistingRuntimeArtifactReference(value, field, workDir) {
  if (field === "url") {
    return null;
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized) {
    return null;
  }
  if (!isAbsolute3(normalized)) {
    if (normalized !== RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR && !normalized.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`)) {
      return null;
    }
    return normalized;
  }
  const artifactsRoot = resolve4(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const absolutePath = resolve4(normalized);
  if (!isPathInside2(artifactsRoot, absolutePath)) {
    return null;
  }
  return join5(RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR, relative3(artifactsRoot, absolutePath)).replace(/\\/g, "/");
}
function resolvePackableLocalSkillSource(value, field, workDir) {
  if (!value) {
    return null;
  }
  if (field === "url") {
    let parsed = null;
    try {
      parsed = new URL(value);
    } catch {
      parsed = null;
    }
    if (parsed) {
      if (parsed.protocol === "https:") {
        return null;
      }
      if (parsed.protocol === "file:") {
        return decodeURIComponent(parsed.pathname);
      }
      return null;
    }
  }
  if (isAbsolute3(value)) {
    return value;
  }
  return resolve4(workDir, value);
}
function packageLocalSkillImportSource(sourcePath, workDir, warnings) {
  const absolutePath = resolve4(sourcePath);
  if (!existsSync3(absolutePath)) {
    throw new Error(`\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${absolutePath}`);
  }
  const stats = statSync2(absolutePath);
  const archive = stats.isFile() && extname2(absolutePath).toLowerCase() === ".zip";
  const directSkillFile = stats.isFile() && samePathName(basename2(absolutePath), "SKILL.md");
  if (!stats.isDirectory() && !archive && !directSkillFile) {
    throw new Error("\u672C\u5730 skill \u6765\u6E90\u5FC5\u987B\u662F skill \u76EE\u5F55\u3001.zip \u6587\u4EF6\u6216 SKILL.md\u3002");
  }
  const artifactName = resolveUniqueSkillArtifactName(workDir, deriveSkillArtifactName(absolutePath, directSkillFile));
  if (archive) {
    const relativePath2 = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}.zip`;
    const targetPath = resolve4(workDir, relativePath2);
    mkdirSync3(dirname3(targetPath), { recursive: true });
    writeFileSync3(targetPath, readFileSync2(absolutePath));
    return { relativePath: relativePath2, archive: true };
  }
  const relativePath = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}`;
  const targetDir = resolve4(workDir, relativePath);
  mkdirSync3(targetDir, { recursive: true });
  if (directSkillFile) {
    writeFileSync3(join5(targetDir, "SKILL.md"), readFileSync2(absolutePath));
    return { relativePath, archive: false };
  }
  const copiedFiles = copySkillDirectoryFiles(absolutePath, targetDir, warnings);
  if (!copiedFiles.some((path) => samePathName(path, "SKILL.md"))) {
    rmSync2(targetDir, { recursive: true, force: true });
    throw new Error(`\u672C\u5730 skill \u76EE\u5F55\u5FC5\u987B\u5305\u542B SKILL.md\uFF1A${absolutePath}`);
  }
  return { relativePath, archive: false };
}
function copySkillDirectoryFiles(sourceDir, targetDir, warnings, relativePrefix = "") {
  const copiedFiles = [];
  for (const entry of readdirSync2(sourceDir, { withFileTypes: true })) {
    const relativePath = normalizeSkillArtifactFilePath(relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name);
    if (!relativePath) {
      continue;
    }
    const sourcePath = join5(sourceDir, entry.name);
    if (entry.isDirectory()) {
      copiedFiles.push(...copySkillDirectoryFiles(sourcePath, targetDir, warnings, relativePath));
      continue;
    }
    if (!entry.isFile()) {
      warnings.push(`\u6253\u5305\u672C\u5730 skill \u65F6\u8DF3\u8FC7\u4E0D\u652F\u6301\u7684\u6761\u76EE\uFF1A${relativePath}`);
      continue;
    }
    if (!isImportableSkillTextFile(relativePath)) {
      warnings.push(`\u6253\u5305\u672C\u5730 skill \u65F6\u8DF3\u8FC7\u975E\u6587\u672C\u6587\u4EF6\uFF1A${relativePath}`);
      continue;
    }
    const targetPath = join5(targetDir, relativePath);
    mkdirSync3(dirname3(targetPath), { recursive: true });
    writeFileSync3(targetPath, readFileSync2(sourcePath));
    copiedFiles.push(relativePath);
  }
  return copiedFiles;
}
function deriveSkillArtifactName(sourcePath, directSkillFile) {
  const rawName = directSkillFile ? basename2(dirname3(sourcePath)) : basename2(sourcePath).replace(/\.zip$/i, "");
  return sanitizeSkillArtifactSegment(rawName);
}
function resolveUniqueSkillArtifactName(workDir, baseName) {
  let candidate = baseName;
  let index = 2;
  while (existsSync3(resolve4(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}`)) || existsSync3(resolve4(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}.zip`))) {
    candidate = `${baseName}-${index}`;
    index += 1;
  }
  return candidate;
}
function sanitizeSkillArtifactSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}
function normalizeSkillArtifactFilePath(value) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return "";
  }
  return segments.join("/");
}
function isImportableSkillTextFile(path) {
  if (samePathName(path, "SKILL.md")) {
    return true;
  }
  return IMPORTABLE_TEXT_EXTENSIONS.has(extname2(path).toLowerCase());
}
function samePathName(left, right) {
  return left.localeCompare(right, "en-US", { sensitivity: "base" }) === 0;
}
function isPathInside2(rootDir, candidatePath) {
  const relativePath = relative3(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute3(relativePath);
}

// src/provider-runtime.ts
import { accessSync, constants as constants2, existsSync as existsSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync4 } from "node:fs";
import { spawnSync as spawnSync5 } from "node:child_process";
import { delimiter as delimiter3, dirname as dirname8, isAbsolute as isAbsolute5, join as join10 } from "node:path";
import { arch, platform as platform3, version as nodeVersion } from "node:process";

// ../sandbox/src/types.ts
var SANDBOX_TASK_TIMEOUT_ENV = "AGENT_SPACE_TASK_TIMEOUT_MS";
var DEFAULT_SANDBOX_TASK_TIMEOUT_MS = 12 * 60 * 60 * 1e3;
function resolveSandboxTaskTimeoutMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_SANDBOX_TASK_TIMEOUT_MS;
}

// ../sandbox/src/cube/cube-config.ts
import { resolve as resolve5 } from "node:path";
var SANDBOX_PROVIDER_ENV = "AGENT_SPACE_SANDBOX_PROVIDER";
var LEGACY_SANDBOX_PROVIDER_ENV = "SANDBOX_PROVIDER";
var CUBE_API_URL_ENV = "AGENT_SPACE_CUBE_API_URL";
var LEGACY_CUBE_API_URL_ENV = "E2B_API_URL";
var CUBE_API_KEY_ENV = "AGENT_SPACE_CUBE_API_KEY";
var LEGACY_CUBE_API_KEY_ENV = "E2B_API_KEY";
var CUBE_TEMPLATE_ID_ENV = "AGENT_SPACE_CUBE_TEMPLATE_ID";
var LEGACY_CUBE_TEMPLATE_ID_ENV = "CUBE_TEMPLATE_ID";
var CUBE_EXPERIMENTAL_ENABLE_ENV = "AGENT_SPACE_CUBE_ENABLE_EXPERIMENTAL";
var CUBE_TIMEOUT_SECONDS_ENV = "AGENT_SPACE_CUBE_TIMEOUT_SECONDS";
var CUBE_ALLOW_INTERNET_ENV = "AGENT_SPACE_CUBE_ALLOW_INTERNET";
var CUBE_ALLOW_OUT_ENV = "AGENT_SPACE_CUBE_ALLOW_OUT";
var CUBE_DENY_OUT_ENV = "AGENT_SPACE_CUBE_DENY_OUT";
var CUBE_MOUNT_WORKDIR_ENV = "AGENT_SPACE_CUBE_MOUNT_WORKDIR";
var CUBE_MOUNT_PATH_ENV = "AGENT_SPACE_CUBE_MOUNT_PATH";
var CUBE_HOST_MOUNT_METADATA_KEY = "host-mount";
var DEFAULT_CUBE_MOUNT_PATH = "/workspace";
var DEFAULT_CUBE_API_REQUEST_TIMEOUT_MS = 3e4;
function resolveSandboxProvider(options) {
  const env = options.env ?? process.env;
  const rawValue = options.provider ?? env[SANDBOX_PROVIDER_ENV] ?? env[LEGACY_SANDBOX_PROVIDER_ENV] ?? "local";
  const provider = rawValue.trim().toLowerCase();
  if (provider === "cube" && parseOptionalBoolean(env[CUBE_EXPERIMENTAL_ENABLE_ENV]) !== true) {
    throw new Error(
      `CubeSandbox is still experimental. Set ${CUBE_EXPERIMENTAL_ENABLE_ENV}=true to enable the lifecycle scaffold explicitly.`
    );
  }
  if (provider === "local" || provider === "cube") {
    return provider;
  }
  throw new Error(
    `Unsupported sandbox provider "${rawValue}". Use "local" or "cube" via ${SANDBOX_PROVIDER_ENV} or ${LEGACY_SANDBOX_PROVIDER_ENV}.`
  );
}
function resolveCubeSandboxConfig(options) {
  const env = options.env ?? process.env;
  const apiUrl = readRequiredEnv(env, [CUBE_API_URL_ENV, LEGACY_CUBE_API_URL_ENV]);
  const apiKey = readRequiredEnv(env, [CUBE_API_KEY_ENV, LEGACY_CUBE_API_KEY_ENV]);
  const templateId = readRequiredEnv(env, [CUBE_TEMPLATE_ID_ENV, LEGACY_CUBE_TEMPLATE_ID_ENV]);
  const explicitTimeoutSeconds = env[CUBE_TIMEOUT_SECONDS_ENV] ? readPositiveInteger(env[CUBE_TIMEOUT_SECONDS_ENV], CUBE_TIMEOUT_SECONDS_ENV) : void 0;
  const timeoutMs = explicitTimeoutSeconds ? explicitTimeoutSeconds * 1e3 : resolveSandboxTaskTimeoutMs(env[SANDBOX_TASK_TIMEOUT_ENV] ?? DEFAULT_SANDBOX_TASK_TIMEOUT_MS);
  const timeoutSeconds = explicitTimeoutSeconds ?? Math.max(1, Math.ceil(timeoutMs / 1e3));
  const allowInternetAccess = parseOptionalBoolean(env[CUBE_ALLOW_INTERNET_ENV]);
  const mountWorkDir = parseOptionalBoolean(env[CUBE_MOUNT_WORKDIR_ENV]) ?? false;
  const mountPath = normalizeMountPath(env[CUBE_MOUNT_PATH_ENV] ?? DEFAULT_CUBE_MOUNT_PATH);
  const workDir = resolve5(options.workDir);
  const metadata = {
    "agent-space.runtime-id": options.runtimeId,
    "agent-space.work-dir": workDir
  };
  if (mountWorkDir) {
    const hostMount = [{
      hostPath: workDir,
      mountPath,
      readOnly: false
    }];
    metadata[CUBE_HOST_MOUNT_METADATA_KEY] = JSON.stringify(hostMount);
    metadata["agent-space.mount-path"] = mountPath;
  }
  return {
    apiUrl: trimTrailingSlash(apiUrl),
    apiKey,
    templateId,
    timeoutSeconds,
    allowInternetAccess,
    network: buildNetworkConfig(env),
    requestTimeoutMs: DEFAULT_CUBE_API_REQUEST_TIMEOUT_MS,
    runtimeId: options.runtimeId,
    workDir,
    mountWorkDir,
    mountPath,
    metadata
  };
}
function readRequiredEnv(env, names) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`CubeSandbox requires ${names.join(" or ")} to be set.`);
}
function readPositiveInteger(raw, name) {
  const parsed = parsePositiveInteger(raw);
  if (parsed === void 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
function buildNetworkConfig(env) {
  const allowOut = parseList(env[CUBE_ALLOW_OUT_ENV]);
  const denyOut = parseList(env[CUBE_DENY_OUT_ENV]);
  if (!allowOut && !denyOut) {
    return void 0;
  }
  return {
    allowOut,
    denyOut
  };
}
function parseList(raw) {
  if (!raw) {
    return void 0;
  }
  const values = raw.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  return values.length > 0 ? values : void 0;
}
function parsePositiveInteger(raw) {
  if (!raw) {
    return void 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return void 0;
  }
  return Math.floor(parsed);
}
function parseOptionalBoolean(raw) {
  if (!raw) {
    return void 0;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return void 0;
}
function normalizeMountPath(raw) {
  const normalized = raw.trim().replace(/\\+/g, "/");
  if (!normalized || normalized === "/") {
    return "/";
  }
  const withRoot = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withRoot.replace(/\/+$/, "") || "/";
}
function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

// ../sandbox/src/local/local-sandbox.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "node:fs";
import { access, cp, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname as dirname4, isAbsolute as isAbsolute4, join as join6, relative as relative4, resolve as resolve6 } from "node:path";
import { platform } from "node:process";
var KILL_GRACE_PERIOD_MS = 5e3;
var LocalSandbox = class {
  id;
  status = "active";
  workDir;
  activeChildren = /* @__PURE__ */ new Set();
  constructor(workDir, runtimeId) {
    this.workDir = resolve6(workDir);
    this.id = runtimeId;
  }
  async readFile(path) {
    return readFile(this.resolveInsideSandbox(path), "utf8");
  }
  async writeFile(path, contents) {
    const absolutePath = this.resolveInsideSandbox(path);
    await mkdir(dirname4(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }
  async readDir(path) {
    const absolutePath = this.resolveInsideSandbox(path);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    return Promise.all(entries.map(async (entry) => {
      const entryPath = join6(absolutePath, entry.name);
      const stats = await lstat(entryPath);
      return {
        name: entry.name,
        path: relative4(this.workDir, entryPath) || ".",
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    }));
  }
  async exists(path) {
    try {
      await access(this.resolveInsideSandbox(path));
      return true;
    } catch {
      return false;
    }
  }
  async exec(command) {
    const startedAt = Date.now();
    const resolved = resolveSpawnCommand(command.command);
    const args = [...resolved.prependArgs, ...command.args ?? []];
    const child = spawn(resolved.command, args, {
      cwd: this.resolveCommandCwd(command.cwd),
      env: { ...process.env, ...command.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.activeChildren.add(child);
    child.stdin.on("error", () => {
    });
    const stdinController = {
      writeStdin: (data) => {
        if (!child.stdin.destroyed && child.stdin.writable) {
          child.stdin.write(data);
        }
      },
      closeStdin: () => {
        if (!child.stdin.destroyed && child.stdin.writable) {
          child.stdin.end();
        }
      }
    };
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer;
    let timeout;
    return await new Promise((resolvePromise, rejectPromise) => {
      child.stdout.on("data", (chunk) => {
        const value = String(chunk);
        stdout += value;
        command.onStdout?.(value);
      });
      child.stderr.on("data", (chunk) => {
        const value = String(chunk);
        stderr += value;
        command.onStderr?.(value);
      });
      command.onReady?.(stdinController);
      if (command.keepStdinOpen) {
        if (command.input) {
          stdinController.writeStdin(command.input);
        }
      } else {
        child.stdin.end(command.input ?? "");
      }
      if (command.timeoutMs && command.timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          killTimer = setTimeout(() => {
            child.kill("SIGKILL");
          }, KILL_GRACE_PERIOD_MS);
        }, command.timeoutMs);
      }
      child.on("error", (error) => {
        clearTimeout(timeout);
        clearTimeout(killTimer);
        this.activeChildren.delete(child);
        rejectPromise(error);
      });
      child.on("close", (exitCode, signal) => {
        clearTimeout(timeout);
        clearTimeout(killTimer);
        this.activeChildren.delete(child);
        resolvePromise({
          stdout,
          stderr,
          exitCode,
          signal: signal ?? void 0,
          durationMs: Date.now() - startedAt,
          timedOut
        });
      });
    });
  }
  async snapshot() {
    const snapshotDir = join6(dirname4(this.workDir), ".snapshots");
    const snapshotPath = join6(snapshotDir, `${this.id}-${Date.now().toString(36)}`);
    await mkdir(snapshotDir, { recursive: true });
    await cp(this.workDir, snapshotPath, { force: true, recursive: true });
    return snapshotPath;
  }
  async stop() {
    for (const child of this.activeChildren) {
      child.kill("SIGTERM");
    }
    this.activeChildren.clear();
  }
  async destroy() {
    await this.stop();
    await rm(this.workDir, { recursive: true, force: true });
  }
  resolveInsideSandbox(path) {
    const absolutePath = resolve6(this.workDir, path);
    const relativePath = relative4(this.workDir, absolutePath);
    if (relativePath.startsWith("..")) {
      throw new Error(`Path "${path}" escapes sandbox root.`);
    }
    return absolutePath;
  }
  resolveCommandCwd(cwd) {
    if (!cwd || cwd === ".") {
      return this.workDir;
    }
    return isAbsolute4(cwd) ? cwd : this.resolveInsideSandbox(cwd);
  }
};
function findExecutableOnPath(command) {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }
  const extensions = platform === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
  for (const baseDir of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join6(baseDir, command + extension);
      if (isExecutableCandidate(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
function isExecutableCandidate(candidate) {
  return existsSync4(candidate);
}
function needsShellSpawn(executablePath) {
  if (platform !== "win32") {
    return false;
  }
  const normalized = executablePath.toLowerCase();
  return normalized.endsWith(".cmd") || normalized.endsWith(".ps1");
}
function resolveSpawnCommand(command) {
  const executablePath = isAbsolute4(command) ? command : findExecutableOnPath(command) ?? command;
  if (!needsShellSpawn(executablePath)) {
    return { command: executablePath, prependArgs: [] };
  }
  try {
    const content = existsSync4(executablePath) ? readFileSync3(executablePath, "utf8") : "";
    const match = content.match(/"?%dp0%[\\\/]?(node_modules[\\\/][^"]+\.js)"?/);
    if (match) {
      const jsPath = join6(dirname4(executablePath), match[1].replace(/%\*/g, "").trim());
      if (existsSync4(jsPath)) {
        return { command: process.execPath, prependArgs: [jsPath] };
      }
    }
  } catch {
  }
  return { command: executablePath, prependArgs: [] };
}

// ../sandbox/src/cube/cube-client.ts
var CubeApiError = class extends Error {
  statusCode;
  responseBody;
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = "CubeApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var CubeApiRouteNotAvailableError = class extends CubeApiError {
  constructor(message, statusCode, responseBody) {
    super(message, statusCode, responseBody);
    this.name = "CubeApiRouteNotAvailableError";
  }
};
var CubeSandboxClient = class {
  apiUrl;
  apiKey;
  requestTimeoutMs;
  fetchImpl;
  constructor(options) {
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async createSandbox(request) {
    const response = await this.request("/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        templateID: request.templateId,
        timeout: request.timeoutSeconds,
        autoPause: false,
        ...request.allowInternetAccess === void 0 ? {} : { allow_internet_access: request.allowInternetAccess },
        ...request.network ? { network: serializeNetwork(request.network) } : {},
        ...request.metadata ? { metadata: request.metadata } : {}
      })
    }, [201]);
    return normalizeConnection(response);
  }
  async connectSandbox(sandboxId, timeoutSeconds) {
    const response = await this.request(`/sandboxes/${encodeURIComponent(sandboxId)}/connect`, {
      method: "POST",
      body: JSON.stringify({ timeout: timeoutSeconds })
    }, [200]);
    return normalizeConnection(response);
  }
  async getSandbox(sandboxId) {
    const response = await this.request(`/sandboxes/${encodeURIComponent(sandboxId)}`, {
      method: "GET"
    }, [200]);
    return {
      ...normalizeConnection(response),
      state: response.state ?? "running"
    };
  }
  async pauseSandbox(sandboxId) {
    await this.request(`/sandboxes/${encodeURIComponent(sandboxId)}/pause`, {
      method: "POST"
    }, [204]);
  }
  async deleteSandbox(sandboxId) {
    await this.request(`/sandboxes/${encodeURIComponent(sandboxId)}`, {
      method: "DELETE"
    }, [204]);
  }
  async createSnapshot(sandboxId, name) {
    const response = await this.request(`/sandboxes/${encodeURIComponent(sandboxId)}/snapshots`, {
      method: "POST",
      body: JSON.stringify(name ? { name } : {})
    }, [201]);
    return {
      snapshotId: response.snapshotID,
      names: response.names
    };
  }
  async request(path, init, allowedStatuses) {
    const response = await this.fetchImpl(new URL(path, `${this.apiUrl}/`), {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        ...init.headers ?? {}
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });
    if (allowedStatuses.includes(response.status)) {
      if (response.status === 204) {
        return void 0;
      }
      return parseJsonResponse(response);
    }
    const body = await parseResponseBody(response);
    const message = extractErrorMessage(response.status, body);
    if (response.status === 404 && path.endsWith("/snapshots") && isRouteLevelNotFound(body)) {
      throw new CubeApiRouteNotAvailableError(message, response.status, body);
    }
    throw new CubeApiError(message, response.status, body);
  }
};
function serializeNetwork(network) {
  return {
    ...network.allowOut ? { allow_out: network.allowOut } : {},
    ...network.denyOut ? { deny_out: network.denyOut } : {}
  };
}
function normalizeConnection(payload) {
  return {
    templateId: payload.templateID,
    sandboxId: payload.sandboxID,
    clientId: payload.clientID,
    envdVersion: payload.envdVersion,
    envdAccessToken: payload.envdAccessToken ?? void 0,
    trafficAccessToken: payload.trafficAccessToken ?? void 0,
    domain: payload.domain ?? void 0
  };
}
async function parseJsonResponse(response) {
  const body = await parseResponseBody(response);
  return body;
}
async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return void 0;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function extractErrorMessage(statusCode, body) {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  if (body && typeof body === "object") {
    const record = body;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }
  return `Cube API request failed with status ${statusCode}.`;
}
function isRouteLevelNotFound(body) {
  if (body === void 0) {
    return true;
  }
  if (typeof body === "string") {
    return body.trim() === "" || body.includes("Not Found");
  }
  if (body && typeof body === "object") {
    const record = body;
    return typeof record.message === "string" && record.message.includes("Not Found");
  }
  return false;
}

// ../sandbox/src/cube/cube-sandbox.ts
var CUBE_EXEC_NOT_READY_MESSAGE = [
  "CubeSandbox provisioning is wired up, but remote command execution is not yet connected to Cube's envd/E2B data plane.",
  "The current scaffold can create, pause, snapshot, and destroy Cube sandboxes while keeping file operations on the local daemon workDir.",
  "Keep using the local provider for real task execution until TODO 46 finishes the remote exec transport."
].join(" ");
var CubeSandbox = class _CubeSandbox {
  id;
  config;
  client;
  localFiles;
  connection;
  statusValue;
  constructor(config, client, connection) {
    this.config = config;
    this.client = client;
    this.connection = connection;
    this.id = connection.sandboxId;
    this.localFiles = new LocalSandbox(config.workDir, config.runtimeId);
    this.statusValue = "active";
  }
  static async connect(options) {
    const config = resolveCubeSandboxConfig(options);
    const client = new CubeSandboxClient({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs
    });
    const connection = await client.createSandbox({
      templateId: config.templateId,
      timeoutSeconds: config.timeoutSeconds,
      allowInternetAccess: config.allowInternetAccess,
      network: config.network,
      metadata: config.metadata
    });
    return new _CubeSandbox(config, client, connection);
  }
  get status() {
    return this.statusValue;
  }
  get remoteWorkDir() {
    return this.config.mountWorkDir ? this.config.mountPath : void 0;
  }
  get connectionInfo() {
    return { ...this.connection };
  }
  async readFile(path) {
    return this.localFiles.readFile(path);
  }
  async writeFile(path, contents) {
    await this.localFiles.writeFile(path, contents);
  }
  async readDir(path) {
    return this.localFiles.readDir(path);
  }
  async exists(path) {
    return this.localFiles.exists(path);
  }
  async exec(_command) {
    throw new Error(CUBE_EXEC_NOT_READY_MESSAGE);
  }
  async snapshot() {
    try {
      const snapshot = await this.client.createSnapshot(this.id, buildSnapshotName(this.config.runtimeId));
      return snapshot.snapshotId;
    } catch (error) {
      if (error instanceof CubeApiRouteNotAvailableError) {
        return this.localFiles.snapshot();
      }
      throw error;
    }
  }
  async stop() {
    if (this.statusValue === "stopped" || this.statusValue === "hibernated") {
      return;
    }
    try {
      this.statusValue = "hibernating";
      await this.client.pauseSandbox(this.id);
      this.statusValue = "hibernated";
    } catch (error) {
      if (isMissingSandboxError(error)) {
        this.statusValue = "stopped";
        return;
      }
      this.statusValue = "failed";
      throw error;
    }
  }
  async destroy() {
    if (this.statusValue === "stopped") {
      return;
    }
    try {
      await this.client.deleteSandbox(this.id);
      this.statusValue = "stopped";
    } catch (error) {
      if (isMissingSandboxError(error)) {
        this.statusValue = "stopped";
        return;
      }
      this.statusValue = "failed";
      throw error;
    }
  }
  async refreshStatus() {
    const detail = await this.client.getSandbox(this.id);
    this.connection = detail;
    this.statusValue = mapCubeState(detail.state);
    return this.statusValue;
  }
};
function buildSnapshotName(runtimeId) {
  return `${runtimeId}-${Date.now().toString(36)}`;
}
function mapCubeState(state) {
  const normalized = state.trim().toLowerCase();
  if (normalized === "paused") {
    return "hibernated";
  }
  if (normalized === "running") {
    return "active";
  }
  return "failed";
}
function isMissingSandboxError(error) {
  return error instanceof CubeApiError && error.statusCode === 404;
}

// ../sandbox/src/factory.ts
async function connectSandbox(options) {
  const provider = resolveSandboxProvider(options);
  if (provider === "cube") {
    return CubeSandbox.connect(options);
  }
  return new LocalSandbox(options.workDir, options.runtimeId);
}

// src/agent-router/types.ts
var AGENT_ROUTER_HARNESSES = ["claude", "codex", "opencode", "openclaw", "hermes"];

// src/agent-router/router.ts
import { resolve as resolve8 } from "node:path";

// src/agent-router/utils.ts
import { constants, existsSync as existsSync5 } from "node:fs";
import { access as access2 } from "node:fs/promises";
import { delimiter as delimiter2, dirname as dirname5, join as join7, resolve as resolve7 } from "node:path";
import { platform as platform2 } from "node:process";
var DEFAULT_AGENT_ROUTER_TIMEOUT_MS = 12 * 60 * 60 * 1e3;
var STDERR_TAIL_LIMIT = 8e3;
function resolveTimeoutMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_AGENT_ROUTER_TIMEOUT_MS;
}
async function findExecutableOnPath2(command) {
  if (isPathLike(command)) {
    return await isExecutableCandidate2(command) ? resolve7(command) : null;
  }
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }
  const extensions = platform2 === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
  for (const baseDir of pathValue.split(delimiter2)) {
    for (const extension of extensions) {
      const candidate = join7(baseDir, command + extension);
      if (await isExecutableCandidate2(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
async function resolveExecutablePath(command, executablePath) {
  const candidate = executablePath?.trim() || command;
  return findExecutableOnPath2(candidate);
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
  const parts = pathValue.split(delimiter2).filter(Boolean);
  const existing = parts.filter((part) => !normalizedPaths.includes(part));
  return [...normalizedPaths, ...existing].filter(Boolean).join(delimiter2);
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
async function isExecutableCandidate2(candidate) {
  if (!existsSync5(candidate)) {
    return false;
  }
  try {
    await access2(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function ensureExecutablePath(pathValue, executablePath, pathDirs) {
  return ensureEnvPath(pathValue, [
    dirname5(executablePath),
    ...pathDirs,
    process.env.AGENT_SPACE_DAEMON_BIN ? dirname5(process.env.AGENT_SPACE_DAEMON_BIN) : "",
    process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join7(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : "",
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
import { dirname as dirname6 } from "node:path";
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
      dirs.push(dirname6(capability.binPath));
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
import { spawn as spawn2 } from "node:child_process";
var KILL_GRACE_PERIOD_MS2 = 5e3;
async function runLaunchPlan(harness, plan, options = {}) {
  let child;
  try {
    child = spawn2(plan.executable, plan.args, {
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
  return await new Promise((resolve11, reject) => {
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
        }, KILL_GRACE_PERIOD_MS2);
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
      resolve11({
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
import { spawn as spawn3 } from "node:child_process";
async function runVersionCommand(executable, args) {
  return await new Promise((resolve11) => {
    const child = spawn3(executable, args, {
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
      resolve11("");
    });
    child.on("close", (exitCode) => {
      resolve11(exitCode === 0 ? output.trim().split(/\r?\n/)[0] ?? "" : "");
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
  const executable = await findExecutableOnPath2("claude");
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
import { mkdtempSync, readFileSync as readFileSync4, rmSync as rmSync3 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname7, join as join8 } from "node:path";
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
  const executable = await findExecutableOnPath2("codex");
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
  const outputDir = mkdtempSync(join8(tmpdir(), "agent-router-codex-"));
  const outputFile = join8(outputDir, "last-message.txt");
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
    return readFileSync4(outputFile, "utf8").trim();
  } catch {
    return "";
  }
}
function cleanupCodexOutputFile(outputFile) {
  if (!outputFile) {
    return;
  }
  rmSync3(dirname7(outputFile), { recursive: true, force: true });
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
    const executable = await findExecutableOnPath2(command);
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
  const executable = await findExecutableOnPath2("opencode");
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
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "node:fs";
import { homedir } from "node:os";
import { join as join9 } from "node:path";
function inspectOpenClawDaemonAuthHealth(input = {}) {
  const env = input.env ?? process.env;
  const homeDir = input.homeDir ?? env.HOME ?? homedir();
  const profile = input.profile?.trim() || env.OPENCLAW_PROFILE?.trim() || void 0;
  const model = input.model?.trim() || env.OPENCLAW_MODEL?.trim() || void 0;
  const explicitConfigPath = env.OPENCLAW_CONFIG_PATH?.trim() || void 0;
  const openclawConfigPath = explicitConfigPath ?? join9(homeDir, profile ? `.openclaw-${profile}` : ".openclaw", "openclaw.json");
  const authProfilesPath = input.workDir ? join9(input.workDir, "agent", "auth-profiles.json") : void 0;
  const modelsPath = input.workDir ? join9(input.workDir, "agent", "models.json") : void 0;
  const hasOpenClawConfig = existsSync6(openclawConfigPath);
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
  return existsSync6(join9(workDir, "task.json")) || existsSync6(join9(workDir, "prompt.txt"));
}
function readJsonObject(path) {
  if (!existsSync6(path)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf8"));
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
  const executable = await findExecutableOnPath2("openclaw");
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
      cwd: resolve8(request.cwd)
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

// src/google-workspace-readiness.ts
import { spawnSync as spawnSync3 } from "node:child_process";
var GOOGLE_WORKSPACE_EXECUTOR_ENV = "AGENT_SPACE_GOOGLE_WORKSPACE_EXECUTOR";
function readGoogleWorkspaceReadiness(environment = process.env) {
  const executor = environment[GOOGLE_WORKSPACE_EXECUTOR_ENV]?.trim() || "gws";
  return {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    executor,
    agentSpaceOutput: checkAgentSpaceOutput(environment),
    gws: checkCommandVersion(executor, ["--version"], environment),
    bwrap: checkBwrap(environment)
  };
}
function checkAgentSpaceOutput(environment) {
  const command = "agent-space";
  const available = checkCommandVersion(command, ["output", "--help"], environment);
  if (!available.available) {
    return available;
  }
  for (const args of [
    ["output", "sheets-result", "add", "--help"],
    ["output", "validate", "--help"]
  ]) {
    const result = run(command, args, environment);
    if (result.status !== 0) {
      return {
        ...available,
        available: false,
        error: sanitizeOutput(result.stderr || result.stdout || `${command} ${args.join(" ")} failed.`)
      };
    }
  }
  return available;
}
function checkBwrap(environment) {
  const version = checkCommandVersion("bwrap", ["--version"], environment);
  if (!version.available) {
    return version;
  }
  const help = run("bwrap", ["--help"], environment);
  const output = `${help.stdout}
${help.stderr}`;
  const supportsPerms = output.includes("--perms");
  return {
    ...version,
    available: supportsPerms,
    supportsPerms,
    error: supportsPerms ? version.error : "bubblewrap is installed but does not support --perms; Codex-based agents may fail unless Codex can fall back to its vendored bwrap."
  };
}
function checkCommandVersion(command, args, environment) {
  const result = run(command, args, environment);
  if (result.error) {
    return {
      available: false,
      error: result.error
    };
  }
  if (result.status !== 0) {
    return {
      available: false,
      error: sanitizeOutput(result.stderr || result.stdout || `${command} ${args.join(" ")} failed.`)
    };
  }
  return {
    available: true,
    version: sanitizeOutput(result.stdout || result.stderr)
  };
}
function run(command, args, environment) {
  const result = spawnSync3(command, args, {
    env: environment,
    encoding: "utf8",
    timeout: 5e3
  });
  if (result.error) {
    const error = result.error;
    if (error.code === "ENOENT") {
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: `${command} was not found on PATH.`
      };
    }
    return {
      status: null,
      stdout: "",
      stderr: "",
      error: error.message
    };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}
function sanitizeOutput(value) {
  return value.trim().replace(/[\r\n]+/g, " ").slice(0, 500);
}

// src/runtime-apps.ts
import { spawn as spawn4 } from "node:child_process";
import { spawnSync as spawnSync4 } from "node:child_process";
var MAX_TAIL_CHARS = 8e3;
var SECRET_PATTERNS = [
  /(api[_-]?key|token|secret|password|authorization)(["'\s:=]+)([^\s"',;]+)/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi
];
async function executeRuntimeAppPlan(plan) {
  let stdout = "";
  let stderr = "";
  for (const command of [...plan.commands, ...plan.verifyCommands]) {
    const result = await execCommand(command);
    stdout += `
$ ${renderCommand(command)}
${result.stdout}`;
    stderr += result.stderr ? `
$ ${renderCommand(command)}
${result.stderr}` : "";
  }
  return {
    safeStdoutTail: tailAndRedact(stdout),
    safeStderrTail: tailAndRedact(stderr)
  };
}
function readCliHubReadiness() {
  return {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    python: checkCommand("python", ["--version"]),
    pip: checkCommand("python", ["-m", "pip", "--version"]),
    cliHub: checkCommand("cli-hub", ["--version"]),
    npm: checkCommand("npm", ["--version"]),
    uv: checkCommand("uv", ["--version"])
  };
}
function parseRuntimeAppInstallPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const plan = value;
  if (!plan.app || typeof plan.app.name !== "string" || !Array.isArray(plan.commands) || !Array.isArray(plan.verifyCommands)) {
    return null;
  }
  if (![...plan.commands, ...plan.verifyCommands].every(isCommandPlanItem)) {
    return null;
  }
  return plan;
}
function checkCommand(command, args) {
  const result = spawnSync4(command, args, {
    env: process.env,
    encoding: "utf8",
    timeout: 5e3
  });
  if (result.error) {
    return { available: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      error: tailAndRedact(`${result.stderr || result.stdout || `${command} exited with code ${result.status}`}`)
    };
  }
  const version = `${result.stdout ?? ""}
${result.stderr ?? ""}`.trim().split(/\r?\n/)[0]?.trim();
  return {
    available: true,
    version: version || void 0
  };
}
function execCommand(command) {
  return new Promise((resolve11, reject) => {
    const child = spawn4(command.executable, command.args, {
      env: {
        ...process.env,
        ...command.env ?? {}
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      stdout = stdout.slice(-MAX_TAIL_CHARS * 2);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      stderr = stderr.slice(-MAX_TAIL_CHARS * 2);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve11({ stdout, stderr });
        return;
      }
      const error = new Error(`${renderCommand(command)} exited with code ${code}. ${tailAndRedact(stderr || stdout)}`);
      reject(Object.assign(error, {
        stdout: tailAndRedact(stdout),
        stderr: tailAndRedact(stderr)
      }));
    });
  });
}
function isCommandPlanItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value;
  return typeof record.executable === "string" && record.executable.trim().length > 0 && Array.isArray(record.args) && record.args.every((arg) => typeof arg === "string");
}
function renderCommand(command) {
  return [command.executable, ...command.args].join(" ");
}
function tailAndRedact(value) {
  let output = value.slice(-MAX_TAIL_CHARS);
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(
      pattern,
      (_match, prefix, separator) => separator ? `${prefix}${separator}[REDACTED]` : `${prefix}[REDACTED]`
    );
  }
  return output;
}

// src/provider-runtime.ts
var ProviderTaskExecutionError = class extends Error {
  sessionId;
  workDir;
  providerError;
  constructor(message, metadata) {
    super(message);
    this.name = "ProviderTaskExecutionError";
    this.sessionId = metadata?.sessionId;
    this.workDir = metadata?.workDir;
    this.providerError = metadata?.providerError;
  }
};
var PROVIDER_CATALOG = [
  { provider: "codex", label: formatDaemonProviderLabel("codex"), command: "codex" },
  {
    provider: "claude",
    label: formatDaemonProviderLabel("claude"),
    command: "claude",
    defaultModelId: "claude-haiku-4-5-20251001"
  },
  {
    provider: "gemini",
    label: formatDaemonProviderLabel("gemini"),
    command: "gemini",
    defaultModelId: "gemini-2.0-flash-lite"
  },
  {
    provider: "opencode",
    label: formatDaemonProviderLabel("opencode"),
    command: "opencode",
    defaultModelId: "opencode-default"
  },
  {
    provider: "openclaw",
    label: formatDaemonProviderLabel("openclaw"),
    command: "openclaw"
  },
  {
    provider: "nanobot",
    label: formatDaemonProviderLabel("nanobot"),
    command: "nanobot",
    defaultModelId: "nanobot-default"
  },
  {
    provider: "hermes",
    label: formatDaemonProviderLabel("hermes"),
    commands: ["hermes", "hermes-agent"],
    versionArgs: [["--version"], ["version"]]
  }
];
var CLAUDE_MISSING_RESUME_SESSION_PATTERN = /No conversation found with session ID:/i;
var CODEX_MISSING_RESUME_SESSION_PATTERN = /no rollout found for thread id\s+([^\s)]+)/i;
var OPENCLAW_MISSING_RESUME_SESSION_PATTERN = /session .*not found|session.*missing|conversation .*not found|conversation.*missing|agent .*not found|agent.*missing|unknown session/i;
function detectProviders() {
  return PROVIDER_CATALOG.map((candidate) => {
    const executablePath = findFirstExecutableOnPath(resolveProviderCommands(candidate));
    if (!executablePath) {
      return null;
    }
    if (candidate.provider === "claude") {
      warnClaudeRootRuntimeIfNeeded("detected");
    }
    return {
      provider: candidate.provider,
      label: candidate.label,
      executablePath,
      version: detectProviderVersion(executablePath, candidate.versionArgs)
    };
  }).filter((value) => value !== null);
}
async function runProviderTask(runtime, prompt, workDir, options = {}) {
  const taskTimeoutMs = resolveSandboxTaskTimeoutMs(options.taskTimeoutMs);
  if (runtime.provider === "claude") {
    return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider === "gemini") {
    return runGeminiProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider === "opencode") {
    return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider === "openclaw") {
    return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider === "hermes") {
    return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider === "nanobot") {
    return runNanoBotProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
  }
  if (runtime.provider !== "codex") {
    throw new Error(`Provider "${runtime.provider}" is not supported.`);
  }
  return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options);
}
async function runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, options) {
  clearTaskOutputArtifacts(workDir);
  const harness = runtime.provider;
  const runtimeToolCapabilities = buildRuntimeToolCapabilities(options);
  const contextEnv = buildAgentRouterProviderEnv(runtime, options.contextEnv);
  const sessionId = resolveAgentRouterSessionId(runtime, options.sessionId);
  const result = await runAgentRouter({
    version: 1,
    harness,
    prompt,
    cwd: workDir,
    executablePath: runtime.metadata.executablePath,
    model: resolveModelId(runtime),
    mode: resolveAgentRouterMode(runtime),
    sessionId,
    env: contextEnv,
    providerHealth: runtime.provider === "openclaw" ? readRuntimeProviderHealthMetadata(runtime) : void 0,
    timeoutMs: taskTimeoutMs,
    maxTurns: runtime.provider === "claude" ? 30 : void 0,
    permissionMode: runtime.provider === "claude" ? resolveClaudePermissionMode() : void 0,
    dangerouslyBypassPermissions: runtime.provider === "codex" || runtime.provider === "claude" && !isRootUser(),
    allowedTools: runtime.provider === "claude" && isRootUser() ? buildDefaultClaudeAllowedTools() : void 0,
    temporaryAllowedTools: options.temporaryAllowedTools,
    runtimeToolCapabilities,
    claudeTools: runtime.provider === "claude" ? "default" : void 0,
    handleControlRequests: runtime.provider === "claude" && isRootUser(),
    openClawEphemeralAgent: runtime.provider === "openclaw" && !sessionId,
    onApprovalRequest: options.onApprovalRequest ? async (request) => options.onApprovalRequest?.({
      provider: runtime.provider,
      runtimeId: runtime.id,
      sessionId: request.sessionId,
      toolName: request.toolName,
      toolInput: request.toolInput,
      contentPreview: request.contentPreview
    }) ?? { decision: "approved" } : void 0
  }, {
    emit: (event) => {
      for (const mapped of mapAgentRouterEvent(event)) {
        options.onEvent?.(mapped);
      }
    }
  });
  if (isMissingResumeSessionResult(runtime.provider, result.diagnostics, sessionId)) {
    const sessionInvalidMessage = `${formatDaemonProviderLabel(runtime.provider)} session ${sessionId} was not found; starting a new conversation.`;
    options.onEvent?.({
      type: "provider_session_invalid",
      content: sessionInvalidMessage,
      inputJson: {
        provider: runtime.provider,
        runtimeId: runtime.id,
        sessionId,
        code: "provider.session_invalid"
      }
    });
    options.onEvent?.({
      type: "status",
      content: sessionInvalidMessage
    });
    clearTaskOutputArtifacts(workDir);
    return runAgentRouterProviderTask(runtime, prompt, workDir, taskTimeoutMs, {
      ...options,
      sessionId: void 0
    });
  }
  if (runtime.provider === "claude") {
    const permissionDenials = extractClaudePermissionDenialsFromRouterEvents(result.events);
    if (permissionDenials.length > 0 && options.onApprovalRequest) {
      const allowedTools = [];
      for (const denial of permissionDenials) {
        const decision = await options.onApprovalRequest({
          provider: runtime.provider,
          runtimeId: runtime.id,
          sessionId: result.sessionId,
          toolName: denial.toolName,
          toolInput: denial.toolInput,
          contentPreview: formatClaudePermissionDenialPreview(denial)
        });
        if (decision.decision !== "approved") {
          throw buildRouterProviderFailure(
            runtime.provider,
            `Claude tool request was rejected.${decision.comment ? ` ${decision.comment}` : ""}`,
            result,
            workDir
          );
        }
        const allowedTool = buildClaudeAllowedToolFromPermissionDenial(denial);
        if (allowedTool) {
          allowedTools.push(allowedTool);
        }
      }
      if (allowedTools.length > 0 && result.sessionId) {
        clearTaskOutputArtifacts(workDir);
        return runAgentRouterProviderTask(runtime, "\u7528\u6237\u5DF2\u7ECF\u5728 AgentSpace \u524D\u7AEF\u6279\u51C6\u4E86\u521A\u624D\u88AB\u62E6\u622A\u7684\u5DE5\u5177\u8C03\u7528\u3002\u8BF7\u4ECE\u521A\u624D\u4E2D\u65AD\u7684\u4F4D\u7F6E\u7EE7\u7EED\uFF0C\u91CD\u65B0\u6267\u884C\u5DF2\u83B7\u6279\u51C6\u7684\u5DE5\u5177\u547D\u4EE4\uFF0C\u5E76\u57FA\u4E8E\u771F\u5B9E\u7ED3\u679C\u5B8C\u6210\u7528\u6237\u8BF7\u6C42\u3002", workDir, taskTimeoutMs, {
          ...options,
          sessionId: result.sessionId,
          temporaryAllowedTools: allowedTools
        });
      }
    }
  }
  if (result.status !== "completed") {
    throw buildRouterProviderFailure(runtime.provider, buildRouterFailureMessage(runtime.provider, result), result, workDir);
  }
  const output = result.outputText?.trim();
  if (!output) {
    throw buildRouterProviderFailure(runtime.provider, `${runtime.provider} returned an empty response.`, result, workDir);
  }
  return { output, sessionId: result.sessionId };
}
function resolveAgentRouterMode(runtime) {
  if (runtime.provider === "openclaw") {
    return process.env.OPENCLAW_THINKING?.trim() || void 0;
  }
  return void 0;
}
function resolveAgentRouterSessionId(runtime, sessionId) {
  if (runtime.provider === "hermes") {
    return void 0;
  }
  return sessionId;
}
function resolveClaudePermissionMode() {
  return isRootUser() ? "auto" : "bypassPermissions";
}
function buildRuntimeToolCapabilities(options) {
  return dedupeRuntimeToolCapabilities([
    ...buildBuiltinRuntimeToolCapabilities(options.contextEnv),
    ...buildCliHubRuntimeToolCapabilities(options.runtimeApps ?? []),
    ...options.runtimeToolCapabilities ?? []
  ]);
}
function buildBuiltinRuntimeToolCapabilities(contextEnv) {
  const capabilities = [
    {
      id: "agent-space-output",
      command: "agent-space",
      displayName: "AgentSpace output CLI",
      binDir: process.env.AGENT_SPACE_DAEMON_BIN ? dirname8(process.env.AGENT_SPACE_DAEMON_BIN) : void 0,
      pathDirs: [
        process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join10(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : ""
      ].filter(Boolean),
      allowedShellPatterns: [
        "agent-space output text *",
        "agent-space output attach *",
        "agent-space output validate *",
        "agent-space output preview *"
      ],
      source: "builtin"
    }
  ];
  const googleTokenEnvName = readGoogleWorkspaceTokenEnvName(contextEnv);
  if (googleTokenEnvName) {
    const command = process.env.AGENT_SPACE_GOOGLE_WORKSPACE_EXECUTOR?.trim() || "gws";
    const binDir = resolveCommandDirFromCurrentEnv(command);
    capabilities.push({
      id: "google-workspace",
      command,
      displayName: "Google Workspace",
      binPath: isPathLike2(command) ? command : void 0,
      binDir,
      allowedShellPatterns: [
        `${command} --version`
      ],
      diagnosticCommands: [`command -v ${shellQuote(command)}`],
      env: pickEnv(contextEnv, [googleTokenEnvName]),
      source: "builtin"
    });
  }
  return capabilities;
}
function buildCliHubRuntimeToolCapabilities(runtimeApps) {
  return runtimeApps.flatMap((app) => {
    const command = app.entryPoint?.trim();
    if (!command) {
      return [];
    }
    return [{
      id: `clihub:${app.source}:${app.name}`,
      command,
      displayName: app.displayName || app.name,
      binDir: resolveCommandDirFromCurrentEnv(command),
      allowedShellPatterns: [`${command} *`, `${command} --help`, `command -v ${command}`],
      diagnosticCommands: [`command -v ${shellQuote(command)}`],
      source: "cli-hub"
    }];
  });
}
function readGoogleWorkspaceTokenEnvName(contextEnv) {
  if (!contextEnv) {
    return void 0;
  }
  if (typeof contextEnv.GOOGLE_WORKSPACE_CLI_TOKEN === "string" && contextEnv.GOOGLE_WORKSPACE_CLI_TOKEN.trim()) {
    return "GOOGLE_WORKSPACE_CLI_TOKEN";
  }
  return Object.keys(contextEnv).find((key) => /^GOOGLE_.*TOKEN$/i.test(key) && contextEnv[key]?.trim());
}
function pickEnv(source, keys) {
  if (!source) {
    return void 0;
  }
  const env = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return Object.keys(env).length > 0 ? env : void 0;
}
function resolveCommandDirFromCurrentEnv(command) {
  if (isPathLike2(command)) {
    return dirname8(command);
  }
  const path = findExecutableOnPath3(command);
  return path ? dirname8(path) : void 0;
}
function isPathLike2(value) {
  return isAbsolute5(value) || value.includes("/") || value.includes("\\");
}
function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function dedupeRuntimeToolCapabilities(capabilities) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const capability of capabilities) {
    const id = capability.id.trim();
    const command = capability.command.trim();
    if (!id || !command || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({
      ...capability,
      id,
      command,
      allowedShellPatterns: dedupeStrings3(capability.allowedShellPatterns ?? []),
      diagnosticCommands: capability.diagnosticCommands ? dedupeStrings3(capability.diagnosticCommands) : void 0,
      pathDirs: capability.pathDirs ? dedupeStrings3(capability.pathDirs) : void 0
    });
  }
  return result;
}
function mapAgentRouterEvent(event) {
  if (event.type === "text_delta") {
    return event.text.trim() ? [{ type: "text", content: event.text }] : [];
  }
  if (event.type === "thought_delta") {
    return event.text.trim() ? [{ type: "thinking", content: event.text }] : [];
  }
  if (event.type === "tool_started") {
    return [{
      type: "tool_use",
      tool: event.tool,
      content: event.title ?? event.tool,
      inputJson: event.input && typeof event.input === "object" && !Array.isArray(event.input) ? event.input : void 0
    }];
  }
  if (event.type === "tool_output" && event.tool === "usage" && event.metadata && typeof event.metadata === "object") {
    const usage = event.metadata;
    const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    return [{
      type: "usage",
      content: `tokens: in=${inputTokens} out=${outputTokens}`,
      inputJson: { input_tokens: inputTokens, output_tokens: outputTokens }
    }];
  }
  if (event.type === "tool_output") {
    return [{
      type: "tool_result",
      tool: event.tool,
      content: event.output ? truncateToolOutput(event.output) : "completed",
      output: event.output ? truncateToolOutput(event.output) : void 0
    }];
  }
  if (event.type === "approval_requested") {
    return [{
      type: "status",
      content: `Runtime approval requested: ${event.contentPreview}`
    }];
  }
  return [];
}
function isMissingResumeSessionResult(provider, diagnostics, requestedSessionId) {
  if (!requestedSessionId) {
    return false;
  }
  const text = diagnostics.map((diagnostic) => `${diagnostic.message}
${diagnostic.rawProviderMessage ?? ""}
${diagnostic.stderrTail ?? ""}`).join("\n");
  if (provider === "claude") {
    return CLAUDE_MISSING_RESUME_SESSION_PATTERN.test(text) && text.includes(requestedSessionId);
  }
  if (provider === "codex") {
    const match = CODEX_MISSING_RESUME_SESSION_PATTERN.exec(text);
    return Boolean(match?.[1] === requestedSessionId);
  }
  if (provider === "openclaw") {
    return diagnostics.some((diagnostic) => diagnostic.code === "harness.session_missing") || OPENCLAW_MISSING_RESUME_SESSION_PATTERN.test(text) && text.includes(requestedSessionId);
  }
  return false;
}
function buildRouterFailureMessage(provider, result) {
  if (result.status === "timeout") {
    const primary2 = result.diagnostics.find((diagnostic) => diagnostic.code === "harness.timeout") ?? result.diagnostics[0];
    return `${primary2?.message || `${provider} timed out after router timeout.`} ${formatRouterDiagnosticDetails(result)}`;
  }
  const primary = result.diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? result.diagnostics[0];
  const baseMessage = primary?.message || `${provider} execution failed.`;
  return `${baseMessage} ${formatRouterDiagnosticDetails(result)}`.trim();
}
function buildRouterProviderFailure(provider, message, result, workDir) {
  const primary = result.diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? result.diagnostics[0];
  const code = mapRouterDiagnosticCode(provider, primary?.code, result);
  const fullMessage = message.includes("code=") ? message : `${message} ${formatRouterDiagnosticDetails(result)}`.trim();
  return new ProviderTaskExecutionError(fullMessage, {
    sessionId: result.sessionId,
    workDir,
    providerError: {
      provider,
      code,
      category: resolveRouterProviderErrorCategory(code, primary?.code),
      message: fullMessage,
      rawProviderMessage: primary?.rawProviderMessage ?? primary?.stderrTail ?? primary?.message
    }
  });
}
function mapRouterDiagnosticCode(provider, code, result) {
  if (code === "harness.cli_missing") {
    return "provider.cli_missing";
  }
  if (code === "harness.auth_required" || code === "harness.auth_invalid") {
    return "provider.auth_invalid";
  }
  if (code === "harness.profile_missing") {
    return "provider.profile_missing";
  }
  if (code === "harness.model_unavailable") {
    return "provider.model_unavailable";
  }
  if (code === "harness.tool_missing") {
    return "provider.tool_missing";
  }
  if (code === "harness.tool_unauthorized") {
    return "provider.tool_unauthorized";
  }
  if (code === "harness.tool_permission_denied") {
    return "provider.tool_permission_denied";
  }
  if (code === "harness.protocol_parse_failed") {
    return "provider.protocol_parse_failed";
  }
  if (code === "harness.timeout") {
    return "provider.timeout";
  }
  if (code === "harness.session_missing") {
    return "provider.session_invalid";
  }
  if (code === "harness.empty_response") {
    return provider === "claude" ? resolveClaudeEmptyResponseCodeFromRouter(result) : "provider.empty_response";
  }
  return "provider.runtime_generic_failure";
}
function resolveClaudeEmptyResponseCodeFromRouter(result) {
  const hasStdout = result.events.some((event) => event.type === "thought_delta" || event.type === "text_delta" || event.type === "tool_started" || event.type === "tool_output" || event.type === "approval_requested");
  const hasResultEvent = Boolean(result.sessionId) || result.events.some((event) => event.type === "session_updated");
  if (!hasStdout) {
    return "provider.empty_response.stdout_empty";
  }
  if (!hasResultEvent) {
    return "provider.empty_response.no_result_event";
  }
  return "provider.empty_response.no_text_event";
}
function resolveRouterProviderErrorCategory(providerCode, routerCode) {
  if (providerCode === "provider.auth_invalid") {
    return "auth";
  }
  if (providerCode === "provider.profile_missing") {
    return "profile";
  }
  if (providerCode === "provider.model_unavailable") {
    return "model";
  }
  if (providerCode === "provider.timeout" || providerCode === "provider.session_invalid") {
    return "runtime";
  }
  if (routerCode === "harness.cli_missing") {
    return "configuration";
  }
  if (providerCode === "provider.tool_missing") {
    return "configuration";
  }
  if (providerCode === "provider.tool_unauthorized" || providerCode === "provider.tool_permission_denied") {
    return "tool";
  }
  if (providerCode === "provider.protocol_parse_failed") {
    return "protocol";
  }
  if (providerCode === "provider.runtime_generic_failure") {
    return "runtime";
  }
  return "provider";
}
function formatRouterDiagnosticDetails(result) {
  const primary = result.diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? result.diagnostics[0];
  const code = primary ? mapRouterDiagnosticCode(result.harness, primary.code, result) : "provider.runtime_generic_failure";
  const parts = [
    `code=${code}`,
    `status=${result.status}`
  ];
  if (result.status === "timeout") {
    parts.push("timedOut=true");
  }
  if (result.exitCode !== void 0) {
    parts.push(`exitCode=${result.exitCode ?? "null"}`);
  }
  if (result.signal) {
    parts.push(`signal=${result.signal}`);
  }
  if (result.sessionId) {
    parts.push(`sessionId=${result.sessionId}`);
  }
  if (primary?.stderrTail) {
    parts.push(`stderrTail=${JSON.stringify(primary.stderrTail)}`);
  }
  if (primary?.rawProviderMessage) {
    parts.push(`rawProviderMessage=${JSON.stringify(primary.rawProviderMessage)}`);
    parts.push(primary.rawProviderMessage);
  }
  return `(${parts.join("; ")})`;
}
function extractClaudePermissionDenialsFromRouterEvents(events) {
  return events.flatMap((event) => {
    if (event.type !== "approval_requested") {
      return [];
    }
    return [{
      toolName: event.toolName,
      toolInput: event.toolInput
    }];
  });
}
function resolveModelId(runtime) {
  const providerDefinition = PROVIDER_CATALOG.find((candidate) => candidate.provider === runtime.provider);
  if (runtime.provider === "codex") return process.env.CODEX_MODEL?.trim() || void 0;
  if (runtime.provider === "claude") return process.env.CLAUDE_MODEL || providerDefinition?.defaultModelId || "claude-haiku-4-5-20251001";
  if (runtime.provider === "gemini") return process.env.GEMINI_MODEL || providerDefinition?.defaultModelId || "gemini-2.0-flash-lite";
  if (runtime.provider === "opencode") return process.env.OPENCODE_MODEL || providerDefinition?.defaultModelId || "opencode-default";
  if (runtime.provider === "openclaw") return readRuntimeMetadataString(runtime, "openClawModel", "openclawModel") || process.env.OPENCLAW_MODEL?.trim() || void 0;
  if (runtime.provider === "nanobot") return process.env.NANOBOT_MODEL || providerDefinition?.defaultModelId || "nanobot-default";
  if (runtime.provider === "hermes") return process.env.HERMES_MODEL?.trim() || process.env.HERMES_INFERENCE_MODEL?.trim() || void 0;
  return providerDefinition?.defaultModelId;
}
function readNodeMetadata(serverUrl, runtimeName, runtimes = []) {
  return {
    mode: "remote",
    pid: String(process.pid),
    runtimeName,
    nodeVersion,
    platform: platform3,
    arch,
    serverUrl,
    googleWorkspaceReadiness: readGoogleWorkspaceReadiness(),
    cliHubReadiness: readCliHubReadiness(),
    providerHealth: Object.fromEntries(
      runtimes.map((runtime) => [runtime.id, readRuntimeProviderHealthMetadata(runtime)]).filter((entry) => Boolean(entry[1]))
    )
  };
}
function buildProviderRuntimeMetadata(runtime) {
  const base = {
    executablePath: runtime.metadata.executablePath,
    mode: runtime.metadata.mode
  };
  if (runtime.provider === "openclaw") {
    const profile = process.env.OPENCLAW_PROFILE?.trim();
    const model = process.env.OPENCLAW_MODEL?.trim();
    const health = inspectOpenClawDaemonAuthHealth({
      env: process.env,
      profile,
      model
    });
    return {
      ...base,
      openClawProfile: profile,
      openClawModel: model,
      providerHealth: buildOpenClawProviderHealthSnapshot(health)
    };
  }
  return base;
}
function readRuntimeProviderHealthMetadata(runtime) {
  const metadata = runtime.metadata;
  const providerHealth = metadata.providerHealth;
  if (providerHealth && typeof providerHealth === "object" && !Array.isArray(providerHealth)) {
    return providerHealth;
  }
  if (runtime.provider !== "openclaw") {
    return void 0;
  }
  const profile = readRuntimeMetadataString(runtime, "openClawProfile", "openclawProfile") || process.env.OPENCLAW_PROFILE?.trim() || void 0;
  const model = readRuntimeMetadataString(runtime, "openClawModel", "openclawModel") || process.env.OPENCLAW_MODEL?.trim() || void 0;
  return buildOpenClawProviderHealthSnapshot(inspectOpenClawDaemonAuthHealth({
    env: process.env,
    profile,
    model
  }));
}
function readRuntimeMetadataString(runtime, ...keys) {
  const metadata = runtime.metadata;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return void 0;
}
function buildAgentRouterProviderEnv(runtime, extra) {
  const env = buildProviderEnv(runtime, extra);
  if (runtime.provider !== "openclaw") {
    return env;
  }
  const profile = readRuntimeMetadataString(runtime, "openClawProfile", "openclawProfile");
  const model = readRuntimeMetadataString(runtime, "openClawModel", "openclawModel");
  if (profile) {
    env.AGENT_SPACE_OPENCLAW_PROFILE_OVERRIDE = profile;
  }
  if (model) {
    env.AGENT_SPACE_OPENCLAW_MODEL_OVERRIDE = model;
  }
  return env;
}
function detectProviderVersion(executablePath, versionArgs = [["--version"]]) {
  for (const args of versionArgs) {
    const result = spawnSync5(executablePath, args, {
      env: process.env,
      encoding: "utf8"
    });
    if (result.error || result.status !== 0) {
      continue;
    }
    const output = `${result.stdout ?? ""}
${result.stderr ?? ""}`.trim();
    const firstLine = output.split(/\r?\n/)[0] ?? "";
    if (firstLine) {
      return firstLine;
    }
  }
  return "";
}
function findExecutableOnPath3(command) {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }
  const extensions = platform3 === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
  for (const baseDir of pathValue.split(delimiter3)) {
    for (const ext of extensions) {
      const candidate = join10(baseDir, command + ext);
      if (isExecutableCandidate3(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
function isExecutableCandidate3(candidate) {
  try {
    accessSync(candidate, constants2.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findFirstExecutableOnPath(commands) {
  for (const command of commands) {
    const executablePath = findExecutableOnPath3(command);
    if (executablePath) {
      return executablePath;
    }
  }
  return null;
}
function resolveProviderCommands(candidate) {
  return candidate.commands?.length ? candidate.commands : candidate.command ? [candidate.command] : [];
}
function isRootUser() {
  return typeof process.getuid === "function" && process.getuid() === 0;
}
var didWarnClaudeRootRuntime = false;
function warnClaudeRootRuntimeIfNeeded(action) {
  if (!isRootUser() || didWarnClaudeRootRuntime) {
    return;
  }
  didWarnClaudeRootRuntime = true;
  console.warn(
    `Claude Code runtime ${action} while agent-space-daemon is running as root. Ensure /root is logged in to Claude Code and treat task commands as root-privileged.`
  );
}
function buildClaudeAllowedToolFromPermissionDenial(denial) {
  if (denial.toolName !== "Bash") {
    return denial.toolName && denial.toolName !== "unknown" ? denial.toolName : void 0;
  }
  const command = typeof denial.toolInput?.command === "string" ? denial.toolInput.command.trim() : "";
  return command ? `Bash(${command})` : "Bash(*)";
}
function formatClaudePermissionDenialPreview(denial) {
  return formatToolApprovalPreview3(denial.toolName, denial.toolInput);
}
function formatToolApprovalPreview3(toolName, toolInput) {
  if (toolName === "Bash" && typeof toolInput?.command === "string") {
    return `Bash: ${toolInput.command}`;
  }
  return `${toolName}: ${JSON.stringify(toolInput ?? {})}`;
}
function dedupeStrings3(values) {
  return [...new Set(values.filter((value) => value.trim()))];
}
async function runGeminiProviderTask(runtime, prompt, workDir, taskTimeoutMs, options) {
  clearTaskOutputArtifacts(workDir);
  const outputFile = join10(workDir, "last-message.txt");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
  const providerArgs = ["--model", model, "--sandbox", "-y", prompt];
  const sandbox = await connectSandbox({
    runtimeId: runtime.id,
    workDir
  });
  let finalOutput = "";
  let stderr = "";
  let stdoutBuffer = "";
  const result = await sandbox.exec({
    command: runtime.metadata.executablePath,
    args: providerArgs,
    timeoutMs: taskTimeoutMs,
    env: buildProviderEnv(runtime, options.contextEnv),
    onStdout: (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        if (trimmed.startsWith("{")) {
          try {
            const event = JSON.parse(trimmed);
            for (const mapped of mapGeminiEvent(event)) {
              options.onEvent?.(mapped);
            }
            continue;
          } catch {
          }
        }
        finalOutput += (finalOutput ? "\n" : "") + trimmed;
      }
    },
    onStderr: (chunk) => {
      stderr += chunk;
    }
  });
  if (stdoutBuffer.trim()) {
    finalOutput += (finalOutput ? "\n" : "") + stdoutBuffer.trim();
  }
  if (result.timedOut) {
    throw new Error(`gemini timed out after ${taskTimeoutMs}ms.`);
  }
  if (result.exitCode !== 0) {
    throw new Error(stderr.trim() || `gemini exited with code ${result.exitCode}.`);
  }
  if (finalOutput) {
    writeFileSync4(outputFile, finalOutput, "utf8");
  }
  const output = finalOutput || (existsSync7(outputFile) ? readFileSync6(outputFile, "utf8").trim() : "");
  if (!output) {
    throw new Error("gemini returned an empty response.");
  }
  return { output };
}
async function runNanoBotProviderTask(runtime, prompt, workDir, taskTimeoutMs, options) {
  clearTaskOutputArtifacts(workDir);
  const outputFile = join10(workDir, "last-message.txt");
  const configPath = process.env.NANOBOT_CONFIG_PATH?.trim() || process.env.NANOBOT_CONFIG?.trim();
  const providerArgs = ["agent", "-w", workDir, "-m", prompt, "--no-markdown"];
  if (configPath) {
    providerArgs.splice(1, 0, "-c", configPath);
  }
  let stderr = "";
  const result = await execProviderCommand(runtime, providerArgs, workDir, taskTimeoutMs, buildNanoBotEnv(runtime, options.contextEnv), {
    onStderr: (chunk) => {
      stderr += chunk;
    }
  });
  if (result.result.timedOut) {
    throw new Error(`nanobot timed out after ${taskTimeoutMs}ms.`);
  }
  if (result.result.exitCode !== 0) {
    throw new Error(stderr.trim() || `nanobot exited with code ${result.result.exitCode}.`);
  }
  const output = result.stdout.trim();
  if (output) {
    writeFileSync4(outputFile, output, "utf8");
  }
  if (!output) {
    throw new Error("nanobot returned an empty response.");
  }
  return { output };
}
function mapGeminiEvent(event) {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "tool_call" || type === "function_call") {
    return [{
      type: "tool_use",
      tool: typeof event.name === "string" ? event.name : "unknown",
      content: typeof event.name === "string" ? event.name : "tool call"
    }];
  }
  if (type === "tool_result" || type === "function_response") {
    return [{
      type: "tool_result",
      content: typeof event.output === "string" ? truncateToolOutput(event.output) : "completed"
    }];
  }
  return [];
}
function truncateToolOutput(value) {
  const trimmed = value.trim();
  if (trimmed.length <= 1200) {
    return trimmed;
  }
  return `${trimmed.slice(0, 1197)}...`;
}
function buildProviderEnv(runtime, extra) {
  const env = { ...process.env };
  const currentPath = extra?.PATH ?? env.PATH ?? "";
  env.PATH = ensureProviderPath(currentPath, runtime);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value !== "string") {
        continue;
      }
      env[key] = key === "PATH" ? ensureProviderPath(value, runtime) : value;
    }
  }
  return env;
}
function ensureProviderPath(pathValue, runtime) {
  const runtimeBinDirs = dedupeStrings3([
    dirname8(runtime.metadata.executablePath),
    process.env.AGENT_SPACE_DAEMON_BIN ? dirname8(process.env.AGENT_SPACE_DAEMON_BIN) : "",
    process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join10(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : ""
  ]);
  const parts = pathValue.split(delimiter3).filter(Boolean);
  const existing = parts.filter((part) => !runtimeBinDirs.includes(part));
  return [...runtimeBinDirs, ...existing].filter(Boolean).join(delimiter3);
}
async function execProviderCommand(runtime, args, workDir, timeoutMs, env, callbacks) {
  const sandbox = await connectSandbox({
    runtimeId: runtime.id,
    workDir
  });
  let stdout = "";
  let stderr = "";
  const result = await sandbox.exec({
    command: runtime.metadata.executablePath,
    args,
    timeoutMs,
    env: buildProviderEnv(runtime, env),
    onStdout: (chunk) => {
      stdout += chunk;
      callbacks?.onStdout?.(chunk);
    },
    onStderr: (chunk) => {
      stderr += chunk;
      callbacks?.onStderr?.(chunk);
    }
  });
  return { stdout, stderr, result };
}
function buildNanoBotEnv(runtime, extra) {
  const env = buildProviderEnv(runtime, extra);
  const model = process.env.NANOBOT_MODEL?.trim();
  if (model && !env.NANOBOT_AGENTS__DEFAULTS__MODEL) {
    env.NANOBOT_AGENTS__DEFAULTS__MODEL = model;
  }
  return env;
}
function readProviderTaskFailureMetadata(error) {
  if (!(error instanceof ProviderTaskExecutionError)) {
    return void 0;
  }
  return {
    sessionId: error.sessionId,
    workDir: error.workDir,
    providerError: error.providerError
  };
}
function normalizeProviderTaskErrorCategory(category) {
  return category === "provider" || category === "runtime" || category === "configuration" || category === "auth" || category === "profile" || category === "model" || category === "tool" || category === "protocol" || category === "unknown" ? category : void 0;
}

// src/state.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync4, openSync, readFileSync as readFileSync7, rmSync as rmSync4, statSync as statSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname9, join as join11, resolve as resolve9 } from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_HEARTBEAT_INTERVAL_MS = 15e3;
var DEFAULT_TASK_POLL_INTERVAL_MS = 3e3;
var DEFAULT_LOG_LINES = 50;
var DEFAULT_STATE_DIR_NAME = ".agent-space-daemon";
function resolveDefaultDaemonStateDir(environment = process.env) {
  const configured = environment.AGENT_SPACE_DAEMON_STATE_DIR?.trim();
  if (configured) {
    return resolve9(configured);
  }
  const homeDir = environment.HOME?.trim() || homedir2();
  return resolve9(homeDir, DEFAULT_STATE_DIR_NAME);
}
function ensureDaemonStateDir(stateDir) {
  const resolvedStateDir = resolve9(stateDir);
  if (!existsSync8(resolvedStateDir)) {
    mkdirSync4(resolvedStateDir, { recursive: true });
  }
  return resolvedStateDir;
}
function openDaemonLogFile(logPath) {
  return openSync(logPath, "a");
}
function getDaemonPidFilePath(stateDir) {
  return join11(ensureDaemonStateDir(stateDir), "daemon.pid");
}
function getDaemonLogFilePath(stateDir) {
  return join11(ensureDaemonStateDir(stateDir), "daemon.log");
}
function readPidIfRunning(pidPath) {
  if (!existsSync8(pidPath)) {
    return null;
  }
  const raw = readFileSync7(pidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return isProcessRunning(pid) ? pid : null;
}
function cleanupStalePidFile(pidPath) {
  if (!existsSync8(pidPath)) {
    return;
  }
  const raw = readFileSync7(pidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessRunning(pid)) {
    rmSync4(pidPath, { force: true });
  }
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readLastLines(filePath, lines) {
  const content = readFileSync7(filePath, "utf8");
  const chunks = content.split(/\r?\n/).filter((line, index, all) => !(index === all.length - 1 && line === ""));
  return chunks.slice(-lines);
}
function renderDaemonSummary(summary) {
  return Object.entries(summary).map(([key, value]) => `${key}: ${String(value)}`).join("\n");
}
function getStandaloneCliEntryPath() {
  const currentFile = fileURLToPath(import.meta.url);
  return join11(dirname9(currentFile), currentFile.endsWith(".ts") ? "cli.ts" : "cli.js");
}

// src/task-context.ts
function parseTaskInputJson(inputJson) {
  try {
    const parsed = JSON.parse(inputJson);
    return {
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : void 0,
      assignee: typeof parsed.assignee === "string" ? parsed.assignee : void 0,
      title: typeof parsed.title === "string" ? parsed.title : void 0,
      channel: typeof parsed.channel === "string" ? parsed.channel : void 0,
      priority: typeof parsed.priority === "string" ? parsed.priority : void 0,
      contactId: typeof parsed.contactId === "string" ? parsed.contactId : void 0,
      channelName: typeof parsed.channelName === "string" ? parsed.channelName : void 0,
      channelMessage: typeof parsed.channelMessage === "string" ? parsed.channelMessage : void 0,
      sourceChannel: typeof parsed.sourceChannel === "string" ? parsed.sourceChannel : void 0,
      sourceMessageId: typeof parsed.sourceMessageId === "string" ? parsed.sourceMessageId : void 0,
      sourceTaskQueueId: typeof parsed.sourceTaskQueueId === "string" ? parsed.sourceTaskQueueId : void 0,
      mentionSource: typeof parsed.mentionSource === "string" ? parsed.mentionSource : void 0,
      initiatorAgentId: typeof parsed.initiatorAgentId === "string" ? parsed.initiatorAgentId : void 0,
      mentionCascadeDepth: typeof parsed.mentionCascadeDepth === "number" && Number.isFinite(parsed.mentionCascadeDepth) ? parsed.mentionCascadeDepth : void 0,
      mentionRootMessageId: typeof parsed.mentionRootMessageId === "string" ? parsed.mentionRootMessageId : void 0,
      orchestrationRunId: typeof parsed.orchestrationRunId === "string" ? parsed.orchestrationRunId : void 0,
      orchestrationStepId: typeof parsed.orchestrationStepId === "string" ? parsed.orchestrationStepId : void 0,
      stepInstruction: typeof parsed.stepInstruction === "string" ? parsed.stepInstruction : void 0,
      stepDependsOnIds: Array.isArray(parsed.stepDependsOnIds) ? parsed.stepDependsOnIds.filter((item) => typeof item === "string") : void 0,
      stepHandoffKind: typeof parsed.stepHandoffKind === "string" ? parsed.stepHandoffKind : void 0,
      handoffDocumentIds: Array.isArray(parsed.handoffDocumentIds) ? parsed.handoffDocumentIds.filter((item) => typeof item === "string") : void 0,
      handoffDocumentVersionIds: Array.isArray(parsed.handoffDocumentVersionIds) ? parsed.handoffDocumentVersionIds.filter((item) => typeof item === "string") : void 0,
      autoContinuation: parseAutoContinuationPayload(parsed.autoContinuation),
      mentionType: typeof parsed.mentionType === "string" ? parsed.mentionType : void 0,
      mentionedAgentIds: Array.isArray(parsed.mentionedAgentIds) ? parsed.mentionedAgentIds.filter((item) => typeof item === "string") : void 0,
      mentionedAgentLabels: Array.isArray(parsed.mentionedAgentLabels) ? parsed.mentionedAgentLabels.filter((item) => typeof item === "string") : void 0,
      assigneeMentionToken: typeof parsed.assigneeMentionToken === "string" ? parsed.assigneeMentionToken : void 0,
      channelHistory: Array.isArray(parsed.channelHistory) ? parsed.channelHistory.filter(
        (item) => Boolean(item) && typeof item === "object" && typeof item.speaker === "string" && typeof item.summary === "string"
      ).map((item) => ({
        speaker: item.speaker,
        role: typeof item.role === "string" ? item.role : void 0,
        summary: item.summary,
        time: typeof item.time === "string" ? item.time : void 0,
        status: typeof item.status === "string" ? item.status : void 0,
        kind: typeof item.kind === "string" ? item.kind : void 0,
        processType: typeof item.processType === "string" ? item.processType : void 0,
        mentions: Array.isArray(item.mentions) ? item.mentions.filter((entry) => typeof entry === "string") : void 0,
        attachments: Array.isArray(item.attachments) ? item.attachments.filter((entry) => typeof entry === "string") : void 0
      })) : void 0,
      channelHistoryPath: typeof parsed.channelHistoryPath === "string" ? parsed.channelHistoryPath : void 0,
      channelSessionId: typeof parsed.channelSessionId === "string" ? parsed.channelSessionId : void 0,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments.filter(
        (item) => Boolean(item) && typeof item === "object" && typeof item.fileName === "string" && typeof item.storedPath === "string"
      ).map((item) => ({
        fileName: item.fileName,
        storedPath: item.storedPath,
        mediaType: typeof item.mediaType === "string" ? item.mediaType : void 0,
        kind: typeof item.kind === "string" ? item.kind : void 0
      })) : void 0
    };
  } catch {
    return {};
  }
}
function parseAutoContinuationPayload(input) {
  if (!input || typeof input !== "object") {
    return void 0;
  }
  const value = input;
  if (value.mode !== "until" || value.status !== "active" && value.status !== "expired" && value.status !== "stopped" || typeof value.startedAt !== "string" || typeof value.until !== "string" || typeof value.instruction !== "string") {
    return void 0;
  }
  return {
    mode: "until",
    status: value.status,
    startedAt: value.startedAt,
    until: value.until,
    instruction: value.instruction,
    iteration: typeof value.iteration === "number" && Number.isFinite(value.iteration) ? value.iteration : 0,
    lastContinuedAt: typeof value.lastContinuedAt === "string" ? value.lastContinuedAt : void 0
  };
}
function resolveConversationThreadId(input) {
  const isConversationTrigger = input.triggerType === "channel_chat" || input.triggerType === "mention_chat";
  if (!isConversationTrigger && !input.payload.contactId) {
    return void 0;
  }
  return input.payload.channelName ?? input.payload.channel;
}

// src/remote-daemon.ts
async function runRemoteDaemonCommand(subcommand, args) {
  if (subcommand === "start") {
    return runRemoteDaemonStart(args);
  }
  if (subcommand === "stop") {
    return runRemoteDaemonStop(args);
  }
  if (subcommand === "status") {
    return runRemoteDaemonStatus(args);
  }
  if (subcommand === "logs") {
    return runRemoteDaemonLogs(args);
  }
  printRemoteDaemonHelp();
  return subcommand ? 1 : 0;
}
async function runRemoteDaemonForeground(config) {
  if (!config.serverUrl || !config.daemonToken) {
    console.error("Remote daemon mode requires --server-url and --daemon-token.");
    return 1;
  }
  const pidPath = getDaemonPidFilePath(config.stateDir);
  writeFileSync5(pidPath, `${process.pid}
`, "utf8");
  const detected = detectProviders();
  if (detected.length === 0) {
    rmSync5(pidPath, { force: true });
    console.error(
      "No supported provider CLI found. Install `codex`, `claude`, `gemini`, `opencode`, `openclaw`, `nanobot`, or `hermes` and ensure it is on PATH."
    );
    return 1;
  }
  const client = new HttpDaemonClient(config.serverUrl, config.daemonToken);
  const registered = await client.register({
    daemonKey: config.daemonKey,
    deviceName: config.deviceName,
    metadata: readNodeMetadata(config.serverUrl, config.runtimeName),
    runtimes: detected.map((provider) => ({
      provider: provider.provider,
      name: `${config.runtimeName} \xB7 ${provider.label}`,
      version: provider.version,
      deviceInfo: config.deviceName,
      metadata: buildProviderRuntimeMetadata({
        provider: provider.provider,
        metadata: {
          executablePath: provider.executablePath,
          mode: "remote"
        }
      })
    }))
  });
  let runtimes = buildRemoteRuntimeRecords(config, registered, detected);
  if (runtimes.length === 0) {
    rmSync5(pidPath, { force: true });
    console.error("Remote daemon registration returned no runnable runtimes.");
    return 1;
  }
  console.log(`Remote daemon online: ${config.daemonKey}`);
  console.log(`Providers: ${runtimes.map((runtime) => runtime.provider).join(", ")}`);
  const activeRuntimes = /* @__PURE__ */ new Set();
  const heartbeatTimer = setInterval(() => {
    void (async () => {
      try {
        const heartbeat = await client.sendHeartbeatWithMetadata(
          config.daemonKey,
          readNodeMetadata(config.serverUrl ?? "", config.runtimeName, runtimes),
          buildRemoteRuntimeHeartbeatMetadata(runtimes)
        );
        runtimes = reconcileRemoteRuntimesWithHeartbeat(runtimes, heartbeat);
        for (const runtimeId of activeRuntimes) {
          if (!runtimes.some((runtime) => runtime.id === runtimeId)) {
            activeRuntimes.delete(runtimeId);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Heartbeat failed: ${message}`);
      }
    })();
  }, config.heartbeatIntervalMs);
  let polling = false;
  const taskPollTimer = setInterval(() => {
    if (polling) {
      return;
    }
    polling = true;
    void pollRemoteTasks(client, config, runtimes, activeRuntimes).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Remote task polling failed: ${message}`);
    }).finally(() => {
      polling = false;
    });
  }, config.taskPollIntervalMs);
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    void (async () => {
      clearInterval(heartbeatTimer);
      clearInterval(taskPollTimer);
      rmSync5(pidPath, { force: true });
      try {
        await client.deregister(config.daemonKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to deregister remote daemon: ${message}`);
      }
      console.log(`Remote daemon stopped (${signal}).`);
      process.exit(0);
    })();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {
  });
  return 0;
}
function buildRemoteDaemonConfig(flags, options) {
  const environment = options?.environment ?? process.env;
  const hostname = environment.HOSTNAME || environment.COMPUTERNAME || "remote-daemon";
  return {
    stateDir: getStringFlag(flags, "state-dir")?.trim() || environment.AGENT_SPACE_DAEMON_STATE_DIR?.trim() || options?.defaultStateDir || resolveDefaultDaemonStateDir(environment),
    daemonKey: getStringFlag(flags, "daemon-id")?.trim() || environment.AGENT_SPACE_DAEMON_ID?.trim() || hostname,
    deviceName: getStringFlag(flags, "device-name")?.trim() || environment.AGENT_SPACE_DEVICE_NAME?.trim() || hostname,
    runtimeName: getStringFlag(flags, "runtime-name")?.trim() || environment.AGENT_SPACE_RUNTIME_NAME?.trim() || "Remote Agent",
    heartbeatIntervalMs: Math.max(
      1e3,
      Number(
        getStringFlag(flags, "heartbeat-interval") ?? environment.AGENT_SPACE_HEARTBEAT_INTERVAL ?? DEFAULT_HEARTBEAT_INTERVAL_MS
      )
    ),
    taskPollIntervalMs: Math.max(
      1e3,
      Number(
        getStringFlag(flags, "poll-interval") ?? environment.AGENT_SPACE_TASK_POLL_INTERVAL ?? DEFAULT_TASK_POLL_INTERVAL_MS
      )
    ),
    taskTimeoutMs: Math.max(
      1e3,
      Number(
        getStringFlag(flags, "task-timeout") ?? environment.AGENT_SPACE_TASK_TIMEOUT_MS ?? 12 * 60 * 60 * 1e3
      )
    ),
    serverUrl: getStringFlag(flags, "server-url")?.trim() || environment.AGENT_SPACE_SERVER_URL?.trim(),
    daemonToken: getStringFlag(flags, "daemon-token")?.trim() || environment.AGENT_SPACE_DAEMON_TOKEN?.trim()
  };
}
function printRemoteDaemonHelp() {
  console.log(`agent-space-daemon

Usage:
  agent-space-daemon start [--foreground] [--server-url <url>] [--daemon-token <token>] [--daemon-id <id>] [--device-name <name>] [--runtime-name <label>] [--heartbeat-interval <ms>] [--poll-interval <ms>] [--task-timeout <ms>] [--state-dir <dir>]
  agent-space-daemon stop [--state-dir <dir>]
  agent-space-daemon status [--json] [--state-dir <dir>]
  agent-space-daemon logs [--lines <n>] [--follow] [--state-dir <dir>]

Environment:
  AGENT_SPACE_SERVER_URL
  AGENT_SPACE_DAEMON_TOKEN
  AGENT_SPACE_DAEMON_ID
  AGENT_SPACE_DEVICE_NAME
  AGENT_SPACE_RUNTIME_NAME
  AGENT_SPACE_DAEMON_STATE_DIR
  AGENT_SPACE_HEARTBEAT_INTERVAL
  AGENT_SPACE_TASK_POLL_INTERVAL
  AGENT_SPACE_TASK_TIMEOUT_MS

Examples:
  agent-space-daemon start --foreground --server-url https://agentspace.example --daemon-token adt_xxx
  agent-space-daemon status --json
  agent-space-daemon logs --follow`);
}
async function runRemoteDaemonStart(args) {
  const parsed = parseArgs(args);
  const config = buildRemoteDaemonConfig(parsed.flags);
  if (parsed.flags.foreground === true) {
    return runRemoteDaemonForeground(config);
  }
  const pidPath = getDaemonPidFilePath(config.stateDir);
  const logPath = getDaemonLogFilePath(config.stateDir);
  const existingPid = readPidIfRunning(pidPath);
  if (existingPid) {
    console.error(`Remote daemon is already running (pid ${existingPid}).`);
    return 1;
  }
  const logFd = openDaemonLogFile(logPath);
  const relaunch = buildRemoteDaemonRelaunchCommand(config);
  const child = spawn5(relaunch.command, relaunch.args, {
    cwd: config.stateDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env
  });
  child.unref();
  if (!child.pid) {
    console.error("Failed to start remote daemon process.");
    return 1;
  }
  writeFileSync5(pidPath, `${child.pid}
`, "utf8");
  await sleep2(750);
  if (!readPidIfRunning(pidPath)) {
    rmSync5(pidPath, { force: true });
    console.error("Remote daemon process exited immediately. Check logs:");
    console.error(`  ${logPath}`);
    return 1;
  }
  console.log(`Remote daemon started (pid ${child.pid}).`);
  console.log(`State: ${config.stateDir}`);
  console.log(`Logs: ${logPath}`);
  return 0;
}
function buildRemoteDaemonRelaunchCommand(config, options) {
  const entryPath = resolveRemoteDaemonRelaunchEntryPath(options?.argv ?? process.argv);
  const args = [
    ...buildNodeEntryArgs(entryPath),
    "start",
    "--foreground",
    "--state-dir",
    config.stateDir,
    "--daemon-id",
    config.daemonKey,
    "--device-name",
    config.deviceName,
    "--runtime-name",
    config.runtimeName,
    "--heartbeat-interval",
    String(config.heartbeatIntervalMs),
    "--poll-interval",
    String(config.taskPollIntervalMs),
    "--task-timeout",
    String(config.taskTimeoutMs)
  ];
  if (config.serverUrl) {
    args.push("--server-url", config.serverUrl);
  }
  if (config.daemonToken) {
    args.push("--daemon-token", config.daemonToken);
  }
  return {
    command: options?.execPath ?? process.execPath,
    args
  };
}
function buildNodeEntryArgs(entryPath) {
  return entryPath.endsWith(".ts") ? ["--experimental-strip-types", entryPath] : [entryPath];
}
function resolveRemoteDaemonRelaunchEntryPath(argv) {
  const invokedPath = argv[1]?.trim();
  if (invokedPath) {
    return resolve10(invokedPath);
  }
  return getStandaloneCliEntryPath();
}
async function runRemoteDaemonStop(args) {
  const parsed = parseArgs(args);
  const stateDir = resolveStateDir(parsed.flags);
  const pidPath = getDaemonPidFilePath(stateDir);
  const pid = readPidIfRunning(pidPath);
  if (!pid) {
    cleanupStalePidFile(pidPath);
    console.error("Remote daemon is not running.");
    return 1;
  }
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 5e3;
  while (Date.now() < deadline) {
    if (!readPidIfRunning(pidPath)) {
      rmSync5(pidPath, { force: true });
      console.log(`Remote daemon stopped (pid ${pid}).`);
      return 0;
    }
    await sleep2(100);
  }
  console.error(`Timed out waiting for remote daemon ${pid} to stop.`);
  return 1;
}
function runRemoteDaemonStatus(args) {
  const parsed = parseArgs(args);
  const stateDir = resolveStateDir(parsed.flags);
  const summary = buildDaemonStatusSummary(stateDir);
  if (parsed.flags.json === true) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }
  console.log(renderDaemonSummary(summary));
  return 0;
}
async function runRemoteDaemonLogs(args) {
  const parsed = parseArgs(args);
  const follow = parsed.flags.follow === true;
  const stateDir = resolveStateDir(parsed.flags);
  const linesRaw = getStringFlag(parsed.flags, "lines");
  const lines = linesRaw ? Number(linesRaw) : DEFAULT_LOG_LINES;
  const logPath = getDaemonLogFilePath(stateDir);
  if (!existsSync9(logPath)) {
    console.error(`No daemon log file at ${logPath}.`);
    return 1;
  }
  const initial = readLastLines(logPath, Number.isFinite(lines) && lines > 0 ? lines : DEFAULT_LOG_LINES);
  if (initial.length > 0) {
    process.stdout.write(`${initial.join("\n")}
`);
  }
  if (!follow) {
    return 0;
  }
  let position = statSync4(logPath).size;
  const poll = setInterval(() => {
    const size = statSync4(logPath).size;
    if (size <= position) {
      return;
    }
    const next = createReadStream(logPath, { encoding: "utf8", start: position, end: size - 1 });
    next.on("data", (chunk) => {
      position += Buffer.byteLength(chunk);
      process.stdout.write(chunk);
    });
  }, 1e3);
  await new Promise((resolve11) => {
    const stop = () => {
      clearInterval(poll);
      resolve11();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}
async function pollRemoteTasks(client, config, runtimes, activeRuntimes) {
  for (const runtime of runtimes) {
    if (activeRuntimes.has(runtime.id)) {
      continue;
    }
    const appOperation = await client.claimRuntimeAppOperation(runtime.id);
    if (appOperation.operation) {
      activeRuntimes.add(runtime.id);
      void executeRemoteRuntimeAppOperation(client, appOperation.operation).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Runtime app operation ${appOperation.operation?.id ?? "unknown"} crashed: ${message}`);
      }).finally(() => {
        activeRuntimes.delete(runtime.id);
      });
      continue;
    }
    const claimed = await client.claimTask(runtime.id);
    if (!claimed.task) {
      continue;
    }
    activeRuntimes.add(runtime.id);
    void executeRemoteTask(client, config, runtime, claimed.task).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Remote task ${claimed.task?.id ?? "unknown"} crashed: ${message}`);
    }).finally(() => {
      activeRuntimes.delete(runtime.id);
    });
  }
}
async function executeRemoteRuntimeAppOperation(client, operation) {
  await client.startRuntimeAppOperation(operation.id);
  const plan = parseRuntimeAppInstallPlan(operation.commandPlan);
  if (!plan) {
    await client.failRuntimeAppOperation(operation.id, {
      errorCode: "runtime_app.invalid_plan",
      errorMessage: "Runtime app operation command plan is invalid."
    });
    return;
  }
  try {
    const result = await executeRuntimeAppPlan(plan);
    await client.completeRuntimeAppOperation(operation.id, {
      safeStdoutTail: result.safeStdoutTail,
      safeStderrTail: result.safeStderrTail,
      installedApp: {
        displayName: plan.app.name,
        version: plan.app.version,
        entryPoint: plan.app.entryPoint,
        installStrategy: plan.strategy,
        metadataJson: JSON.stringify({
          verifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
          strategy: plan.strategy
        })
      }
    });
  } catch (error) {
    await client.failRuntimeAppOperation(operation.id, {
      safeStdoutTail: readErrorTail(error, "stdout"),
      safeStderrTail: readErrorTail(error, "stderr"),
      errorCode: "runtime_app.command_failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}
async function executeRemoteTask(client, config, runtime, task) {
  const workDir = resolveRemoteTaskWorkDir(config, task);
  const isPersistentConversationWorkspace = isConversationScopedRemoteTask(task);
  if (!isPersistentConversationWorkspace) {
    rmSync5(workDir, { recursive: true, force: true });
  }
  mkdirSync5(workDir, { recursive: true });
  try {
    await client.startTask(task.id);
    const bundle = await client.getInputBundle(task.id);
    materializeInputBundle(workDir, bundle);
    const result = await runProviderTask(
      runtime,
      bundle.prompt,
      workDir,
      {
        sessionId: bundle.metadata.routerSession?.providerSessionId ?? resolveRemoteTaskProviderSessionId(task.inputJson),
        taskTimeoutMs: config.taskTimeoutMs,
        contextEnv: buildRuntimeContextEnv({
          AGENT_SPACE_CONTEXT_TASK_ID: task.id,
          AGENT_SPACE_CONTEXT_AGENT_NAME: readRemoteTaskAgentName(task),
          AGENT_SPACE_CONTEXT_TRIGGER_TYPE: task.triggerType
        }, bundle.metadata.googleWorkspace),
        runtimeApps: bundle.metadata.runtimeApps?.apps ?? [],
        runtimeToolCapabilities: bundle.metadata.runtimeToolCapabilities?.capabilities ?? [],
        onEvent: (event) => {
          void client.reportMessages(task.id, { messages: [event] }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to report remote task message for ${task.id}: ${message}`);
          });
        },
        onApprovalRequest: (request) => waitForRuntimeApproval(client, task.id, request)
      }
    );
    const preparedSkillImports = prepareSkillImportOperationArtifacts(workDir);
    for (const warning of preparedSkillImports.warnings) {
      await client.reportMessages(task.id, { messages: [{ type: "status", content: warning }] }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to report skill import warning for ${task.id}: ${message}`);
      });
    }
    const outputBundle = collectRuntimeOutputBundle(workDir);
    if (outputBundle) {
      await client.uploadOutputBundle(task.id, outputBundle);
    }
    await client.completeTask(task.id, {
      outputText: result.output,
      sessionId: result.sessionId,
      workDir
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureMetadata = readProviderTaskFailureMetadata(error);
    const providerError = failureMetadata?.providerError;
    await client.failTask(task.id, {
      errorText: message,
      errorCode: providerError?.code,
      errorCategory: normalizeProviderTaskErrorCategory(providerError?.category),
      provider: providerError?.provider,
      rawProviderMessage: providerError?.rawProviderMessage,
      sessionId: failureMetadata?.sessionId,
      workDir: failureMetadata?.workDir ?? workDir
    });
  } finally {
    clearTaskOutputArtifacts(workDir);
    if (!isPersistentConversationWorkspace) {
      rmSync5(workDir, { recursive: true, force: true });
    }
  }
}
function buildRuntimeContextEnv(base, googleWorkspace) {
  if (googleWorkspace?.status !== "available" || !googleWorkspace.env) {
    return base;
  }
  return {
    ...base,
    ...googleWorkspace.env
  };
}
function buildRemoteRuntimeRecords(config, registered, detected) {
  return registered.runtimes.flatMap((runtime) => {
    const detectedProvider = detected.find((provider) => provider.provider === runtime.provider);
    if (!detectedProvider) {
      return [];
    }
    return [{
      id: runtime.id,
      workspaceId: registered.daemon.workspaceId,
      provider: detectedProvider.provider,
      name: runtime.name,
      version: detectedProvider.version,
      status: runtime.status,
      deviceInfo: config.deviceName,
      metadata: {
        executablePath: detectedProvider.executablePath,
        mode: "remote",
        ...buildProviderRuntimeMetadata({
          provider: detectedProvider.provider,
          metadata: {
            executablePath: detectedProvider.executablePath,
            mode: "remote"
          }
        })
      }
    }];
  });
}
function reconcileRemoteRuntimesWithHeartbeat(current, heartbeat) {
  const heartbeatRuntimeById = new Map(heartbeat.runtimes.map((runtime) => [runtime.id, runtime]));
  return current.flatMap((runtime) => {
    const heartbeatRuntime = heartbeatRuntimeById.get(runtime.id);
    if (!heartbeatRuntime) {
      return [];
    }
    return [{
      ...runtime,
      status: heartbeatRuntime.status,
      metadata: {
        ...runtime.metadata,
        ...heartbeatRuntime.metadata ?? {}
      }
    }];
  });
}
function buildRemoteRuntimeHeartbeatMetadata(runtimes) {
  return runtimes.map((runtime) => ({
    id: runtime.id,
    provider: runtime.provider,
    metadata: buildProviderRuntimeMetadata(runtime)
  }));
}
function resolveStateDir(flags) {
  return buildRemoteDaemonConfig(flags).stateDir;
}
function buildDaemonStatusSummary(stateDir) {
  const pidPath = getDaemonPidFilePath(stateDir);
  const logPath = getDaemonLogFilePath(stateDir);
  const pid = readPidIfRunning(pidPath);
  return {
    running: Boolean(pid),
    pid: pid ?? "",
    pidFile: pidPath,
    logFile: logPath,
    stateDir
  };
}
async function waitForRuntimeApproval(client, taskId, request) {
  const created = await client.createRuntimeApproval(taskId, {
    provider: request.provider,
    runtimeId: request.runtimeId,
    sessionId: request.sessionId,
    toolName: request.toolName,
    toolInput: request.toolInput,
    contentPreview: request.contentPreview
  });
  await client.reportMessages(taskId, {
    messages: [{
      type: "status",
      content: `\u7B49\u5F85\u524D\u7AEF\u5BA1\u6279\u5DE5\u5177\u8C03\u7528\uFF1A${request.contentPreview}`
    }]
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to report approval wait message for ${taskId}: ${message}`);
  });
  while (true) {
    const current = await client.getRuntimeApproval(taskId, created.approval.approvalId);
    if (current.approval.status === "approved") {
      return {
        decision: "approved",
        comment: current.approval.reviewerComment
      };
    }
    if (current.approval.status === "rejected") {
      return {
        decision: "rejected",
        comment: current.approval.reviewerComment
      };
    }
    await sleep2(1e3);
  }
}
function sleep2(ms) {
  return new Promise((resolve11) => setTimeout(resolve11, ms));
}
function readErrorTail(error, key) {
  if (!error || typeof error !== "object") {
    return void 0;
  }
  const value = error[key];
  return typeof value === "string" ? tailAndRedact(value) : void 0;
}
function resolveRemoteTaskWorkDir(config, task) {
  const payload = parseTaskInputJson(task.inputJson);
  const channelThreadId = resolveConversationThreadId({
    triggerType: task.triggerType,
    payload
  });
  if (channelThreadId) {
    return getDaemonChannelWorkDirPath(config.stateDir, {
      workspaceId: task.workspaceId,
      threadId: channelThreadId,
      agentId: task.agentId
    });
  }
  return getDaemonTaskWorkDirPath(config.stateDir, {
    workspaceId: task.workspaceId,
    taskId: task.id
  });
}
function isConversationScopedRemoteTask(task) {
  const payload = parseTaskInputJson(task.inputJson);
  return Boolean(resolveConversationThreadId({
    triggerType: task.triggerType,
    payload
  }));
}
function resolveRemoteTaskProviderSessionId(inputJson) {
  const sessionId = parseTaskInputJson(inputJson).channelSessionId?.trim();
  return sessionId || void 0;
}
function readRemoteTaskAgentName(task) {
  return parseTaskInputJson(task.inputJson).assignee?.trim() || task.agentId;
}

// src/cli.ts
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    printRemoteDaemonHelp();
    return 0;
  }
  if (args[0] === "--version" || args[0] === "version") {
    console.log("0.1.3");
    return 0;
  }
  const [command, ...restArgs] = args;
  return runRemoteDaemonCommand(command, restArgs);
}
var isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  main().then((code) => {
    process.exit(code);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
export {
  main
};
