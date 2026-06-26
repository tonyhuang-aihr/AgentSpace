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
  return new Promise((resolve20) => setTimeout(resolve20, ms));
}

// src/document-runtime-capabilities.ts
function buildDocumentRuntimeToolCapabilities(agentDocumentContexts, options) {
  const hasReadableGoogleWorkspaceDocument = agentDocumentContexts.some(
    ({ document, allowedActions }) => allowedActions.includes("view") && document.storageMode === "external" && document.externalProvider === "google_workspace"
  );
  const hasWritableGoogleSheet = agentDocumentContexts.some(
    ({ document, allowedActions }) => allowedActions.includes("edit") && document.kind === "sheet" && document.storageMode === "external" && document.externalProvider === "google_workspace"
  );
  const hasForwardableGoogleSheet = agentDocumentContexts.some(
    ({ document, allowedActions }) => allowedActions.includes("forward") && document.kind === "sheet" && document.storageMode === "external" && document.externalProvider === "google_workspace"
  );
  const hasWritableGoogleDoc = agentDocumentContexts.some(
    ({ document, allowedActions }) => allowedActions.includes("edit") && document.kind === "document" && document.storageMode === "external" && document.externalProvider === "google_workspace"
  );
  const hasEditableDocument = agentDocumentContexts.some(({ allowedActions }) => allowedActions.includes("edit"));
  const capabilities = [
    {
      id: "document-permission:agent-space-output",
      command: "agent-space",
      displayName: "AgentSpace document output permission",
      allowedShellPatterns: [
        "agent-space output text *",
        "agent-space output attach *",
        "agent-space output validate *",
        "agent-space output preview *",
        "agent-space output permission request-document *",
        ...hasEditableDocument ? [
          "agent-space output document upsert *",
          "agent-space output document replace-block *",
          "agent-space output document insert-after *",
          "agent-space output document delete-block *"
        ] : [],
        ...hasReadableGoogleWorkspaceDocument ? ["agent-space output sheets-result add *"] : [],
        ...hasForwardableGoogleSheet ? ["agent-space output external-document link-google-sheet *"] : [],
        ...options?.canCreateGoogleSheet ? ["agent-space output external-document create-google-sheet *"] : [],
        ...hasWritableGoogleDoc ? ["agent-space output google-docs *"] : []
      ],
      source: "workspace"
    }
  ];
  if (hasReadableGoogleWorkspaceDocument || options?.canCreateGoogleSheet) {
    capabilities.push({
      id: "document-permission:google-workspace",
      command: "gws",
      displayName: "Google Workspace document permission",
      allowedShellPatterns: [
        ...hasReadableGoogleWorkspaceDocument ? [
          "gws sheets spreadsheets values get *",
          "gws drive files get *"
        ] : [],
        "gws --version",
        ...options?.canCreateGoogleSheet ? ["gws drive files create *"] : [],
        ...hasWritableGoogleSheet ? [
          "gws sheets spreadsheets values append *",
          "gws sheets spreadsheets values update *",
          "gws sheets spreadsheets batchUpdate *",
          "gws sheets spreadsheets batch-update *"
        ] : []
      ],
      source: "workspace"
    });
  }
  return capabilities;
}

// src/document-runtime-output.ts
import { copyFileSync as copyFileSync2, existsSync as existsSync7, mkdirSync as mkdirSync6, readFileSync as readFileSync5, statSync as statSync4 } from "node:fs";
import { basename as basename5, join as join11, resolve as resolve8 } from "node:path";

// ../db/src/database.ts
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync as existsSync2, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join as join2, resolve as resolve2 } from "node:path";
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

// ../db/src/postgres-schema.ts
var POSTGRES_SCHEMA_VERSION = "18";
function getPostgresSchemaStatements() {
  return [
    `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        archived_at TIMESTAMPTZ,
        join_code TEXT,
        join_code_updated_at TIMESTAMPTZ,
        join_code_updated_by TEXT
      )
    `,
    `
      ALTER TABLE workspace
        ADD COLUMN IF NOT EXISTS join_code TEXT
    `,
    `
      ALTER TABLE workspace
        ADD COLUMN IF NOT EXISTS join_code_updated_at TIMESTAMPTZ
    `,
    `
      ALTER TABLE workspace
        ADD COLUMN IF NOT EXISTS join_code_updated_by TEXT
    `,
    `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        primary_email TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_login_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS auth_identity (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        email TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(provider, provider_subject)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        revoked_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_membership (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        joined_at TIMESTAMPTZ NOT NULL,
        invited_by TEXT,
        UNIQUE(workspace_id, user_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_invitation (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        invited_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS google_oauth_credential (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        google_subject TEXT,
        google_email TEXT,
        scopes TEXT NOT NULL,
        access_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        expires_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        UNIQUE(workspace_id, user_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_google_workspace_delegation (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        employee_name TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        google_oauth_credential_id TEXT NOT NULL REFERENCES google_oauth_credential(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        scopes TEXT NOT NULL,
        google_email TEXT,
        granted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        UNIQUE(workspace_id, employee_name, user_id)
      )
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.legacy_workspace') IS NOT NULL
          AND to_regclass('public.workspace_snapshot') IS NULL THEN
          ALTER TABLE legacy_workspace RENAME TO workspace_snapshot;
        END IF;
      END $$;
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_snapshot (
        id TEXT PRIMARY KEY,
        organization_name TEXT NOT NULL,
        pending_handoffs INTEGER NOT NULL DEFAULT 0,
        state_json JSONB NOT NULL,
        state_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_channel (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'group',
        human_member_names_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        human_member_count INTEGER NOT NULL DEFAULT 0,
        employee_names_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(workspace_id, name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS channel_participant (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        added_by TEXT,
        joined_at TIMESTAMPTZ NOT NULL,
        removed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (workspace_id, channel_name)
          REFERENCES workspace_channel(workspace_id, name)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        UNIQUE(workspace_id, channel_name, user_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS channel_access_request (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        note TEXT,
        FOREIGN KEY (workspace_id, channel_name)
          REFERENCES workspace_channel(workspace_id, name)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS channel_invitation (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        invitee_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        invitee_email TEXT,
        invited_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        responded_at TIMESTAMPTZ,
        responded_by TEXT,
        FOREIGN KEY (workspace_id, channel_name)
          REFERENCES workspace_channel(workspace_id, name)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_employee (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Agent',
        remark_name TEXT,
        origin TEXT NOT NULL DEFAULT 'manual',
        summary TEXT NOT NULL DEFAULT '',
        traits_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        fit TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        instructions TEXT NOT NULL DEFAULT '',
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        channel_member_access TEXT NOT NULL DEFAULT 'disabled',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_fork_invitation (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        source_agent_name TEXT NOT NULL,
        target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        options_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        accepted_agent_name TEXT,
        accepted_runtime_id TEXT
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_fork_snapshot (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        invitation_id TEXT NOT NULL REFERENCES agent_fork_invitation(id) ON DELETE CASCADE,
        source_agent_name TEXT NOT NULL,
        snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      ALTER TABLE workspace_employee
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    `,
    `
      ALTER TABLE workspace_employee
        ADD COLUMN IF NOT EXISTS channel_member_access TEXT NOT NULL DEFAULT 'disabled'
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_task (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        assignee TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        sort_order INTEGER,
        labels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS daemon_connection (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        daemon_key TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'offline',
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_heartbeat_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS daemon_api_token (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT '',
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL DEFAULT '',
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_runtime (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        daemon_connection_id TEXT REFERENCES daemon_connection(id) ON DELETE SET NULL,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'offline',
        device_info TEXT NOT NULL DEFAULT '',
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        connected_at TIMESTAMPTZ,
        last_heartbeat_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_runtime_display_name (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, runtime_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_runtime_grant (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission TEXT NOT NULL DEFAULT 'use',
        status TEXT NOT NULL DEFAULT 'active',
        granted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        UNIQUE(workspace_id, runtime_id, user_id, permission)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS document_agent_access (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL,
        subject_type TEXT NOT NULL DEFAULT 'agent',
        subject_id TEXT NOT NULL,
        role TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'document',
        granted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        UNIQUE(workspace_id, document_id, subject_type, subject_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS document_permission_request (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        document_id TEXT,
        external_provider TEXT,
        external_file_id TEXT,
        external_url TEXT,
        requested_role TEXT NOT NULL,
        requested_by_agent_name TEXT NOT NULL,
        requested_for_channel_name TEXT,
        triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        decision_note TEXT,
        source_task_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        decided_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_access_request (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        source_agent_name TEXT NOT NULL,
        requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_type TEXT NOT NULL,
        target_channel_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT NOT NULL DEFAULT '',
        resolver_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        fork_invitation_id TEXT REFERENCES agent_fork_invitation(id) ON DELETE SET NULL,
        audit_data_json JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workspace_notification (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        actor_type TEXT,
        actor_id TEXT,
        type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        channel_name TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action_href TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'unread',
        dedupe_key TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        read_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS employee_runtime_binding (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        employee_name TEXT NOT NULL,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, employee_name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS runtime_app_catalog_item (
        source TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        entry_point TEXT NOT NULL DEFAULT '',
        install_strategy TEXT NOT NULL DEFAULT '',
        install_cmd TEXT,
        uninstall_cmd TEXT,
        update_cmd TEXT,
        skill_md TEXT,
        requires_text TEXT,
        homepage TEXT,
        registry_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        synced_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (source, name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS runtime_installed_app (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        entry_point TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        install_strategy TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        installed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL,
        last_checked_at TIMESTAMPTZ,
        last_error TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE(workspace_id, runtime_id, source, name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS runtime_app_operation (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        app_source TEXT NOT NULL,
        app_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        command_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        safe_stdout_tail TEXT,
        safe_stderr_tail TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS skill (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_url TEXT,
        config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(workspace_id, name)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS skill_file (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(skill_id, path)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS runtime_app_skill_binding (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        runtime_app_id TEXT NOT NULL REFERENCES runtime_installed_app(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, runtime_app_id, skill_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS skill_import_event (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        skill_id TEXT REFERENCES skill(id) ON DELETE SET NULL,
        skill_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_url TEXT,
        import_mode TEXT NOT NULL DEFAULT 'created',
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        imported_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_skill (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        agent_id TEXT,
        employee_name TEXT NOT NULL,
        skill_id TEXT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, employee_name, skill_id)
      )
    `,
    `
      ALTER TABLE agent_skill
      ADD COLUMN IF NOT EXISTS agent_id TEXT
    `,
    `
      CREATE TABLE IF NOT EXISTS knowledge_page_assignment_policy (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        knowledge_page_id TEXT NOT NULL,
        assignment_mode TEXT NOT NULL DEFAULT 'all_agents',
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (workspace_id, knowledge_page_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_knowledge_page (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        agent_id TEXT,
        employee_name TEXT NOT NULL,
        knowledge_page_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        created_by TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (workspace_id, employee_name, knowledge_page_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS knowledge_proposal (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        source_task_queue_id TEXT NOT NULL,
        source_channel_name TEXT,
        source_agent_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        title TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        summary TEXT,
        reason TEXT,
        tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        parent_id TEXT,
        assignment_mode TEXT NOT NULL DEFAULT 'selected_agents',
        assigned_employee_names_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        target_knowledge_page_id TEXT,
        base_updated_at TIMESTAMPTZ,
        created_knowledge_page_id TEXT,
        approval_id TEXT,
        decided_by_user_id TEXT,
        decided_at TIMESTAMPTZ,
        reviewer_comment TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_task_queue (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        router_session_id TEXT,
        issue_id TEXT,
        trigger_type TEXT NOT NULL DEFAULT 'manual',
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        requested_by_user_id TEXT,
        requested_by_display_name TEXT,
        result_json JSONB,
        error_text TEXT,
        session_id TEXT,
        work_dir TEXT,
        queued_at TIMESTAMPTZ NOT NULL,
        claimed_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_router_session (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        conversation_key TEXT,
        source_type TEXT NOT NULL DEFAULT 'task',
        status TEXT NOT NULL DEFAULT 'active',
        title TEXT,
        summary TEXT,
        memory_summary TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ,
        UNIQUE(workspace_id, agent_id, conversation_key)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_router_provider_session (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        router_session_id TEXT NOT NULL REFERENCES agent_router_session(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        last_used_at TIMESTAMPTZ,
        last_error TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(workspace_id, router_session_id, runtime_id, provider)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_task_attempt (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        task_queue_id TEXT NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
        router_session_id TEXT NOT NULL REFERENCES agent_router_session(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_session_id TEXT,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        error_text TEXT,
        handoff_snapshot_id TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_router_event (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        router_session_id TEXT NOT NULL REFERENCES agent_router_session(id) ON DELETE CASCADE,
        task_queue_id TEXT REFERENCES agent_task_queue(id) ON DELETE SET NULL,
        attempt_id TEXT REFERENCES agent_task_attempt(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        runtime_id TEXT,
        provider TEXT,
        summary TEXT,
        data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_router_context_snapshot (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        router_session_id TEXT NOT NULL REFERENCES agent_router_session(id) ON DELETE CASCADE,
        task_queue_id TEXT REFERENCES agent_task_queue(id) ON DELETE SET NULL,
        snapshot_type TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        source_event_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      ALTER TABLE agent_task_queue
        ADD COLUMN IF NOT EXISTS requested_by_user_id TEXT
    `,
    `
      ALTER TABLE agent_task_queue
        ADD COLUMN IF NOT EXISTS requested_by_display_name TEXT
    `,
    `
      ALTER TABLE agent_task_queue
        ADD COLUMN IF NOT EXISTS router_session_id TEXT
    `,
    `
      CREATE TABLE IF NOT EXISTS task_execution_event (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
        channel_name TEXT NOT NULL DEFAULT '',
        agent_id TEXT NOT NULL,
        runtime_id TEXT,
        run_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT,
        data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS task_message (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        tool TEXT,
        content TEXT,
        input_json JSONB,
        output TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS model_pricing (
        model_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        input_per_1m DOUBLE PRECISION NOT NULL,
        output_per_1m DOUBLE PRECISION NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        task_queue_id TEXT NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        channel_name TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS budget (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        limit_usd DOUBLE PRECISION NOT NULL,
        period TEXT NOT NULL DEFAULT 'monthly',
        action TEXT NOT NULL DEFAULT 'warn',
        warning_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.8,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS attachment (
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        message_id TEXT,
        channel_name TEXT,
        speaker TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        stored_path TEXT NOT NULL,
        storage_provider TEXT NOT NULL DEFAULT 'local',
        storage_bucket TEXT,
        storage_region TEXT,
        storage_endpoint TEXT,
        storage_key TEXT,
        storage_url TEXT,
        sha256 TEXT,
        source_message_time TEXT,
        source_message_index INTEGER NOT NULL DEFAULT 0,
        source_summary TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (workspace_id, id)
      )
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local'
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_bucket TEXT
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_region TEXT
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_endpoint TEXT
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_key TEXT
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS storage_url TEXT
    `,
    `
      ALTER TABLE attachment
        ADD COLUMN IF NOT EXISTS sha256 TEXT
    `,
    `
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        note TEXT NOT NULL,
        code TEXT,
        data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        source TEXT NOT NULL DEFAULT 'workspace_snapshot_ledger',
        source_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_slug
        ON workspace(slug)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_membership_user
        ON workspace_membership(user_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_membership_workspace
        ON workspace_membership(workspace_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_invitation_workspace_status
        ON workspace_invitation(workspace_id, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_invitation_email
        ON workspace_invitation(workspace_id, email, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_google_oauth_credential_workspace_user
        ON google_oauth_credential(workspace_id, user_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_google_workspace_delegation_agent
        ON agent_google_workspace_delegation(workspace_id, employee_name, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_channel_workspace
        ON workspace_channel(workspace_id, name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_participant_channel_status
        ON channel_participant(workspace_id, channel_name, status, joined_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_participant_user_status
        ON channel_participant(workspace_id, user_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_access_request_channel_status
        ON channel_access_request(workspace_id, channel_name, status, requested_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_access_request_user_status
        ON channel_access_request(workspace_id, user_id, status)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_access_request_pending_user
        ON channel_access_request(workspace_id, channel_name, user_id)
        WHERE status = 'pending'
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_invitation_channel_status
        ON channel_invitation(workspace_id, channel_name, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_invitation_user_status
        ON channel_invitation(workspace_id, invitee_user_id, status)
        WHERE invitee_user_id IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_invitation_pending_user
        ON channel_invitation(workspace_id, channel_name, invitee_user_id)
        WHERE status = 'pending' AND invitee_user_id IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_channel_invitation_email_status
        ON channel_invitation(workspace_id, invitee_email, status)
        WHERE invitee_email IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_invitation_pending_email
        ON channel_invitation(workspace_id, channel_name, invitee_email)
        WHERE status = 'pending' AND invitee_email IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_employee_workspace
        ON workspace_employee(workspace_id, name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_fork_invitation_target_status
        ON agent_fork_invitation(workspace_id, target_user_id, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_fork_invitation_source_status
        ON agent_fork_invitation(workspace_id, source_agent_name, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_fork_invitation_creator_status
        ON agent_fork_invitation(workspace_id, created_by_user_id, status, created_at DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_fork_invitation_pending_unique
        ON agent_fork_invitation(workspace_id, source_agent_name, target_user_id)
        WHERE status = 'pending'
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_fork_snapshot_invitation
        ON agent_fork_snapshot(workspace_id, invitation_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_task_workspace
        ON workspace_task(workspace_id, status, updated_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_auth_identity_user
        ON auth_identity(user_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_session_user
        ON session(user_id)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runtime_workspace_daemon_provider
        ON agent_runtime(workspace_id, daemon_connection_id, provider)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_runtime_status
        ON agent_runtime(workspace_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_daemon_api_token_workspace
        ON daemon_api_token(workspace_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_runtime_grant_user
        ON workspace_runtime_grant(workspace_id, user_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_runtime_grant_runtime
        ON workspace_runtime_grant(workspace_id, runtime_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_document_agent_access_subject
        ON document_agent_access(workspace_id, subject_type, subject_id, revoked_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_document_agent_access_document
        ON document_agent_access(workspace_id, document_id, revoked_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_document_permission_request_workspace_status
        ON document_permission_request(workspace_id, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_document_permission_request_agent
        ON document_permission_request(workspace_id, requested_by_agent_name, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_access_request_source_status
        ON agent_access_request(workspace_id, source_agent_name, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_access_request_requester_status
        ON agent_access_request(workspace_id, requester_user_id, status, created_at DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_access_request_pending_unique
        ON agent_access_request(workspace_id, source_agent_name, requester_user_id, request_type, COALESCE(target_channel_name, ''))
        WHERE status = 'pending'
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_notification_recipient_status_created
        ON workspace_notification(workspace_id, recipient_type, recipient_id, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_workspace_notification_resource
        ON workspace_notification(workspace_id, resource_type, resource_id, created_at DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_notification_dedupe
        ON workspace_notification(workspace_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_document_permission_request_pending_agent_document
        ON document_permission_request(workspace_id, requested_by_agent_name, requested_role, document_id, requested_for_channel_name)
        WHERE status = 'pending' AND document_id IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_document_permission_request_pending_agent_external
        ON document_permission_request(workspace_id, requested_by_agent_name, requested_role, external_provider, external_file_id, requested_for_channel_name)
        WHERE status = 'pending' AND external_file_id IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_employee_runtime_binding_runtime
        ON employee_runtime_binding(runtime_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_runtime_app_catalog_category
        ON runtime_app_catalog_item(source, category, name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_runtime_installed_app_runtime
        ON runtime_installed_app(workspace_id, runtime_id, status)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_runtime_app_operation_runtime_status
        ON runtime_app_operation(workspace_id, runtime_id, status, created_at ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_runtime_app_operation_app
        ON runtime_app_operation(workspace_id, app_source, app_name, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_runtime_app_skill_binding_skill
        ON runtime_app_skill_binding(workspace_id, skill_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_skill_workspace_name
        ON skill(workspace_id, name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_skill_file_skill
        ON skill_file(skill_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_skill_import_event_workspace_imported
        ON skill_import_event(workspace_id, imported_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_skill_employee
        ON agent_skill(workspace_id, employee_name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_knowledge_assignment_policy_page
        ON knowledge_page_assignment_policy(workspace_id, knowledge_page_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_knowledge_page_employee
        ON agent_knowledge_page(workspace_id, employee_name)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_knowledge_page_page
        ON agent_knowledge_page(workspace_id, knowledge_page_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_knowledge_proposal_workspace_status_created
        ON knowledge_proposal(workspace_id, status, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_knowledge_proposal_source_task
        ON knowledge_proposal(workspace_id, source_task_queue_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_knowledge_proposal_approval
        ON knowledge_proposal(workspace_id, approval_id)
        WHERE approval_id IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_router_session_conversation
        ON agent_router_session(workspace_id, agent_id, conversation_key)
        WHERE conversation_key IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_router_session_agent_updated
        ON agent_router_session(workspace_id, agent_id, updated_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_router_provider_session_router
        ON agent_router_provider_session(workspace_id, router_session_id, status, updated_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_task_attempt_task_created
        ON agent_task_attempt(task_queue_id, created_at ASC, id ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_task_attempt_router_created
        ON agent_task_attempt(workspace_id, router_session_id, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_router_event_router_created
        ON agent_router_event(workspace_id, router_session_id, created_at ASC, id ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_router_event_task_created
        ON agent_router_event(task_queue_id, created_at ASC, id ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_router_context_snapshot_router_created
        ON agent_router_context_snapshot(workspace_id, router_session_id, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_task_queue_runtime_status_priority
        ON agent_task_queue(runtime_id, status, priority DESC, created_at ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_task_queue_router_session
        ON agent_task_queue(workspace_id, router_session_id, created_at DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_message_task_seq
        ON task_message(task_id, seq)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_task_execution_event_workspace_created
        ON task_execution_event(workspace_id, created_at DESC, id DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_task_execution_event_task_created
        ON task_execution_event(task_id, created_at ASC, id ASC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_task_execution_event_runtime_created
        ON task_execution_event(workspace_id, runtime_id, created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_task_execution_event_channel_created
        ON task_execution_event(workspace_id, channel_name, created_at DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_workspace_scope
        ON budget(workspace_id, scope, scope_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_created
        ON token_usage(workspace_id, created_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_token_usage_agent
        ON token_usage(workspace_id, agent_id, created_at)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_attachment_workspace_message
        ON attachment(workspace_id, message_id, source_message_index)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_attachment_storage_key
        ON attachment(storage_provider, storage_bucket, storage_key)
        WHERE storage_key IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_created
        ON audit_log(workspace_id, created_at DESC, source_index DESC)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_join_code
        ON workspace(join_code)
        WHERE join_code IS NOT NULL
    `,
    `
      INSERT INTO app_metadata (key, value)
      VALUES ('schema_version', '${POSTGRES_SCHEMA_VERSION}')
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
    `
  ].map((statement) => statement.trim());
}

// ../db/src/repository-env.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
function findRepositoryRoot(input) {
  const env = input?.env ?? process.env;
  const candidates = [
    env.AGENT_SPACE_REPOSITORY_ROOT,
    input?.startDir,
    /*turbopackIgnore: true*/
    process.cwd(),
    join(
      /*turbopackIgnore: true*/
      process.cwd(),
      ".."
    ),
    join(
      /*turbopackIgnore: true*/
      process.cwd(),
      "..",
      ".."
    )
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    const markerRoot = findRepositoryRootByWalking(resolved);
    if (markerRoot) {
      return markerRoot;
    }
  }
  return null;
}
function resolveRepositoryEnvFilePath(input) {
  const root = findRepositoryRoot(input);
  return root ? join(root, ".env") : null;
}
function readRepositoryEnvValues(input) {
  const envFilePath = resolveRepositoryEnvFilePath(input);
  if (!envFilePath || !existsSync(
    /*turbopackIgnore: true*/
    envFilePath
  )) {
    return {};
  }
  return parseDotEnv(readFileSync(
    /*turbopackIgnore: true*/
    envFilePath,
    "utf8"
  ));
}
function readEffectiveRuntimeEnv(input) {
  const env = input?.env ?? process.env;
  const repositoryEnv = readRepositoryEnvValues({ env, startDir: input?.startDir });
  const repositoryOverridesEnv = input?.repositoryOverridesEnv ?? env === process.env;
  return repositoryOverridesEnv ? { ...env, ...repositoryEnv } : { ...repositoryEnv, ...env };
}
function findRepositoryRootByWalking(startDir) {
  let currentDir = resolve(startDir);
  while (true) {
    if (existsSync(
      /*turbopackIgnore: true*/
      join(currentDir, "Target.md")
    )) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}
function parseDotEnv(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const rawKey = trimmed.slice(0, separatorIndex).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice("export ".length).trim() : rawKey;
    if (!key) {
      continue;
    }
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// ../db/src/postgres-config.ts
function resolvePostgresDatabaseUrl(input) {
  const rawEnv = input?.env ?? process.env;
  const env = input?.env ? readEffectiveRuntimeEnv({ env: input.env, repositoryOverridesEnv: false }) : readEffectiveRuntimeEnv();
  const databaseUrl2 = input?.databaseUrl?.trim() || rawEnv.AGENT_SPACE_TEST_DATABASE_URL?.trim() || rawEnv.AGENT_SPACE_PG_TEST_URL?.trim() || env.AGENT_SPACE_TEST_DATABASE_URL?.trim() || env.AGENT_SPACE_PG_TEST_URL?.trim() || resolveEnvironmentDeploymentModeDatabaseUrl(rawEnv) || rawEnv.AGENT_SPACE_PG_URL?.trim() || rawEnv.DATABASE_URL?.trim() || resolveEnvironmentDeploymentModeDatabaseUrl(env) || env.AGENT_SPACE_PG_URL?.trim() || env.DATABASE_URL?.trim() || "";
  if (!databaseUrl2) {
    throw new Error(
      "PostgreSQL database URL is required. Set AGENT_SPACE_DEPLOYMENT_MODE with SELF_HOSTED_DATABASE_URL or NEON_DATABASE_URL, or define legacy AGENT_SPACE_PG_URL / DATABASE_URL."
    );
  }
  assertSafeTestDatabaseUrl(databaseUrl2, env);
  return databaseUrl2;
}
function resolveEnvironmentDeploymentModeDatabaseUrl(env) {
  const mode = resolveDeploymentMode(env, {});
  if (mode === "cloud") {
    return env.NEON_DATABASE_URL?.trim() || void 0;
  }
  if (mode === "self_hosted") {
    return env.SELF_HOSTED_DATABASE_URL?.trim() || void 0;
  }
  return void 0;
}
function resolveDeploymentMode(env, repositoryEnv) {
  const rawMode = env.AGENT_SPACE_DEPLOYMENT_MODE?.trim() || repositoryEnv.AGENT_SPACE_DEPLOYMENT_MODE?.trim();
  if (rawMode === "cloud" || rawMode === "self_hosted") {
    return rawMode;
  }
  return void 0;
}
function assertSafeTestDatabaseUrl(databaseUrl2, env) {
  if (!isTestProcess(env) || env.AGENT_SPACE_ALLOW_PRODUCTION_TEST_DB === "1") {
    return;
  }
  if (looksLikeTestDatabaseUrl(databaseUrl2) || looksLikeE2eNeonBranchUrl(databaseUrl2, env)) {
    return;
  }
  throw new Error(
    "Refusing to use a non-test PostgreSQL database while running tests. Set AGENT_SPACE_TEST_DATABASE_URL or AGENT_SPACE_PG_TEST_URL to an isolated test database, or set AGENT_SPACE_ALLOW_PRODUCTION_TEST_DB=1 if this is intentional."
  );
}
function isTestProcess(env) {
  return Boolean(
    env.NODE_TEST_CONTEXT || env.AGENT_SPACE_E2E === "1" || env.VITEST || env.JEST_WORKER_ID || env.NODE_ENV === "test" || process.argv.some((arg) => arg === "--test" || arg.startsWith("--test-"))
  );
}
function looksLikeTestDatabaseUrl(databaseUrl2) {
  try {
    const parsed = new URL(databaseUrl2);
    return /(^|[_-])(test|e2e|loadtest)([_-]|$)/i.test(parsed.pathname.replace(/^\//, ""));
  } catch {
    return /(^|[_-])(test|e2e|loadtest)([_-]|$)/i.test(databaseUrl2);
  }
}
function looksLikeE2eNeonBranchUrl(databaseUrl2, env) {
  const branchId = env.AGENT_SPACE_E2E_NEON_BRANCH_ID?.trim();
  const branchName = env.AGENT_SPACE_E2E_NEON_BRANCH_NAME?.trim();
  if (!branchId || !branchName?.startsWith("e2e-")) {
    return false;
  }
  const expectedUrls = [
    env.AGENT_SPACE_E2E_DATABASE_URL,
    env.AGENT_SPACE_TEST_DATABASE_URL,
    env.AGENT_SPACE_PG_TEST_URL
  ].map((value) => value?.trim()).filter((value) => Boolean(value));
  return expectedUrls.some((expectedUrl) => sameDatabaseUrl(databaseUrl2, expectedUrl));
}
function sameDatabaseUrl(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.toString() === rightUrl.toString();
  } catch {
    return left === right;
  }
}

// ../db/src/database.ts
var DATA_DIR = "data";
var DEFAULT_WORKSPACE_ID = "default";
var WORKER_REQUEST_TIMEOUT_MS = resolveWorkerRequestTimeoutMs();
var WORKER_WAIT_SLICE_MS = 50;
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
var database = null;
var databaseUrl = null;
var worker = null;
var requestPort = null;
var schemaEnsuredForUrl = null;
var workerFailure = null;
var workerGeneration = 0;
function getDatabase() {
  const nextDatabaseUrl = resolvePostgresDatabaseUrl();
  if (database && databaseUrl === nextDatabaseUrl && isWorkerReady()) {
    return database;
  }
  closeDatabase();
  databaseUrl = nextDatabaseUrl;
  database = createPostgresSyncDatabase(nextDatabaseUrl);
  ensureRuntimeSchema(database);
  return database;
}
function isWorkerReady() {
  return Boolean(worker && requestPort && !workerFailure);
}
function getDataDirPath() {
  const dirPath = join2(resolveRepositoryRoot(), DATA_DIR);
  if (!existsSync2(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}
function getWorkspaceDataDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  const dirPath = join2(getDataDirPath(), "workspaces", workspaceId);
  if (!existsSync2(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}
function withTransaction(db, work) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function readMetadataValue(db, key) {
  const row = db.prepare("SELECT value FROM app_metadata WHERE key = ?").get(key);
  return row?.value;
}
function randomLikeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function resolveRepositoryRoot() {
  const candidates = [
    process.env.AGENT_SPACE_REPOSITORY_ROOT,
    /*turbopackIgnore: true*/
    process.cwd(),
    join2(
      /*turbopackIgnore: true*/
      process.cwd(),
      ".."
    ),
    join2(
      /*turbopackIgnore: true*/
      process.cwd(),
      "..",
      ".."
    )
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    const resolved = resolve2(candidate);
    if (existsSync2(
      /*turbopackIgnore: true*/
      join2(resolved, "Target.md")
    )) {
      return resolved;
    }
  }
  return (
    /*turbopackIgnore: true*/
    process.cwd()
  );
}
function ensureRuntimeSchema(db) {
  const currentUrl = databaseUrl;
  if (!currentUrl || schemaEnsuredForUrl === currentUrl) {
    return;
  }
  let transactionStarted = false;
  db.prepare("SELECT pg_advisory_lock(?)").get(POSTGRES_SCHEMA_VERSION);
  try {
    if (schemaEnsuredForUrl === currentUrl || isRuntimeSchemaCurrent(db)) {
      schemaEnsuredForUrl = currentUrl;
      return;
    }
    db.exec("BEGIN");
    transactionStarted = true;
    for (const statement of getPostgresSchemaStatements()) {
      db.exec(statement);
    }
    db.prepare(
      `INSERT INTO app_metadata (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`
    ).run("schema_version", POSTGRES_SCHEMA_VERSION);
    seedDefaultWorkspace(db);
    backfillWorkspaceJoinCodes(db);
    db.exec("COMMIT");
    transactionStarted = false;
    schemaEnsuredForUrl = currentUrl;
  } catch (error) {
    if (transactionStarted) {
      db.exec("ROLLBACK");
    }
    throw error;
  } finally {
    db.prepare("SELECT pg_advisory_unlock(?)").get(POSTGRES_SCHEMA_VERSION);
  }
}
function isRuntimeSchemaCurrent(db) {
  const table = db.prepare(
    "SELECT to_regclass('public.app_metadata') AS table_name"
  ).get();
  if (table?.tableName !== "app_metadata") {
    return false;
  }
  return readMetadataValue(db, "schema_version") === POSTGRES_SCHEMA_VERSION;
}
function backfillWorkspaceJoinCodes(db) {
  const rows = db.prepare(
    `SELECT id FROM workspace
     WHERE archived_at IS NULL
       AND (join_code IS NULL OR join_code = '')`
  ).all();
  for (const row of rows) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(
      `UPDATE workspace
       SET join_code = ?, join_code_updated_at = ?, join_code_updated_by = ?, updated_at = ?
       WHERE id = ?`
    ).run(buildDeterministicJoinCode(row.id), now, "system", now, row.id);
  }
}
function buildDeterministicJoinCode(seed) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    hash = Math.imul(hash ^ index, 16777619);
    code += alphabet[Math.abs(hash) % alphabet.length];
  }
  return code;
}
function seedDefaultWorkspace(db) {
  const existingWorkspace = db.prepare("SELECT 1 FROM workspace WHERE id = ? LIMIT 1").get(DEFAULT_WORKSPACE_ID);
  if (existingWorkspace) {
    return;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const joinCode = "DEFAULT1";
  db.prepare(
    `INSERT INTO workspace (
       id, slug, name, created_by, created_at, updated_at, archived_at,
       join_code, join_code_updated_at, join_code_updated_by
     )
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID, "Agent Space", "", now, now, joinCode, now, "system");
}
function createPostgresSyncDatabase(currentDatabaseUrl) {
  ensureWorker();
  return {
    exec(sql) {
      void callWorker({
        action: "exec",
        databaseUrl: currentDatabaseUrl,
        sql
      });
    },
    prepare(sql) {
      const convertedSql = convertSqliteParameters(sql);
      const execute = (params) => callWorker({
        action: "query",
        databaseUrl: currentDatabaseUrl,
        sql: convertedSql,
        params
      });
      return {
        all(...params) {
          const result = execute(params);
          return result.rows ?? [];
        },
        get(...params) {
          const result = execute(params);
          return result.rows?.[0];
        },
        run(...params) {
          const result = execute(params);
          return {
            changes: result.rowCount ?? 0
          };
        }
      };
    },
    close() {
      closeDatabase();
    }
  };
}
function closeDatabase() {
  database = null;
  databaseUrl = null;
  schemaEnsuredForUrl = null;
  workerFailure = null;
  workerGeneration += 1;
  if (requestPort) {
    try {
      requestPort.postMessage({
        requestId: `close-${Date.now()}`,
        action: "close"
      });
    } catch {
    }
    requestPort.close();
    requestPort = null;
  }
  if (worker) {
    void worker.terminate();
    worker = null;
  }
}
function ensureWorker() {
  if (isWorkerReady()) {
    return;
  }
  if (requestPort) {
    requestPort.close();
    requestPort = null;
  }
  if (worker) {
    void worker.terminate();
    worker = null;
  }
  const generation = workerGeneration + 1;
  workerGeneration = generation;
  workerFailure = null;
  const nextWorker = new Worker(POSTGRES_SYNC_WORKER_SOURCE, {
    eval: true,
    execArgv: [],
    workerData: {
      pgModulePath: resolvePgModulePath(),
      responseSignalBuffer: WORKER_SIGNAL_BUFFER
    }
  });
  const channel = new MessageChannel();
  nextWorker.unref();
  channel.port1.unref();
  nextWorker.on("error", (error) => {
    if (workerGeneration === generation) {
      workerFailure = normalizeWorkerFailure(error);
    }
  });
  nextWorker.on("exit", (code) => {
    if (workerGeneration !== generation) {
      return;
    }
    if (requestPort === channel.port1) {
      requestPort.close();
      requestPort = null;
    }
    if (worker === nextWorker) {
      worker = null;
    }
    if (!workerFailure) {
      workerFailure = new Error(`PostgreSQL runtime worker exited unexpectedly with code ${code}.`);
    }
  });
  nextWorker.postMessage({ port: channel.port2 }, [channel.port2]);
  worker = nextWorker;
  requestPort = channel.port1;
  requestPort.start();
}
function callWorker(input) {
  if (!isWorkerReady()) {
    ensureWorker();
  }
  if (!requestPort) {
    throw new Error("PostgreSQL runtime worker is not initialized.");
  }
  const activeWorker = worker;
  const activePort = requestPort;
  const requestId = createHash("sha1").update(`${Date.now()}:${Math.random()}`).digest("hex");
  const startedAt = Date.now();
  let signalVersion = Atomics.load(WORKER_SIGNAL, 0);
  activeWorker?.ref();
  activePort.ref();
  try {
    activePort.postMessage({
      requestId,
      action: input.action,
      databaseUrl: input.databaseUrl,
      sql: input.sql,
      params: input.params ?? []
    });
    while (true) {
      if (workerFailure) {
        throw workerFailure;
      }
      if (Date.now() - startedAt > WORKER_REQUEST_TIMEOUT_MS) {
        throw new Error(
          `PostgreSQL runtime worker timed out after ${WORKER_REQUEST_TIMEOUT_MS}ms while running ${input.action}: ${formatSqlPreview(input.sql)}.`
        );
      }
      const message = receiveMessageOnPort(activePort);
      if (!message) {
        const remainingTime = WORKER_REQUEST_TIMEOUT_MS - (Date.now() - startedAt);
        if (remainingTime <= 0) {
          continue;
        }
        Atomics.wait(WORKER_SIGNAL, 0, signalVersion, Math.min(remainingTime, WORKER_WAIT_SLICE_MS));
        signalVersion = Atomics.load(WORKER_SIGNAL, 0);
        continue;
      }
      const response = message.message;
      if (response.requestId !== requestId) {
        continue;
      }
      if (!response.ok) {
        throw deserializeWorkerError(response.error);
      }
      return response.value ?? {};
    }
  } finally {
    activePort.unref();
    activeWorker?.unref();
  }
}
function resolvePgModulePath() {
  const candidates = [
    join2(resolveRepositoryRoot(), "packages", "db", "package.json"),
    resolveLocalDbPackageJsonPath()
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      return createRequire(candidate).resolve("pg");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not resolve pg module.");
}
function normalizeFsPath(pathname) {
  return pathname.startsWith("/@fs/") ? pathname.slice("/@fs".length) : pathname;
}
function resolveLocalDbPackageJsonPath() {
  const packageUrl = new URL("../package.json", import.meta.url);
  if (packageUrl.protocol === "file:") {
    return normalizeFsPath(fileURLToPath(packageUrl));
  }
  return normalizeFsPath(packageUrl.pathname);
}
function resolveWorkerRequestTimeoutMs() {
  const parsed = Number.parseInt(process.env.AGENT_SPACE_DB_WORKER_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1e4;
}
function normalizeWorkerFailure(error) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
function formatSqlPreview(sql) {
  const compactSql = sql.replace(/\s+/g, " ").trim();
  return compactSql.length > 160 ? `${compactSql.slice(0, 157)}...` : compactSql;
}
function deserializeWorkerError(error) {
  const nextError = new Error(error?.message ?? "Unknown PostgreSQL worker error.");
  nextError.name = error?.name ?? "Error";
  if (error?.stack) {
    nextError.stack = error.stack;
  }
  return nextError;
}
function convertSqliteParameters(sql) {
  let index = 0;
  let result = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let position = 0; position < sql.length; position += 1) {
    const current = sql[position];
    const next = sql[position + 1];
    if (inLineComment) {
      result += current;
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      result += current;
      if (current === "*" && next === "/") {
        result += next;
        position += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && current === "-" && next === "-") {
      result += current + next;
      position += 1;
      inLineComment = true;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && current === "/" && next === "*") {
      result += current + next;
      position += 1;
      inBlockComment = true;
      continue;
    }
    if (current === "'" && !inDoubleQuote) {
      result += current;
      if (next === "'" && inSingleQuote) {
        result += next;
        position += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (current === '"' && !inSingleQuote) {
      result += current;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (current === "?" && !inSingleQuote && !inDoubleQuote) {
      index += 1;
      result += `$${index}`;
      continue;
    }
    result += current;
  }
  return result;
}

// ../db/src/storage-paths.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join3, resolve as resolve3 } from "node:path";
var LOCAL_DAEMON_STATE_DIR = join3("data", "daemon");
function getWorkspaceAttachmentsDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return ensureDirectory(join3(getWorkspaceDataDirPath(workspaceId), "attachments"));
}
function getWorkspaceChannelHistoryDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return ensureDirectory(join3(getWorkspaceDataDirPath(workspaceId), "channel-history"));
}
function getDaemonWorkspaceExecutionRootDir(stateDir, workspaceId = DEFAULT_WORKSPACE_ID) {
  return join3(resolve3(stateDir), "workspaces", sanitizeStoragePathSegment(workspaceId, DEFAULT_WORKSPACE_ID));
}
function getDaemonTaskWorkDirPath(stateDir, input) {
  return join3(
    getDaemonWorkspaceExecutionRootDir(stateDir, input.workspaceId ?? DEFAULT_WORKSPACE_ID),
    "workdirs",
    sanitizeStoragePathSegment(input.taskId, "task")
  );
}
function getDaemonChannelWorkDirPath(stateDir, input) {
  return join3(
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
function ensureDirectory(dirPath) {
  if (!existsSync3(dirPath)) {
    mkdirSync2(dirPath, { recursive: true });
  }
  return dirPath;
}

// ../db/src/attachments.ts
function replaceStoredAttachmentsSync(state, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  withTransaction(db, () => {
    db.prepare("DELETE FROM attachment WHERE workspace_id = ?").run(workspaceId);
    for (const [messageIndex, message] of state.messages.entries()) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.deletedAt) {
          continue;
        }
        insertStoredAttachmentSync({
          workspaceId,
          message,
          attachment,
          messageIndex,
          fallbackCreatedAt: now
        });
      }
    }
  });
}
function insertStoredAttachmentSync(input) {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO attachment (
      workspace_id,
      id,
      message_id,
      channel_name,
      speaker,
      role,
      file_name,
      media_type,
      kind,
      size_bytes,
      stored_path,
      storage_provider,
      storage_bucket,
      storage_region,
      storage_endpoint,
      storage_key,
      storage_url,
      sha256,
      source_message_time,
      source_message_index,
      source_summary,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      message_id = EXCLUDED.message_id,
      channel_name = EXCLUDED.channel_name,
      speaker = EXCLUDED.speaker,
      role = EXCLUDED.role,
      file_name = EXCLUDED.file_name,
      media_type = EXCLUDED.media_type,
      kind = EXCLUDED.kind,
      size_bytes = EXCLUDED.size_bytes,
      stored_path = EXCLUDED.stored_path,
      storage_provider = EXCLUDED.storage_provider,
      storage_bucket = EXCLUDED.storage_bucket,
      storage_region = EXCLUDED.storage_region,
      storage_endpoint = EXCLUDED.storage_endpoint,
      storage_key = EXCLUDED.storage_key,
      storage_url = EXCLUDED.storage_url,
      sha256 = EXCLUDED.sha256,
      source_message_time = EXCLUDED.source_message_time,
      source_message_index = EXCLUDED.source_message_index,
      source_summary = EXCLUDED.source_summary`
  ).run(
    input.workspaceId,
    input.attachment.id,
    input.message.id,
    input.message.channel ?? null,
    input.message.speaker,
    input.message.role,
    input.attachment.fileName,
    input.attachment.mediaType,
    input.attachment.kind,
    input.attachment.sizeBytes,
    input.attachment.storedPath,
    input.attachment.storageProvider ?? "local",
    input.attachment.storageBucket ?? null,
    input.attachment.storageRegion ?? null,
    input.attachment.storageEndpoint ?? null,
    input.attachment.storageKey ?? null,
    input.attachment.storageUrl ?? null,
    input.attachment.sha256 ?? null,
    input.message.time,
    input.messageIndex,
    input.message.summary,
    input.fallbackCreatedAt
  );
}

// ../db/src/user-auth.ts
function readUserSync(userId) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
      id,
      display_name AS displayName,
      avatar_url AS avatarUrl,
      primary_email AS primaryEmail,
      created_at AS createdAt,
      updated_at AS updatedAt,
      last_login_at AS lastLoginAt
     FROM users
     WHERE id = ?`
  ).get(userId);
  return row ? mapStoredUserRecord(row) : null;
}
function listWorkspaceMemberUsersSync(workspaceId) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
      u.id AS userId,
      u.display_name AS displayName,
      u.primary_email AS primaryEmail,
      wm.role
     FROM workspace_membership wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? AND wm.status = 'active'
     ORDER BY wm.joined_at ASC`
  ).all(workspaceId);
  return rows.map((row) => mapWorkspaceMemberUserRecord(row)).filter((row) => row !== null);
}
function mapStoredUserRecord(value) {
  if (typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    displayName: value.displayName,
    avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : void 0,
    primaryEmail: typeof value.primaryEmail === "string" ? value.primaryEmail : void 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastLoginAt: typeof value.lastLoginAt === "string" ? value.lastLoginAt : void 0
  };
}
function mapWorkspaceMemberUserRecord(value) {
  if (typeof value.userId !== "string" || typeof value.displayName !== "string" || value.role !== "owner" && value.role !== "admin" && value.role !== "member") {
    return null;
  }
  return {
    userId: value.userId,
    displayName: value.displayName,
    primaryEmail: typeof value.primaryEmail === "string" ? value.primaryEmail : void 0,
    role: value.role
  };
}

// ../db/src/agent-google-workspace-delegations.ts
function readActiveAgentGoogleWorkspaceDelegationSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const row = db.prepare(
    `SELECT
       id,
       workspace_id AS workspaceId,
       employee_name AS employeeName,
       user_id AS userId,
       google_oauth_credential_id AS googleOAuthCredentialId,
       status,
       scopes,
       google_email AS googleEmail,
       granted_by_user_id AS grantedByUserId,
       created_at AS createdAt,
       updated_at AS updatedAt,
       revoked_at AS revokedAt
     FROM agent_google_workspace_delegation
     WHERE workspace_id = ? AND employee_name = ? AND status = 'active'
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  ).get(workspaceId, input.employeeName.trim());
  return row ? mapAgentGoogleWorkspaceDelegationRecord(row) : null;
}
function mapAgentGoogleWorkspaceDelegationRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.employeeName !== "string" || typeof value.userId !== "string" || typeof value.googleOAuthCredentialId !== "string" || value.status !== "active" && value.status !== "revoked" || typeof value.scopes !== "string" || typeof value.grantedByUserId !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    employeeName: value.employeeName,
    userId: value.userId,
    googleOAuthCredentialId: value.googleOAuthCredentialId,
    status: value.status,
    scopes: value.scopes,
    googleEmail: typeof value.googleEmail === "string" ? value.googleEmail : void 0,
    grantedByUserId: value.grantedByUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : void 0
  };
}

// ../db/src/google-oauth-credentials.ts
function listGoogleOAuthCredentialsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
       id,
       workspace_id AS workspaceId,
       user_id AS userId,
       google_subject AS googleSubject,
       google_email AS googleEmail,
       scopes,
       access_token_encrypted AS accessTokenEncrypted,
       refresh_token_encrypted AS refreshTokenEncrypted,
       expires_at AS expiresAt,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt,
       revoked_at AS revokedAt
     FROM google_oauth_credential
     WHERE workspace_id = ?
     ORDER BY updated_at DESC`
  ).all(workspaceId);
  return rows.map((row) => mapGoogleOAuthCredentialRecord(row)).filter((row) => row !== null);
}
function mapGoogleOAuthCredentialRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.userId !== "string" || typeof value.scopes !== "string" || value.status !== "active" && value.status !== "revoked" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    userId: value.userId,
    googleSubject: typeof value.googleSubject === "string" ? value.googleSubject : void 0,
    googleEmail: typeof value.googleEmail === "string" ? value.googleEmail : void 0,
    scopes: value.scopes,
    accessTokenEncrypted: typeof value.accessTokenEncrypted === "string" ? value.accessTokenEncrypted : void 0,
    refreshTokenEncrypted: typeof value.refreshTokenEncrypted === "string" ? value.refreshTokenEncrypted : void 0,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : void 0,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : void 0
  };
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

// ../db/src/workspace-state.ts
var WORKSPACE_STATE_VERSION = /* @__PURE__ */ Symbol("agent_space.workspace_state_version");
var WorkspaceStateConflictError = class extends Error {
  workspaceId;
  expectedVersion;
  currentVersion;
  code;
  constructor(input) {
    super(
      typeof input.expectedVersion === "number" ? `Workspace "${input.workspaceId}" state version conflict (expected ${input.expectedVersion}, current ${input.currentVersion}).` : `Workspace "${input.workspaceId}" state version conflict (current ${input.currentVersion}).`
    );
    this.name = "WorkspaceStateConflictError";
    this.workspaceId = input.workspaceId;
    this.expectedVersion = input.expectedVersion;
    this.currentVersion = input.currentVersion;
    this.code = "workspace.state_conflict";
  }
};
function ensureWorkspaceStateRecordSync(defaultState = createDefaultWorkspaceState(), workspaceId = DEFAULT_WORKSPACE_ID) {
  const state = readWorkspaceStateRecordSync(workspaceId);
  if (state) {
    return state;
  }
  return writeWorkspaceStateRecordSync(defaultState, workspaceId, {
    skipVersionCheck: true
  });
}
function readWorkspaceStateRecordSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const row = db.prepare("SELECT state_json, state_version FROM workspace_snapshot WHERE id = ?").get(workspaceId);
  if (!row) {
    return null;
  }
  return attachWorkspaceStateVersion(JSON.parse(row.state_json), row.state_version);
}
function writeWorkspaceStateRecordSync(state, workspaceId = DEFAULT_WORKSPACE_ID, options) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = db.prepare("SELECT id, state_version FROM workspace_snapshot WHERE id = ?").get(workspaceId);
  const expectedVersion = options?.expectedVersion ?? readWorkspaceStateVersion(state);
  if (!existing) {
    db.prepare(
      `INSERT INTO workspace_snapshot (
        id,
        organization_name,
        pending_handoffs,
        state_json,
        state_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(
      workspaceId,
      state.organizationName,
      state.pendingHandoffs,
      JSON.stringify(state),
      now,
      now
    );
    return attachWorkspaceStateVersion(state, 1);
  }
  if (!options?.skipVersionCheck && typeof expectedVersion === "number") {
    const result = db.prepare(
      `UPDATE workspace_snapshot
       SET organization_name = ?,
           pending_handoffs = ?,
           state_json = ?,
           state_version = state_version + 1,
           updated_at = ?
       WHERE id = ? AND state_version = ?`
    ).run(
      state.organizationName,
      state.pendingHandoffs,
      JSON.stringify(state),
      now,
      workspaceId,
      expectedVersion
    );
    if (result.changes === 0) {
      const currentVersion = readWorkspaceStateCurrentVersionSync(workspaceId) ?? existing.state_version;
      throw new WorkspaceStateConflictError({
        workspaceId,
        expectedVersion,
        currentVersion
      });
    }
    return attachWorkspaceStateVersion(state, expectedVersion + 1);
  }
  db.prepare(
    `UPDATE workspace_snapshot
     SET organization_name = ?,
         pending_handoffs = ?,
         state_json = ?,
         state_version = state_version + 1,
         updated_at = ?
     WHERE id = ?`
  ).run(
    state.organizationName,
    state.pendingHandoffs,
    JSON.stringify(state),
    now,
    workspaceId
  );
  return attachWorkspaceStateVersion(state, existing.state_version + 1);
}
function readWorkspaceStateVersion(state) {
  const candidate = state;
  return typeof candidate[WORKSPACE_STATE_VERSION] === "number" ? candidate[WORKSPACE_STATE_VERSION] : void 0;
}
function readWorkspaceStateCurrentVersionSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const row = db.prepare("SELECT state_version FROM workspace_snapshot WHERE id = ?").get(workspaceId);
  return typeof row?.state_version === "number" ? row.state_version : null;
}
function attachWorkspaceStateVersion(state, version) {
  Object.defineProperty(state, WORKSPACE_STATE_VERSION, {
    value: version,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return state;
}

// ../domain/src/channel-document-collab.ts
function allowsDocumentAction(role, action) {
  if (!role) {
    return false;
  }
  if (role === "owner") {
    return action === "view" || action === "edit" || action === "forward" || action === "manage";
  }
  if (role === "forwarder") {
    return action === "view" || action === "edit" || action === "forward";
  }
  if (role === "editor") {
    return action === "view" || action === "edit";
  }
  return action === "view";
}
function getAllowedDocumentActions(role) {
  return ["view", "edit", "forward", "manage"].filter((action) => allowsDocumentAction(role, action));
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

// ../db/src/agent-router-sessions.ts
function readLatestAgentTaskAttemptForTaskSync(taskQueueId) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      task_queue_id AS taskQueueId,
      router_session_id AS routerSessionId,
      runtime_id AS runtimeId,
      provider,
      provider_session_id AS providerSessionId,
      status,
      started_at AS startedAt,
      finished_at AS finishedAt,
      error_text AS errorText,
      handoff_snapshot_id AS handoffSnapshotId,
      metadata_json AS metadataJson,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM agent_task_attempt
     WHERE task_queue_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`
  ).get(taskQueueId);
  return row ? mapAgentTaskAttemptRecord(row) : null;
}
function recordAgentRouterEventSync(input) {
  const db = getDatabase();
  const id = `router-event-${randomLikeId()}`;
  const now = input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO agent_router_event (
      id,
      workspace_id,
      router_session_id,
      task_queue_id,
      attempt_id,
      type,
      actor_type,
      actor_id,
      runtime_id,
      provider,
      summary,
      data_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    input.routerSessionId,
    input.taskQueueId ?? null,
    input.attemptId ?? null,
    input.type,
    input.actorType,
    input.actorId ?? null,
    input.runtimeId ?? null,
    input.provider ?? null,
    input.summary ?? null,
    JSON.stringify(input.data ?? {}),
    now
  );
  const event = readAgentRouterEventSync(id);
  if (!event) {
    throw new Error(`Router event "${id}" could not be read after write.`);
  }
  return event;
}
function readAgentRouterEventSync(id) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      router_session_id AS routerSessionId,
      task_queue_id AS taskQueueId,
      attempt_id AS attemptId,
      type,
      actor_type AS actorType,
      actor_id AS actorId,
      runtime_id AS runtimeId,
      provider,
      summary,
      data_json AS dataJson,
      created_at AS createdAt
     FROM agent_router_event
     WHERE id = ?`
  ).get(id);
  return row ? mapAgentRouterEventRecord(row) : null;
}
function mapAgentTaskAttemptRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.taskQueueId !== "string" || typeof value.routerSessionId !== "string" || typeof value.runtimeId !== "string" || typeof value.provider !== "string" || !isAgentTaskAttemptStatus(value.status) || typeof value.metadataJson !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    taskQueueId: value.taskQueueId,
    routerSessionId: value.routerSessionId,
    runtimeId: value.runtimeId,
    provider: value.provider,
    providerSessionId: typeof value.providerSessionId === "string" ? value.providerSessionId : void 0,
    status: value.status,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : void 0,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : void 0,
    errorText: typeof value.errorText === "string" ? value.errorText : void 0,
    handoffSnapshotId: typeof value.handoffSnapshotId === "string" ? value.handoffSnapshotId : void 0,
    metadataJson: value.metadataJson,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}
function mapAgentRouterEventRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.routerSessionId !== "string" || typeof value.type !== "string" || !isAgentRouterActorType(value.actorType) || typeof value.dataJson !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    routerSessionId: value.routerSessionId,
    taskQueueId: typeof value.taskQueueId === "string" ? value.taskQueueId : void 0,
    attemptId: typeof value.attemptId === "string" ? value.attemptId : void 0,
    type: value.type,
    actorType: value.actorType,
    actorId: typeof value.actorId === "string" ? value.actorId : void 0,
    runtimeId: typeof value.runtimeId === "string" ? value.runtimeId : void 0,
    provider: typeof value.provider === "string" ? value.provider : void 0,
    summary: typeof value.summary === "string" ? value.summary : void 0,
    dataJson: value.dataJson,
    createdAt: value.createdAt
  };
}
function isAgentRouterActorType(value) {
  return value === "human" || value === "agent" || value === "runtime" || value === "system";
}
function isAgentTaskAttemptStatus(value) {
  return value === "claimed" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

// ../db/src/document-agent-access.ts
function listDocumentAgentAccessSync(input = {}) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const where = ["workspace_id = ?"];
  const params = [workspaceId];
  if (input.documentId?.trim()) {
    where.push("document_id = ?");
    params.push(input.documentId.trim());
  }
  if (input.subjectId?.trim()) {
    where.push("subject_type = 'agent'");
    where.push("subject_id = ?");
    params.push(input.subjectId.trim());
  }
  if (!input.includeRevoked) {
    where.push("revoked_at IS NULL");
  }
  const rows = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      document_id AS documentId,
      subject_type AS subjectType,
      subject_id AS subjectId,
      role,
      scope,
      granted_by_user_id AS grantedByUserId,
      created_at AS createdAt,
      updated_at AS updatedAt,
      revoked_at AS revokedAt
     FROM document_agent_access
     WHERE ${where.join(" AND ")}
     ORDER BY updated_at DESC, created_at DESC, id ASC`
  ).all(...params);
  return rows.map(mapDocumentAgentAccessRecord).filter((record) => record !== null);
}
function createDocumentPermissionRequestSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const requestedByAgentName = requireTrimmed(input.requestedByAgentName, "requestedByAgentName");
  const reason = requireTrimmed(input.reason, "reason");
  const documentId = normalizeOptional(input.documentId);
  const externalProvider = normalizeExternalProvider(input.externalProvider);
  const externalFileId = normalizeOptional(input.externalFileId);
  const externalUrl = normalizeOptional(input.externalUrl);
  const requestedForChannelName = normalizeOptional(input.requestedForChannelName);
  const triggeredByUserId = normalizeOptional(input.triggeredByUserId);
  const sourceTaskId = normalizeOptional(input.sourceTaskId);
  assertAgentAssignableRole(input.requestedRole);
  ensureWorkspaceExists(workspaceId);
  if (!documentId && !externalFileId && !externalUrl) {
    throw new Error("documentId, externalFileId, or externalUrl is required.");
  }
  if ((externalFileId || externalUrl) && !externalProvider) {
    throw new Error("externalProvider is required for external document permission requests.");
  }
  if (triggeredByUserId) {
    ensureUserExists(triggeredByUserId);
  }
  const existing = findDuplicatePendingRequest({
    workspaceId,
    documentId,
    externalProvider,
    externalFileId,
    requestedRole: input.requestedRole,
    requestedByAgentName,
    requestedForChannelName
  });
  if (existing) {
    return existing;
  }
  const id = `document-permission-request-${randomLikeId()}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO document_permission_request (
      id,
      workspace_id,
      document_id,
      external_provider,
      external_file_id,
      external_url,
      requested_role,
      requested_by_agent_name,
      requested_for_channel_name,
      triggered_by_user_id,
      reason,
      status,
      decided_by_user_id,
      decision_note,
      source_task_id,
      created_at,
      decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL)`
  ).run(
    id,
    workspaceId,
    documentId ?? null,
    externalProvider ?? null,
    externalFileId ?? null,
    externalUrl ?? null,
    input.requestedRole,
    requestedByAgentName,
    requestedForChannelName ?? null,
    triggeredByUserId ?? null,
    reason,
    sourceTaskId ?? null,
    now
  );
  const request = readDocumentPermissionRequestSync(id);
  if (!request) {
    throw new Error("Document permission request could not be read after write.");
  }
  return request;
}
function listDocumentPermissionRequestsSync(input = {}) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const where = ["workspace_id = ?"];
  const params = [workspaceId];
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.requestedByAgentName?.trim()) {
    where.push("requested_by_agent_name = ?");
    params.push(input.requestedByAgentName.trim());
  }
  if (input.documentId?.trim()) {
    where.push("document_id = ?");
    params.push(input.documentId.trim());
  }
  const rows = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      document_id AS documentId,
      external_provider AS externalProvider,
      external_file_id AS externalFileId,
      external_url AS externalUrl,
      requested_role AS requestedRole,
      requested_by_agent_name AS requestedByAgentName,
      requested_for_channel_name AS requestedForChannelName,
      triggered_by_user_id AS triggeredByUserId,
      reason,
      status,
      decided_by_user_id AS decidedByUserId,
      decision_note AS decisionNote,
      source_task_id AS sourceTaskId,
      created_at AS createdAt,
      decided_at AS decidedAt
     FROM document_permission_request
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id ASC`
  ).all(...params);
  return rows.map(mapDocumentPermissionRequestRecord).filter((record) => record !== null);
}
function readDocumentPermissionRequestSync(requestId) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      document_id AS documentId,
      external_provider AS externalProvider,
      external_file_id AS externalFileId,
      external_url AS externalUrl,
      requested_role AS requestedRole,
      requested_by_agent_name AS requestedByAgentName,
      requested_for_channel_name AS requestedForChannelName,
      triggered_by_user_id AS triggeredByUserId,
      reason,
      status,
      decided_by_user_id AS decidedByUserId,
      decision_note AS decisionNote,
      source_task_id AS sourceTaskId,
      created_at AS createdAt,
      decided_at AS decidedAt
     FROM document_permission_request
     WHERE id = ?
     LIMIT 1`
  ).get(requestId.trim());
  return row ? mapDocumentPermissionRequestRecord(row) : null;
}
function findDuplicatePendingRequest(input) {
  if (input.documentId) {
    const row = getDatabase().prepare(
      `SELECT id
       FROM document_permission_request
       WHERE workspace_id = ?
         AND requested_by_agent_name = ?
         AND requested_role = ?
         AND document_id = ?
         AND COALESCE(requested_for_channel_name, '') = COALESCE(?, '')
         AND status = 'pending'
       LIMIT 1`
    ).get(
      input.workspaceId,
      input.requestedByAgentName,
      input.requestedRole,
      input.documentId,
      input.requestedForChannelName ?? null
    );
    return row ? readDocumentPermissionRequestSync(row.id) : null;
  }
  if (input.externalProvider && input.externalFileId) {
    const row = getDatabase().prepare(
      `SELECT id
       FROM document_permission_request
       WHERE workspace_id = ?
         AND requested_by_agent_name = ?
         AND requested_role = ?
         AND external_provider = ?
         AND external_file_id = ?
         AND COALESCE(requested_for_channel_name, '') = COALESCE(?, '')
         AND status = 'pending'
       LIMIT 1`
    ).get(
      input.workspaceId,
      input.requestedByAgentName,
      input.requestedRole,
      input.externalProvider,
      input.externalFileId,
      input.requestedForChannelName ?? null
    );
    return row ? readDocumentPermissionRequestSync(row.id) : null;
  }
  return null;
}
function mapDocumentAgentAccessRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.documentId !== "string" || value.subjectType !== "agent" || typeof value.subjectId !== "string" || !isAgentAssignableRole(value.role) || value.scope !== "document" || typeof value.grantedByUserId !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    documentId: value.documentId,
    subjectType: value.subjectType,
    subjectId: value.subjectId,
    role: value.role,
    scope: "document",
    grantedByUserId: value.grantedByUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : void 0
  };
}
function mapDocumentPermissionRequestRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || !isAgentAssignableRole(value.requestedRole) || typeof value.requestedByAgentName !== "string" || typeof value.reason !== "string" || !isPermissionRequestStatus(value.status) || typeof value.createdAt !== "string") {
    return null;
  }
  const externalProvider = normalizeExternalProvider(
    typeof value.externalProvider === "string" ? value.externalProvider : void 0
  );
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    documentId: typeof value.documentId === "string" ? value.documentId : void 0,
    externalProvider,
    externalFileId: typeof value.externalFileId === "string" ? value.externalFileId : void 0,
    externalUrl: typeof value.externalUrl === "string" ? value.externalUrl : void 0,
    requestedRole: value.requestedRole,
    requestedByAgentName: value.requestedByAgentName,
    requestedForChannelName: typeof value.requestedForChannelName === "string" ? value.requestedForChannelName : void 0,
    triggeredByUserId: typeof value.triggeredByUserId === "string" ? value.triggeredByUserId : void 0,
    reason: value.reason,
    status: value.status,
    decidedByUserId: typeof value.decidedByUserId === "string" ? value.decidedByUserId : void 0,
    decisionNote: typeof value.decisionNote === "string" ? value.decisionNote : void 0,
    sourceTaskId: typeof value.sourceTaskId === "string" ? value.sourceTaskId : void 0,
    createdAt: value.createdAt,
    decidedAt: typeof value.decidedAt === "string" ? value.decidedAt : void 0
  };
}
function assertAgentAssignableRole(role) {
  if (!isAgentAssignableRole(role)) {
    throw new Error("role must be viewer, editor, or forwarder.");
  }
}
function isAgentAssignableRole(value) {
  return value === "viewer" || value === "editor" || value === "forwarder";
}
function isPermissionRequestStatus(value) {
  return value === "pending" || value === "approved" || value === "rejected" || value === "cancelled";
}
function normalizeExternalProvider(value) {
  if (value === "google_workspace" || value === "notion" || value === "microsoft_365") {
    return value;
  }
  return void 0;
}
function normalizeOptional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function requireTrimmed(value, label) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}
function ensureWorkspaceExists(workspaceId) {
  const row = getDatabase().prepare("SELECT 1 FROM workspace WHERE id = ? LIMIT 1").get(workspaceId);
  if (!row) {
    throw new Error(`Workspace "${workspaceId}" does not exist.`);
  }
}
function ensureUserExists(userId) {
  const row = getDatabase().prepare("SELECT 1 FROM users WHERE id = ? LIMIT 1").get(userId);
  if (!row) {
    throw new Error(`User "${userId}" does not exist.`);
  }
}

// ../db/src/knowledge-proposals.ts
function createKnowledgeProposalSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = `knowledge-proposal-${randomLikeId()}`;
  const assignmentMode = input.assignmentMode ?? "selected_agents";
  db.prepare(
    `INSERT INTO knowledge_proposal (
      id,
      workspace_id,
      source_task_queue_id,
      source_channel_name,
      source_agent_name,
      operation,
      status,
      title,
      content_markdown,
      summary,
      reason,
      tags_json,
      parent_id,
      assignment_mode,
      assigned_employee_names_json,
      target_knowledge_page_id,
      base_updated_at,
      created_knowledge_page_id,
      approval_id,
      decided_by_user_id,
      decided_at,
      reviewer_comment,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`
  ).run(
    id,
    workspaceId,
    requireTrimmed2(input.sourceTaskQueueId, "sourceTaskQueueId"),
    normalizeOptional2(input.sourceChannelName) ?? null,
    requireTrimmed2(input.sourceAgentName, "sourceAgentName"),
    input.operation,
    requireTrimmed2(input.title, "title"),
    input.contentMarkdown,
    normalizeOptional2(input.summary) ?? null,
    normalizeOptional2(input.reason) ?? null,
    JSON.stringify(normalizeStringList(input.tags)),
    normalizeOptional2(input.parentId ?? void 0) ?? null,
    assignmentMode,
    JSON.stringify(normalizeStringList(input.assignedEmployeeNames)),
    normalizeOptional2(input.targetKnowledgePageId) ?? null,
    normalizeOptional2(input.baseUpdatedAt) ?? null,
    normalizeOptional2(input.approvalId) ?? null,
    now,
    now
  );
  const record = readKnowledgeProposalSync(id, workspaceId);
  if (!record) {
    throw new Error(`Knowledge proposal "${id}" could not be read after write.`);
  }
  return record;
}
function readKnowledgeProposalSync(proposalId, workspaceId) {
  const db = getDatabase();
  const row = workspaceId ? db.prepare(knowledgeProposalSelectSql("id = ? AND workspace_id = ?")).get(proposalId, workspaceId) : db.prepare(knowledgeProposalSelectSql("id = ?")).get(proposalId);
  return row ? mapKnowledgeProposalRecord(row) : null;
}
function updateKnowledgeProposalApprovalIdSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  getDatabase().prepare(
    `UPDATE knowledge_proposal
     SET approval_id = ?,
         updated_at = ?
     WHERE id = ? AND workspace_id = ?`
  ).run(requireTrimmed2(input.approvalId, "approvalId"), now, input.proposalId, workspaceId);
  const updated = readKnowledgeProposalSync(input.proposalId, workspaceId);
  if (!updated) {
    throw new Error(`Knowledge proposal "${input.proposalId}" does not exist.`);
  }
  return updated;
}
function knowledgeProposalSelectSql(where) {
  return `SELECT
      id,
      workspace_id AS workspaceId,
      source_task_queue_id AS sourceTaskQueueId,
      source_channel_name AS sourceChannelName,
      source_agent_name AS sourceAgentName,
      operation,
      status,
      title,
      content_markdown AS contentMarkdown,
      summary,
      reason,
      tags_json AS tagsJson,
      parent_id AS parentId,
      assignment_mode AS assignmentMode,
      assigned_employee_names_json AS assignedEmployeeNamesJson,
      target_knowledge_page_id AS targetKnowledgePageId,
      base_updated_at AS baseUpdatedAt,
      created_knowledge_page_id AS createdKnowledgePageId,
      approval_id AS approvalId,
      decided_by_user_id AS decidedByUserId,
      decided_at AS decidedAt,
      reviewer_comment AS reviewerComment,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM knowledge_proposal
     WHERE ${where}`;
}
function mapKnowledgeProposalRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.sourceTaskQueueId !== "string" || typeof value.sourceAgentName !== "string" || !isKnowledgeProposalOperation(value.operation) || !isKnowledgeProposalStatus(value.status) || typeof value.title !== "string" || typeof value.contentMarkdown !== "string" || !isKnowledgeAssignmentMode(value.assignmentMode) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    sourceTaskQueueId: value.sourceTaskQueueId,
    sourceChannelName: optionalString(value.sourceChannelName),
    sourceAgentName: value.sourceAgentName,
    operation: value.operation,
    status: value.status,
    title: value.title,
    contentMarkdown: value.contentMarkdown,
    summary: optionalString(value.summary),
    reason: optionalString(value.reason),
    tags: parseStringJsonArray(value.tagsJson),
    parentId: optionalString(value.parentId),
    assignmentMode: value.assignmentMode,
    assignedEmployeeNames: parseStringJsonArray(value.assignedEmployeeNamesJson),
    targetKnowledgePageId: optionalString(value.targetKnowledgePageId),
    baseUpdatedAt: optionalString(value.baseUpdatedAt),
    createdKnowledgePageId: optionalString(value.createdKnowledgePageId),
    approvalId: optionalString(value.approvalId),
    decidedByUserId: optionalString(value.decidedByUserId),
    decidedAt: optionalString(value.decidedAt),
    reviewerComment: optionalString(value.reviewerComment),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}
function isKnowledgeProposalOperation(value) {
  return value === "create" || value === "update";
}
function isKnowledgeProposalStatus(value) {
  return value === "pending" || value === "approved" || value === "rejected" || value === "stale" || value === "cancelled";
}
function isKnowledgeAssignmentMode(value) {
  return value === "all_agents" || value === "selected_agents";
}
function parseStringJsonArray(value) {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return normalizeStringList(parsed);
}
function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed && !result.some((existing) => existing.localeCompare(trimmed, "zh-CN", { sensitivity: "base" }) === 0)) {
      result.push(trimmed);
    }
  }
  return result;
}
function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function normalizeOptional2(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function requireTrimmed2(value, label) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

// ../db/src/notifications.ts
function createWorkspaceNotificationSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const id = `notification-${randomLikeId()}`;
  const recipientId = normalizeRequired(input.recipientId, "recipientId");
  const type = normalizeRequired(input.type, "type");
  const title = normalizeRequired(input.title, "title");
  const body = normalizeRequired(input.body, "body");
  const severity = normalizeSeverity(input.severity);
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const actorType = normalizeActorType(input.actorType);
  const actorId = normalizeOptional3(input.actorId);
  const resourceType = normalizeResourceType(input.resourceType);
  const resourceId = normalizeOptional3(input.resourceId);
  const channelName = normalizeOptional3(input.channelName);
  const actionHref = normalizeOptional3(input.actionHref);
  const dedupeKey = normalizeOptional3(input.dedupeKey);
  if (!isRecipientType(input.recipientType)) {
    throw new Error(`Invalid notification recipient type "${input.recipientType}".`);
  }
  db.prepare(
    `INSERT INTO workspace_notification (
      id,
      workspace_id,
      recipient_type,
      recipient_id,
      actor_type,
      actor_id,
      type,
      resource_type,
      resource_id,
      channel_name,
      title,
      body,
      action_href,
      severity,
      status,
      dedupe_key,
      metadata_json,
      created_at,
      read_at,
      archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?, ?, NULL, NULL)
    ON CONFLICT(workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET
      recipient_type = EXCLUDED.recipient_type,
      recipient_id = EXCLUDED.recipient_id,
      actor_type = EXCLUDED.actor_type,
      actor_id = EXCLUDED.actor_id,
      type = EXCLUDED.type,
      resource_type = EXCLUDED.resource_type,
      resource_id = EXCLUDED.resource_id,
      channel_name = EXCLUDED.channel_name,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      action_href = EXCLUDED.action_href,
      severity = EXCLUDED.severity,
      metadata_json = EXCLUDED.metadata_json`
  ).run(
    id,
    workspaceId,
    input.recipientType,
    recipientId,
    actorType ?? null,
    actorId ?? null,
    type,
    resourceType,
    resourceId ?? null,
    channelName ?? null,
    title,
    body,
    actionHref ?? null,
    severity,
    dedupeKey ?? null,
    metadataJson,
    now
  );
  const record = dedupeKey ? readWorkspaceNotificationByDedupeKeySync(workspaceId, dedupeKey) : readWorkspaceNotificationSync(id, workspaceId);
  if (!record) {
    throw new Error("Notification could not be read after write.");
  }
  return record;
}
function createWorkspaceNotificationsSync(inputs) {
  return inputs.map((input) => createWorkspaceNotificationSync(input));
}
function listWorkspaceNotificationsForRecipientSync(options) {
  const db = getDatabase();
  const workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const recipientId = normalizeRequired(options.recipientId, "recipientId");
  if (!isRecipientType(options.recipientType)) {
    throw new Error(`Invalid notification recipient type "${options.recipientType}".`);
  }
  const conditions = ["workspace_id = ?", "recipient_type = ?", "recipient_id = ?"];
  const params = [workspaceId, options.recipientType, recipientId];
  const statuses = normalizeStatusFilter(options.status);
  if (statuses.length > 0) {
    conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  } else if (!options.includeArchived) {
    conditions.push("status <> 'archived'");
  }
  const limit = normalizeLimit(options.limit);
  const rows = db.prepare(
    `${workspaceNotificationSelectSql()}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).all(...params, limit);
  return rows.map(mapWorkspaceNotificationRecord).filter((record) => record !== null);
}
function readWorkspaceNotificationSync(notificationId, workspaceId) {
  const row = getDatabase().prepare(
    `${workspaceNotificationSelectSql()}
     WHERE id = ? AND workspace_id = ?`
  ).get(notificationId, workspaceId);
  return row ? mapWorkspaceNotificationRecord(row) : null;
}
function readWorkspaceNotificationByDedupeKeySync(workspaceId, dedupeKey) {
  const row = getDatabase().prepare(
    `${workspaceNotificationSelectSql()}
     WHERE workspace_id = ? AND dedupe_key = ?`
  ).get(workspaceId, dedupeKey);
  return row ? mapWorkspaceNotificationRecord(row) : null;
}
function workspaceNotificationSelectSql() {
  return `SELECT
    id,
    workspace_id AS workspaceId,
    recipient_type AS recipientType,
    recipient_id AS recipientId,
    actor_type AS actorType,
    actor_id AS actorId,
    type,
    resource_type AS resourceType,
    resource_id AS resourceId,
    channel_name AS channelName,
    title,
    body,
    action_href AS actionHref,
    severity,
    status,
    dedupe_key AS dedupeKey,
    metadata_json AS metadataJson,
    created_at AS createdAt,
    read_at AS readAt,
    archived_at AS archivedAt
   FROM workspace_notification`;
}
function mapWorkspaceNotificationRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || !isRecipientType(value.recipientType) || typeof value.recipientId !== "string" || typeof value.type !== "string" || !isResourceType(value.resourceType) || typeof value.title !== "string" || typeof value.body !== "string" || !isSeverity(value.severity) || !isStatus(value.status) || !isRecordMetadataJson(value.metadataJson) || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    recipientType: value.recipientType,
    recipientId: value.recipientId,
    actorType: isActorType(value.actorType) ? value.actorType : void 0,
    actorId: typeof value.actorId === "string" ? value.actorId : void 0,
    type: value.type,
    resourceType: value.resourceType,
    resourceId: typeof value.resourceId === "string" ? value.resourceId : void 0,
    channelName: typeof value.channelName === "string" ? value.channelName : void 0,
    title: value.title,
    body: value.body,
    actionHref: typeof value.actionHref === "string" ? value.actionHref : void 0,
    severity: value.severity,
    status: value.status,
    dedupeKey: typeof value.dedupeKey === "string" ? value.dedupeKey : void 0,
    metadataJson: normalizeMetadataJson(value.metadataJson),
    createdAt: value.createdAt,
    readAt: typeof value.readAt === "string" ? value.readAt : void 0,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : void 0
  };
}
function normalizeRequired(value, fieldName) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}
function normalizeOptional3(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function isRecordMetadataJson(value) {
  return typeof value === "string" || Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeMetadataJson(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value ?? {});
}
function normalizeLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(Math.round(value), 500));
}
function normalizeStatusFilter(value) {
  const statuses = Array.isArray(value) ? value : value ? [value] : [];
  return statuses.filter(isStatus);
}
function normalizeActorType(value) {
  if (value === void 0) {
    return void 0;
  }
  if (!isActorType(value)) {
    throw new Error(`Invalid notification actor type "${value}".`);
  }
  return value;
}
function normalizeResourceType(value) {
  if (!isResourceType(value)) {
    throw new Error(`Invalid notification resource type "${value}".`);
  }
  return value;
}
function normalizeSeverity(value) {
  if (value === void 0) {
    return "info";
  }
  if (!isSeverity(value)) {
    throw new Error(`Invalid notification severity "${value}".`);
  }
  return value;
}
function isRecipientType(value) {
  return value === "human" || value === "agent";
}
function isActorType(value) {
  return value === "human" || value === "agent" || value === "system";
}
function isResourceType(value) {
  return value === "workspace" || value === "workspace_member" || value === "agent" || value === "agent_fork_invitation" || value === "channel" || value === "document" || value === "runtime" || value === "task" || value === "approval";
}
function isSeverity(value) {
  return value === "info" || value === "success" || value === "warning" || value === "critical";
}
function isStatus(value) {
  return value === "unread" || value === "read" || value === "archived";
}

// ../db/src/runtime-apps.ts
function readRuntimeAppCatalogItemSync(source, name) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
      source,
      name,
      display_name AS displayName,
      description,
      version,
      category,
      entry_point AS entryPoint,
      install_strategy AS installStrategy,
      install_cmd AS installCmd,
      uninstall_cmd AS uninstallCmd,
      update_cmd AS updateCmd,
      skill_md AS skillMd,
      requires_text AS requiresText,
      homepage,
      registry_json AS registryJson,
      synced_at AS syncedAt
     FROM runtime_app_catalog_item
     WHERE source = ? AND name = ?`
  ).get(source, name.trim());
  return row ? mapRuntimeAppCatalogItemRecord(row) : null;
}
function listRuntimeInstalledAppsSync(options = {}) {
  const db = getDatabase();
  const workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const where = ["workspace_id = ?"];
  const params = [workspaceId];
  if (options.runtimeId) {
    where.push("runtime_id = ?");
    params.push(options.runtimeId);
  }
  if (options.enabledOnly) {
    where.push("enabled = 1");
    where.push("status = 'installed'");
  }
  const rows = db.prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      runtime_id AS runtimeId,
      source,
      name,
      display_name AS displayName,
      version,
      entry_point AS entryPoint,
      status,
      install_strategy AS installStrategy,
      enabled,
      installed_by_user_id AS installedByUserId,
      installed_at AS installedAt,
      updated_at AS updatedAt,
      last_checked_at AS lastCheckedAt,
      last_error AS lastError,
      metadata_json AS metadataJson
     FROM runtime_installed_app
     WHERE ${where.join(" AND ")}
     ORDER BY display_name ASC, name ASC`
  ).all(...params);
  return rows.map(mapRuntimeInstalledAppRecord).filter((row) => row !== null);
}
function mapRuntimeAppCatalogItemRecord(value) {
  if (!isRuntimeAppCatalogSource(value.source) || typeof value.name !== "string" || typeof value.displayName !== "string" || typeof value.description !== "string" || typeof value.version !== "string" || typeof value.category !== "string" || typeof value.entryPoint !== "string" || typeof value.installStrategy !== "string" || typeof value.registryJson !== "string" || typeof value.syncedAt !== "string") {
    return null;
  }
  return {
    source: value.source,
    name: value.name,
    displayName: value.displayName,
    description: value.description,
    version: value.version,
    category: value.category,
    entryPoint: value.entryPoint,
    installStrategy: isRuntimeAppInstallStrategy(value.installStrategy) ? value.installStrategy : "",
    installCmd: readOptionalString(value.installCmd),
    uninstallCmd: readOptionalString(value.uninstallCmd),
    updateCmd: readOptionalString(value.updateCmd),
    skillMd: readOptionalString(value.skillMd),
    requiresText: readOptionalString(value.requiresText),
    homepage: readOptionalString(value.homepage),
    registryJson: value.registryJson,
    syncedAt: value.syncedAt
  };
}
function mapRuntimeInstalledAppRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.runtimeId !== "string" || !isRuntimeAppCatalogSource(value.source) || typeof value.name !== "string" || typeof value.displayName !== "string" || typeof value.version !== "string" || typeof value.entryPoint !== "string" || !isRuntimeInstalledAppStatus(value.status) || typeof value.installStrategy !== "string" || typeof value.updatedAt !== "string" || typeof value.metadataJson !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    runtimeId: value.runtimeId,
    source: value.source,
    name: value.name,
    displayName: value.displayName,
    version: value.version,
    entryPoint: value.entryPoint,
    status: value.status,
    installStrategy: isRuntimeAppInstallStrategy(value.installStrategy) ? value.installStrategy : "",
    enabled: value.enabled === true || value.enabled === 1 || value.enabled === "1",
    installedByUserId: readOptionalString(value.installedByUserId),
    installedAt: readOptionalString(value.installedAt),
    updatedAt: value.updatedAt,
    lastCheckedAt: readOptionalString(value.lastCheckedAt),
    lastError: readOptionalString(value.lastError),
    metadataJson: value.metadataJson
  };
}
function isRuntimeAppCatalogSource(value) {
  return value === "clihub_harness" || value === "clihub_public";
}
function isRuntimeAppInstallStrategy(value) {
  return value === "cli_hub" || value === "pip" || value === "npm" || value === "uv" || value === "bundled" || value === "manual";
}
function isRuntimeInstalledAppStatus(value) {
  return value === "installed" || value === "installing" || value === "failed" || value === "disabled" || value === "missing";
}
function readOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}

// ../db/src/skills.ts
var DEFAULT_SKILL_SOURCE_TYPE = "manual";
var DEFAULT_SKILL_CONFIG_JSON = "{}";
function listStoredWorkspaceSkillsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const skillRows = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        name,
        description,
        source_type AS sourceType,
        source_url AS sourceUrl,
        config_json AS configJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM skill
      WHERE workspace_id = ?
      ORDER BY LOWER(name) ASC, name ASC`
  ).all(workspaceId);
  const fileRows = db.prepare(
    `SELECT
        sf.id,
        sf.skill_id AS skillId,
        sf.path,
        sf.content,
        sf.created_at AS createdAt,
        sf.updated_at AS updatedAt
      FROM skill_file sf
      JOIN skill s ON s.id = sf.skill_id
      WHERE s.workspace_id = ?
      ORDER BY
        CASE WHEN lower(sf.path) = lower('SKILL.md') THEN 0 ELSE 1 END,
        LOWER(sf.path) ASC, sf.path ASC`
  ).all(workspaceId);
  const skills = skillRows.map((row) => mapStoredSkillRecord(row)).filter((row) => row !== null);
  const files = fileRows.map((row) => mapStoredSkillFileRecord(row)).filter((row) => row !== null);
  const filesBySkillId = /* @__PURE__ */ new Map();
  for (const file of files) {
    const next = filesBySkillId.get(file.skillId) ?? [];
    next.push(file);
    filesBySkillId.set(file.skillId, next);
  }
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    sourceType: skill.sourceType,
    sourceUrl: skill.sourceUrl,
    configJson: skill.configJson,
    files: filesBySkillId.get(skill.id)?.map((file) => ({
      id: file.id,
      path: file.path,
      content: file.content,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    })) ?? [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt
  }));
}
function readStoredWorkspaceSkillSync(skillId, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listStoredWorkspaceSkillsSync(workspaceId).find((skill) => skill.id === skillId) ?? null;
}
function listStoredAgentSkillAssignmentsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const hasAgentIdColumn = agentSkillTableHasAgentIdColumn(db);
  const rows = db.prepare(
    `SELECT
        workspace_id AS workspaceId,
        ${hasAgentIdColumn ? "agent_id" : "NULL"} AS agentId,
        employee_name AS employeeName,
        skill_id AS skillId,
        created_at AS createdAt
      FROM agent_skill
      WHERE workspace_id = ?
      ORDER BY LOWER(employee_name) ASC, employee_name ASC, skill_id ASC`
  ).all(workspaceId);
  return rows.map((row) => mapStoredAgentSkillRecord(row)).filter((row) => row !== null);
}
function recordStoredSkillImportEventSync(input) {
  const db = getDatabase();
  const id = `skill-import-${randomLikeId()}`;
  const importedAt = input.importedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const metadataJson = input.metadataJson?.trim() || "{}";
  db.prepare(
    `INSERT INTO skill_import_event (
      id,
      workspace_id,
      skill_id,
      skill_name,
      source_type,
      source_url,
      import_mode,
      metadata_json,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    input.skillId?.trim() || null,
    input.skillName.trim(),
    input.sourceType.trim(),
    input.sourceUrl?.trim() || null,
    input.importMode,
    metadataJson,
    importedAt
  );
  return {
    id,
    workspaceId,
    skillId: input.skillId?.trim() || void 0,
    skillName: input.skillName.trim(),
    sourceType: input.sourceType.trim(),
    sourceUrl: input.sourceUrl?.trim() || void 0,
    importMode: input.importMode,
    metadataJson,
    importedAt
  };
}
function replaceStoredWorkspaceSkillsSync(skills, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare("DELETE FROM skill WHERE workspace_id = ?").run(workspaceId);
    for (const skill of skills) {
      db.prepare(
        `INSERT INTO skill (
          id,
          workspace_id,
          name,
          description,
          source_type,
          source_url,
          config_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        skill.id,
        workspaceId,
        skill.name,
        skill.description,
        skill.sourceType?.trim() || DEFAULT_SKILL_SOURCE_TYPE,
        skill.sourceUrl?.trim() || null,
        skill.configJson?.trim() || DEFAULT_SKILL_CONFIG_JSON,
        skill.createdAt,
        skill.updatedAt
      );
      for (const file of skill.files) {
        db.prepare(
          `INSERT INTO skill_file (
            id,
            skill_id,
            path,
            content,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(file.id, skill.id, file.path, file.content, file.createdAt, file.updatedAt);
      }
    }
  });
}
function createStoredWorkspaceSkillSync(skill, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO skill (
        id,
        workspace_id,
        name,
        description,
        source_type,
        source_url,
        config_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      skill.id,
      workspaceId,
      skill.name,
      skill.description,
      skill.sourceType?.trim() || DEFAULT_SKILL_SOURCE_TYPE,
      skill.sourceUrl?.trim() || null,
      skill.configJson?.trim() || DEFAULT_SKILL_CONFIG_JSON,
      skill.createdAt,
      skill.updatedAt
    );
    for (const file of skill.files) {
      db.prepare(
        `INSERT INTO skill_file (
          id,
          skill_id,
          path,
          content,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(file.id, skill.id, file.path, file.content, file.createdAt, file.updatedAt);
    }
  });
  return readStoredWorkspaceSkillSync(skill.id, workspaceId) ?? skill;
}
function updateStoredWorkspaceSkillMetaSync(input, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const result = db.prepare(
    `UPDATE skill
       SET name = ?,
           description = ?,
           source_type = ?,
           source_url = ?,
           config_json = ?,
           updated_at = ?
       WHERE workspace_id = ? AND id = ?`
  ).run(
    input.name,
    input.description,
    input.sourceType?.trim() || DEFAULT_SKILL_SOURCE_TYPE,
    input.sourceUrl?.trim() || null,
    input.configJson?.trim() || DEFAULT_SKILL_CONFIG_JSON,
    input.updatedAt,
    workspaceId,
    input.skillId
  );
  if (result.changes === 0) {
    return null;
  }
  return readStoredWorkspaceSkillSync(input.skillId, workspaceId);
}
function upsertStoredWorkspaceSkillFileSync(input, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    const skillExists = db.prepare("SELECT id FROM skill WHERE workspace_id = ? AND id = ?").get(workspaceId, input.skillId);
    if (!skillExists) {
      throw new Error(`Skill "${input.skillId}" does not exist.`);
    }
    db.prepare(
      `INSERT INTO skill_file (
        id,
        skill_id,
        path,
        content,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        content = excluded.content,
        updated_at = excluded.updated_at`
    ).run(
      input.file.id,
      input.skillId,
      input.file.path,
      input.file.content,
      input.file.createdAt,
      input.file.updatedAt
    );
    db.prepare(
      `UPDATE skill
       SET updated_at = ?
       WHERE workspace_id = ? AND id = ?`
    ).run(input.skillUpdatedAt, workspaceId, input.skillId);
  });
  return readStoredWorkspaceSkillSync(input.skillId, workspaceId);
}
function deleteStoredWorkspaceSkillFileSync(skillId, fileId, skillUpdatedAt, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    const result = db.prepare(
      `DELETE FROM skill_file
         WHERE id = ? AND skill_id = ?`
    ).run(fileId, skillId);
    if (result.changes === 0) {
      throw new Error(`Skill file "${fileId}" does not exist.`);
    }
    db.prepare(
      `UPDATE skill
       SET updated_at = ?
       WHERE workspace_id = ? AND id = ?`
    ).run(skillUpdatedAt, workspaceId, skillId);
  });
  return readStoredWorkspaceSkillSync(skillId, workspaceId);
}
function replaceStoredAgentSkillAssignmentsSync(assignments, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const hasAgentIdColumn = agentSkillTableHasAgentIdColumn(db);
  withTransaction(db, () => {
    db.prepare("DELETE FROM agent_skill WHERE workspace_id = ?").run(workspaceId);
    for (const assignment of assignments) {
      for (const skillId of assignment.skillIds) {
        if (hasAgentIdColumn) {
          db.prepare(
            `INSERT INTO agent_skill (
              workspace_id,
              agent_id,
              employee_name,
              skill_id,
              created_at
            ) VALUES (?, ?, ?, ?, ?)`
          ).run(workspaceId, buildLegacyAgentId(assignment.employeeName), assignment.employeeName, skillId, now);
        } else {
          db.prepare(
            `INSERT INTO agent_skill (
              workspace_id,
              employee_name,
              skill_id,
              created_at
            ) VALUES (?, ?, ?, ?)`
          ).run(workspaceId, assignment.employeeName, skillId, now);
        }
      }
    }
  });
}
function setStoredEmployeeSkillAssignmentsSync(employeeName, skillIds, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const hasAgentIdColumn = agentSkillTableHasAgentIdColumn(db);
  withTransaction(db, () => {
    db.prepare(
      `DELETE FROM agent_skill
       WHERE workspace_id = ? AND employee_name = ?`
    ).run(workspaceId, employeeName);
    for (const skillId of skillIds) {
      if (hasAgentIdColumn) {
        db.prepare(
          `INSERT INTO agent_skill (
            workspace_id,
            agent_id,
            employee_name,
            skill_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?)`
        ).run(workspaceId, buildLegacyAgentId(employeeName), employeeName, skillId, now);
      } else {
        db.prepare(
          `INSERT INTO agent_skill (
            workspace_id,
            employee_name,
            skill_id,
            created_at
          ) VALUES (?, ?, ?, ?)`
        ).run(workspaceId, employeeName, skillId, now);
      }
    }
  });
}
function mapStoredSkillRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.name !== "string" || typeof value.description !== "string" || typeof value.sourceType !== "string" || typeof value.configJson !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    name: value.name,
    description: value.description,
    sourceType: value.sourceType,
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : void 0,
    configJson: value.configJson,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}
function mapStoredSkillFileRecord(value) {
  if (typeof value.id !== "string" || typeof value.skillId !== "string" || typeof value.path !== "string" || typeof value.content !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    skillId: value.skillId,
    path: value.path,
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}
function mapStoredAgentSkillRecord(value) {
  if (typeof value.workspaceId !== "string" || typeof value.employeeName !== "string" || typeof value.skillId !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    workspaceId: value.workspaceId,
    agentId: typeof value.agentId === "string" ? value.agentId : void 0,
    employeeName: value.employeeName,
    skillId: value.skillId,
    createdAt: value.createdAt
  };
}
function buildLegacyAgentId(employeeName) {
  return `agent:${employeeName.trim()}`;
}
function agentSkillTableHasAgentIdColumn(_db) {
  return true;
}

// ../db/src/knowledge-assignments.ts
function listStoredKnowledgeAssignmentPoliciesSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
       workspace_id AS workspaceId,
       knowledge_page_id AS knowledgePageId,
       assignment_mode AS assignmentMode,
       updated_at AS updatedAt,
       updated_by AS updatedBy
     FROM knowledge_page_assignment_policy
     WHERE workspace_id = ?
     ORDER BY updated_at DESC, knowledge_page_id ASC`
  ).all(workspaceId);
  return rows.map((row) => mapStoredKnowledgeAssignmentPolicyRecord(row)).filter((row) => row !== null);
}
function listStoredAgentKnowledgePageAssignmentsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
       workspace_id AS workspaceId,
       agent_id AS agentId,
       employee_name AS employeeName,
       knowledge_page_id AS knowledgePageId,
       created_at AS createdAt,
       created_by AS createdBy
     FROM agent_knowledge_page
     WHERE workspace_id = ?
     ORDER BY LOWER(employee_name) ASC, employee_name ASC, created_at ASC, knowledge_page_id ASC`
  ).all(workspaceId);
  return rows.map((row) => mapStoredAgentKnowledgePageRecord(row)).filter((row) => row !== null);
}
function listStoredKnowledgeAssignmentsByEmployeeSync(employeeName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listStoredAgentKnowledgePageAssignmentsSync(workspaceId).filter((assignment) => assignment.employeeName === employeeName);
}
function mapStoredKnowledgeAssignmentPolicyRecord(value) {
  if (typeof value.workspaceId !== "string" || typeof value.knowledgePageId !== "string" || !isKnowledgeAssignmentMode2(value.assignmentMode) || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    workspaceId: value.workspaceId,
    knowledgePageId: value.knowledgePageId,
    assignmentMode: value.assignmentMode,
    updatedAt: value.updatedAt,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : ""
  };
}
function mapStoredAgentKnowledgePageRecord(value) {
  if (typeof value.workspaceId !== "string" || typeof value.employeeName !== "string" || typeof value.knowledgePageId !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    workspaceId: value.workspaceId,
    agentId: typeof value.agentId === "string" ? value.agentId : void 0,
    employeeName: value.employeeName,
    knowledgePageId: value.knowledgePageId,
    createdAt: value.createdAt,
    createdBy: typeof value.createdBy === "string" ? value.createdBy : ""
  };
}
function isKnowledgeAssignmentMode2(value) {
  return value === "all_agents" || value === "selected_agents";
}

// ../db/src/types.ts
var TASK_EXECUTION_EVENT_TYPES = [
  "queued",
  "assigned",
  "workspace_prepared",
  "context_loaded",
  "tool_started",
  "tool_finished",
  "artifact_detected",
  "artifact_collected",
  "approval_requested",
  "approval_reviewed",
  "blocked",
  "handoff_created",
  "message_posted",
  "completed",
  "failed",
  "cancelled"
];
function isNativeTaskStatus(value) {
  return value === "queued" || value === "claimed" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}
function isTaskExecutionEventType(value) {
  return typeof value === "string" && TASK_EXECUTION_EVENT_TYPES.includes(value);
}
function isTaskExecutionEventSeverity(value) {
  return value === "info" || value === "warning" || value === "error";
}
function isTaskExecutionEventStatus(value) {
  return value === "pending" || value === "running" || value === "succeeded" || value === "failed";
}

// ../db/src/task-execution-events.ts
function recordTaskExecutionEventSync(input) {
  const db = getDatabase();
  const eventId = `task-event-${randomLikeId()}`;
  const now = input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const severity = input.severity ?? "info";
  const dataJson = JSON.stringify(input.data ?? {});
  db.prepare(
    `INSERT INTO task_execution_event (
      id,
      workspace_id,
      task_id,
      channel_name,
      agent_id,
      runtime_id,
      run_id,
      type,
      title,
      summary,
      severity,
      status,
      data_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    workspaceId,
    input.taskId,
    input.channelName ?? "",
    input.agentId,
    input.runtimeId ?? null,
    input.runId ?? null,
    input.type,
    input.title,
    input.summary ?? null,
    severity,
    input.status ?? null,
    dataJson,
    now
  );
  const event = readTaskExecutionEventSync(eventId);
  if (!event) {
    throw new Error(`Task execution event "${eventId}" could not be read back.`);
  }
  projectTaskExecutionEventToRouterEvent(event);
  return event;
}
function buildTaskExecutionEventContext(task) {
  const payload = safeParseJsonObject(task.inputJson);
  const channelName = readFirstString(payload, ["channelName", "channel", "contactId"]) ?? "";
  return {
    workspaceId: task.workspaceId,
    taskId: task.id,
    channelName,
    agentId: readFirstString(payload, ["assignee"]) ?? task.agentId,
    runtimeId: task.runtimeId,
    runId: task.sessionId,
    taskTitle: readFirstString(payload, ["title", "taskTitle"]),
    issueId: task.issueId,
    triggerType: task.triggerType
  };
}
function readTaskExecutionEventSync(eventId) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      task_id AS taskId,
      channel_name AS channelName,
      agent_id AS agentId,
      runtime_id AS runtimeId,
      run_id AS runId,
      type,
      title,
      summary,
      severity,
      status,
      data_json AS dataJson,
      created_at AS createdAt
     FROM task_execution_event
     WHERE id = ?`
  ).get(eventId);
  return row ? mapTaskExecutionEventRecord(row) : null;
}
function mapTaskExecutionEventRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.taskId !== "string" || typeof value.channelName !== "string" || typeof value.agentId !== "string" || !isTaskExecutionEventType(value.type) || typeof value.title !== "string" || !isTaskExecutionEventSeverity(value.severity) || typeof value.dataJson !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  const status = isTaskExecutionEventStatus(value.status) ? value.status : void 0;
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    taskId: value.taskId,
    channelName: value.channelName,
    agentId: value.agentId,
    runtimeId: typeof value.runtimeId === "string" ? value.runtimeId : void 0,
    runId: typeof value.runId === "string" ? value.runId : void 0,
    type: value.type,
    title: value.title,
    summary: typeof value.summary === "string" ? value.summary : void 0,
    severity: value.severity,
    status,
    dataJson: value.dataJson,
    createdAt: value.createdAt
  };
}
function safeParseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function readFirstString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return void 0;
}
function projectTaskExecutionEventToRouterEvent(event) {
  const task = readQueuedTaskSync(event.taskId);
  if (!task?.routerSessionId) {
    return;
  }
  const attempt = readLatestAgentTaskAttemptForTaskSync(event.taskId);
  recordAgentRouterEventSync({
    workspaceId: event.workspaceId,
    routerSessionId: task.routerSessionId,
    taskQueueId: event.taskId,
    attemptId: attempt?.id,
    type: `task.${event.type}`,
    actorType: event.runtimeId ? "runtime" : "system",
    actorId: event.runtimeId ?? event.agentId,
    runtimeId: event.runtimeId,
    summary: event.summary ?? event.title,
    data: {
      taskExecutionEventId: event.id,
      title: event.title,
      severity: event.severity,
      status: event.status,
      channelName: event.channelName,
      runId: event.runId,
      ...safeParseJsonObject(event.dataJson)
    },
    createdAt: event.createdAt
  });
}

// ../db/src/task-queue.ts
function listQueuedTasksSync(options) {
  const db = getDatabase();
  const where = [];
  const params = [];
  if (typeof options?.workspaceId === "string") {
    where.push("workspace_id = ?");
    params.push(options.workspaceId);
  }
  if (typeof options?.runtimeId === "string") {
    where.push("runtime_id = ?");
    params.push(options.runtimeId);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        agent_id AS agentId,
        runtime_id AS runtimeId,
        router_session_id AS routerSessionId,
        issue_id AS issueId,
        trigger_type AS triggerType,
        priority,
        status,
        input_json AS inputJson,
        requested_by_user_id AS requestedByUserId,
        requested_by_display_name AS requestedByDisplayName,
        result_json AS resultJson,
        error_text AS errorText,
        session_id AS sessionId,
        work_dir AS workDir,
        queued_at AS queuedAt,
        claimed_at AS claimedAt,
        started_at AS startedAt,
        finished_at AS finishedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM agent_task_queue
      ${whereClause}
      ORDER BY created_at ASC`
  ).all(...params);
  return rows.map((row) => mapQueuedTaskRecord(row)).filter((row) => row !== null);
}
function readQueuedTaskSync(taskId) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        agent_id AS agentId,
        runtime_id AS runtimeId,
        router_session_id AS routerSessionId,
        issue_id AS issueId,
        trigger_type AS triggerType,
        priority,
        status,
        input_json AS inputJson,
        requested_by_user_id AS requestedByUserId,
        requested_by_display_name AS requestedByDisplayName,
        result_json AS resultJson,
        error_text AS errorText,
        session_id AS sessionId,
        work_dir AS workDir,
        queued_at AS queuedAt,
        claimed_at AS claimedAt,
        started_at AS startedAt,
        finished_at AS finishedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM agent_task_queue
      WHERE id = ?`
  ).get(taskId);
  return row ? mapQueuedTaskRecord(row) : null;
}
function mapQueuedTaskRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.agentId !== "string" || typeof value.runtimeId !== "string" || typeof value.triggerType !== "string" || typeof value.priority !== "number" || !isNativeTaskStatus(value.status) || typeof value.inputJson !== "string" || typeof value.queuedAt !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    agentId: value.agentId,
    runtimeId: value.runtimeId,
    routerSessionId: typeof value.routerSessionId === "string" ? value.routerSessionId : void 0,
    issueId: typeof value.issueId === "string" ? value.issueId : void 0,
    triggerType: value.triggerType,
    priority: value.priority,
    status: value.status,
    inputJson: value.inputJson,
    requestedByUserId: typeof value.requestedByUserId === "string" ? value.requestedByUserId : void 0,
    requestedByDisplayName: typeof value.requestedByDisplayName === "string" ? value.requestedByDisplayName : void 0,
    resultJson: typeof value.resultJson === "string" ? value.resultJson : void 0,
    errorText: typeof value.errorText === "string" ? value.errorText : void 0,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : void 0,
    workDir: typeof value.workDir === "string" ? value.workDir : void 0,
    queuedAt: value.queuedAt,
    claimedAt: typeof value.claimedAt === "string" ? value.claimedAt : void 0,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : void 0,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : void 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

// ../db/src/workspaces.ts
import { randomBytes } from "node:crypto";
var JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var JOIN_CODE_LENGTH = 8;
var JOIN_CODE_MAX_ATTEMPTS = 20;
function generateSlug(name, id) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const suffix = id.slice(0, 6);
  return `${base}-${suffix}`;
}
function createWorkspaceSync(params) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = params.id ?? randomLikeId();
  const slug = params.slug ?? generateSlug(params.name, id);
  const joinCode = generateUniqueWorkspaceJoinCodeSync();
  db.prepare(
    `INSERT INTO workspace (
       id, slug, name, created_by, created_at, updated_at,
       join_code, join_code_updated_at, join_code_updated_by
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, slug, params.name, params.createdBy, now, now, joinCode, now, params.createdBy);
  return {
    id,
    slug,
    name: params.name,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    joinCode,
    joinCodeUpdatedAt: now,
    joinCodeUpdatedBy: params.createdBy
  };
}
function readWorkspaceSync(idOrSlug) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT id, slug, name, created_by, created_at, updated_at, archived_at,
            join_code, join_code_updated_at, join_code_updated_by
     FROM workspace
     WHERE id = ? OR slug = ?`
  ).get(idOrSlug, idOrSlug) ?? null;
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? void 0,
    joinCode: row.join_code ?? void 0,
    joinCodeUpdatedAt: row.join_code_updated_at ?? void 0,
    joinCodeUpdatedBy: row.join_code_updated_by ?? void 0
  };
}
function readWorkspaceByJoinCodeSync(joinCode) {
  const normalizedJoinCode = normalizeWorkspaceJoinCode(joinCode);
  if (!normalizedJoinCode) {
    return null;
  }
  const db = getDatabase();
  const row = db.prepare(
    `SELECT id, slug, name, created_by, created_at, updated_at, archived_at,
            join_code, join_code_updated_at, join_code_updated_by
     FROM workspace
     WHERE join_code = ? AND archived_at IS NULL`
  ).get(normalizedJoinCode) ?? null;
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? void 0,
    joinCode: row.join_code ?? void 0,
    joinCodeUpdatedAt: row.join_code_updated_at ?? void 0,
    joinCodeUpdatedBy: row.join_code_updated_by ?? void 0
  };
}
function generateUniqueWorkspaceJoinCodeSync(excludeWorkspaceId) {
  for (let attempt = 0; attempt < JOIN_CODE_MAX_ATTEMPTS; attempt += 1) {
    const joinCode = generateWorkspaceJoinCode();
    const existing = readWorkspaceByJoinCodeSync(joinCode);
    if (!existing || existing.id === excludeWorkspaceId) {
      return joinCode;
    }
  }
  throw new Error("workspace.join_code.collision");
}
function generateWorkspaceJoinCode() {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }
  return code;
}
function normalizeWorkspaceJoinCode(joinCode) {
  return joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ../db/src/workspace-memberships.ts
function listWorkspaceMembershipsSync(workspaceId) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT id, workspace_id, user_id, role, status, joined_at, invited_by
     FROM workspace_membership
     WHERE workspace_id = ? AND status = 'active'
     ORDER BY joined_at ASC`
  ).all(workspaceId);
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by ?? void 0
  }));
}

// ../db/src/workspace-invitations.ts
var DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;

// ../db/src/channel-access.ts
var CHANNEL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;

// ../db/src/workspace-channels.ts
function listStoredChannelsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
      id,
      name,
      kind,
      human_member_names_json AS humanMemberNamesJson,
      human_member_count AS humanMemberCount,
      employee_names_json AS employeeNamesJson
     FROM workspace_channel
     WHERE workspace_id = ?
     ORDER BY LOWER(name) ASC, name ASC`
  ).all(workspaceId);
  return rows.map(mapStoredChannelRecord).filter((channel) => channel !== null);
}
function readStoredChannelSync(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listStoredChannelsSync(workspaceId).find((channel) => channel.name === channelName) ?? null;
}
function createStoredChannelSync(channel, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO workspace_channel (
      id,
      workspace_id,
      name,
      kind,
      human_member_names_json,
      human_member_count,
      employee_names_json,
      version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    `channel-${randomLikeId()}`,
    workspaceId,
    channel.name,
    channel.kind ?? "group",
    JSON.stringify(channel.humanMemberNames ?? []),
    channel.humanMembers,
    JSON.stringify(channel.employeeNames),
    now,
    now
  );
  return readStoredChannelSync(channel.name, workspaceId) ?? channel;
}
function updateStoredChannelSync(channelName, next, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.prepare(
    `UPDATE workspace_channel
     SET name = ?,
         kind = ?,
         human_member_names_json = ?,
         human_member_count = ?,
         employee_names_json = ?,
         version = version + 1,
         updated_at = ?
     WHERE workspace_id = ? AND name = ?`
  ).run(
    next.name,
    next.kind ?? "group",
    JSON.stringify(next.humanMemberNames ?? []),
    next.humanMembers,
    JSON.stringify(next.employeeNames),
    now,
    workspaceId,
    channelName
  );
  if (result.changes === 0) {
    return null;
  }
  return readStoredChannelSync(next.name, workspaceId);
}
function replaceStoredChannelsSync(channels, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    const nextNames = channels.map((channel) => channel.name);
    if (nextNames.length === 0) {
      db.prepare("DELETE FROM workspace_channel WHERE workspace_id = ?").run(workspaceId);
      return;
    }
    db.prepare(
      `DELETE FROM workspace_channel
       WHERE workspace_id = ?
         AND name NOT IN (${nextNames.map(() => "?").join(", ")})`
    ).run(workspaceId, ...nextNames);
    for (const channel of channels) {
      updateStoredChannelSync(channel.name, channel, workspaceId) ?? createStoredChannelSync(channel, workspaceId);
    }
  });
}
function mapStoredChannelRecord(row) {
  if (typeof row.name !== "string" || typeof row.humanMemberCount !== "number" || typeof row.humanMemberNamesJson !== "string" || typeof row.employeeNamesJson !== "string") {
    return null;
  }
  return {
    name: row.name,
    kind: row.kind === "direct" ? "direct" : "group",
    humanMemberNames: parseStringArray(row.humanMemberNamesJson),
    humanMembers: row.humanMemberCount,
    employeeNames: parseStringArray(row.employeeNamesJson)
  };
}
function parseStringArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// ../db/src/workspace-employees.ts
function listStoredEmployeesSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
      name,
      role,
      remark_name AS remarkName,
      owner_user_id AS ownerUserId,
      origin,
      summary,
      traits_json AS traitsJson,
      fit,
      status,
      instructions,
      channel_member_access AS channelMemberAccess,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM workspace_employee
     WHERE workspace_id = ?
     ORDER BY LOWER(name) ASC, name ASC`
  ).all(workspaceId);
  return rows.map(mapStoredEmployeeRecord).filter((employee) => employee !== null);
}
function readStoredEmployeeSync(employeeName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listStoredEmployeesSync(workspaceId).find((employee) => employee.name === employeeName) ?? null;
}
function createStoredEmployeeSync(employee, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO workspace_employee (
      workspace_id,
      name,
      role,
      remark_name,
      owner_user_id,
      origin,
      summary,
      traits_json,
      fit,
      status,
      instructions,
      channel_member_access,
      version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    workspaceId,
    employee.name,
    employee.role,
    employee.remarkName ?? null,
    employee.ownerUserId ?? null,
    employee.origin,
    employee.summary,
    JSON.stringify(employee.traits),
    employee.fit,
    employee.status,
    employee.instructions ?? "",
    employee.channelMemberAccess ?? (employee.ownerUserId ? "disabled" : "enabled"),
    now,
    now
  );
  return readStoredEmployeeSync(employee.name, workspaceId) ?? employee;
}
function replaceStoredEmployeesSync(employees, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare("DELETE FROM workspace_employee WHERE workspace_id = ?").run(workspaceId);
    for (const employee of employees) {
      createStoredEmployeeSync(employee, workspaceId);
    }
  });
}
function mapStoredEmployeeRecord(row) {
  if (typeof row.name !== "string" || typeof row.role !== "string" || typeof row.origin !== "string" || typeof row.summary !== "string" || typeof row.fit !== "string") {
    return null;
  }
  return {
    name: row.name,
    role: row.role,
    remarkName: typeof row.remarkName === "string" ? row.remarkName : void 0,
    ownerUserId: typeof row.ownerUserId === "string" ? row.ownerUserId : void 0,
    origin: row.origin,
    summary: row.summary,
    traits: parseStringArray2(typeof row.traitsJson === "string" ? row.traitsJson : "[]"),
    fit: row.fit,
    skillIds: [],
    channels: [],
    status: row.status === "active" ? "active" : "active",
    instructions: typeof row.instructions === "string" ? row.instructions : "",
    channelMemberAccess: row.channelMemberAccess === "enabled" || row.channelMemberAccess === "disabled" ? row.channelMemberAccess : typeof row.ownerUserId === "string" && row.ownerUserId.trim().length > 0 ? "disabled" : "enabled"
  };
}
function parseStringArray2(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// ../db/src/workspace-tasks.ts
function listStoredTasksSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
      id,
      title,
      channel_name AS channelName,
      assignee,
      priority,
      status,
      sort_order AS sortOrder,
      labels_json AS labelsJson
     FROM workspace_task
     WHERE workspace_id = ?
     ORDER BY COALESCE(sort_order, 0) ASC, updated_at DESC`
  ).all(workspaceId);
  return rows.map(mapStoredTaskRecord).filter((task) => task !== null);
}
function readStoredTaskSync(taskId, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listStoredTasksSync(workspaceId).find((task) => task.id === taskId) ?? null;
}
function createStoredTaskSync(task, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO workspace_task (
      id,
      workspace_id,
      title,
      channel_name,
      assignee,
      priority,
      status,
      sort_order,
      labels_json,
      version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    task.id,
    workspaceId,
    task.title,
    task.channel,
    task.assignee,
    task.priority,
    task.status,
    task.sortOrder ?? null,
    JSON.stringify(task.labels ?? []),
    now,
    now
  );
  return readStoredTaskSync(task.id, workspaceId) ?? task;
}
function replaceStoredTasksSync(tasks, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare("DELETE FROM workspace_task WHERE workspace_id = ?").run(workspaceId);
    for (const task of tasks) {
      createStoredTaskSync(task, workspaceId);
    }
  });
}
function mapStoredTaskRecord(row) {
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.channelName !== "string" || typeof row.assignee !== "string" || row.priority !== "low" && row.priority !== "medium" && row.priority !== "high" || row.status !== "todo" && row.status !== "in_progress" && row.status !== "blocked" && row.status !== "done") {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    channel: row.channelName,
    assignee: row.assignee,
    priority: row.priority,
    status: row.status,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : void 0,
    labels: parseStringArray3(typeof row.labelsJson === "string" ? row.labelsJson : "[]")
  };
}
function parseStringArray3(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// ../services/src/shared/helpers.ts
import { basename, extname, join as join4, resolve as resolve4 } from "node:path";
function createOpaqueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function uniqueNames(values) {
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (result.some((existing) => sameValue(existing, trimmed))) {
      continue;
    }
    result.push(trimmed);
  }
  return result;
}
function uniqueStringValues(values) {
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || result.includes(trimmed)) {
      continue;
    }
    result.push(trimmed);
  }
  return result;
}
function slugify(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized || "material";
}
function nowTime() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function formatTimeOfDay(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function sameValue(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function sanitizeAttachmentFileName(value) {
  const trimmed = basename(value.trim().replace(/\\/g, "/"));
  const extension = extname(trimmed);
  const stem = extension ? trimmed.slice(0, -extension.length) : trimmed;
  const safeStem = stem.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const safeExtension = extension.replace(/[^a-zA-Z0-9.]+/g, "").toLowerCase();
  return `${safeStem || "attachment"}${safeExtension}`;
}
function inferAttachmentMediaType(fileName, inputMediaType) {
  if (inputMediaType && inputMediaType.trim().length > 0) {
    return inputMediaType.trim();
  }
  const extension = extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".md") {
    return "text/markdown";
  }
  if (extension === ".txt") {
    return "text/plain";
  }
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".pdf") {
    return "application/pdf";
  }
  return "application/octet-stream";
}
function resolveAttachmentMediaType(fileName, inputMediaType) {
  const trimmed = inputMediaType?.trim();
  if (trimmed && trimmed !== "application/octet-stream") {
    return trimmed;
  }
  return inferAttachmentMediaType(fileName);
}
function inferAttachmentKind(mediaType) {
  return mediaType.startsWith("image/") || mediaType.startsWith("video/") ? "image" : "file";
}
function normalizeSkillFilePath(path) {
  if (typeof path !== "string") {
    return "";
  }
  const normalized = path.replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== "." && segment !== "..").join("/");
  return normalized;
}
function normalizeSkillIds(skillIds, skills) {
  if (!Array.isArray(skillIds)) {
    return [];
  }
  const result = [];
  for (const skillId of skillIds) {
    if (typeof skillId !== "string" || skillId.trim().length === 0) {
      continue;
    }
    if (!skills.some((skill) => skill.id === skillId.trim())) {
      continue;
    }
    if (result.includes(skillId.trim())) {
      continue;
    }
    result.push(skillId.trim());
  }
  return result;
}
function readSkillFileContent(skill, path) {
  return skill.files.find((file) => sameValue(file.path, path))?.content ?? "";
}

// ../services/src/attachments/attachments.ts
import { existsSync as existsSync5, readFileSync as readFileSync3, readdirSync, rmSync as rmSync3, statSync as statSync2 } from "node:fs";
import { basename as basename2, join as join7, resolve as resolve5 } from "node:path";

// ../services/src/shared/messaging.ts
import { appendFileSync, existsSync as existsSync4, renameSync, rmSync, writeFileSync } from "node:fs";
import { join as join5 } from "node:path";

// ../services/src/documents/runs.ts
function normalizeChannelDocumentRuns(runs, fallback) {
  if (!Array.isArray(runs)) {
    return fallback;
  }
  return runs.map((run2) => normalizeChannelDocumentRun(run2)).filter((run2) => run2 !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeChannelDocumentRunSteps(steps, fallback) {
  if (!Array.isArray(steps)) {
    return fallback;
  }
  return steps.map((step) => normalizeChannelDocumentRunStep(step)).filter((step) => step !== null).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
function normalizeChannelDocumentRun(run2) {
  if (!run2 || typeof run2 !== "object") {
    return null;
  }
  const candidate = run2;
  if (typeof candidate.id !== "string" || typeof candidate.channelName !== "string" || typeof candidate.sourceMessageId !== "string" || typeof candidate.sourceSummary !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    channelName: candidate.channelName,
    sourceMessageId: candidate.sourceMessageId,
    sourceSummary: candidate.sourceSummary,
    mode: candidate.mode === "sequential" ? "sequential" : "parallel",
    status: candidate.status === "running" || candidate.status === "completed" || candidate.status === "completed_with_warning" || candidate.status === "failed" ? candidate.status : "pending",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeChannelDocumentRunStep(step) {
  if (!step || typeof step !== "object") {
    return null;
  }
  const candidate = step;
  if (typeof candidate.id !== "string" || typeof candidate.runId !== "string" || typeof candidate.agentId !== "string" || typeof candidate.agentLabel !== "string" || typeof candidate.instruction !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    runId: candidate.runId,
    agentId: candidate.agentId,
    agentLabel: candidate.agentLabel,
    instruction: candidate.instruction,
    dependsOnStepIds: Array.isArray(candidate.dependsOnStepIds) ? candidate.dependsOnStepIds.filter((value) => typeof value === "string") : [],
    handoffKind: candidate.handoffKind === "document" || candidate.handoffKind === "attachment" ? candidate.handoffKind : "message",
    status: candidate.status === "ready" || candidate.status === "queued" || candidate.status === "running" || candidate.status === "completed" || candidate.status === "completed_with_warning" || candidate.status === "failed" || candidate.status === "blocked" ? candidate.status : "pending",
    queuedTaskId: typeof candidate.queuedTaskId === "string" ? candidate.queuedTaskId : void 0,
    documentId: typeof candidate.documentId === "string" ? candidate.documentId : void 0,
    documentVersionId: typeof candidate.documentVersionId === "string" ? candidate.documentVersionId : void 0,
    lastError: typeof candidate.lastError === "string" ? candidate.lastError : void 0,
    lastWarning: typeof candidate.lastWarning === "string" ? candidate.lastWarning : void 0,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}

// ../services/src/shared/audit.ts
var MAX_AUDIT_LEDGER_ENTRIES = 200;
function recordWorkspaceAuditEventSync(input) {
  const state = readWorkspaceStateSync(input.workspaceId);
  const entry = {
    title: input.title,
    note: input.note,
    code: input.code,
    data: normalizeAuditData(input.data)
  };
  state.ledger = [entry, ...state.ledger].slice(0, MAX_AUDIT_LEDGER_ENTRIES);
  writeWorkspaceStateSync(state, input.workspaceId);
}
function tryRecordWorkspaceAuditEventSync(input) {
  try {
    recordWorkspaceAuditEventSync(input);
    return true;
  } catch {
    return false;
  }
}
function normalizeAuditData(data) {
  if (!data) {
    return void 0;
  }
  const entries = Object.entries(data).filter(([, value]) => value !== void 0).map(([key, value]) => [key, value === null ? "null" : String(value)]);
  return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}

// ../services/src/shared/messaging.ts
function pushWorkspaceMessageIfChannel(state, channel, input, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!channel || !state.channels.some((item) => sameValue(item.name, channel))) {
    return;
  }
  pushWorkspaceMessageToChannel(state, channel, input, workspaceId);
}
function pushWorkspaceMessageToChannel(state, channel, input, workspaceId = DEFAULT_WORKSPACE_ID) {
  const message = createWorkspaceMessageRecord({
    channel,
    speaker: input.speaker,
    speakerUserId: input.speakerUserId,
    role: input.role,
    summary: input.summary,
    code: input.code,
    data: input.data,
    status: input.status ?? "completed",
    attachments: input.attachments,
    mentions: input.mentions,
    replyToMessageId: input.replyToMessageId
  });
  state.messages.unshift(message);
  if ((input.status ?? "completed") !== "pending") {
    appendChannelHistoryEntry(channel, {
      speaker: input.speaker,
      role: input.role,
      summary: input.summary,
      status: input.status ?? "completed",
      mentions: input.mentions,
      attachments: input.attachments
    }, workspaceId);
  }
  return message;
}
function createWorkspaceMessageRecord(input) {
  return {
    id: `message-${createOpaqueId()}`,
    channel: input.channel,
    speaker: input.speaker,
    speakerUserId: input.speakerUserId,
    role: input.role,
    time: nowTime(),
    summary: input.summary,
    code: input.code,
    data: input.data,
    status: input.status ?? "completed",
    attachments: input.attachments,
    mentions: input.mentions && input.mentions.length > 0 ? input.mentions : void 0,
    replyToMessageId: input.replyToMessageId
  };
}
function getChannelHistoryFilePath(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return join5(getChannelHistoryDirPath(workspaceId), `${slugify(channelName)}.md`);
}
function getChannelHistoryDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return getWorkspaceChannelHistoryDirPath(workspaceId);
}
function ensureChannelHistoryFile(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const filePath = getChannelHistoryFilePath(channelName, workspaceId);
  if (!existsSync4(filePath)) {
    writeFileSync(filePath, `# \u7FA4\u804A\u8BB0\u5F55\uFF1A${channelName}

`, "utf8");
  }
}
function appendChannelHistoryEntry(channelName, input, workspaceId = DEFAULT_WORKSPACE_ID) {
  ensureChannelHistoryFile(channelName, workspaceId);
  const filePath = getChannelHistoryFilePath(channelName, workspaceId);
  const mentionBlock = input.mentions && input.mentions.length > 0 ? `

\u63D0\u53CA\uFF1A
${input.mentions.map((mention) => `- @${mention.token} -> ${mention.label}`).join("\n")}` : "";
  const attachmentBlock = input.attachments && input.attachments.length > 0 ? `

\u9644\u4EF6\uFF1A
${input.attachments.map((attachment) => `- ${attachment.fileName}`).join("\n")}` : "";
  appendFileSync(
    filePath,
    `## ${formatTimeOfDay()} \xB7 ${input.speaker} \xB7 ${input.role} \xB7 ${input.status}

${input.summary}${mentionBlock}${attachmentBlock}

`,
    "utf8"
  );
}

// ../services/src/automations/auto-continuation.ts
var HOUR_MS = 60 * 60 * 1e3;

// ../services/src/realtime/events.ts
import { EventEmitter } from "node:events";
var emitter = new EventEmitter();
emitter.setMaxListeners(0);
var sequence = 0;
function publishChannelMessageCreatedEvent(input) {
  const event = {
    type: "channel.message.created",
    workspaceId: input.workspaceId,
    channelName: input.channelName,
    messageId: input.messageId,
    sequence: nextSequence(),
    createdAt: input.createdAt
  };
  emitter.emit(event.workspaceId, event);
  return event;
}
function publishTaskExecutionEventCreatedEvent(input) {
  const event = {
    type: "task.execution_event.created",
    workspaceId: input.workspaceId,
    channelName: input.channelName,
    taskId: input.taskId,
    eventId: input.eventId,
    sequence: nextSequence(),
    createdAt: input.createdAt
  };
  emitter.emit(event.workspaceId, event);
  return event;
}
function nextSequence() {
  sequence += 1;
  return sequence;
}

// ../services/src/messages/messages.ts
function postMessageSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  if (!state.channels.some((channel) => sameValue(channel.name, input.channel))) {
    throw new Error(`Channel "${input.channel}" does not exist.`);
  }
  const message = pushWorkspaceMessageToChannel(state, input.channel, {
    speaker: input.speaker,
    role: input.role,
    summary: input.summary,
    code: input.code,
    data: input.data,
    status: input.status ?? "completed",
    attachments: input.attachments,
    mentions: input.mentions
  }, workspaceId);
  const nextState = writeWorkspaceStateSync(state, workspaceId);
  publishChannelMessageCreatedEvent({
    workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
    channelName: input.channel,
    messageId: message.id,
    createdAt: message.time
  });
  return nextState;
}

// ../services/src/notifications/notifications.ts
function createNotificationsSync(inputs) {
  return createWorkspaceNotificationsSync(inputs);
}
function listNotificationsForRecipientSync(input) {
  return listWorkspaceNotificationsForRecipientSync(input);
}
function postNotificationChannelMessageSync(input) {
  const channelName = input.channelName.trim();
  if (!channelName) {
    return false;
  }
  const state = readWorkspaceStateSync(input.workspaceId);
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel || channel.kind === "direct") {
    return false;
  }
  postMessageSync({
    channel: channel.name,
    speaker: input.speaker ?? "\u7CFB\u7EDF\u63D0\u793A",
    role: "agent",
    summary: input.summary,
    code: input.code,
    data: compactStringRecord(input.data ?? {}),
    status: input.status
  }, input.workspaceId);
  return true;
}
function compactStringRecord(input) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) {
      output[key] = value;
    }
  }
  return output;
}

// ../services/src/attachments/storage.ts
import { createHash as createHash2, createHmac } from "node:crypto";
import { mkdirSync as mkdirSync3, readFileSync as readFileSync2, rmSync as rmSync2, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname3 } from "node:path";
import { spawnSync } from "node:child_process";

// ../services/src/config/deployment.ts
function resolveAttachmentRuntimeConfig(envOrMode) {
  const rawEnv = typeof envOrMode === "string" ? process.env : envOrMode ?? process.env;
  const env = typeof envOrMode === "string" ? readEffectiveRuntimeEnv() : readEffectiveRuntimeEnv({ env: rawEnv, repositoryOverridesEnv: rawEnv === process.env });
  const deploymentMode = typeof envOrMode === "string" ? envOrMode : resolveDeploymentMode2(env);
  return resolveAttachmentRuntimeConfigForMode(deploymentMode, env);
}
function resolveAttachmentRuntimeConfigForMode(deploymentMode, env) {
  const maxUploadBytes = readPositiveInteger(env.ATTACHMENT_MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
  const signedUrlTtlSeconds = readPositiveInteger(env.ATTACHMENT_SIGNED_URL_TTL_SECONDS, 300);
  const publicBaseUrl = trimOptional(env.ATTACHMENT_PUBLIC_BASE_URL);
  const enableLocalFallback = env.ATTACHMENT_ENABLE_LOCAL_FALLBACK !== "false";
  if (deploymentMode === "cloud") {
    return {
      provider: "r2",
      publicBaseUrl,
      maxUploadBytes,
      signedUrlTtlSeconds,
      enableLocalFallback,
      localRoot: trimOptional(env.ATTACHMENT_LOCAL_ROOT) || trimOptional(env.SELF_HOSTED_ATTACHMENT_LOCAL_ROOT),
      r2: {
        accountId: requireEnvValue(env, "CLOUDFLARE_ACCOUNT_ID"),
        bucket: requireEnvValue(env, "CLOUDFLARE_R2_BUCKET"),
        region: trimOptional(env.CLOUDFLARE_R2_REGION) || "auto",
        endpoint: trimOptional(env.CLOUDFLARE_R2_ENDPOINT) || `https://${requireEnvValue(env, "CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
        accessKeyId: requireEnvValue(env, "CLOUDFLARE_R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnvValue(env, "CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
        forcePathStyle: env.CLOUDFLARE_R2_FORCE_PATH_STYLE !== "false"
      }
    };
  }
  return {
    provider: "local",
    localRoot: trimOptional(env.SELF_HOSTED_ATTACHMENT_LOCAL_ROOT) || trimOptional(env.ATTACHMENT_LOCAL_ROOT),
    publicBaseUrl,
    maxUploadBytes,
    signedUrlTtlSeconds,
    enableLocalFallback
  };
}
function resolveDeploymentMode2(env) {
  const rawMode = env.AGENT_SPACE_DEPLOYMENT_MODE?.trim();
  if (!rawMode || rawMode === "self_hosted") {
    return "self_hosted";
  }
  if (rawMode === "cloud") {
    return "cloud";
  }
  throw new Error(`Unsupported AGENT_SPACE_DEPLOYMENT_MODE "${rawMode}". Expected "self_hosted" or "cloud".`);
}
function requireEnvValue(env, name) {
  const value = trimOptional(env[name]);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
function trimOptional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ../services/src/attachments/storage.ts
function createAttachmentStorageClient(config = resolveAttachmentRuntimeConfig()) {
  if (config.provider === "r2") {
    return new R2AttachmentStorageClient(config);
  }
  return new LocalAttachmentStorageClient();
}
function buildAttachmentStorageKey(input) {
  const createdAt = input.createdAt ?? /* @__PURE__ */ new Date();
  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  return [
    "workspaces",
    sanitizeObjectKeySegment(input.workspaceId),
    "attachments",
    year,
    month,
    sanitizeObjectKeySegment(input.attachmentId),
    sanitizeObjectKeySegment(input.fileName) || "attachment.bin"
  ].join("/");
}
function sha256Hex(contentBytes) {
  return createHash2("sha256").update(contentBytes).digest("hex");
}
var LocalAttachmentStorageClient = class {
  async putObject(input) {
    return this.putObjectSync(input);
  }
  putObjectSync(input) {
    mkdirSync3(dirname3(input.localPath), { recursive: true });
    writeFileSync2(input.localPath, input.contentBytes);
    return {
      provider: "local",
      storedPath: input.localPath,
      sizeBytes: input.contentBytes.byteLength,
      sha256: sha256Hex(input.contentBytes)
    };
  }
  async getObject(input) {
    return readFileSync2(input.storedPath);
  }
  async headObject(input) {
    try {
      const stat2 = statSync(input.storedPath);
      if (!stat2.isFile()) {
        return null;
      }
      return {
        provider: "local",
        storedPath: input.storedPath,
        sizeBytes: stat2.size,
        lastModified: stat2.mtime.toISOString()
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }
  async deleteObject(input) {
    this.deleteObjectSync(input);
  }
  deleteObjectSync(input) {
    rmSync2(input.storedPath, { force: true });
  }
  async createReadUrl(_input) {
    return null;
  }
};
var R2AttachmentStorageClient = class {
  config;
  publicBaseUrl;
  signedUrlTtlSeconds;
  constructor(config) {
    if (!config.r2) {
      throw new Error("Cloud attachment storage requires CLOUDFLARE_R2_* configuration.");
    }
    this.config = config.r2;
    this.publicBaseUrl = config.publicBaseUrl;
    this.signedUrlTtlSeconds = config.signedUrlTtlSeconds;
  }
  async putObject(input) {
    const object = this.buildStoredObject(input);
    const response = await this.request({
      method: "PUT",
      key: object.key,
      body: Buffer.from(input.contentBytes),
      contentType: input.mediaType
    });
    if (!response.ok) {
      throw new Error(`R2 upload failed with status ${response.status}: ${await response.text()}`);
    }
    return object;
  }
  putObjectSync(input) {
    const object = this.buildStoredObject(input);
    const body = Buffer.from(input.contentBytes);
    const signed = this.buildSignedRequest({
      method: "PUT",
      key: object.key,
      body,
      contentType: input.mediaType
    });
    const args = [
      "--fail",
      "-sS",
      "-X",
      "PUT",
      signed.url,
      "-H",
      `Authorization: ${signed.headers.Authorization}`,
      "-H",
      `x-amz-content-sha256: ${signed.headers["x-amz-content-sha256"]}`,
      "-H",
      `x-amz-date: ${signed.headers["x-amz-date"]}`,
      "--data-binary",
      "@-"
    ];
    if (input.mediaType) {
      args.splice(args.length - 2, 0, "-H", `Content-Type: ${input.mediaType}`);
    }
    const result = spawnSync("curl", args, {
      input: body,
      maxBuffer: 1024 * 1024
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const output = Buffer.concat([
        Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
        Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "")
      ]).toString("utf8");
      throw new Error(`R2 upload failed: ${output.trim() || `curl exited with status ${result.status}`}`);
    }
    return object;
  }
  buildStoredObject(input) {
    const storageKey = buildAttachmentStorageKey(input);
    return {
      provider: "r2",
      bucket: this.config.bucket,
      region: this.config.region,
      endpoint: this.config.endpoint,
      key: storageKey,
      url: this.publicBaseUrl ? `${this.publicBaseUrl.replace(/\/+$/, "")}/${storageKey}` : void 0,
      storedPath: `r2://${this.config.bucket}/${storageKey}`,
      sizeBytes: input.contentBytes.byteLength,
      sha256: sha256Hex(input.contentBytes)
    };
  }
  async getObject(input) {
    const key = input.storageKey?.trim();
    if (!key) {
      throw new Error("Missing object storage key.");
    }
    const response = await this.request({ method: "GET", key });
    if (!response.ok) {
      throw new Error(`R2 read failed with status ${response.status}: ${await response.text()}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  async headObject(input) {
    const key = input.storageKey?.trim();
    if (!key) {
      return null;
    }
    const response = await this.request({ method: "HEAD", key });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`R2 head failed with status ${response.status}: ${await response.text()}`);
    }
    return {
      provider: "r2",
      bucket: input.storageBucket ?? this.config.bucket,
      region: input.storageRegion ?? this.config.region,
      endpoint: input.storageEndpoint ?? this.config.endpoint,
      key,
      storedPath: input.storedPath,
      sizeBytes: parseContentLength(response.headers.get("content-length")),
      contentType: response.headers.get("content-type") ?? void 0,
      etag: response.headers.get("etag") ?? void 0,
      lastModified: response.headers.get("last-modified") ?? void 0
    };
  }
  async deleteObject(input) {
    const key = input.storageKey?.trim();
    if (!key) {
      return;
    }
    const response = await this.request({ method: "DELETE", key });
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 delete failed with status ${response.status}: ${await response.text()}`);
    }
  }
  deleteObjectSync(input) {
    const key = input.storageKey?.trim();
    if (!key) {
      return;
    }
    const signed = this.buildSignedRequest({ method: "DELETE", key });
    const result = spawnSync("curl", [
      "-sS",
      "-o",
      "-",
      "-w",
      "\n%{http_code}",
      "-X",
      "DELETE",
      signed.url,
      "-H",
      `Authorization: ${signed.headers.Authorization}`,
      "-H",
      `x-amz-content-sha256: ${signed.headers["x-amz-content-sha256"]}`,
      "-H",
      `x-amz-date: ${signed.headers["x-amz-date"]}`
    ], {
      maxBuffer: 1024 * 1024
    });
    if (result.error) {
      throw result.error;
    }
    const output = Buffer.concat([
      Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
      Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "")
    ]).toString("utf8");
    if (result.status !== 0) {
      throw new Error(`R2 delete failed: ${output.trim() || `curl exited with status ${result.status}`}`);
    }
    const statusCode = parseCurlStatusCode(output);
    if (statusCode !== void 0 && (statusCode === 404 || statusCode >= 200 && statusCode < 300)) {
      return;
    }
    if (statusCode !== void 0) {
      throw new Error(`R2 delete failed with status ${statusCode}: ${output.trim()}`);
    }
  }
  async createReadUrl(input) {
    const key = input.storageKey?.trim();
    if (!key) {
      return null;
    }
    return this.buildPresignedGetUrl(key);
  }
  async request(input) {
    const signed = this.buildSignedRequest(input);
    return fetch(signed.url, {
      method: input.method,
      headers: signed.headers,
      body: input.body ? new Uint8Array(input.body) : void 0
    });
  }
  buildSignedRequest(input) {
    const base = new URL(this.config.endpoint);
    const host = base.host;
    const canonicalUri = `/${encodePathSegment(this.config.bucket)}/${input.key.split("/").map(encodePathSegment).join("/")}`;
    const now = /* @__PURE__ */ new Date();
    const xAmzDate = formatAmzDate(now);
    const ymd = formatDateStamp(now);
    const payloadHash = hashHex(input.body ?? "");
    const canonicalHeaders = `host:${host}
x-amz-content-sha256:${payloadHash}
x-amz-date:${xAmzDate}
`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      input.method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");
    const credentialScope = `${ymd}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      xAmzDate,
      credentialScope,
      hashHex(canonicalRequest)
    ].join("\n");
    const signature = signAwsV4({
      secretAccessKey: this.config.secretAccessKey,
      dateStamp: ymd,
      region: this.config.region,
      stringToSign
    });
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const headers = {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": xAmzDate
    };
    if (input.contentType) {
      headers["Content-Type"] = input.contentType;
    }
    return {
      url: `${base.origin}${canonicalUri}`,
      headers
    };
  }
  buildPresignedGetUrl(key) {
    const base = new URL(this.config.endpoint);
    const host = base.host;
    const canonicalUri = `/${encodePathSegment(this.config.bucket)}/${key.split("/").map(encodePathSegment).join("/")}`;
    const now = /* @__PURE__ */ new Date();
    const xAmzDate = formatAmzDate(now);
    const ymd = formatDateStamp(now);
    const credentialScope = `${ymd}/${this.config.region}/s3/aws4_request`;
    const expires = Math.min(Math.max(this.signedUrlTtlSeconds, 1), 604800);
    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": xAmzDate,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": "host"
    });
    const canonicalQueryString = Array.from(queryParams.entries()).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).sort().join("&");
    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQueryString,
      `host:${host}
`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      xAmzDate,
      credentialScope,
      hashHex(canonicalRequest)
    ].join("\n");
    const signature = signAwsV4({
      secretAccessKey: this.config.secretAccessKey,
      dateStamp: ymd,
      region: this.config.region,
      stringToSign
    });
    queryParams.set("X-Amz-Signature", signature);
    return `${base.origin}${canonicalUri}?${queryParams.toString()}`;
  }
};
function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function parseContentLength(value) {
  if (!value) {
    return void 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : void 0;
}
function parseCurlStatusCode(output) {
  const match = output.match(/(\d{3})\s*$/);
  if (!match) {
    return void 0;
  }
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function sanitizeObjectKeySegment(value) {
  return value.trim().replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0 && segment !== "." && segment !== "..").join("-").replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
}
function encodePathSegment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
function formatDateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
function hashHex(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function hmacSha256(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}
function signAwsV4(input) {
  const kDate = hmacSha256(`AWS4${input.secretAccessKey}`, input.dateStamp);
  const kRegion = hmacSha256(kDate, input.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  return createHmac("sha256", kSigning).update(input.stringToSign, "utf8").digest("hex");
}

// ../services/src/attachments/attachments.ts
function persistWorkspaceAttachmentFromFileSync(input) {
  if (!existsSync5(input.sourcePath)) {
    throw new Error(`Attachment source "${input.sourcePath}" does not exist.`);
  }
  const sourceStat = statSync2(input.sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Attachment source "${input.sourcePath}" is not a file.`);
  }
  return persistWorkspaceAttachmentFromBytesSync({
    workspaceId: input.workspaceId,
    contentBytes: readFileSync3(input.sourcePath),
    fileName: input.fileName?.trim() || basename2(input.sourcePath),
    mediaType: input.mediaType
  });
}
function persistWorkspaceAttachmentFromBytesSync(input) {
  const contentBytes = input.contentBytes;
  const sizeBytes = contentBytes.byteLength;
  if (sizeBytes <= 0) {
    throw new Error("Attachment content cannot be empty.");
  }
  return persistWorkspaceAttachmentSync({
    workspaceId: input.workspaceId,
    fileName: input.fileName,
    mediaType: input.mediaType,
    sizeBytes,
    contentBytes
  });
}
function deleteWorkspaceAttachmentsSync(attachments) {
  const storage = createAttachmentStorageClient();
  for (const attachment of attachments) {
    if ((attachment.storageProvider === "r2" || attachment.storageProvider === "s3") && attachment.storageKey) {
      storage.deleteObjectSync({
        storageProvider: attachment.storageProvider,
        storageBucket: attachment.storageBucket,
        storageRegion: attachment.storageRegion,
        storageEndpoint: attachment.storageEndpoint,
        storageKey: attachment.storageKey,
        storedPath: attachment.storedPath
      });
      continue;
    }
    rmSync3(attachment.storedPath, { force: true });
  }
}
function persistWorkspaceAttachmentSync(input) {
  const id = `att-${createOpaqueId()}`;
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const fileName = normalizeAttachmentDisplayName(input.fileName);
  const mediaType = resolveAttachmentMediaType(fileName, input.mediaType);
  const storedFileName = basename2(sanitizeAttachmentFileName(fileName));
  const storedPath = join7(getWorkspaceAttachmentsDirPath2(workspaceId), `${id}-${storedFileName}`);
  const storage = createAttachmentStorageClient();
  const stored = storage.putObjectSync({
    workspaceId,
    attachmentId: id,
    fileName: storedFileName,
    contentBytes: input.contentBytes,
    localPath: storedPath,
    mediaType
  });
  return {
    id,
    fileName,
    mediaType,
    sizeBytes: input.sizeBytes,
    kind: inferAttachmentKind(mediaType),
    storedPath: stored.storedPath,
    storageProvider: stored.provider,
    storageBucket: stored.bucket,
    storageRegion: stored.region,
    storageEndpoint: stored.endpoint,
    storageKey: stored.key,
    storageUrl: stored.url,
    sha256: stored.sha256
  };
}
function normalizeAttachmentDisplayName(value) {
  const normalized = value.trim().replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== "." && segment !== "..").join("/");
  return normalized || "attachment.bin";
}

// ../services/src/channels/channels.ts
function resolveChannelHumanMemberNames(state, channel) {
  const explicitNames = uniqueNames(channel.humanMemberNames ?? []);
  if (explicitNames.length > 0) {
    return explicitNames;
  }
  return state.humanMembers.slice(0, Math.max(0, channel.humanMembers)).map((member) => member.name);
}

// ../services/src/documents/access.ts
function ensureChannelDocumentAccessSeeds(state) {
  let changed = false;
  for (const document of state.channelDocuments) {
    const existing = state.channelDocumentAccesses.filter((access3) => access3.documentId === document.id);
    if (existing.length > 0) {
      continue;
    }
    state.channelDocumentAccesses.unshift(...buildDefaultDocumentAccesses(state, document));
    changed = true;
  }
  return changed;
}
function resolveChannelDocumentRole(state, documentId, actorId, actorType) {
  const access3 = state.channelDocumentAccesses.find(
    (item) => item.documentId === documentId && item.actorType === actorType && sameValue(item.actorId, actorId)
  );
  return access3?.role ?? null;
}
function assertCanCreateChannelDocument(state, channelName, actorId, actorType) {
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (actorType === "human") {
    const visibleHumans = channel ? resolveChannelHumanMemberNames(state, channel) : [];
    if (visibleHumans.some((name) => sameValue(name, actorId))) {
      return;
    }
  } else {
    const employee = state.activeEmployees.find((item) => sameValue(item.name, actorId));
    if (employee && employee.channels.some((channel2) => sameValue(channel2, channelName))) {
      return;
    }
  }
  throw new Error(`Actor "${actorId}" cannot create channel documents in ${channelName}.`);
}
function assertCanEditChannelDocument(state, document, actorId, actorType) {
  const role = resolveChannelDocumentRole(state, document.id, actorId, actorType);
  if (allowsDocumentAction(normalizeEffectiveChannelRole(role, actorType), "edit")) {
    return;
  }
  throw new Error(`Actor "${actorId}" does not have permission to edit "${document.title}".`);
}
function buildDefaultDocumentAccesses(state, document) {
  const now = document.createdAt;
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const channel = state.channels.find((item) => sameValue(item.name, document.channelName));
  const humanMemberNames = channel ? resolveChannelHumanMemberNames(state, channel) : state.humanMembers.map((member) => member.name);
  const ownerHuman = humanMemberNames.find((name) => sameValue(name, document.createdBy)) ?? humanMemberNames[0];
  if (ownerHuman) {
    result.push(createDocumentAccess(document.id, ownerHuman, "human", "owner", now));
    seen.add(`human:${ownerHuman.toLocaleLowerCase("zh-CN")}`);
  } else if (state.activeEmployees.some((employee) => sameValue(employee.name, document.createdBy))) {
    result.push(createDocumentAccess(document.id, document.createdBy, "agent", "editor", now));
    seen.add(`agent:${document.createdBy.toLocaleLowerCase("zh-CN")}`);
  }
  for (const memberName of humanMemberNames) {
    const key = `human:${memberName.toLocaleLowerCase("zh-CN")}`;
    if (seen.has(key)) {
      continue;
    }
    result.push(createDocumentAccess(document.id, memberName, "human", "editor", now));
    seen.add(key);
  }
  for (const employee of state.activeEmployees) {
    if (!employee.channels.some((channel2) => sameValue(channel2, document.channelName)) && !sameValue(employee.name, document.createdBy)) {
      continue;
    }
    const key = `agent:${employee.name.toLocaleLowerCase("zh-CN")}`;
    if (seen.has(key)) {
      continue;
    }
    result.push(createDocumentAccess(document.id, employee.name, "agent", "editor", now));
    seen.add(key);
  }
  return result;
}
function createDocumentAccess(documentId, actorId, actorType, role, now) {
  return {
    id: `channel-doc-access-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    documentId,
    actorId,
    actorType,
    role,
    createdAt: now,
    updatedAt: now
  };
}
function normalizeEffectiveChannelRole(role, actorType) {
  if (actorType === "agent" && role === "owner") {
    return null;
  }
  return role;
}

// ../services/src/documents/model.ts
function buildChannelDocumentRecord(input) {
  const externalFileId = normalizeOptionalString(input.externalFileId);
  const externalUrl = normalizeOptionalString(input.externalUrl);
  const externalProvider = normalizeChannelDocumentExternalProvider(input.externalProvider);
  const storageMode = input.storageMode ?? (externalProvider || externalFileId || externalUrl ? "external" : "native");
  return {
    id: input.id,
    channelName: input.channelName,
    title: input.title,
    slug: ensureUniqueChannelDocumentSlug(input.existingDocuments, input.channelName, input.title),
    kind: input.kind ?? "markdown",
    storageMode,
    linkedTableId: normalizeOptionalString(input.linkedTableId),
    externalProvider,
    externalFileId,
    externalUrl,
    externalRevisionId: normalizeOptionalString(input.externalRevisionId),
    status: "active",
    currentVersionId: input.currentVersionId,
    summary: input.summary,
    externalSyncStatus: storageMode === "external" ? input.externalSyncStatus ?? "unknown" : input.externalSyncStatus,
    externalMimeType: normalizeOptionalString(input.externalMimeType),
    externalUpdatedAt: normalizeOptionalString(input.externalUpdatedAt),
    lastEditorType: input.lastEditorType,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}
function buildChannelDocumentVersionRecord(input) {
  return {
    id: input.id,
    documentId: input.documentId,
    contentMarkdown: input.contentMarkdown,
    contentJson: normalizeChannelDocumentJsonContent(input.contentJson),
    summary: input.summary,
    createdBy: input.createdBy,
    createdByType: input.createdByType,
    triggerType: input.triggerType,
    sourceMessageId: input.sourceMessageId,
    sourceAttachmentId: input.sourceAttachmentId,
    sourceAttachmentStoredPath: input.sourceAttachmentStoredPath,
    sourceTaskQueueId: input.sourceTaskQueueId,
    createdAt: input.createdAt
  };
}
function normalizeChannelDocuments(documents, fallback) {
  if (!Array.isArray(documents)) {
    return fallback;
  }
  return sortChannelDocuments(
    documents.map((document) => normalizeChannelDocument(document)).filter((document) => document !== null)
  );
}
function normalizeChannelDocument(document) {
  if (!document || typeof document !== "object") {
    return null;
  }
  const candidate = document;
  if (typeof candidate.id !== "string" || typeof candidate.channelName !== "string" || typeof candidate.title !== "string" || typeof candidate.currentVersionId !== "string") {
    return null;
  }
  const kind = normalizeChannelDocumentKind(candidate.kind);
  const linkedTableId = normalizeOptionalString(candidate.linkedTableId);
  const externalProvider = normalizeChannelDocumentExternalProvider(candidate.externalProvider);
  const externalFileId = normalizeOptionalString(candidate.externalFileId);
  const externalUrl = normalizeOptionalString(candidate.externalUrl);
  const externalRevisionId = normalizeOptionalString(candidate.externalRevisionId);
  const hasExternalMetadata = externalProvider !== void 0 || externalFileId !== void 0 || externalUrl !== void 0;
  const storageMode = candidate.storageMode === "external" || hasExternalMetadata ? "external" : normalizeChannelDocumentStorageMode(candidate.storageMode);
  return {
    id: candidate.id,
    channelName: candidate.channelName,
    title: candidate.title,
    slug: typeof candidate.slug === "string" && candidate.slug.trim().length > 0 ? candidate.slug : slugify2(candidate.title),
    kind,
    storageMode,
    linkedTableId,
    externalProvider,
    externalFileId,
    externalUrl,
    externalRevisionId,
    status: candidate.status === "archived" ? "archived" : "active",
    currentVersionId: candidate.currentVersionId,
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
    externalSyncStatus: storageMode === "external" ? normalizeExternalDocumentSyncStatus(candidate.externalSyncStatus) ?? "unknown" : normalizeExternalDocumentSyncStatus(candidate.externalSyncStatus),
    externalMimeType: normalizeOptionalString(candidate.externalMimeType),
    externalUpdatedAt: normalizeOptionalString(candidate.externalUpdatedAt),
    lastEditorType: candidate.lastEditorType === "agent" ? "agent" : "human",
    createdBy: typeof candidate.createdBy === "string" ? candidate.createdBy : "Unknown",
    updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : "Unknown",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeExternalSheetOperationRuns(runs, fallback, documents) {
  if (!Array.isArray(runs)) {
    return fallback;
  }
  const documentIds = new Set(documents.map((document) => document.id));
  return runs.map((run2) => normalizeExternalSheetOperationRun(run2)).filter((run2) => run2 !== null && documentIds.has(run2.channelDocumentId)).sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
}
function normalizeExternalSheetOperationRun(run2) {
  if (!run2 || typeof run2 !== "object") {
    return null;
  }
  const candidate = run2;
  if (typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string" || typeof candidate.channelDocumentId !== "string" || candidate.provider !== "google_workspace" || typeof candidate.externalFileId !== "string" || typeof candidate.actorId !== "string" || typeof candidate.intent !== "string" || typeof candidate.requestSummary !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    channelDocumentId: candidate.channelDocumentId,
    provider: "google_workspace",
    externalFileId: candidate.externalFileId,
    actorType: candidate.actorType === "human" || candidate.actorType === "system" ? candidate.actorType : "agent",
    actorId: candidate.actorId,
    delegatedUserId: typeof candidate.delegatedUserId === "string" ? candidate.delegatedUserId : void 0,
    delegatedUserDisplayName: typeof candidate.delegatedUserDisplayName === "string" ? candidate.delegatedUserDisplayName : void 0,
    delegatedGoogleEmail: typeof candidate.delegatedGoogleEmail === "string" ? candidate.delegatedGoogleEmail : void 0,
    credentialDelegationId: typeof candidate.credentialDelegationId === "string" ? candidate.credentialDelegationId : void 0,
    status: candidate.status === "running" || candidate.status === "succeeded" || candidate.status === "failed" ? candidate.status : "queued",
    intent: candidate.intent,
    operationType: normalizeExternalSheetOperationType(candidate.operationType),
    rangeA1: typeof candidate.rangeA1 === "string" ? candidate.rangeA1 : void 0,
    affectedRows: normalizeNonNegativeInteger(candidate.affectedRows),
    affectedCells: normalizeNonNegativeInteger(candidate.affectedCells),
    requestSummary: candidate.requestSummary,
    responseSummary: typeof candidate.responseSummary === "string" ? candidate.responseSummary : void 0,
    resultArtifactPath: typeof candidate.resultArtifactPath === "string" ? candidate.resultArtifactPath : void 0,
    resultArtifactFileName: typeof candidate.resultArtifactFileName === "string" ? candidate.resultArtifactFileName : void 0,
    resultArtifactMediaType: typeof candidate.resultArtifactMediaType === "string" ? candidate.resultArtifactMediaType : void 0,
    resultArtifactSizeBytes: normalizeNonNegativeInteger(candidate.resultArtifactSizeBytes),
    resultPreview: normalizeExternalSheetResultPreview(candidate.resultPreview),
    errorCode: typeof candidate.errorCode === "string" ? candidate.errorCode : void 0,
    errorMessage: typeof candidate.errorMessage === "string" ? candidate.errorMessage : void 0,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    finishedAt: typeof candidate.finishedAt === "string" ? candidate.finishedAt : void 0
  };
}
function normalizeChannelDocumentVersions(versions, fallback, documents) {
  if (!Array.isArray(versions)) {
    return fallback;
  }
  const documentIds = new Set(documents.map((document) => document.id));
  return versions.map((version) => normalizeChannelDocumentVersion(version)).filter((version) => version !== null && documentIds.has(version.documentId)).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function normalizeChannelDocumentVersion(version) {
  if (!version || typeof version !== "object") {
    return null;
  }
  const candidate = version;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.contentMarkdown !== "string" || typeof candidate.createdBy !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    contentMarkdown: candidate.contentMarkdown,
    contentJson: normalizeChannelDocumentJsonContent(candidate.contentJson),
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
    createdBy: candidate.createdBy,
    createdByType: candidate.createdByType === "agent" ? "agent" : "human",
    triggerType: candidate.triggerType === "agent" || candidate.triggerType === "handoff" ? candidate.triggerType : "manual",
    sourceMessageId: typeof candidate.sourceMessageId === "string" ? candidate.sourceMessageId : void 0,
    sourceAttachmentId: typeof candidate.sourceAttachmentId === "string" ? candidate.sourceAttachmentId : void 0,
    sourceAttachmentStoredPath: typeof candidate.sourceAttachmentStoredPath === "string" ? candidate.sourceAttachmentStoredPath : void 0,
    sourceTaskQueueId: typeof candidate.sourceTaskQueueId === "string" ? candidate.sourceTaskQueueId : void 0,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function sortChannelDocuments(documents) {
  return [...documents].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime();
    const rightTime = new Date(right.updatedAt).getTime();
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title, "zh-CN", { sensitivity: "base" });
  });
}
function summarizeChannelDocument(contentMarkdown, explicitSummary) {
  const trimmedSummary = explicitSummary?.trim() ?? "";
  if (trimmedSummary.length > 0) {
    return trimmedSummary;
  }
  const lines = contentMarkdown.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "";
  }
  const normalized = lines.join(" ").replace(/\s+/g, " ").trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}
function ensureUniqueChannelDocumentSlug(documents, channelName, title, currentDocumentId) {
  const baseSlug = slugify2(title);
  let candidate = baseSlug;
  let counter = 2;
  while (documents.some(
    (document) => document.id !== currentDocumentId && sameValue2(document.channelName, channelName) && sameValue2(document.slug, candidate)
  )) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}
function sameValue2(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function normalizeChannelDocumentKind(value) {
  return value === "sheet" || value === "deck" || value === "document" ? value : "markdown";
}
function normalizeChannelDocumentStorageMode(value) {
  return value === "external" ? "external" : "native";
}
function normalizeChannelDocumentExternalProvider(value) {
  return value === "google_workspace" || value === "notion" || value === "microsoft_365" ? value : void 0;
}
function normalizeChannelDocumentJsonContent(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return value;
  }
  return void 0;
}
function normalizeExternalDocumentSyncStatus(value) {
  if (value === "ok" || value === "permission_error" || value === "missing") {
    return value;
  }
  return value === "unknown" ? "unknown" : void 0;
}
function normalizeExternalSheetOperationType(value) {
  if (value === "create" || value === "append_text" || value === "append_rows" || value === "update_values" || value === "batch_update" || value === "share" || value === "metadata_refresh") {
    return value;
  }
  return "read";
}
function normalizeExternalSheetResultPreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const candidate = value;
  return {
    rowCount: normalizeNonNegativeInteger(candidate?.rowCount),
    cellCount: normalizeNonNegativeInteger(candidate?.cellCount),
    headers: Array.isArray(candidate?.headers) ? candidate.headers.filter((item) => typeof item === "string") : void 0,
    rowsPreview: Array.isArray(candidate?.rowsPreview) ? candidate.rowsPreview.filter((row) => Array.isArray(row)) : void 0,
    truncated: typeof candidate?.truncated === "boolean" ? candidate.truncated : void 0
  };
}
function normalizeNonNegativeInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.max(0, Math.round(value));
}
function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function slugify2(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized || "channel-document";
}

// ../services/src/agent-templates/preloaded-skill-sources.ts
var PRELOADED_AGENT_TEMPLATE_SKILL_SOURCES = [
  {
    "key": "financial-analysis-agent",
    "name": "financial-analysis-agent",
    "description": "Create agents for financial analysis, investment research, and portfolio management. Covers financial data processing, risk analysis, and recommendation generation. Use when building investment analysis tools, robo-advisors, portfolio trackers, or financial intelligence systems.",
    "sourceType": "skills.sh",
    "sourceUrl": "https://skills.sh/qodex-ai/ai-agent-skills/financial-analysis-agent",
    "resolvedSourceUrl": "https://github.com/qodex-ai/ai-agent-skills/tree/6ea9f00885c5dc5e6d9435d443dbf7d9ce865e29/skills/financial-analysis-agent",
    "resolvedCommit": "6ea9f00885c5dc5e6d9435d443dbf7d9ce865e29",
    "sourcePath": "skills/financial-analysis-agent",
    "files": [
      {
        "path": "SKILL.md",
        "content": "---\nname: financial-analysis-agent\ndescription: Create agents for financial analysis, investment research, and portfolio management. Covers financial data processing, risk analysis, and recommendation generation. Use when building investment analysis tools, robo-advisors, portfolio trackers, or financial intelligence systems.\n---\n\n# Financial Analysis Agent\n\nBuild intelligent financial analysis agents that evaluate investments, assess risks, and generate data-driven recommendations.\n\n## Financial Data Integration\n\nSee [examples/financial_data_collector.py](examples/financial_data_collector.py) for the `FinancialDataCollector` class that:\n- Integrates with yfinance for stock data\n- Retrieves financial statements (income, balance sheet, cash flow)\n- Fetches key metrics (market cap, PE ratio, dividend yield, etc.)\n\n## Financial Analysis Techniques\n\n### Technical Analysis\nSee [examples/technical_analyzer.py](examples/technical_analyzer.py) for `TechnicalAnalyzer`:\n- Moving averages calculation\n- Relative Strength Index (RSI)\n- Support and resistance level identification\n\n### Fundamental Analysis\nSee [examples/fundamental_analyzer.py](examples/fundamental_analyzer.py) for `FundamentalAnalyzer`:\n- Profitability ratios (gross margin, operating margin, net margin, ROA, ROE)\n- Valuation ratios (PE, PB, PEG, price-to-sales)\n- Liquidity ratios (current ratio, quick ratio, debt-to-equity)\n\n### Risk Assessment\nSee [examples/risk_analyzer.py](examples/risk_analyzer.py) for `RiskAnalyzer`:\n- Volatility calculation\n- Value at Risk (VaR) assessment\n- Sharpe Ratio calculation\n- Company risk assessment\n\n## Investment Recommendations\n\nSee [examples/investment_recommender.py](examples/investment_recommender.py) for `InvestmentRecommender`:\n- Generates recommendations (Strong Buy, Buy, Hold, Sell, Strong Sell)\n- Calculates investment scores based on technical and fundamental signals\n- Provides confidence levels and risk assessments\n\n## Portfolio Management\n\nSee [examples/portfolio_manager.py](examples/portfolio_manager.py) for `PortfolioManager`:\n- Calculate portfolio total value\n- Rebalance portfolio based on target allocations\n- Assess portfolio risk and volatility\n\n## Market Intelligence\n\nBuild market intelligence capabilities by:\n- Analyzing overall market trends and sector performance\n- Calculating market volatility indices\n- Fetching economic indicators\n- Identifying undervalued, growth, and dividend opportunities\n\n## Best Practices\n\n### Analysis Quality\n- \u2713 Use multiple data sources\n- \u2713 Cross-validate findings\n- \u2713 Document assumptions\n- \u2713 Consider time horizons\n- \u2713 Account for fees and taxes\n\n### Risk Management\n- \u2713 Assess downside risk\n- \u2713 Implement stop losses\n- \u2713 Diversify appropriately\n- \u2713 Position size accordingly\n- \u2713 Review regularly\n\n### Ethical Considerations\n- \u2713 Disclose conflicts of interest\n- \u2713 Avoid market manipulation\n- \u2713 Base recommendations on analysis\n- \u2713 Update recommendations regularly\n- \u2713 Acknowledge limitations\n\n## Tools & Data Sources\n\n### Data APIs\n- yfinance\n- Alpha Vantage\n- IEX Cloud\n- Polygon.io\n- Yahoo Finance\n\n### Analysis Libraries\n- pandas\n- NumPy\n- scikit-learn\n- TA-Lib\n- statsmodels\n\n## Getting Started\n\n1. Collect financial data\n2. Perform technical analysis\n3. Analyze fundamentals\n4. Assess risks\n5. Generate recommendations\n6. Monitor positions\n7. Rebalance periodically\n\n"
      },
      {
        "path": "examples/financial_data_collector.py",
        "content": '"""\nFinancial Data Collector Module\n\nHandles integration with financial data APIs and collection of stock data,\nfinancial statements, and key metrics.\n"""\n\nimport yfinance as yf\nimport pandas as pd\nfrom alpha_vantage.fundamentaldata import FundamentalData\nfrom typing import Dict, List\n\n\nclass FinancialDataCollector:\n    """Collects financial data from various APIs."""\n\n    def __init__(self, api_key: str = None):\n        """\n        Initialize the financial data collector.\n\n        Args:\n            api_key: Alpha Vantage API key for fundamental data\n        """\n        self.stock_data = yf.Ticker\n        if api_key:\n            self.fundamental_data = FundamentalData(api_key=api_key)\n        else:\n            self.fundamental_data = None\n\n    def get_stock_data(self, ticker: str, period="1y") -> pd.DataFrame:\n        """\n        Retrieve stock price data for a given ticker.\n\n        Args:\n            ticker: Stock ticker symbol\n            period: Time period for data (default: 1 year)\n\n        Returns:\n            DataFrame with stock price data\n        """\n        data = yf.download(ticker, period=period)\n        return data\n\n    def get_financial_statements(self, ticker: str) -> Dict:\n        """\n        Retrieve financial statements for a company.\n\n        Args:\n            ticker: Stock ticker symbol\n\n        Returns:\n            Dictionary with income statement, balance sheet, and cash flow\n        """\n        company = yf.Ticker(ticker)\n        return {\n            "income_statement": company.financials,\n            "balance_sheet": company.balance_sheet,\n            "cash_flow": company.cashflow\n        }\n\n    def get_key_metrics(self, ticker: str) -> Dict:\n        """\n        Retrieve key financial metrics for a company.\n\n        Args:\n            ticker: Stock ticker symbol\n\n        Returns:\n            Dictionary with key metrics like market cap, PE ratio, etc.\n        """\n        company = yf.Ticker(ticker)\n        return {\n            "market_cap": company.info.get("marketCap"),\n            "pe_ratio": company.info.get("trailingPE"),\n            "pb_ratio": company.info.get("priceToBook"),\n            "dividend_yield": company.info.get("dividendYield"),\n            "52_week_high": company.info.get("fiftyTwoWeekHigh"),\n            "52_week_low": company.info.get("fiftyTwoWeekLow")\n        }\n'
      },
      {
        "path": "examples/fundamental_analyzer.py",
        "content": '"""\nFundamental Analysis Module\n\nImplements fundamental analysis techniques including profitability ratios,\nvaluation ratios, and liquidity ratios.\n"""\n\nfrom typing import Dict\n\n\nclass FundamentalAnalyzer:\n    """Performs fundamental analysis on financial data."""\n\n    def calculate_profitability_ratios(self, financials: Dict) -> Dict[str, float]:\n        """\n        Calculate profitability ratios.\n\n        Args:\n            financials: Dictionary with financial data\n\n        Returns:\n            Dictionary with profitability ratios\n        """\n        return {\n            "gross_margin": (\n                financials["revenue"] - financials["cost_of_goods"]\n            ) / financials["revenue"],\n            "operating_margin": (\n                financials["operating_income"] / financials["revenue"]\n            ),\n            "net_margin": (\n                financials["net_income"] / financials["revenue"]\n            ),\n            "roa": financials["net_income"] / financials["total_assets"],\n            "roe": financials["net_income"] / financials["equity"]\n        }\n\n    def calculate_valuation_ratios(self, financials: Dict, market_cap: float) -> Dict[str, float]:\n        """\n        Calculate valuation ratios.\n\n        Args:\n            financials: Dictionary with financial data\n            market_cap: Current market capitalization\n\n        Returns:\n            Dictionary with valuation ratios\n        """\n        return {\n            "pe_ratio": market_cap / financials["net_income"],\n            "pb_ratio": market_cap / financials["book_value"],\n            "peg_ratio": (market_cap / financials["net_income"]) / (\n                financials["earnings_growth_rate"] * 100\n            ),\n            "price_to_sales": market_cap / financials["revenue"]\n        }\n\n    def calculate_liquidity_ratios(self, financials: Dict) -> Dict[str, float]:\n        """\n        Calculate liquidity ratios.\n\n        Args:\n            financials: Dictionary with financial data\n\n        Returns:\n            Dictionary with liquidity ratios\n        """\n        return {\n            "current_ratio": (\n                financials["current_assets"] / financials["current_liabilities"]\n            ),\n            "quick_ratio": (\n                (financials["current_assets"] - financials["inventory"]) /\n                financials["current_liabilities"]\n            ),\n            "debt_to_equity": (\n                financials["total_debt"] / financials["equity"]\n            )\n        }\n'
      },
      {
        "path": "examples/investment_recommender.py",
        "content": '"""\nInvestment Recommendation Module\n\nGenerates investment recommendations based on technical and fundamental analysis.\n"""\n\nfrom typing import Dict\n\n\nclass InvestmentRecommender:\n    """Generates investment recommendations based on analysis."""\n\n    def generate_recommendation(self, analysis_results: Dict) -> Dict:\n        """\n        Generate investment recommendation.\n\n        Args:\n            analysis_results: Dictionary with analysis results\n\n        Returns:\n            Dictionary with recommendation, confidence, reasoning, price target, and risk level\n        """\n        score = self._calculate_investment_score(analysis_results)\n\n        if score >= 8:\n            action = "STRONG BUY"\n            reason = analysis_results["bullish_factors"]\n        elif score >= 6:\n            action = "BUY"\n            reason = analysis_results["bullish_factors"]\n        elif score >= 4:\n            action = "HOLD"\n            reason = "Mixed signals"\n        elif score >= 2:\n            action = "SELL"\n            reason = analysis_results["bearish_factors"]\n        else:\n            action = "STRONG SELL"\n            reason = analysis_results["bearish_factors"]\n\n        return {\n            "action": action,\n            "confidence": score / 10,\n            "reasoning": reason,\n            "price_target": self._calculate_price_target(analysis_results),\n            "risk_level": self._assess_risk_level(analysis_results)\n        }\n\n    def _calculate_investment_score(self, results: Dict) -> float:\n        """\n        Calculate investment score.\n\n        Args:\n            results: Analysis results\n\n        Returns:\n            Score between 0 and 10\n        """\n        score = 5  # Start at neutral\n\n        # Technical signals\n        if results.get("technical_signal") == "bullish":\n            score += 1.5\n        elif results.get("technical_signal") == "bearish":\n            score -= 1.5\n\n        # Fundamental strength\n        if results.get("pe_ratio_attractive"):\n            score += 1\n        if results.get("strong_cash_flow"):\n            score += 1\n        if results.get("dividend_growth"):\n            score += 0.5\n\n        # Risk factors\n        if results.get("high_debt"):\n            score -= 1\n        if results.get("declining_revenue"):\n            score -= 1.5\n\n        return max(0, min(10, score))\n\n    def _calculate_price_target(self, analysis_results: Dict) -> float:\n        """\n        Calculate price target.\n\n        Args:\n            analysis_results: Analysis results\n\n        Returns:\n            Estimated price target\n        """\n        # Placeholder for price target calculation\n        return 0.0\n\n    def _assess_risk_level(self, analysis_results: Dict) -> str:\n        """\n        Assess risk level.\n\n        Args:\n            analysis_results: Analysis results\n\n        Returns:\n            Risk level (Low, Medium, High)\n        """\n        # Placeholder for risk assessment\n        return "Medium"\n'
      },
      {
        "path": "examples/market_data.py",
        "content": '"""Market data collection and financial data integration."""\n\nimport yfinance as yf\nimport pandas as pd\nfrom typing import Dict, Any\n\n\nclass FinancialDataCollector:\n    """Collects financial data from multiple sources."""\n\n    def __init__(self, alpha_vantage_key: str = None):\n        """Initialize the financial data collector.\n\n        Args:\n            alpha_vantage_key: API key for Alpha Vantage (optional)\n        """\n        self.stock_data = yf.Ticker\n        self.alpha_vantage_key = alpha_vantage_key\n        if alpha_vantage_key:\n            from alpha_vantage.fundamentaldata import FundamentalData\n            self.fundamental_data = FundamentalData(api_key=alpha_vantage_key)\n\n    def get_stock_data(self, ticker: str, period: str = "1y") -> pd.DataFrame:\n        """Retrieve historical stock data.\n\n        Args:\n            ticker: Stock ticker symbol\n            period: Time period for data (default: 1y)\n\n        Returns:\n            DataFrame with historical OHLCV data\n        """\n        data = yf.download(ticker, period=period)\n        return data\n\n    def get_financial_statements(self, ticker: str) -> Dict[str, Any]:\n        """Retrieve financial statements for a company.\n\n        Args:\n            ticker: Stock ticker symbol\n\n        Returns:\n            Dictionary containing income statement, balance sheet, and cash flow\n        """\n        company = yf.Ticker(ticker)\n        return {\n            "income_statement": company.financials,\n            "balance_sheet": company.balance_sheet,\n            "cash_flow": company.cashflow\n        }\n\n    def get_key_metrics(self, ticker: str) -> Dict[str, Any]:\n        """Retrieve key financial metrics for a company.\n\n        Args:\n            ticker: Stock ticker symbol\n\n        Returns:\n            Dictionary with key metrics like PE ratio, market cap, etc.\n        """\n        company = yf.Ticker(ticker)\n        return {\n            "market_cap": company.info.get("marketCap"),\n            "pe_ratio": company.info.get("trailingPE"),\n            "pb_ratio": company.info.get("priceToBook"),\n            "dividend_yield": company.info.get("dividendYield"),\n            "52_week_high": company.info.get("fiftyTwoWeekHigh"),\n            "52_week_low": company.info.get("fiftyTwoWeekLow")\n        }\n'
      },
      {
        "path": "examples/portfolio_manager.py",
        "content": '"""\nPortfolio Management Module\n\nHandles portfolio management operations including calculation of portfolio value,\nrebalancing, and risk assessment.\n"""\n\nimport yfinance as yf\nimport pandas as pd\nimport numpy as np\nfrom typing import Dict\n\n\nclass PortfolioManager:\n    """Manages investment portfolio operations."""\n\n    def __init__(self, portfolio: Dict[str, float]):\n        """\n        Initialize portfolio manager.\n\n        Args:\n            portfolio: Dictionary with ticker symbols and share counts\n        """\n        self.portfolio = portfolio\n\n    def calculate_portfolio_value(self) -> float:\n        """\n        Calculate total portfolio value.\n\n        Returns:\n            Total portfolio value in currency units\n        """\n        total_value = 0\n        for ticker, shares in self.portfolio.items():\n            price = yf.Ticker(ticker).info.get("currentPrice", 0)\n            total_value += price * shares\n        return total_value\n\n    def rebalance_portfolio(self, target_allocation: Dict[str, float]) -> Dict[str, float]:\n        """\n        Calculate rebalancing trades needed.\n\n        Args:\n            target_allocation: Target allocation percentages\n\n        Returns:\n            Dictionary with ticker symbols and shares to buy/sell\n        """\n        current_value = self.calculate_portfolio_value()\n        rebalancing_trades = {}\n\n        for ticker, target_pct in target_allocation.items():\n            target_value = current_value * target_pct\n            price = yf.Ticker(ticker).info.get("currentPrice", 0)\n            current_value_held = self.portfolio.get(ticker, 0) * price\n            shares_needed = (target_value - current_value_held) / price\n\n            if shares_needed != 0:\n                rebalancing_trades[ticker] = shares_needed\n\n        return rebalancing_trades\n\n    def calculate_portfolio_risk(self) -> float:\n        """\n        Calculate portfolio volatility/risk.\n\n        Returns:\n            Portfolio volatility\n        """\n        returns = pd.DataFrame()\n        for ticker in self.portfolio.keys():\n            data = yf.download(ticker, period="1y")\n            returns[ticker] = data["Close"].pct_change()\n\n        covariance = returns.cov()\n        weights = np.array(list(self.portfolio.values()))\n        portfolio_variance = np.dot(weights, np.dot(covariance, weights))\n        portfolio_volatility = np.sqrt(portfolio_variance)\n\n        return portfolio_volatility\n'
      },
      {
        "path": "examples/risk_analyzer.py",
        "content": '"""\nRisk Analysis Module\n\nImplements risk assessment techniques including volatility calculation,\nValue at Risk (VaR), Sharpe ratio, and company risk assessment.\n"""\n\nimport pandas as pd\nfrom typing import Dict\n\n\nclass RiskAnalyzer:\n    """Performs risk analysis on financial data."""\n\n    def calculate_volatility(self, prices: pd.Series, window: int = 30) -> pd.Series:\n        """\n        Calculate price volatility.\n\n        Args:\n            prices: Series of price data\n            window: Window size for volatility calculation (default: 30)\n\n        Returns:\n            Series with volatility values\n        """\n        returns = prices.pct_change()\n        volatility = returns.rolling(window=window).std()\n        return volatility\n\n    def calculate_value_at_risk(self, returns: pd.Series, confidence_level: float = 0.95) -> float:\n        """\n        Calculate Value at Risk (VaR).\n\n        Args:\n            returns: Series of return data\n            confidence_level: Confidence level for VaR (default: 0.95)\n\n        Returns:\n            Value at Risk value\n        """\n        return returns.quantile(1 - confidence_level)\n\n    def calculate_sharpe_ratio(self, returns: pd.Series, risk_free_rate: float = 0.02) -> float:\n        """\n        Calculate Sharpe Ratio.\n\n        Args:\n            returns: Series of return data\n            risk_free_rate: Risk-free rate (default: 0.02)\n\n        Returns:\n            Sharpe ratio value\n        """\n        excess_returns = returns - risk_free_rate\n        return excess_returns.mean() / excess_returns.std()\n\n    def assess_company_risk(self, company_data: Dict) -> Dict[str, float]:\n        """\n        Assess overall company risk.\n\n        Args:\n            company_data: Dictionary with company data\n\n        Returns:\n            Dictionary with risk assessments\n        """\n        risks = {\n            "market_risk": company_data.get("beta", 1),\n            "liquidity_risk": 1 / company_data.get("avg_trading_volume", 1),\n            "credit_risk": company_data.get("debt_to_equity", 0),\n        }\n        return risks\n'
      },
      {
        "path": "examples/technical_analyzer.py",
        "content": '"""\nTechnical Analysis Module\n\nImplements technical analysis techniques for stock price analysis including\nmoving averages, RSI, and support/resistance level identification.\n"""\n\nimport pandas as pd\nfrom typing import Dict, List\n\n\nclass TechnicalAnalyzer:\n    """Performs technical analysis on price data."""\n\n    def calculate_moving_averages(self, prices: pd.Series, windows: List[int] = None) -> Dict[str, pd.Series]:\n        """\n        Calculate moving averages for given windows.\n\n        Args:\n            prices: Series of price data\n            windows: List of window sizes (default: [20, 50, 200])\n\n        Returns:\n            Dictionary with moving average series\n        """\n        if windows is None:\n            windows = [20, 50, 200]\n\n        mas = {}\n        for window in windows:\n            mas[f"ma_{window}"] = prices.rolling(window=window).mean()\n        return mas\n\n    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:\n        """\n        Calculate the Relative Strength Index (RSI).\n\n        Args:\n            prices: Series of price data\n            period: RSI calculation period (default: 14)\n\n        Returns:\n            Series with RSI values\n        """\n        delta = prices.diff()\n        gains = (delta.where(delta > 0, 0)).rolling(window=period).mean()\n        losses = (-delta.where(delta < 0, 0)).rolling(window=period).mean()\n        rs = gains / losses\n        rsi = 100 - (100 / (1 + rs))\n        return rsi\n\n    def identify_support_resistance(self, prices: pd.Series) -> tuple:\n        """\n        Identify support and resistance levels.\n\n        Args:\n            prices: Series of price data\n\n        Returns:\n            Tuple of (support_levels, resistance_levels)\n        """\n        resistance_levels = prices.rolling(window=5, center=True).max()\n        support_levels = prices.rolling(window=5, center=True).min()\n        return support_levels, resistance_levels\n'
      }
    ]
  },
  {
    "key": "product-manager",
    "name": "product-manager",
    "description": "Product requirements and planning specialist. Creates PRDs and tech specs with functional/non-functional requirements, prioritizes features using MoSCoW/RICE frameworks, breaks down epics into user stories, and ensures requirements are testable and traceable. Use for PRD creation, requirements definition, feature prioritization, tech specs, epics, user stories, and acceptance criteria.",
    "sourceType": "skills.sh",
    "sourceUrl": "https://skills.sh/aj-geddes/claude-code-bmad-skills/product-manager",
    "resolvedSourceUrl": "https://github.com/aj-geddes/claude-code-bmad-skills/tree/b5c6403847b32f0facc95943a1aa837c96de31af/bmad-skills/product-manager",
    "resolvedCommit": "b5c6403847b32f0facc95943a1aa837c96de31af",
    "sourcePath": "bmad-skills/product-manager",
    "files": [
      {
        "path": "SKILL.md",
        "content": "---\nname: product-manager\ndescription: Product requirements and planning specialist. Creates PRDs and tech specs with functional/non-functional requirements, prioritizes features using MoSCoW/RICE frameworks, breaks down epics into user stories, and ensures requirements are testable and traceable. Use for PRD creation, requirements definition, feature prioritization, tech specs, epics, user stories, and acceptance criteria.\nallowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, AskUserQuestion\n---\n\n# Product Manager Skill\n\n**Role:** Phase 2 - Planning and requirements specialist\n\n**Function:** Create comprehensive requirements documents (PRDs), define functional and non-functional requirements, prioritize features, break down work into epics and user stories, and create lightweight technical specifications for smaller projects.\n\n## When to Use This Skill\n\nUse this skill when you need to:\n- Create Product Requirements Documents (PRDs) for Level 2+ projects\n- Create Technical Specifications for Level 0-1 projects\n- Define functional requirements (FRs) and non-functional requirements (NFRs)\n- Prioritize features using established frameworks (MoSCoW, RICE, Kano)\n- Break down requirements into epics and user stories\n- Validate and review existing requirements documents\n- Ensure requirements are testable, measurable, and traceable\n\n## Core Principles\n\n1. **User Value First** - Every requirement must deliver clear user or business value\n2. **Testable & Measurable** - All requirements must have explicit acceptance criteria\n3. **Scoped Appropriately** - Right-size planning documents to project level\n4. **Prioritized Ruthlessly** - Make hard choices; not everything can be critical\n5. **Traceable** - Maintain clear path: Requirements \u2192 Epics \u2192 Stories \u2192 Implementation\n\n## PRD vs Tech Spec Decision Logic\n\n**Use PRD when:**\n- Project Level 2+ (complex, multi-team, strategic)\n- Multiple stakeholders need alignment\n- Requirements are extensive or complex\n- Long-term product roadmap involved\n- Cross-functional coordination required\n\n**Use Tech Spec when:**\n- Project Level 0-1 (simple, tactical, single-team)\n- Implementation-focused with clear scope\n- Limited stakeholders\n- Quick delivery expected\n- Technical solution is primary concern\n\n## Requirements Types\n\n### Functional Requirements (FRs)\nWhat the system does - user capabilities and system behaviors.\n\n**Format:**\n```\nFR-{ID}: {Priority} - {Description}\nAcceptance Criteria:\n- Criterion 1\n- Criterion 2\n- Criterion 3\n```\n\n**Example:**\n```\nFR-001: MUST - User can create a new account with email and password\nAcceptance Criteria:\n- Email validation follows RFC 5322 standard\n- Password must be minimum 8 characters with mixed case and numbers\n- Account creation sends confirmation email within 30 seconds\n- Duplicate email addresses are rejected with clear error message\n```\n\n### Non-Functional Requirements (NFRs)\nHow the system performs - quality attributes and constraints.\n\n**Categories:**\n- **Performance:** Response times, throughput, resource usage\n- **Security:** Authentication, authorization, data protection\n- **Scalability:** User load, data volume, growth handling\n- **Reliability:** Uptime, fault tolerance, disaster recovery\n- **Usability:** Accessibility, user experience standards\n- **Maintainability:** Code quality, documentation, testability\n\n**Example:**\n```\nNFR-001: MUST - API endpoints must respond within 200ms for 95th percentile\nNFR-002: MUST - System must support 10,000 concurrent users\nNFR-003: SHOULD - Application must achieve WCAG 2.1 AA compliance\n```\n\n## Prioritization Frameworks\n\n### MoSCoW Method\nBest for: Time-boxed projects, MVP definition, stakeholder alignment\n\n- **Must Have:** Critical for MVP; without these, project fails\n- **Should Have:** Important but not vital; workarounds exist\n- **Could Have:** Nice to have if time/resources permit\n- **Won't Have:** Explicitly out of scope for this release\n\n### RICE Scoring\nBest for: Data-driven prioritization, comparing many features\n\n**Formula:** `(Reach \xD7 Impact \xD7 Confidence) / Effort`\n\n- **Reach:** How many users affected per time period?\n- **Impact:** How much value per user? (0.25=Minimal, 0.5=Low, 1=Medium, 2=High, 3=Massive)\n- **Confidence:** How certain are estimates? (0-100%)\n- **Effort:** Person-months of work\n\nUse the included script: `scripts/prioritize.py`\n\n### Kano Model\nBest for: Understanding feature types, customer satisfaction\n\n- **Basic:** Expected features (dissatisfiers if missing)\n- **Performance:** More is better (linear satisfaction)\n- **Excitement:** Unexpected delighters (exponential satisfaction)\n\nSee [REFERENCE.md](REFERENCE.md) for detailed framework guidance.\n\n## Epic to Story Breakdown\n\n**Epic Structure:**\n```\nEpic: [High-level capability]\nBusiness Value: [Why this matters]\nUser Segments: [Who benefits]\nStories:\n  - Story 1: As a [user], I want [capability] so that [benefit]\n  - Story 2: As a [user], I want [capability] so that [benefit]\n  - Story 3: As a [user], I want [capability] so that [benefit]\n```\n\n**Example:**\n```\nEpic: User Authentication\nBusiness Value: Enable personalized experiences and secure user data\nUser Segments: All application users\n\nStories:\n- As a new user, I want to create an account so that I can access personalized features\n- As a returning user, I want to log in securely so that I can access my data\n- As a user, I want to reset my password so that I can regain access if I forget it\n- As a user, I want to enable 2FA so that my account has additional security\n```\n\n## Workflow Process\n\n### Creating a PRD\n\n1. **Load Context**\n   - Check for existing product brief or project documentation\n   - Review project level and complexity\n   - Identify stakeholders\n\n2. **Gather Requirements**\n   - Interview stakeholders about functional needs\n   - Identify non-functional constraints\n   - Document assumptions and dependencies\n\n3. **Organize Requirements**\n   - Categorize as FR or NFR\n   - Assign unique IDs (FR-001, NFR-001)\n   - Apply prioritization framework\n   - Group related requirements into epics\n\n4. **Define Acceptance Criteria**\n   - Make each requirement testable\n   - Use specific, measurable criteria\n   - Avoid implementation details\n\n5. **Create Traceability Matrix**\n   - Link requirements to business objectives\n   - Map requirements to epics\n   - Document dependencies\n\n6. **Generate Document**\n   - Use template: `templates/prd.template.md`\n   - Fill all required sections\n   - Validate completeness with `scripts/validate-prd.sh`\n\n### Creating a Tech Spec\n\nFor Level 0-1 projects, use the lightweight tech spec template:\n\n1. **Define Scope**\n   - Problem statement\n   - Proposed solution\n   - Out of scope items\n\n2. **List Requirements**\n   - Core functional requirements (5-10 max)\n   - Key non-functional requirements (3-5 max)\n   - Use simplified format\n\n3. **Describe Approach**\n   - High-level technical approach\n   - Key technologies/patterns\n   - Implementation considerations\n\n4. **Plan Testing**\n   - Test scenarios\n   - Success criteria\n\nUse template: `templates/tech-spec.template.md`\n\n## Templates and Scripts\n\n### Available Templates\n- `templates/prd.template.md` - Full PRD template with all sections\n- `templates/tech-spec.template.md` - Lightweight tech spec for simple projects\n\n### Available Scripts\n- `scripts/prioritize.py` - Calculate RICE scores for feature prioritization\n- `scripts/validate-prd.sh` - Validate PRD has all required sections\n\n### Resources\n- `resources/prioritization-frameworks.md` - Detailed framework reference\n\n## Validation Checklist\n\nBefore completing a PRD or tech spec, verify:\n\n- [ ] All requirements have unique IDs\n- [ ] Every requirement has priority assigned\n- [ ] All requirements have acceptance criteria\n- [ ] NFRs are measurable and specific\n- [ ] Epics logically group related requirements\n- [ ] User stories follow \"As a... I want... so that...\" format\n- [ ] Dependencies are documented\n- [ ] Success metrics are defined\n- [ ] Traceability to business objectives is clear\n\n## Integration Points\n\n**Receives input from:**\n- Business Analyst (product brief, business objectives)\n- Stakeholders (requirements, priorities)\n\n**Provides output to:**\n- System Architect (PRD for architecture design)\n- UX Designer (interface requirements)\n- Scrum Master (epics for backlog)\n- Development teams (requirements for implementation)\n\n## Common Pitfalls to Avoid\n\n1. **Solution Specification:** Don't prescribe HOW; describe WHAT and WHY\n2. **Vague Requirements:** \"User-friendly\" is not testable; \"Loads in <2s\" is\n3. **Priority Inflation:** If everything is \"Must Have,\" nothing is\n4. **Missing Acceptance Criteria:** Requirements without criteria are not complete\n5. **Scope Creep:** Keep \"Won't Have\" list visible and enforce it\n6. **Ignoring Constraints:** NFRs are not optional afterthoughts\n\n## Subagent Strategy\n\nThis skill leverages parallel subagents to maximize context utilization (each agent has up to 1M tokens on Claude Sonnet 4.6 / Opus 4.6).\n\n### PRD Generation Workflow\n**Pattern:** Parallel Section Generation\n**Agents:** 4 parallel agents\n\n| Agent | Task | Output |\n|-------|------|--------|\n| Agent 1 | Functional Requirements section with acceptance criteria | bmad/outputs/section-functional-reqs.md |\n| Agent 2 | Non-Functional Requirements section with metrics | bmad/outputs/section-nfr.md |\n| Agent 3 | Epics breakdown with user stories | bmad/outputs/section-epics-stories.md |\n| Agent 4 | Dependencies, constraints, and traceability matrix | bmad/outputs/section-dependencies.md |\n\n**Coordination:**\n1. Load product brief and conduct requirements gathering (sequential)\n2. Write consolidated context to bmad/context/prd-requirements.md\n3. Launch all 4 agents in parallel with shared requirements context\n4. Each agent generates their PRD section with proper formatting\n5. Main context assembles sections into complete PRD document\n6. Validate completeness and run scripts/validate-prd.sh\n\n### Epic Prioritization Workflow\n**Pattern:** Parallel Section Generation\n**Agents:** N parallel agents (one per epic)\n\n| Agent | Task | Output |\n|-------|------|--------|\n| Agent 1 | Calculate RICE score for Epic 1 | bmad/outputs/epic-1-rice.md |\n| Agent 2 | Calculate RICE score for Epic 2 | bmad/outputs/epic-2-rice.md |\n| Agent N | Calculate RICE score for Epic N | bmad/outputs/epic-n-rice.md |\n\n**Coordination:**\n1. Extract all epics from requirements\n2. Write scoring criteria to bmad/context/rice-criteria.md\n3. Launch parallel agents, one per epic for RICE scoring\n4. Main context collects scores and creates prioritized backlog\n5. Update PRD with prioritization rationale\n\n### Tech Spec Generation Workflow (Level 0-1)\n**Pattern:** Parallel Section Generation\n**Agents:** 3 parallel agents\n\n| Agent | Task | Output |\n|-------|------|--------|\n| Agent 1 | Core requirements and acceptance criteria | bmad/outputs/section-requirements.md |\n| Agent 2 | Technical approach and implementation notes | bmad/outputs/section-approach.md |\n| Agent 3 | Test scenarios and success criteria | bmad/outputs/section-testing.md |\n\n**Coordination:**\n1. Define scope and gather requirements (sequential)\n2. Write problem statement to bmad/context/tech-spec-scope.md\n3. Launch parallel agents for section generation\n4. Main context assembles lightweight tech spec document\n\n### Example Subagent Prompt\n```\nTask: Generate Functional Requirements section for e-commerce PRD\nContext: Read bmad/context/prd-requirements.md for consolidated requirements\nObjective: Create comprehensive FR section with IDs, priorities, and acceptance criteria\nOutput: Write to bmad/outputs/section-functional-reqs.md\n\nDeliverables:\n1. 12-20 functional requirements with unique IDs (FR-001, FR-002, etc.)\n2. Each requirement includes MoSCoW priority (MUST/SHOULD/COULD/WON'T)\n3. Each requirement has 3-5 specific, testable acceptance criteria\n4. Requirements grouped by feature area\n5. Traceability links to business objectives\n\nConstraints:\n- Follow format: FR-{ID}: {Priority} - {Description}\n- Make all acceptance criteria measurable and testable\n- Avoid implementation details (describe WHAT, not HOW)\n- Ensure requirements align with product brief objectives\n```\n\n## Tips for LLMs\n\n- Use TodoWrite to track multi-section document creation\n- Ask clarifying questions when requirements are ambiguous\n- Push back on implementation details in requirements phase\n- Use quantitative data for prioritization when available\n- Think in terms of user value and business outcomes\n- Maintain traceability throughout the process\n- Link requirements explicitly to business objectives\n- Balance thoroughness with pragmatism based on project level\n- Reference templates and frameworks rather than reinventing\n- Validate completeness before marking work as done\n\n## Example Workflow\n\n```\nUser: I need to create a PRD for a new user dashboard feature\n\nProduct Manager:\nI'll help you create a comprehensive PRD for the user dashboard. Let me start by\nunderstanding the context.\n\n[Checks for existing documentation]\n\nI see there's a product brief available. I'll use that as a foundation.\n\nLet me gather requirements through a structured approach:\n\n1. Functional Requirements - What capabilities does the dashboard need?\n   - What data should be displayed?\n   - What actions can users take?\n   - What are the key user workflows?\n\n2. Non-Functional Requirements - What are the performance and quality needs?\n   - How many concurrent users?\n   - What response time is acceptable?\n   - Are there accessibility requirements?\n\n3. Prioritization - Let's use MoSCoW to prioritize features\n   - What's critical for MVP?\n   - What can be deferred?\n\n[After gathering requirements]\n\nI'll now create the PRD with:\n- 12 functional requirements (8 Must, 3 Should, 1 Could)\n- 5 non-functional requirements\n- 3 epics grouping related features\n- Traceability matrix linking to business objectives\n\n[Generates PRD using template]\n\nPRD created: docs/prd-user-dashboard-2025-12-09.md\n\nValidation complete:\n\u2713 All requirements have IDs and priorities\n\u2713 All requirements have acceptance criteria\n\u2713 NFRs are measurable\n\u2713 Traceability matrix complete\n\nRecommended next step: Review with stakeholders, then proceed to architecture design.\n```\n\n---\n\n**Remember:** You bridge vision (Phase 1) and implementation (Phase 4). Clear, prioritized, testable requirements set teams up for success.\n"
      },
      {
        "path": "REFERENCE.md",
        "content": '# Product Manager Reference Guide\n\nThis document provides detailed guidance on prioritization frameworks, requirements patterns, and best practices for product management activities.\n\n## Prioritization Frameworks\n\n### MoSCoW Method\n\n**Overview:** Time-boxed prioritization framework for requirements classification.\n\n**When to Use:**\n- Fixed timeline projects\n- MVP definition\n- Stakeholder alignment needed\n- Resource-constrained environments\n- Clear scope boundaries required\n\n**How to Apply:**\n\n1. **Must Have (Critical)**\n   - Without this, the project/release fails\n   - Legal/regulatory requirements\n   - Core functionality that defines the product\n   - Safety-critical features\n   - **Test:** "What happens if we don\'t include this?" \u2192 "Project fails"\n\n2. **Should Have (Important)**\n   - Important but not vital\n   - Workarounds exist if not included\n   - Significant impact on user satisfaction\n   - Will be included unless resource/time constraints prevent\n   - **Test:** "What happens if we don\'t include this?" \u2192 "Users disappointed but product viable"\n\n3. **Could Have (Nice to Have)**\n   - Desirable but not necessary\n   - Small impact if left out\n   - Will be included if time/resources allow\n   - Often called "nice to haves"\n   - **Test:** "What happens if we don\'t include this?" \u2192 "Most users won\'t notice"\n\n4. **Won\'t Have (Out of Scope)**\n   - Explicitly excluded from this release\n   - May be considered for future releases\n   - Helps manage scope creep\n   - Documents conscious decisions\n   - **Test:** "Why are we explicitly excluding this?" \u2192 Document the reason\n\n**Example Application:**\n\n```\nFeature: User Dashboard\n\nMust Have:\n- Display user\'s active projects\n- Show recent activity feed\n- Basic profile information\n- Logout functionality\n\nShould Have:\n- Project completion statistics\n- Activity filters (date, type)\n- Customizable layout\n- Quick action shortcuts\n\nCould Have:\n- Team member activity view\n- Exportable reports\n- Dark mode toggle\n- Widget customization\n\nWon\'t Have:\n- Social sharing features\n- Collaborative editing\n- Mobile app (separate project)\n- Third-party integrations\n```\n\n### RICE Scoring\n\n**Overview:** Data-driven prioritization using quantitative scoring.\n\n**Formula:** `RICE Score = (Reach \xD7 Impact \xD7 Confidence) / Effort`\n\n**When to Use:**\n- Multiple features to compare\n- Data-driven decision making needed\n- Cross-functional prioritization\n- Resource allocation decisions\n- Portfolio management\n\n**Component Definitions:**\n\n1. **Reach (How Many?)**\n   - Number of users/customers affected per time period\n   - Measured in users per quarter/month\n   - Based on data, not assumptions\n   - Examples:\n     - "500 users per month will use this feature"\n     - "2,000 customers per quarter will benefit"\n   - **Estimation:** Use analytics, surveys, or market research\n\n2. **Impact (How Much Value?)**\n   - Value delivered per user\n   - Scored on scale: 3 = Massive, 2 = High, 1 = Medium, 0.5 = Low, 0.25 = Minimal\n   - Measures satisfaction, revenue, efficiency gain\n   - Examples:\n     - Massive (3): Solves critical pain point, major revenue driver\n     - High (2): Significant improvement to key workflow\n     - Medium (1): Noticeable benefit, clear value\n     - Low (0.5): Minor improvement, marginal benefit\n     - Minimal (0.25): Barely noticeable improvement\n   - **Estimation:** User research, revenue projections, efficiency metrics\n\n3. **Confidence (How Sure?)**\n   - Certainty in your estimates\n   - Percentage: 100% = High confidence, 80% = Medium, 50% = Low\n   - Accounts for uncertainty in Reach and Impact\n   - Examples:\n     - 100%: Backed by solid data and research\n     - 80%: Some data, reasonable assumptions\n     - 50%: Mostly assumptions, limited data\n   - **Rule:** If confidence <50%, gather more data\n\n4. **Effort (How Much Work?)**\n   - Total team time required\n   - Measured in person-months\n   - Includes design, development, testing, deployment\n   - Examples:\n     - 0.5 = 2 weeks of team time\n     - 1.0 = 1 month of team time\n     - 3.0 = 3 months of team time\n   - **Estimation:** Engineering input required\n\n**Scoring Process:**\n\n```\nFeature A: Quick Win Dashboard Widget\n- Reach: 2,000 users/month\n- Impact: 1 (Medium - helpful but not transformative)\n- Confidence: 100% (clear data from user surveys)\n- Effort: 0.5 person-months\n- RICE Score: (2,000 \xD7 1 \xD7 1.0) / 0.5 = 4,000\n\nFeature B: Advanced Analytics Engine\n- Reach: 500 users/month\n- Impact: 3 (Massive - key differentiator, major value)\n- Confidence: 80% (good research, some assumptions)\n- Effort: 4 person-months\n- RICE Score: (500 \xD7 3 \xD7 0.8) / 4 = 300\n\nPriority: Feature A (4,000) > Feature B (300)\n```\n\n**Using the Script:**\n\n```bash\npython scripts/prioritize.py\n# Follow prompts to enter Reach, Impact, Confidence, Effort\n# Script calculates RICE score and provides ranking\n```\n\n**Interpretation:**\n- Higher scores = higher priority\n- Compare relative scores, not absolute numbers\n- Review outliers (very high/low scores)\n- Combine with other factors (strategic alignment, dependencies)\n\n### Kano Model\n\n**Overview:** Framework for understanding feature types and customer satisfaction impact.\n\n**When to Use:**\n- Understanding feature value perception\n- Balancing feature types in roadmap\n- Customer satisfaction optimization\n- Competitive differentiation strategy\n- Innovation vs. stability decisions\n\n**Feature Categories:**\n\n1. **Basic Features (Must-Be Quality)**\n   - **Characteristic:** Expected by users; dissatisfaction if missing\n   - **Satisfaction Impact:** Neutral when present, negative when absent\n   - **Examples:**\n     - Login/authentication\n     - Data persistence\n     - Basic CRUD operations\n     - Error messages\n     - Help documentation\n   - **Strategy:** Deliver efficiently; don\'t over-invest\n   - **Competitive Impact:** No advantage, but absence is fatal\n\n2. **Performance Features (One-Dimensional Quality)**\n   - **Characteristic:** More is better; linear satisfaction\n   - **Satisfaction Impact:** Satisfaction increases with quality\n   - **Examples:**\n     - Page load speed (faster = better)\n     - Search accuracy (more relevant = better)\n     - Storage capacity (more = better)\n     - Battery life (longer = better)\n   - **Strategy:** Invest where competitive advantage exists\n   - **Competitive Impact:** Direct comparison point\n\n3. **Excitement Features (Attractive Quality)**\n   - **Characteristic:** Unexpected delights; not expected\n   - **Satisfaction Impact:** High satisfaction when present, neutral when absent\n   - **Examples:**\n     - AI-powered suggestions\n     - Innovative UI interactions\n     - Proactive problem solving\n     - Easter eggs\n     - Beta feature previews\n   - **Strategy:** Differentiate and delight\n   - **Competitive Impact:** Strong advantage if done well\n   - **Note:** Excitement features become Performance features over time\n\n4. **Indifferent Features**\n   - **Characteristic:** Users don\'t care either way\n   - **Satisfaction Impact:** No impact on satisfaction\n   - **Strategy:** Don\'t build these\n   - **Warning:** What seems exciting to teams may be indifferent to users\n\n5. **Reverse Features**\n   - **Characteristic:** Presence causes dissatisfaction\n   - **Satisfaction Impact:** Negative when present\n   - **Examples:**\n     - Unwanted notifications\n     - Forced upsells\n     - Overly complex interfaces\n   - **Strategy:** Identify and remove\n\n**Feature Evolution:**\n```\nExcitement \u2192 Performance \u2192 Basic \u2192 Indifferent/Reverse\n(Innovation) \u2192 (Standard) \u2192 (Expected) \u2192 (Obsolete)\n```\n\n**Application Example:**\n\n```\nProduct: Project Management Tool\n\nBasic Features:\n- Create/edit/delete tasks\n- Assign tasks to users\n- Set due dates\n- Mark tasks complete\n\u2192 Must have; no differentiation\n\nPerformance Features:\n- Task search speed\n- Number of integrations\n- Report customization\n- Collaboration features\n\u2192 Competitive comparison points\n\nExcitement Features:\n- AI task prioritization\n- Automatic timeline optimization\n- Smart dependency detection\n- Proactive risk alerts\n\u2192 Differentiation opportunities\n\nIndifferent:\n- Task color schemes beyond basics\n- Animated transitions (excessive)\n\u2192 Don\'t invest\n\nReverse:\n- Auto-assign tasks without permission\n- Mandatory daily digests\n\u2192 Remove or make optional\n```\n\n**Kano Survey Questions:**\n\nFor each feature, ask two questions:\n\n1. **Functional:** "How would you feel if this feature was present?"\n   - I like it\n   - I expect it\n   - I\'m neutral\n   - I can tolerate it\n   - I dislike it\n\n2. **Dysfunctional:** "How would you feel if this feature was absent?"\n   - I like it\n   - I expect it\n   - I\'m neutral\n   - I can tolerate it\n   - I dislike it\n\n**Interpretation Matrix:**\n\n| Functional \u2192 | Like | Expect | Neutral | Tolerate | Dislike |\n|--------------|------|--------|---------|----------|---------|\n| Dysfunctional \u2193 | | | | | |\n| Like | Q | E | E | E | P |\n| Expect | R | I | I | I | B |\n| Neutral | R | I | I | I | B |\n| Tolerate | R | I | I | I | B |\n| Dislike | R | R | R | R | Q |\n\n- E = Excitement\n- P = Performance\n- B = Basic\n- I = Indifferent\n- R = Reverse\n- Q = Questionable\n\n## Requirements Patterns\n\n### Functional Requirement Patterns\n\n**User Action Pattern:**\n```\nFR-XXX: [Priority] - User can [action] [object] [qualifier]\nAcceptance Criteria:\n- [Specific condition that must be true]\n- [Measurable outcome]\n- [Edge case handling]\n```\n\n**System Behavior Pattern:**\n```\nFR-XXX: [Priority] - System shall [behavior] when [condition]\nAcceptance Criteria:\n- [Trigger condition]\n- [Expected behavior]\n- [Error handling]\n```\n\n**Data Management Pattern:**\n```\nFR-XXX: [Priority] - System shall store/retrieve/update [data] with [constraints]\nAcceptance Criteria:\n- [Data validation rules]\n- [Storage requirements]\n- [Retrieval performance]\n```\n\n**Integration Pattern:**\n```\nFR-XXX: [Priority] - System shall integrate with [external system] to [purpose]\nAcceptance Criteria:\n- [Integration method]\n- [Data exchange format]\n- [Error handling and fallback]\n```\n\n### Non-Functional Requirement Patterns\n\n**Performance Pattern:**\n```\nNFR-XXX: [Priority] - [Operation] shall complete within [time] for [percentile] of requests\nExample: API response shall complete within 200ms for 95th percentile under normal load\n```\n\n**Scalability Pattern:**\n```\nNFR-XXX: [Priority] - System shall support [quantity] [resource] with [degradation] degradation\nExample: System shall support 10,000 concurrent users with <5% performance degradation\n```\n\n**Security Pattern:**\n```\nNFR-XXX: [Priority] - [Component] shall implement [security control] per [standard]\nExample: API shall implement OAuth 2.0 authentication per RFC 6749\n```\n\n**Reliability Pattern:**\n```\nNFR-XXX: [Priority] - System shall maintain [uptime]% availability excluding planned maintenance\nExample: System shall maintain 99.9% availability excluding scheduled maintenance windows\n```\n\n**Usability Pattern:**\n```\nNFR-XXX: [Priority] - [Interface] shall achieve [metric] compliance/score\nExample: Application shall achieve WCAG 2.1 AA compliance for all user-facing features\n```\n\n**Maintainability Pattern:**\n```\nNFR-XXX: [Priority] - Codebase shall maintain [metric] above [threshold]\nExample: Codebase shall maintain test coverage above 80% for critical business logic\n```\n\n## Epic and Story Patterns\n\n### Epic Template\n\n```\nEpic ID: EPIC-XXX\nTitle: [High-level capability]\n\nBusiness Value:\n[Why this matters to the business/users]\n\nUser Segments:\n- [Segment 1]\n- [Segment 2]\n\nSuccess Metrics:\n- [Measurable outcome 1]\n- [Measurable outcome 2]\n\nRelated Requirements:\n- FR-XXX\n- FR-YYY\n- NFR-ZZZ\n\nDependencies:\n- [Other epics or systems]\n\nStories:\n- STORY-XXX: [User story 1]\n- STORY-YYY: [User story 2]\n- STORY-ZZZ: [User story 3]\n```\n\n### User Story Template\n\n```\nAs a [user type/role],\nI want [capability/feature],\nSo that [business value/benefit].\n\nAcceptance Criteria:\n- Given [context/precondition]\n  When [action/event]\n  Then [expected outcome]\n\n- Given [context/precondition]\n  When [action/event]\n  Then [expected outcome]\n\nTechnical Notes:\n[Implementation considerations, if any]\n\nDependencies:\n[Other stories or technical dependencies]\n\nEstimate:\n[Story points or time estimate]\n```\n\n### Story Size Guidelines\n\n**Good Story Size:**\n- Completable in 1-3 days\n- Single responsibility\n- Independently testable\n- Delivers incremental value\n\n**Story Too Large (Split It):**\n- Takes more than 1 sprint\n- Multiple user roles involved\n- Complex technical implementation\n- Many acceptance criteria\n\n**Story Too Small (Combine It):**\n- Trivial implementation\n- No business value alone\n- Just configuration change\n\n## Traceability Matrix\n\n**Purpose:** Link requirements to business objectives and track implementation.\n\n**Structure:**\n\n| Requirement ID | Description | Priority | Business Objective | Epic | Status | Test Case |\n|----------------|-------------|----------|-------------------|------|--------|-----------|\n| FR-001 | User login | MUST | Personalization | EPIC-AUTH | Complete | TC-001 |\n| FR-002 | Password reset | MUST | Security | EPIC-AUTH | In Progress | TC-002 |\n| NFR-001 | <200ms response | MUST | User Experience | N/A | Planned | TC-015 |\n\n**Maintenance:**\n- Update as requirements change\n- Link to test cases as they\'re created\n- Track status throughout implementation\n- Use for impact analysis when changes occur\n\n## Acceptance Criteria Best Practices\n\n**Good Acceptance Criteria:**\n- Specific and unambiguous\n- Testable (can verify pass/fail)\n- Written from user perspective\n- Independent of implementation\n- Include happy path and edge cases\n\n**Examples:**\n\n**Bad:**\n```\n- System should be fast\n- User interface should be intuitive\n- Data should be secure\n```\n\n**Good:**\n```\n- Page loads within 2 seconds on 3G connection\n- New users complete first task within 5 minutes without help documentation\n- All data transmission uses TLS 1.3 encryption\n```\n\n**Gherkin Format (Given-When-Then):**\n\n```\nGiven [initial context/state]\nWhen [action/event occurs]\nThen [expected outcome]\n```\n\nExample:\n```\nGiven a user is on the login page\nWhen they enter valid credentials and click "Login"\nThen they are redirected to the dashboard within 2 seconds\nAnd their session token is stored securely\n```\n\n## Framework Selection Guide\n\n**Choose MoSCoW when:**\n- You have a fixed timeline\n- Need stakeholder alignment\n- Defining MVP scope\n- Simple, fast prioritization needed\n\n**Choose RICE when:**\n- You have quantitative data\n- Comparing many features\n- Need objective prioritization\n- Resource allocation decisions\n\n**Choose Kano when:**\n- Understanding feature value perception\n- Balancing innovation vs. basics\n- Competitive positioning\n- Long-term roadmap planning\n\n**Use Multiple Frameworks:**\n- Apply MoSCoW for initial filtering\n- Use RICE to rank within each MoSCoW category\n- Apply Kano to understand feature types\n- Combine insights for final prioritization\n\n## Common Anti-Patterns\n\n### Requirements Anti-Patterns\n\n1. **The Solution Specification**\n   - **Bad:** "System shall use PostgreSQL database with connection pooling"\n   - **Good:** "System shall persist user data with sub-100ms read latency"\n\n2. **The Vague Requirement**\n   - **Bad:** "System shall be user-friendly"\n   - **Good:** "90% of users shall complete core workflow without help docs"\n\n3. **The Gold Plating**\n   - **Bad:** Making everything "MUST" priority\n   - **Good:** Ruthlessly prioritize; most features are SHOULD or COULD\n\n4. **The Missing Why**\n   - **Bad:** "Add export to PDF button"\n   - **Good:** "Enable report sharing with stakeholders who lack system access"\n\n5. **The Implementation Constraint**\n   - **Bad:** "Use React hooks for state management"\n   - **Good:** "UI shall maintain state across page navigation"\n\n### Prioritization Anti-Patterns\n\n1. **HIPPO (Highest Paid Person\'s Opinion)**\n   - Use data and frameworks, not authority\n\n2. **Prioritization by Volume**\n   - Most requested \u2260 most valuable\n\n3. **The Squeaky Wheel**\n   - Loudest stakeholder \u2260 most important\n\n4. **Gut Feel Only**\n   - Balance intuition with data\n\n5. **Everything is High Priority**\n   - If everything is high, nothing is\n\n## Additional Resources\n\n- See `templates/prd.template.md` for complete PRD structure\n- See `templates/tech-spec.template.md` for lightweight alternative\n- Use `scripts/prioritize.py` for RICE calculations\n- Use `scripts/validate-prd.sh` to check document completeness\n'
      },
      {
        "path": "resources/prioritization-frameworks.md",
        "content": '# Prioritization Frameworks - Detailed Reference\n\nThis document provides comprehensive guidance on feature and requirement prioritization frameworks used in product management.\n\n---\n\n## Table of Contents\n\n1. [MoSCoW Method](#moscow-method)\n2. [RICE Scoring](#rice-scoring)\n3. [Kano Model](#kano-model)\n4. [Value vs. Effort Matrix](#value-vs-effort-matrix)\n5. [Weighted Scoring Model](#weighted-scoring-model)\n6. [ICE Score](#ice-score)\n7. [Opportunity Scoring](#opportunity-scoring)\n8. [Story Mapping](#story-mapping)\n9. [Framework Comparison](#framework-comparison)\n10. [Choosing the Right Framework](#choosing-the-right-framework)\n\n---\n\n## MoSCoW Method\n\n### Overview\nMoSCoW is a time-boxed prioritization technique that categorizes requirements into four groups based on necessity and impact.\n\n**Best For:**\n- Agile projects with fixed timelines\n- MVP definition and scope management\n- Stakeholder alignment\n- Resource-constrained projects\n\n### Categories Explained\n\n#### Must Have (M)\n**Definition:** Non-negotiable requirements critical to project success.\n\n**Identification Test:**\n- "Without this, the project/release is a failure"\n- "This is legally or contractually required"\n- "This creates unacceptable safety or security risks if omitted"\n\n**Examples:**\n- User authentication for a secure application\n- Core transaction processing in payment system\n- Legal compliance requirements (GDPR, HIPAA)\n- Data backup and recovery capabilities\n\n**Characteristics:**\n- Cannot be deferred to later release\n- No reasonable workaround exists\n- Directly tied to project success criteria\n\n---\n\n#### Should Have (S)\n**Definition:** Important requirements that add significant value but are not vital.\n\n**Identification Test:**\n- "This would cause pain if omitted, but project can still succeed"\n- "A workaround exists, though it\'s not ideal"\n- "This significantly impacts user satisfaction"\n\n**Examples:**\n- Advanced filtering and search options\n- Bulk operations for efficiency\n- Email notifications (if alternative notifications exist)\n- Export to multiple formats (if at least one export exists)\n\n**Characteristics:**\n- High priority but not critical\n- Will be included if time/resources permit\n- May be deferred to next release if necessary\n- Workarounds are available\n\n---\n\n#### Could Have (C)\n**Definition:** Desirable features that would be nice to have but have minimal impact if excluded.\n\n**Identification Test:**\n- "This would improve user experience but isn\'t necessary"\n- "Users would barely notice if this was missing"\n- "This is a quality-of-life improvement"\n\n**Examples:**\n- Custom themes and color schemes\n- Keyboard shortcuts\n- Advanced customization options\n- Easter eggs and delighters\n\n**Characteristics:**\n- Lowest priority of included features\n- Implemented only if time allows\n- Easily deferred without impact\n- Low cost-benefit ratio\n\n---\n\n#### Won\'t Have (W)\n**Definition:** Features explicitly excluded from current scope.\n\n**Identification Test:**\n- "This is valuable but not for this release"\n- "We\'ve decided this is out of scope"\n- "This doesn\'t align with current objectives"\n\n**Examples:**\n- Features planned for future releases\n- Features that don\'t align with current strategy\n- Nice-to-haves with low ROI\n- Features that would expand scope too much\n\n**Characteristics:**\n- Explicitly documented as out of scope\n- Helps manage expectations\n- Prevents scope creep\n- May be reconsidered in future\n\n---\n\n### Application Process\n\n1. **List All Requirements**\n   - Gather all proposed features and requirements\n   - Ensure each is clearly defined\n\n2. **Educate Stakeholders**\n   - Explain MoSCoW categories\n   - Set expectations about limitations\n\n3. **Initial Classification**\n   - Have team independently classify requirements\n   - Use sticky notes or digital voting\n\n4. **Discuss Disagreements**\n   - Focus on items with classification conflicts\n   - Use identification tests to resolve\n\n5. **Validate Must Haves**\n   - Challenge each "Must Have" rigorously\n   - "Must Haves" should be <60% of total features\n   - If too many Must Haves, project scope is too large\n\n6. **Document and Share**\n   - Create clear list with rationales\n   - Get stakeholder sign-off\n\n---\n\n### Common Pitfalls\n\n**Everything is Must Have:**\n- **Problem:** No real prioritization occurs\n- **Solution:** Enforce 60% maximum on Must Haves; challenge rigorously\n\n**Confusing Wants with Needs:**\n- **Problem:** Should Haves classified as Must Haves\n- **Solution:** Use the identification tests consistently\n\n**Not Documenting Won\'t Haves:**\n- **Problem:** Excluded features keep being raised\n- **Solution:** Explicitly list and explain Won\'t Haves\n\n---\n\n## RICE Scoring\n\n### Overview\nRICE is a quantitative framework that scores features based on four factors: Reach, Impact, Confidence, and Effort.\n\n**Formula:** `RICE Score = (Reach \xD7 Impact \xD7 Confidence) / Effort`\n\n**Best For:**\n- Data-driven organizations\n- Comparing many features objectively\n- Portfolio prioritization\n- Cross-functional alignment\n\n### Components Deep Dive\n\n#### Reach\n**Definition:** How many people will be affected by this feature within a time period?\n\n**How to Measure:**\n- Users per month/quarter who will use the feature\n- Transactions per period affected\n- Customer accounts impacted\n\n**Data Sources:**\n- Analytics data\n- User research\n- Market size data\n- Sales projections\n\n**Examples:**\n- "500 users per month will use the export feature"\n- "2,000 transactions per quarter will be processed faster"\n- "All 10,000 active users will see the new dashboard"\n\n**Tips:**\n- Use consistent time periods (monthly or quarterly)\n- Be conservative in estimates\n- Account for adoption curves\n- Consider seasonal variations\n\n---\n\n#### Impact\n**Definition:** How much value does this deliver per user/transaction?\n\n**Scale:**\n- **3 = Massive Impact:** Transforms the user experience or business\n- **2 = High Impact:** Significant improvement to key workflows\n- **1 = Medium Impact:** Noticeable benefit, clear value\n- **0.5 = Low Impact:** Minor improvement, marginal benefit\n- **0.25 = Minimal Impact:** Barely noticeable improvement\n\n**Assessment Questions:**\n- Does this solve a critical pain point? \u2192 3\n- Does this significantly improve satisfaction? \u2192 2\n- Does this make tasks easier? \u2192 1\n- Does this provide minor convenience? \u2192 0.5\n- Is this barely noticeable? \u2192 0.25\n\n**Examples:**\n\n**Massive (3):**\n- Reducing checkout time from 10 minutes to 30 seconds\n- Eliminating a frequent data loss bug\n- Adding core functionality that was previously missing\n\n**High (2):**\n- Improving search accuracy from 60% to 95%\n- Adding batch operations to save hours of manual work\n- Implementing real-time collaboration\n\n**Medium (1):**\n- Adding keyboard shortcuts for common actions\n- Improving page load from 3s to 1s\n- Better error messages\n\n**Low (0.5):**\n- Adding a copy-to-clipboard button\n- Minor UI polish\n- Small performance improvement\n\n**Minimal (0.25):**\n- Changing button colors\n- Adding a tooltip\n- Cosmetic changes\n\n---\n\n#### Confidence\n**Definition:** How certain are you about your Reach and Impact estimates?\n\n**Scale:**\n- **100% = High Confidence:** Backed by solid data and research\n- **80% = Medium Confidence:** Some data, reasonable assumptions\n- **50% = Low Confidence:** Mostly assumptions, limited data\n\n**Assessment Factors:**\n- Quality of data available\n- Amount of user research conducted\n- Past experience with similar features\n- Market validation\n\n**Examples:**\n\n**High Confidence (100%):**\n- Feature requested by 200+ customers in surveys\n- A/B test data shows 20% improvement\n- Proven success in competitor products\n- Direct analytics data available\n\n**Medium Confidence (80%):**\n- Requested by some customers\n- Industry best practices\n- Reasonable extrapolation from data\n- Good user research\n\n**Low Confidence (50%):**\n- Assumption-based\n- Limited or no data\n- Untested hypothesis\n- Novel/experimental feature\n\n**Rule:** If confidence is below 50%, gather more data before proceeding.\n\n---\n\n#### Effort\n**Definition:** Total team time required to implement, test, and deploy.\n\n**Unit:** Person-months (total work, not calendar time)\n\n**Includes:**\n- Design effort\n- Development effort\n- Testing effort\n- Documentation effort\n- Deployment effort\n- Training/support preparation\n\n**Examples:**\n- **0.5 person-months:** 2 weeks of work for a small team\n- **1 person-month:** 4 weeks of work for one person or 2 weeks for two\n- **3 person-months:** Major feature requiring significant development\n- **12 person-months:** Large initiative requiring multiple teams\n\n**Estimation Tips:**\n- Get input from engineering team\n- Include all disciplines (design, dev, QA)\n- Add buffer for unknowns (20-30%)\n- Break down complex features\n- Account for technical debt\n\n---\n\n### RICE Calculation Examples\n\n#### Example 1: Quick Win Feature\n\n**Feature:** Add "Export to CSV" button\n\n- **Reach:** 1,000 users/month will use export\n- **Impact:** 0.5 (Low - saves minor time)\n- **Confidence:** 100% (clear analytics data)\n- **Effort:** 0.5 person-months (simple feature)\n\n**RICE Score = (1,000 \xD7 0.5 \xD7 1.0) / 0.5 = 1,000**\n\n---\n\n#### Example 2: Major Feature\n\n**Feature:** Advanced Analytics Dashboard\n\n- **Reach:** 500 users/month (power users segment)\n- **Impact:** 3 (Massive - key differentiator)\n- **Confidence:** 80% (good research, some assumptions)\n- **Effort:** 4 person-months (complex feature)\n\n**RICE Score = (500 \xD7 3 \xD7 0.8) / 4 = 300**\n\n---\n\n#### Example 3: Infrastructure Improvement\n\n**Feature:** Performance Optimization\n\n- **Reach:** 10,000 users/month (all users)\n- **Impact:** 1 (Medium - noticeable improvement)\n- **Confidence:** 100% (measured performance issues)\n- **Effort:** 2 person-months\n\n**RICE Score = (10,000 \xD7 1 \xD7 1.0) / 2 = 5,000**\n\n---\n\n### Prioritization Result\n\n1. Infrastructure Improvement: 5,000 (High reach, proven impact)\n2. Quick Win Feature: 1,000 (Easy win with good return)\n3. Major Feature: 300 (High effort reduces score despite high impact)\n\n---\n\n### Using RICE Effectively\n\n**Step 1: Score All Features**\n- Create spreadsheet with all features\n- Fill in Reach, Impact, Confidence, Effort for each\n- Calculate RICE scores\n\n**Step 2: Sort by Score**\n- Order features by RICE score descending\n- This gives initial prioritization\n\n**Step 3: Review Outliers**\n- Very high scores: Quick wins or high-impact initiatives\n- Very low scores: Reconsider if worth doing\n- Similar scores: Apply other considerations\n\n**Step 4: Adjust for Strategy**\n- RICE provides data-driven baseline\n- Consider strategic alignment\n- Account for dependencies\n- Factor in timing and resources\n\n**Step 5: Communicate Results**\n- Share scoring rationale\n- Explain how decisions were made\n- Get stakeholder buy-in\n\n---\n\n### Common Pitfalls\n\n**Sandbagging Effort:**\n- **Problem:** Inflating effort to lower scores\n- **Solution:** Get multiple estimates, hold teams accountable\n\n**Inflating Impact:**\n- **Problem:** Making everything "Massive" impact\n- **Solution:** Use consistent rubric, compare features\n\n**Ignoring Confidence:**\n- **Problem:** Treating guesses same as data\n- **Solution:** Penalize low-confidence items, gather more data\n\n**Treating Scores as Absolute:**\n- **Problem:** Following scores blindly\n- **Solution:** Use as input to decision-making, not sole determinant\n\n---\n\n## Kano Model\n\n### Overview\nThe Kano Model categorizes features based on how they influence customer satisfaction, helping balance must-haves, performance features, and delighters.\n\n**Developed by:** Professor Noriaki Kano, 1980s\n\n**Best For:**\n- Understanding feature value perception\n- Balancing innovation with fundamentals\n- Competitive differentiation strategy\n- Long-term roadmap planning\n\n### Feature Categories\n\n#### 1. Basic Features (Must-Be Quality)\n\n**Characteristics:**\n- Expected by users; taken for granted when present\n- Causes strong dissatisfaction when absent\n- Little additional satisfaction when improved\n- Entry-level requirements to compete\n\n**Satisfaction Curve:**\n```\n   Satisfaction\n        |     /\n        |    /\n        |---/---- (neutral when present)\n        |  /\n        | /_____ (highly negative when absent)\n        |________ Functionality\n```\n\n**Examples:**\n- **E-commerce:** Shopping cart, checkout, payment processing\n- **Email:** Send, receive, search functionality\n- **Hotel:** Clean room, working plumbing, wifi\n- **Car:** Brakes, steering, doors\n\n**Strategy:**\n- Deliver efficiently; don\'t over-invest\n- Get these right but don\'t expect competitive advantage\n- Absence is catastrophic; presence is expected\n- Focus on reliability and consistency\n\n**Warning Signs of Missing Basic Features:**\n- Customer complaints about "obvious" missing functionality\n- High churn rate\n- Poor reviews mentioning fundamental issues\n\n---\n\n#### 2. Performance Features (One-Dimensional Quality)\n\n**Characteristics:**\n- More is better; linear satisfaction\n- Satisfaction increases with quality/quantity\n- Dissatisfaction decreases with lower quality\n- Direct comparison points with competitors\n\n**Satisfaction Curve:**\n```\n   Satisfaction\n        |        /\n        |       /\n        |      /\n        |-----/----\n        |    /\n        |   /\n        |________ Functionality\n```\n\n**Examples:**\n- **E-commerce:** Delivery speed, product variety, prices\n- **Software:** Page load time, storage capacity, feature count\n- **Hotel:** Room size, amenities, location quality\n- **Search Engine:** Result relevance, speed, ad ratio\n\n**Strategy:**\n- Key competitive battleground\n- Invest where you can win or defend\n- Benchmark against competitors\n- Continuous improvement needed\n- Balance cost vs. competitive advantage\n\n**Measurement:**\n- Net Promoter Score (NPS)\n- Customer Satisfaction (CSAT)\n- Feature usage metrics\n- Competitive comparisons\n\n---\n\n#### 3. Excitement Features (Attractive Quality)\n\n**Characteristics:**\n- Unexpected delighters; not expected by users\n- High satisfaction when present\n- No dissatisfaction when absent (users don\'t know to expect them)\n- Differentiate from competitors\n\n**Satisfaction Curve:**\n```\n   Satisfaction\n        |          /----\n        |         /\n        |        /\n        |-------/----\n        |      /\n        |     /\n        |________ Functionality\n```\n\n**Examples:**\n- **Original iPhone:** Multi-touch gestures, visual voicemail\n- **Amazon:** One-click ordering, personalized recommendations\n- **Netflix:** Download for offline viewing, smart downloads\n- **Uber:** Live driver tracking, fare estimates\n\n**Strategy:**\n- Source of competitive advantage\n- Requires innovation and creativity\n- High risk, high reward\n- Become Performance features over time\n- Opportunity for PR and buzz\n\n**Warning:** What excites early adopters may not excite mainstream users.\n\n---\n\n#### 4. Indifferent Features\n\n**Characteristics:**\n- Users don\'t care either way\n- No impact on satisfaction\n- Waste of resources to build\n\n**Examples:**\n- Features that seemed good in brainstorming but users ignore\n- Over-engineered solutions\n- Features built for internal stakeholders, not users\n- "Nice to have" ideas with no real value\n\n**Strategy:**\n- Identify and don\'t build\n- Remove if already built\n- Validate assumptions before building\n\n**Detection:**\n- Low usage metrics\n- No user requests\n- A/B tests show no difference\n- Feedback is neutral\n\n---\n\n#### 5. Reverse Features\n\n**Characteristics:**\n- Presence causes dissatisfaction\n- Users actively dislike these\n\n**Examples:**\n- Unwanted notifications\n- Forced account creation\n- Auto-play videos with sound\n- Intrusive ads\n- Overly complex interfaces\n\n**Strategy:**\n- Identify and remove\n- Often added for business reasons, not user value\n- Balance business needs with user experience\n\n---\n\n### Feature Evolution Over Time\n\n**Critical Pattern:** Features migrate through Kano categories over time.\n\n```\nExcitement \u2192 Performance \u2192 Basic \u2192 Indifferent/Reverse\n```\n\n**Examples:**\n\n1. **Smartphone Cameras**\n   - Excitement (2000s): Having a camera on phone\n   - Performance (2010s): Camera quality (megapixels, low-light)\n   - Basic (2020s): All phones must have good cameras\n   - Future: May become indifferent as AR/other tech dominates\n\n2. **Free Shipping**\n   - Excitement (late 1990s): Amazon offers free shipping\n   - Performance (2000s): Shipping speed matters\n   - Basic (2010s): Expected by e-commerce shoppers\n   - Today: Must have to compete\n\n3. **Touch Screens**\n   - Excitement (2007): iPhone launches\n   - Performance (2010s): Responsiveness, accuracy\n   - Basic (2020s): All smartphones have them\n   - Today: Expected standard\n\n**Implications:**\n- Yesterday\'s delighters are today\'s basics\n- Must continuously innovate\n- Don\'t rely on Excitement features long-term\n- Monitor feature category changes\n\n---\n\n### Conducting Kano Analysis\n\n#### Step 1: Identify Features to Evaluate\n- List potential features\n- Include existing and proposed features\n- Cover range of feature types\n\n#### Step 2: Create Survey\nFor each feature, ask two questions:\n\n**Functional Question:**\n"How would you feel if this feature WAS present?"\n\n1. I like it\n2. I expect it\n3. I\'m neutral\n4. I can tolerate it\n5. I dislike it\n\n**Dysfunctional Question:**\n"How would you feel if this feature WAS NOT present?"\n\n1. I like it\n2. I expect it\n3. I\'m neutral\n4. I can tolerate it\n5. I dislike it\n\n#### Step 3: Interpret Responses\n\nUse the Kano Evaluation Table:\n\n|  | **Functional: Like** | **Expect** | **Neutral** | **Tolerate** | **Dislike** |\n|---|---|---|---|---|---|\n| **Dysfunctional: Like** | Q | E | E | E | P |\n| **Expect** | R | I | I | I | B |\n| **Neutral** | R | I | I | I | B |\n| **Tolerate** | R | I | I | I | B |\n| **Dislike** | R | R | R | R | Q |\n\n**Key:**\n- **E** = Excitement\n- **P** = Performance\n- **B** = Basic\n- **I** = Indifferent\n- **R** = Reverse\n- **Q** = Questionable (contradictory response)\n\n#### Step 4: Aggregate Results\n- Tally responses for each feature\n- Assign to category with most responses\n- Look for patterns across segments\n\n#### Step 5: Apply to Roadmap\n- **Basics:** Must deliver, optimize efficiency\n- **Performance:** Competitive battleground, invest strategically\n- **Excitement:** Differentiation opportunity, innovate\n- **Indifferent:** Don\'t build\n- **Reverse:** Remove if present\n\n---\n\n### Practical Application Example\n\n**Product:** Project Management Software\n\n**Survey Results for "AI Auto-scheduling":**\n- Excitement: 45%\n- Performance: 30%\n- Indifferent: 20%\n- Reverse: 5%\n\n**Classification:** Excitement feature (plurality)\n\n**Strategy:**\n- Invest in this as differentiator\n- Highlight in marketing\n- Make it polished and impressive\n- Monitor as it may become Performance feature\n\n---\n\n**Survey Results for "Task Creation":**\n- Basic: 85%\n- Performance: 10%\n- Excitement: 5%\n\n**Classification:** Basic feature\n\n**Strategy:**\n- Must have for product viability\n- Deliver reliably\n- Don\'t over-invest in innovation here\n- Focus resources elsewhere\n\n---\n\n## Value vs. Effort Matrix\n\n### Overview\nSimple 2x2 matrix plotting features by Value (to user/business) vs. Effort (to implement).\n\n**Best For:**\n- Quick prioritization\n- Visual stakeholder communication\n- Identifying quick wins\n- Portfolio balancing\n\n### The Matrix\n\n```\n   High Value\n        |\n    2   |   1\n  Quick |  Big\n   Wins |  Bets\n  ------+------\n    4   |   3\n   Fill |  Time\n   Ins |  Sinks\n        |\n   Low Value \u2190 \u2192 High Effort\n```\n\n**Quadrant 1: Big Bets (High Value, High Effort)**\n- Strategic initiatives\n- Major features\n- Long-term investments\n- Require executive buy-in\n- Careful planning needed\n\n**Quadrant 2: Quick Wins (High Value, Low Effort)**\n- Highest priority\n- Immediate ROI\n- Fast delivery\n- Build momentum\n- Show progress\n\n**Quadrant 3: Time Sinks (Low Value, High Effort)**\n- Avoid these\n- Reject or defer\n- Question if truly needed\n- May be pet projects\n\n**Quadrant 4: Fill Ins (Low Value, Low Effort)**\n- Lowest priority\n- Do if spare capacity\n- May never do\n- Consider automation\n\n### Application Process\n\n1. **List Features**\n   - All candidate features\n   - Keep granularity consistent\n\n2. **Score Value (1-10)**\n   - User value\n   - Business value\n   - Strategic alignment\n   - Get cross-functional input\n\n3. **Score Effort (1-10)**\n   - Development time\n   - Design time\n   - Testing requirements\n   - Get engineering input\n\n4. **Plot on Matrix**\n   - Create visual grid\n   - Use tool or whiteboard\n   - Place each feature\n\n5. **Prioritize**\n   - Quick Wins first\n   - Then Big Bets (selectively)\n   - Fill Ins as capacity allows\n   - Avoid Time Sinks\n\n---\n\n## Framework Comparison\n\n| Framework | Best For | Complexity | Time Required | Data Needed |\n|-----------|----------|------------|---------------|-------------|\n| MoSCoW | MVP scoping, fixed timelines | Low | Low | Minimal |\n| RICE | Many features, data-driven orgs | Medium | Medium | Analytics data |\n| Kano | Understanding satisfaction drivers | High | High | User research |\n| Value vs. Effort | Quick decisions, visual comm | Low | Low | Estimates |\n| Weighted Scoring | Multi-criteria, complex decisions | Medium | Medium | Various |\n\n---\n\n## Choosing the Right Framework\n\n**Use MoSCoW when:**\n- You have fixed timeline/budget\n- Need stakeholder alignment on scope\n- Defining MVP\n- Simple yes/no decisions needed\n\n**Use RICE when:**\n- You have analytics and usage data\n- Comparing 10+ features\n- Need objective, defensible prioritization\n- Working with distributed teams\n\n**Use Kano when:**\n- Planning long-term roadmap\n- Understanding competitive positioning\n- Balancing innovation with fundamentals\n- Have resources for user research\n\n**Use Value vs. Effort when:**\n- Need quick, visual prioritization\n- Communicating with executives\n- Identifying quick wins\n- Balancing portfolio\n\n**Use Multiple Frameworks:**\n- MoSCoW for initial filtering\n- RICE to rank within categories\n- Kano to understand feature types\n- Value vs. Effort for visual communication\n\n---\n\n## Additional Resources\n\n- **RICE Calculator:** Use `../scripts/prioritize.py`\n- **PRD Template:** See `../templates/prd.template.md`\n- **Main Skill Guide:** See `../SKILL.md`\n- **Detailed Reference:** See `../REFERENCE.md`\n\n---\n\n**Last Updated:** 2025-12-09\n'
      },
      {
        "path": "scripts/prioritize.py",
        "content": `#!/usr/bin/env python3
"""
RICE Score Calculator for Feature Prioritization

RICE = (Reach \xD7 Impact \xD7 Confidence) / Effort

Usage:
    python prioritize.py                    # Interactive mode
    python prioritize.py --batch features.csv  # Batch mode from CSV
    python prioritize.py --help             # Show help

Interactive mode will prompt for:
- Reach: Number of users affected per time period
- Impact: Value per user (0.25, 0.5, 1, 2, 3)
- Confidence: Certainty percentage (0-100%)
- Effort: Person-months of work

Batch mode expects CSV with columns: name,reach,impact,confidence,effort
"""

import sys
import csv
import argparse
from typing import List, Dict, Tuple


class Feature:
    """Represents a feature with RICE scoring components."""

    def __init__(self, name: str, reach: float, impact: float, confidence: float, effort: float):
        self.name = name
        self.reach = reach
        self.impact = impact
        self.confidence = confidence
        self.effort = effort
        self.rice_score = self.calculate_rice()

    def calculate_rice(self) -> float:
        """Calculate RICE score: (Reach \xD7 Impact \xD7 Confidence) / Effort"""
        if self.effort == 0:
            return 0
        return (self.reach * self.impact * (self.confidence / 100)) / self.effort

    def __repr__(self) -> str:
        return f"Feature(name='{self.name}', rice={self.rice_score:.2f})"


def validate_impact(value: float) -> bool:
    """Validate impact is one of the allowed values."""
    allowed = [0.25, 0.5, 1, 2, 3]
    return value in allowed


def validate_confidence(value: float) -> bool:
    """Validate confidence is between 0 and 100."""
    return 0 <= value <= 100


def validate_positive(value: float) -> bool:
    """Validate value is positive."""
    return value > 0


def get_float_input(prompt: str, validator=None, error_msg: str = "Invalid input") -> float:
    """Get validated float input from user."""
    while True:
        try:
            value = float(input(prompt))
            if validator is None or validator(value):
                return value
            print(f"Error: {error_msg}")
        except ValueError:
            print("Error: Please enter a valid number")
        except KeyboardInterrupt:
            print("\\n\\nOperation cancelled by user")
            sys.exit(0)


def get_string_input(prompt: str) -> str:
    """Get string input from user."""
    try:
        value = input(prompt).strip()
        if not value:
            print("Error: Input cannot be empty")
            return get_string_input(prompt)
        return value
    except KeyboardInterrupt:
        print("\\n\\nOperation cancelled by user")
        sys.exit(0)


def interactive_mode() -> List[Feature]:
    """Run interactive mode to collect feature data."""
    print("=" * 70)
    print("RICE Score Calculator - Interactive Mode")
    print("=" * 70)
    print("\\nRICE = (Reach \xD7 Impact \xD7 Confidence) / Effort\\n")
    print("Impact Scale:")
    print("  0.25 = Minimal impact")
    print("  0.5  = Low impact")
    print("  1    = Medium impact")
    print("  2    = High impact")
    print("  3    = Massive impact\\n")
    print("Enter features one at a time. Type 'done' when finished.\\n")

    features = []
    feature_num = 1

    while True:
        print(f"\\n--- Feature {feature_num} ---")

        name = input("Feature name (or 'done' to finish): ").strip()
        if name.lower() == 'done':
            if features:
                break
            print("Please enter at least one feature")
            continue

        reach = get_float_input(
            "Reach (users affected per time period): ",
            validate_positive,
            "Reach must be greater than 0"
        )

        impact = get_float_input(
            "Impact (0.25, 0.5, 1, 2, or 3): ",
            validate_impact,
            "Impact must be 0.25, 0.5, 1, 2, or 3"
        )

        confidence = get_float_input(
            "Confidence (0-100%): ",
            validate_confidence,
            "Confidence must be between 0 and 100"
        )

        effort = get_float_input(
            "Effort (person-months): ",
            validate_positive,
            "Effort must be greater than 0"
        )

        feature = Feature(name, reach, impact, confidence, effort)
        features.append(feature)

        print(f"\\n\u2713 Added: {name} (RICE Score: {feature.rice_score:.2f})")
        feature_num += 1

    return features


def batch_mode(csv_file: str) -> List[Feature]:
    """Load features from CSV file."""
    features = []

    try:
        with open(csv_file, 'r') as f:
            reader = csv.DictReader(f)
            required_columns = {'name', 'reach', 'impact', 'confidence', 'effort'}

            if not required_columns.issubset(set(reader.fieldnames)):
                print(f"Error: CSV must contain columns: {', '.join(required_columns)}")
                sys.exit(1)

            for row_num, row in enumerate(reader, start=2):
                try:
                    name = row['name'].strip()
                    reach = float(row['reach'])
                    impact = float(row['impact'])
                    confidence = float(row['confidence'])
                    effort = float(row['effort'])

                    # Validate
                    if not validate_positive(reach):
                        print(f"Warning: Row {row_num} - Reach must be positive, skipping")
                        continue
                    if not validate_impact(impact):
                        print(f"Warning: Row {row_num} - Impact must be 0.25, 0.5, 1, 2, or 3, skipping")
                        continue
                    if not validate_confidence(confidence):
                        print(f"Warning: Row {row_num} - Confidence must be 0-100, skipping")
                        continue
                    if not validate_positive(effort):
                        print(f"Warning: Row {row_num} - Effort must be positive, skipping")
                        continue

                    feature = Feature(name, reach, impact, confidence, effort)
                    features.append(feature)

                except (ValueError, KeyError) as e:
                    print(f"Warning: Row {row_num} - Invalid data, skipping ({e})")
                    continue

        if not features:
            print("Error: No valid features found in CSV")
            sys.exit(1)

    except FileNotFoundError:
        print(f"Error: File '{csv_file}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        sys.exit(1)

    return features


def display_results(features: List[Feature]):
    """Display prioritized features in a formatted table."""
    # Sort by RICE score descending
    sorted_features = sorted(features, key=lambda f: f.rice_score, reverse=True)

    print("\\n" + "=" * 100)
    print("PRIORITIZATION RESULTS (Ranked by RICE Score)")
    print("=" * 100)
    print(f"\\n{'Rank':<6} {'Feature':<30} {'Reach':<10} {'Impact':<10} {'Confidence':<12} {'Effort':<10} {'RICE Score':<12}")
    print("-" * 100)

    for rank, feature in enumerate(sorted_features, start=1):
        print(f"{rank:<6} {feature.name:<30} {feature.reach:<10.0f} {feature.impact:<10.2f} "
              f"{feature.confidence:<12.0f}% {feature.effort:<10.2f} {feature.rice_score:<12.2f}")

    print("\\n" + "=" * 100)
    print("INTERPRETATION:")
    print("  - Higher RICE scores indicate higher priority")
    print("  - Scores are relative; compare features against each other")
    print("  - Consider strategic alignment and dependencies alongside scores")
    print("=" * 100 + "\\n")


def export_results(features: List[Feature], output_file: str):
    """Export results to CSV file."""
    sorted_features = sorted(features, key=lambda f: f.rice_score, reverse=True)

    try:
        with open(output_file, 'w', newline='') as f:
            fieldnames = ['rank', 'name', 'reach', 'impact', 'confidence', 'effort', 'rice_score']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for rank, feature in enumerate(sorted_features, start=1):
                writer.writerow({
                    'rank': rank,
                    'name': feature.name,
                    'reach': feature.reach,
                    'impact': feature.impact,
                    'confidence': feature.confidence,
                    'effort': feature.effort,
                    'rice_score': round(feature.rice_score, 2)
                })

        print(f"\\n\u2713 Results exported to: {output_file}")
    except Exception as e:
        print(f"Error exporting results: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='RICE Score Calculator for Feature Prioritization',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python prioritize.py                      # Interactive mode
  python prioritize.py --batch features.csv # Batch mode
  python prioritize.py -b features.csv -o results.csv  # Batch with export

CSV Format (for batch mode):
  name,reach,impact,confidence,effort
  Feature A,1000,2,80,3
  Feature B,500,3,100,1.5

Impact Values:
  0.25 = Minimal
  0.5  = Low
  1    = Medium
  2    = High
  3    = Massive
        """
    )

    parser.add_argument(
        '-b', '--batch',
        metavar='FILE',
        help='Load features from CSV file (batch mode)'
    )

    parser.add_argument(
        '-o', '--output',
        metavar='FILE',
        help='Export results to CSV file'
    )

    args = parser.parse_args()

    # Determine mode and collect features
    if args.batch:
        features = batch_mode(args.batch)
    else:
        features = interactive_mode()

    # Display results
    display_results(features)

    # Export if requested
    if args.output:
        export_results(features, args.output)
    elif args.batch:
        # Auto-export in batch mode
        output_file = args.batch.rsplit('.', 1)[0] + '_results.csv'
        export_results(features, output_file)


if __name__ == '__main__':
    main()
`
      },
      {
        "path": "scripts/validate-prd.sh",
        "content": '#!/bin/bash\n#\n# PRD Validation Script\n#\n# Validates that a Product Requirements Document contains all required sections\n# and meets quality standards.\n#\n# Usage:\n#   ./validate-prd.sh <prd-file>\n#   ./validate-prd.sh --help\n#\n\nset -euo pipefail\n\n# Colors for output\nRED=\'\\033[0;31m\'\nGREEN=\'\\033[0;32m\'\nYELLOW=\'\\033[1;33m\'\nBLUE=\'\\033[0;34m\'\nNC=\'\\033[0m\' # No Color\n\n# Counters\nPASS=0\nFAIL=0\nWARN=0\n\n# Functions\nshow_help() {\n    cat << EOF\nPRD Validation Script\n\nValidates that a Product Requirements Document contains all required sections\nand meets quality standards.\n\nUsage:\n    $0 <prd-file>\n    $0 --help\n\nRequired Sections:\n    - Executive Summary\n    - Project Overview\n    - Functional Requirements\n    - Non-Functional Requirements\n    - Epics\n    - User Stories (optional but recommended)\n    - Success Metrics\n    - Assumptions and Dependencies\n    - Out of Scope\n\nQuality Checks:\n    - Requirements have unique IDs (FR-XXX, NFR-XXX)\n    - Requirements have priorities (MUST/SHOULD/COULD/WONT)\n    - Requirements have acceptance criteria\n    - Epics are defined with user stories\n    - Success metrics are measurable\n\nExit Codes:\n    0 - All validations passed\n    1 - One or more validations failed\n    2 - Invalid usage or file not found\n\nExamples:\n    $0 docs/prd-myapp-2025-12-09.md\n    $0 ../requirements/product-requirements.md\nEOF\n}\n\nprint_header() {\n    echo -e "\\n${BLUE}================================${NC}"\n    echo -e "${BLUE}$1${NC}"\n    echo -e "${BLUE}================================${NC}\\n"\n}\n\nprint_pass() {\n    echo -e "${GREEN}\u2713${NC} $1"\n    ((PASS++))\n}\n\nprint_fail() {\n    echo -e "${RED}\u2717${NC} $1"\n    ((FAIL++))\n}\n\nprint_warn() {\n    echo -e "${YELLOW}\u26A0${NC} $1"\n    ((WARN++))\n}\n\ncheck_section() {\n    local file=$1\n    local section=$2\n    local pattern=$3\n\n    if grep -q "$pattern" "$file"; then\n        print_pass "Section present: $section"\n        return 0\n    else\n        print_fail "Section missing: $section"\n        return 1\n    fi\n}\n\ncheck_requirements_format() {\n    local file=$1\n    local req_type=$2\n    local pattern=$3\n\n    local count=$(grep -c "$pattern" "$file" || true)\n\n    if [ "$count" -gt 0 ]; then\n        print_pass "Found $count $req_type requirements with proper IDs"\n        return 0\n    else\n        print_fail "No $req_type requirements found with format $pattern"\n        return 1\n    fi\n}\n\ncheck_priorities() {\n    local file=$1\n\n    # Check for priority keywords\n    if grep -qiE "(MUST|SHOULD|COULD|WO?N\'?T)" "$file"; then\n        local must_count=$(grep -ciE "MUST" "$file" || true)\n        local should_count=$(grep -ciE "SHOULD" "$file" || true)\n        local could_count=$(grep -ciE "COULD" "$file" || true)\n\n        print_pass "Priorities assigned (MUST: $must_count, SHOULD: $should_count, COULD: $could_count)"\n        return 0\n    else\n        print_fail "No priority assignments found (MUST/SHOULD/COULD/WONT)"\n        return 1\n    fi\n}\n\ncheck_acceptance_criteria() {\n    local file=$1\n\n    local criteria_count=$(grep -ciE "(acceptance criteria|acceptance criterion)" "$file" || true)\n\n    if [ "$criteria_count" -gt 0 ]; then\n        print_pass "Found $criteria_count acceptance criteria sections"\n        return 0\n    else\n        print_fail "No acceptance criteria found"\n        return 1\n    fi\n}\n\ncheck_epics() {\n    local file=$1\n\n    if grep -qiE "(epic|Epic|EPIC)" "$file"; then\n        local epic_count=$(grep -ciE "^#{1,3} Epic" "$file" || true)\n        print_pass "Found epics in document"\n        return 0\n    else\n        print_fail "No epics found"\n        return 1\n    fi\n}\n\ncheck_metrics() {\n    local file=$1\n\n    if grep -qiE "(success metric|success criteria|measure|kpi|objective)" "$file"; then\n        print_pass "Success metrics defined"\n        return 0\n    else\n        print_warn "Success metrics not clearly defined"\n        return 1\n    fi\n}\n\n# Validate arguments\nif [ $# -eq 0 ]; then\n    echo -e "${RED}Error: No PRD file specified${NC}\\n"\n    show_help\n    exit 2\nfi\n\nif [ "$1" = "--help" ] || [ "$1" = "-h" ]; then\n    show_help\n    exit 0\nfi\n\nPRD_FILE=$1\n\n# Check file exists\nif [ ! -f "$PRD_FILE" ]; then\n    echo -e "${RED}Error: File not found: $PRD_FILE${NC}"\n    exit 2\nfi\n\n# Start validation\nprint_header "Validating PRD: $PRD_FILE"\n\necho "File size: $(wc -c < "$PRD_FILE") bytes"\necho "Line count: $(wc -l < "$PRD_FILE") lines"\necho ""\n\n# Required Sections\nprint_header "Required Sections"\n\ncheck_section "$PRD_FILE" "Executive Summary" "^#{1,3} Executive Summary"\ncheck_section "$PRD_FILE" "Project Overview" "^#{1,3} .*[Pp]roject.*[Oo]verview"\ncheck_section "$PRD_FILE" "Functional Requirements" "^#{1,3} Functional Requirements"\ncheck_section "$PRD_FILE" "Non-Functional Requirements" "^#{1,3} Non-Functional Requirements"\ncheck_section "$PRD_FILE" "Success Metrics" "^#{1,3} Success Metrics"\ncheck_section "$PRD_FILE" "Assumptions" "^#{1,3} Assumptions"\ncheck_section "$PRD_FILE" "Out of Scope" "^#{1,3} Out of Scope"\n\n# Requirements Format\nprint_header "Requirements Format"\n\ncheck_requirements_format "$PRD_FILE" "Functional" "FR-[0-9]"\ncheck_requirements_format "$PRD_FILE" "Non-Functional" "NFR-[0-9]"\n\n# Priority Assignments\nprint_header "Priority Assignments"\n\ncheck_priorities "$PRD_FILE"\n\n# Acceptance Criteria\nprint_header "Acceptance Criteria"\n\ncheck_acceptance_criteria "$PRD_FILE"\n\n# Epics and Stories\nprint_header "Epics and User Stories"\n\ncheck_epics "$PRD_FILE"\n\nif grep -qiE "(user story|as a .* I want|as an .* I want)" "$PRD_FILE"; then\n    print_pass "User stories found in document"\nelse\n    print_warn "No user stories found (recommended but not required)"\nfi\n\n# Success Metrics\nprint_header "Success Metrics and Traceability"\n\ncheck_metrics "$PRD_FILE"\n\n# Check for traceability matrix or requirements mapping\nif grep -qiE "(traceability|requirements matrix|requirements mapping)" "$PRD_FILE"; then\n    print_pass "Traceability section found"\nelse\n    print_warn "Traceability matrix not found (recommended for complex PRDs)"\nfi\n\n# Quality Checks\nprint_header "Quality Checks"\n\n# Check for vague terms\nvague_terms=("user-friendly" "intuitive" "easy" "simple" "fast" "good" "better" "improved")\nvague_found=0\nfor term in "${vague_terms[@]}"; do\n    if grep -qiE "\\b$term\\b" "$PRD_FILE"; then\n        ((vague_found++))\n    fi\ndone\n\nif [ $vague_found -gt 5 ]; then\n    print_warn "Document contains many vague terms ($vague_found instances). Consider using specific, measurable criteria."\nelse\n    print_pass "Minimal use of vague terms (good specificity)"\nfi\n\n# Check for "shall" statements (formal requirements style)\nshall_count=$(grep -ciE "\\bshall\\b" "$PRD_FILE" || true)\nif [ $shall_count -gt 0 ]; then\n    print_pass "Using formal requirements language (\'shall\' statements: $shall_count)"\nfi\n\n# Check document length\nline_count=$(wc -l < "$PRD_FILE")\nif [ $line_count -lt 50 ]; then\n    print_warn "Document is quite short ($line_count lines). Ensure all sections are complete."\nelif [ $line_count -gt 1000 ]; then\n    print_warn "Document is very long ($line_count lines). Consider splitting into multiple documents."\nelse\n    print_pass "Document length is reasonable ($line_count lines)"\nfi\n\n# Summary\nprint_header "Validation Summary"\n\ntotal=$((PASS + FAIL + WARN))\necho -e "${GREEN}Passed:${NC}  $PASS/$total"\necho -e "${RED}Failed:${NC}  $FAIL/$total"\necho -e "${YELLOW}Warnings:${NC} $WARN/$total"\necho ""\n\nif [ $FAIL -eq 0 ]; then\n    echo -e "${GREEN}\u2713 PRD validation passed!${NC}"\n    if [ $WARN -gt 0 ]; then\n        echo -e "${YELLOW}  (with $WARN warnings - review recommended)${NC}"\n    fi\n    exit 0\nelse\n    echo -e "${RED}\u2717 PRD validation failed with $FAIL errors${NC}"\n    echo "Please address the failed checks above."\n    exit 1\nfi\n'
      },
      {
        "path": "templates/prd.template.md",
        "content": "# Product Requirements Document (PRD)\n\n**Project Name:** {{PROJECT_NAME}}\n**Document Version:** {{VERSION}}\n**Date:** {{DATE}}\n**Author:** {{AUTHOR}}\n**Status:** {{STATUS}}\n\n---\n\n## Document Control\n\n| Version | Date | Author | Changes |\n|---------|------|--------|---------|\n| {{VERSION}} | {{DATE}} | {{AUTHOR}} | Initial draft |\n\n## Approvals\n\n| Role | Name | Signature | Date |\n|------|------|-----------|------|\n| Product Owner | | | |\n| Engineering Lead | | | |\n| Design Lead | | | |\n| Stakeholder | | | |\n\n---\n\n## Executive Summary\n\n**Problem Statement:**\n{{PROBLEM_STATEMENT}}\n\n**Proposed Solution:**\n{{SOLUTION_OVERVIEW}}\n\n**Business Value:**\n{{BUSINESS_VALUE}}\n\n**Success Metrics:**\n- {{SUCCESS_METRIC_1}}\n- {{SUCCESS_METRIC_2}}\n- {{SUCCESS_METRIC_3}}\n\n**Target Launch:** {{TARGET_DATE}}\n\n---\n\n## Table of Contents\n\n1. [Project Overview](#project-overview)\n2. [Goals and Objectives](#goals-and-objectives)\n3. [User Personas](#user-personas)\n4. [Functional Requirements](#functional-requirements)\n5. [Non-Functional Requirements](#non-functional-requirements)\n6. [Epics and User Stories](#epics-and-user-stories)\n7. [User Experience Requirements](#user-experience-requirements)\n8. [Success Metrics](#success-metrics)\n9. [Assumptions and Dependencies](#assumptions-and-dependencies)\n10. [Constraints](#constraints)\n11. [Out of Scope](#out-of-scope)\n12. [Release Planning](#release-planning)\n13. [Risks and Mitigations](#risks-and-mitigations)\n14. [Traceability Matrix](#traceability-matrix)\n15. [Appendix](#appendix)\n\n---\n\n## Project Overview\n\n### Background\n{{BACKGROUND}}\n\n### Current State\n{{CURRENT_STATE}}\n\n### Desired State\n{{DESIRED_STATE}}\n\n### Stakeholders\n| Stakeholder | Role | Interest | Influence |\n|-------------|------|----------|-----------|\n| {{STAKEHOLDER_1}} | {{ROLE_1}} | {{INTEREST_1}} | {{INFLUENCE_1}} |\n| {{STAKEHOLDER_2}} | {{ROLE_2}} | {{INTEREST_2}} | {{INFLUENCE_2}} |\n| {{STAKEHOLDER_3}} | {{ROLE_3}} | {{INTEREST_3}} | {{INFLUENCE_3}} |\n\n---\n\n## Goals and Objectives\n\n### Business Goals\n1. {{BUSINESS_GOAL_1}}\n2. {{BUSINESS_GOAL_2}}\n3. {{BUSINESS_GOAL_3}}\n\n### User Goals\n1. {{USER_GOAL_1}}\n2. {{USER_GOAL_2}}\n3. {{USER_GOAL_3}}\n\n### Success Criteria\n- {{SUCCESS_CRITERION_1}}\n- {{SUCCESS_CRITERION_2}}\n- {{SUCCESS_CRITERION_3}}\n\n---\n\n## User Personas\n\n### Primary Persona: {{PERSONA_1_NAME}}\n**Demographics:**\n- {{DEMOGRAPHIC_INFO}}\n\n**Goals:**\n- {{PERSONA_GOAL_1}}\n- {{PERSONA_GOAL_2}}\n\n**Pain Points:**\n- {{PAIN_POINT_1}}\n- {{PAIN_POINT_2}}\n\n**Behaviors:**\n- {{BEHAVIOR_1}}\n- {{BEHAVIOR_2}}\n\n### Secondary Persona: {{PERSONA_2_NAME}}\n**Demographics:**\n- {{DEMOGRAPHIC_INFO}}\n\n**Goals:**\n- {{PERSONA_GOAL_1}}\n- {{PERSONA_GOAL_2}}\n\n**Pain Points:**\n- {{PAIN_POINT_1}}\n- {{PAIN_POINT_2}}\n\n---\n\n## Functional Requirements\n\n### FR-001: {{FR_1_TITLE}} [MUST/SHOULD/COULD/WONT]\n\n**Description:**\n{{FR_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_1_AC_1}}\n- {{FR_1_AC_2}}\n- {{FR_1_AC_3}}\n\n**Priority:** {{FR_1_PRIORITY}}\n**Related Epic:** {{FR_1_EPIC}}\n\n---\n\n### FR-002: {{FR_2_TITLE}} [MUST/SHOULD/COULD/WONT]\n\n**Description:**\n{{FR_2_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_2_AC_1}}\n- {{FR_2_AC_2}}\n- {{FR_2_AC_3}}\n\n**Priority:** {{FR_2_PRIORITY}}\n**Related Epic:** {{FR_2_EPIC}}\n\n---\n\n### FR-003: {{FR_3_TITLE}} [MUST/SHOULD/COULD/WONT]\n\n**Description:**\n{{FR_3_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_3_AC_1}}\n- {{FR_3_AC_2}}\n- {{FR_3_AC_3}}\n\n**Priority:** {{FR_3_PRIORITY}}\n**Related Epic:** {{FR_3_EPIC}}\n\n---\n\n_Continue with additional functional requirements as needed..._\n\n---\n\n## Non-Functional Requirements\n\n### Performance Requirements\n\n#### NFR-001: {{NFR_PERF_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_PERF_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_PERF_1_AC_1}}\n- {{NFR_PERF_1_AC_2}}\n\n**Measurement Method:** {{NFR_PERF_1_MEASUREMENT}}\n\n---\n\n### Security Requirements\n\n#### NFR-002: {{NFR_SEC_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_SEC_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_SEC_1_AC_1}}\n- {{NFR_SEC_1_AC_2}}\n\n**Compliance:** {{NFR_SEC_1_COMPLIANCE}}\n\n---\n\n### Scalability Requirements\n\n#### NFR-003: {{NFR_SCALE_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_SCALE_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_SCALE_1_AC_1}}\n- {{NFR_SCALE_1_AC_2}}\n\n**Load Profile:** {{NFR_SCALE_1_LOAD}}\n\n---\n\n### Reliability Requirements\n\n#### NFR-004: {{NFR_REL_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_REL_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_REL_1_AC_1}}\n- {{NFR_REL_1_AC_2}}\n\n**Target SLA:** {{NFR_REL_1_SLA}}\n\n---\n\n### Usability Requirements\n\n#### NFR-005: {{NFR_USE_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_USE_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_USE_1_AC_1}}\n- {{NFR_USE_1_AC_2}}\n\n**Accessibility Standard:** {{NFR_USE_1_ACCESSIBILITY}}\n\n---\n\n### Maintainability Requirements\n\n#### NFR-006: {{NFR_MAINT_1_TITLE}} [MUST/SHOULD/COULD]\n\n**Description:**\n{{NFR_MAINT_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{NFR_MAINT_1_AC_1}}\n- {{NFR_MAINT_1_AC_2}}\n\n---\n\n## Epics and User Stories\n\n### Epic 1: {{EPIC_1_NAME}}\n\n**Epic ID:** EPIC-001\n**Business Value:** {{EPIC_1_VALUE}}\n**User Segments:** {{EPIC_1_SEGMENTS}}\n\n**Success Metrics:**\n- {{EPIC_1_METRIC_1}}\n- {{EPIC_1_METRIC_2}}\n\n**Related Requirements:** FR-001, FR-002, FR-003\n\n#### User Stories\n\n**STORY-001:** {{STORY_1_TITLE}}\n\n```\nAs a {{USER_TYPE}},\nI want {{CAPABILITY}},\nSo that {{BENEFIT}}.\n```\n\n**Acceptance Criteria:**\n- Given {{CONTEXT}}, when {{ACTION}}, then {{OUTCOME}}\n- Given {{CONTEXT}}, when {{ACTION}}, then {{OUTCOME}}\n\n**Priority:** {{STORY_1_PRIORITY}}\n**Estimate:** {{STORY_1_ESTIMATE}} story points\n\n---\n\n**STORY-002:** {{STORY_2_TITLE}}\n\n```\nAs a {{USER_TYPE}},\nI want {{CAPABILITY}},\nSo that {{BENEFIT}}.\n```\n\n**Acceptance Criteria:**\n- Given {{CONTEXT}}, when {{ACTION}}, then {{OUTCOME}}\n- Given {{CONTEXT}}, when {{ACTION}}, then {{OUTCOME}}\n\n**Priority:** {{STORY_2_PRIORITY}}\n**Estimate:** {{STORY_2_ESTIMATE}} story points\n\n---\n\n### Epic 2: {{EPIC_2_NAME}}\n\n**Epic ID:** EPIC-002\n**Business Value:** {{EPIC_2_VALUE}}\n**User Segments:** {{EPIC_2_SEGMENTS}}\n\n**Success Metrics:**\n- {{EPIC_2_METRIC_1}}\n- {{EPIC_2_METRIC_2}}\n\n**Related Requirements:** FR-004, FR-005, NFR-001\n\n#### User Stories\n\n_[Continue with user stories for Epic 2]_\n\n---\n\n## User Experience Requirements\n\n### User Flows\n\n#### Flow 1: {{FLOW_1_NAME}}\n1. {{FLOW_1_STEP_1}}\n2. {{FLOW_1_STEP_2}}\n3. {{FLOW_1_STEP_3}}\n4. {{FLOW_1_STEP_4}}\n\n**Success Path:** {{FLOW_1_SUCCESS}}\n**Error Handling:** {{FLOW_1_ERRORS}}\n\n---\n\n### Interface Requirements\n\n#### UI-001: {{UI_REQ_1}}\n**Description:** {{UI_REQ_1_DESCRIPTION}}\n**Wireframe Reference:** {{UI_REQ_1_WIREFRAME}}\n\n#### UI-002: {{UI_REQ_2}}\n**Description:** {{UI_REQ_2_DESCRIPTION}}\n**Wireframe Reference:** {{UI_REQ_2_WIREFRAME}}\n\n---\n\n## Success Metrics\n\n### Key Performance Indicators (KPIs)\n\n| Metric | Baseline | Target | Measurement Method | Frequency |\n|--------|----------|--------|-------------------|-----------|\n| {{METRIC_1}} | {{BASELINE_1}} | {{TARGET_1}} | {{METHOD_1}} | {{FREQUENCY_1}} |\n| {{METRIC_2}} | {{BASELINE_2}} | {{TARGET_2}} | {{METHOD_2}} | {{FREQUENCY_2}} |\n| {{METRIC_3}} | {{BASELINE_3}} | {{TARGET_3}} | {{METHOD_3}} | {{FREQUENCY_3}} |\n\n### Business Metrics\n- {{BUSINESS_METRIC_1}}\n- {{BUSINESS_METRIC_2}}\n- {{BUSINESS_METRIC_3}}\n\n### User Metrics\n- {{USER_METRIC_1}}\n- {{USER_METRIC_2}}\n- {{USER_METRIC_3}}\n\n### Technical Metrics\n- {{TECH_METRIC_1}}\n- {{TECH_METRIC_2}}\n- {{TECH_METRIC_3}}\n\n---\n\n## Assumptions and Dependencies\n\n### Assumptions\n1. {{ASSUMPTION_1}}\n2. {{ASSUMPTION_2}}\n3. {{ASSUMPTION_3}}\n4. {{ASSUMPTION_4}}\n\n### Dependencies\n\n| Dependency | Type | Owner | Status | Risk Level | Mitigation |\n|------------|------|-------|--------|------------|------------|\n| {{DEP_1}} | {{TYPE_1}} | {{OWNER_1}} | {{STATUS_1}} | {{RISK_1}} | {{MITIGATION_1}} |\n| {{DEP_2}} | {{TYPE_2}} | {{OWNER_2}} | {{STATUS_2}} | {{RISK_2}} | {{MITIGATION_2}} |\n| {{DEP_3}} | {{TYPE_3}} | {{OWNER_3}} | {{STATUS_3}} | {{RISK_3}} | {{MITIGATION_3}} |\n\n---\n\n## Constraints\n\n### Technical Constraints\n- {{TECH_CONSTRAINT_1}}\n- {{TECH_CONSTRAINT_2}}\n- {{TECH_CONSTRAINT_3}}\n\n### Business Constraints\n- {{BUSINESS_CONSTRAINT_1}}\n- {{BUSINESS_CONSTRAINT_2}}\n- {{BUSINESS_CONSTRAINT_3}}\n\n### Resource Constraints\n- {{RESOURCE_CONSTRAINT_1}}\n- {{RESOURCE_CONSTRAINT_2}}\n- {{RESOURCE_CONSTRAINT_3}}\n\n### Timeline Constraints\n- {{TIMELINE_CONSTRAINT_1}}\n- {{TIMELINE_CONSTRAINT_2}}\n\n---\n\n## Out of Scope\n\n### Explicitly Excluded Features\n1. {{OUT_OF_SCOPE_1}} - {{REASON_1}}\n2. {{OUT_OF_SCOPE_2}} - {{REASON_2}}\n3. {{OUT_OF_SCOPE_3}} - {{REASON_3}}\n4. {{OUT_OF_SCOPE_4}} - {{REASON_4}}\n\n### Future Considerations\n- {{FUTURE_CONSIDERATION_1}}\n- {{FUTURE_CONSIDERATION_2}}\n- {{FUTURE_CONSIDERATION_3}}\n\n---\n\n## Release Planning\n\n### Phase 1: MVP ({{PHASE_1_DATE}})\n**Included Features:**\n- {{PHASE_1_FEATURE_1}}\n- {{PHASE_1_FEATURE_2}}\n- {{PHASE_1_FEATURE_3}}\n\n**Success Criteria:** {{PHASE_1_SUCCESS}}\n\n---\n\n### Phase 2: Enhancement ({{PHASE_2_DATE}})\n**Included Features:**\n- {{PHASE_2_FEATURE_1}}\n- {{PHASE_2_FEATURE_2}}\n- {{PHASE_2_FEATURE_3}}\n\n**Success Criteria:** {{PHASE_2_SUCCESS}}\n\n---\n\n### Phase 3: Optimization ({{PHASE_3_DATE}})\n**Included Features:**\n- {{PHASE_3_FEATURE_1}}\n- {{PHASE_3_FEATURE_2}}\n- {{PHASE_3_FEATURE_3}}\n\n**Success Criteria:** {{PHASE_3_SUCCESS}}\n\n---\n\n## Risks and Mitigations\n\n| Risk | Impact | Probability | Mitigation Strategy | Owner | Status |\n|------|--------|-------------|---------------------|-------|--------|\n| {{RISK_1}} | {{IMPACT_1}} | {{PROB_1}} | {{MITIGATION_STRATEGY_1}} | {{OWNER_1}} | {{STATUS_1}} |\n| {{RISK_2}} | {{IMPACT_2}} | {{PROB_2}} | {{MITIGATION_STRATEGY_2}} | {{OWNER_2}} | {{STATUS_2}} |\n| {{RISK_3}} | {{IMPACT_3}} | {{PROB_3}} | {{MITIGATION_STRATEGY_3}} | {{OWNER_3}} | {{STATUS_3}} |\n\n---\n\n## Traceability Matrix\n\n| Requirement ID | Business Goal | Epic | User Story | Test Case | Status |\n|----------------|---------------|------|------------|-----------|--------|\n| FR-001 | {{GOAL_1}} | EPIC-001 | STORY-001 | TC-001 | {{STATUS}} |\n| FR-002 | {{GOAL_1}} | EPIC-001 | STORY-002 | TC-002 | {{STATUS}} |\n| FR-003 | {{GOAL_2}} | EPIC-002 | STORY-003 | TC-003 | {{STATUS}} |\n| NFR-001 | {{GOAL_3}} | N/A | N/A | TC-015 | {{STATUS}} |\n\n---\n\n## Appendix\n\n### A. Glossary\n\n| Term | Definition |\n|------|------------|\n| {{TERM_1}} | {{DEFINITION_1}} |\n| {{TERM_2}} | {{DEFINITION_2}} |\n| {{TERM_3}} | {{DEFINITION_3}} |\n\n### B. References\n\n1. {{REFERENCE_1}}\n2. {{REFERENCE_2}}\n3. {{REFERENCE_3}}\n\n### C. Wireframes and Mockups\n\n_[Attach or link to wireframes and mockups]_\n\n### D. Technical Architecture\n\n_[Reference to architecture documents]_\n\n### E. Research and Data\n\n_[Links to user research, market analysis, competitive analysis]_\n\n---\n\n**Document End**\n\n---\n\n## Revision History\n\n| Version | Date | Author | Changes |\n|---------|------|--------|---------|\n| {{VERSION}} | {{DATE}} | {{AUTHOR}} | Initial draft |\n| | | | |\n| | | | |\n"
      },
      {
        "path": "templates/tech-spec.template.md",
        "content": "# Technical Specification\n\n**Project Name:** {{PROJECT_NAME}}\n**Version:** {{VERSION}}\n**Date:** {{DATE}}\n**Author:** {{AUTHOR}}\n**Status:** {{STATUS}}\n\n---\n\n## Overview\n\n### Problem Statement\n{{PROBLEM_STATEMENT}}\n\n### Proposed Solution\n{{SOLUTION_OVERVIEW}}\n\n### Goals\n- {{GOAL_1}}\n- {{GOAL_2}}\n- {{GOAL_3}}\n\n---\n\n## Scope\n\n### In Scope\n- {{IN_SCOPE_1}}\n- {{IN_SCOPE_2}}\n- {{IN_SCOPE_3}}\n\n### Out of Scope\n- {{OUT_OF_SCOPE_1}}\n- {{OUT_OF_SCOPE_2}}\n- {{OUT_OF_SCOPE_3}}\n\n---\n\n## Requirements\n\n### Functional Requirements\n\n#### FR-001: {{FR_1_TITLE}} [MUST/SHOULD/COULD]\n{{FR_1_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_1_AC_1}}\n- {{FR_1_AC_2}}\n\n---\n\n#### FR-002: {{FR_2_TITLE}} [MUST/SHOULD/COULD]\n{{FR_2_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_2_AC_1}}\n- {{FR_2_AC_2}}\n\n---\n\n#### FR-003: {{FR_3_TITLE}} [MUST/SHOULD/COULD]\n{{FR_3_DESCRIPTION}}\n\n**Acceptance Criteria:**\n- {{FR_3_AC_1}}\n- {{FR_3_AC_2}}\n\n---\n\n### Non-Functional Requirements\n\n#### NFR-001: Performance [MUST/SHOULD]\n{{NFR_PERF_DESCRIPTION}}\n\n**Target:** {{NFR_PERF_TARGET}}\n\n---\n\n#### NFR-002: Security [MUST/SHOULD]\n{{NFR_SEC_DESCRIPTION}}\n\n**Requirements:**\n- {{NFR_SEC_REQ_1}}\n- {{NFR_SEC_REQ_2}}\n\n---\n\n#### NFR-003: Scalability [MUST/SHOULD]\n{{NFR_SCALE_DESCRIPTION}}\n\n**Target Load:** {{NFR_SCALE_TARGET}}\n\n---\n\n## Technical Approach\n\n### Architecture Overview\n{{ARCHITECTURE_OVERVIEW}}\n\n### Key Technologies\n- {{TECH_1}}: {{TECH_1_PURPOSE}}\n- {{TECH_2}}: {{TECH_2_PURPOSE}}\n- {{TECH_3}}: {{TECH_3_PURPOSE}}\n\n### Components\n\n#### Component 1: {{COMPONENT_1_NAME}}\n**Purpose:** {{COMPONENT_1_PURPOSE}}\n\n**Responsibilities:**\n- {{COMPONENT_1_RESP_1}}\n- {{COMPONENT_1_RESP_2}}\n\n**Interfaces:**\n- {{COMPONENT_1_INTERFACE_1}}\n- {{COMPONENT_1_INTERFACE_2}}\n\n---\n\n#### Component 2: {{COMPONENT_2_NAME}}\n**Purpose:** {{COMPONENT_2_PURPOSE}}\n\n**Responsibilities:**\n- {{COMPONENT_2_RESP_1}}\n- {{COMPONENT_2_RESP_2}}\n\n**Interfaces:**\n- {{COMPONENT_2_INTERFACE_1}}\n- {{COMPONENT_2_INTERFACE_2}}\n\n---\n\n### Data Model\n\n#### Entity 1: {{ENTITY_1_NAME}}\n```\n{{ENTITY_1_SCHEMA}}\n```\n\n#### Entity 2: {{ENTITY_2_NAME}}\n```\n{{ENTITY_2_SCHEMA}}\n```\n\n### API Design\n\n#### Endpoint 1: {{ENDPOINT_1}}\n**Method:** {{METHOD_1}}\n**Purpose:** {{PURPOSE_1}}\n\n**Request:**\n```json\n{{REQUEST_1_EXAMPLE}}\n```\n\n**Response:**\n```json\n{{RESPONSE_1_EXAMPLE}}\n```\n\n---\n\n#### Endpoint 2: {{ENDPOINT_2}}\n**Method:** {{METHOD_2}}\n**Purpose:** {{PURPOSE_2}}\n\n**Request:**\n```json\n{{REQUEST_2_EXAMPLE}}\n```\n\n**Response:**\n```json\n{{RESPONSE_2_EXAMPLE}}\n```\n\n---\n\n## Implementation Considerations\n\n### Design Patterns\n- {{PATTERN_1}}: {{PATTERN_1_RATIONALE}}\n- {{PATTERN_2}}: {{PATTERN_2_RATIONALE}}\n\n### Error Handling\n{{ERROR_HANDLING_APPROACH}}\n\n### Logging and Monitoring\n{{LOGGING_APPROACH}}\n\n**Key Metrics to Track:**\n- {{METRIC_1}}\n- {{METRIC_2}}\n- {{METRIC_3}}\n\n### Configuration Management\n{{CONFIG_APPROACH}}\n\n---\n\n## Testing Strategy\n\n### Unit Testing\n**Coverage Target:** {{UNIT_TEST_COVERAGE}}%\n\n**Focus Areas:**\n- {{UNIT_TEST_AREA_1}}\n- {{UNIT_TEST_AREA_2}}\n\n### Integration Testing\n**Scenarios:**\n1. {{INTEGRATION_SCENARIO_1}}\n2. {{INTEGRATION_SCENARIO_2}}\n3. {{INTEGRATION_SCENARIO_3}}\n\n### Performance Testing\n**Load Profile:** {{LOAD_PROFILE}}\n\n**Success Criteria:**\n- {{PERF_CRITERION_1}}\n- {{PERF_CRITERION_2}}\n\n### Security Testing\n**Tests Required:**\n- {{SECURITY_TEST_1}}\n- {{SECURITY_TEST_2}}\n- {{SECURITY_TEST_3}}\n\n---\n\n## Deployment\n\n### Deployment Strategy\n{{DEPLOYMENT_STRATEGY}}\n\n### Environment Requirements\n- **Development:** {{DEV_REQUIREMENTS}}\n- **Staging:** {{STAGING_REQUIREMENTS}}\n- **Production:** {{PROD_REQUIREMENTS}}\n\n### Rollout Plan\n1. {{ROLLOUT_STEP_1}}\n2. {{ROLLOUT_STEP_2}}\n3. {{ROLLOUT_STEP_3}}\n\n### Rollback Procedure\n{{ROLLBACK_PROCEDURE}}\n\n---\n\n## Dependencies\n\n### External Dependencies\n| Dependency | Version | Purpose | Risk |\n|------------|---------|---------|------|\n| {{DEP_1}} | {{VERSION_1}} | {{PURPOSE_1}} | {{RISK_1}} |\n| {{DEP_2}} | {{VERSION_2}} | {{PURPOSE_2}} | {{RISK_2}} |\n\n### Internal Dependencies\n- {{INTERNAL_DEP_1}}\n- {{INTERNAL_DEP_2}}\n\n---\n\n## Assumptions and Constraints\n\n### Assumptions\n1. {{ASSUMPTION_1}}\n2. {{ASSUMPTION_2}}\n3. {{ASSUMPTION_3}}\n\n### Constraints\n1. {{CONSTRAINT_1}}\n2. {{CONSTRAINT_2}}\n3. {{CONSTRAINT_3}}\n\n---\n\n## Timeline\n\n### Milestones\n| Milestone | Target Date | Deliverables |\n|-----------|-------------|--------------|\n| {{MILESTONE_1}} | {{DATE_1}} | {{DELIVERABLE_1}} |\n| {{MILESTONE_2}} | {{DATE_2}} | {{DELIVERABLE_2}} |\n| {{MILESTONE_3}} | {{DATE_3}} | {{DELIVERABLE_3}} |\n\n### Tasks Breakdown\n1. **{{TASK_1}}** - {{TASK_1_ESTIMATE}}\n2. **{{TASK_2}}** - {{TASK_2_ESTIMATE}}\n3. **{{TASK_3}}** - {{TASK_3_ESTIMATE}}\n4. **{{TASK_4}}** - {{TASK_4_ESTIMATE}}\n\n**Total Estimated Effort:** {{TOTAL_ESTIMATE}}\n\n---\n\n## Risks and Mitigations\n\n| Risk | Impact | Probability | Mitigation |\n|------|--------|-------------|------------|\n| {{RISK_1}} | {{IMPACT_1}} | {{PROB_1}} | {{MITIGATION_1}} |\n| {{RISK_2}} | {{IMPACT_2}} | {{PROB_2}} | {{MITIGATION_2}} |\n| {{RISK_3}} | {{IMPACT_3}} | {{PROB_3}} | {{MITIGATION_3}} |\n\n---\n\n## Success Criteria\n\n- [ ] {{SUCCESS_CRITERION_1}}\n- [ ] {{SUCCESS_CRITERION_2}}\n- [ ] {{SUCCESS_CRITERION_3}}\n- [ ] All functional requirements implemented\n- [ ] All non-functional requirements met\n- [ ] All tests passing\n- [ ] Documentation complete\n- [ ] Code reviewed and approved\n\n---\n\n## Appendix\n\n### Glossary\n| Term | Definition |\n|------|------------|\n| {{TERM_1}} | {{DEFINITION_1}} |\n| {{TERM_2}} | {{DEFINITION_2}} |\n\n### References\n1. {{REFERENCE_1}}\n2. {{REFERENCE_2}}\n3. {{REFERENCE_3}}\n\n### Diagrams\n_[Attach architecture diagrams, flow charts, sequence diagrams]_\n\n---\n\n**Document End**\n"
      }
    ]
  },
  {
    "key": "product-designer",
    "name": "product-designer",
    "description": "Expert product design covering UI/UX design, design systems, prototyping, user research, and design thinking. Use when creating user journey maps, building wireframes, defining design tokens and component systems, planning usability tests, or establishing design principles for a product.",
    "sourceType": "skills.sh",
    "sourceUrl": "https://skills.sh/borghei/claude-skills/product-designer",
    "resolvedSourceUrl": "https://github.com/borghei/claude-skills/tree/ed6df61bd3132aa2513bf7c2b7716651e92feddb/product-team/product-designer",
    "resolvedCommit": "ed6df61bd3132aa2513bf7c2b7716651e92feddb",
    "sourcePath": "product-team/product-designer",
    "files": [
      {
        "path": "SKILL.md",
        "content": '---\nname: product-designer\ndescription: >\n  Expert product design covering UI/UX design, design systems, prototyping, user\n  research, and design thinking. Use when creating user journey maps, building\n  wireframes, defining design tokens and component systems, planning usability\n  tests, or establishing design principles for a product.\nlicense: MIT + Commons Clause\nmetadata:\n  version: 1.0.0\n  author: borghei\n  category: product-design\n  domain: product-design\n  updated: 2026-03-31\n  tags: [design, ux, ui, figma, prototyping, design-systems]\n---\n# Product Designer\n\nThe agent operates as a senior product designer, delivering user-centered design solutions spanning UX research, UI design, design systems, prototyping, and usability testing.\n\n## Workflow\n\n1. **Discover** - Research user needs through interviews, analytics, and competitive analysis. Create user journey maps and identify pain points. Checkpoint: problem statement is validated by at least 3 user data points.\n2. **Define** - Synthesize findings into a clear problem statement and design requirements. Build information architecture (card sorting, site maps). Checkpoint: IA has been validated via card sort or tree test.\n3. **Develop** - Ideate solutions through sketching and wireframing. Build prototypes at appropriate fidelity. Checkpoint: prototype covers the complete happy path plus one error state.\n4. **Test** - Run usability tests with 5-8 participants. Measure task completion rate, time on task, error rate, and SUS score. Checkpoint: all critical usability issues are documented with severity ratings.\n5. **Deliver** - Refine designs based on test findings. Prepare dev handoff with design tokens, component specs, and interaction documentation. Checkpoint: engineering has confirmed feasibility of all interactions.\n\n## Design Sprint (5-Day Format)\n\n| Day | Activity | Output |\n|-----|----------|--------|\n| Monday | Map problem, interview experts | Challenge map, target area |\n| Tuesday | Sketch solutions, Crazy 8s | Solution sketches |\n| Wednesday | Decide, storyboard | Testable hypothesis |\n| Thursday | Build prototype | Realistic clickable prototype |\n| Friday | Test with 5 users | Validated/invalidated hypothesis |\n\n## User Journey Map Template\n\n```\nPERSONA: Sarah, Product Manager, goal: find analytics insights fast\n\nSTAGE:      AWARENESS    CONSIDER     PURCHASE     ONBOARD      RETAIN\nActions:    Searches     Compares     Signs up     Configures   Uses daily\nTouchpoint: Google       Website      Checkout     Setup wizard App\nEmotion:    Frustrated   Curious      Anxious      Hopeful      Satisfied\nPain point: Too many     Hard to      Complex      Slow setup   Missing\n            options      compare      pricing                   features\nOpportunity: SEO content  Comparison   Simplify     Quick-start  Feature\n                         tool         flow         template     education\n```\n\n## Information Architecture\n\n**Card Sorting Methods:**\n- Open sort: users create their own categories\n- Closed sort: users place items into predefined categories\n- Hybrid: combination approach\n\n**Example Site Map:**\n```\nHome\n+-- Products\n|   +-- Category A\n|   |   +-- Product 1\n|   |   +-- Product 2\n|   +-- Category B\n+-- About\n|   +-- Team\n|   +-- Careers\n+-- Resources\n|   +-- Blog\n|   +-- Help Center\n+-- Account\n    +-- Profile\n    +-- Settings\n```\n\n## UI Design Foundations\n\n### Design Principles\n\n1. **Hierarchy** - Visual weight guides attention via size, color, and contrast\n2. **Consistency** - Reuse patterns and components; maintain predictable interactions\n3. **Feedback** - Acknowledge every user action; show system status and loading states\n4. **Accessibility** - 4.5:1 color contrast minimum, focus indicators, screen reader support\n\n### Design Token System\n\n```css\n/* Color tokens */\n--color-primary-500: #3b82f6;\n--color-primary-600: #2563eb;\n--color-gray-50: #f9fafb;\n--color-gray-900: #111827;\n--color-success: #10b981;\n--color-warning: #f59e0b;\n--color-error: #ef4444;\n\n/* Typography scale */\n--text-sm: 0.875rem;   /* 14px */\n--text-base: 1rem;     /* 16px */\n--text-lg: 1.125rem;   /* 18px */\n--text-xl: 1.25rem;    /* 20px */\n--text-2xl: 1.5rem;    /* 24px */\n\n/* Spacing (4px base unit) */\n--space-1: 0.25rem;    /* 4px */\n--space-2: 0.5rem;     /* 8px */\n--space-4: 1rem;       /* 16px */\n--space-6: 1.5rem;     /* 24px */\n--space-8: 2rem;       /* 32px */\n```\n\n## Component Structure\n\n```\nButton/\n+-- Variants: Primary, Secondary, Tertiary, Destructive\n+-- Sizes: Small (32px), Medium (40px), Large (48px)\n+-- States: Default, Hover, Active, Focus, Disabled, Loading\n+-- Anatomy: [Leading Icon] Label [Trailing Icon]\n```\n\n### Component Design Tokens (JSON)\n\n```json\n{\n  "color": {\n    "primary": {"50": {"value": "#eff6ff"}, "500": {"value": "#3b82f6"}},\n    "semantic": {"success": {"value": "{color.green.500}"}, "error": {"value": "{color.red.500}"}}\n  },\n  "spacing": {"xs": {"value": "4px"}, "sm": {"value": "8px"}, "md": {"value": "16px"}},\n  "borderRadius": {"sm": {"value": "4px"}, "md": {"value": "8px"}, "full": {"value": "9999px"}}\n}\n```\n\n## Example: Usability Test Plan\n\n```markdown\n# Usability Test: New Checkout Flow\n\n## Objectives\n- Validate that users can complete purchase in < 3 minutes\n- Identify friction points in address and payment steps\n\n## Participants\n- 6 users (3 new, 3 returning)\n- Mix of desktop and mobile\n\n## Tasks\n1. "Find a laptop under $1,000 and add it to your cart" (browse + add)\n2. "Complete the purchase using a credit card" (checkout flow)\n3. "Change the shipping address on your order" (post-purchase edit)\n\n## Success Criteria\n| Task | Completion Target | Time Target |\n|------|-------------------|-------------|\n| Browse + Add | 100% | < 60s |\n| Checkout | 90%+ | < 180s |\n| Edit address | 80%+ | < 90s |\n\n## Metrics\n- Task completion rate\n- Time on task\n- Error count per task\n- System Usability Scale (SUS) score (target: 68+)\n```\n\n## Prototype Fidelity Guide\n\n| Fidelity | Purpose | Tools | Timeline |\n|----------|---------|-------|----------|\n| Paper | Quick exploration | Paper, pen | Minutes |\n| Low-fi | Flow validation | Figma, Sketch | Hours |\n| Mid-fi | Usability testing | Figma | Days |\n| High-fi | Dev handoff, final testing | Figma | Days-Weeks |\n\n## Scripts\n\n```bash\n# Design token generator\npython scripts/token_generator.py --source tokens.json --output css/\n\n# Accessibility checker\npython scripts/a11y_checker.py --url https://example.com\n\n# Asset exporter\npython scripts/asset_export.py --figma-file FILE_ID --format svg,png\n\n# Design QA report\npython scripts/design_qa.py --spec spec.figma --impl https://staging.example.com\n```\n\n## Reference Materials\n\n- `references/design_principles.md` - Core design principles\n- `references/component_library.md` - Component guidelines\n- `references/accessibility.md` - Accessibility checklist\n- `references/research_methods.md` - Research techniques\n\n---\n\n## Tool Reference\n\n### design_critique.py\n\nEvaluates a UI design against Nielsen\'s 10 Usability Heuristics and accessibility standards. Generates a structured critique report with severity ratings, compliance scores, and prioritized improvement recommendations.\n\n| Flag | Type | Default | Description |\n|------|------|---------|-------------|\n| `--checklist` | flag | - | Generate empty checklist for evaluation |\n| `--answers` | string | - | Path to completed checklist JSON file |\n| `--json` | flag | False | Output as JSON |\n\n```bash\npython scripts/design_critique.py --checklist\npython scripts/design_critique.py --checklist --json > checklist.json\npython scripts/design_critique.py --answers completed_checklist.json\npython scripts/design_critique.py --answers completed_checklist.json --json\n```\n\n### journey_mapper.py\n\nCreates structured user journey maps with emotion curves, pain point identification, and opportunity analysis. Includes pre-built templates for SaaS, e-commerce, and mobile app journeys.\n\n| Flag | Type | Default | Description |\n|------|------|---------|-------------|\n| `--template`, `-t` | choice | - | Pre-built template: `saas`, `ecommerce`, `mobile_app` |\n| `--stages`, `-s` | string | - | Path to custom stages JSON file |\n| `--json` | flag | False | Output as JSON |\n\n```bash\npython scripts/journey_mapper.py --template saas\npython scripts/journey_mapper.py --template ecommerce --json\npython scripts/journey_mapper.py --stages custom_journey.json\n```\n\n### usability_scorer.py\n\nCalculates System Usability Scale (SUS) scores and task performance metrics from usability test data. Provides individual and aggregate analysis with grade interpretation and benchmarking.\n\n| Flag | Type | Default | Description |\n|------|------|---------|-------------|\n| `action` | positional | - | "sample" to create sample CSV files |\n| `--sus-responses` | string | - | CSV with SUS responses (participant, q1-q10) |\n| `--task-data` | string | - | CSV with task data (participant, task, completed, time_seconds, errors) |\n| `--json` | flag | False | Output as JSON |\n\n```bash\npython scripts/usability_scorer.py sample\npython scripts/usability_scorer.py --sus-responses responses.csv\npython scripts/usability_scorer.py --task-data tasks.csv\npython scripts/usability_scorer.py --sus-responses responses.csv --task-data tasks.csv --json\n```\n\n---\n\n## Troubleshooting\n\n| Problem | Cause | Solution |\n|---------|-------|----------|\n| SUS score below 68 (benchmark) | Significant usability issues | Focus on critical severity findings from design_critique first |\n| Low task completion rate (<80%) | Task flow too complex or unclear | Simplify flow; add progressive disclosure; reduce steps |\n| Users cannot find features | Poor information architecture | Conduct card sorting; redesign navigation; add search |\n| High error rate on forms | Insufficient validation and guidance | Add inline validation, smart defaults, and contextual help |\n| Inconsistent design across screens | Missing or ignored design system | Audit with design_critique; enforce token usage |\n| Usability test participants are unrepresentative | Poor recruitment criteria | Screen for target persona match; mix new and returning users |\n| Journey map emotions are flat | Insufficient research data | Conduct deeper interviews; observe real usage sessions |\n\n---\n\n## Success Criteria\n\n| Criterion | Target | How to Measure |\n|-----------|--------|----------------|\n| SUS score | >68 (industry average), target >80 | usability_scorer aggregate score |\n| Task completion rate | >85% for core flows | usability_scorer task metrics |\n| Time on task | <2x expected duration | usability_scorer avg_time_seconds |\n| Design critique compliance | >80% checklist pass rate | design_critique compliance_score |\n| Accessibility compliance | WCAG AA on all screens | design_critique accessibility section |\n| Journey map coverage | All key personas mapped | Count of completed journey maps |\n| Usability test cadence | Test every sprint or release | Count of tests per quarter |\n\n---\n\n## Scope & Limitations\n\n**In scope:**\n- Heuristic evaluation and design critique\n- User journey mapping with emotion curves\n- Usability test scoring (SUS and task metrics)\n- Design sprint facilitation structure\n- Information architecture planning\n- Prototype fidelity guidance\n- Accessibility checkpoint evaluation\n\n**Out of scope:**\n- Automated visual regression testing (use Chromatic/Percy)\n- Real-time analytics dashboards (use Amplitude/Mixpanel)\n- Figma file manipulation or asset export (use Figma API)\n- Eye tracking or biometric analysis\n- A/B test implementation (see ab-test-setup skill)\n- Design token generation (see ui-design-system or design-system-lead skills)\n\n---\n\n## Integration Points\n\n| Tool / Platform | Integration Method | Use Case |\n|-----------------|-------------------|----------|\n| Figma | Journey map and critique findings as design specs | Translate research into design changes |\n| Maze / UserTesting | Export task data CSV for usability_scorer | Score test results from remote testing platforms |\n| Dovetail / Condens | Export interview themes for journey_mapper | Build journey maps from research repositories |\n| Jira / Linear | design_critique JSON priorities as tickets | Track usability improvements in sprint backlog |\n| Notion / Confluence | Human-readable output from all tools | Document research findings and design decisions |\n| Miro / FigJam | journey_mapper JSON output | Collaborative journey map workshops |\n'
      },
      {
        "path": "scripts/design_critique.py",
        "content": `#!/usr/bin/env python3
"""
Design Critique Generator

Evaluates a UI design against established heuristics (Nielsen's 10,
Gestalt principles, accessibility standards) and generates a structured
critique report with severity ratings and improvement suggestions.

Uses ONLY Python standard library.

Usage:
    python design_critique.py --checklist
    python design_critique.py --answers answers.json
    python design_critique.py --answers answers.json --json
"""

import argparse
import json
import sys
from typing import Dict, List


# Nielsen's 10 Usability Heuristics
NIELSEN_HEURISTICS = [
    {
        "id": "N1",
        "name": "Visibility of system status",
        "description": "The design keeps users informed about what is happening through appropriate feedback within reasonable time.",
        "checkpoints": [
            "Loading states are visible for operations >1 second",
            "Progress indicators shown for multi-step processes",
            "Success/error feedback appears after user actions",
            "Current location is clear in navigation",
        ],
    },
    {
        "id": "N2",
        "name": "Match between system and real world",
        "description": "The design uses language, concepts, and conventions familiar to the user.",
        "checkpoints": [
            "Labels use user language, not internal jargon",
            "Icons follow established conventions",
            "Information appears in natural and logical order",
            "Metaphors match real-world expectations",
        ],
    },
    {
        "id": "N3",
        "name": "User control and freedom",
        "description": "Users can easily undo, redo, or exit unwanted states.",
        "checkpoints": [
            "Undo is available for destructive actions",
            "Cancel/back options are clearly visible",
            "Users can exit flows without losing progress",
            "Confirmation dialogs for irreversible actions",
        ],
    },
    {
        "id": "N4",
        "name": "Consistency and standards",
        "description": "Users don't have to wonder whether different words, situations, or actions mean the same thing.",
        "checkpoints": [
            "UI elements behave the same way throughout",
            "Terminology is consistent across all pages",
            "Visual patterns (spacing, colors) are consistent",
            "Platform conventions are followed",
        ],
    },
    {
        "id": "N5",
        "name": "Error prevention",
        "description": "Good design prevents problems from occurring in the first place.",
        "checkpoints": [
            "Form validation occurs before submission",
            "Constraints prevent invalid inputs",
            "Destructive actions require confirmation",
            "Default values reduce user effort and errors",
        ],
    },
    {
        "id": "N6",
        "name": "Recognition rather than recall",
        "description": "Minimize the user's memory load by making elements, actions, and options visible.",
        "checkpoints": [
            "Options are visible rather than requiring memorization",
            "Help and instructions are easily accessible",
            "Recently used items are easily accessible",
            "Search and filter options are visible",
        ],
    },
    {
        "id": "N7",
        "name": "Flexibility and efficiency of use",
        "description": "Accelerators allow experienced users to speed up interaction.",
        "checkpoints": [
            "Keyboard shortcuts available for frequent actions",
            "Customizable interface elements",
            "Shortcuts or recent items for repeat tasks",
            "Batch operations for power users",
        ],
    },
    {
        "id": "N8",
        "name": "Aesthetic and minimalist design",
        "description": "Interfaces should not contain irrelevant or rarely needed information.",
        "checkpoints": [
            "Each screen focuses on one primary action",
            "Visual hierarchy guides attention to important elements",
            "Whitespace used effectively",
            "No unnecessary decorative elements that distract",
        ],
    },
    {
        "id": "N9",
        "name": "Help users recognize, diagnose, and recover from errors",
        "description": "Error messages should be expressed in plain language and suggest a solution.",
        "checkpoints": [
            "Error messages are in plain language (no codes)",
            "Error messages indicate what went wrong specifically",
            "Error messages suggest how to fix the issue",
            "Errors are visually prominent and close to the source",
        ],
    },
    {
        "id": "N10",
        "name": "Help and documentation",
        "description": "Help information should be easy to search, focused on the task, and not too large.",
        "checkpoints": [
            "Help is easily accessible from any screen",
            "Contextual help is provided where needed",
            "Onboarding guides new users through key features",
            "Documentation is searchable and task-focused",
        ],
    },
]

# Accessibility heuristics
A11Y_HEURISTICS = [
    {
        "id": "A1",
        "name": "Color contrast",
        "checkpoints": [
            "Text meets 4.5:1 contrast ratio (WCAG AA)",
            "Large text meets 3:1 contrast ratio",
            "Color is not the only way to convey information",
            "Focus indicators have sufficient contrast",
        ],
    },
    {
        "id": "A2",
        "name": "Keyboard navigation",
        "checkpoints": [
            "All interactive elements reachable via Tab key",
            "Focus order follows logical reading order",
            "Focus ring is visible on all interactive elements",
            "No keyboard traps (user can always navigate away)",
        ],
    },
    {
        "id": "A3",
        "name": "Screen reader support",
        "checkpoints": [
            "All images have meaningful alt text",
            "Form inputs have associated labels",
            "ARIA attributes used correctly for dynamic content",
            "Headings follow logical hierarchy (h1 > h2 > h3)",
        ],
    },
]

SEVERITY_LEVELS = {
    0: {"label": "Cosmetic", "action": "Fix when possible", "color": "gray"},
    1: {"label": "Minor", "action": "Low priority fix", "color": "yellow"},
    2: {"label": "Major", "action": "Fix before next release", "color": "orange"},
    3: {"label": "Critical", "action": "Fix immediately", "color": "red"},
}


def generate_checklist() -> Dict:
    """Generate empty checklist for evaluation."""
    checklist = {"heuristics": [], "accessibility": []}

    for h in NIELSEN_HEURISTICS:
        entry = {
            "id": h["id"],
            "name": h["name"],
            "checkpoints": [
                {"check": cp, "pass": None, "severity": None, "notes": ""}
                for cp in h["checkpoints"]
            ],
        }
        checklist["heuristics"].append(entry)

    for a in A11Y_HEURISTICS:
        entry = {
            "id": a["id"],
            "name": a["name"],
            "checkpoints": [
                {"check": cp, "pass": None, "severity": None, "notes": ""}
                for cp in a["checkpoints"]
            ],
        }
        checklist["accessibility"].append(entry)

    return checklist


def analyze_answers(answers: Dict) -> Dict:
    """Analyze completed checklist and generate critique report."""
    issues = []
    passes = []
    total_checks = 0
    passed_checks = 0

    for section_key in ["heuristics", "accessibility"]:
        for heuristic in answers.get(section_key, []):
            for cp in heuristic.get("checkpoints", []):
                total_checks += 1
                if cp.get("pass") is True:
                    passed_checks += 1
                    passes.append({
                        "heuristic_id": heuristic["id"],
                        "heuristic_name": heuristic["name"],
                        "checkpoint": cp["check"],
                    })
                elif cp.get("pass") is False:
                    severity = cp.get("severity", 1)
                    issues.append({
                        "heuristic_id": heuristic["id"],
                        "heuristic_name": heuristic["name"],
                        "checkpoint": cp["check"],
                        "severity": severity,
                        "severity_label": SEVERITY_LEVELS.get(severity, SEVERITY_LEVELS[1])["label"],
                        "action": SEVERITY_LEVELS.get(severity, SEVERITY_LEVELS[1])["action"],
                        "notes": cp.get("notes", ""),
                    })

    # Sort issues by severity (highest first)
    issues.sort(key=lambda x: -x["severity"])

    # Calculate scores
    compliance_score = round((passed_checks / total_checks) * 100, 1) if total_checks > 0 else 0

    severity_counts = {v["label"]: 0 for v in SEVERITY_LEVELS.values()}
    for issue in issues:
        severity_counts[issue["severity_label"]] = severity_counts.get(issue["severity_label"], 0) + 1

    # Overall grade
    if compliance_score >= 90 and severity_counts.get("Critical", 0) == 0:
        grade = "A"
    elif compliance_score >= 80 and severity_counts.get("Critical", 0) == 0:
        grade = "B"
    elif compliance_score >= 65:
        grade = "C"
    elif compliance_score >= 50:
        grade = "D"
    else:
        grade = "F"

    return {
        "summary": {
            "total_checks": total_checks,
            "passed": passed_checks,
            "failed": total_checks - passed_checks,
            "compliance_score": compliance_score,
            "grade": grade,
            "severity_distribution": severity_counts,
        },
        "issues": issues,
        "strengths": passes[:5],
        "top_priorities": issues[:5],
    }


def format_checklist_output(checklist: Dict) -> str:
    """Format checklist as human-readable text for manual evaluation."""
    lines = []
    lines.append("=" * 60)
    lines.append("DESIGN CRITIQUE CHECKLIST")
    lines.append("=" * 60)
    lines.append("\\nFill in pass (true/false), severity (0-3), and notes for each checkpoint.")
    lines.append("Save as JSON and run: python design_critique.py --answers answers.json\\n")

    for section in ["heuristics", "accessibility"]:
        section_label = "NIELSEN'S 10 HEURISTICS" if section == "heuristics" else "ACCESSIBILITY"
        lines.append(f"\\n  {section_label}")
        lines.append("  " + "-" * 50)

        for h in checklist[section]:
            lines.append(f"\\n  [{h['id']}] {h['name']}")
            for cp in h["checkpoints"]:
                lines.append(f"    [ ] {cp['check']}")

    lines.append("\\n\\nSeverity scale: 0=Cosmetic, 1=Minor, 2=Major, 3=Critical")
    return "\\n".join(lines)


def format_report_output(report: Dict) -> str:
    """Format critique report as human-readable text."""
    s = report["summary"]
    lines = []
    lines.append("=" * 60)
    lines.append("DESIGN CRITIQUE REPORT")
    lines.append("=" * 60)

    lines.append(f"\\n  COMPLIANCE SCORE: {s['compliance_score']}%  (Grade: {s['grade']})")
    lines.append(f"  Checks: {s['passed']} passed / {s['failed']} failed / {s['total_checks']} total")

    lines.append(f"\\n  SEVERITY DISTRIBUTION")
    for label, count in s["severity_distribution"].items():
        bar = "#" * (count * 3)
        lines.append(f"    {label:<12} {count:>3} {bar}")

    if report["top_priorities"]:
        lines.append(f"\\n  TOP PRIORITIES (fix first)")
        lines.append("  " + "-" * 50)
        for i, issue in enumerate(report["top_priorities"], 1):
            lines.append(f"  {i}. [{issue['severity_label'].upper()}] {issue['checkpoint']}")
            lines.append(f"     Heuristic: {issue['heuristic_id']} - {issue['heuristic_name']}")
            lines.append(f"     Action: {issue['action']}")
            if issue["notes"]:
                lines.append(f"     Notes: {issue['notes']}")

    if report["strengths"]:
        lines.append(f"\\n  STRENGTHS")
        lines.append("  " + "-" * 50)
        for strength in report["strengths"]:
            lines.append(f"    + {strength['checkpoint']}")

    if report["issues"]:
        lines.append(f"\\n  ALL ISSUES ({len(report['issues'])} total)")
        lines.append("  " + "-" * 50)
        for issue in report["issues"]:
            lines.append(f"    [{issue['severity_label']:<9}] {issue['checkpoint']}")

    return "\\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate design critique based on usability heuristics and accessibility standards",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate empty checklist
  python design_critique.py --checklist

  # Export checklist as JSON to fill in
  python design_critique.py --checklist --json > checklist.json

  # Analyze completed checklist
  python design_critique.py --answers completed_checklist.json

  # JSON report
  python design_critique.py --answers completed_checklist.json --json
        """,
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--checklist", action="store_true", help="Generate empty checklist for evaluation")
    group.add_argument("--answers", help="Path to completed checklist JSON file")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.checklist:
        checklist = generate_checklist()
        if args.json:
            print(json.dumps(checklist, indent=2))
        else:
            print(format_checklist_output(checklist))
    else:
        with open(args.answers, "r") as f:
            answers = json.load(f)

        report = analyze_answers(answers)

        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(format_report_output(report))


if __name__ == "__main__":
    main()
`
      },
      {
        "path": "scripts/journey_mapper.py",
        "content": `#!/usr/bin/env python3
"""
User Journey Mapper

Creates structured user journey maps from stage definitions.
Identifies pain points, emotional curves, and opportunity areas.

Uses ONLY Python standard library.

Usage:
    python journey_mapper.py --template saas
    python journey_mapper.py --stages stages.json
    python journey_mapper.py --template ecommerce --json
"""

import argparse
import json
import sys
from typing import Dict, List


# Pre-built journey templates
JOURNEY_TEMPLATES = {
    "saas": {
        "name": "SaaS Product Journey",
        "persona": "Product Team User",
        "goal": "Successfully adopt and get value from the product",
        "stages": [
            {
                "name": "Awareness",
                "actions": ["Searches for solution online", "Reads blog post or review", "Sees ad or recommendation"],
                "touchpoints": ["Google Search", "Blog", "Social Media", "Peer referral"],
                "emotions": {"score": 3, "label": "Curious but skeptical"},
                "pain_points": ["Too many options", "Hard to tell products apart", "Unclear pricing"],
                "opportunities": ["SEO-optimized comparison content", "Clear value proposition on landing page"],
            },
            {
                "name": "Evaluation",
                "actions": ["Visits website", "Reads features page", "Compares with competitors", "Watches demo"],
                "touchpoints": ["Website", "Demo video", "Pricing page", "Competitor sites"],
                "emotions": {"score": 4, "label": "Interested, comparing options"},
                "pain_points": ["Complex pricing tiers", "No free trial visible", "Feature comparison is hard"],
                "opportunities": ["Interactive product tour", "Side-by-side comparison tool", "Social proof placement"],
            },
            {
                "name": "Signup",
                "actions": ["Creates account", "Enters payment info", "Verifies email"],
                "touchpoints": ["Registration form", "Email", "Payment processor"],
                "emotions": {"score": 3, "label": "Cautious, wants quick setup"},
                "pain_points": ["Too many form fields", "Unclear what happens after signup", "Forced credit card"],
                "opportunities": ["Single-field signup", "Show value before requiring payment", "Progress indicator"],
            },
            {
                "name": "Onboarding",
                "actions": ["Completes setup wizard", "Imports data", "Invites team members", "Completes first task"],
                "touchpoints": ["Setup wizard", "Import tool", "Email invites", "In-app tutorial"],
                "emotions": {"score": 2, "label": "Overwhelmed, needs guidance"},
                "pain_points": ["Too many steps", "Data import fails", "No clear next step", "Empty state is confusing"],
                "opportunities": ["Guided quick-start (<5 min to value)", "Pre-populated sample data", "Contextual tips"],
            },
            {
                "name": "Adoption",
                "actions": ["Uses core features daily", "Discovers advanced features", "Customizes workflow"],
                "touchpoints": ["Product UI", "Help center", "In-app notifications", "Email tips"],
                "emotions": {"score": 4, "label": "Gaining confidence, seeing value"},
                "pain_points": ["Hard to discover features", "Missing integrations", "Performance issues"],
                "opportunities": ["Feature discovery prompts", "Integration marketplace", "Workflow templates"],
            },
            {
                "name": "Advocacy",
                "actions": ["Recommends to peers", "Writes review", "Shares on social", "Expands usage"],
                "touchpoints": ["Review sites", "Social media", "Word of mouth", "Referral program"],
                "emotions": {"score": 5, "label": "Satisfied, wants to share"},
                "pain_points": ["No easy way to refer", "No recognition for loyalty", "Feature requests ignored"],
                "opportunities": ["Referral program with rewards", "Customer advisory board", "Public feature roadmap"],
            },
        ],
    },
    "ecommerce": {
        "name": "E-commerce Purchase Journey",
        "persona": "Online Shopper",
        "goal": "Find and purchase the right product at a good price",
        "stages": [
            {
                "name": "Discovery",
                "actions": ["Searches for product", "Browses categories", "Sees recommendation"],
                "touchpoints": ["Search engine", "Social media", "Email newsletter", "Marketplace"],
                "emotions": {"score": 3, "label": "Browsing, open to options"},
                "pain_points": ["Search returns irrelevant results", "Category structure is confusing"],
                "opportunities": ["Personalized recommendations", "Smart search with filters"],
            },
            {
                "name": "Consideration",
                "actions": ["Views product details", "Reads reviews", "Compares options", "Checks sizing/specs"],
                "touchpoints": ["Product page", "Reviews section", "Size guide", "Comparison tool"],
                "emotions": {"score": 4, "label": "Interested, needs reassurance"},
                "pain_points": ["Insufficient product images", "Fake or unhelpful reviews", "No size guidance"],
                "opportunities": ["360-degree product views", "Verified purchase reviews", "AR try-on"],
            },
            {
                "name": "Purchase",
                "actions": ["Adds to cart", "Applies coupon", "Enters shipping info", "Completes payment"],
                "touchpoints": ["Cart", "Checkout flow", "Payment processor", "Order confirmation"],
                "emotions": {"score": 3, "label": "Anxious about commitment"},
                "pain_points": ["Unexpected shipping costs", "Too many checkout steps", "Limited payment options"],
                "opportunities": ["One-page checkout", "Free shipping threshold", "Guest checkout option"],
            },
            {
                "name": "Delivery",
                "actions": ["Tracks order", "Receives package", "Inspects product"],
                "touchpoints": ["Tracking page", "Email updates", "SMS notifications", "Package"],
                "emotions": {"score": 4, "label": "Excited, anticipating"},
                "pain_points": ["No tracking updates", "Delayed delivery", "Damaged packaging"],
                "opportunities": ["Real-time delivery tracking", "Proactive delay notifications"],
            },
            {
                "name": "Post-Purchase",
                "actions": ["Uses product", "Writes review", "Contacts support if needed", "Considers reorder"],
                "touchpoints": ["Product", "Review prompt email", "Support chat", "Reorder email"],
                "emotions": {"score": 4, "label": "Satisfied or seeking resolution"},
                "pain_points": ["Product doesn't match description", "Difficult return process"],
                "opportunities": ["Easy self-service returns", "Post-purchase care emails", "Loyalty program"],
            },
        ],
    },
    "mobile_app": {
        "name": "Mobile App Journey",
        "persona": "Mobile-First User",
        "goal": "Download, learn, and integrate app into daily routine",
        "stages": [
            {
                "name": "Discovery",
                "actions": ["Finds app in store", "Reads description and reviews", "Views screenshots"],
                "touchpoints": ["App Store", "Google Play", "Social media", "Word of mouth"],
                "emotions": {"score": 3, "label": "Curious, evaluating quickly"},
                "pain_points": ["Too many similar apps", "Misleading screenshots", "Bad reviews"],
                "opportunities": ["App Store optimization", "Video preview", "Respond to reviews"],
            },
            {
                "name": "Install & First Open",
                "actions": ["Downloads app", "Opens for first time", "Grants permissions", "Views onboarding"],
                "touchpoints": ["App Store", "System permissions", "Onboarding screens"],
                "emotions": {"score": 3, "label": "Impatient, wants quick value"},
                "pain_points": ["Large download size", "Too many permission requests", "Long onboarding"],
                "opportunities": ["<50MB download", "Progressive permissions", "3-screen onboarding max"],
            },
            {
                "name": "First Value",
                "actions": ["Completes first core action", "Sees result", "Understands benefit"],
                "touchpoints": ["Core feature", "Success state", "Tutorial overlay"],
                "emotions": {"score": 4, "label": "Pleasantly surprised or frustrated"},
                "pain_points": ["Can't find main feature", "First action fails", "No clear path"],
                "opportunities": ["Guided first action", "Instant gratification moment", "Sample content"],
            },
            {
                "name": "Habit Formation",
                "actions": ["Returns within 24 hours", "Uses 3+ times per week", "Enables notifications"],
                "touchpoints": ["Push notifications", "App icon", "Widgets", "Email digest"],
                "emotions": {"score": 4, "label": "Building routine"},
                "pain_points": ["Annoying notifications", "App is slow", "Battery/data concerns"],
                "opportunities": ["Smart notification timing", "Offline mode", "Streaks or progress tracking"],
            },
            {
                "name": "Power Usage",
                "actions": ["Discovers advanced features", "Customizes settings", "Shares with others"],
                "touchpoints": ["Settings", "Share flow", "Advanced features", "In-app community"],
                "emotions": {"score": 5, "label": "Invested, advocates"},
                "pain_points": ["Feature bloat", "Settings are buried", "No social features"],
                "opportunities": ["Progressive disclosure", "Share rewards", "Community features"],
            },
        ],
    },
}


def calculate_journey_metrics(stages: List[Dict]) -> Dict:
    """Calculate journey health metrics."""
    emotion_scores = [s["emotions"]["score"] for s in stages]

    # Find biggest drops
    drops = []
    for i in range(1, len(emotion_scores)):
        diff = emotion_scores[i] - emotion_scores[i - 1]
        if diff < 0:
            drops.append({
                "from_stage": stages[i - 1]["name"],
                "to_stage": stages[i]["name"],
                "drop": abs(diff),
            })

    drops.sort(key=lambda x: -x["drop"])

    # Pain point severity
    all_pain_points = []
    for stage in stages:
        for pp in stage.get("pain_points", []):
            all_pain_points.append({"stage": stage["name"], "pain_point": pp})

    # Opportunity count
    total_opportunities = sum(len(s.get("opportunities", [])) for s in stages)

    return {
        "total_stages": len(stages),
        "avg_emotion_score": round(sum(emotion_scores) / len(emotion_scores), 1),
        "lowest_emotion_stage": stages[emotion_scores.index(min(emotion_scores))]["name"],
        "highest_emotion_stage": stages[emotion_scores.index(max(emotion_scores))]["name"],
        "biggest_drops": drops[:3],
        "total_pain_points": len(all_pain_points),
        "total_opportunities": total_opportunities,
        "critical_stage": stages[emotion_scores.index(min(emotion_scores))]["name"],
    }


def format_human_output(journey: Dict, metrics: Dict) -> str:
    """Format journey map as human-readable text."""
    lines = []
    lines.append("=" * 60)
    lines.append(f"USER JOURNEY MAP: {journey['name']}")
    lines.append("=" * 60)
    lines.append(f"\\n  Persona: {journey['persona']}")
    lines.append(f"  Goal:    {journey['goal']}")

    # Emotion curve visualization
    lines.append(f"\\n  EMOTION CURVE")
    lines.append("  " + "-" * 50)
    for stage in journey["stages"]:
        score = stage["emotions"]["score"]
        bar = "*" * (score * 6)
        label = stage["emotions"]["label"]
        lines.append(f"  {stage['name']:<15} {'|' + bar:<32} {score}/5 - {label}")

    # Stage details
    for stage in journey["stages"]:
        lines.append(f"\\n  STAGE: {stage['name'].upper()}")
        lines.append("  " + "-" * 40)

        lines.append(f"  Actions:")
        for action in stage["actions"]:
            lines.append(f"    - {action}")

        lines.append(f"  Touchpoints:")
        for tp in stage["touchpoints"]:
            lines.append(f"    - {tp}")

        lines.append(f"  Pain Points:")
        for pp in stage.get("pain_points", []):
            lines.append(f"    ! {pp}")

        lines.append(f"  Opportunities:")
        for opp in stage.get("opportunities", []):
            lines.append(f"    > {opp}")

    # Metrics summary
    lines.append(f"\\n  JOURNEY HEALTH METRICS")
    lines.append("  " + "-" * 50)
    lines.append(f"  Avg emotion score:   {metrics['avg_emotion_score']}/5")
    lines.append(f"  Lowest point:        {metrics['lowest_emotion_stage']}")
    lines.append(f"  Highest point:       {metrics['highest_emotion_stage']}")
    lines.append(f"  Total pain points:   {metrics['total_pain_points']}")
    lines.append(f"  Total opportunities: {metrics['total_opportunities']}")

    if metrics["biggest_drops"]:
        lines.append(f"\\n  BIGGEST EMOTION DROPS (prioritize these transitions)")
        for drop in metrics["biggest_drops"]:
            lines.append(f"    {drop['from_stage']} -> {drop['to_stage']} (dropped {drop['drop']} points)")

    return "\\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Create structured user journey maps with emotion curves and opportunity analysis",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use a pre-built template
  python journey_mapper.py --template saas
  python journey_mapper.py --template ecommerce
  python journey_mapper.py --template mobile_app

  # Load custom stages from JSON
  python journey_mapper.py --stages my_journey.json

  # JSON output
  python journey_mapper.py --template saas --json

Available templates: saas, ecommerce, mobile_app
        """,
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--template", "-t", choices=list(JOURNEY_TEMPLATES.keys()), help="Use pre-built journey template")
    group.add_argument("--stages", "-s", help="Path to custom stages JSON file")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.template:
        journey = JOURNEY_TEMPLATES[args.template]
    else:
        with open(args.stages, "r") as f:
            journey = json.load(f)

    metrics = calculate_journey_metrics(journey["stages"])

    if args.json:
        output = {
            "journey": journey,
            "metrics": metrics,
        }
        print(json.dumps(output, indent=2))
    else:
        print(format_human_output(journey, metrics))


if __name__ == "__main__":
    main()
`
      },
      {
        "path": "scripts/usability_scorer.py",
        "content": `#!/usr/bin/env python3
"""
Usability Test Scorer

Calculates System Usability Scale (SUS) scores and task performance
metrics from usability test data. Supports individual and aggregate analysis.

Uses ONLY Python standard library.

Usage:
    python usability_scorer.py --sus-responses responses.csv
    python usability_scorer.py --task-data tasks.csv
    python usability_scorer.py sample
    python usability_scorer.py --sus-responses responses.csv --json
"""

import argparse
import csv
import json
import math
import sys
from typing import Dict, List


# SUS question text for reference
SUS_QUESTIONS = [
    "I think that I would like to use this system frequently.",
    "I found the system unnecessarily complex.",
    "I thought the system was easy to use.",
    "I think that I would need the support of a technical person to use this system.",
    "I found the various functions in this system were well integrated.",
    "I thought there was too much inconsistency in this system.",
    "I would imagine that most people would learn to use this system very quickly.",
    "I found the system very cumbersome to use.",
    "I felt very confident using the system.",
    "I needed to learn a lot of things before I could get going with this system.",
]


def calculate_sus_score(responses: List[int]) -> float:
    """Calculate SUS score from 10 responses (each 1-5).

    Odd questions (1,3,5,7,9): score - 1
    Even questions (2,4,6,8,10): 5 - score
    Multiply sum by 2.5 for 0-100 scale.
    """
    if len(responses) != 10:
        raise ValueError("SUS requires exactly 10 responses")

    adjusted = []
    for i, score in enumerate(responses):
        if (i + 1) % 2 == 1:  # Odd questions (positive)
            adjusted.append(score - 1)
        else:  # Even questions (negative)
            adjusted.append(5 - score)

    return round(sum(adjusted) * 2.5, 1)


def interpret_sus_score(score: float) -> Dict:
    """Interpret SUS score using standard benchmarks."""
    if score >= 80.3:
        grade = "A"
        adjective = "Excellent"
        percentile = "Top 10%"
    elif score >= 68:
        grade = "B"
        adjective = "Good"
        percentile = "Above average"
    elif score >= 51:
        grade = "C"
        adjective = "OK"
        percentile = "Below average"
    elif score >= 35:
        grade = "D"
        adjective = "Poor"
        percentile = "Bottom 20%"
    else:
        grade = "F"
        adjective = "Awful"
        percentile = "Bottom 5%"

    # Acceptability
    if score >= 70:
        acceptable = "Acceptable"
    elif score >= 50:
        acceptable = "Marginal"
    else:
        acceptable = "Not acceptable"

    return {
        "score": score,
        "grade": grade,
        "adjective": adjective,
        "percentile": percentile,
        "acceptable": acceptable,
        "benchmark": 68.0,
        "above_benchmark": score >= 68,
    }


def calculate_task_metrics(tasks: List[Dict]) -> Dict:
    """Calculate task performance metrics.

    Each task dict should have:
        participant, task, completed (bool), time_seconds, errors
    """
    task_groups = {}
    for t in tasks:
        task_name = t["task"]
        if task_name not in task_groups:
            task_groups[task_name] = []
        task_groups[task_name].append(t)

    results = {}
    for task_name, attempts in task_groups.items():
        total = len(attempts)
        completed = sum(1 for a in attempts if a["completed"])
        times = [a["time_seconds"] for a in attempts if a["completed"]]
        errors = [a["errors"] for a in attempts]

        completion_rate = round((completed / total) * 100, 1) if total > 0 else 0
        avg_time = round(sum(times) / len(times), 1) if times else 0
        median_time = sorted(times)[len(times) // 2] if times else 0
        avg_errors = round(sum(errors) / total, 1) if total > 0 else 0

        # Severity assessment
        if completion_rate < 50:
            severity = "Critical"
        elif completion_rate < 75:
            severity = "Major"
        elif completion_rate < 90:
            severity = "Minor"
        else:
            severity = "None"

        results[task_name] = {
            "participants": total,
            "completion_rate": completion_rate,
            "avg_time_seconds": avg_time,
            "median_time_seconds": median_time,
            "avg_errors": avg_errors,
            "usability_severity": severity,
        }

    return results


def load_sus_csv(filepath: str) -> List[Dict]:
    """Load SUS responses from CSV.

    Expected: participant, q1, q2, ..., q10 (each 1-5)
    """
    rows = []
    with open(filepath, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            responses = []
            for i in range(1, 11):
                responses.append(int(row.get(f"q{i}", 3)))
            rows.append({
                "participant": row.get("participant", f"P{len(rows)+1}"),
                "responses": responses,
            })
    return rows


def load_task_csv(filepath: str) -> List[Dict]:
    """Load task performance data from CSV.

    Expected: participant, task, completed, time_seconds, errors
    """
    rows = []
    with open(filepath, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "participant": row.get("participant", "Unknown"),
                "task": row.get("task", "Unknown"),
                "completed": row.get("completed", "true").lower() in ("true", "1", "yes"),
                "time_seconds": float(row.get("time_seconds", 0)),
                "errors": int(row.get("errors", 0)),
            })
    return rows


def create_sample_files():
    """Create sample CSV files for testing."""
    # SUS responses
    sus_header = ["participant"] + [f"q{i}" for i in range(1, 11)]
    sus_rows = [
        ["P1", "4", "2", "5", "1", "4", "2", "5", "1", "4", "2"],
        ["P2", "3", "3", "4", "2", "4", "3", "4", "2", "3", "3"],
        ["P3", "5", "1", "5", "1", "5", "1", "5", "1", "5", "1"],
        ["P4", "3", "4", "3", "3", "3", "3", "3", "3", "3", "4"],
        ["P5", "4", "2", "4", "2", "5", "2", "4", "2", "4", "2"],
        ["P6", "2", "4", "3", "3", "3", "4", "3", "4", "2", "4"],
    ]
    with open("sample_sus.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(sus_header)
        writer.writerows(sus_rows)

    # Task data
    task_header = ["participant", "task", "completed", "time_seconds", "errors"]
    task_rows = [
        ["P1", "Find product", "true", "45", "0"],
        ["P2", "Find product", "true", "62", "1"],
        ["P3", "Find product", "true", "38", "0"],
        ["P4", "Find product", "false", "120", "3"],
        ["P5", "Find product", "true", "55", "1"],
        ["P1", "Complete checkout", "true", "120", "0"],
        ["P2", "Complete checkout", "true", "180", "2"],
        ["P3", "Complete checkout", "false", "240", "4"],
        ["P4", "Complete checkout", "true", "150", "1"],
        ["P5", "Complete checkout", "true", "135", "0"],
        ["P1", "Edit profile", "true", "30", "0"],
        ["P2", "Edit profile", "true", "25", "0"],
        ["P3", "Edit profile", "true", "40", "1"],
        ["P4", "Edit profile", "true", "35", "0"],
        ["P5", "Edit profile", "true", "28", "0"],
    ]
    with open("sample_tasks.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(task_header)
        writer.writerows(task_rows)

    print("Sample files created: sample_sus.csv, sample_tasks.csv")


def format_sus_report(participants: List[Dict], aggregate: Dict) -> str:
    """Format SUS report as human-readable text."""
    lines = []
    lines.append("=" * 60)
    lines.append("SYSTEM USABILITY SCALE (SUS) REPORT")
    lines.append("=" * 60)

    interp = aggregate["interpretation"]
    lines.append(f"\\n  AGGREGATE SCORE: {aggregate['mean_score']}")
    lines.append(f"  Grade:           {interp['grade']} ({interp['adjective']})")
    lines.append(f"  Percentile:      {interp['percentile']}")
    lines.append(f"  Acceptable:      {interp['acceptable']}")
    lines.append(f"  Benchmark:       {interp['benchmark']} (industry average)")
    lines.append(f"  Participants:    {aggregate['count']}")
    lines.append(f"  Std Deviation:   {aggregate['std_dev']}")
    lines.append(f"  Range:           {aggregate['min_score']} - {aggregate['max_score']}")

    # Score visualization
    lines.append(f"\\n  SCORE SCALE")
    lines.append(f"  0    25    50    68    80    100")
    lines.append(f"  |-----|-----|-----|-----|-----|")
    pos = int(aggregate["mean_score"] / 100 * 30)
    ruler = list(" " * 31)
    ruler[min(pos, 30)] = "^"
    lines.append(f"  {''.join(ruler)} ({aggregate['mean_score']})")
    lines.append(f"  F     D     C     B     A")

    # Per-participant
    lines.append(f"\\n  INDIVIDUAL SCORES")
    lines.append(f"  {'Participant':<15} {'Score':>7} {'Grade':>6}")
    lines.append(f"  {'-'*15} {'-'*7} {'-'*6}")
    for p in participants:
        lines.append(f"  {p['participant']:<15} {p['score']:>7} {p['interpretation']['grade']:>6}")

    # Question analysis
    if participants:
        lines.append(f"\\n  QUESTION ANALYSIS (avg per question)")
        lines.append(f"  {'#':<4} {'Avg':>5} {'Question'}")
        lines.append(f"  {'-'*4} {'-'*5} {'-'*50}")
        for qi in range(10):
            avg_q = round(sum(p["responses"][qi] for p in participants) / len(participants), 1)
            direction = "(+)" if (qi + 1) % 2 == 1 else "(-)"
            lines.append(f"  Q{qi+1:<3} {avg_q:>5} {direction} {SUS_QUESTIONS[qi][:50]}")

    return "\\n".join(lines)


def format_task_report(task_results: Dict) -> str:
    """Format task metrics as human-readable text."""
    lines = []
    lines.append("\\n" + "=" * 60)
    lines.append("TASK PERFORMANCE REPORT")
    lines.append("=" * 60)

    lines.append(f"\\n  {'Task':<25} {'Completion':>12} {'Avg Time':>10} {'Avg Errors':>11} {'Severity':<10}")
    lines.append(f"  {'-'*25} {'-'*12} {'-'*10} {'-'*11} {'-'*10}")

    for task_name, metrics in task_results.items():
        lines.append(
            f"  {task_name:<25} {metrics['completion_rate']:>11}% "
            f"{metrics['avg_time_seconds']:>9}s {metrics['avg_errors']:>11} "
            f"{metrics['usability_severity']:<10}"
        )

    return "\\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Calculate SUS scores and task performance metrics from usability tests",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create sample data
  python usability_scorer.py sample

  # Analyze SUS responses
  python usability_scorer.py --sus-responses responses.csv

  # Analyze task performance
  python usability_scorer.py --task-data tasks.csv

  # Both analyses together
  python usability_scorer.py --sus-responses responses.csv --task-data tasks.csv

  # JSON output
  python usability_scorer.py --sus-responses responses.csv --json
        """,
    )

    parser.add_argument("action", nargs="?", help='"sample" to create sample files')
    parser.add_argument("--sus-responses", help="CSV with SUS responses (participant, q1-q10)")
    parser.add_argument("--task-data", help="CSV with task data (participant, task, completed, time_seconds, errors)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.action == "sample":
        create_sample_files()
        return

    if not args.sus_responses and not args.task_data:
        parser.print_help()
        print("\\nError: Provide --sus-responses and/or --task-data, or use 'sample' to create test files")
        sys.exit(1)

    output = {}

    if args.sus_responses:
        raw = load_sus_csv(args.sus_responses)
        participants = []
        for p in raw:
            score = calculate_sus_score(p["responses"])
            participants.append({
                "participant": p["participant"],
                "responses": p["responses"],
                "score": score,
                "interpretation": interpret_sus_score(score),
            })

        scores = [p["score"] for p in participants]
        mean = round(sum(scores) / len(scores), 1)
        variance = sum((s - mean) ** 2 for s in scores) / len(scores)
        std_dev = round(math.sqrt(variance), 1)

        aggregate = {
            "count": len(scores),
            "mean_score": mean,
            "median_score": sorted(scores)[len(scores) // 2],
            "std_dev": std_dev,
            "min_score": min(scores),
            "max_score": max(scores),
            "interpretation": interpret_sus_score(mean),
        }

        output["sus"] = {"participants": participants, "aggregate": aggregate}

        if not args.json:
            print(format_sus_report(participants, aggregate))

    if args.task_data:
        tasks = load_task_csv(args.task_data)
        task_results = calculate_task_metrics(tasks)
        output["task_performance"] = task_results

        if not args.json:
            print(format_task_report(task_results))

    if args.json:
        # Clean up for JSON (remove full response arrays for brevity)
        if "sus" in output:
            for p in output["sus"]["participants"]:
                del p["responses"]
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
`
      }
    ]
  }
];
function findPreloadedAgentTemplateSkillSource(input) {
  return PRELOADED_AGENT_TEMPLATE_SKILL_SOURCES.find(
    (source) => source.key === input.key && source.sourceType === input.sourceType && source.sourceUrl === input.sourceUrl
  );
}

// ../services/src/documents/collab.ts
function rebuildChannelDocumentBlocksForVersion(input) {
  const previousBlocks = listChannelDocumentBlocks(input.state, input.document.id);
  input.state.channelDocumentBlocks = input.state.channelDocumentBlocks.filter(
    (block) => block.documentId !== input.document.id
  );
  const blocks = splitMarkdownIntoBlocks(input.version.contentMarkdown).map((block, index) => ({
    id: previousBlocks[index]?.id ?? `channel-doc-block-${createOpaqueId2()}`,
    documentId: input.document.id,
    parentId: void 0,
    type: "section",
    order: index,
    heading: block.heading,
    contentMarkdown: block.contentMarkdown,
    revision: previousBlocks[index] && previousBlocks[index].heading === block.heading && previousBlocks[index].contentMarkdown === block.contentMarkdown ? previousBlocks[index].revision : previousBlocks[index] ? previousBlocks[index].revision + 1 : 1,
    updatedBy: input.actorName,
    updatedAt: input.version.createdAt
  }));
  input.state.channelDocumentBlocks.push(...blocks);
}
function listChannelDocumentBlocks(state, documentId) {
  return state.channelDocumentBlocks.filter((block) => block.documentId === documentId).sort((left, right) => left.order - right.order);
}
function serializeChannelDocumentBlocks(blocks) {
  return blocks.map((block) => block.contentMarkdown.trim()).filter((value) => value.length > 0).join("\n\n");
}
function createChannelDocumentChangeSet(input) {
  return {
    id: `channel-doc-changeset-${createOpaqueId2()}`,
    documentId: input.documentId,
    actorId: input.actorId,
    actorType: input.actorType,
    baseVersionId: input.baseVersionId,
    documentVersionId: input.documentVersionId?.trim() || void 0,
    operationsJson: input.operationsJson,
    status: input.status,
    sourceMessageId: input.sourceMessageId?.trim() || void 0,
    sourceTaskQueueId: input.sourceTaskQueueId?.trim() || void 0,
    createdAt: input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function createChannelDocumentConflict(input) {
  return {
    id: `channel-doc-conflict-${createOpaqueId2()}`,
    documentId: input.documentId,
    blockId: input.blockId,
    leftChangeSetId: input.leftChangeSetId,
    rightChangeSetId: input.rightChangeSetId,
    status: "open",
    createdAt: input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function normalizeChannelDocumentBlocks(blocks, fallback) {
  if (!Array.isArray(blocks)) {
    return fallback;
  }
  return blocks.map((block) => normalizeChannelDocumentBlock(block)).filter((block) => block !== null).sort((left, right) => {
    if (left.documentId !== right.documentId) {
      return left.documentId.localeCompare(right.documentId, "en-US", { sensitivity: "base" });
    }
    return left.order - right.order;
  });
}
function normalizeChannelDocumentAccesses(accesses, fallback) {
  if (!Array.isArray(accesses)) {
    return fallback;
  }
  return accesses.map((access3) => normalizeChannelDocumentAccess(access3)).filter((access3) => access3 !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeChannelDocumentChangeSets(changeSets, fallback) {
  if (!Array.isArray(changeSets)) {
    return fallback;
  }
  return changeSets.map((changeSet) => normalizeChannelDocumentChangeSet(changeSet)).filter((changeSet) => changeSet !== null).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function normalizeChannelDocumentConflicts(conflicts, fallback) {
  if (!Array.isArray(conflicts)) {
    return fallback;
  }
  return conflicts.map((conflict) => normalizeChannelDocumentConflict(conflict)).filter((conflict) => conflict !== null).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function normalizeChannelDocumentPresences(presences, fallback) {
  if (!Array.isArray(presences)) {
    return fallback;
  }
  return presences.map((presence) => normalizeChannelDocumentPresence(presence)).filter((presence) => presence !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function splitMarkdownIntoBlocks(contentMarkdown) {
  const sections = contentMarkdown.split(/\n(?=##?\s)/).map((section) => section.trim()).filter((section) => section.length > 0);
  if (sections.length === 0) {
    return [
      {
        heading: void 0,
        contentMarkdown
      }
    ];
  }
  return sections.map((section) => {
    const firstLine = section.split(/\r?\n/, 1)[0] ?? "";
    return {
      heading: /^#+\s+/.test(firstLine) ? firstLine.replace(/^#+\s+/, "").trim() : void 0,
      contentMarkdown: section
    };
  });
}
function normalizeChannelDocumentBlock(block) {
  if (!block || typeof block !== "object") {
    return null;
  }
  const candidate = block;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.order !== "number" || typeof candidate.contentMarkdown !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    parentId: typeof candidate.parentId === "string" ? candidate.parentId : void 0,
    type: "section",
    order: candidate.order,
    heading: typeof candidate.heading === "string" ? candidate.heading : void 0,
    contentMarkdown: candidate.contentMarkdown,
    revision: typeof candidate.revision === "number" ? candidate.revision : 1,
    updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : "Unknown",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeChannelDocumentAccess(access3) {
  if (!access3 || typeof access3 !== "object") {
    return null;
  }
  const candidate = access3;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.actorId !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    actorId: candidate.actorId,
    actorType: candidate.actorType === "agent" ? "agent" : "human",
    role: candidate.role === "owner" || candidate.role === "viewer" ? candidate.role : "editor",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeChannelDocumentChangeSet(changeSet) {
  if (!changeSet || typeof changeSet !== "object") {
    return null;
  }
  const candidate = changeSet;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.actorId !== "string" || typeof candidate.baseVersionId !== "string" || typeof candidate.operationsJson !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    actorId: candidate.actorId,
    actorType: candidate.actorType === "agent" ? "agent" : "human",
    baseVersionId: candidate.baseVersionId,
    documentVersionId: typeof candidate.documentVersionId === "string" ? candidate.documentVersionId : void 0,
    operationsJson: candidate.operationsJson,
    status: candidate.status === "applied" || candidate.status === "conflicted" || candidate.status === "rejected" ? candidate.status : "pending",
    sourceMessageId: typeof candidate.sourceMessageId === "string" ? candidate.sourceMessageId : void 0,
    sourceTaskQueueId: typeof candidate.sourceTaskQueueId === "string" ? candidate.sourceTaskQueueId : void 0,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeChannelDocumentConflict(conflict) {
  if (!conflict || typeof conflict !== "object") {
    return null;
  }
  const candidate = conflict;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.blockId !== "string" || typeof candidate.leftChangeSetId !== "string" || typeof candidate.rightChangeSetId !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    blockId: candidate.blockId,
    leftChangeSetId: candidate.leftChangeSetId,
    rightChangeSetId: candidate.rightChangeSetId,
    status: candidate.status === "resolved" ? "resolved" : "open",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeChannelDocumentPresence(presence) {
  if (!presence || typeof presence !== "object") {
    return null;
  }
  const candidate = presence;
  if (typeof candidate.id !== "string" || typeof candidate.documentId !== "string" || typeof candidate.actorId !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    actorId: candidate.actorId,
    actorType: candidate.actorType === "agent" ? "agent" : "human",
    status: candidate.status === "editing" || candidate.status === "processing" ? candidate.status : "viewing",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function createOpaqueId2() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ../services/src/collaboration/model.ts
var OBJECT_TYPES = /* @__PURE__ */ new Set([
  "channel",
  "channel_document",
  "data_table",
  "task",
  "knowledge_page",
  "todo",
  "agent_draft",
  "file"
]);
var ACTOR_TYPES = /* @__PURE__ */ new Set(["human", "agent", "system"]);
var THREAD_STATUSES = /* @__PURE__ */ new Set(["open", "resolved"]);
var PROPOSAL_STATUSES = /* @__PURE__ */ new Set(["open", "accepted", "rejected", "changes_requested"]);
function normalizeCollaborationCommentThreads(threads, fallback) {
  if (!Array.isArray(threads)) {
    return fallback;
  }
  return threads.map((thread) => normalizeCollaborationCommentThread(thread)).filter((thread) => thread !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeCollaborationComments(comments, fallback) {
  if (!Array.isArray(comments)) {
    return fallback;
  }
  return comments.map((comment) => normalizeCollaborationComment(comment)).filter((comment) => comment !== null).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
function normalizeCollaborationActivities(activities, fallback) {
  if (!Array.isArray(activities)) {
    return fallback;
  }
  return activities.map((activity) => normalizeCollaborationActivity(activity)).filter((activity) => activity !== null).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function normalizeCollaborationChangeProposals(proposals, fallback) {
  if (!Array.isArray(proposals)) {
    return fallback;
  }
  return proposals.map((proposal) => normalizeCollaborationChangeProposal(proposal)).filter((proposal) => proposal !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeCollaborationCommentThread(thread) {
  if (!thread || typeof thread !== "object") {
    return null;
  }
  const candidate = thread;
  if (typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string" || !isObjectType(candidate.objectType) || typeof candidate.objectId !== "string" || !isActorType2(candidate.createdByType) || typeof candidate.createdById !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    objectType: candidate.objectType,
    objectId: candidate.objectId,
    anchor: asRecord(candidate.anchor),
    status: THREAD_STATUSES.has(candidate.status ?? "") ? candidate.status : "open",
    createdByType: candidate.createdByType,
    createdById: candidate.createdById,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeCollaborationComment(comment) {
  if (!comment || typeof comment !== "object") {
    return null;
  }
  const candidate = comment;
  if (typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string" || typeof candidate.threadId !== "string" || !isActorType2(candidate.authorType) || typeof candidate.authorId !== "string" || typeof candidate.body !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    threadId: candidate.threadId,
    authorType: candidate.authorType,
    authorId: candidate.authorId,
    body: candidate.body,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeCollaborationActivity(activity) {
  if (!activity || typeof activity !== "object") {
    return null;
  }
  const candidate = activity;
  if (typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string" || !isObjectType(candidate.objectType) || typeof candidate.objectId !== "string" || !isActorType2(candidate.actorType) || typeof candidate.actorId !== "string" || typeof candidate.verb !== "string" || typeof candidate.title !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    objectType: candidate.objectType,
    objectId: candidate.objectId,
    actorType: candidate.actorType,
    actorId: candidate.actorId,
    verb: candidate.verb,
    title: candidate.title,
    body: typeof candidate.body === "string" ? candidate.body : "",
    metadata: asRecord(candidate.metadata),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeCollaborationChangeProposal(proposal) {
  if (!proposal || typeof proposal !== "object") {
    return null;
  }
  const candidate = proposal;
  if (typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string" || !isObjectType(candidate.objectType) || typeof candidate.objectId !== "string" || !isActorType2(candidate.proposedByType) || typeof candidate.proposedById !== "string" || typeof candidate.title !== "string" || typeof candidate.summary !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    objectType: candidate.objectType,
    objectId: candidate.objectId,
    proposedByType: candidate.proposedByType,
    proposedById: candidate.proposedById,
    title: candidate.title,
    summary: candidate.summary,
    patch: asRecord(candidate.patch),
    status: PROPOSAL_STATUSES.has(candidate.status ?? "") ? candidate.status : "open",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    decidedByUserId: typeof candidate.decidedByUserId === "string" ? candidate.decidedByUserId : void 0,
    decidedAt: typeof candidate.decidedAt === "string" ? candidate.decidedAt : void 0
  };
}
function isObjectType(value) {
  return typeof value === "string" && OBJECT_TYPES.has(value);
}
function isActorType2(value) {
  return typeof value === "string" && ACTOR_TYPES.has(value);
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

// ../services/src/shared/normalizers.ts
var BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME = "return-output-files";
var BUILTIN_RETURN_OUTPUT_FILES_SKILL_DESCRIPTION = "Return generated files to AgentSpace via agent-space output attach/text. Use when a task should deliver artifacts such as images, markdown, PDFs, or other files back into chat instead of only replying with plain text.";
var BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME = "workspace-context";
var BUILTIN_WORKSPACE_CONTEXT_SKILL_DESCRIPTION = "Inspect workspace-scoped collaborators, channels, messages, and documents with agent-space workspace context commands. Use when the inline task context is insufficient and the agent needs verifiable workspace facts before answering.";
var BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME = "update-channel-documents";
var BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_DESCRIPTION = "Use when Codex should create or update shared channel documents via agent-space output document.";
var BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME = "google-workspace-cli";
var BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_DESCRIPTION = "Read or write Google Workspace channel documents from the Agent runtime using the official gws CLI and AgentSpace runtime-output manifests.";
function normalizeWorkspaceState(state) {
  const fallback = createDefaultWorkspaceState();
  const skillPool = ensureBuiltinWorkspaceSkills(normalizeWorkspaceSkills(state.skills, fallback.skills));
  const activeEmployees = normalizeActiveEmployees(state.activeEmployees, fallback.activeEmployees, skillPool);
  const humanMembers = Array.isArray(state.humanMembers) ? state.humanMembers : fallback.humanMembers;
  const channelDocuments = normalizeChannelDocuments(state.channelDocuments, fallback.channelDocuments);
  return {
    organizationName: state.organizationName ?? fallback.organizationName,
    pendingHandoffs: state.pendingHandoffs ?? fallback.pendingHandoffs,
    humanMembers,
    skills: sortWorkspaceSkills(skillPool),
    activeEmployees,
    directConversations: normalizeDirectConversations(
      state.directConversations,
      fallback.directConversations
    ),
    conversationExecutionWorkspaces: normalizeConversationExecutionWorkspaces(
      state.conversationExecutionWorkspaces,
      fallback.conversationExecutionWorkspaces ?? []
    ),
    channels: normalizeChannels(state.channels, fallback.channels, humanMembers),
    channelDocuments,
    channelDocumentVersions: normalizeChannelDocumentVersions(
      state.channelDocumentVersions,
      fallback.channelDocumentVersions,
      channelDocuments
    ),
    channelDocumentBlocks: normalizeChannelDocumentBlocks(
      state.channelDocumentBlocks,
      fallback.channelDocumentBlocks
    ),
    channelDocumentAccesses: normalizeChannelDocumentAccesses(
      state.channelDocumentAccesses,
      fallback.channelDocumentAccesses
    ),
    channelDocumentChangeSets: normalizeChannelDocumentChangeSets(
      state.channelDocumentChangeSets,
      fallback.channelDocumentChangeSets
    ),
    channelDocumentConflicts: normalizeChannelDocumentConflicts(
      state.channelDocumentConflicts,
      fallback.channelDocumentConflicts
    ),
    channelDocumentPresences: normalizeChannelDocumentPresences(
      state.channelDocumentPresences,
      fallback.channelDocumentPresences
    ),
    channelDocumentRuns: normalizeChannelDocumentRuns(state.channelDocumentRuns, fallback.channelDocumentRuns),
    channelDocumentRunSteps: normalizeChannelDocumentRunSteps(
      state.channelDocumentRunSteps,
      fallback.channelDocumentRunSteps
    ),
    externalSheetOperationRuns: normalizeExternalSheetOperationRuns(
      state.externalSheetOperationRuns,
      fallback.externalSheetOperationRuns,
      channelDocuments
    ),
    collaborationCommentThreads: normalizeCollaborationCommentThreads(
      state.collaborationCommentThreads,
      fallback.collaborationCommentThreads
    ),
    collaborationComments: normalizeCollaborationComments(state.collaborationComments, fallback.collaborationComments),
    collaborationActivities: normalizeCollaborationActivities(
      state.collaborationActivities,
      fallback.collaborationActivities
    ),
    collaborationChangeProposals: normalizeCollaborationChangeProposals(
      state.collaborationChangeProposals,
      fallback.collaborationChangeProposals
    ),
    materials: state.materials ?? fallback.materials,
    knowledgePages: normalizeKnowledgePages(state.knowledgePages, fallback.knowledgePages),
    messages: normalizeWorkspaceMessages(state.messages, fallback.messages),
    tasks: state.tasks ?? fallback.tasks,
    approvals: Array.isArray(state.approvals) ? state.approvals : fallback.approvals,
    dataTables: Array.isArray(state.dataTables) ? state.dataTables : fallback.dataTables,
    automationRules: Array.isArray(state.automationRules) ? state.automationRules : fallback.automationRules,
    scheduledTasks: Array.isArray(state.scheduledTasks) ? state.scheduledTasks : fallback.scheduledTasks,
    templates: Array.isArray(state.templates) ? state.templates : fallback.templates,
    ledger: normalizeLedgerItems(state.ledger, fallback.ledger)
  };
}
function normalizeChannels(channels, fallback, humanMembers) {
  if (!Array.isArray(channels)) {
    return fallback;
  }
  return channels.map((channel) => normalizeChannel(channel, humanMembers)).filter((channel) => channel !== null);
}
function normalizeChannel(channel, humanMembers) {
  if (!channel || typeof channel !== "object") {
    return null;
  }
  const candidate = channel;
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    return null;
  }
  const normalizedHumanMemberNames = uniqueNames(
    Array.isArray(candidate.humanMemberNames) ? candidate.humanMemberNames.filter((value) => typeof value === "string") : []
  );
  const fallbackHumanMemberNames = normalizedHumanMemberNames.length > 0 ? normalizedHumanMemberNames : humanMembers.slice(
    0,
    typeof candidate.humanMembers === "number" && Number.isFinite(candidate.humanMembers) ? Math.max(0, Math.round(candidate.humanMembers)) : humanMembers.length
  ).map((member) => member.name);
  return {
    name: candidate.name.trim(),
    kind: candidate.kind === "direct" ? "direct" : "group",
    humanMemberNames: fallbackHumanMemberNames,
    humanMembers: fallbackHumanMemberNames.length,
    employeeNames: uniqueNames(
      Array.isArray(candidate.employeeNames) ? candidate.employeeNames.filter((value) => typeof value === "string") : []
    )
  };
}
function createWorkspaceSkillRecord(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: `skill-${createOpaqueId()}`,
    name: input.name,
    description: input.description,
    files: normalizeWorkspaceSkillFiles(
      [
        {
          id: `skill-file-${createOpaqueId()}`,
          path: "SKILL.md",
          content: input.content ?? createDefaultSkillFileContent(input.name, input.description),
          createdAt: now,
          updatedAt: now
        }
      ],
      input.name,
      input.description
    ),
    sourceType: input.sourceType?.trim() || "manual",
    sourceUrl: input.sourceUrl?.trim() || void 0,
    configJson: input.configJson?.trim() || "{}",
    createdAt: now,
    updatedAt: now
  };
}
function ensureRequiredSkillFile(skill) {
  return {
    ...skill,
    files: normalizeWorkspaceSkillFiles(skill.files, skill.name, skill.description)
  };
}
function sortWorkspaceSkills(skills) {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" }));
}
function sortWorkspaceSkillFiles(files) {
  return [...files].sort((left, right) => {
    if (sameValue(left.path, "SKILL.md")) {
      return -1;
    }
    if (sameValue(right.path, "SKILL.md")) {
      return 1;
    }
    return left.path.localeCompare(right.path, "en-US", { sensitivity: "base" });
  });
}
function ensureBuiltinWorkspaceSkills(skills) {
  let nextSkills = [...skills];
  nextSkills = replaceBuiltinWorkspaceSkill(nextSkills, BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME, createBuiltinReturnOutputFilesSkill);
  nextSkills = replaceBuiltinWorkspaceSkill(nextSkills, BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME, createBuiltinWorkspaceContextSkill);
  nextSkills = replaceBuiltinWorkspaceSkill(nextSkills, BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME, createBuiltinUpdateChannelDocumentsSkill);
  nextSkills = replaceBuiltinWorkspaceSkill(nextSkills, BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME, createBuiltinGoogleWorkspaceCliSkill);
  for (const skill of createPredefinedAgentTemplateSkillRecords()) {
    nextSkills = replaceBuiltinWorkspaceSkill(nextSkills, skill.name, () => skill);
  }
  return sortWorkspaceSkills(nextSkills);
}
function createPredefinedAgentTemplateSkillRecords() {
  const seenKeys = /* @__PURE__ */ new Set();
  const skills = [];
  for (const template of SYSTEM_AGENT_TEMPLATE_PRESETS) {
    for (const recommendation of template.skillRecommendations) {
      const key = `${recommendation.sourceType}:${recommendation.sourceUrl}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      skills.push(createPredefinedAgentTemplateSkill(template, recommendation));
    }
  }
  return skills;
}
function isPredefinedAgentTemplateSkillName(name) {
  return SYSTEM_AGENT_TEMPLATE_PRESETS.some(
    (template) => template.skillRecommendations.some((recommendation) => sameValue(recommendation.key, name))
  );
}
function replaceBuiltinWorkspaceSkill(skills, builtinName, createBuiltin) {
  const existingSkill = skills.find((skill) => sameValue(skill.name, builtinName));
  const nextSkills = skills.filter((skill) => !sameValue(skill.name, builtinName));
  nextSkills.unshift(existingSkill ? mergeBuiltinWorkspaceSkill(existingSkill, createBuiltin()) : createBuiltin());
  return nextSkills;
}
function mergeBuiltinWorkspaceSkill(existingSkill, builtinSkill) {
  const existingSkillFile = existingSkill.files.find((file) => sameValue(file.path, "SKILL.md"));
  return {
    ...builtinSkill,
    id: existingSkill.id,
    createdAt: existingSkill.createdAt,
    updatedAt: existingSkill.updatedAt,
    files: builtinSkill.files.map(
      (file) => existingSkillFile && sameValue(file.path, "SKILL.md") ? {
        ...file,
        id: existingSkillFile.id,
        createdAt: existingSkillFile.createdAt,
        updatedAt: existingSkillFile.updatedAt
      } : file
    )
  };
}
function createUniqueWorkspaceSkillName(skills, baseName) {
  const trimmedBaseName = baseName.trim() || "New Skill";
  if (!skills.some((skill) => sameValue(skill.name, trimmedBaseName))) {
    return trimmedBaseName;
  }
  let counter = 2;
  while (skills.some((skill) => sameValue(skill.name, `${trimmedBaseName} ${counter}`))) {
    counter += 1;
  }
  return `${trimmedBaseName} ${counter}`;
}
function migrateLegacySkillIds(skills, skillPool, employeeName) {
  if (!Array.isArray(skills)) {
    return [];
  }
  const result = [];
  for (const skill of skills) {
    const normalized = normalizeLegacyAgentSkill(skill);
    if (!normalized) {
      continue;
    }
    const existing = skillPool.find(
      (item) => sameValue(item.name, normalized.name) && sameValue(item.description, normalized.description) && readSkillFileContent(item, "SKILL.md") === normalized.content
    );
    if (existing) {
      if (!result.includes(existing.id)) {
        result.push(existing.id);
      }
      continue;
    }
    const uniqueName = createUniqueWorkspaceSkillName(
      skillPool,
      skillPool.some((item) => sameValue(item.name, normalized.name)) ? `${normalized.name} (${employeeName})` : normalized.name
    );
    const workspaceSkill = createWorkspaceSkillRecord({
      name: uniqueName,
      description: normalized.description,
      content: normalized.content
    });
    skillPool.push(workspaceSkill);
    result.push(workspaceSkill.id);
  }
  return result;
}
function createBuiltinReturnOutputFilesSkillContent() {
  return `---
name: ${BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME}
description: ${BUILTIN_RETURN_OUTPUT_FILES_SKILL_DESCRIPTION}
---

# Return Output Files

Use this skill when your final answer should include generated files instead of only plain text.

## When to use it

- The user explicitly asks for a file, image, PDF, markdown note, or downloadable artifact
- The result is easier to consume as a file than as a pasted chat reply
- You generated a chart, report, draft, export, or other deliverable inside the current workDir

## Contract

- Write output files inside the current \`workDir\`
- Place generated files under \`runtime-output/artifacts/\`
- Do not reference absolute paths
- Do not reference files outside \`workDir\`
- Do not reply with only a file path in plain text

## Commands

\`\`\`bash
agent-space output text "Optional summary shown in the chat message."
agent-space output attach runtime-output/artifacts/chart.png --name chart.png --media-type image/png --text "Chart generated."
agent-space output validate
\`\`\`

## Rules

- Every file passed to \`agent-space output attach\` must already exist and be non-empty
- Keep \`text\` as the human-readable summary shown in chat
- Use \`name\` only when you want a different display name
- Use \`mediaType\` when the file type is not obvious from the extension
- If no file should be returned, use a normal text reply or \`agent-space output text\`

## Examples

- PNG: \`runtime-output/artifacts/preview.png\`
- Markdown: \`runtime-output/artifacts/summary.md\`
- PDF: \`runtime-output/artifacts/report.pdf\`
`;
}
function createBuiltinWorkspaceContextSkillContent() {
  return `---
name: ${BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME}
description: ${BUILTIN_WORKSPACE_CONTEXT_SKILL_DESCRIPTION}
---

# Workspace Context

Use this skill when the inline task prompt does not contain enough workspace facts and you need to query the current workspace safely.

## When to use it

- You need to confirm who someone is in the current workspace
- You need recent channel history before replying
- You need to check which documents exist in a channel
- You need a verifiable answer instead of guessing from incomplete prompt context

## Contract

- Use the shared \`agent-space workspace context ...\` commands
- Do not pass an agent name, user identity, or database path
- The runtime injects the current Agent context automatically
- Treat all returned data as workspace-scoped context, not real-world identity

## Commands

\`\`\`bash
agent-space workspace context list-entities --json
agent-space workspace context resolve-entity --query "\u4E2A\u4EBA\u52A9\u624B" --json
agent-space workspace context list-channels --json
agent-space workspace context search-messages --query "\u4EFB\u5929\u5802\u535A\u7269\u9986" --channel "tour visit" --json
agent-space workspace context list-documents --channel "tour visit" --json
\`\`\`

## Rules

- Use these commands only when the inline task context is not enough
- For simple questions like "Do you know X?", answer directly if the prompt already gives enough relationship facts
- Only describe entities, channels, messages, and documents that appear in the returned workspace context
- Do not infer hidden channels, user-private labels, or real-world identity from these results
- Prefer the narrowest query that answers the question instead of dumping everything
`;
}
function createBuiltinUpdateChannelDocumentsSkillContent() {
  return `---
name: ${BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME}
description: ${BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_DESCRIPTION}
---

# Update Channel Documents

Use this skill when your result should become a persistent shared channel document instead of only a one-off reply.

## When to use it

- The user explicitly asks you to create or update a channel document
- The result should stay in the channel as a long-lived working draft
- The content will likely be edited again by humans or other agents

## Output contract

\`\`\`bash
agent-space output document upsert --title "Research Notes" --content runtime-output/artifacts/research-notes.md --summary "Summarized interview findings."
agent-space output document replace-block --document-id channel-doc-123 --base-version-id channel-doc-version-456 --title "Research Notes" --block-id channel-doc-block-1 --base-revision 3 --content runtime-output/artifacts/updated-block.md
agent-space output document insert-after --document-id channel-doc-123 --base-version-id channel-doc-version-456 --title "Research Notes" --after-block-id channel-doc-block-1 --content runtime-output/artifacts/new-block.md
agent-space output document delete-block --document-id channel-doc-123 --base-version-id channel-doc-version-456 --title "Research Notes" --block-id channel-doc-block-1 --base-revision 3
agent-space output validate
\`\`\`

Referenced markdown files should live under \`runtime-output/artifacts/\`.

## Rules

- Put referenced markdown files under \`runtime-output/artifacts/\`
- Do not use absolute paths
- Do not reference files outside the current \`workDir\`
- Prefer updating the shared document instead of replying with a disposable summary
- If you do not want to modify documents, do not run an output document command
`;
}
function createBuiltinGoogleWorkspaceCliSkillContent() {
  return `---
name: ${BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME}
description: ${BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_DESCRIPTION}
---

# Google Workspace CLI

Use this skill when the current task includes Google Workspace channel documents, or when the user asks you to create a Google Sheet for the current channel.

## Contract

- For Google Sheets, run the official \`gws\` CLI in the current Agent runtime so you can use the real stdout in the same reply.
- Save Google Sheets JSON stdout under \`runtime-output/artifacts/sheets/*.json\`
- Register Sheets results with \`agent-space output sheets-result add ...\`, then run \`agent-space output validate\`
- For new Google Sheets, run \`gws drive files create\`, save the JSON stdout, register it with \`agent-space output external-document create-google-sheet ...\`, then run \`agent-space output validate\`
- For Google Docs, use \`agent-space output google-docs append-text ...\` or \`agent-space output google-docs batch-update ...\`, then run \`agent-space output validate\`
- Do not request, print, or store Google OAuth tokens
- Do not specify a credential, CLI binary path, or token environment variable
- AgentSpace validates permissions, injects delegated credentials, audits operation runs, and reports status

## Sheets Runtime Flow

Read example:

\`\`\`bash
gws sheets spreadsheets values get --format json --params '{"spreadsheetId":"google-file-id","range":"Sheet1!A1:Z20"}'
mkdir -p runtime-output/artifacts/sheets
# Save the JSON stdout from the previous gws command to runtime-output/artifacts/sheets/read.json.
agent-space output sheets-result add --document-id channel-doc-sheet-123 --operation read --range "Sheet1!A1:Z20" --result-json runtime-output/artifacts/sheets/read.json --summary "Read Sheet1 A1:Z20."
agent-space output validate
\`\`\`

For append/update/batch_update, run the matching \`gws\` Sheets command first, save the JSON result, then register it with \`agent-space output sheets-result add --operation append_rows|update_values|batch_update\`.

Create example:

\`\`\`bash
mkdir -p runtime-output/artifacts/sheets
gws drive files create --format json --params '{"fields":"id,name,webViewLink,mimeType,modifiedTime"}' --json '{"name":"Pipeline Forecast","mimeType":"application/vnd.google-apps.spreadsheet"}'
# Save the JSON stdout from the previous gws command to runtime-output/artifacts/sheets/create-sheet.json.
agent-space output external-document create-google-sheet --target-channel "sales" --title "Pipeline Forecast" --external-file-id "spreadsheet-id-from-gws" --external-url "webViewLink-from-gws" --summary "Agent-created forecast sheet." --gws-result-json runtime-output/artifacts/sheets/create-sheet.json
agent-space output validate
\`\`\`

Do not only paste the Google Sheets URL into the final reply. The sheet must be registered with \`external-document create-google-sheet\` so AgentSpace can add it to the channel cloud documents list, validate permissions, and audit the operation.

## Docs Runtime Flow

\`\`\`bash
mkdir -p runtime-output/artifacts/docs
# Save append text to runtime-output/artifacts/docs/summary.md.
agent-space output google-docs append-text --document-id channel-doc-google-doc-123 --intent "Append meeting summary" --text-file runtime-output/artifacts/docs/summary.md
# Save a JSON array of Docs batchUpdate requests to runtime-output/artifacts/docs/requests.json.
agent-space output google-docs batch-update --document-id channel-doc-google-doc-123 --intent "Apply structured Docs changes" --requests-json runtime-output/artifacts/docs/requests.json
agent-space output validate
\`\`\`

## Rules

- Use the AgentSpace channel document id in \`documentId\`, not the raw Google file id
- Keep \`intent\` specific enough for audit review
- Use \`requestSummary\` for risky writes when helpful
- Batch update payloads should match Google API request schemas; use smaller, explicit requests
- Mutating operations are audited and may require dry-run, review, or human approval as configured
- If the task does not require Google Workspace access, do not run Google Workspace output commands
`;
}
function normalizeActiveEmployees(employees, fallback, skillPool) {
  if (!Array.isArray(employees)) {
    return fallback;
  }
  return employees.map((employee) => normalizeActiveEmployee(employee, skillPool)).filter((employee) => employee !== null);
}
function normalizeActiveEmployee(employee, skillPool) {
  if (!employee || typeof employee !== "object") {
    return null;
  }
  const candidate = employee;
  if (typeof candidate.name !== "string" || typeof candidate.origin !== "string" || typeof candidate.summary !== "string" || typeof candidate.fit !== "string" || !Array.isArray(candidate.channels) || candidate.status !== "active") {
    return null;
  }
  return {
    name: candidate.name,
    role: typeof candidate.role === "string" ? candidate.role : "Agent",
    remarkName: typeof candidate.remarkName === "string" && candidate.remarkName.trim().length > 0 ? candidate.remarkName : candidate.name,
    ownerUserId: typeof candidate.ownerUserId === "string" && candidate.ownerUserId.trim().length > 0 ? candidate.ownerUserId : void 0,
    channelMemberAccess: normalizeEmployeeChannelMemberAccess(candidate),
    origin: candidate.origin,
    summary: candidate.summary,
    traits: Array.isArray(candidate.traits) ? candidate.traits.filter((item) => typeof item === "string") : [],
    fit: candidate.fit,
    skillIds: Array.isArray(candidate.skillIds) ? normalizeSkillIds(candidate.skillIds, skillPool) : migrateLegacySkillIds(candidate.skills, skillPool, candidate.name),
    channels: candidate.channels.filter((item) => typeof item === "string"),
    status: "active",
    instructions: typeof candidate.instructions === "string" ? candidate.instructions : ""
  };
}
function normalizeEmployeeChannelMemberAccess(candidate) {
  if (candidate.channelMemberAccess === "enabled" || candidate.channelMemberAccess === "disabled") {
    return candidate.channelMemberAccess;
  }
  return typeof candidate.ownerUserId === "string" && candidate.ownerUserId.trim().length > 0 ? "disabled" : "enabled";
}
function normalizeWorkspaceSkills(skills, fallback) {
  if (!Array.isArray(skills)) {
    return [];
  }
  const result = [];
  for (const skill of skills) {
    const normalized = normalizeWorkspaceSkill(skill);
    if (!normalized) {
      continue;
    }
    if (result.some((existing) => existing.id === normalized.id || sameValue(existing.name, normalized.name))) {
      continue;
    }
    result.push(normalized);
  }
  return result.length > 0 ? sortWorkspaceSkills(result) : fallback;
}
function normalizeWorkspaceSkill(skill) {
  if (!skill || typeof skill !== "object") {
    return null;
  }
  const candidate = skill;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) {
    return null;
  }
  return ensureRequiredSkillFile({
    id: typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id.trim() : `skill-${slugify(name)}-${createOpaqueId()}`,
    name,
    description: typeof candidate.description === "string" ? candidate.description.trim() : "",
    files: normalizeWorkspaceSkillFiles(candidate.files, name, typeof candidate.description === "string" ? candidate.description.trim() : ""),
    sourceType: typeof candidate.sourceType === "string" && candidate.sourceType.trim().length > 0 ? candidate.sourceType.trim() : "manual",
    sourceUrl: typeof candidate.sourceUrl === "string" && candidate.sourceUrl.trim().length > 0 ? candidate.sourceUrl.trim() : void 0,
    configJson: typeof candidate.configJson === "string" && candidate.configJson.trim().length > 0 ? candidate.configJson : "{}",
    createdAt: typeof candidate.createdAt === "string" && candidate.createdAt.trim().length > 0 ? candidate.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0 ? candidate.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
  });
}
function normalizeKnowledgePages(pages, fallback) {
  if (!Array.isArray(pages)) {
    return fallback;
  }
  return pages.filter(
    (page) => Boolean(page) && typeof page === "object" && typeof page.id === "string" && typeof page.title === "string"
  ).map((page) => ({
    id: page.id,
    parentId: typeof page.parentId === "string" ? page.parentId : null,
    title: page.title,
    contentMarkdown: typeof page.contentMarkdown === "string" ? page.contentMarkdown : "",
    sortOrder: typeof page.sortOrder === "number" ? page.sortOrder : 0,
    tags: Array.isArray(page.tags) ? page.tags.filter((tag) => typeof tag === "string") : [],
    createdBy: typeof page.createdBy === "string" ? page.createdBy : "",
    createdAt: typeof page.createdAt === "string" ? page.createdAt : nowTime(),
    updatedAt: typeof page.updatedAt === "string" ? page.updatedAt : nowTime(),
    assignmentMode: page.assignmentMode === "selected_agents" ? "selected_agents" : "all_agents",
    assignmentUpdatedAt: typeof page.assignmentUpdatedAt === "string" && page.assignmentUpdatedAt.trim().length > 0 ? page.assignmentUpdatedAt : void 0,
    assignmentUpdatedBy: typeof page.assignmentUpdatedBy === "string" && page.assignmentUpdatedBy.trim().length > 0 ? page.assignmentUpdatedBy : void 0,
    sourceAttachmentId: typeof page.sourceAttachmentId === "string" && page.sourceAttachmentId.trim().length > 0 ? page.sourceAttachmentId : void 0,
    sourceAttachmentStoredPath: typeof page.sourceAttachmentStoredPath === "string" && page.sourceAttachmentStoredPath.trim().length > 0 ? page.sourceAttachmentStoredPath : void 0,
    sourceChannelDocumentId: typeof page.sourceChannelDocumentId === "string" && page.sourceChannelDocumentId.trim().length > 0 ? page.sourceChannelDocumentId : void 0,
    sourceKnowledgeProposalId: typeof page.sourceKnowledgeProposalId === "string" && page.sourceKnowledgeProposalId.trim().length > 0 ? page.sourceKnowledgeProposalId : void 0,
    sourceApprovalId: typeof page.sourceApprovalId === "string" && page.sourceApprovalId.trim().length > 0 ? page.sourceApprovalId : void 0,
    sourceTaskQueueId: typeof page.sourceTaskQueueId === "string" && page.sourceTaskQueueId.trim().length > 0 ? page.sourceTaskQueueId : void 0,
    sourceAgentName: typeof page.sourceAgentName === "string" && page.sourceAgentName.trim().length > 0 ? page.sourceAgentName : void 0
  }));
}
function normalizeLedgerItems(ledger, fallback) {
  if (!Array.isArray(ledger)) {
    return fallback;
  }
  return ledger.map((entry) => normalizeLedgerItem(entry)).filter((entry) => entry !== null);
}
function normalizeLedgerItem(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const candidate = entry;
  if (typeof candidate.title !== "string" || typeof candidate.note !== "string") {
    return null;
  }
  const inferred = inferLegacyLedgerEntry(candidate.title, candidate.note);
  const data = normalizeLedgerData(candidate.data) ?? inferred?.data;
  return {
    title: candidate.title,
    note: candidate.note,
    code: typeof candidate.code === "string" && candidate.code.trim().length > 0 ? candidate.code : inferred?.code,
    data
  };
}
function normalizeLedgerData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return void 0;
  }
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    }
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function inferLegacyLedgerEntry(title, note) {
  const patterns = [
    { title: "Runtime \u7ED1\u5B9A", regex: /^(.+?) 已绑定到 (.+)。$/, code: "runtime.bound", keys: ["employee_name", "runtime_name"] },
    { title: "Runtime \u89E3\u7ED1", regex: /^(.+?) 已解绑 native runtime。$/, code: "runtime.unbound", keys: ["employee_name"] },
    { title: "Agent \u5DF2\u5220\u9664", regex: /^(.+?) 已从组织中移除，并清理绑定、任务和工作区域。$/, code: "agent.deleted", keys: ["employee_name"] },
    { title: "Agent \u6307\u4EE4\u66F4\u65B0", regex: /^(.+?) 的 instructions 已更新。$/, code: "agent.instructions_updated", keys: ["employee_name"] },
    { title: "Skill \u521B\u5EFA", regex: /^(.+?) 已加入工作区技能库。$/, code: "skill.created", keys: ["skill_name"] },
    { title: "Skill \u66F4\u65B0", regex: /^(.+?) 的元信息已更新。$/, code: "skill.updated", keys: ["skill_name"] },
    { title: "Skill \u5220\u9664", regex: /^(.+?) 已从工作区技能库移除，并解除所有 agent 绑定。$/, code: "skill.deleted", keys: ["skill_name"] },
    { title: "Skill \u6587\u4EF6\u66F4\u65B0", regex: /^(.+?) 的 (.+) 已更新。$/, code: "skill.file_updated", keys: ["skill_name", "file_path"] },
    { title: "Skill \u6587\u4EF6\u521B\u5EFA", regex: /^(.+?) 新增文件 (.+)。$/, code: "skill.file_created", keys: ["skill_name", "file_path"] },
    { title: "Skill \u6587\u4EF6\u5220\u9664", regex: /^(.+?) 的 (.+) 已删除。$/, code: "skill.file_deleted", keys: ["skill_name", "file_path"] },
    { title: "Agent Skills \u7ED1\u5B9A\u66F4\u65B0", regex: /^(.+?) 的 skills 绑定已更新，共 (\d+) 项。$/, code: "agent.skills_updated", keys: ["employee_name", "skill_count"] },
    { title: "\u8054\u7CFB\u4EBA\u79C1\u804A\u5165\u961F", regex: /^你向 (.+?) 发起了一条私聊，已转交 Agent 执行。$/, code: "contact.queued", keys: ["contact_name"] },
    { title: "\u9891\u9053\u521B\u5EFA", regex: /^已创建频道 (.+?)，成员 (\d+) 名人类 \/ (\d+) 名 agent。$/, code: "channel.created", keys: ["channel_name", "human_count", "agent_count"] },
    { title: "\u9891\u9053\u5220\u9664", regex: /^频道 (.+?) 已删除，并清理相关消息、任务和成员绑定。$/, code: "channel.deleted", keys: ["channel_name"] },
    { title: "\u9891\u9053\u91CD\u547D\u540D", regex: /^频道 (.+?) 已重命名为 (.+)。$/, code: "channel.renamed", keys: ["previous_name", "next_name"] },
    { title: "\u539F\u6599\u8865\u5145", regex: /^新增原料来源 (.+?)，当前状态：(.+)。$/, code: "material.added", keys: ["source", "status"] },
    { title: "\u6587\u4EF6\u5BFC\u5165", regex: /^已导入文件 (.+?)，落盘到 (.+?)，后续可用于切片和员工生成。$/, code: "material.imported", keys: ["source", "stored_name"] },
    { title: "\u539F\u6599\u89E3\u6790", regex: /^文件 (.+?) 已完成首轮解析，可进入切片或员工生成流程。$/, code: "material.parsed", keys: ["source"] },
    { title: "\u7FA4\u804A\u6D88\u606F", regex: /^(.+?) 在 (.+?) 发送了一条普通消息，未触发任何 Agent。$/, code: "channel.message", keys: ["speaker", "channel_name"] },
    { title: "\u7FA4\u804A mention", regex: /^(.+?) 在 (.+?) 定向 @了 (.+?)，已分发给 (\d+) 个 Agent。$/, code: "channel.mention_dispatched", keys: ["speaker", "channel_name", "mentions", "queued_count"] },
    { title: "\u7FA4\u804A mention", regex: /^(.+?) 在 (.+?) @了 (.+?)，但目标 Agent 当前不可执行。$/, code: "channel.mention_unavailable", keys: ["speaker", "channel_name", "mentions"] },
    { title: "\u5458\u5DE5\u76F4\u52A0\u5165\u7EC4", regex: /^(.+?) 已直接入组，等待后续手动加入频道。$/, code: "employee.created", keys: ["employee_name"] },
    { title: "\u4EFB\u52A1\u521B\u5EFA", regex: /^(.+?) 已在 (.+?) 接收任务：(.+)。$/, code: "task.created", keys: ["assignee", "channel_name", "task_title"] },
    { title: "\u4EFB\u52A1\u5165\u961F", regex: /^(.+?) 已进入 native queue，等待 (.+?) 执行。$/, code: "task.queued", keys: ["task_title", "runtime_name"] },
    { title: "\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0", regex: /^任务 (.+?) 已更新为 (.+)。$/, code: "task.status_updated", keys: ["task_title", "status"] }
  ];
  for (const pattern of patterns) {
    if (pattern.title !== title) {
      continue;
    }
    const match = note.match(pattern.regex);
    if (!match) {
      continue;
    }
    const data = {};
    for (const [index, key] of pattern.keys.entries()) {
      data[key] = match[index + 1] ?? "";
    }
    return { code: pattern.code, data };
  }
  return null;
}
function inferLegacyWorkspaceMessage(speaker, summary) {
  const patterns = [
    { speaker: /^(?:Atlas · 运行时协调器|系统提示)$/, regex: /^(.+?) 已绑定到 native runtime：(.+?)。$/, code: "runtime.bound", keys: ["employee_name", "runtime_name"] },
    { speaker: /^(?:Atlas · 运行时协调器|系统提示)$/, regex: /^(.+?) 已解除 native runtime 绑定。$/, code: "runtime.unbound", keys: ["employee_name"] },
    { speaker: /^(?:Atlas · 运行时协调器|系统提示)$/, regex: /^(.+?) 已删除，相关容器绑定与工作区域已清理。$/, code: "agent.deleted", keys: ["employee_name"] },
    { speaker: /^系统通知$/, regex: /^新频道 (.+?) 已创建，可立即接入数字员工与协作流。$/, code: "channel.created_notice", keys: ["channel_name"] },
    { speaker: /^系统通知$/, regex: /^频道 (.+?) 已重命名为 (.+?)。$/, code: "channel.renamed_notice", keys: ["previous_name", "next_name"] },
    { speaker: /^(?:Atlas · 运行时协调器|系统提示)$/, regex: /^(.+?) 当前没有绑定可执行 runtime，无法响应这次 @。$/, code: "mention.unavailable", keys: ["agent_names"] },
    { speaker: /^(?:Atlas · 任务分派器|系统提示)$/, regex: /^新任务已分派给 (.+?)：(.+?)。$/, code: "task.assigned_notice", keys: ["assignee", "task_title"] },
    { speaker: /^(?:Atlas · 运行时协调器|系统提示)$/, regex: /^任务 (.+?) 已进入 native queue，目标 runtime：(.+?)。$/, code: "task.queued_notice", keys: ["task_title", "runtime_name"] },
    { speaker: /^(?:Atlas · 任务分派器|系统提示)$/, regex: /^任务 (.+?) 当前状态已更新为 (.+?)。$/, code: "task.status_notice", keys: ["task_title", "status"] },
    { speaker: /^(?:Atlas · 文档协调器|系统提示)$/, regex: /^群文档《(.+?)》已创建。$/, code: "channel_document.created_notice", keys: ["document_title"] },
    { speaker: /^(?:Atlas · 文档协调器|系统提示)$/, regex: /^群文档《(.+?)》已更新。(?: 摘要：(.+))?$/, code: "channel_document.updated_notice", keys: ["document_title", "summary"] },
    { speaker: /^(?:Atlas · 文档协调器|系统提示)$/, regex: /^群文档《(.+?)》已归档。$/, code: "channel_document.archived_notice", keys: ["document_title"] },
    { regex: /^思考中$/, code: "agent.pending", keys: [] }
  ];
  for (const pattern of patterns) {
    if (pattern.speaker && !pattern.speaker.test(speaker)) {
      continue;
    }
    const match = summary.match(pattern.regex);
    if (!match) {
      continue;
    }
    const data = {};
    for (const [index, key] of pattern.keys.entries()) {
      data[key] = match[index + 1] ?? "";
    }
    if (pattern.code === "agent.pending") {
      data.agent_name = speaker;
    }
    return { code: pattern.code, data: Object.keys(data).length > 0 ? data : void 0 };
  }
  return null;
}
function normalizeWorkspaceSkillFiles(files, skillName, skillDescription) {
  const result = [];
  if (Array.isArray(files)) {
    for (const file of files) {
      const normalized = normalizeWorkspaceSkillFile(file);
      if (!normalized) {
        continue;
      }
      if (result.some((existing) => existing.id === normalized.id || sameValue(existing.path, normalized.path))) {
        continue;
      }
      result.push(normalized);
    }
  }
  if (!result.some((file) => sameValue(file.path, "SKILL.md"))) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    result.unshift({
      id: `skill-file-${createOpaqueId()}`,
      path: "SKILL.md",
      content: createDefaultSkillFileContent(skillName, skillDescription),
      createdAt: now,
      updatedAt: now
    });
  }
  return sortWorkspaceSkillFiles(result);
}
function normalizeWorkspaceSkillFile(file) {
  if (!file || typeof file !== "object") {
    return null;
  }
  const candidate = file;
  const path = normalizeSkillFilePath(candidate.path);
  if (!path) {
    return null;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id.trim() : `skill-file-${createOpaqueId()}`,
    path,
    content: typeof candidate.content === "string" ? candidate.content : "",
    createdAt: typeof candidate.createdAt === "string" && candidate.createdAt.trim().length > 0 ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0 ? candidate.updatedAt : now
  };
}
function normalizeLegacyAgentSkill(skill) {
  if (!skill || typeof skill !== "object") {
    return null;
  }
  const candidate = skill;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) {
    return null;
  }
  const description = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  return {
    name,
    description,
    content: createLegacySkillFileContent({
      name,
      description,
      category: typeof candidate.category === "string" ? candidate.category.trim() : "",
      level: typeof candidate.level === "string" ? candidate.level.trim() : "",
      enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true
    })
  };
}
function normalizeDirectConversations(conversations, fallback) {
  if (!Array.isArray(conversations)) {
    return fallback;
  }
  return sortDirectConversations(
    conversations.map((thread) => normalizeDirectConversation(thread)).filter((thread) => thread !== null)
  );
}
function normalizeDirectConversation(thread) {
  if (!thread || typeof thread !== "object") {
    return null;
  }
  const candidate = thread;
  if (typeof candidate.contactId !== "string") {
    return null;
  }
  return {
    contactId: candidate.contactId,
    humanMemberName: typeof candidate.humanMemberName === "string" && candidate.humanMemberName.length > 0 ? candidate.humanMemberName : void 0,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    sessionId: typeof candidate.sessionId === "string" && candidate.sessionId.length > 0 ? candidate.sessionId : void 0,
    workDir: typeof candidate.workDir === "string" && candidate.workDir.length > 0 ? candidate.workDir : void 0
  };
}
function normalizeConversationExecutionWorkspaces(workspaces, fallback) {
  if (!Array.isArray(workspaces)) {
    return fallback;
  }
  return [...workspaces].map((workspace) => normalizeConversationExecutionWorkspace(workspace)).filter((workspace) => workspace !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeConversationExecutionWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") {
    return null;
  }
  const candidate = workspace;
  const channelName = typeof candidate.channelName === "string" ? candidate.channelName : "";
  const agentId = typeof candidate.agentId === "string" ? candidate.agentId : "";
  const conversationKind = candidate.conversationKind === "direct" || candidate.conversationKind === "group" ? candidate.conversationKind : typeof candidate.contactId === "string" && candidate.contactId.length > 0 ? "direct" : "group";
  if (!channelName || !agentId) {
    return null;
  }
  const conversationKey = typeof candidate.conversationKey === "string" && candidate.conversationKey.length > 0 ? candidate.conversationKey : `${conversationKind}:${channelName}:${agentId}`;
  return {
    conversationKey,
    conversationKind,
    channelName,
    agentId,
    contactId: typeof candidate.contactId === "string" && candidate.contactId.length > 0 ? candidate.contactId : void 0,
    humanMemberName: typeof candidate.humanMemberName === "string" && candidate.humanMemberName.length > 0 ? candidate.humanMemberName : void 0,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    lastTaskQueueId: typeof candidate.lastTaskQueueId === "string" && candidate.lastTaskQueueId.length > 0 ? candidate.lastTaskQueueId : void 0,
    sessionId: typeof candidate.sessionId === "string" && candidate.sessionId.length > 0 ? candidate.sessionId : void 0,
    workDir: typeof candidate.workDir === "string" && candidate.workDir.length > 0 ? candidate.workDir : void 0,
    lastError: typeof candidate.lastError === "string" && candidate.lastError.length > 0 ? candidate.lastError : void 0,
    autoContinuation: normalizeConversationAutoContinuation(candidate.autoContinuation)
  };
}
function normalizeConversationAutoContinuation(input) {
  if (!input || typeof input !== "object") {
    return void 0;
  }
  const candidate = input;
  if (candidate.mode !== "until" || candidate.status !== "active" && candidate.status !== "expired" && candidate.status !== "stopped" || typeof candidate.startedAt !== "string" || typeof candidate.until !== "string" || typeof candidate.instruction !== "string") {
    return void 0;
  }
  return {
    mode: "until",
    status: candidate.status,
    startedAt: candidate.startedAt,
    until: candidate.until,
    instruction: candidate.instruction,
    requestedByUserId: typeof candidate.requestedByUserId === "string" && candidate.requestedByUserId.length > 0 ? candidate.requestedByUserId : void 0,
    requestedByDisplayName: typeof candidate.requestedByDisplayName === "string" && candidate.requestedByDisplayName.length > 0 ? candidate.requestedByDisplayName : void 0,
    sourceMessageId: typeof candidate.sourceMessageId === "string" && candidate.sourceMessageId.length > 0 ? candidate.sourceMessageId : void 0,
    iteration: typeof candidate.iteration === "number" && Number.isFinite(candidate.iteration) ? candidate.iteration : 0,
    lastContinuedAt: typeof candidate.lastContinuedAt === "string" && candidate.lastContinuedAt.length > 0 ? candidate.lastContinuedAt : void 0
  };
}
function normalizeWorkspaceMessages(messages, fallback) {
  if (!Array.isArray(messages)) {
    return fallback;
  }
  return messages.map((message) => normalizeWorkspaceMessage(message)).filter((message) => message !== null);
}
function normalizeWorkspaceMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  const candidate = message;
  if (typeof candidate.speaker !== "string" || typeof candidate.summary !== "string" || candidate.role !== "human" && candidate.role !== "agent") {
    return null;
  }
  const inferred = inferLegacyWorkspaceMessage(candidate.speaker, candidate.summary);
  return {
    id: typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id.trim() : `message-${createOpaqueId()}`,
    channel: typeof candidate.channel === "string" ? candidate.channel : void 0,
    speaker: candidate.speaker,
    speakerUserId: typeof candidate.speakerUserId === "string" && candidate.speakerUserId.trim().length > 0 ? candidate.speakerUserId.trim() : void 0,
    role: candidate.role,
    time: typeof candidate.time === "string" && candidate.time.trim().length > 0 ? candidate.time : nowTime(),
    summary: candidate.summary,
    code: typeof candidate.code === "string" && candidate.code.trim().length > 0 ? candidate.code : inferred?.code,
    data: normalizeLedgerData(candidate.data) ?? inferred?.data,
    status: candidate.status === "error" ? "error" : candidate.status === "pending" ? "pending" : "completed",
    kind: candidate.kind === "process" ? "process" : "message",
    processType: typeof candidate.processType === "string" ? candidate.processType : void 0,
    tool: typeof candidate.tool === "string" ? candidate.tool : void 0,
    attachments: normalizeMessageAttachments(candidate.attachments),
    mentions: normalizeMessageMentions(candidate.mentions),
    acknowledgements: normalizeMessageAcknowledgements(candidate.acknowledgements),
    pinned: candidate.pinned === true ? true : void 0,
    pinnedAt: candidate.pinned === true && typeof candidate.pinnedAt === "string" ? candidate.pinnedAt : void 0,
    replyToMessageId: typeof candidate.replyToMessageId === "string" && candidate.replyToMessageId.length > 0 ? candidate.replyToMessageId : void 0
  };
}
function normalizeMessageAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return void 0;
  }
  const normalized = attachments.map((attachment) => normalizeMessageAttachment(attachment)).filter((attachment) => attachment !== null);
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeMessageAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }
  const candidate = attachment;
  if (typeof candidate.id !== "string" || typeof candidate.fileName !== "string" || typeof candidate.mediaType !== "string" || typeof candidate.sizeBytes !== "number" || typeof candidate.storedPath !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    fileName: candidate.fileName,
    mediaType: candidate.mediaType,
    sizeBytes: candidate.sizeBytes,
    kind: candidate.kind === "image" ? "image" : "file",
    storedPath: candidate.storedPath,
    storageProvider: candidate.storageProvider === "r2" || candidate.storageProvider === "s3" || candidate.storageProvider === "local" ? candidate.storageProvider : void 0,
    storageBucket: normalizeOptionalString2(candidate.storageBucket),
    storageRegion: normalizeOptionalString2(candidate.storageRegion),
    storageEndpoint: normalizeOptionalString2(candidate.storageEndpoint),
    storageKey: normalizeOptionalString2(candidate.storageKey),
    storageUrl: normalizeOptionalString2(candidate.storageUrl),
    sha256: normalizeOptionalString2(candidate.sha256),
    deletedAt: typeof candidate.deletedAt === "string" && candidate.deletedAt.trim().length > 0 ? candidate.deletedAt : void 0,
    deletedByUserId: typeof candidate.deletedByUserId === "string" && candidate.deletedByUserId.trim().length > 0 ? candidate.deletedByUserId : void 0,
    deletedByDisplayName: typeof candidate.deletedByDisplayName === "string" && candidate.deletedByDisplayName.trim().length > 0 ? candidate.deletedByDisplayName : void 0
  };
}
function normalizeOptionalString2(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function normalizeMessageMentions(mentions) {
  if (!Array.isArray(mentions)) {
    return void 0;
  }
  const normalized = mentions.map((mention) => normalizeMessageMention(mention)).filter((mention) => mention !== null);
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeMessageMention(mention) {
  if (!mention || typeof mention !== "object") {
    return null;
  }
  const candidate = mention;
  if (typeof candidate.label !== "string" || typeof candidate.token !== "string") {
    return null;
  }
  if (candidate.mentionType === "human") {
    if (typeof candidate.humanId !== "string") {
      return null;
    }
    return {
      humanId: candidate.humanId,
      label: candidate.label,
      token: candidate.token,
      mentionType: "human",
      inChannel: candidate.inChannel === true
    };
  }
  if (typeof candidate.agentId !== "string") {
    return null;
  }
  return {
    agentId: candidate.agentId,
    label: candidate.label,
    token: candidate.token,
    mentionType: "agent",
    inChannel: candidate.inChannel === true
  };
}
function normalizeMessageAcknowledgements(acknowledgements) {
  if (!Array.isArray(acknowledgements)) {
    return void 0;
  }
  const normalized = acknowledgements.map((acknowledgement) => normalizeMessageAcknowledgement(acknowledgement)).filter((acknowledgement) => acknowledgement !== null);
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeMessageAcknowledgement(acknowledgement) {
  if (!acknowledgement || typeof acknowledgement !== "object") {
    return null;
  }
  const candidate = acknowledgement;
  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0 || typeof candidate.acknowledgedAt !== "string" || candidate.acknowledgedAt.trim().length === 0) {
    return null;
  }
  return {
    userId: typeof candidate.userId === "string" && candidate.userId.trim().length > 0 ? candidate.userId : void 0,
    label: candidate.label.trim(),
    acknowledgedAt: candidate.acknowledgedAt
  };
}
function sortDirectConversations(threads) {
  return [...threads].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}
function createDefaultSkillFileContent(name, description) {
  const skillName = slugify(name);
  const summary = description || `Use when Codex should apply the ${name} workflow.`;
  return `---
name: ${skillName}
description: ${summary}
---

# ${name}

Describe the workflow, constraints, and reusable resources for this skill here.
`;
}
function createLegacySkillFileContent(input) {
  const metadataLines = [
    input.category ? `- Legacy category: ${input.category}` : "",
    input.level ? `- Legacy level: ${input.level}` : "",
    input.enabled ? "" : "- Legacy state: disabled"
  ].filter(Boolean);
  return `---
name: ${slugify(input.name)}
description: ${input.description || `Use when Codex should apply the ${input.name} workflow.`}
---

# ${input.name}

${input.description || "Migrated from the previous agent-local skill configuration."}

${metadataLines.length > 0 ? `## Migration Notes

${metadataLines.join("\n")}
` : ""}`;
}
function createBuiltinReturnOutputFilesSkill() {
  return createWorkspaceSkillRecord({
    name: BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME,
    description: BUILTIN_RETURN_OUTPUT_FILES_SKILL_DESCRIPTION,
    content: createBuiltinReturnOutputFilesSkillContent(),
    sourceType: "builtin"
  });
}
function createBuiltinWorkspaceContextSkill() {
  return createWorkspaceSkillRecord({
    name: BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME,
    description: BUILTIN_WORKSPACE_CONTEXT_SKILL_DESCRIPTION,
    content: createBuiltinWorkspaceContextSkillContent(),
    sourceType: "builtin"
  });
}
function createBuiltinUpdateChannelDocumentsSkill() {
  return createWorkspaceSkillRecord({
    name: BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME,
    description: BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_DESCRIPTION,
    content: createBuiltinUpdateChannelDocumentsSkillContent(),
    sourceType: "builtin"
  });
}
function createBuiltinGoogleWorkspaceCliSkill() {
  return createWorkspaceSkillRecord({
    name: BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME,
    description: BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_DESCRIPTION,
    content: createBuiltinGoogleWorkspaceCliSkillContent(),
    sourceType: "builtin"
  });
}
function createPredefinedAgentTemplateSkill(template, recommendation) {
  const source = findPreloadedAgentTemplateSkillSource({
    key: recommendation.key,
    sourceType: recommendation.sourceType,
    sourceUrl: recommendation.sourceUrl
  });
  if (!source) {
    throw new Error(`Missing preloaded source snapshot for agent template skill "${recommendation.key}".`);
  }
  const skill = createWorkspaceSkillRecord({
    name: source.name,
    description: source.description,
    content: source.files.find((file) => sameValue(file.path, "SKILL.md"))?.content,
    sourceType: recommendation.sourceType,
    sourceUrl: recommendation.sourceUrl,
    configJson: JSON.stringify({
      provider: "system-agent-template",
      templateId: template.id,
      templateVersion: template.version,
      requirement: recommendation.requirement,
      sourceType: recommendation.sourceType,
      sourceUrl: recommendation.sourceUrl,
      resolvedSourceUrl: source.resolvedSourceUrl,
      resolvedCommit: source.resolvedCommit,
      sourcePath: source.sourcePath
    })
  });
  const now = skill.createdAt;
  skill.files = normalizeWorkspaceSkillFiles(
    source.files.map((file) => ({
      id: `skill-file-${createOpaqueId()}`,
      path: file.path,
      content: file.content,
      createdAt: now,
      updatedAt: now
    })),
    skill.name,
    skill.description
  );
  return skill;
}

// ../services/src/shared/state-io.ts
function getWorkspaceAttachmentsDirPath2(workspaceId = DEFAULT_WORKSPACE_ID) {
  return getWorkspaceAttachmentsDirPath(workspaceId);
}
function ensureWorkspaceStateSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  return readWorkspaceStateSnapshotSync(workspaceId);
}
function readWorkspaceStateSnapshotSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  ensureWorkspaceRecordForStateSync(workspaceId);
  const stored = ensureWorkspaceStateRecordSync(createDefaultWorkspaceState(), workspaceId);
  const storedVersion = readWorkspaceStateVersion(stored);
  const snapshot = normalizeWorkspaceState(stored);
  ensureChannelDocumentAccessSeeds(snapshot);
  if (storedVersion !== void 0) {
    Object.defineProperty(snapshot, WORKSPACE_STATE_VERSION, {
      value: storedVersion,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return snapshot;
}
function readWorkspaceStateSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  return readWorkspaceStateSnapshotSync(workspaceId);
}
function writeWorkspaceStateSync(state, workspaceId = DEFAULT_WORKSPACE_ID, options) {
  ensureWorkspaceRecordForStateSync(workspaceId);
  const normalized = normalizeWorkspaceState(state);
  ensureChannelDocumentAccessSeeds(normalized);
  persistCoreWorkspaceStorage(normalized, workspaceId);
  const written = writeWorkspaceStateRecordSync(normalized, workspaceId, {
    expectedVersion: readWorkspaceStateVersion(state),
    skipVersionCheck: options?.skipVersionCheck
  });
  initializeWorkspaceSkillStorageIfEmpty(written, workspaceId);
  return written;
}
function persistCoreWorkspaceStorage(state, workspaceId = DEFAULT_WORKSPACE_ID) {
  replaceStoredChannelsSync(state.channels, workspaceId);
  replaceStoredEmployeesSync(state.activeEmployees, workspaceId);
  replaceStoredTasksSync(state.tasks, workspaceId);
  replaceStoredAttachmentsSync(state, workspaceId);
}
function ensureWorkspaceRecordForStateSync(workspaceId) {
  if (readWorkspaceSync(workspaceId)) {
    return;
  }
  createWorkspaceSync({
    id: workspaceId,
    slug: workspaceId,
    name: workspaceId === DEFAULT_WORKSPACE_ID ? "Agent Space" : workspaceId,
    createdBy: "system"
  });
}
function initializeWorkspaceSkillStorageIfEmpty(state, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (listStoredWorkspaceSkillsSync(workspaceId).length > 0) {
    return;
  }
  replaceStoredWorkspaceSkillsSync(state.skills, workspaceId);
  replaceStoredAgentSkillAssignmentsSync(
    state.activeEmployees.map((employee) => ({
      employeeName: employee.name,
      skillIds: employee.skillIds
    })),
    workspaceId
  );
}

// ../services/src/skills/skills.ts
var BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME2 = "return-output-files";
var BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME2 = "workspace-context";
var BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME2 = "update-channel-documents";
var BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME2 = "google-workspace-cli";
function isSystemSkillName(name) {
  return sameValue(name, BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME2) || sameValue(name, BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME2) || sameValue(name, BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME2) || sameValue(name, BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME2) || isPredefinedAgentTemplateSkillName(name);
}
function listWorkspaceSkillsSync(workspaceId) {
  return ensurePredefinedAgentTemplateSkillsSync(workspaceId);
}
function ensurePredefinedAgentTemplateSkillsSync(workspaceId) {
  let storedSkills = listStoredWorkspaceSkillsSync(workspaceId);
  let changed = false;
  for (const expectedSkill of createPredefinedAgentTemplateSkillRecords()) {
    const existingSkill = findPredefinedAgentTemplateSkill(storedSkills, expectedSkill);
    if (!existingSkill) {
      createStoredWorkspaceSkillSync(expectedSkill, workspaceId);
      storedSkills = [...storedSkills, expectedSkill];
      changed = true;
      continue;
    }
    if (syncPredefinedAgentTemplateSkill(existingSkill, expectedSkill, workspaceId)) {
      changed = true;
    }
  }
  if (changed) {
    storedSkills = listStoredWorkspaceSkillsSync(workspaceId);
  }
  ensurePredefinedAgentTemplateSkillsInStateSnapshotSync(storedSkills, workspaceId);
  return storedSkills;
}
function createWorkspaceSkillSync(input, workspaceId) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Skill name is required.");
  }
  if (listWorkspaceSkillsSync(workspaceId).some((skill2) => sameValue(skill2.name, name))) {
    throw new Error(`Skill "${name}" already exists.`);
  }
  const state = ensureWorkspaceStateSync(workspaceId);
  const skill = createWorkspaceSkillRecord({
    name,
    description: input.description?.trim() ?? "",
    content: input.content,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    configJson: input.configJson
  });
  const storedSkill = createStoredWorkspaceSkillSync(skill, workspaceId);
  state.skills.unshift(storedSkill);
  state.ledger.unshift({
    title: "Skill created",
    note: `${name} was added to the workspace skill library.`
  });
  writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
  return storedSkill;
}
function updateWorkspaceSkillSync(input, workspaceId) {
  const skill = requireStoredSkill(input.skillId, workspaceId);
  if (isBuiltinSkill(skill.name)) {
    throw new Error(`${skill.name} \u662F\u7CFB\u7EDF\u9884\u5B9A\u4E49 skill\uFF0C\u4E0D\u80FD\u7F16\u8F91\u3002`);
  }
  const nextName = typeof input.name === "string" ? input.name.trim() : skill.name;
  if (!nextName) {
    throw new Error("Skill name is required.");
  }
  if (listWorkspaceSkillsSync(workspaceId).some((item) => item.id !== skill.id && sameValue(item.name, nextName))) {
    throw new Error(`Skill "${nextName}" already exists.`);
  }
  const state = ensureWorkspaceStateSync(workspaceId);
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const nextDescription = typeof input.description === "string" ? input.description.trim() : skill.description;
  const storedSkill = updateStoredWorkspaceSkillMetaSync({
    skillId: skill.id,
    name: nextName,
    description: nextDescription,
    sourceType: input.sourceType ?? skill.sourceType,
    sourceUrl: input.sourceUrl ?? skill.sourceUrl,
    configJson: input.configJson ?? skill.configJson,
    updatedAt
  }, workspaceId);
  if (!storedSkill) {
    throw new Error(`Skill "${input.skillId}" does not exist.`);
  }
  skill.name = storedSkill.name;
  skill.description = storedSkill.description;
  skill.sourceType = storedSkill.sourceType;
  skill.sourceUrl = storedSkill.sourceUrl;
  skill.configJson = storedSkill.configJson;
  skill.updatedAt = storedSkill.updatedAt;
  skill.files = ensureRequiredSkillFile(storedSkill).files;
  state.ledger.unshift({
    title: "Skill updated",
    note: `${skill.name} metadata was updated.`
  });
  replaceStateSkillSnapshot(state, skill.id, skill);
  writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
  return skill;
}
function readWorkspaceSkillSync(skillId, workspaceId) {
  return readStoredWorkspaceSkillSync(skillId, workspaceId);
}
function upsertWorkspaceSkillFileSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const skill = requireStoredSkill(input.skillId, workspaceId);
  if (isBuiltinSkill(skill.name)) {
    throw new Error(`${skill.name} \u662F\u7CFB\u7EDF\u9884\u5B9A\u4E49 skill\uFF0C\u4E0D\u80FD\u7F16\u8F91\u6587\u4EF6\u3002`);
  }
  const path = normalizeSkillFilePath(input.path);
  if (!path) {
    throw new Error("File path is required.");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existingById = input.fileId ? skill.files.find((file2) => file2.id === input.fileId) : void 0;
  const existingByPath = skill.files.find((file2) => sameValue(file2.path, path));
  if (existingById) {
    if (existingByPath && existingByPath.id !== existingById.id) {
      throw new Error(`File "${path}" already exists in this skill.`);
    }
    const storedSkill2 = upsertStoredWorkspaceSkillFileSync({
      skillId: skill.id,
      file: {
        id: existingById.id,
        path,
        content: input.content,
        createdAt: existingById.createdAt,
        updatedAt: now
      },
      skillUpdatedAt: now
    }, workspaceId);
    if (!storedSkill2) {
      throw new Error(`Skill "${input.skillId}" does not exist.`);
    }
    const storedFile = storedSkill2.files.find((file2) => file2.id === existingById.id);
    if (!storedFile) {
      throw new Error(`Skill file "${existingById.id}" does not exist.`);
    }
    existingById.path = storedFile.path;
    existingById.content = storedFile.content;
    existingById.updatedAt = storedFile.updatedAt;
    skill.updatedAt = storedSkill2.updatedAt;
    state.ledger.unshift({
      title: "Skill file updated",
      note: `${skill.name} file ${path} was updated.`
    });
    replaceStateSkillSnapshot(state, skill.id, skill);
    writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
    return existingById;
  }
  if (existingByPath) {
    const storedSkill2 = upsertStoredWorkspaceSkillFileSync({
      skillId: skill.id,
      file: {
        id: existingByPath.id,
        path,
        content: input.content,
        createdAt: existingByPath.createdAt,
        updatedAt: now
      },
      skillUpdatedAt: now
    }, workspaceId);
    if (!storedSkill2) {
      throw new Error(`Skill "${input.skillId}" does not exist.`);
    }
    const storedFile = storedSkill2.files.find((file2) => file2.id === existingByPath.id);
    if (!storedFile) {
      throw new Error(`File "${path}" already exists in this skill.`);
    }
    existingByPath.content = storedFile.content;
    existingByPath.updatedAt = storedFile.updatedAt;
    skill.updatedAt = storedSkill2.updatedAt;
    state.ledger.unshift({
      title: "Skill file updated",
      note: `${skill.name} file ${path} was updated.`
    });
    replaceStateSkillSnapshot(state, skill.id, skill);
    writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
    return existingByPath;
  }
  const file = {
    id: `skill-file-${createOpaqueId()}`,
    path,
    content: input.content,
    createdAt: now,
    updatedAt: now
  };
  const storedSkill = upsertStoredWorkspaceSkillFileSync({
    skillId: skill.id,
    file,
    skillUpdatedAt: now
  }, workspaceId);
  if (!storedSkill) {
    throw new Error(`Skill "${input.skillId}" does not exist.`);
  }
  skill.files = normalizeWorkspaceSkillFiles(storedSkill.files, storedSkill.name, storedSkill.description);
  skill.updatedAt = storedSkill.updatedAt;
  state.ledger.unshift({
    title: "Skill file created",
    note: `${skill.name} added file ${path}.`
  });
  replaceStateSkillSnapshot(state, skill.id, skill);
  writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
  return skill.files.find((item) => item.id === file.id) ?? file;
}
function deleteWorkspaceSkillFileSync(skillId, fileId, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const skill = requireStoredSkill(skillId, workspaceId);
  if (isBuiltinSkill(skill.name)) {
    throw new Error(`${skill.name} \u662F\u7CFB\u7EDF\u9884\u5B9A\u4E49 skill\uFF0C\u4E0D\u80FD\u5220\u9664\u6587\u4EF6\u3002`);
  }
  const file = skill.files.find((item) => item.id === fileId);
  if (!file) {
    throw new Error(`Skill file "${fileId}" does not exist.`);
  }
  if (sameValue(file.path, "SKILL.md")) {
    throw new Error("SKILL.md is required and cannot be deleted.");
  }
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const storedSkill = deleteStoredWorkspaceSkillFileSync(skillId, fileId, updatedAt, workspaceId);
  if (!storedSkill) {
    throw new Error(`Skill "${skillId}" does not exist.`);
  }
  skill.files = normalizeWorkspaceSkillFiles(storedSkill.files, storedSkill.name, storedSkill.description);
  skill.updatedAt = storedSkill.updatedAt;
  state.ledger.unshift({
    title: "Skill file deleted",
    note: `${skill.name} file ${file.path} was deleted.`
  });
  replaceStateSkillSnapshot(state, skill.id, skill);
  return writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
}
function requireStoredSkill(skillId, workspaceId) {
  const skill = readStoredWorkspaceSkillSync(skillId, workspaceId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" does not exist.`);
  }
  return skill;
}
function isBuiltinSkill(name) {
  return isSystemSkillName(name);
}
function findPredefinedAgentTemplateSkill(storedSkills, expectedSkill) {
  return storedSkills.find((skill) => sameValue(skill.name, expectedSkill.name)) ?? storedSkills.find((skill) => skill.sourceType === expectedSkill.sourceType && typeof skill.sourceUrl === "string" && skill.sourceUrl === expectedSkill.sourceUrl);
}
function syncPredefinedAgentTemplateSkill(existingSkill, expectedSkill, workspaceId) {
  let changed = false;
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (existingSkill.name !== expectedSkill.name || existingSkill.description !== expectedSkill.description || existingSkill.sourceType !== expectedSkill.sourceType || existingSkill.sourceUrl !== expectedSkill.sourceUrl || (existingSkill.configJson ?? "{}") !== (expectedSkill.configJson ?? "{}")) {
    updateStoredWorkspaceSkillMetaSync({
      skillId: existingSkill.id,
      name: expectedSkill.name,
      description: expectedSkill.description,
      sourceType: expectedSkill.sourceType,
      sourceUrl: expectedSkill.sourceUrl,
      configJson: expectedSkill.configJson,
      updatedAt
    }, workspaceId);
    changed = true;
  }
  const expectedPaths = new Set(expectedSkill.files.map((file) => file.path.toLocaleLowerCase("en-US")));
  for (const expectedFile of expectedSkill.files) {
    const existingFile = existingSkill.files.find((file) => sameValue(file.path, expectedFile.path));
    if (existingFile && existingFile.content === expectedFile.content) {
      continue;
    }
    upsertStoredWorkspaceSkillFileSync({
      skillId: existingSkill.id,
      file: {
        id: existingFile?.id ?? expectedFile.id ?? `skill-file-${createOpaqueId()}`,
        path: expectedFile.path,
        content: expectedFile.content,
        createdAt: existingFile?.createdAt ?? expectedFile.createdAt ?? updatedAt,
        updatedAt
      },
      skillUpdatedAt: updatedAt
    }, workspaceId);
    changed = true;
  }
  for (const existingFile of existingSkill.files) {
    if (expectedPaths.has(existingFile.path.toLocaleLowerCase("en-US"))) {
      continue;
    }
    deleteStoredWorkspaceSkillFileSync(existingSkill.id, existingFile.id, updatedAt, workspaceId);
    changed = true;
  }
  return changed;
}
function ensurePredefinedAgentTemplateSkillsInStateSnapshotSync(storedSkills, workspaceId) {
  const predefinedSkills = storedSkills.filter((skill) => isPredefinedAgentTemplateSkillName(skill.name));
  if (predefinedSkills.length === 0) {
    return;
  }
  const state = readWorkspaceStateRecordSync(workspaceId);
  if (!state) {
    return;
  }
  const stateSkills = Array.isArray(state.skills) ? state.skills : [];
  const stateHasCurrentPredefinedSkills = predefinedSkills.every(
    (storedSkill) => stateSkills.some((stateSkill) => predefinedSkillSnapshotsMatch(stateSkill, storedSkill))
  );
  if (stateHasCurrentPredefinedSkills) {
    return;
  }
  const predefinedSkillNames = new Set(predefinedSkills.map((skill) => skill.name.toLocaleLowerCase("en-US")));
  writeWorkspaceStateRecordSync({
    ...state,
    skills: [
      ...stateSkills.filter((skill) => !predefinedSkillNames.has(skill.name.toLocaleLowerCase("en-US"))),
      ...predefinedSkills
    ]
  }, workspaceId, { skipVersionCheck: true });
}
function predefinedSkillSnapshotsMatch(left, right) {
  return left.id === right.id && sameValue(left.name, right.name) && left.description === right.description && left.sourceType === right.sourceType && left.sourceUrl === right.sourceUrl && (left.configJson ?? "{}") === (right.configJson ?? "{}") && readSkillMarkdownContent(left) === readSkillMarkdownContent(right);
}
function readSkillMarkdownContent(skill) {
  return skill.files.find((file) => sameValue(file.path, "SKILL.md"))?.content ?? "";
}
function replaceStateSkillSnapshot(state, skillId, nextSkill) {
  const nextSkills = state.skills.filter((item) => item.id !== skillId);
  nextSkills.unshift(nextSkill);
  state.skills = nextSkills;
}

// ../services/src/employees/employees.ts
function listEmployeeSkillIdsMapSync(workspaceId) {
  const map = /* @__PURE__ */ new Map();
  for (const assignment of listStoredAgentSkillAssignmentsSync(workspaceId)) {
    const employeeName = assignment.employeeName;
    const next = map.get(employeeName) ?? [];
    next.push(assignment.skillId);
    map.set(employeeName, next);
  }
  return map;
}
function listEmployeeSkillIdsByAgentIdMapSync(workspaceId) {
  const map = /* @__PURE__ */ new Map();
  for (const assignment of listStoredAgentSkillAssignmentsSync(workspaceId)) {
    const agentId = assignment.agentId?.trim() || buildLegacyAgentIdForEmployeeName(assignment.employeeName);
    const next = map.get(agentId) ?? [];
    next.push(assignment.skillId);
    map.set(agentId, next);
  }
  return map;
}
function listEmployeeSkillIdsSync(employeeName, workspaceId) {
  const byAgentId = listEmployeeSkillIdsByAgentIdMapSync(workspaceId);
  const byName = listEmployeeSkillIdsMapSync(workspaceId);
  return byAgentId.get(buildLegacyAgentIdForEmployeeName(employeeName)) ?? byName.get(employeeName) ?? [];
}
function buildLegacyAgentIdForEmployeeName(employeeName) {
  return `agent:${employeeName.trim()}`;
}
function setEmployeeSkillIdsSync(employeeName, skillIds, workspaceId) {
  const workspaceSkills = listWorkspaceSkillsSync(workspaceId);
  const state = ensureWorkspaceStateSync(workspaceId);
  const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
  if (!employee) {
    throw new Error(`Active employee "${employeeName}" does not exist.`);
  }
  const normalizedSkillIds = normalizeSkillIds(skillIds, workspaceSkills);
  if (normalizedSkillIds.length !== uniqueStringValues(skillIds).length) {
    throw new Error("One or more skills do not exist.");
  }
  employee.skillIds = normalizedSkillIds;
  setStoredEmployeeSkillAssignmentsSync(employee.name, normalizedSkillIds, workspaceId);
  state.ledger.unshift({
    title: "Agent skill assignments updated",
    note: `${employee.remarkName ?? employee.name} skill assignments were updated with ${employee.skillIds.length} item(s).`
  });
  return writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
}

// ../services/src/knowledge/assignments.ts
function listEmployeeKnowledgePagesSync(employeeName, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const employee = resolveEmployee(state, employeeName);
  if (!employee) {
    return [];
  }
  const policyByPageId = buildPolicyMap(state, workspaceId);
  const directlyAssignedIds = new Set(
    listStoredKnowledgeAssignmentsByEmployeeSync(employee.name, workspaceId).map((assignment) => assignment.knowledgePageId)
  );
  return state.knowledgePages.filter((page) => {
    const mode = policyByPageId.get(page.id)?.assignmentMode ?? page.assignmentMode ?? "all_agents";
    return mode === "all_agents" || directlyAssignedIds.has(page.id);
  });
}
function buildPolicyMap(state, workspaceId) {
  const storedPolicies = listStoredKnowledgeAssignmentPoliciesSync(workspaceId);
  const map = new Map(storedPolicies.map((policy) => [policy.knowledgePageId, policy]));
  for (const page of state.knowledgePages) {
    if (!map.has(page.id)) {
      map.set(page.id, {
        workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
        knowledgePageId: page.id,
        assignmentMode: page.assignmentMode ?? "all_agents",
        updatedAt: page.assignmentUpdatedAt ?? page.updatedAt,
        updatedBy: page.assignmentUpdatedBy ?? page.createdBy
      });
    }
  }
  return map;
}
function resolveEmployee(state, employeeName) {
  return state.activeEmployees.find((employee) => sameValue(employee.name, employeeName));
}

// ../services/src/clihub/runtime-apps.ts
function listRuntimeAppContextEntriesForRuntimeSync(input) {
  return listRuntimeInstalledAppsSync({
    workspaceId: input.workspaceId,
    runtimeId: input.runtimeId,
    enabledOnly: true
  }).map((installedApp) => {
    const catalogItem = readRuntimeAppCatalogItemSync(installedApp.source, installedApp.name);
    return {
      source: installedApp.source,
      name: installedApp.name,
      displayName: installedApp.displayName,
      version: installedApp.version || void 0,
      entryPoint: installedApp.entryPoint || void 0,
      skillMd: catalogItem?.skillMd,
      requiresText: catalogItem?.requiresText,
      category: catalogItem?.category
    };
  });
}

// ../services/src/skills/injection.ts
import { mkdirSync as mkdirSync4, rmSync as rmSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname4, join as join8 } from "node:path";
var PROVIDER_NATIVE_SKILL_ROOT_SEGMENTS = {
  claude: [".claude", "skills"],
  codex: [".codex", "skills"],
  opencode: [".config", "opencode", "skills"],
  openclaw: [".config", "openclaw", "skills"],
  nanobot: [".config", "nanobot", "skills"]
};
function materializeWorkspaceSkillsForProvider(input) {
  if (input.skills.length === 0) {
    return {};
  }
  const compatibilityDir = join8(input.workDir, ".agent_context", "skills");
  writeSkillsToRoot(input.skills, compatibilityDir);
  const nativeSegments = PROVIDER_NATIVE_SKILL_ROOT_SEGMENTS[input.provider];
  const nativeDir = nativeSegments ? join8(input.workDir, ...nativeSegments) : void 0;
  if (nativeDir && nativeDir !== compatibilityDir) {
    writeSkillsToRoot(input.skills, nativeDir);
  }
  return {
    compatibilityDir,
    nativeDir,
    primaryDir: nativeDir ?? compatibilityDir
  };
}
function writeSkillsToRoot(skills, rootDir) {
  rmSync4(rootDir, { recursive: true, force: true });
  mkdirSync4(rootDir, { recursive: true });
  for (const skill of skills) {
    const skillDir = join8(rootDir, `${sanitizeSkillDirectoryName(skill.name)}-${skill.id.slice(-6)}`);
    mkdirSync4(skillDir, { recursive: true });
    for (const file of skill.files) {
      const relativePath = normalizeSkillFilePath(file.path);
      if (!relativePath) {
        continue;
      }
      const targetPath = join8(skillDir, relativePath);
      mkdirSync4(dirname4(targetPath), { recursive: true });
      writeFileSync3(targetPath, file.content, "utf8");
    }
  }
}
function sanitizeSkillDirectoryName(value) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}

// ../services/node_modules/fflate/esm/index.mjs
import { createRequire as createRequire2 } from "module";
var require2 = createRequire2("/");
var Worker2;
try {
  Worker2 = require2("worker_threads").Worker;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
  var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = o == 4294967295 || c == 65535;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// ../services/src/skills/import.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { basename as basename3, extname as extname2, resolve as resolve6 } from "node:path";
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
async function importWorkspaceSkillFromUrl(input) {
  const workspaceId = input.workspaceId;
  const sourceUrl = input.url.trim();
  if (!sourceUrl) {
    throw new Error("Skill import URL is required.");
  }
  const imported = await importSkillDefinition(sourceUrl);
  const existingSkills = listWorkspaceSkillsSync(workspaceId);
  const existing = existingSkills.find((skill) => sameValue(skill.name, imported.name));
  if (existing && isBuiltinSkill(existing.name)) {
    throw new Error(`Builtin skill "${existing.name}" cannot be replaced by an import.`);
  }
  const conflict = input.conflict ?? "reject";
  if (existing && conflict === "reject") {
    throw new Error(`Skill "${existing.name}" already exists. Use --conflict rename or --conflict replace.`);
  }
  if (existing && conflict === "skip") {
    return {
      skillId: existing.id,
      skillName: existing.name,
      created: false,
      renamed: false,
      replaced: false,
      skipped: true,
      sourceType: imported.sourceType,
      warnings: [...imported.warnings, `Skipped existing skill "${existing.name}".`]
    };
  }
  if (existing && conflict === "replace") {
    return replaceImportedSkill(existing, imported, workspaceId);
  }
  const skillName = existing ? createUniqueWorkspaceSkillName(existingSkills, imported.name) : imported.name;
  const created = createWorkspaceSkillSync({
    name: skillName,
    description: imported.description,
    content: readImportedSkillFile(imported.files, "SKILL.md"),
    sourceType: imported.sourceType,
    sourceUrl: imported.sourceUrl,
    configJson: imported.configJson
  }, workspaceId);
  for (const file of imported.files) {
    if (sameValue(file.path, "SKILL.md")) {
      continue;
    }
    upsertWorkspaceSkillFileSync({
      skillId: created.id,
      path: file.path,
      content: file.content
    }, workspaceId);
  }
  recordStoredSkillImportEventSync({
    workspaceId,
    skillId: created.id,
    skillName: created.name,
    sourceType: imported.sourceType,
    sourceUrl: imported.sourceUrl,
    importMode: sameValue(created.name, imported.name) ? "created" : "renamed",
    metadataJson: imported.configJson
  });
  return {
    skillId: created.id,
    skillName: created.name,
    created: true,
    renamed: !sameValue(created.name, imported.name),
    replaced: false,
    skipped: false,
    sourceType: imported.sourceType,
    warnings: imported.warnings
  };
}
async function replaceImportedSkill(existing, imported, workspaceId) {
  const current = readWorkspaceSkillSync(existing.id, workspaceId);
  if (!current) {
    throw new Error(`Skill "${existing.id}" does not exist.`);
  }
  const updated = updateWorkspaceSkillSync({
    skillId: current.id,
    name: current.name,
    description: imported.description,
    sourceType: imported.sourceType,
    sourceUrl: imported.sourceUrl,
    configJson: imported.configJson
  }, workspaceId);
  const importedPaths = new Set(imported.files.map((file) => file.path.toLocaleLowerCase("en-US")));
  for (const file of imported.files) {
    const existingFile = updated.files.find((item) => sameValue(item.path, file.path));
    upsertWorkspaceSkillFileSync({
      skillId: updated.id,
      fileId: existingFile?.id,
      path: file.path,
      content: file.content
    }, workspaceId);
  }
  const refreshed = readWorkspaceSkillSync(updated.id, workspaceId);
  if (!refreshed) {
    throw new Error(`Skill "${updated.id}" does not exist after import.`);
  }
  for (const file of refreshed.files) {
    if (!importedPaths.has(file.path.toLocaleLowerCase("en-US")) && !sameValue(file.path, "SKILL.md")) {
      deleteWorkspaceSkillFileSync(refreshed.id, file.id, workspaceId);
    }
  }
  recordStoredSkillImportEventSync({
    workspaceId,
    skillId: refreshed.id,
    skillName: refreshed.name,
    sourceType: imported.sourceType,
    sourceUrl: imported.sourceUrl,
    importMode: "replaced",
    metadataJson: imported.configJson
  });
  return {
    skillId: refreshed.id,
    skillName: refreshed.name,
    created: false,
    renamed: false,
    replaced: true,
    skipped: false,
    sourceType: imported.sourceType,
    warnings: imported.warnings
  };
}
async function importSkillDefinition(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) {
    return importLocalSkillDefinition(sourceUrl);
  }
  if (parsed.hostname === "skills.sh") {
    return importSkillsShSkillDefinition(sourceUrl, parsed);
  }
  if (parsed.hostname === "clawhub.ai" || parsed.hostname.endsWith(".clawhub.ai")) {
    return importClawHubSkillDefinition(sourceUrl);
  }
  if (parsed.protocol === "file:") {
    return importLocalSkillDefinition(decodeURIComponent(parsed.pathname));
  }
  return importGitHubSkillDefinition(sourceUrl);
}
async function importLocalSkillDefinition(sourcePath) {
  const absolutePath = resolve6(sourcePath.trim());
  if (!absolutePath) {
    throw new Error("Local skill path is required.");
  }
  const stats = await stat(absolutePath).catch(() => null);
  if (!stats) {
    throw new Error(`Local skill path does not exist: ${absolutePath}`);
  }
  const warnings = [];
  let files = [];
  if (stats.isDirectory()) {
    files = await readLocalSkillDirectoryFiles(absolutePath, warnings);
  } else if (stats.isFile() && extname2(absolutePath).toLowerCase() === ".zip") {
    files = await readLocalSkillZipFiles(absolutePath, warnings);
  } else if (stats.isFile() && sameValue(basename3(absolutePath), "SKILL.md")) {
    files = [{
      path: "SKILL.md",
      content: await readFile(absolutePath, "utf8")
    }];
  } else {
    throw new Error("Local skill import currently supports a skill directory, a .zip archive, or a direct SKILL.md file.");
  }
  const skillMd = readImportedSkillFile(files, "SKILL.md");
  const metadata = parseSkillMetadata(skillMd, deriveSkillNameFromPath(absolutePath));
  return {
    name: metadata.name,
    description: metadata.description,
    files,
    sourceType: "local",
    sourceUrl: absolutePath,
    configJson: JSON.stringify({
      provider: "local",
      path: absolutePath,
      warnings
    }),
    warnings
  };
}
async function importGitHubSkillDefinition(sourceUrl) {
  const pointer = parseGitHubDirectoryUrl(sourceUrl);
  if (!pointer) {
    throw new Error("Only GitHub tree/blob/raw skill URLs are supported for now.");
  }
  return importGitHubSkillDefinitionFromPointer(pointer, sourceUrl, "github");
}
async function importGitHubSkillDefinitionFromPointer(pointer, sourceUrl, sourceType) {
  if (pointer.path.endsWith("/SKILL.md") || sameValue(pointer.path, "SKILL.md")) {
    const skillMd2 = await fetchGitHubRawFile(pointer);
    const fallbackName = deriveSkillNameFromPath(pointer.path);
    const metadata2 = parseSkillMetadata(skillMd2, fallbackName);
    return {
      name: metadata2.name,
      description: metadata2.description,
      files: [{ path: "SKILL.md", content: skillMd2 }],
      sourceType,
      sourceUrl,
      configJson: JSON.stringify({ provider: sourceType, owner: pointer.owner, repo: pointer.repo, ref: pointer.ref, path: pointer.path }),
      warnings: []
    };
  }
  const warnings = [];
  const files = await fetchGitHubDirectoryFiles(pointer, warnings);
  const skillMd = readImportedSkillFile(files, "SKILL.md");
  const metadata = parseSkillMetadata(skillMd, deriveSkillNameFromPath(pointer.path));
  return {
    name: metadata.name,
    description: metadata.description,
    files,
    sourceType,
    sourceUrl,
    configJson: JSON.stringify({
      provider: sourceType,
      owner: pointer.owner,
      repo: pointer.repo,
      ref: pointer.ref,
      path: pointer.path,
      warnings
    }),
    warnings
  };
}
async function importSkillsShSkillDefinition(sourceUrl, parsedUrl) {
  const installPageResponse = await fetch(parsedUrl, {
    headers: {
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!installPageResponse.ok) {
    throw new Error(`Failed to fetch skills.sh page: ${installPageResponse.status}`);
  }
  const html = await installPageResponse.text();
  const fromCommand = parseSkillsShInstallCommand(html);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const owner = fromCommand?.owner ?? pathParts[0];
  const repo = fromCommand?.repo ?? pathParts[1];
  const skillSlug = fromCommand?.skillSlug ?? pathParts[2];
  if (!owner || !repo || !skillSlug) {
    throw new Error("Could not resolve the skills.sh source repository.");
  }
  const ref = await fetchGitHubDefaultBranch(owner, repo);
  const pointer = await resolveGitHubSkillPointerBySlug({
    owner,
    repo,
    ref,
    skillSlug
  });
  return importGitHubSkillDefinitionFromPointer(pointer, sourceUrl, "skills.sh");
}
async function importClawHubSkillDefinition(sourceUrl) {
  const pageResponse = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch ClawHub skill page: ${pageResponse.status}`);
  }
  const html = await pageResponse.text();
  const downloadUrl = extractClawHubDownloadUrl(html);
  if (!downloadUrl) {
    throw new Error("ClawHub skill page does not expose a downloadable package.");
  }
  const downloadResponse = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download ClawHub skill: ${downloadResponse.status}`);
  }
  const archive = unzipSync(new Uint8Array(await downloadResponse.arrayBuffer()));
  const warnings = [];
  const files = [];
  let rawMetaJson;
  for (const [entryName, content] of Object.entries(archive)) {
    const normalizedPath = normalizeSkillFilePath(entryName);
    if (!normalizedPath) {
      continue;
    }
    if (sameValue(normalizedPath, "_meta.json")) {
      rawMetaJson = strFromU8(content);
      continue;
    }
    if (!isImportableSkillTextFile(normalizedPath)) {
      warnings.push(`Skipped non-text ClawHub file: ${normalizedPath}`);
      continue;
    }
    files.push({
      path: normalizedPath,
      content: strFromU8(content)
    });
  }
  const skillMd = readImportedSkillFile(files, "SKILL.md");
  const metadata = parseSkillMetadata(skillMd, deriveSkillNameFromPath(sourceUrl));
  return {
    name: metadata.name,
    description: metadata.description,
    files: files.sort((left, right) => sameValue(left.path, "SKILL.md") ? -1 : left.path.localeCompare(right.path, "en-US")),
    sourceType: "clawhub",
    sourceUrl,
    configJson: JSON.stringify({
      provider: "clawhub",
      downloadUrl,
      meta: parseJsonSafely(rawMetaJson),
      warnings
    }),
    warnings
  };
}
function parseGitHubDirectoryUrl(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) {
    return null;
  }
  if (parsed.hostname === "github.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && (parts[2] === "tree" || parts[2] === "blob")) {
      const [owner, repo, _kind, ref, ...rest] = parts;
      return {
        owner,
        repo,
        ref,
        path: rest.join("/")
      };
    }
  }
  if (parsed.hostname === "raw.githubusercontent.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 4) {
      const [owner, repo, ref, ...rest] = parts;
      return {
        owner,
        repo,
        ref,
        path: rest.join("/")
      };
    }
  }
  return null;
}
async function readLocalSkillDirectoryFiles(directoryPath, warnings, relativePrefix = "", requireSkillFile = true) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = normalizeSkillFilePath(relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name);
    if (!relativePath) {
      continue;
    }
    const absoluteEntryPath = resolve6(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readLocalSkillDirectoryFiles(absoluteEntryPath, warnings, relativePath, false));
      continue;
    }
    if (!entry.isFile()) {
      warnings.push(`Skipped unsupported local entry: ${relativePath}`);
      continue;
    }
    if (!isImportableSkillTextFile(relativePath)) {
      warnings.push(`Skipped non-text local skill file: ${relativePath}`);
      continue;
    }
    files.push({
      path: relativePath,
      content: await readFile(absoluteEntryPath, "utf8")
    });
  }
  if (requireSkillFile && !files.some((file) => sameValue(file.path, "SKILL.md"))) {
    throw new Error(`Local skill directory must contain SKILL.md: ${directoryPath}`);
  }
  return sortImportedSkillFiles(files);
}
async function readLocalSkillZipFiles(archivePath, warnings) {
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const files = [];
  for (const [entryName, content] of Object.entries(archive)) {
    const normalizedPath = normalizeSkillFilePath(entryName);
    if (!normalizedPath) {
      continue;
    }
    if (!isImportableSkillTextFile(normalizedPath)) {
      warnings.push(`Skipped non-text archive file: ${normalizedPath}`);
      continue;
    }
    files.push({
      path: normalizedPath,
      content: strFromU8(content)
    });
  }
  if (!files.some((file) => sameValue(file.path, "SKILL.md"))) {
    throw new Error(`Local skill archive must contain SKILL.md: ${archivePath}`);
  }
  return sortImportedSkillFiles(files);
}
function parseSkillsShInstallCommand(html) {
  const decodedHtml = decodeHtmlEntities(html);
  const match = decodedHtml.match(
    /npx skills add https:\/\/github\.com\/([^/\s"<']+)\/([^/\s"<']+)\s+--skill\s+(?:"([^"]+)"|'([^']+)'|([^<\s"']+))/i
  );
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2],
    skillSlug: match[3] ?? match[4] ?? match[5]
  };
}
function decodeHtmlEntities(value) {
  return value.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
async function fetchGitHubDefaultBranch(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub repository metadata: ${response.status}`);
  }
  const payload = await response.json();
  return payload.default_branch?.trim() || "main";
}
async function resolveGitHubSkillPointerBySlug(input) {
  const response = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/git/trees/${encodeURIComponent(input.ref)}?recursive=1`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to inspect GitHub repository tree: ${response.status}`);
  }
  const payload = await response.json();
  const skillCandidates = (payload.tree ?? []).filter((entry) => entry.type === "blob" && typeof entry.path === "string").map((entry) => entry.path).filter((path) => sameValue(basename3(path), "SKILL.md")).map((path) => path.slice(0, -"/SKILL.md".length)).filter((path) => path.split("/").some((segment) => sameSkillSlug(segment, input.skillSlug))).sort((left, right) => left.length - right.length);
  const matchedPath = skillCandidates[0];
  if (!matchedPath) {
    throw new Error(`Could not find a skill directory for "${input.skillSlug}" in ${input.owner}/${input.repo}.`);
  }
  return {
    owner: input.owner,
    repo: input.repo,
    ref: input.ref,
    path: matchedPath
  };
}
function sameSkillSlug(left, right) {
  return normalizeSkillSlug(left) === normalizeSkillSlug(right);
}
function normalizeSkillSlug(value) {
  return value.trim().toLocaleLowerCase("en-US").replace(/&amp;/g, "&").replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]+/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
async function fetchGitHubDirectoryFiles(pointer, warnings, relativePrefix = "", requireSkillFile = true) {
  const contentsUrl = buildGitHubContentsApiUrl(pointer.owner, pointer.repo, pointer.path, pointer.ref);
  const response = await fetch(contentsUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "AgentSpace/0.1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub skill directory: ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("GitHub URL must point to a directory that contains SKILL.md.");
  }
  const files = [];
  for (const entry of payload) {
    if (!entry.path || !entry.name || !entry.type) {
      continue;
    }
    const relativePath = normalizeSkillFilePath(joinRelative(relativePrefix, entry.name));
    if (!relativePath) {
      continue;
    }
    if (entry.type === "dir") {
      const nestedPointer = {
        ...pointer,
        path: entry.path
      };
      files.push(...await fetchGitHubDirectoryFiles(nestedPointer, warnings, relativePath, false));
      continue;
    }
    if (entry.type !== "file") {
      warnings.push(`Skipped unsupported GitHub entry: ${entry.path}`);
      continue;
    }
    if (!isImportableSkillTextFile(relativePath)) {
      warnings.push(`Skipped non-text skill file: ${entry.path}`);
      continue;
    }
    const fileResponse = await fetch(buildGitHubContentsApiUrl(pointer.owner, pointer.repo, entry.path, pointer.ref), {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "AgentSpace/0.1.0"
      }
    });
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch GitHub skill file: ${entry.path}`);
    }
    const filePayload = await fileResponse.json();
    if (filePayload.type !== "file" || filePayload.encoding !== "base64" || typeof filePayload.content !== "string") {
      throw new Error(`GitHub skill file "${entry.path}" is not a supported text file.`);
    }
    files.push({
      path: relativePath,
      content: Buffer.from(filePayload.content.replace(/\n/g, ""), "base64").toString("utf8")
    });
  }
  if (requireSkillFile && !files.some((file) => sameValue(file.path, "SKILL.md"))) {
    throw new Error("Imported GitHub skill must contain SKILL.md.");
  }
  return sortImportedSkillFiles(files);
}
async function fetchGitHubRawFile(pointer) {
  const response = await fetch(
    `https://raw.githubusercontent.com/${pointer.owner}/${pointer.repo}/${pointer.ref}/${pointer.path}`,
    { headers: { "User-Agent": "AgentSpace/0.1.0" } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub skill file: ${response.status}`);
  }
  return response.text();
}
function buildGitHubContentsApiUrl(owner, repo, path, ref) {
  const normalizedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}?ref=${encodeURIComponent(ref)}`;
}
function extractClawHubDownloadUrl(html) {
  const match = html.match(/https:\/\/[^"']+convex\.site\/api\/v1\/download\?slug=[^"'<\s]+/i);
  return match ? match[0] : null;
}
function parseSkillMetadata(skillMarkdown, fallbackName) {
  const frontmatterMatch = skillMarkdown.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (!frontmatterMatch) {
    return { name: fallbackName, description: "" };
  }
  let name = fallbackName;
  let description = "";
  for (const rawLine of frontmatterMatch[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("name:")) {
      name = line.slice("name:".length).trim() || fallbackName;
    }
    if (line.startsWith("description:")) {
      description = line.slice("description:".length).trim();
    }
  }
  return {
    name,
    description
  };
}
function deriveSkillNameFromPath(path) {
  const normalized = normalizeSkillFilePath(path);
  const segments = normalized.split("/").filter(Boolean);
  const base = segments.length > 0 ? segments[segments.length - (sameValue(segments[segments.length - 1] ?? "", "SKILL.md") ? 2 : 1)] : "";
  return base || basename3(path).replace(/\.md$/i, "") || "Imported Skill";
}
function isImportableSkillTextFile(path) {
  if (sameValue(path, "SKILL.md")) {
    return true;
  }
  const normalized = path.toLowerCase();
  const extension = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")) : "";
  return IMPORTABLE_TEXT_EXTENSIONS.has(extension);
}
function readImportedSkillFile(files, path) {
  const match = files.find((file) => sameValue(file.path, path));
  if (!match) {
    throw new Error(`Imported skill is missing required file "${path}".`);
  }
  return match.content;
}
function joinRelative(prefix, name) {
  return prefix ? `${prefix}/${name}` : name;
}
function sortImportedSkillFiles(files) {
  return [...files].sort((left, right) => {
    if (sameValue(left.path, "SKILL.md")) {
      return -1;
    }
    if (sameValue(right.path, "SKILL.md")) {
      return 1;
    }
    return left.path.localeCompare(right.path, "en-US");
  });
}
function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
function parseJsonSafely(value) {
  if (!value) {
    return void 0;
  }
  try {
    return JSON.parse(value);
  } catch {
    return void 0;
  }
}

// ../services/src/task-execution-events.ts
function recordTaskExecutionEventSync2(input) {
  const event = recordTaskExecutionEventSync(input);
  publishTaskExecutionEventCreatedEvent({
    workspaceId: event.workspaceId,
    channelName: event.channelName,
    taskId: event.taskId,
    eventId: event.id,
    createdAt: event.createdAt
  });
  return event;
}

// ../services/src/approvals/approvals.ts
var SYSTEM_SPEAKER = "\u7CFB\u7EDF\u63D0\u793A";
function createApprovalRequestSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  if (!state.activeEmployees.some((employee) => sameValue(employee.name, input.agentId))) {
    throw new Error(`Agent "${input.agentId}" does not exist.`);
  }
  if (!state.channels.some((channel) => sameValue(channel.name, input.channelName))) {
    throw new Error(`Channel "${input.channelName}" does not exist.`);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const approval = {
    id: `approval-${createOpaqueId()}`,
    type: input.type,
    sourceId: input.sourceId,
    agentId: input.agentId,
    channelName: input.channelName,
    status: "pending",
    contentPreview: input.contentPreview,
    metadata: input.metadata,
    createdAt: now
  };
  state.approvals.unshift(approval);
  state.ledger.unshift({
    title: "Approval requested",
    note: `${input.agentId} submitted ${input.type} for review in ${input.channelName}.`
  });
  recordApprovalExecutionEvent(approval, workspaceId);
  createApprovalRequestedNotifications(approval, workspaceId ?? DEFAULT_WORKSPACE_ID);
  writeWorkspaceStateSync(state, workspaceId);
  postNotificationChannelMessageSync({
    workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
    channelName: input.channelName,
    summary: buildApprovalConversationSummary(approval),
    code: "approval.created",
    data: buildApprovalMessageData(approval),
    speaker: SYSTEM_SPEAKER
  });
  return ensureWorkspaceStateSync(workspaceId);
}
function recordApprovalExecutionEvent(approval, workspaceId) {
  const queued = readQueuedTaskSync(approval.sourceId) ?? listQueuedTasksSync({ workspaceId }).find((task) => task.issueId === approval.sourceId);
  if (!queued) {
    return;
  }
  const context = buildTaskExecutionEventContext(queued);
  recordTaskExecutionEventSync2({
    ...context,
    type: "approval_requested",
    title: "Approval requested",
    summary: `${approval.agentId} requested approval for ${approval.type}.`,
    severity: "warning",
    status: "pending",
    data: {
      approvalId: approval.id,
      approvalType: approval.type,
      sourceId: approval.sourceId,
      triggerType: context.triggerType
    }
  });
}
function createApprovalRequestedNotifications(approval, workspaceId) {
  const recipients = listWorkspaceMembershipsSync(workspaceId).filter((membership) => membership.role === "owner" || membership.role === "admin").map((membership) => readUserSync(membership.userId)).filter((user) => Boolean(user));
  createNotificationsSync(recipients.map((recipient) => ({
    workspaceId,
    recipientType: "human",
    recipientId: recipient.id,
    actorType: "agent",
    actorId: approval.agentId,
    type: "approval.requested",
    resourceType: "approval",
    resourceId: approval.id,
    channelName: approval.channelName,
    title: "Approval requested",
    body: buildApprovalConversationSummary(approval),
    actionHref: "/approvals",
    severity: "warning",
    dedupeKey: `approval.requested:${workspaceId}:${approval.id}:${recipient.id}`,
    metadata: {
      approvalId: approval.id,
      approvalType: approval.type,
      agentId: approval.agentId,
      channelName: approval.channelName,
      sourceId: approval.sourceId
    }
  })));
}
function buildApprovalConversationSummary(approval) {
  if (approval.type === "runtime_tool") {
    const toolName = readMetadataString(approval.metadata, "toolName") ?? "tool";
    if (approval.status === "pending") {
      return `${approval.agentId} requested permission to run ${toolName}: ${approval.contentPreview}`;
    }
    return `${approval.agentId}'s ${toolName} permission was ${approval.status}: ${approval.contentPreview}`;
  }
  if (approval.status === "pending") {
    return `${approval.agentId} submitted a ${approval.type} for approval.`;
  }
  return `${approval.agentId}'s ${approval.type} approval was ${approval.status}.`;
}
function buildApprovalMessageData(approval) {
  const metadata = approval.metadata ?? {};
  return compactRecord({
    approval_id: approval.id,
    approval_type: approval.type,
    approval_status: approval.status,
    source_id: approval.sourceId,
    agent_id: approval.agentId,
    content_preview: approval.contentPreview,
    tool_name: readMetadataString(metadata, "toolName"),
    provider: readMetadataString(metadata, "provider"),
    runtime_id: readMetadataString(metadata, "runtimeId"),
    session_id: readMetadataString(metadata, "sessionId"),
    reviewed_at: approval.reviewedAt,
    reviewer_comment: approval.reviewerComment
  });
}
function readMetadataString(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function compactRecord(input) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) {
      output[key] = value;
    }
  }
  return output;
}

// ../services/src/documents/service.ts
function listChannelDocuments(state, channelName) {
  const documents = channelName ? state.channelDocuments.filter((document) => sameValue3(document.channelName, channelName)) : state.channelDocuments;
  return sortChannelDocuments(documents);
}
function listChannelDocumentVersions(state, documentId) {
  return state.channelDocumentVersions.filter((version) => version.documentId === documentId).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function readChannelDocument(state, documentId) {
  const document = state.channelDocuments.find((item) => item.id === documentId);
  if (!document) {
    throw new Error(`Channel document "${documentId}" does not exist.`);
  }
  const versions = listChannelDocumentVersions(state, documentId);
  const currentVersion = versions.find((version) => version.id === document.currentVersionId) ?? versions[0];
  if (!currentVersion) {
    throw new Error(`Channel document "${document.title}" has no versions.`);
  }
  return { document, currentVersion, versions };
}
function createChannelDocument(input) {
  const { state } = input;
  if (!state.channels.some((channel) => sameValue3(channel.name, input.channelName))) {
    throw new Error(`Channel "${input.channelName}" does not exist.`);
  }
  const title = input.title.trim();
  if (!title) {
    throw new Error("Document title is required.");
  }
  if (state.channelDocuments.some(
    (document2) => sameValue3(document2.channelName, input.channelName) && sameValue3(document2.title, title) && document2.status === "active"
  )) {
    throw new Error(`Channel document "${title}" already exists in ${input.channelName}.`);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const contentMarkdown = input.contentMarkdown ?? "";
  const summary = summarizeChannelDocument(contentMarkdown, input.summary);
  const documentId = `channel-doc-${createOpaqueId4()}`;
  const versionId = `channel-doc-version-${createOpaqueId4()}`;
  const document = buildChannelDocumentRecord({
    id: documentId,
    channelName: input.channelName,
    title,
    kind: input.kind,
    storageMode: input.storageMode,
    linkedTableId: input.linkedTableId,
    externalProvider: input.externalProvider,
    externalFileId: input.externalFileId,
    externalUrl: input.externalUrl,
    externalRevisionId: input.externalRevisionId,
    currentVersionId: versionId,
    summary,
    externalSyncStatus: input.externalSyncStatus,
    externalMimeType: input.externalMimeType,
    externalUpdatedAt: input.externalUpdatedAt,
    lastEditorType: input.createdByType,
    createdBy: input.createdBy.trim() || "Unknown",
    updatedBy: input.createdBy.trim() || "Unknown",
    createdAt: now,
    updatedAt: now,
    existingDocuments: state.channelDocuments
  });
  const version = buildChannelDocumentVersionRecord({
    id: versionId,
    documentId,
    contentMarkdown,
    contentJson: input.contentJson,
    summary,
    createdBy: input.createdBy.trim() || "Unknown",
    createdByType: input.createdByType,
    triggerType: input.triggerType ?? "manual",
    sourceMessageId: input.sourceMessageId?.trim() || void 0,
    sourceAttachmentId: input.sourceAttachmentId?.trim() || void 0,
    sourceAttachmentStoredPath: input.sourceAttachmentStoredPath?.trim() || void 0,
    sourceTaskQueueId: input.sourceTaskQueueId?.trim() || void 0,
    createdAt: now
  });
  state.channelDocuments.unshift(document);
  state.channelDocumentVersions.unshift(version);
  return { state, document, version };
}
function updateChannelDocument(input) {
  const { state } = input;
  const document = state.channelDocuments.find((item) => item.id === input.documentId);
  if (!document) {
    throw new Error(`Channel document "${input.documentId}" does not exist.`);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const summary = summarizeChannelDocument(input.contentMarkdown, input.summary);
  const version = buildChannelDocumentVersionRecord({
    id: `channel-doc-version-${createOpaqueId4()}`,
    documentId: document.id,
    contentMarkdown: input.contentMarkdown,
    contentJson: input.contentJson,
    summary,
    createdBy: input.updatedBy.trim() || "Unknown",
    createdByType: input.updatedByType,
    triggerType: input.triggerType ?? "manual",
    sourceMessageId: input.sourceMessageId?.trim() || void 0,
    sourceAttachmentId: input.sourceAttachmentId?.trim() || void 0,
    sourceAttachmentStoredPath: input.sourceAttachmentStoredPath?.trim() || void 0,
    sourceTaskQueueId: input.sourceTaskQueueId?.trim() || void 0,
    createdAt: now
  });
  document.currentVersionId = version.id;
  document.summary = summary;
  document.lastEditorType = input.updatedByType;
  document.updatedBy = input.updatedBy.trim() || "Unknown";
  document.updatedAt = now;
  state.channelDocumentVersions.unshift(version);
  return { state, document, version };
}
function renameChannelDocument(input) {
  const { state } = input;
  const document = state.channelDocuments.find((item) => item.id === input.documentId);
  if (!document) {
    throw new Error(`Channel document "${input.documentId}" does not exist.`);
  }
  const title = input.nextTitle.trim();
  if (!title) {
    throw new Error("Document title is required.");
  }
  if (state.channelDocuments.some(
    (item) => item.id !== document.id && sameValue3(item.channelName, document.channelName) && sameValue3(item.title, title) && item.status === "active"
  )) {
    throw new Error(`Channel document "${title}" already exists in ${document.channelName}.`);
  }
  const previousTitle = document.title;
  document.title = title;
  document.slug = ensureUniqueChannelDocumentSlug(state.channelDocuments, document.channelName, title, document.id);
  document.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return { state, document, previousTitle };
}
function sameValue3(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function createOpaqueId4() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ../services/src/knowledge-proposals/knowledge-proposals.ts
var DEFAULT_SELECTED_ASSIGN_TO_SELF = true;
function createKnowledgeProposalFromAgentSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const state = ensureWorkspaceStateSync(workspaceId);
  const task = readQueuedTaskSync(input.sourceTaskQueueId);
  if (!task || task.workspaceId !== workspaceId) {
    throw new Error(`Source task "${input.sourceTaskQueueId}" does not exist in this workspace.`);
  }
  const sourceAgent = state.activeEmployees.find((employee) => sameValue(employee.name, input.sourceAgentName));
  if (!sourceAgent) {
    throw new Error(`Agent "${input.sourceAgentName}" does not exist.`);
  }
  const sourceChannelName = input.sourceChannelName?.trim();
  if (sourceChannelName && !state.channels.some((channel) => sameValue(channel.name, sourceChannelName))) {
    throw new Error(`Channel "${sourceChannelName}" does not exist.`);
  }
  const operation = normalizeOperation(input.operation);
  const title = requireTrimmed3(input.title, "Knowledge proposal title");
  const contentMarkdown = requireMarkdownContent(input.contentMarkdown);
  assertNoSensitiveKnowledgeProposalText(title, "Knowledge proposal title");
  assertNoSensitiveKnowledgeProposalText(contentMarkdown, "Knowledge proposal content");
  assertNoSensitiveKnowledgeProposalText(input.summary, "Knowledge proposal summary");
  assertNoSensitiveKnowledgeProposalText(input.reason, "Knowledge proposal reason");
  const tags = normalizeStringList2(input.tags);
  const parentId = normalizeParentId(state, input.parentId);
  const assignmentMode = input.assignmentMode ?? "selected_agents";
  const assignedEmployeeNames = normalizeAssignmentEmployees({
    state,
    assignmentMode,
    sourceAgentName: sourceAgent.name,
    assignedEmployeeNames: input.assignedEmployeeNames,
    assignToSelf: input.assignToSelf
  });
  validateOperationTarget({
    state,
    operation,
    targetKnowledgePageId: input.targetKnowledgePageId,
    baseUpdatedAt: input.baseUpdatedAt
  });
  const proposal = createKnowledgeProposalSync({
    workspaceId,
    sourceTaskQueueId: task.id,
    sourceChannelName,
    sourceAgentName: sourceAgent.name,
    operation,
    title,
    contentMarkdown,
    summary: input.summary,
    reason: input.reason,
    tags,
    parentId,
    assignmentMode,
    assignedEmployeeNames,
    targetKnowledgePageId: input.targetKnowledgePageId,
    baseUpdatedAt: input.baseUpdatedAt
  });
  const approvalState = createApprovalRequestSync({
    type: "knowledge_proposal",
    sourceId: task.id,
    agentId: sourceAgent.name,
    channelName: resolveApprovalChannelName(state, sourceChannelName || resolveTaskChannelName(task)),
    contentPreview: buildProposalPreview(proposal),
    metadata: {
      proposalId: proposal.id,
      operation: proposal.operation,
      title: proposal.title,
      assignmentMode: proposal.assignmentMode,
      assignedEmployeeNames: proposal.assignedEmployeeNames,
      targetKnowledgePageId: proposal.targetKnowledgePageId,
      baseUpdatedAt: proposal.baseUpdatedAt
    }
  }, workspaceId);
  const approval = approvalState.approvals[0];
  if (!approval) {
    throw new Error("Knowledge proposal approval could not be created.");
  }
  const linkedProposal = updateKnowledgeProposalApprovalIdSync({
    workspaceId,
    proposalId: proposal.id,
    approvalId: approval.id
  });
  notifyKnowledgeProposalRequested(linkedProposal);
  postKnowledgeProposalChannelMessage(linkedProposal, "knowledge.proposal_requested");
  recordKnowledgeProposalEvent(linkedProposal, {
    type: "approval_requested",
    title: "Knowledge proposal requested",
    summary: `${linkedProposal.sourceAgentName} proposed workspace knowledge: ${linkedProposal.title}`,
    severity: "warning",
    status: "pending"
  });
  tryRecordWorkspaceAuditEventSync({
    workspaceId,
    title: "Knowledge proposal requested",
    note: `${linkedProposal.sourceAgentName} proposed "${linkedProposal.title}".`,
    code: "knowledge.proposal_requested",
    data: {
      proposalId: linkedProposal.id,
      approvalId: linkedProposal.approvalId,
      sourceTaskQueueId: linkedProposal.sourceTaskQueueId,
      sourceAgentName: linkedProposal.sourceAgentName,
      operation: linkedProposal.operation
    }
  });
  return linkedProposal;
}
function validateOperationTarget(input) {
  if (input.operation === "create") {
    return;
  }
  if (!input.targetKnowledgePageId?.trim()) {
    throw new Error("Update proposals require targetKnowledgePageId.");
  }
  if (!input.baseUpdatedAt?.trim()) {
    throw new Error("Update proposals require baseUpdatedAt.");
  }
  if (!input.state.knowledgePages.some((page) => page.id === input.targetKnowledgePageId)) {
    throw new Error(`Knowledge page "${input.targetKnowledgePageId}" does not exist.`);
  }
}
function normalizeParentId(state, parentId) {
  const normalized = parentId?.trim();
  if (!normalized) {
    return void 0;
  }
  if (!state.knowledgePages.some((page) => page.id === normalized)) {
    throw new Error(`Parent knowledge page "${normalized}" does not exist.`);
  }
  return normalized;
}
function normalizeAssignmentEmployees(input) {
  if (input.assignmentMode === "all_agents") {
    return [];
  }
  const requested = uniqueStringValues(input.assignedEmployeeNames ?? []);
  const shouldAssignToSelf = input.assignToSelf ?? DEFAULT_SELECTED_ASSIGN_TO_SELF;
  const withSelf = shouldAssignToSelf && !requested.some((name) => sameValue(name, input.sourceAgentName)) ? [input.sourceAgentName, ...requested] : requested;
  const resolved = [];
  for (const name of uniqueStringValues(withSelf)) {
    const employee = input.state.activeEmployees.find((item) => sameValue(item.name, name));
    if (!employee) {
      throw new Error(`Assigned agent "${name}" does not exist.`);
    }
    resolved.push(employee.name);
  }
  return resolved;
}
function notifyKnowledgeProposalRequested(proposal) {
  const recipients = listWorkspaceMembershipsSync(proposal.workspaceId).filter((membership) => isManagerRole(membership.role)).map((membership) => readUserSync(membership.userId)).filter((user) => Boolean(user));
  createNotificationsSync(recipients.map((recipient) => ({
    workspaceId: proposal.workspaceId,
    recipientType: "human",
    recipientId: recipient.id,
    actorType: "agent",
    actorId: proposal.sourceAgentName,
    type: "knowledge.proposal_requested",
    resourceType: "approval",
    resourceId: proposal.approvalId ?? proposal.id,
    channelName: proposal.sourceChannelName,
    title: "Knowledge proposal requested",
    body: `${proposal.sourceAgentName} proposed workspace knowledge: ${proposal.title}.`,
    actionHref: "/approvals",
    severity: proposal.assignmentMode === "all_agents" ? "warning" : "info",
    dedupeKey: `knowledge.proposal_requested:${proposal.workspaceId}:${proposal.id}:${recipient.id}`,
    metadata: {
      proposalId: proposal.id,
      approvalId: proposal.approvalId,
      operation: proposal.operation,
      sourceAgentName: proposal.sourceAgentName,
      sourceTaskQueueId: proposal.sourceTaskQueueId,
      assignmentMode: proposal.assignmentMode
    }
  })));
}
function postKnowledgeProposalChannelMessage(proposal, code, knowledgePageId) {
  const statusText = code.endsWith("_approved") ? "approved" : code.endsWith("_rejected") ? "rejected" : "submitted for review";
  postNotificationChannelMessageSync({
    workspaceId: proposal.workspaceId,
    channelName: proposal.sourceChannelName ?? "",
    summary: `${proposal.sourceAgentName} ${statusText} knowledge proposal "${proposal.title}".`,
    code,
    data: {
      proposal_id: proposal.id,
      approval_id: proposal.approvalId,
      source_task_queue_id: proposal.sourceTaskQueueId,
      source_agent_name: proposal.sourceAgentName,
      knowledge_page_id: knowledgePageId,
      assignment_mode: proposal.assignmentMode
    }
  });
}
function recordKnowledgeProposalEvent(proposal, input) {
  const task = readQueuedTaskSync(proposal.sourceTaskQueueId);
  if (!task) {
    return;
  }
  const context = buildTaskExecutionEventContext(task);
  recordTaskExecutionEventSync2({
    ...context,
    type: input.type,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    status: input.status,
    data: {
      proposalId: proposal.id,
      approvalId: proposal.approvalId,
      operation: proposal.operation,
      sourceTaskQueueId: proposal.sourceTaskQueueId,
      sourceAgentName: proposal.sourceAgentName,
      assignmentMode: proposal.assignmentMode,
      ...input.data
    }
  });
}
function buildProposalPreview(proposal) {
  const operation = proposal.operation === "create" ? "Create" : "Update";
  const scope = proposal.assignmentMode === "all_agents" ? "all agents" : proposal.assignedEmployeeNames.length > 0 ? proposal.assignedEmployeeNames.join(", ") : "selected agents";
  const reason = proposal.reason ? ` Reason: ${proposal.reason}` : "";
  return `${operation} knowledge page "${proposal.title}" for ${scope}.${reason}`;
}
function isManagerRole(role) {
  return role === "owner" || role === "admin";
}
function normalizeOperation(value) {
  if (value === "create" || value === "update") {
    return value;
  }
  throw new Error("Knowledge proposal operation must be create or update.");
}
function requireMarkdownContent(value) {
  const content = value.trim();
  if (!content) {
    throw new Error("Knowledge proposal content is required.");
  }
  return content;
}
function assertNoSensitiveKnowledgeProposalText(value, label) {
  if (!value) {
    return;
  }
  if (containsSensitiveTokenMaterial(value)) {
    throw new Error(`${label} appears to contain credential or token material.`);
  }
}
function containsSensitiveTokenMaterial(value) {
  return [
    /GOOGLE_WORKSPACE_CLI_TOKEN/i,
    /"refresh_token"\s*:/i,
    /"access_token"\s*:/i,
    /"client_secret"\s*:/i,
    /"private_key"\s*:/i,
    /"credentials?"\s*:/i,
    /["']?authorization["']?\s*:\s*["']?(Bearer|Basic|ya29\.)/i,
    /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
    /\bya29\.[A-Za-z0-9._-]{20,}/i
  ].some((pattern) => pattern.test(value));
}
function requireTrimmed3(value, label) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}
function normalizeStringList2(value) {
  return uniqueStringValues((value ?? []).filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean));
}
function resolveTaskChannelName(task) {
  try {
    const parsed = JSON.parse(task.inputJson);
    const channel = parsed.channelName ?? parsed.channel;
    return typeof channel === "string" && channel.trim() ? channel.trim() : void 0;
  } catch {
    return void 0;
  }
}
function resolveApprovalChannelName(state, preferred) {
  if (preferred) {
    const channel = state.channels.find((item) => sameValue(item.name, preferred));
    if (channel) {
      return channel.name;
    }
  }
  const fallback = state.channels.find((channel) => channel.kind !== "direct") ?? state.channels[0];
  if (!fallback) {
    throw new Error("Knowledge proposal approvals require at least one workspace channel.");
  }
  return fallback.name;
}

// ../services/src/documents/operations.ts
function applyChannelDocumentBlockOperations(input) {
  const { state, document } = input;
  if (document.kind !== "markdown") {
    throw new Error(`Block operations are only supported for markdown channel documents.`);
  }
  const changeSet = createChannelDocumentChangeSet({
    documentId: document.id,
    actorId: input.actorId,
    actorType: input.actorType,
    baseVersionId: input.baseVersionId,
    operationsJson: JSON.stringify(input.operations),
    status: "pending",
    sourceMessageId: input.sourceMessageId,
    sourceTaskQueueId: input.sourceTaskQueueId
  });
  state.channelDocumentChangeSets.unshift(changeSet);
  const blocks = listChannelDocumentBlocks(state, document.id).map((block) => ({ ...block }));
  let appliedOperationCount = 0;
  let conflictCount = 0;
  for (const operation of input.operations) {
    if (operation.op === "replace_block") {
      const index = blocks.findIndex((block) => block.id === operation.blockId);
      if (index < 0 || blocks[index].revision !== operation.baseRevision) {
        conflictCount += 1;
        createConflict(state, document.id, operation.blockId, changeSet.id);
        continue;
      }
      blocks[index] = {
        ...blocks[index],
        heading: operation.heading ?? inferHeading(operation.contentMarkdown),
        contentMarkdown: operation.contentMarkdown,
        revision: blocks[index].revision + 1,
        updatedBy: input.actorId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      appliedOperationCount += 1;
      continue;
    }
    if (operation.op === "delete_block") {
      const index = blocks.findIndex((block) => block.id === operation.blockId);
      if (index < 0 || blocks[index].revision !== operation.baseRevision) {
        conflictCount += 1;
        createConflict(state, document.id, operation.blockId, changeSet.id);
        continue;
      }
      blocks.splice(index, 1);
      appliedOperationCount += 1;
      continue;
    }
    if (operation.op === "insert_after") {
      const insertIndex = operation.afterBlockId ? blocks.findIndex((block) => block.id === operation.afterBlockId) + 1 : 0;
      const nextIndex = insertIndex < 0 ? blocks.length : insertIndex;
      blocks.splice(nextIndex, 0, {
        id: `channel-doc-block-${createOpaqueId5()}`,
        documentId: document.id,
        parentId: void 0,
        type: "section",
        order: nextIndex,
        heading: operation.heading ?? inferHeading(operation.contentMarkdown),
        contentMarkdown: operation.contentMarkdown,
        revision: 1,
        updatedBy: input.actorId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      appliedOperationCount += 1;
    }
  }
  if (conflictCount > 0 && appliedOperationCount === 0) {
    changeSet.status = "conflicted";
    return { state, appliedOperationCount, conflictCount };
  }
  for (const [index, block] of blocks.entries()) {
    block.order = index;
  }
  state.channelDocumentBlocks = [
    ...state.channelDocumentBlocks.filter((block) => block.documentId !== document.id),
    ...blocks
  ];
  if (appliedOperationCount === 0) {
    changeSet.status = "rejected";
    return { state, appliedOperationCount, conflictCount };
  }
  const { document: updatedDocument, version } = updateChannelDocument({
    state,
    documentId: document.id,
    contentMarkdown: serializeChannelDocumentBlocks(blocks),
    summary: input.summary,
    updatedBy: input.actorId,
    updatedByType: input.actorType,
    triggerType: "handoff",
    sourceMessageId: input.sourceMessageId,
    sourceTaskQueueId: input.sourceTaskQueueId
  });
  changeSet.documentVersionId = version.id;
  changeSet.status = conflictCount > 0 ? "conflicted" : "applied";
  return {
    state,
    document: updatedDocument,
    version,
    appliedOperationCount,
    conflictCount
  };
}
function createConflict(state, documentId, blockId, changeSetId) {
  const previousChangeSetId = state.channelDocumentChangeSets.find((item) => item.documentId === documentId && item.status === "applied")?.id ?? `channel-doc-changeset-${createOpaqueId5()}`;
  state.channelDocumentConflicts.unshift(
    createChannelDocumentConflict({
      documentId,
      blockId,
      leftChangeSetId: previousChangeSetId,
      rightChangeSetId: changeSetId
    })
  );
}
function inferHeading(contentMarkdown) {
  const firstLine = contentMarkdown.split(/\r?\n/, 1)[0] ?? "";
  return /^#+\s+/.test(firstLine) ? firstLine.replace(/^#+\s+/, "").trim() : void 0;
}
function createOpaqueId5() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ../services/src/documents/sync.ts
var DOC_COORDINATOR = "\u7CFB\u7EDF\u63D0\u793A";
function listChannelDocumentsSync(channelName, workspaceId) {
  return listChannelDocuments(ensureWorkspaceStateSync(workspaceId), channelName);
}
function listChannelDocumentVersionsSync(documentId, workspaceId) {
  return listChannelDocumentVersions(ensureWorkspaceStateSync(workspaceId), documentId);
}
function listChannelDocumentBlocksSync(documentId, workspaceId) {
  return listChannelDocumentBlocks(ensureWorkspaceStateSync(workspaceId), documentId);
}
function readChannelDocumentSync(documentId, workspaceId) {
  return readChannelDocument(ensureWorkspaceStateSync(workspaceId), documentId);
}
function recordExternalSheetOperationRunSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const { document } = readChannelDocument(state, input.channelDocumentId);
  if (document.storageMode !== "external" || document.externalProvider !== "google_workspace") {
    throw new Error(`Channel document "${document.title}" is not an external Google Workspace document.`);
  }
  const actorId = input.actorId.trim();
  const intent = input.intent.trim();
  const requestSummary = input.requestSummary.trim();
  if (!actorId) {
    throw new Error("External sheet operation actor id is required.");
  }
  if (!intent) {
    throw new Error("External sheet operation intent is required.");
  }
  if (!requestSummary) {
    throw new Error("External sheet operation request summary is required.");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const run2 = {
    id: `external-sheet-run-${createOpaqueId()}`,
    workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
    channelDocumentId: document.id,
    provider: "google_workspace",
    externalFileId: input.externalFileId?.trim() || document.externalFileId || "",
    actorType: input.actorType,
    actorId,
    delegatedUserId: input.delegatedUserId?.trim() || void 0,
    delegatedUserDisplayName: input.delegatedUserDisplayName?.trim() || void 0,
    delegatedGoogleEmail: input.delegatedGoogleEmail?.trim().toLowerCase() || void 0,
    credentialDelegationId: input.credentialDelegationId?.trim() || void 0,
    status: input.status ?? "queued",
    intent,
    operationType: input.operationType,
    rangeA1: input.rangeA1?.trim() || void 0,
    affectedRows: normalizeOptionalCount(input.affectedRows),
    affectedCells: normalizeOptionalCount(input.affectedCells),
    requestSummary,
    responseSummary: input.responseSummary?.trim() || void 0,
    resultArtifactPath: input.resultArtifactPath?.trim() || void 0,
    resultArtifactFileName: input.resultArtifactFileName?.trim() || void 0,
    resultArtifactMediaType: input.resultArtifactMediaType?.trim() || void 0,
    resultArtifactSizeBytes: normalizeOptionalCount(input.resultArtifactSizeBytes),
    resultPreview: input.resultPreview,
    errorCode: input.errorCode?.trim() || void 0,
    errorMessage: input.errorMessage?.trim() || void 0,
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt?.trim() || void 0
  };
  state.externalSheetOperationRuns ??= [];
  state.externalSheetOperationRuns.unshift(run2);
  return writeAndReturnExternalSheetRun(state, run2.id, workspaceId);
}
function createChannelDocumentSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  if (input.createdByType === "human") {
    ensureLegacyHumanMemberForDisplayName(state, input.createdBy, workspaceId);
  }
  assertCanCreateChannelDocument(state, input.channelName, input.createdBy, input.createdByType);
  const { document, version } = createChannelDocument({
    state,
    channelName: input.channelName,
    title: input.title,
    kind: input.kind,
    storageMode: input.storageMode,
    contentMarkdown: input.contentMarkdown,
    summary: input.summary,
    contentJson: input.contentJson,
    linkedTableId: input.linkedTableId,
    externalProvider: input.externalProvider,
    externalFileId: input.externalFileId,
    externalUrl: input.externalUrl,
    externalRevisionId: input.externalRevisionId,
    externalSyncStatus: input.externalSyncStatus,
    externalMimeType: input.externalMimeType,
    externalUpdatedAt: input.externalUpdatedAt,
    createdBy: input.createdBy,
    createdByType: input.createdByType,
    triggerType: input.triggerType,
    sourceMessageId: input.sourceMessageId,
    sourceAttachmentId: input.sourceAttachmentId,
    sourceAttachmentStoredPath: input.sourceAttachmentStoredPath,
    sourceTaskQueueId: input.sourceTaskQueueId
  });
  if (document.kind === "markdown") {
    rebuildChannelDocumentBlocksForVersion({
      state,
      document,
      version,
      actorName: document.createdBy
    });
  }
  state.channelDocumentChangeSets.unshift(
    createChannelDocumentChangeSet({
      documentId: document.id,
      actorId: document.createdBy,
      actorType: input.createdByType,
      baseVersionId: version.id,
      documentVersionId: version.id,
      operationsJson: JSON.stringify([{ op: "replace_document", title: document.title }]),
      status: "applied",
      sourceMessageId: input.sourceMessageId,
      sourceTaskQueueId: input.sourceTaskQueueId,
      createdAt: version.createdAt
    })
  );
  state.ledger.unshift({
    title: "Channel document created",
    note: `Created document "${document.title}" in channel ${input.channelName}.`,
    code: "channel_document.created",
    data: {
      channel_name: input.channelName,
      document_id: document.id,
      document_title: document.title,
      created_by: document.createdBy
    }
  });
  pushWorkspaceMessageIfChannel(state, input.channelName, {
    speaker: DOC_COORDINATOR,
    role: "agent",
    summary: `Document "${document.title}" was created.`,
    code: "channel_document.created_notice",
    data: {
      channel_name: input.channelName,
      document_id: document.id,
      document_title: document.title,
      actor_name: document.createdBy
    }
  }, workspaceId);
  return {
    state: writeWorkspaceStateSync(state, workspaceId),
    document,
    version
  };
}
function createExternalGoogleSheetChannelDocumentSync(input, workspaceId) {
  const externalFileId = input.externalFileId.trim();
  const externalUrl = input.externalUrl.trim();
  if (!externalFileId) {
    throw new Error("Google Sheet file id is required.");
  }
  if (!externalUrl) {
    throw new Error("Google Sheet URL is required.");
  }
  const result = createChannelDocumentSync({
    channelName: input.channelName,
    title: input.title,
    kind: "sheet",
    storageMode: "external",
    contentMarkdown: [
      `Google Sheet: ${input.title.trim() || externalFileId}`,
      "",
      externalUrl
    ].join("\n"),
    summary: input.summary?.trim() || "Google Sheets external document",
    externalProvider: "google_workspace",
    externalFileId,
    externalUrl,
    externalRevisionId: input.externalRevisionId?.trim() || void 0,
    externalSyncStatus: "ok",
    externalMimeType: input.externalMimeType?.trim() || "application/vnd.google-apps.spreadsheet",
    externalUpdatedAt: input.externalUpdatedAt?.trim() || (/* @__PURE__ */ new Date()).toISOString(),
    createdBy: input.createdBy,
    createdByType: input.createdByType,
    triggerType: input.triggerType ?? "manual",
    sourceTaskQueueId: input.sourceTaskQueueId
  }, workspaceId);
  if (input.recordMetadataRun !== false) {
    recordExternalSheetOperationRunSync({
      channelDocumentId: result.document.id,
      externalFileId,
      actorType: input.createdByType,
      actorId: input.createdBy,
      status: "succeeded",
      intent: "Link Google Sheet to channel document",
      operationType: "metadata_refresh",
      requestSummary: `Linked Google Sheet ${externalFileId}.`,
      responseSummary: "External sheet metadata stored in AgentSpace.",
      startedAt: result.version.createdAt,
      finishedAt: result.version.createdAt
    }, workspaceId);
  }
  return {
    ...result,
    state: ensureWorkspaceStateSync(workspaceId)
  };
}
function updateChannelDocumentSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const existing = readChannelDocument(state, input.documentId);
  assertCanEditChannelDocument(state, existing.document, input.updatedBy, input.updatedByType);
  const previousVersionId = existing.document.currentVersionId;
  if (input.baseVersionId && existing.document.currentVersionId !== input.baseVersionId) {
    const nextTitle2 = input.title?.trim();
    recordChannelDocumentConflictSync({
      documentId: existing.document.id,
      actorId: input.updatedBy,
      actorType: input.updatedByType,
      baseVersionId: input.baseVersionId,
      operationsJson: JSON.stringify([
        {
          op: "replace_document",
          title: nextTitle2 || existing.document.title,
          contentMarkdown: input.contentMarkdown,
          contentJson: input.contentJson,
          summary: input.summary
        }
      ]),
      sourceMessageId: input.sourceMessageId,
      sourceTaskQueueId: input.sourceTaskQueueId
    }, workspaceId);
    throw new Error(`Document "${existing.document.title}" was updated by someone else. Reload the latest version before saving again.`);
  }
  const nextTitle = input.title?.trim();
  if (nextTitle && nextTitle !== existing.document.title) {
    const { document: renamedDocument, previousTitle } = renameChannelDocument({
      state,
      documentId: existing.document.id,
      nextTitle
    });
    state.ledger.unshift({
      title: "Channel document renamed",
      note: `Renamed document "${previousTitle}" to "${renamedDocument.title}" in channel ${renamedDocument.channelName}.`,
      code: "channel_document.renamed",
      data: {
        channel_name: renamedDocument.channelName,
        document_id: renamedDocument.id,
        previous_title: previousTitle,
        next_title: renamedDocument.title
      }
    });
  }
  const { document, version } = updateChannelDocument({
    state,
    documentId: input.documentId,
    contentMarkdown: input.contentMarkdown,
    contentJson: input.contentJson,
    summary: input.summary,
    updatedBy: input.updatedBy,
    updatedByType: input.updatedByType,
    triggerType: input.triggerType,
    sourceMessageId: input.sourceMessageId,
    sourceAttachmentId: input.sourceAttachmentId,
    sourceAttachmentStoredPath: input.sourceAttachmentStoredPath,
    sourceTaskQueueId: input.sourceTaskQueueId
  });
  if (document.kind === "markdown") {
    rebuildChannelDocumentBlocksForVersion({
      state,
      document,
      version,
      actorName: document.updatedBy
    });
  }
  state.channelDocumentChangeSets.unshift(
    createChannelDocumentChangeSet({
      documentId: document.id,
      actorId: document.updatedBy,
      actorType: input.updatedByType,
      baseVersionId: previousVersionId,
      documentVersionId: version.id,
      operationsJson: JSON.stringify([{ op: "replace_document", title: document.title }]),
      status: "applied",
      sourceMessageId: input.sourceMessageId,
      sourceTaskQueueId: input.sourceTaskQueueId,
      createdAt: version.createdAt
    })
  );
  const summary = version.summary;
  state.ledger.unshift({
    title: "Channel document updated",
    note: `Updated document "${document.title}" in channel ${document.channelName}.`,
    code: "channel_document.updated",
    data: {
      channel_name: document.channelName,
      document_id: document.id,
      document_title: document.title,
      updated_by: document.updatedBy
    }
  });
  pushWorkspaceMessageIfChannel(state, document.channelName, {
    speaker: DOC_COORDINATOR,
    role: "agent",
    summary: `Document "${document.title}" was updated.${summary ? ` Summary: ${summary}` : ""}`.trim(),
    code: "channel_document.updated_notice",
    data: {
      channel_name: document.channelName,
      document_id: document.id,
      document_title: document.title,
      actor_name: document.updatedBy
    }
  }, workspaceId);
  return {
    state: writeWorkspaceStateSync(state, workspaceId),
    document,
    version
  };
}
function normalizeOptionalCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.max(0, Math.round(value));
}
function writeAndReturnExternalSheetRun(state, runId, workspaceId) {
  const persisted = writeWorkspaceStateSync(state, workspaceId);
  const run2 = persisted.externalSheetOperationRuns.find((item) => item.id === runId);
  if (!run2) {
    throw new Error(`External sheet operation run "${runId}" could not be read back.`);
  }
  return run2;
}
function ensureLegacyHumanMemberForDisplayName(state, displayName, workspaceId) {
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName || state.humanMembers.some((member) => sameValue(member.name, trimmedDisplayName))) {
    return;
  }
  const workspaceMember = listWorkspaceMemberUsersSync(workspaceId ?? DEFAULT_WORKSPACE_ID).find((member) => sameValue(member.displayName, trimmedDisplayName));
  if (!workspaceMember) {
    return;
  }
  state.humanMembers.push({
    name: workspaceMember.displayName,
    role: formatWorkspaceRole(workspaceMember.role)
  });
}
function formatWorkspaceRole(role) {
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Member";
}
function recordChannelDocumentConflictSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const document = state.channelDocuments.find((item) => item.id === input.documentId);
  if (!document) {
    throw new Error(`Channel document "${input.documentId}" does not exist.`);
  }
  const currentVersionId = document.currentVersionId;
  const existingBlockId = state.channelDocumentBlocks.find((block) => block.documentId === document.id)?.id ?? "document-root";
  const leftChangeSetId = state.channelDocumentChangeSets.find(
    (changeSet) => changeSet.documentId === document.id && changeSet.baseVersionId === currentVersionId
  )?.id ?? `channel-doc-changeset-${createOpaqueId()}`;
  const rightChangeSet = createChannelDocumentChangeSet({
    documentId: document.id,
    actorId: input.actorId,
    actorType: input.actorType,
    baseVersionId: input.baseVersionId,
    operationsJson: input.operationsJson,
    status: "conflicted",
    sourceMessageId: input.sourceMessageId,
    sourceTaskQueueId: input.sourceTaskQueueId
  });
  state.channelDocumentChangeSets.unshift(rightChangeSet);
  state.channelDocumentConflicts.unshift(
    createChannelDocumentConflict({
      documentId: document.id,
      blockId: existingBlockId,
      leftChangeSetId,
      rightChangeSetId: rightChangeSet.id
    })
  );
  state.ledger.unshift({
    title: "Channel document conflict",
    note: `Conflict detected while updating document "${document.title}" in channel ${document.channelName}.`,
    code: "channel_document.conflict",
    data: {
      channel_name: document.channelName,
      document_id: document.id,
      document_title: document.title,
      actor_id: input.actorId
    }
  });
  pushWorkspaceMessageToChannel(state, document.channelName, {
    speaker: DOC_COORDINATOR,
    role: "agent",
    summary: `Document "${document.title}" update conflicted with a newer version.`,
    code: "channel_document.conflict_notice",
    data: {
      channel_name: document.channelName,
      document_id: document.id,
      document_title: document.title,
      actor_name: input.actorId
    },
    status: "error"
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}

// ../services/src/document-permissions/document-permissions.ts
var AgentDocumentPermissionError = class extends Error {
  code;
  documentId;
  agentName;
  action;
  constructor(input) {
    super(input.message);
    this.name = "AgentDocumentPermissionError";
    this.code = input.code;
    this.agentName = input.agentName;
    this.action = input.action;
    this.documentId = input.documentId;
  }
};
function resolveAgentDocumentContextSync(input) {
  const state = readWorkspaceStateSync(input.workspaceId);
  const requestedDocumentIds = new Set((input.documentIds ?? []).map((id) => id.trim()).filter(Boolean));
  const explicitGrants = listDocumentAgentAccessSync({
    workspaceId: input.workspaceId,
    subjectId: input.agentName
  });
  const explicitByDocumentId = new Map(explicitGrants.map((grant) => [grant.documentId, grant]));
  const result = /* @__PURE__ */ new Map();
  for (const document of state.channelDocuments.filter((item) => item.status === "active")) {
    if (requestedDocumentIds.size > 0 && !requestedDocumentIds.has(document.id)) {
      continue;
    }
    const channelRole = input.channelName && sameValue(document.channelName, input.channelName) && agentBelongsToChannel(state, input.agentName, input.channelName) ? resolveChannelContextRole(state, document, input.agentName) : void 0;
    const explicitGrant = explicitByDocumentId.get(document.id);
    const explicitRole = resolveExplicitRoleForContext(explicitGrant?.role, document, input.channelName);
    const role = maxDocumentRole(channelRole, explicitRole);
    if (!role) {
      continue;
    }
    const source = explicitRole && allowsDocumentAction(explicitRole, "forward") && (!input.channelName || !sameValue(document.channelName, input.channelName)) ? "forward_grant" : explicitRole && (!channelRole || roleRank(explicitRole) <= roleRank(channelRole)) ? "explicit_grant" : "channel_context";
    result.set(document.id, {
      document,
      role,
      source,
      allowedActions: getAllowedDocumentActions(role)
    });
  }
  return [...result.values()].sort(
    (left, right) => left.document.title.localeCompare(right.document.title, "zh-CN", { sensitivity: "base" })
  );
}
function assertAgentDocumentActionAllowedSync(input) {
  const context = resolveAgentDocumentForAction(input);
  if (context && allowsDocumentAction(context.role, input.action)) {
    return context;
  }
  const code = input.action === "view" ? "provider.document_read_denied" : input.action === "edit" ? "provider.document_edit_denied" : input.action === "forward" ? "provider.document_forward_denied" : "provider.document_edit_denied";
  throw new AgentDocumentPermissionError({
    code,
    agentName: input.agentName,
    action: input.action,
    documentId: input.documentId,
    message: `${code}: Agent "${input.agentName}" cannot ${input.action} document "${input.documentId ?? input.externalFileId ?? "unknown"}".`
  });
}
function createDocumentPermissionRequestSync2(input) {
  assertAgentAssignableRole2(input.requestedRole);
  const request = createDocumentPermissionRequestSync(input);
  const document = request.documentId ? tryReadChannelDocument(input.workspaceId, request.documentId) : void 0;
  const targetChannelName = request.requestedForChannelName ?? document?.channelName;
  if (targetChannelName) {
    postSystemMessageSafely({
      workspaceId: input.workspaceId,
      channelName: targetChannelName,
      summary: `${request.requestedByAgentName} requested ${request.requestedRole} access${document ? ` to "${document.title}"` : " to an external document"}.`,
      code: "document_permission.requested",
      data: {
        requestId: request.id,
        documentId: request.documentId,
        requestedRole: request.requestedRole,
        requestedByAgentName: request.requestedByAgentName
      }
    });
  }
  const approvers = resolveDocumentPermissionApproverRecipients(input.workspaceId, request, document);
  createNotificationsSync(approvers.map((recipient) => ({
    workspaceId: input.workspaceId,
    recipientType: "human",
    recipientId: recipient.userId,
    actorType: "agent",
    actorId: request.requestedByAgentName,
    type: "document_permission.requested",
    resourceType: "approval",
    resourceId: request.id,
    channelName: targetChannelName,
    title: "Document permission requested",
    body: `${request.requestedByAgentName} requested ${request.requestedRole} access${document ? ` to "${document.title}"` : " to an external document"}.`,
    actionHref: "/approvals",
    severity: "warning",
    dedupeKey: `document_permission.requested:${input.workspaceId}:${request.id}:${recipient.userId}`,
    metadata: {
      requestId: request.id,
      documentId: request.documentId,
      externalFileId: request.externalFileId,
      requestedRole: request.requestedRole,
      requestedByAgentName: request.requestedByAgentName,
      requestedForChannelName: request.requestedForChannelName
    }
  })));
  if (input.sourceTaskId) {
    recordTaskExecutionEventSync2({
      workspaceId: input.workspaceId,
      taskId: input.sourceTaskId,
      channelName: targetChannelName,
      agentId: request.requestedByAgentName,
      type: "approval_requested",
      title: "Document permission requested",
      summary: `${request.requestedByAgentName} requested ${request.requestedRole} document access.`,
      severity: "warning",
      status: "pending",
      data: {
        requestId: request.id,
        documentId: request.documentId,
        externalFileId: request.externalFileId,
        requestedRole: request.requestedRole
      }
    });
  }
  tryRecordWorkspaceAuditEventSync({
    workspaceId: input.workspaceId,
    title: "Document permission requested",
    note: `${request.requestedByAgentName} requested ${request.requestedRole} document access.`,
    code: "document_permission.requested",
    data: {
      requestId: request.id,
      documentId: request.documentId,
      externalFileId: request.externalFileId,
      requestedRole: request.requestedRole,
      requestedByAgentName: request.requestedByAgentName,
      requestedForChannelName: request.requestedForChannelName
    }
  });
  return request;
}
function listDocumentPermissionRequestsSync2(input) {
  return listDocumentPermissionRequestsSync({
    workspaceId: input.workspaceId,
    requestedByAgentName: input.requestedByAgentName,
    documentId: input.documentId
  });
}
function resolveDocumentPermissionApproverRecipients(workspaceId, request, document) {
  const recipients = /* @__PURE__ */ new Map();
  for (const membership of listWorkspaceMembershipsSync(workspaceId)) {
    if (membership.role !== "owner" && membership.role !== "admin") {
      continue;
    }
    const user = readUserSync(membership.userId);
    recipients.set(membership.userId, {
      userId: membership.userId,
      displayName: user?.displayName
    });
  }
  if (document) {
    const state = readWorkspaceStateSync(workspaceId);
    for (const access3 of state.channelDocumentAccesses) {
      if (access3.documentId !== document.id || access3.actorType !== "human" || !allowsDocumentAction(access3.role, "manage")) {
        continue;
      }
      const user = findWorkspaceUserByDisplayName(workspaceId, access3.actorId);
      if (user) {
        recipients.set(user.id, { userId: user.id, displayName: user.displayName });
      }
    }
  }
  if (request.externalProvider === "google_workspace" && (request.externalFileId || request.externalUrl)) {
    for (const credential of listGoogleOAuthCredentialsSync(workspaceId)) {
      if (credential.status !== "active" || !credential.refreshTokenEncrypted) {
        continue;
      }
      const user = readUserSync(credential.userId);
      recipients.set(credential.userId, { userId: credential.userId, displayName: user?.displayName });
    }
  }
  return Array.from(recipients.values());
}
function findWorkspaceUserByDisplayName(workspaceId, displayName) {
  const normalized = displayName.trim();
  if (!normalized) {
    return null;
  }
  for (const membership of listWorkspaceMembershipsSync(workspaceId)) {
    const user = readUserSync(membership.userId);
    if (user && sameValue(user.displayName, normalized)) {
      return { id: user.id, displayName: user.displayName };
    }
  }
  return null;
}
function resolveExplicitRoleForContext(role, document, channelName) {
  if (!role) {
    return void 0;
  }
  if (!channelName || sameValue(document.channelName, channelName)) {
    return role;
  }
  return role === "forwarder" ? role : void 0;
}
function resolveAgentDocumentForAction(input) {
  const contexts = resolveAgentDocumentContextSync({
    workspaceId: input.workspaceId,
    agentName: input.agentName,
    channelName: input.channelName,
    documentIds: input.documentId ? [input.documentId] : void 0
  });
  if (input.documentId) {
    return contexts.find((context) => context.document.id === input.documentId);
  }
  if (input.externalProvider && input.externalFileId) {
    return contexts.find(
      (context) => context.document.externalProvider === input.externalProvider && context.document.externalFileId === input.externalFileId
    );
  }
  return void 0;
}
function resolveChannelContextRole(state, document, agentName) {
  const access3 = state.channelDocumentAccesses.find(
    (item) => item.documentId === document.id && item.actorType === "agent" && sameValue(item.actorId, agentName)
  );
  if (access3?.role === "owner") {
    return void 0;
  }
  return access3?.role ?? "editor";
}
function agentBelongsToChannel(state, agentName, channelName) {
  const employee = state.activeEmployees.find((item) => sameValue(item.name, agentName));
  return Boolean(employee?.channels.some((name) => sameValue(name, channelName)));
}
function maxDocumentRole(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return roleRank(left) <= roleRank(right) ? left : right;
}
function roleRank(role) {
  if (role === "owner") {
    return 0;
  }
  if (role === "forwarder") {
    return 1;
  }
  if (role === "editor") {
    return 2;
  }
  return 3;
}
function assertAgentAssignableRole2(role) {
  if (role !== "viewer" && role !== "editor" && role !== "forwarder") {
    throw new Error("Agents can only request or receive viewer, editor, or forwarder access.");
  }
}
function tryReadChannelDocument(workspaceId, documentId) {
  try {
    return readChannelDocumentSync(documentId, workspaceId).document;
  } catch {
    return void 0;
  }
}
function postSystemMessageSafely(input) {
  postNotificationChannelMessageSync({
    workspaceId: input.workspaceId,
    channelName: input.channelName,
    summary: input.summary,
    code: input.code,
    data: input.data
  });
}

// src/runtime-output-manifests.ts
import {
  copyFileSync,
  existsSync as existsSync6,
  lstatSync,
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync4,
  readdirSync as readdirSync2,
  realpathSync,
  statSync as statSync3,
  writeFileSync as writeFileSync4
} from "node:fs";
import { basename as basename4, dirname as dirname5, extname as extname3, isAbsolute, join as join10, parse, relative, resolve as resolve7 } from "node:path";

// src/runtime-output.ts
import { join as join9 } from "node:path";
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
  return join9(workDir, RUNTIME_OUTPUT_DIR);
}
function getRuntimeOutputArtifactsDir(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_ARTIFACTS_DIR);
}
function getRuntimeOutputManifestPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_MANIFEST_FILE);
}
function getRuntimeOutputChannelDocumentsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE);
}
function getRuntimeOutputSkillImportsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_SKILL_IMPORTS_FILE);
}
function getRuntimeOutputKnowledgeProposalsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_FILE);
}
function getRuntimeOutputExternalSheetsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE);
}
function getRuntimeOutputExternalSheetsResultsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE);
}
function getRuntimeOutputExternalGoogleDocsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE);
}
function getRuntimeOutputExternalDocumentsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE);
}
function getRuntimeOutputPermissionRequestsPath(workDir) {
  return join9(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE);
}

// src/runtime-output-manifests.ts
var MAX_OUTPUT_ATTACHMENTS = 5;
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
var ALLOWED_SKILL_IMPORT_HOSTS = /* @__PURE__ */ new Set([
  "github.com",
  "raw.githubusercontent.com",
  "skills.sh",
  "clawhub.ai"
]);
var SENSITIVE_RUNTIME_OUTPUT_PATTERNS = [
  /GOOGLE_WORKSPACE_CLI_TOKEN/i,
  /"refresh_token"\s*:/i,
  /"access_token"\s*:/i,
  /"client_secret"\s*:/i,
  /"private_key"\s*:/i,
  /"credentials?"\s*:/i,
  /["']?authorization["']?\s*:\s*["']?(Bearer|Basic|ya29\.)/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
  /\bya29\.[A-Za-z0-9._-]{20,}/i
];
function readAgentOutputManifest(workDir) {
  return readManifestObject(getRuntimeOutputManifestPath(workDir), {});
}
function writeAgentOutputManifest(workDir, manifest) {
  writeManifestFile(workDir, RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH, manifest);
}
function appendAgentOutputAttachment(workDir, attachment, text) {
  const manifest = readAgentOutputManifest(workDir);
  const next = {
    ...manifest,
    attachments: [...Array.isArray(manifest.attachments) ? manifest.attachments : [], attachment]
  };
  if (typeof text === "string") {
    next.text = text;
  }
  writeAgentOutputManifest(workDir, next);
  return next;
}
function setAgentOutputText(workDir, text) {
  const manifest = readAgentOutputManifest(workDir);
  const next = {
    ...manifest,
    text
  };
  writeAgentOutputManifest(workDir, next);
  return next;
}
function readChannelDocumentsManifest(workDir) {
  return readManifestObject(getRuntimeOutputChannelDocumentsPath(workDir), { documents: [] });
}
function appendChannelDocumentManifestEntry(workDir, entry) {
  const manifest = readChannelDocumentsManifest(workDir);
  const next = {
    ...manifest,
    documents: [...Array.isArray(manifest.documents) ? manifest.documents : [], entry]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH, next);
  return next;
}
function readSkillImportsManifest(workDir) {
  return readManifestObject(getRuntimeOutputSkillImportsPath(workDir), { imports: [] });
}
function appendSkillImportManifestEntry(workDir, entry) {
  const manifest = readSkillImportsManifest(workDir);
  const next = {
    ...manifest,
    imports: [...Array.isArray(manifest.imports) ? manifest.imports : [], entry]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH, next);
  return next;
}
function readKnowledgeProposalsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputKnowledgeProposalsPath(workDir), { version: 1, proposals: [] });
  if (value && typeof value === "object" && Array.isArray(value.proposals)) {
    return value;
  }
  return { version: 1, proposals: [] };
}
function appendKnowledgeProposalManifestEntry(workDir, entry) {
  const manifest = readKnowledgeProposalsManifest(workDir);
  const next = {
    version: 1,
    generatedBy: "agent-space-cli",
    proposals: [...Array.isArray(manifest.proposals) ? manifest.proposals : [], entry]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH, next);
  return next;
}
function readExternalSheetsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputExternalSheetsPath(workDir), { operations: [] });
  if (Array.isArray(value)) {
    return { operations: value };
  }
  if (value && typeof value === "object" && Array.isArray(value.operations)) {
    return value;
  }
  return { operations: [] };
}
function appendExternalSheetOperation(workDir, operation) {
  const manifest = readExternalSheetsManifest(workDir);
  const next = {
    operations: [...manifest.operations, operation]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH, next);
  return next;
}
function readExternalSheetsResultsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputExternalSheetsResultsPath(workDir), { version: 1, results: [] });
  if (value && typeof value === "object" && Array.isArray(value.results)) {
    return value;
  }
  return { version: 1, results: [] };
}
function appendExternalSheetResult(workDir, result) {
  const manifest = readExternalSheetsResultsManifest(workDir);
  const next = {
    version: 1,
    results: [...manifest.results, result]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH, next);
  return next;
}
function readExternalGoogleDocsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputExternalGoogleDocsPath(workDir), { version: 1, operations: [] });
  if (Array.isArray(value)) {
    return { version: 1, operations: value };
  }
  if (value && typeof value === "object" && Array.isArray(value.operations)) {
    return value;
  }
  return { version: 1, operations: [] };
}
function appendExternalGoogleDocOperation(workDir, operation) {
  const manifest = readExternalGoogleDocsManifest(workDir);
  const next = {
    version: 1,
    operations: [...manifest.operations, operation]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH, next);
  return next;
}
function readExternalDocumentsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputExternalDocumentsPath(workDir), { version: 1, operations: [] });
  if (value && typeof value === "object" && Array.isArray(value.operations)) {
    return value;
  }
  return { version: 1, operations: [] };
}
function appendExternalDocumentLinkOperation(workDir, operation) {
  return appendExternalDocumentOperation(workDir, operation);
}
function appendExternalDocumentCreateGoogleSheetOperation(workDir, operation) {
  return appendExternalDocumentOperation(workDir, operation);
}
function appendExternalDocumentOperation(workDir, operation) {
  const manifest = readExternalDocumentsManifest(workDir);
  const next = {
    version: 1,
    generatedBy: "agent-space-cli",
    operations: [...manifest.operations, operation]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH, next);
  return next;
}
function readDocumentPermissionRequestsManifest(workDir) {
  const value = readManifestValue(getRuntimeOutputPermissionRequestsPath(workDir), { version: 1, requests: [] });
  if (value && typeof value === "object" && Array.isArray(value.requests)) {
    return value;
  }
  return { version: 1, requests: [] };
}
function appendDocumentPermissionRequest(workDir, request) {
  const manifest = readDocumentPermissionRequestsManifest(workDir);
  const next = {
    version: 1,
    generatedBy: "agent-space-cli",
    requests: [...manifest.requests, request]
  };
  writeManifestFile(workDir, RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH, next);
  return next;
}
function prepareRuntimeOutputArtifactReference(input) {
  const workDir = resolve7(input.workDir);
  const sourcePath = input.sourcePath.trim();
  if (!sourcePath) {
    throw new Error("File path is required.");
  }
  if (isAbsolute(sourcePath) && !input.copyOutsideWorkDir) {
    throw new Error("Absolute file paths require --copy.");
  }
  const sourceAbsolutePath = isAbsolute(sourcePath) ? resolve7(sourcePath) : resolve7(workDir, sourcePath);
  if (!existsSync6(sourceAbsolutePath)) {
    throw new Error(`File does not exist: ${sourcePath}`);
  }
  if (containsSymlinkBetween(workDir, sourceAbsolutePath) && !input.copyOutsideWorkDir) {
    throw new Error(`File path cannot pass through a symlink: ${sourcePath}`);
  }
  const sourceStats = statSync3(sourceAbsolutePath);
  if (!sourceStats.isFile()) {
    throw new Error(`Path is not a file: ${sourcePath}`);
  }
  if (sourceStats.size <= 0) {
    throw new Error(`File is empty: ${sourcePath}`);
  }
  const artifactsDir = getRuntimeOutputArtifactsDir(workDir);
  const realWorkDir = realpathSync(workDir);
  const realSourcePath = realpathSync(sourceAbsolutePath);
  const sourceInsideWorkDir = isPathInside(realWorkDir, realSourcePath);
  const artifactsInsideWorkDir = resolve7(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const sourceInsideArtifacts = sourceInsideWorkDir && isPathInside(artifactsInsideWorkDir, sourceAbsolutePath);
  if (!sourceInsideWorkDir && !input.copyOutsideWorkDir) {
    throw new Error("File must be inside workDir unless --copy is provided.");
  }
  if (sourceInsideArtifacts) {
    return {
      absolutePath: sourceAbsolutePath,
      relativePath: normalizePathSeparators(relative(workDir, sourceAbsolutePath)),
      copied: false
    };
  }
  mkdirSync5(artifactsDir, { recursive: true });
  const targetPath = resolveUniqueArtifactPath(artifactsDir, basename4(sourceAbsolutePath));
  copyFileSync(sourceAbsolutePath, targetPath);
  return {
    absolutePath: targetPath,
    relativePath: normalizePathSeparators(relative(workDir, targetPath)),
    copied: true
  };
}
function validateRuntimeOutputManifests(workDir) {
  const errors = [];
  const warnings = [];
  validateAgentOutputManifest(workDir, errors);
  validateChannelDocumentsManifest(workDir, errors);
  validateSkillImportsManifest(workDir, errors);
  validateKnowledgeProposalsManifest(workDir, errors);
  validateExternalSheetsManifest(workDir, errors);
  validateExternalSheetsResultsManifest(workDir, errors);
  validateExternalGoogleDocsManifest(workDir, errors);
  validateExternalDocumentsManifest(workDir, errors);
  validatePermissionRequestsManifest(workDir, errors);
  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}
function createRuntimeOutputPreview(workDir) {
  const resolvedWorkDir = resolve7(workDir);
  const validation = validateRuntimeOutputManifests(resolvedWorkDir);
  return {
    workDir: resolvedWorkDir,
    manifests: {
      agentOutput: summarizeAgentOutputManifest(resolvedWorkDir),
      channelDocuments: summarizeChannelDocumentsManifest(resolvedWorkDir),
      skillImports: summarizeSkillImportsManifest(resolvedWorkDir),
      knowledgeProposals: summarizeKnowledgeProposalsManifest(resolvedWorkDir),
      externalSheets: summarizeExternalSheetsManifest(resolvedWorkDir),
      externalSheetResults: summarizeExternalSheetsResultsManifest(resolvedWorkDir),
      externalGoogleDocs: summarizeExternalGoogleDocsManifest(resolvedWorkDir),
      externalDocuments: summarizeExternalDocumentsManifest(resolvedWorkDir),
      permissionRequests: summarizePermissionRequestsManifest(resolvedWorkDir)
    },
    warnings: validation.warnings,
    errors: validation.errors
  };
}
function collectRuntimeOutputBundleFiles(workDir) {
  const files = /* @__PURE__ */ new Map();
  const runtimeOutputDir = resolve7(workDir, "runtime-output");
  if (!existsSync6(runtimeOutputDir)) {
    return [];
  }
  for (const manifestPath of RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATHS) {
    const absoluteManifestPath = resolve7(workDir, manifestPath);
    if (existsSync6(absoluteManifestPath)) {
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
    const stats = statSync3(absolutePath);
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
      contentBase64: readFileSync4(absolutePath).toString("base64")
    });
  }
  return bundleFiles;
}
function validateAgentOutputManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (parsed.text !== void 0 && typeof parsed.text !== "string") {
    errors.push(`${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH}.text must be a string.`);
  }
  if (parsed.attachments !== void 0 && !Array.isArray(parsed.attachments)) {
    errors.push(`${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH}.attachments must be an array.`);
    return;
  }
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  if (attachments.length > MAX_OUTPUT_ATTACHMENTS) {
    errors.push(`agent-output attachments exceed the limit of ${MAX_OUTPUT_ATTACHMENTS}.`);
  }
  let totalBytes = 0;
  for (const [index, attachment] of attachments.entries()) {
    const label = `${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH}.attachments[${index}]`;
    if (!isRecord(attachment)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (attachment.name !== void 0 && typeof attachment.name !== "string") {
      errors.push(`${label}.name must be a string.`);
    }
    if (attachment.mediaType !== void 0 && typeof attachment.mediaType !== "string") {
      errors.push(`${label}.mediaType must be a string.`);
    }
    const file = validateManifestFileReference(workDir, attachment.path, label, errors, {
      requireFile: true,
      requireNonEmpty: true
    });
    if (!file) {
      continue;
    }
    if (file.sizeBytes > MAX_OUTPUT_ATTACHMENT_BYTES) {
      errors.push(`${label}.path exceeds the single attachment size limit: ${file.relativePath}`);
    }
    totalBytes += file.sizeBytes;
  }
  if (totalBytes > MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES) {
    errors.push("agent-output attachments exceed the total attachment size limit.");
  }
}
function validateChannelDocumentsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputChannelDocumentsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (!Array.isArray(parsed.documents)) {
    errors.push(`${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH}.documents must be an array.`);
    return;
  }
  for (const [index, document] of parsed.documents.entries()) {
    const label = `${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH}.documents[${index}]`;
    if (!isRecord(document)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof document.title !== "string" || document.title.trim().length === 0) {
      errors.push(`${label}.title is required.`);
    }
    if (document.mode !== void 0 && document.mode !== "create" && document.mode !== "update" && document.mode !== "create_or_update") {
      errors.push(`${label}.mode must be create, update, or create_or_update.`);
    }
    if (document.triggerType !== void 0 && document.triggerType !== "agent" && document.triggerType !== "handoff") {
      errors.push(`${label}.triggerType must be agent or handoff.`);
    }
    const contentPath = typeof document.contentPath === "string" ? document.contentPath.trim() : "";
    const operations = Array.isArray(document.operations) ? document.operations : [];
    if (!contentPath && operations.length === 0) {
      errors.push(`${label} must include contentPath or operations[].`);
    }
    if (contentPath) {
      validateManifestFileReference(workDir, contentPath, `${label}.contentPath`, errors, { requireFile: true });
    }
    if (document.operations !== void 0 && !Array.isArray(document.operations)) {
      errors.push(`${label}.operations must be an array.`);
      continue;
    }
    for (const [operationIndex, operation] of operations.entries()) {
      validateChannelDocumentOperation(workDir, operation, `${label}.operations[${operationIndex}]`, errors);
    }
  }
}
function validateChannelDocumentOperation(workDir, operation, label, errors) {
  if (!isRecord(operation)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (operation.op !== "replace_block" && operation.op !== "insert_after" && operation.op !== "delete_block") {
    errors.push(`${label}.op is not supported.`);
    return;
  }
  if (operation.op === "replace_block" || operation.op === "delete_block") {
    if (typeof operation.blockId !== "string" || operation.blockId.trim().length === 0) {
      errors.push(`${label}.blockId is required.`);
    }
    if (typeof operation.baseRevision !== "number" || !Number.isFinite(operation.baseRevision)) {
      errors.push(`${label}.baseRevision is required.`);
    }
  }
  if (operation.op === "replace_block" || operation.op === "insert_after") {
    const contentPath = typeof operation.contentPath === "string" ? operation.contentPath.trim() : "";
    if (!contentPath) {
      errors.push(`${label}.contentPath is required.`);
      return;
    }
    validateManifestFileReference(workDir, contentPath, `${label}.contentPath`, errors, { requireFile: true });
  }
}
function validateSkillImportsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputSkillImportsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (!Array.isArray(parsed.imports)) {
    errors.push(`${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}.imports must be an array.`);
    return;
  }
  for (const [index, entry] of parsed.imports.entries()) {
    const label = `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}.imports[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    const sources = [
      typeof entry.url === "string" && entry.url.trim().length > 0 ? "url" : "",
      typeof entry.path === "string" && entry.path.trim().length > 0 ? "path" : "",
      typeof entry.archivePath === "string" && entry.archivePath.trim().length > 0 ? "archivePath" : ""
    ].filter(Boolean);
    if (sources.length !== 1) {
      errors.push(`${label} must provide exactly one of url, path, or archivePath.`);
    }
    if (entry.conflict !== void 0 && entry.conflict !== "reject" && entry.conflict !== "rename" && entry.conflict !== "replace" && entry.conflict !== "skip") {
      errors.push(`${label}.conflict must be reject, rename, replace, or skip.`);
    }
    if (entry.assignToSelf !== void 0 && typeof entry.assignToSelf !== "boolean") {
      errors.push(`${label}.assignToSelf must be a boolean.`);
    }
    if (typeof entry.url === "string" && entry.url.trim().length > 0) {
      validateSkillImportUrl(entry.url, `${label}.url`, errors);
    }
    if (typeof entry.path === "string" && entry.path.trim().length > 0) {
      validateSkillArtifactReference(workDir, entry.path, `${label}.path`, errors, false);
    }
    if (typeof entry.archivePath === "string" && entry.archivePath.trim().length > 0) {
      validateSkillArtifactReference(workDir, entry.archivePath, `${label}.archivePath`, errors, true);
    }
  }
}
function validateKnowledgeProposalsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputKnowledgeProposalsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync4(manifestPath, "utf8"), RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH}.version must be 1.`);
  }
  if (parsed.generatedBy !== "agent-space-cli") {
    errors.push(`${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH}.generatedBy must be agent-space-cli; use agent-space output knowledge propose-create/propose-update.`);
  }
  if (!Array.isArray(parsed.proposals)) {
    errors.push(`${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH}.proposals must be an array.`);
    return;
  }
  for (const [index, proposal] of parsed.proposals.entries()) {
    const label = `${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH}.proposals[${index}]`;
    if (!isRecord(proposal)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (proposal.operation !== "create" && proposal.operation !== "update") {
      errors.push(`${label}.operation must be create or update.`);
    }
    if (typeof proposal.title !== "string" || proposal.title.trim().length === 0) {
      errors.push(`${label}.title is required.`);
    }
    if (proposal.summary !== void 0 && typeof proposal.summary !== "string") {
      errors.push(`${label}.summary must be a string.`);
    }
    if (proposal.reason !== void 0 && typeof proposal.reason !== "string") {
      errors.push(`${label}.reason must be a string.`);
    }
    if (proposal.parentId !== void 0 && proposal.parentId !== null && typeof proposal.parentId !== "string") {
      errors.push(`${label}.parentId must be a string or null.`);
    }
    if (proposal.assignmentMode !== void 0 && proposal.assignmentMode !== "all_agents" && proposal.assignmentMode !== "selected_agents") {
      errors.push(`${label}.assignmentMode must be all_agents or selected_agents.`);
    }
    if (proposal.assignToSelf !== void 0 && typeof proposal.assignToSelf !== "boolean") {
      errors.push(`${label}.assignToSelf must be a boolean.`);
    }
    if (proposal.tags !== void 0 && (!Array.isArray(proposal.tags) || proposal.tags.some((tag) => typeof tag !== "string"))) {
      errors.push(`${label}.tags must be an array of strings.`);
    }
    if (proposal.assignedEmployeeNames !== void 0 && (!Array.isArray(proposal.assignedEmployeeNames) || proposal.assignedEmployeeNames.some((name) => typeof name !== "string"))) {
      errors.push(`${label}.assignedEmployeeNames must be an array of strings.`);
    }
    if (proposal.operation === "update") {
      if (typeof proposal.targetKnowledgePageId !== "string" || proposal.targetKnowledgePageId.trim().length === 0) {
        errors.push(`${label}.targetKnowledgePageId is required for update.`);
      }
      if (typeof proposal.baseUpdatedAt !== "string" || proposal.baseUpdatedAt.trim().length === 0) {
        errors.push(`${label}.baseUpdatedAt is required for update.`);
      }
    }
    const file = validateManifestFileReference(workDir, proposal.contentPath, `${label}.contentPath`, errors, {
      requireFile: true,
      requireNonEmpty: true
    });
    if (!file) {
      continue;
    }
    if (file.sizeBytes > MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES) {
      errors.push(`${label}.contentPath exceeds the 256 KB knowledge proposal size limit.`);
    }
    if (!isRuntimeOutputArtifactsReference(file.relativePath)) {
      errors.push(`${label}.contentPath must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/.`);
    }
    if (!file.relativePath.toLocaleLowerCase("en-US").endsWith(".md")) {
      errors.push(`${label}.contentPath must point to a Markdown .md file.`);
    }
    validateNoSensitiveOutput(readFileSync4(file.absolutePath, "utf8"), `${label}.contentPath`, errors);
  }
}
function validateExternalSheetsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalSheetsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  const operations = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations : null;
  if (!operations) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH} must be an array or an object with operations[].`);
    return;
  }
  for (const [index, operation] of operations.entries()) {
    const label = `${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH}.operations[${index}]`;
    if (!isRecord(operation)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    const operationType = normalizeExternalSheetOperationType2(operation.operationType);
    if (typeof operation.documentId !== "string" || operation.documentId.trim().length === 0) {
      errors.push(`${label}.documentId is required.`);
    }
    if (typeof operation.intent !== "string" || operation.intent.trim().length === 0) {
      errors.push(`${label}.intent is required.`);
    }
    if (!operationType) {
      errors.push(`${label}.operationType is not supported.`);
      continue;
    }
    if (operationType === "batch_update") {
      if (!Array.isArray(operation.requests) || operation.requests.length === 0) {
        errors.push(`${label}.requests must be a non-empty array.`);
      } else if (operation.requests.some((request) => !isRecord(request))) {
        errors.push(`${label}.requests entries must be objects.`);
      }
      continue;
    }
    if (typeof operation.rangeA1 !== "string" || operation.rangeA1.trim().length === 0) {
      errors.push(`${label}.rangeA1 is required.`);
    }
    if (operationType !== "read") {
      validateExternalSheetValues(operation.values, `${label}.values`, errors);
    }
  }
}
function validateExternalSheetsResultsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalSheetsResultsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync4(manifestPath, "utf8"), RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH}.version must be 1.`);
  }
  if (!Array.isArray(parsed.results)) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH}.results must be an array.`);
    return;
  }
  for (const [index, result] of parsed.results.entries()) {
    const label = `${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH}.results[${index}]`;
    if (!isRecord(result)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof result.documentId !== "string" || result.documentId.trim().length === 0) {
      errors.push(`${label}.documentId is required.`);
    }
    const operation = normalizeExternalSheetOperationType2(result.operation ?? result.operationType);
    if (!operation) {
      errors.push(`${label}.operation must be read, append_rows, update_values, or batch_update.`);
    }
    if (typeof result.summary !== "string" || result.summary.trim().length === 0) {
      errors.push(`${label}.summary is required.`);
    }
    if (result.status !== void 0 && result.status !== "succeeded" && result.status !== "failed") {
      errors.push(`${label}.status must be succeeded or failed.`);
    }
    if (result.range !== void 0 && typeof result.range !== "string") {
      errors.push(`${label}.range must be a string.`);
    }
    if (result.requestSummary !== void 0 && typeof result.requestSummary !== "string") {
      errors.push(`${label}.requestSummary must be a string.`);
    }
    if (result.rowCount !== void 0 && !isNonNegativeInteger(result.rowCount)) {
      errors.push(`${label}.rowCount must be a non-negative integer.`);
    }
    if (result.cellCount !== void 0 && !isNonNegativeInteger(result.cellCount)) {
      errors.push(`${label}.cellCount must be a non-negative integer.`);
    }
    if (result.durationMs !== void 0 && !isNonNegativeInteger(result.durationMs)) {
      errors.push(`${label}.durationMs must be a non-negative integer.`);
    }
    if (result.headers !== void 0 && (!Array.isArray(result.headers) || result.headers.some((item) => typeof item !== "string"))) {
      errors.push(`${label}.headers must be an array of strings.`);
    }
    if (result.rowsPreview !== void 0 && !Array.isArray(result.rowsPreview)) {
      errors.push(`${label}.rowsPreview must be an array.`);
    }
    if (result.truncated !== void 0 && typeof result.truncated !== "boolean") {
      errors.push(`${label}.truncated must be a boolean.`);
    }
    if (result.preview !== void 0 && !isRecord(result.preview)) {
      errors.push(`${label}.preview must be an object.`);
    }
    const normalizedPath = normalizeManifestRelativePath(result.resultPath);
    if (!normalizedPath) {
      errors.push(`${label}.resultPath must be a non-empty relative path.`);
      continue;
    }
    if (!isRuntimeOutputArtifactsReference(normalizedPath.relativePath)) {
      errors.push(`${label}.resultPath must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/.`);
      continue;
    }
    if (!normalizedPath.relativePath.toLocaleLowerCase("en-US").endsWith(".json")) {
      errors.push(`${label}.resultPath must point to a JSON file.`);
    }
    const file = validateManifestFileReference(workDir, normalizedPath.relativePath, `${label}.resultPath`, errors, {
      requireFile: true,
      requireNonEmpty: true
    });
    if (!file) {
      continue;
    }
    validateNoSensitiveOutput(readFileSync4(file.absolutePath, "utf8"), `${label}.resultPath`, errors);
  }
}
function validateExternalGoogleDocsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalGoogleDocsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync4(manifestPath, "utf8"), RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (isRecord(parsed) && parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH}.version must be 1.`);
  }
  const operations = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations : null;
  if (!operations) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH} must be an array or an object with operations[].`);
    return;
  }
  for (const [index, operation] of operations.entries()) {
    validateExternalGoogleDocOperation(workDir, operation, `${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH}.operations[${index}]`, errors);
  }
}
function validateExternalGoogleDocOperation(workDir, operation, label, errors) {
  if (!isRecord(operation)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  const operationType = normalizeExternalGoogleDocOperationType(operation.operationType);
  if (typeof operation.documentId !== "string" || operation.documentId.trim().length === 0) {
    errors.push(`${label}.documentId is required.`);
  }
  if (typeof operation.intent !== "string" || operation.intent.trim().length === 0) {
    errors.push(`${label}.intent is required.`);
  }
  if (operation.requestSummary !== void 0 && typeof operation.requestSummary !== "string") {
    errors.push(`${label}.requestSummary must be a string.`);
  }
  if (!operationType) {
    errors.push(`${label}.operationType must be append_text or batch_update.`);
    return;
  }
  if (operationType === "append_text") {
    if (typeof operation.text !== "string" || operation.text.length === 0) {
      errors.push(`${label}.text is required.`);
    }
    if (typeof operation.text === "string") {
      validateNoSensitiveOutput(operation.text, `${label}.text`, errors);
    }
    if (operation.textPath !== void 0) {
      validateExternalGoogleDocArtifactReference(workDir, operation.textPath, `${label}.textPath`, errors, { json: false });
    }
    return;
  }
  if (!Array.isArray(operation.requests) || operation.requests.length === 0) {
    errors.push(`${label}.requests must be a non-empty array.`);
  } else if (operation.requests.some((request) => !isRecord(request))) {
    errors.push(`${label}.requests entries must be objects.`);
  }
  if (operation.requestsPath !== void 0) {
    validateExternalGoogleDocArtifactReference(workDir, operation.requestsPath, `${label}.requestsPath`, errors, { json: true });
  }
}
function validateExternalDocumentsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalDocumentsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH}.version must be 1.`);
  }
  if (parsed.generatedBy !== "agent-space-cli") {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH}.generatedBy must be agent-space-cli; use agent-space output external-document link-google-sheet/create-google-sheet.`);
  }
  if (!Array.isArray(parsed.operations)) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH}.operations must be an array.`);
    return;
  }
  for (const [index, operation] of parsed.operations.entries()) {
    const label = `${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH}.operations[${index}]`;
    if (!isRecord(operation)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (operation.operationType === "link_google_sheet") {
      validateExternalDocumentLinkOperation(operation, label, errors);
      continue;
    }
    if (operation.operationType === "create_google_sheet") {
      validateExternalDocumentCreateGoogleSheetOperation(workDir, operation, label, errors);
      continue;
    }
    errors.push(`${label}.operationType must be link_google_sheet or create_google_sheet.`);
  }
}
function validateExternalDocumentLinkOperation(operation, label, errors) {
  const sources = [
    typeof operation.sourceDocumentId === "string" && operation.sourceDocumentId.trim().length > 0 ? "sourceDocumentId" : "",
    typeof operation.externalFileId === "string" && operation.externalFileId.trim().length > 0 ? "externalFileId" : "",
    typeof operation.externalUrl === "string" && operation.externalUrl.trim().length > 0 ? "externalUrl" : ""
  ].filter(Boolean);
  if (sources.length === 0) {
    errors.push(`${label} requires sourceDocumentId, externalFileId, or externalUrl.`);
  }
  validateExternalDocumentCommonFields(operation, label, errors);
}
function validateExternalDocumentCreateGoogleSheetOperation(workDir, operation, label, errors) {
  if (typeof operation.externalFileId !== "string" || operation.externalFileId.trim().length === 0) {
    errors.push(`${label}.externalFileId is required.`);
  }
  if (typeof operation.externalUrl !== "string" || operation.externalUrl.trim().length === 0) {
    errors.push(`${label}.externalUrl is required.`);
  } else if (extractGoogleWorkspaceFileId(operation.externalUrl) !== operation.externalFileId) {
    errors.push(`${label}.externalUrl must point to externalFileId.`);
  }
  if (operation.externalMimeType !== void 0 && operation.externalMimeType !== "application/vnd.google-apps.spreadsheet") {
    errors.push(`${label}.externalMimeType must be application/vnd.google-apps.spreadsheet.`);
  }
  if (operation.externalRevisionId !== void 0 && typeof operation.externalRevisionId !== "string") {
    errors.push(`${label}.externalRevisionId must be a string.`);
  }
  if (operation.externalUpdatedAt !== void 0 && typeof operation.externalUpdatedAt !== "string") {
    errors.push(`${label}.externalUpdatedAt must be a string.`);
  }
  if (operation.parentFolderId !== void 0 && typeof operation.parentFolderId !== "string") {
    errors.push(`${label}.parentFolderId must be a string.`);
  }
  const resultPath = normalizeManifestRelativePath(operation.resultPath);
  if (!resultPath) {
    errors.push(`${label}.resultPath is required.`);
  } else {
    if (!isRuntimeOutputArtifactsReference(resultPath.relativePath)) {
      errors.push(`${label}.resultPath must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/.`);
    }
    if (!resultPath.relativePath.toLocaleLowerCase("en-US").endsWith(".json")) {
      errors.push(`${label}.resultPath must point to a JSON file.`);
    }
    const file = validateManifestFileReference(workDir, resultPath.relativePath, `${label}.resultPath`, errors, {
      requireFile: true,
      requireNonEmpty: true
    });
    if (file) {
      const content = readFileSync4(file.absolutePath, "utf8");
      validateNoSensitiveOutput(content, `${label}.resultPath`, errors);
      validateCreateGoogleSheetResultArtifact(content, operation.externalFileId, operation.externalUrl, `${label}.resultPath`, errors);
    }
  }
  validateExternalDocumentCommonFields(operation, label, errors);
}
function validateExternalDocumentCommonFields(operation, label, errors) {
  if (typeof operation.targetChannel !== "string" || operation.targetChannel.trim().length === 0) {
    errors.push(`${label}.targetChannel is required.`);
  }
  if (typeof operation.title !== "string" || operation.title.trim().length === 0) {
    errors.push(`${label}.title is required.`);
  }
  if (operation.summary !== void 0 && typeof operation.summary !== "string") {
    errors.push(`${label}.summary must be a string.`);
  }
}
function validateCreateGoogleSheetResultArtifact(content, externalFileId, externalUrl, label, errors) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    errors.push(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${label} must be a JSON object.`);
    return;
  }
  if (typeof externalFileId === "string" && parsed.id !== void 0 && parsed.id !== externalFileId) {
    errors.push(`${label}.id must match externalFileId.`);
  }
  if (parsed.mimeType !== void 0 && parsed.mimeType !== "application/vnd.google-apps.spreadsheet") {
    errors.push(`${label}.mimeType must be application/vnd.google-apps.spreadsheet.`);
  }
  const webViewFileId = typeof parsed.webViewLink === "string" ? extractGoogleWorkspaceFileId(parsed.webViewLink) : void 0;
  if (typeof externalFileId === "string" && webViewFileId && webViewFileId !== externalFileId) {
    errors.push(`${label}.webViewLink must point to externalFileId.`);
  }
  if (typeof externalUrl === "string" && typeof parsed.webViewLink === "string") {
    const manifestFileId = extractGoogleWorkspaceFileId(externalUrl);
    if (manifestFileId && webViewFileId && manifestFileId !== webViewFileId) {
      errors.push(`${label}.webViewLink must point to externalUrl file id.`);
    }
  }
}
function validatePermissionRequestsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputPermissionRequestsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH}.version must be 1.`);
  }
  if (parsed.generatedBy !== "agent-space-cli") {
    errors.push(`${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH}.generatedBy must be agent-space-cli; use agent-space output permission request-document.`);
  }
  if (!Array.isArray(parsed.requests)) {
    errors.push(`${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH}.requests must be an array.`);
    return;
  }
  for (const [index, request] of parsed.requests.entries()) {
    const label = `${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH}.requests[${index}]`;
    if (!isRecord(request)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (!isAgentAssignableDocumentRole(request.requestedRole)) {
      errors.push(`${label}.requestedRole must be viewer, editor, or forwarder.`);
    }
    if (typeof request.reason !== "string" || request.reason.trim().length === 0) {
      errors.push(`${label}.reason is required.`);
    }
    const sources = [
      typeof request.documentId === "string" && request.documentId.trim().length > 0 ? "documentId" : "",
      typeof request.externalFileId === "string" && request.externalFileId.trim().length > 0 ? "externalFileId" : "",
      typeof request.externalUrl === "string" && request.externalUrl.trim().length > 0 ? "externalUrl" : ""
    ].filter(Boolean);
    if (sources.length === 0) {
      errors.push(`${label} requires documentId, externalFileId, or externalUrl.`);
    }
    if (request.externalProvider !== void 0 && request.externalProvider !== "google_workspace" && request.externalProvider !== "notion" && request.externalProvider !== "microsoft_365") {
      errors.push(`${label}.externalProvider is not supported.`);
    }
    if ((request.externalFileId || request.externalUrl) && !request.externalProvider) {
      errors.push(`${label}.externalProvider is required for external document requests.`);
    }
    if (request.targetChannel !== void 0 && typeof request.targetChannel !== "string") {
      errors.push(`${label}.targetChannel must be a string.`);
    }
  }
}
function summarizeAgentOutputManifest(workDir) {
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, attachmentCount: 0, totalAttachmentBytes: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  if (!isRecord(parsed)) {
    return { exists: true, attachmentCount: 0, totalAttachmentBytes: 0 };
  }
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  let totalAttachmentBytes = 0;
  for (const attachment of attachments) {
    if (!isRecord(attachment)) {
      continue;
    }
    const file = resolveManifestPath(workDir, attachment.path);
    if (!file || !existsSync6(file.absolutePath)) {
      continue;
    }
    const stats = statSync3(file.absolutePath);
    if (stats.isFile()) {
      totalAttachmentBytes += stats.size;
    }
  }
  return {
    exists: true,
    text: typeof parsed.text === "string" ? parsed.text : void 0,
    attachmentCount: attachments.length,
    totalAttachmentBytes
  };
}
function summarizeChannelDocumentsManifest(workDir) {
  const manifestPath = getRuntimeOutputChannelDocumentsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, documentOperations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  if (!isRecord(parsed) || !Array.isArray(parsed.documents)) {
    return { exists: true, documentOperations: 0 };
  }
  const documentOperations = parsed.documents.reduce((count, document) => {
    if (!isRecord(document)) {
      return count;
    }
    const contentOperationCount = typeof document.contentPath === "string" && document.contentPath.trim() ? 1 : 0;
    const blockOperationCount = Array.isArray(document.operations) ? document.operations.length : 0;
    return count + contentOperationCount + blockOperationCount;
  }, 0);
  return { exists: true, documentOperations };
}
function summarizeSkillImportsManifest(workDir) {
  const manifestPath = getRuntimeOutputSkillImportsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, imports: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    imports: isRecord(parsed) && Array.isArray(parsed.imports) ? parsed.imports.length : 0
  };
}
function summarizeKnowledgeProposalsManifest(workDir) {
  const manifestPath = getRuntimeOutputKnowledgeProposalsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, proposals: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    proposals: isRecord(parsed) && Array.isArray(parsed.proposals) ? parsed.proposals.length : 0
  };
}
function summarizeExternalSheetsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalSheetsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, operations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  const operations = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations : [];
  return {
    exists: true,
    operations: operations.length
  };
}
function summarizeExternalSheetsResultsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalSheetsResultsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, results: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    results: isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results.length : 0
  };
}
function summarizeExternalGoogleDocsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalGoogleDocsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, operations: 0, operationSummaries: [] };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  const operations = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations : [];
  const operationSummaries = operations.filter(isRecord).map((operation) => ({
    documentId: typeof operation.documentId === "string" ? operation.documentId : "",
    operationType: normalizeExternalGoogleDocOperationType(operation.operationType) ?? "append_text",
    intent: typeof operation.intent === "string" ? operation.intent : ""
  })).filter((operation) => operation.documentId && operation.intent);
  return {
    exists: true,
    operations: operations.length,
    operationSummaries
  };
}
function summarizeExternalDocumentsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalDocumentsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, operations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    operations: isRecord(parsed) && Array.isArray(parsed.operations) ? parsed.operations.length : 0
  };
}
function summarizePermissionRequestsManifest(workDir) {
  const manifestPath = getRuntimeOutputPermissionRequestsPath(workDir);
  if (!existsSync6(manifestPath)) {
    return { exists: false, requests: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    requests: isRecord(parsed) && Array.isArray(parsed.requests) ? parsed.requests.length : 0
  };
}
function addAgentOutputBundleReferences(workDir, files) {
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const parsed = existsSync6(manifestPath) ? parseJsonManifestQuiet(manifestPath) : void 0;
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
  const absolutePath = resolve7(workDir, normalized.relativePath);
  if (!existsSync6(absolutePath)) {
    return;
  }
  const linkStats = lstatSync(absolutePath);
  if (linkStats.isSymbolicLink()) {
    throw new Error(`Runtime output bundle path cannot be a symlink: ${normalized.relativePath}`);
  }
  const stats = statSync3(absolutePath);
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
  const entries = readdirSync2(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    const absolutePath = join10(absoluteDir, entry.name);
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
      if (resolved && existsSync6(resolved.absolutePath)) {
        files.set(resolved.relativePath, resolved.absolutePath);
      }
    }
  }
}
function validateSkillImportUrl(value, label, errors) {
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    errors.push(`${label} must be a valid URL.`);
    return;
  }
  if (parsed.protocol !== "https:") {
    errors.push(`${label} must use HTTPS.`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_SKILL_IMPORT_HOSTS.has(hostname) && !hostname.endsWith(".clawhub.ai")) {
    errors.push(`${label} host is not allowed.`);
  }
}
function validateSkillArtifactReference(workDir, value, label, errors, archive) {
  const normalized = normalizeManifestRelativePath(value);
  if (!normalized) {
    errors.push(`${label} must be a non-empty relative path.`);
    return;
  }
  if (!isRuntimeOutputArtifactsReference(normalized.relativePath)) {
    errors.push(`${label} must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/.`);
    return;
  }
  if (archive && !normalized.relativePath.toLocaleLowerCase("en-US").endsWith(".zip")) {
    errors.push(`${label} must point to a .zip file.`);
  }
  validateManifestFileReference(workDir, normalized.relativePath, label, errors, {
    requireExists: true,
    requireFile: archive
  });
}
function validateExternalSheetValues(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty two-dimensional array.`);
    return;
  }
  if (value.some((row) => !Array.isArray(row))) {
    errors.push(`${label} must be a two-dimensional array.`);
  }
}
function validateExternalGoogleDocArtifactReference(workDir, value, label, errors, options) {
  const normalized = normalizeManifestRelativePath(value);
  if (!normalized) {
    errors.push(`${label} must be a non-empty relative path.`);
    return;
  }
  if (!isRuntimeOutputArtifactsReference(normalized.relativePath)) {
    errors.push(`${label} must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/.`);
    return;
  }
  if (options.json && !normalized.relativePath.toLocaleLowerCase("en-US").endsWith(".json")) {
    errors.push(`${label} must point to a JSON file.`);
  }
  const file = validateManifestFileReference(workDir, normalized.relativePath, label, errors, {
    requireFile: true,
    requireNonEmpty: true
  });
  if (!file) {
    return;
  }
  const content = readFileSync4(file.absolutePath, "utf8");
  validateNoSensitiveOutput(content, label, errors);
  if (options.json) {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((request) => !isRecord(request))) {
        errors.push(`${label} must contain a non-empty JSON array of objects.`);
      }
    } catch (error) {
      errors.push(`${label} JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
function validateNoSensitiveOutput(value, label, errors) {
  if (SENSITIVE_RUNTIME_OUTPUT_PATTERNS.some((pattern) => pattern.test(value))) {
    errors.push(`${label} appears to contain Google Workspace token material; remove credentials before uploading runtime-output.`);
  }
}
function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function normalizeExternalSheetOperationType2(value) {
  if (value === "read" || value === "append_rows" || value === "update_values" || value === "batch_update") {
    return value;
  }
  return null;
}
function normalizeExternalGoogleDocOperationType(value) {
  if (value === "append_text" || value === "batch_update") {
    return value;
  }
  return null;
}
function extractGoogleWorkspaceFileId(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return void 0;
  }
  const match = /\/(?:spreadsheets|document)\/d\/([^/?#]+)/.exec(trimmed);
  return match?.[1] ? decodeURIComponent(match[1]) : void 0;
}
function isAgentAssignableDocumentRole(value) {
  return value === "viewer" || value === "editor" || value === "forwarder";
}
function validateManifestFileReference(workDir, value, label, errors, options) {
  const normalized = normalizeManifestRelativePath(value);
  if (!normalized) {
    errors.push(`${label} must be a non-empty relative path.`);
    return null;
  }
  const resolved = resolveManifestPath(workDir, normalized.relativePath);
  if (!resolved) {
    errors.push(`${label} escapes workDir: ${normalized.relativePath}`);
    return null;
  }
  if (!existsSync6(resolved.absolutePath)) {
    if (options.requireExists !== false) {
      errors.push(`${label} does not exist: ${normalized.relativePath}`);
    }
    return null;
  }
  if (containsSymlinkBetween(workDir, resolved.absolutePath)) {
    errors.push(`${label} cannot pass through a symlink: ${normalized.relativePath}`);
    return null;
  }
  const stats = statSync3(resolved.absolutePath);
  if (options.requireFile && !stats.isFile()) {
    errors.push(`${label} is not a file: ${normalized.relativePath}`);
    return null;
  }
  if (options.requireNonEmpty && stats.size <= 0) {
    errors.push(`${label} is empty: ${normalized.relativePath}`);
    return null;
  }
  return {
    relativePath: normalized.relativePath,
    absolutePath: resolved.absolutePath,
    sizeBytes: stats.size
  };
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
  const absolutePath = resolve7(workDir, normalized.relativePath);
  if (!isPathInside(resolve7(workDir), absolutePath)) {
    return null;
  }
  if (existsSync6(absolutePath)) {
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
function readManifestObject(path, fallback) {
  const value = readManifestValue(path, fallback);
  return isRecord(value) ? value : fallback;
}
function readManifestValue(path, fallback) {
  if (!existsSync6(path)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return fallback;
  }
}
function writeManifestFile(workDir, relativePath, value) {
  const absolutePath = resolve7(workDir, relativePath);
  mkdirSync5(dirname5(absolutePath), { recursive: true });
  writeFileSync4(absolutePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function parseJsonManifest(path, relativePath, errors) {
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch (error) {
    errors.push(`${relativePath} JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return void 0;
  }
}
function parseJsonManifestQuiet(path) {
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return void 0;
  }
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function resolveUniqueArtifactPath(artifactsDir, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const parsed = parse(safeFileName);
  let candidate = join10(artifactsDir, safeFileName);
  let index = 2;
  while (existsSync6(candidate)) {
    candidate = join10(artifactsDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}
function sanitizeFileName(value) {
  const clean = basename4(value).replace(/[^\w .-]+/g, "-").replace(/^-+|-+$/g, "");
  if (clean.trim().length > 0 && clean !== "." && clean !== "..") {
    return clean;
  }
  return `artifact${extname3(value)}`;
}
function containsSymlinkBetween(baseDir, targetPath) {
  const relativePath = relative(baseDir, targetPath);
  if (!relativePath || relativePath === ".") {
    return false;
  }
  let currentPath = baseDir;
  for (const segment of relativePath.split(/[\\/]+/).filter((item) => item.length > 0)) {
    currentPath = join10(currentPath, segment);
    if (existsSync6(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
      return true;
    }
  }
  return false;
}
function isPathInside(rootDir, candidatePath) {
  const relativePath = relative(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
function normalizePathSeparators(value) {
  return value.replace(/\\/g, "/");
}

// src/document-runtime-output.ts
var RUNTIME_OUTPUT_ARTIFACTS_PREFIX = "runtime-output/artifacts/";
var GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
var RESULT_MEDIA_TYPE = "application/json";
function applyDocumentRuntimeOutputOperations(input) {
  const warnings = [];
  const statusMessages = [];
  const externalDocumentLinks = [];
  const permissionRequests = [];
  const provenanceWarnings = assertControlledDocumentRuntimeOutputManifests(input.workDir);
  warnings.push(...provenanceWarnings);
  statusMessages.push(...provenanceWarnings);
  if (provenanceWarnings.length > 0) {
    return {
      warnings,
      statusMessages,
      externalDocumentLinks,
      permissionRequests
    };
  }
  for (const request of readDocumentPermissionRequestsManifest(input.workDir).requests) {
    const result = applyDocumentPermissionRequestManifestEntry(input, request);
    permissionRequests.push(result);
    statusMessages.push(result.message);
    if (result.status === "failed") {
      warnings.push(result.message);
    }
  }
  for (const operation of readExternalDocumentsManifest(input.workDir).operations) {
    const result = applyExternalDocumentManifestEntry(input, operation);
    externalDocumentLinks.push(result);
    statusMessages.push(result.message);
    if (result.status === "failed") {
      warnings.push(result.message);
    }
  }
  return {
    warnings,
    statusMessages,
    externalDocumentLinks,
    permissionRequests
  };
}
function assertControlledDocumentRuntimeOutputManifests(workDir) {
  return [
    assertControlledDocumentRuntimeOutputManifest(
      getRuntimeOutputPermissionRequestsPath(workDir),
      RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH,
      "agent-space output permission request-document"
    ),
    assertControlledDocumentRuntimeOutputManifest(
      getRuntimeOutputExternalDocumentsPath(workDir),
      RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH,
      "agent-space output external-document link-google-sheet/create-google-sheet"
    )
  ].filter((message) => Boolean(message));
}
function assertControlledDocumentRuntimeOutputManifest(path, relativePath, command) {
  try {
    const raw = readFileIfExists(path);
    if (!raw) {
      return void 0;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return void 0;
    }
    if (parsed.generatedBy === "agent-space-cli") {
      return void 0;
    }
    return `${relativePath} \u5DF2\u88AB\u62D2\u7EDD\uFF1A\u8BF7\u4F7F\u7528 ${command} \u751F\u6210\u53D7\u63A7 manifest\uFF0C\u4E0D\u8981\u624B\u5199 JSON\u3002`;
  } catch (error) {
    return `${relativePath} \u5DF2\u88AB\u62D2\u7EDD\uFF1Amanifest \u65E0\u6CD5\u9A8C\u8BC1\u6765\u6E90\uFF08${errorMessage(error)}\uFF09\u3002`;
  }
}
function readFileIfExists(path) {
  try {
    return readFileSync5(path, "utf8");
  } catch {
    return void 0;
  }
}
function applyDocumentPermissionRequestManifestEntry(context, entry) {
  try {
    const documentId = normalizeOptional4(entry.documentId);
    const externalFileId = normalizeOptional4(entry.externalFileId) ?? extractGoogleWorkspaceFileId2(entry.externalUrl);
    const externalUrl = normalizeOptional4(entry.externalUrl);
    const request = createDocumentPermissionRequestSync2({
      workspaceId: context.workspaceId,
      documentId,
      externalProvider: normalizeExternalProvider2(entry.externalProvider ?? (externalFileId || externalUrl ? "google_workspace" : void 0)),
      externalFileId,
      externalUrl,
      requestedRole: entry.requestedRole,
      requestedByAgentName: context.actorName,
      requestedForChannelName: normalizeOptional4(entry.targetChannel),
      triggeredByUserId: context.requestedByUserId,
      reason: entry.reason,
      sourceTaskId: context.sourceTaskQueueId
    });
    return {
      status: "created",
      requestId: request.id,
      requestedRole: request.requestedRole,
      documentId: request.documentId,
      externalFileId: request.externalFileId,
      externalUrl: request.externalUrl,
      targetChannel: request.requestedForChannelName,
      message: `\u6587\u6863\u6743\u9650\u7533\u8BF7\u5DF2\u521B\u5EFA\uFF1A${request.requestedByAgentName} -> ${request.requestedRole}${request.documentId ? ` \xB7 ${request.documentId}` : ""}`
    };
  } catch (error) {
    return {
      status: "failed",
      requestedRole: entry.requestedRole,
      documentId: normalizeOptional4(entry.documentId),
      externalFileId: normalizeOptional4(entry.externalFileId),
      externalUrl: normalizeOptional4(entry.externalUrl),
      targetChannel: normalizeOptional4(entry.targetChannel),
      message: `${RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH} \u6743\u9650\u7533\u8BF7\u56DE\u6536\u5931\u8D25\uFF1A${errorMessage(error)}`
    };
  }
}
function applyExternalDocumentLinkManifestEntry(context, entry) {
  const targetChannel = entry.targetChannel.trim();
  try {
    assertTargetChannelAllowed({
      workspaceId: context.workspaceId,
      actorName: context.actorName,
      targetChannel,
      requestedByUserId: context.requestedByUserId,
      requestedByDisplayName: context.requestedByDisplayName
    });
    const source = resolveExternalGoogleSheetLinkSource({
      workspaceId: context.workspaceId,
      actorName: context.actorName,
      sourceChannelName: context.sourceChannelName,
      operation: entry
    });
    assertGoogleWorkspaceDelegationAvailable({
      workspaceId: context.workspaceId,
      actorName: context.actorName,
      externalFileId: source.externalFileId
    });
    assertExternalDocumentNotAlreadyLinked({
      workspaceId: context.workspaceId,
      targetChannel,
      externalFileId: source.externalFileId
    });
    const created = createExternalGoogleSheetChannelDocumentSync({
      channelName: targetChannel,
      title: entry.title,
      externalFileId: source.externalFileId,
      externalUrl: source.externalUrl,
      externalMimeType: source.externalMimeType,
      externalRevisionId: source.externalRevisionId,
      externalUpdatedAt: source.externalUpdatedAt,
      summary: entry.summary ?? source.summary,
      createdBy: context.actorName,
      createdByType: "agent"
    }, context.workspaceId);
    recordExternalSheetOperationRunSync({
      channelDocumentId: source.document?.id ?? created.document.id,
      externalFileId: source.externalFileId,
      actorType: "agent",
      actorId: context.actorName,
      delegatedUserId: source.delegatedUserId,
      delegatedUserDisplayName: source.delegatedUserDisplayName,
      delegatedGoogleEmail: source.delegatedGoogleEmail,
      credentialDelegationId: source.credentialDelegationId,
      status: "succeeded",
      intent: `Forward Google Sheet to ${targetChannel}`,
      operationType: "metadata_refresh",
      requestSummary: `Forwarded Google Sheet ${source.externalFileId} to ${targetChannel}.`,
      responseSummary: "External sheet channel binding created by controlled runtime output.",
      startedAt: created.version.createdAt,
      finishedAt: created.version.createdAt
    }, context.workspaceId);
    return {
      operationType: "link_google_sheet",
      status: "succeeded",
      sourceDocumentId: source.document?.id,
      documentId: created.document.id,
      targetChannel,
      externalFileId: source.externalFileId,
      externalUrl: source.externalUrl,
      title: created.document.title,
      message: `Google Sheet \u5DF2\u8F6C\u53D1\u5230 ${targetChannel}\uFF1A${created.document.title}`
    };
  } catch (error) {
    if (error instanceof AgentDocumentPermissionError) {
      throw error;
    }
    return {
      operationType: "link_google_sheet",
      status: "failed",
      sourceDocumentId: normalizeOptional4(entry.sourceDocumentId),
      targetChannel,
      externalFileId: normalizeOptional4(entry.externalFileId),
      externalUrl: normalizeOptional4(entry.externalUrl),
      title: normalizeOptional4(entry.title),
      message: `${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH} \u8F6C\u53D1\u56DE\u6536\u5931\u8D25\uFF1A${errorMessage(error)}`
    };
  }
}
function applyExternalDocumentManifestEntry(context, entry) {
  if (entry.operationType === "create_google_sheet") {
    return applyExternalDocumentCreateGoogleSheetManifestEntry(context, entry);
  }
  return applyExternalDocumentLinkManifestEntry(context, entry);
}
function applyExternalDocumentCreateGoogleSheetManifestEntry(context, entry) {
  const targetChannel = entry.targetChannel.trim();
  try {
    if (process.env.AGENT_SPACE_AGENT_GOOGLE_SHEET_CREATE_ENABLED === "false") {
      throw new Error("agent-created Google Sheet creation is disabled.");
    }
    assertTargetChannelAllowed({
      workspaceId: context.workspaceId,
      actorName: context.actorName,
      targetChannel,
      requestedByUserId: context.requestedByUserId,
      requestedByDisplayName: context.requestedByDisplayName
    });
    assertGoogleWorkspaceDelegationAvailable({
      workspaceId: context.workspaceId,
      actorName: context.actorName,
      externalFileId: entry.externalFileId,
      action: "edit"
    });
    assertExternalDocumentNotAlreadyLinked({
      workspaceId: context.workspaceId,
      targetChannel,
      externalFileId: entry.externalFileId
    });
    const artifact = readAndPersistCreateResultArtifact({
      workDir: context.workDir,
      workspaceId: context.workspaceId,
      taskId: context.sourceTaskQueueId,
      resultPath: entry.resultPath,
      externalFileId: entry.externalFileId,
      externalUrl: entry.externalUrl
    });
    const delegationAudit = resolveDelegationAudit(context.workspaceId, context.actorName);
    const created = createExternalGoogleSheetChannelDocumentSync({
      channelName: targetChannel,
      title: entry.title,
      externalFileId: entry.externalFileId,
      externalUrl: entry.externalUrl,
      externalMimeType: entry.externalMimeType ?? artifact.mimeType,
      externalRevisionId: entry.externalRevisionId,
      externalUpdatedAt: entry.externalUpdatedAt ?? artifact.modifiedTime,
      summary: entry.summary,
      createdBy: context.actorName,
      createdByType: "agent",
      triggerType: "agent",
      sourceTaskQueueId: context.sourceTaskQueueId,
      recordMetadataRun: false
    }, context.workspaceId);
    recordExternalSheetOperationRunSync({
      channelDocumentId: created.document.id,
      externalFileId: entry.externalFileId,
      actorType: "agent",
      actorId: context.actorName,
      delegatedUserId: delegationAudit.delegatedUserId,
      delegatedUserDisplayName: delegationAudit.delegatedUserDisplayName,
      delegatedGoogleEmail: delegationAudit.delegatedGoogleEmail,
      credentialDelegationId: delegationAudit.credentialDelegationId,
      status: "succeeded",
      intent: `Create Google Sheet in ${targetChannel}`,
      operationType: "create",
      requestSummary: `Created Google Sheet ${entry.externalFileId} and registered it in channel ${targetChannel}.`,
      responseSummary: "Agent-created Google Sheet channel binding created by controlled runtime output.",
      resultArtifactPath: artifact.storedPath,
      resultArtifactFileName: artifact.fileName,
      resultArtifactMediaType: RESULT_MEDIA_TYPE,
      resultArtifactSizeBytes: artifact.sizeBytes,
      startedAt: created.version.createdAt,
      finishedAt: created.version.createdAt
    }, context.workspaceId);
    return {
      operationType: "create_google_sheet",
      status: "succeeded",
      documentId: created.document.id,
      targetChannel,
      externalFileId: entry.externalFileId,
      externalUrl: entry.externalUrl,
      title: created.document.title,
      message: `Google Sheet \u5DF2\u521B\u5EFA\u5E76\u6DFB\u52A0\u5230 ${targetChannel}\uFF1A${created.document.title}`,
      permissionSync: {
        documentId: created.document.id,
        externalFileId: entry.externalFileId,
        delegatedUserId: delegationAudit.delegatedUserId,
        delegatedGoogleEmail: delegationAudit.delegatedGoogleEmail
      }
    };
  } catch (error) {
    if (error instanceof AgentDocumentPermissionError) {
      throw error;
    }
    return {
      operationType: "create_google_sheet",
      status: "failed",
      targetChannel,
      externalFileId: normalizeOptional4(entry.externalFileId),
      externalUrl: normalizeOptional4(entry.externalUrl),
      title: normalizeOptional4(entry.title),
      message: `${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH} \u65B0\u5EFA Google Sheet \u56DE\u6536\u5931\u8D25\uFF1A${errorMessage(error)}`
    };
  }
}
function resolveExternalGoogleSheetLinkSource(input) {
  const sourceDocumentId = normalizeOptional4(input.operation.sourceDocumentId);
  if (sourceDocumentId) {
    assertAgentDocumentActionAllowedSync({
      workspaceId: input.workspaceId,
      agentName: input.actorName,
      action: "forward",
      documentId: sourceDocumentId,
      channelName: input.sourceChannelName
    });
    const { document } = readChannelDocumentSync(sourceDocumentId, input.workspaceId);
    if (document.kind !== "sheet" || document.storageMode !== "external" || document.externalProvider !== "google_workspace" || !document.externalFileId || !document.externalUrl) {
      throw new Error(`Source document "${document.title}" is not an external Google Sheet.`);
    }
    return {
      document,
      externalFileId: document.externalFileId,
      externalUrl: document.externalUrl,
      externalMimeType: document.externalMimeType,
      externalRevisionId: document.externalRevisionId,
      externalUpdatedAt: document.externalUpdatedAt,
      summary: input.operation.summary ?? document.summary,
      ...resolveDelegationAudit(input.workspaceId, input.actorName)
    };
  }
  const externalFileId = normalizeOptional4(input.operation.externalFileId) ?? extractGoogleWorkspaceFileId2(input.operation.externalUrl);
  const externalUrl = normalizeOptional4(input.operation.externalUrl) ?? (externalFileId ? `https://docs.google.com/spreadsheets/d/${externalFileId}/edit` : void 0);
  if (!externalFileId || !externalUrl) {
    throw new Error("link-google-sheet requires sourceDocumentId, externalFileId, or a Google Sheets URL.");
  }
  assertAgentDocumentActionAllowedSync({
    workspaceId: input.workspaceId,
    agentName: input.actorName,
    action: "forward",
    externalProvider: "google_workspace",
    externalFileId,
    channelName: input.sourceChannelName
  });
  return {
    externalFileId,
    externalUrl,
    externalMimeType: "application/vnd.google-apps.spreadsheet",
    summary: input.operation.summary,
    ...resolveDelegationAudit(input.workspaceId, input.actorName)
  };
}
function assertTargetChannelAllowed(input) {
  const state = readWorkspaceStateSync(input.workspaceId);
  const targetChannel = state.channels.find((channel) => sameValue4(channel.name, input.targetChannel));
  if (!targetChannel) {
    throw new Error(`Target channel "${input.targetChannel}" does not exist.`);
  }
  const agent = state.activeEmployees.find((employee) => sameValue4(employee.name, input.actorName));
  if (!agent?.channels.some((channelName) => sameValue4(channelName, targetChannel.name))) {
    throw new Error(`Agent "${input.actorName}" cannot post or forward documents in channel "${targetChannel.name}".`);
  }
  if (!input.requestedByUserId) {
    return;
  }
  const requester = readUserSync(input.requestedByUserId);
  const requesterLabel = input.requestedByDisplayName?.trim() || requester?.displayName || input.requestedByUserId;
  const requesterCanReadChannel = (targetChannel.humanMemberNames ?? []).some((name) => sameValue4(name, requesterLabel));
  if (!requesterCanReadChannel) {
    throw new Error(`Triggering user "${requesterLabel}" cannot access target channel "${targetChannel.name}".`);
  }
}
function assertExternalDocumentNotAlreadyLinked(input) {
  const state = readWorkspaceStateSync(input.workspaceId);
  const existing = state.channelDocuments.find(
    (document) => document.status === "active" && sameValue4(document.channelName, input.targetChannel) && document.storageMode === "external" && document.externalProvider === "google_workspace" && document.externalFileId === input.externalFileId
  );
  if (existing) {
    throw new Error(`Google Sheet "${input.externalFileId}" is already linked in channel "${input.targetChannel}" as "${existing.title}".`);
  }
}
function assertGoogleWorkspaceDelegationAvailable(input) {
  const delegation = readActiveAgentGoogleWorkspaceDelegationSync({
    workspaceId: input.workspaceId,
    employeeName: input.actorName
  });
  if (!delegation) {
    throw new AgentDocumentPermissionError({
      code: "provider.document_external_auth_unavailable",
      agentName: input.actorName,
      action: input.action ?? "forward",
      documentId: input.externalFileId,
      message: `provider.document_external_auth_unavailable: Agent "${input.actorName}" has no active Google Workspace delegation for document "${input.externalFileId}".`
    });
  }
}
function readAndPersistCreateResultArtifact(input) {
  const normalized = normalizeRuntimeArtifactPath(input.resultPath);
  if (!normalized) {
    throw new Error(`resultPath must be under ${RUNTIME_OUTPUT_ARTIFACTS_PREFIX}: ${input.resultPath}`);
  }
  const sourcePath = resolve8(input.workDir, normalized);
  if (!existsSync7(sourcePath)) {
    throw new Error(`create result artifact does not exist: ${normalized}`);
  }
  const stats = statSync4(sourcePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`create result artifact must be a non-empty JSON file: ${normalized}`);
  }
  const raw = readFileSync5(sourcePath, "utf8");
  const parsed = parseCreateGoogleSheetResult(raw);
  assertCreateGoogleSheetResultMatches(parsed, input);
  const fileName = basename5(normalized);
  const artifactDir = join11(
    getWorkspaceDataDirPath(input.workspaceId),
    "external-sheet-results",
    sanitizeStorageSegment(input.taskId)
  );
  mkdirSync6(artifactDir, { recursive: true });
  const storedPath = join11(artifactDir, `create-${sanitizeStorageSegment(fileName)}`);
  copyFileSync2(sourcePath, storedPath);
  return {
    storedPath,
    fileName,
    sizeBytes: stats.size,
    mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : void 0,
    modifiedTime: typeof parsed.modifiedTime === "string" ? parsed.modifiedTime : void 0
  };
}
function parseCreateGoogleSheetResult(raw) {
  if (containsSensitiveTokenMaterial2(raw)) {
    throw new Error("create result artifact contains suspected token material.");
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("create result artifact must be a JSON object.");
  }
  return parsed;
}
function assertCreateGoogleSheetResultMatches(parsed, input) {
  if (parsed.id !== void 0 && parsed.id !== input.externalFileId) {
    throw new Error("create result artifact id does not match externalFileId.");
  }
  if (parsed.mimeType !== void 0 && parsed.mimeType !== GOOGLE_SHEET_MIME_TYPE) {
    throw new Error(`create result artifact mimeType must be ${GOOGLE_SHEET_MIME_TYPE}.`);
  }
  const urlFileId = extractGoogleWorkspaceFileId2(input.externalUrl);
  if (!urlFileId || urlFileId !== input.externalFileId) {
    throw new Error("externalUrl must be a Google Sheets URL for externalFileId.");
  }
  const artifactUrlFileId = extractGoogleWorkspaceFileId2(typeof parsed.webViewLink === "string" ? parsed.webViewLink : void 0);
  if (artifactUrlFileId && artifactUrlFileId !== input.externalFileId) {
    throw new Error("create result artifact webViewLink does not match externalFileId.");
  }
}
function normalizeRuntimeArtifactPath(value) {
  const relativePath = value.replace(/\\/g, "/").trim();
  if (!relativePath || relativePath.includes("\0") || relativePath.startsWith("/") || /^[A-Za-z]:\//.test(relativePath)) {
    return null;
  }
  if (!relativePath.startsWith(RUNTIME_OUTPUT_ARTIFACTS_PREFIX)) {
    return null;
  }
  const parts = relativePath.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    return null;
  }
  return relativePath;
}
function containsSensitiveTokenMaterial2(raw) {
  return [
    /GOOGLE_WORKSPACE_CLI_TOKEN/i,
    /"refresh_token"\s*:/i,
    /"access_token"\s*:/i,
    /"client_secret"\s*:/i,
    /["']?authorization["']?\s*:\s*["']?(Bearer|Basic|ya29\.)/i,
    /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
    /\bya29\.[A-Za-z0-9._-]{20,}/i
  ].some((pattern) => pattern.test(raw));
}
function sanitizeStorageSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "artifact";
}
function resolveDelegationAudit(workspaceId, actorName) {
  const delegation = readActiveAgentGoogleWorkspaceDelegationSync({
    workspaceId,
    employeeName: actorName
  });
  if (!delegation) {
    return {};
  }
  return {
    credentialDelegationId: delegation.id,
    delegatedUserId: delegation.userId,
    delegatedUserDisplayName: readUserSync(delegation.userId)?.displayName,
    delegatedGoogleEmail: delegation.googleEmail
  };
}
function extractGoogleWorkspaceFileId2(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return void 0;
  }
  const match = /\/(?:spreadsheets|document)\/d\/([^/?#]+)/.exec(trimmed);
  return match?.[1] ? decodeURIComponent(match[1]) : void 0;
}
function normalizeExternalProvider2(value) {
  if (value === "google_workspace" || value === "notion" || value === "microsoft_365") {
    return value;
  }
  return void 0;
}
function normalizeOptional4(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function sameValue4(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/knowledge-proposals.ts
import { existsSync as existsSync8, readFileSync as readFileSync6, statSync as statSync5 } from "node:fs";
import { resolve as resolve9 } from "node:path";
function applyKnowledgeProposalOperations(input) {
  const warnings = [];
  const statusMessages = [];
  const knowledgeProposals = [];
  const provenanceWarning = assertControlledKnowledgeProposalManifest(input.workDir);
  if (provenanceWarning) {
    warnings.push(provenanceWarning);
    statusMessages.push(provenanceWarning);
    return { warnings, statusMessages, knowledgeProposals };
  }
  for (const proposal of readKnowledgeProposalsManifest(input.workDir).proposals) {
    const result = applyKnowledgeProposalManifestEntry(input, proposal);
    knowledgeProposals.push(result);
    statusMessages.push(result.message);
    if (result.status === "failed") {
      warnings.push(result.message);
    }
  }
  return {
    warnings,
    statusMessages,
    knowledgeProposals
  };
}
function assertControlledKnowledgeProposalManifest(workDir) {
  const path = getRuntimeOutputKnowledgeProposalsPath(workDir);
  if (!existsSync8(path)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(readFileSync6(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return void 0;
    }
    if (parsed.generatedBy === "agent-space-cli") {
      return void 0;
    }
    return `${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH} \u5DF2\u88AB\u62D2\u7EDD\uFF1A\u8BF7\u4F7F\u7528 agent-space output knowledge propose-create/propose-update \u751F\u6210\u53D7\u63A7 manifest\uFF0C\u4E0D\u8981\u624B\u5199 JSON\u3002`;
  } catch (error) {
    return `${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH} \u5DF2\u88AB\u62D2\u7EDD\uFF1Amanifest \u65E0\u6CD5\u9A8C\u8BC1\u6765\u6E90\uFF08${error instanceof Error ? error.message : String(error)}\uFF09\u3002`;
  }
}
function applyKnowledgeProposalManifestEntry(context, entry) {
  const title = entry.title?.trim() || "Untitled knowledge proposal";
  try {
    const contentMarkdown = readKnowledgeProposalContent(context.workDir, entry.contentPath);
    const input = {
      workspaceId: context.workspaceId,
      sourceTaskQueueId: context.sourceTaskQueueId,
      sourceChannelName: context.sourceChannelName,
      sourceAgentName: context.actorName,
      operation: entry.operation,
      title,
      contentMarkdown,
      summary: entry.summary,
      reason: entry.reason,
      tags: entry.tags,
      parentId: entry.parentId,
      assignmentMode: entry.assignmentMode,
      assignedEmployeeNames: entry.assignedEmployeeNames,
      assignToSelf: entry.assignToSelf,
      targetKnowledgePageId: entry.targetKnowledgePageId,
      baseUpdatedAt: entry.baseUpdatedAt
    };
    const proposal = createKnowledgeProposalFromAgentSync(input);
    return {
      proposalId: proposal.id,
      approvalId: proposal.approvalId,
      title: proposal.title,
      operation: proposal.operation,
      status: "pending",
      message: `\u77E5\u8BC6\u5019\u9009\u5DF2\u63D0\u4EA4\u5BA1\u6279\uFF1A${proposal.title}`
    };
  } catch (error) {
    return {
      title,
      operation: entry.operation,
      status: "failed",
      message: `${RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH} \u77E5\u8BC6\u5019\u9009\u56DE\u6536\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`
    };
  }
}
function readKnowledgeProposalContent(workDir, contentPath) {
  const normalized = contentPath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("contentPath must be a relative path inside runtime-output.");
  }
  if (!normalized.startsWith("runtime-output/artifacts/")) {
    throw new Error("contentPath must be under runtime-output/artifacts/.");
  }
  if (!normalized.toLocaleLowerCase("en-US").endsWith(".md")) {
    throw new Error("contentPath must point to a Markdown .md file.");
  }
  const absolutePath = resolve9(workDir, normalized);
  const stats = statSync5(absolutePath);
  if (!stats.isFile()) {
    throw new Error("contentPath must point to a Markdown file.");
  }
  if (stats.size > MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES) {
    throw new Error("contentPath exceeds the 256 KB knowledge proposal size limit.");
  }
  const content = readFileSync6(absolutePath, "utf8");
  if (containsSensitiveTokenMaterial3(content)) {
    throw new Error("contentPath appears to contain credential or token material.");
  }
  return content;
}
function containsSensitiveTokenMaterial3(value) {
  return [
    /GOOGLE_WORKSPACE_CLI_TOKEN/i,
    /"refresh_token"\s*:/i,
    /"access_token"\s*:/i,
    /"client_secret"\s*:/i,
    /"private_key"\s*:/i,
    /"credentials?"\s*:/i,
    /["']?authorization["']?\s*:\s*["']?(Bearer|Basic|ya29\.)/i,
    /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
    /\bya29\.[A-Za-z0-9._-]{20,}/i
  ].some((pattern) => pattern.test(value));
}

// src/remote-daemon.ts
import { createReadStream, existsSync as existsSync17, mkdirSync as mkdirSync12, rmSync as rmSync11, statSync as statSync9, writeFileSync as writeFileSync10 } from "node:fs";
import { spawn as spawn5 } from "node:child_process";
import { resolve as resolve18 } from "node:path";

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
import { existsSync as existsSync9, mkdirSync as mkdirSync7, rmSync as rmSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname6, isAbsolute as isAbsolute2, join as join12, relative as relative2, resolve as resolve10 } from "node:path";
function clearTaskOutputArtifacts(workDir) {
  rmSync5(join12(workDir, "last-message.txt"), { force: true });
  rmSync5(getRuntimeOutputDir(workDir), { recursive: true, force: true });
}
function materializeInputBundle(workDir, bundle) {
  for (const file of bundle.files) {
    const targetPath = resolveBundleTargetPath(workDir, file.path);
    mkdirSync7(dirname6(targetPath), { recursive: true });
    writeFileSync5(targetPath, Buffer.from(file.contentBase64, "base64"));
  }
}
function collectRuntimeOutputBundle(workDir) {
  const runtimeOutputDir = getRuntimeOutputDir(workDir);
  if (!existsSync9(runtimeOutputDir)) {
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
function sanitizePathSegment(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "task";
}
function resolveBundleTargetPath(workDir, bundlePath) {
  const candidatePath = bundlePath.trim();
  if (!candidatePath) {
    throw new Error("Bundle file path is required.");
  }
  if (isAbsolute2(candidatePath)) {
    throw new Error(`Bundle file path must be relative: ${candidatePath}`);
  }
  const resolvedPath = resolve10(workDir, candidatePath);
  const relativePath = relative2(workDir, resolvedPath);
  if (relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute2(relativePath)) {
    return resolvedPath;
  }
  throw new Error(`Bundle file path escapes workDir: ${candidatePath}`);
}

// src/skill-imports.ts
import { existsSync as existsSync10, mkdirSync as mkdirSync8, readdirSync as readdirSync3, readFileSync as readFileSync7, realpathSync as realpathSync2, rmSync as rmSync6, statSync as statSync6, writeFileSync as writeFileSync6 } from "node:fs";
import { basename as basename6, dirname as dirname7, extname as extname4, isAbsolute as isAbsolute3, join as join13, relative as relative3, resolve as resolve11 } from "node:path";
var ALLOWED_IMPORT_HOSTS = /* @__PURE__ */ new Set([
  "github.com",
  "raw.githubusercontent.com",
  "skills.sh",
  "clawhub.ai"
]);
var PACKAGED_SKILL_IMPORTS_RELATIVE_DIR = `${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/skills`;
var IMPORTABLE_TEXT_EXTENSIONS2 = /* @__PURE__ */ new Set([
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
  if (!existsSync10(operationsPath)) {
    return { warnings, packaged: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync7(operationsPath, "utf8"));
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
    writeFileSync6(
      operationsPath,
      `${JSON.stringify({ ...parsed, imports: nextImports }, null, 2)}
`,
      "utf8"
    );
  }
  return { warnings, packaged };
}
async function applySkillImportOperations(workDir, context) {
  const warnings = [];
  const imports = [];
  const statusMessages = [];
  const operationsPath = getRuntimeOutputSkillImportsPath(workDir);
  if (!existsSync10(operationsPath)) {
    return { warnings, imports, statusMessages };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync7(operationsPath, "utf8"));
  } catch (error) {
    return {
      warnings: [`\u68C0\u6D4B\u5230 ${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}\uFF0C\u4F46 JSON \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`],
      imports,
      statusMessages
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      warnings: [`${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u5FC5\u987B\u662F\u5BF9\u8C61\u3002`],
      imports,
      statusMessages
    };
  }
  const manifest = parsed;
  const operations = Array.isArray(manifest.imports) ? manifest.imports : [];
  if (operations.length === 0) {
    return { warnings, imports, statusMessages };
  }
  for (const [index, operation] of operations.entries()) {
    const normalized = normalizeSkillImportOperation(operation, index, workDir);
    if ("error" in normalized) {
      warnings.push(normalized.error);
      continue;
    }
    try {
      const result = await importWorkspaceSkillFromUrl({
        workspaceId: context.workspaceId,
        url: normalized.source,
        conflict: normalized.conflict
      });
      const assignedToSelf = normalized.assignToSelf ? assignSkillToCurrentAgent({
        workspaceId: context.workspaceId,
        agentName: context.agentName,
        skillId: result.skillId,
        skillName: result.skillName,
        warnings
      }) : false;
      const applied = {
        skillId: result.skillId,
        skillName: result.skillName,
        sourceUrl: normalized.sourceLabel,
        created: result.created,
        renamed: result.renamed,
        replaced: result.replaced,
        skipped: result.skipped,
        assignedToSelf
      };
      imports.push(applied);
      statusMessages.push(formatSkillImportStatus(applied));
      tryRecordWorkspaceAuditEventSync({
        workspaceId: context.workspaceId,
        title: "Skill imported by agent",
        note: `Skill "${result.skillName}" was requested from runtime output by ${context.agentName ?? "an agent"}.`,
        code: "workspace.skill_imported_by_agent",
        data: {
          actorType: "agent",
          resourceType: "skill",
          resourceId: result.skillId,
          sourceUrl: normalized.sourceLabel,
          assignedToSelf,
          created: result.created,
          renamed: result.renamed,
          replaced: result.replaced,
          skipped: result.skipped
        }
      });
    } catch (error) {
      warnings.push(`Skill \u5BFC\u5165\u5931\u8D25\uFF08${normalized.sourceLabel}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { warnings, imports, statusMessages };
}
function clearSkillImportOperationArtifacts(workDir) {
  rmSync6(getRuntimeOutputSkillImportsPath(workDir), { force: true });
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
  const artifactsRoot = resolve11(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const absolutePath = resolve11(normalized);
  if (!isPathInside2(artifactsRoot, absolutePath)) {
    return null;
  }
  return join13(RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR, relative3(artifactsRoot, absolutePath)).replace(/\\/g, "/");
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
  return resolve11(workDir, value);
}
function packageLocalSkillImportSource(sourcePath, workDir, warnings) {
  const absolutePath = resolve11(sourcePath);
  if (!existsSync10(absolutePath)) {
    throw new Error(`\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${absolutePath}`);
  }
  const stats = statSync6(absolutePath);
  const archive = stats.isFile() && extname4(absolutePath).toLowerCase() === ".zip";
  const directSkillFile = stats.isFile() && samePathName(basename6(absolutePath), "SKILL.md");
  if (!stats.isDirectory() && !archive && !directSkillFile) {
    throw new Error("\u672C\u5730 skill \u6765\u6E90\u5FC5\u987B\u662F skill \u76EE\u5F55\u3001.zip \u6587\u4EF6\u6216 SKILL.md\u3002");
  }
  const artifactName = resolveUniqueSkillArtifactName(workDir, deriveSkillArtifactName(absolutePath, directSkillFile));
  if (archive) {
    const relativePath2 = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}.zip`;
    const targetPath = resolve11(workDir, relativePath2);
    mkdirSync8(dirname7(targetPath), { recursive: true });
    writeFileSync6(targetPath, readFileSync7(absolutePath));
    return { relativePath: relativePath2, archive: true };
  }
  const relativePath = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}`;
  const targetDir = resolve11(workDir, relativePath);
  mkdirSync8(targetDir, { recursive: true });
  if (directSkillFile) {
    writeFileSync6(join13(targetDir, "SKILL.md"), readFileSync7(absolutePath));
    return { relativePath, archive: false };
  }
  const copiedFiles = copySkillDirectoryFiles(absolutePath, targetDir, warnings);
  if (!copiedFiles.some((path) => samePathName(path, "SKILL.md"))) {
    rmSync6(targetDir, { recursive: true, force: true });
    throw new Error(`\u672C\u5730 skill \u76EE\u5F55\u5FC5\u987B\u5305\u542B SKILL.md\uFF1A${absolutePath}`);
  }
  return { relativePath, archive: false };
}
function copySkillDirectoryFiles(sourceDir, targetDir, warnings, relativePrefix = "") {
  const copiedFiles = [];
  for (const entry of readdirSync3(sourceDir, { withFileTypes: true })) {
    const relativePath = normalizeSkillArtifactFilePath(relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name);
    if (!relativePath) {
      continue;
    }
    const sourcePath = join13(sourceDir, entry.name);
    if (entry.isDirectory()) {
      copiedFiles.push(...copySkillDirectoryFiles(sourcePath, targetDir, warnings, relativePath));
      continue;
    }
    if (!entry.isFile()) {
      warnings.push(`\u6253\u5305\u672C\u5730 skill \u65F6\u8DF3\u8FC7\u4E0D\u652F\u6301\u7684\u6761\u76EE\uFF1A${relativePath}`);
      continue;
    }
    if (!isImportableSkillTextFile2(relativePath)) {
      warnings.push(`\u6253\u5305\u672C\u5730 skill \u65F6\u8DF3\u8FC7\u975E\u6587\u672C\u6587\u4EF6\uFF1A${relativePath}`);
      continue;
    }
    const targetPath = join13(targetDir, relativePath);
    mkdirSync8(dirname7(targetPath), { recursive: true });
    writeFileSync6(targetPath, readFileSync7(sourcePath));
    copiedFiles.push(relativePath);
  }
  return copiedFiles;
}
function deriveSkillArtifactName(sourcePath, directSkillFile) {
  const rawName = directSkillFile ? basename6(dirname7(sourcePath)) : basename6(sourcePath).replace(/\.zip$/i, "");
  return sanitizeSkillArtifactSegment(rawName);
}
function resolveUniqueSkillArtifactName(workDir, baseName) {
  let candidate = baseName;
  let index = 2;
  while (existsSync10(resolve11(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}`)) || existsSync10(resolve11(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}.zip`))) {
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
function isImportableSkillTextFile2(path) {
  if (samePathName(path, "SKILL.md")) {
    return true;
  }
  return IMPORTABLE_TEXT_EXTENSIONS2.has(extname4(path).toLowerCase());
}
function samePathName(left, right) {
  return left.localeCompare(right, "en-US", { sensitivity: "base" }) === 0;
}
function normalizeSkillImportOperation(entry, index, workDir) {
  const label = `imports[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label} \u5FC5\u987B\u662F\u5BF9\u8C61\u3002` };
  }
  const candidate = entry;
  const sourceFields = [
    typeof candidate.url === "string" && candidate.url.trim().length > 0 ? "url" : "",
    typeof candidate.path === "string" && candidate.path.trim().length > 0 ? "path" : "",
    typeof candidate.archivePath === "string" && candidate.archivePath.trim().length > 0 ? "archivePath" : ""
  ].filter(Boolean);
  if (sourceFields.length !== 1) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label} \u5FC5\u987B\u4E14\u53EA\u80FD\u63D0\u4F9B url\u3001path \u6216 archivePath \u4E4B\u4E00\u3002` };
  }
  const conflict = normalizeConflict(candidate.conflict);
  if (!conflict) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label}.conflict \u53EA\u80FD\u662F reject\u3001rename\u3001replace \u6216 skip\u3002` };
  }
  if (candidate.assignToSelf !== void 0 && typeof candidate.assignToSelf !== "boolean") {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label}.assignToSelf \u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002` };
  }
  const source = resolveSkillImportSource(candidate, label, workDir);
  if ("error" in source) {
    return source;
  }
  return {
    source: source.source,
    sourceLabel: source.sourceLabel,
    conflict,
    assignToSelf: candidate.assignToSelf ?? true
  };
}
function resolveSkillImportSource(candidate, label, workDir) {
  if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
    const url = candidate.url.trim();
    const parsedUrl = parseImportUrl(url);
    if ("error" in parsedUrl) {
      return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label}.url ${parsedUrl.error}` };
    }
    return { source: url, sourceLabel: url };
  }
  if (typeof candidate.path === "string" && candidate.path.trim().length > 0) {
    const source = resolveRuntimeArtifactSource(candidate.path, `${label}.path`, workDir);
    if ("error" in source) {
      return source;
    }
    return source;
  }
  if (typeof candidate.archivePath === "string" && candidate.archivePath.trim().length > 0) {
    const source = resolveRuntimeArtifactSource(candidate.archivePath, `${label}.archivePath`, workDir);
    if ("error" in source) {
      return source;
    }
    if (!source.sourceLabel.toLocaleLowerCase("en-US").endsWith(".zip")) {
      return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label}.archivePath \u5FC5\u987B\u6307\u5411 .zip \u6587\u4EF6\u3002` };
    }
    return source;
  }
  return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${label} \u7F3A\u5C11\u5BFC\u5165\u6765\u6E90\u3002` };
}
function resolveRuntimeArtifactSource(value, fieldLabel, workDir) {
  const relativePath = value.replace(/\\/g, "/").trim();
  if (!relativePath) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002` };
  }
  if (isAbsolute3(relativePath)) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u5FC5\u987B\u662F\u76F8\u5BF9\u8DEF\u5F84\u3002` };
  }
  if (relativePath.split("/").some((segment) => segment === "..")) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u4E0D\u80FD\u5305\u542B ..\u3002` };
  }
  if (relativePath !== RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR && !relativePath.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`)) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u5FC5\u987B\u4F4D\u4E8E ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/ \u4E0B\u3002` };
  }
  const artifactsRoot = resolve11(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const absolutePath = resolve11(workDir, relativePath);
  if (!isPathInside2(artifactsRoot, absolutePath)) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u8D85\u51FA\u5F53\u524D workDir\u3002` };
  }
  if (!existsSync10(absolutePath)) {
    return { source: absolutePath, sourceLabel: relativePath };
  }
  const realArtifactsRoot = realpathSync2(artifactsRoot);
  const realSourcePath = realpathSync2(absolutePath);
  if (!isPathInside2(realArtifactsRoot, realSourcePath)) {
    return { error: `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} \u7684 ${fieldLabel} \u4E0D\u80FD\u6307\u5411 ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/ \u5916\u90E8\u3002` };
  }
  return {
    source: realSourcePath,
    sourceLabel: relativePath
  };
}
function parseImportUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "\u5FC5\u987B\u662F HTTPS URL\u3002" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "\u5FC5\u987B\u4F7F\u7528 HTTPS\u3002\u6682\u4E0D\u5141\u8BB8\u672C\u5730\u8DEF\u5F84\u3001file: \u6216 http: \u5BFC\u5165\u3002" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_IMPORT_HOSTS.has(hostname) && !hostname.endsWith(".clawhub.ai")) {
    return { error: "\u53EA\u5141\u8BB8\u4ECE GitHub\u3001skills.sh \u6216 ClawHub \u5BFC\u5165\u3002" };
  }
  return parsed;
}
function normalizeConflict(value) {
  if (value === void 0 || value === null || value === "") {
    return "skip";
  }
  if (value === "reject" || value === "rename" || value === "replace" || value === "skip") {
    return value;
  }
  return null;
}
function isPathInside2(rootDir, candidatePath) {
  const relativePath = relative3(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute3(relativePath);
}
function assignSkillToCurrentAgent(input) {
  const agentName = input.agentName?.trim();
  if (!agentName) {
    input.warnings.push(`Skill "${input.skillName}" \u5DF2\u5BFC\u5165\uFF0C\u4F46\u65E0\u6CD5\u81EA\u52A8\u7ED1\u5B9A\uFF1A\u7F3A\u5C11\u5F53\u524D Agent \u540D\u79F0\u3002`);
    return false;
  }
  try {
    const currentSkillIds = listEmployeeSkillIdsSync(agentName, input.workspaceId);
    if (currentSkillIds.includes(input.skillId)) {
      return false;
    }
    setEmployeeSkillIdsSync(agentName, [...currentSkillIds, input.skillId], input.workspaceId);
    return true;
  } catch (error) {
    input.warnings.push(`Skill "${input.skillName}" \u5DF2\u5BFC\u5165\uFF0C\u4F46\u7ED1\u5B9A\u7ED9 ${agentName} \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
function formatSkillImportStatus(imported) {
  const action = imported.skipped ? "\u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\u5BFC\u5165" : imported.replaced ? "\u5DF2\u6309\u6765\u6E90\u66FF\u6362" : imported.renamed ? "\u5DF2\u5BFC\u5165\u5E76\u56E0\u91CD\u540D\u81EA\u52A8\u91CD\u547D\u540D" : "\u5DF2\u5BFC\u5165\u5DE5\u4F5C\u533A";
  const assignment = imported.assignedToSelf ? "\uFF0C\u5E76\u5DF2\u7ED1\u5B9A\u7ED9\u5F53\u524D Agent" : "";
  return `Skill "${imported.skillName}" ${action}${assignment}\u3002`;
}

// src/provider-runtime.ts
import { accessSync, constants as constants2, existsSync as existsSync14, readFileSync as readFileSync11, writeFileSync as writeFileSync7 } from "node:fs";
import { spawnSync as spawnSync6 } from "node:child_process";
import { delimiter as delimiter3, dirname as dirname12, isAbsolute as isAbsolute5, join as join18 } from "node:path";
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
import { resolve as resolve12 } from "node:path";
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
  const explicitTimeoutSeconds = env[CUBE_TIMEOUT_SECONDS_ENV] ? readPositiveInteger2(env[CUBE_TIMEOUT_SECONDS_ENV], CUBE_TIMEOUT_SECONDS_ENV) : void 0;
  const timeoutMs = explicitTimeoutSeconds ? explicitTimeoutSeconds * 1e3 : resolveSandboxTaskTimeoutMs(env[SANDBOX_TASK_TIMEOUT_ENV] ?? DEFAULT_SANDBOX_TASK_TIMEOUT_MS);
  const timeoutSeconds = explicitTimeoutSeconds ?? Math.max(1, Math.ceil(timeoutMs / 1e3));
  const allowInternetAccess = parseOptionalBoolean(env[CUBE_ALLOW_INTERNET_ENV]);
  const mountWorkDir = parseOptionalBoolean(env[CUBE_MOUNT_WORKDIR_ENV]) ?? false;
  const mountPath = normalizeMountPath(env[CUBE_MOUNT_PATH_ENV] ?? DEFAULT_CUBE_MOUNT_PATH);
  const workDir = resolve12(options.workDir);
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
function readPositiveInteger2(raw, name) {
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
import { existsSync as existsSync11, readFileSync as readFileSync8 } from "node:fs";
import { access, cp, lstat, mkdir, readdir as readdir2, readFile as readFile2, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname as dirname8, isAbsolute as isAbsolute4, join as join14, relative as relative4, resolve as resolve13 } from "node:path";
import { platform } from "node:process";
var KILL_GRACE_PERIOD_MS = 5e3;
var LocalSandbox = class {
  id;
  status = "active";
  workDir;
  activeChildren = /* @__PURE__ */ new Set();
  constructor(workDir, runtimeId) {
    this.workDir = resolve13(workDir);
    this.id = runtimeId;
  }
  async readFile(path) {
    return readFile2(this.resolveInsideSandbox(path), "utf8");
  }
  async writeFile(path, contents) {
    const absolutePath = this.resolveInsideSandbox(path);
    await mkdir(dirname8(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }
  async readDir(path) {
    const absolutePath = this.resolveInsideSandbox(path);
    const entries = await readdir2(absolutePath, { withFileTypes: true });
    return Promise.all(entries.map(async (entry) => {
      const entryPath = join14(absolutePath, entry.name);
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
    const snapshotDir = join14(dirname8(this.workDir), ".snapshots");
    const snapshotPath = join14(snapshotDir, `${this.id}-${Date.now().toString(36)}`);
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
    const absolutePath = resolve13(this.workDir, path);
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
      const candidate = join14(baseDir, command + extension);
      if (isExecutableCandidate(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
function isExecutableCandidate(candidate) {
  return existsSync11(candidate);
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
    const content = existsSync11(executablePath) ? readFileSync8(executablePath, "utf8") : "";
    const match = content.match(/"?%dp0%[\\\/]?(node_modules[\\\/][^"]+\.js)"?/);
    if (match) {
      const jsPath = join14(dirname8(executablePath), match[1].replace(/%\*/g, "").trim());
      if (existsSync11(jsPath)) {
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
import { resolve as resolve15 } from "node:path";

// src/agent-router/utils.ts
import { constants, existsSync as existsSync12 } from "node:fs";
import { access as access2 } from "node:fs/promises";
import { delimiter as delimiter2, dirname as dirname9, join as join15, resolve as resolve14 } from "node:path";
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
    return await isExecutableCandidate2(command) ? resolve14(command) : null;
  }
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }
  const extensions = platform2 === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
  for (const baseDir of pathValue.split(delimiter2)) {
    for (const extension of extensions) {
      const candidate = join15(baseDir, command + extension);
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
  if (!existsSync12(candidate)) {
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
    dirname9(executablePath),
    ...pathDirs,
    process.env.AGENT_SPACE_DAEMON_BIN ? dirname9(process.env.AGENT_SPACE_DAEMON_BIN) : "",
    process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join15(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : "",
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
import { spawnSync as spawnSync2 } from "node:child_process";
import { dirname as dirname10 } from "node:path";
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
      dirs.push(dirname10(capability.binPath));
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
      const result = spawnSync2("sh", ["-lc", command], {
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
  return await new Promise((resolve20, reject) => {
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
      resolve20({
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
  return await new Promise((resolve20) => {
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
      resolve20("");
    });
    child.on("close", (exitCode) => {
      resolve20(exitCode === 0 ? output.trim().split(/\r?\n/)[0] ?? "" : "");
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
import { mkdtempSync, readFileSync as readFileSync9, rmSync as rmSync7 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname11, join as join16 } from "node:path";
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
  const outputDir = mkdtempSync(join16(tmpdir(), "agent-router-codex-"));
  const outputFile = join16(outputDir, "last-message.txt");
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
    return readFileSync9(outputFile, "utf8").trim();
  } catch {
    return "";
  }
}
function cleanupCodexOutputFile(outputFile) {
  if (!outputFile) {
    return;
  }
  rmSync7(dirname11(outputFile), { recursive: true, force: true });
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
import { spawnSync as spawnSync3 } from "node:child_process";

// src/openclaw-health.ts
import { existsSync as existsSync13, readFileSync as readFileSync10 } from "node:fs";
import { homedir } from "node:os";
import { join as join17 } from "node:path";
function inspectOpenClawDaemonAuthHealth(input = {}) {
  const env = input.env ?? process.env;
  const homeDir = input.homeDir ?? env.HOME ?? homedir();
  const profile = input.profile?.trim() || env.OPENCLAW_PROFILE?.trim() || void 0;
  const model = input.model?.trim() || env.OPENCLAW_MODEL?.trim() || void 0;
  const explicitConfigPath = env.OPENCLAW_CONFIG_PATH?.trim() || void 0;
  const openclawConfigPath = explicitConfigPath ?? join17(homeDir, profile ? `.openclaw-${profile}` : ".openclaw", "openclaw.json");
  const authProfilesPath = input.workDir ? join17(input.workDir, "agent", "auth-profiles.json") : void 0;
  const modelsPath = input.workDir ? join17(input.workDir, "agent", "models.json") : void 0;
  const hasOpenClawConfig = existsSync13(openclawConfigPath);
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
  return existsSync13(join17(workDir, "task.json")) || existsSync13(join17(workDir, "prompt.txt"));
}
function readJsonObject(path) {
  if (!existsSync13(path)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(readFileSync10(path, "utf8"));
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
  const result = spawnSync3(plan.executable, args, {
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
      cwd: resolve15(request.cwd)
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
import { spawnSync as spawnSync4 } from "node:child_process";
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
  const result = spawnSync4(command, args, {
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
import { spawnSync as spawnSync5 } from "node:child_process";
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
  const result = spawnSync5(command, args, {
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
  return new Promise((resolve20, reject) => {
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
        resolve20({ stdout, stderr });
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
      binDir: process.env.AGENT_SPACE_DAEMON_BIN ? dirname12(process.env.AGENT_SPACE_DAEMON_BIN) : void 0,
      pathDirs: [
        process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join18(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : ""
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
    return dirname12(command);
  }
  const path = findExecutableOnPath3(command);
  return path ? dirname12(path) : void 0;
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
    const result = spawnSync6(executablePath, args, {
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
      const candidate = join18(baseDir, command + ext);
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
  const outputFile = join18(workDir, "last-message.txt");
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
    writeFileSync7(outputFile, finalOutput, "utf8");
  }
  const output = finalOutput || (existsSync14(outputFile) ? readFileSync11(outputFile, "utf8").trim() : "");
  if (!output) {
    throw new Error("gemini returned an empty response.");
  }
  return { output };
}
async function runNanoBotProviderTask(runtime, prompt, workDir, taskTimeoutMs, options) {
  clearTaskOutputArtifacts(workDir);
  const outputFile = join18(workDir, "last-message.txt");
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
    writeFileSync7(outputFile, output, "utf8");
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
    dirname12(runtime.metadata.executablePath),
    process.env.AGENT_SPACE_DAEMON_BIN ? dirname12(process.env.AGENT_SPACE_DAEMON_BIN) : "",
    process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT ? join18(process.env.AGENT_SPACE_DAEMON_INSTALL_ROOT, "bin") : ""
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
import { existsSync as existsSync15, mkdirSync as mkdirSync9, openSync, readFileSync as readFileSync12, rmSync as rmSync8, statSync as statSync7 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname13, join as join19, resolve as resolve16 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var DEFAULT_HEARTBEAT_INTERVAL_MS = 15e3;
var DEFAULT_TASK_POLL_INTERVAL_MS = 3e3;
var DEFAULT_LOG_LINES = 50;
var DEFAULT_STATE_DIR_NAME = ".agent-space-daemon";
function resolveDefaultDaemonStateDir(environment = process.env) {
  const configured = environment.AGENT_SPACE_DAEMON_STATE_DIR?.trim();
  if (configured) {
    return resolve16(configured);
  }
  const homeDir = environment.HOME?.trim() || homedir2();
  return resolve16(homeDir, DEFAULT_STATE_DIR_NAME);
}
function ensureDaemonStateDir(stateDir) {
  const resolvedStateDir = resolve16(stateDir);
  if (!existsSync15(resolvedStateDir)) {
    mkdirSync9(resolvedStateDir, { recursive: true });
  }
  return resolvedStateDir;
}
function openDaemonLogFile(logPath) {
  return openSync(logPath, "a");
}
function getDaemonPidFilePath(stateDir) {
  return join19(ensureDaemonStateDir(stateDir), "daemon.pid");
}
function getDaemonLogFilePath(stateDir) {
  return join19(ensureDaemonStateDir(stateDir), "daemon.log");
}
function readPidIfRunning(pidPath) {
  if (!existsSync15(pidPath)) {
    return null;
  }
  const raw = readFileSync12(pidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return isProcessRunning(pid) ? pid : null;
}
function cleanupStalePidFile(pidPath) {
  if (!existsSync15(pidPath)) {
    return;
  }
  const raw = readFileSync12(pidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessRunning(pid)) {
    rmSync8(pidPath, { force: true });
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
  const content = readFileSync12(filePath, "utf8");
  const chunks = content.split(/\r?\n/).filter((line, index, all) => !(index === all.length - 1 && line === ""));
  return chunks.slice(-lines);
}
function renderDaemonSummary(summary) {
  return Object.entries(summary).map(([key, value]) => `${key}: ${String(value)}`).join("\n");
}
function getStandaloneCliEntryPath() {
  const currentFile = fileURLToPath2(import.meta.url);
  return join19(dirname13(currentFile), currentFile.endsWith(".ts") ? "cli.ts" : "cli.js");
}
function resolveLogFileSize(logPath) {
  return statSync7(logPath).size;
}

// src/task-context.ts
import { copyFileSync as copyFileSync3, mkdirSync as mkdirSync11, rmSync as rmSync10, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join21 } from "node:path";

// src/channel-documents.ts
import { existsSync as existsSync16, mkdirSync as mkdirSync10, readFileSync as readFileSync13, realpathSync as realpathSync3, rmSync as rmSync9, statSync as statSync8, writeFileSync as writeFileSync8 } from "node:fs";
import { isAbsolute as isAbsolute6, join as join20, relative as relative5, resolve as resolve17 } from "node:path";
function resolveChannelDocuments(channelName, workspaceId) {
  return listChannelDocumentsSync(channelName, workspaceId).filter((document) => document.status === "active");
}
function materializeChannelDocuments(documentsOrContexts, workDir, workspaceId) {
  const contexts = normalizeDocumentContexts(documentsOrContexts);
  if (contexts.length === 0) {
    return void 0;
  }
  const documentsDir = join20(workDir, ".agent_context", "channel-documents");
  rmSync9(documentsDir, { recursive: true, force: true });
  mkdirSync10(documentsDir, { recursive: true });
  for (const context of contexts) {
    const { document } = context;
    const versions = listChannelDocumentVersionsSync(document.id, workspaceId);
    const currentVersion = versions.find((version) => version.id === document.currentVersionId) ?? versions[0];
    if (!currentVersion) {
      continue;
    }
    const documentDir = join20(documentsDir, `${sanitizePathSegment2(document.slug)}-${document.id.slice(-6)}`);
    mkdirSync10(documentDir, { recursive: true });
    writeFileSync8(
      join20(documentDir, "meta.json"),
      JSON.stringify(
        {
          id: document.id,
          title: document.title,
          currentVersionId: document.currentVersionId,
          summary: document.summary,
          updatedBy: document.updatedBy,
          updatedAt: document.updatedAt,
          kind: document.kind,
          storageMode: document.storageMode ?? "native",
          externalProvider: document.externalProvider,
          externalFileId: document.externalFileId,
          externalUrl: document.externalUrl,
          externalSyncStatus: document.externalSyncStatus,
          accessRole: context.role,
          accessSource: context.source,
          allowedActions: context.allowedActions
        },
        null,
        2
      ),
      "utf8"
    );
    writeFileSync8(
      join20(documentDir, "blocks.json"),
      JSON.stringify(
        listChannelDocumentBlocksSync(document.id, workspaceId).map((block) => ({
          id: block.id,
          order: block.order,
          heading: block.heading,
          revision: block.revision,
          updatedBy: block.updatedBy,
          updatedAt: block.updatedAt
        })),
        null,
        2
      ),
      "utf8"
    );
    writeFileSync8(join20(documentDir, "document.md"), currentVersion.contentMarkdown, "utf8");
  }
  return documentsDir;
}
function buildChannelDocumentPromptLines(channelDocumentsOrContexts, channelDocumentsContextDir) {
  const contexts = normalizeDocumentContexts(channelDocumentsOrContexts);
  const channelDocuments = contexts.map((context) => context.document);
  const externalGoogleSheets = channelDocuments.filter(
    (document) => document.kind === "sheet" && document.storageMode === "external" && document.externalProvider === "google_workspace" && document.externalFileId && document.externalUrl
  );
  const roleByDocumentId = new Map(contexts.map((context) => [context.document.id, context.role]));
  const externalGoogleDocs = channelDocuments.filter(
    (document) => document.storageMode === "external" && document.externalProvider === "google_workspace" && document.externalFileId && document.externalUrl && document.externalMimeType === "application/vnd.google-apps.document"
  );
  return [
    channelDocuments.length > 0 ? `\u5F53\u524D\u4EFB\u52A1\u6709 ${channelDocuments.length} \u4EFD\u6309\u6587\u6863\u6743\u9650\u6388\u6743\u7684\u534F\u4F5C\u6587\u6863\u3002` : "\u5F53\u524D\u4EFB\u52A1\u6CA1\u6709\u5DF2\u6388\u6743\u6587\u6863\u3002",
    channelDocuments.length > 0 ? contexts.map(
      ({ document, role, source, allowedActions }) => `- \u6587\u6863 ${document.id} | ${document.title} | role ${role} | source ${source} | allowed ${allowedActions.join(",")} | \u7C7B\u578B ${document.kind} | \u5B58\u50A8 ${document.storageMode ?? "native"} | \u5F53\u524D\u7248\u672C ${document.currentVersionId} | ${document.summary || "\u65E0\u6458\u8981"} | \u6BCF\u4EFD\u6587\u6863\u76EE\u5F55\u4E2D\u90FD\u5305\u542B document.md\u3001blocks.json \u548C meta.json`
    ).join("\n") : "",
    contexts.some((context) => context.role === "viewer") ? "viewer \u6587\u6863\u53EA\u8BFB\uFF1A\u4E0D\u5F97\u66F4\u65B0\u7FA4\u6587\u6863\u3001\u4E0D\u5F97\u5199\u5165 Google Sheet/Doc\u3001\u4E0D\u5F97\u8F6C\u53D1\u5230\u5176\u4ED6\u9891\u9053\u3002" : "",
    contexts.some((context) => context.role === "editor") ? "editor \u6587\u6863\u53EF\u5728\u5F53\u524D\u6388\u6743\u4E0A\u4E0B\u6587\u8BFB\u53D6\u548C\u7F16\u8F91\uFF0C\u4F46\u4E0D\u53EF\u8DE8\u9891\u9053\u8F6C\u53D1\u3001\u590D\u5236 external binding \u6216\u6302\u5230\u5176\u4ED6\u9891\u9053\u3002" : "",
    contexts.some((context) => context.role === "forwarder") ? "forwarder \u6587\u6863\u53EF\u8BFB\u53D6\u3001\u7F16\u8F91\u5E76\u901A\u8FC7\u53D7\u63A7 output \u547D\u4EE4\u8F6C\u53D1/\u94FE\u63A5\u5230\u76EE\u6807\u9891\u9053\uFF1B\u5FC5\u987B\u4F7F\u7528 agent-space output external-document link-google-sheet \u6216\u6743\u9650\u7533\u8BF7\u547D\u4EE4\u3002" : "",
    externalGoogleSheets.length > 0 ? [
      `\u5F53\u524D\u9891\u9053\u6709 ${externalGoogleSheets.length} \u4EFD Google Sheet \u5916\u90E8\u7FA4\u6587\u6863\uFF1BGoogle Sheets data plane \u5FC5\u987B\u7531\u5F53\u524D Agent runtime \u76F4\u63A5\u8FD0\u884C\u5B98\u65B9 gws \u5B8C\u6210\uFF0CWeb \u540E\u7AEF\u53EA\u56DE\u6536\u7ED3\u679C\u3002`,
      externalGoogleSheets.map((document) => `- Google Sheet ${document.id} | ${document.title} | role ${roleByDocumentId.get(document.id) ?? "editor"} | spreadsheetId ${document.externalFileId} | ${document.externalUrl} | \u72B6\u6001 ${document.externalSyncStatus ?? "unknown"}`).join("\n"),
      `\u5982\u9700\u8BFB\u53D6 Google Sheet\uFF0C\u5148\u5355\u72EC\u8FD0\u884C gws \u8BFB\u53D6\u547D\u4EE4\uFF0C\u4F8B\u5982\uFF1Agws sheets spreadsheets values get --format json --params '{"spreadsheetId":"spreadsheetId","range":"Sheet1!A1:Z20"}'\u3002\u4E0D\u8981\u628A mkdir\u3001gws\u3001\u91CD\u5B9A\u5411\u548C cat \u5408\u5E76\u6210\u4E00\u6761 Bash \u547D\u4EE4\uFF1B\u4F60\u53EF\u4EE5\u5728\u540C\u4E00\u8F6E\u8BFB\u53D6 stdout \u5E76\u57FA\u4E8E\u771F\u5B9E\u5355\u5143\u683C\u5185\u5BB9\u56DE\u7B54\u7528\u6237\u3002`,
      `\u5F53\u524D Agent runtime \u662F\u975E\u4EA4\u4E92 headless \u6267\u884C\u73AF\u5883\uFF1B\u4E0D\u8981\u8981\u6C42 Web \u7528\u6237\u6279\u51C6 CLI/Bash/\u547D\u4EE4\u6743\u9650\uFF0C\u4E5F\u4E0D\u8981\u7B49\u5F85\u804A\u5929\u91CC\u7684\u201C\u5141\u8BB8\u201D\u3002\u5982\u679C\u547D\u4EE4\u6743\u9650\u88AB provider \u62E6\u622A\uFF0C\u8BF7\u660E\u786E\u62A5\u544A runtime \u914D\u7F6E\u95EE\u9898\u3002`,
      "\u5982\u9700\u5199\u5165 Google Sheet\uFF0C\u53EA\u6709 editor/forwarder \u6587\u6863\u53EF\u76F4\u63A5\u8FD0\u884C\u5BF9\u5E94 gws values append/update \u6216 spreadsheets batchUpdate \u547D\u4EE4\uFF1Bviewer \u6587\u6863\u4E0D\u5F97\u5199\u5165\u3002\u4E0D\u8981\u8BA9 server \u4EE3\u6267\u884C Google Sheet \u5199\u5165\u3002",
      `gws stdout \u5FC5\u987B\u4FDD\u5B58\u5230 ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/sheets/*.json\uFF0C\u7136\u540E\u8FD0\u884C agent-space output sheets-result add --document-id <\u6587\u6863ID> --operation read|append_rows|update_values|batch_update --range <A1> --result-json ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/sheets/result.json --summary <\u6458\u8981>\uFF0C\u751F\u6210 ${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH} \u5E76\u8FD0\u884C agent-space output validate\u3002`
    ].join("\n") : "",
    "\u5982\u9700\u65B0\u5EFA Google Sheet\uFF0C\u5FC5\u987B\u5148\u8FD0\u884C gws drive files create \u521B\u5EFA application/vnd.google-apps.spreadsheet\uFF0C\u5E76\u628A JSON stdout \u4FDD\u5B58\u5230 runtime-output/artifacts/sheets/create-*.json\uFF1B\u968F\u540E\u8FD0\u884C agent-space output external-document create-google-sheet --target-channel <\u9891\u9053> --title <\u6807\u9898> --external-file-id <spreadsheetId> --external-url <webViewLink> --gws-result-json runtime-output/artifacts/sheets/create-*.json\uFF0C\u518D\u8FD0\u884C agent-space output validate\u3002\u4E0D\u8981\u53EA\u628A Google Sheet URL \u5199\u8FDB\u6700\u7EC8\u56DE\u590D\u3002",
    externalGoogleDocs.length > 0 ? [
      `\u5F53\u524D\u9891\u9053\u6709 ${externalGoogleDocs.length} \u4EFD Google Docs \u5916\u90E8\u7FA4\u6587\u6863\u3002\u8BF7\u53EA\u901A\u8FC7 AgentSpace output CLI \u8868\u8FBE\u5199\u5165\u610F\u56FE\uFF1BAgentSpace/daemon \u4F1A\u6821\u9A8C\u6743\u9650\u5E76\u4F7F\u7528\u5B98\u65B9 gws CLI \u6267\u884C\u3002`,
      externalGoogleDocs.map((document) => `- Google Doc ${document.id} | ${document.title} | role ${roleByDocumentId.get(document.id) ?? "editor"} | ${document.externalUrl} | \u72B6\u6001 ${document.externalSyncStatus ?? "unknown"}`).join("\n"),
      `\u5982\u9700\u5199\u5165 Google Doc\uFF0C\u53EA\u6709 editor/forwarder \u6587\u6863\u53EF\u8FD0\u884C agent-space output google-docs append-text --document-id <\u6587\u6863ID> --intent <\u610F\u56FE> --text-file ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/docs/summary.md\uFF0C\u6216 agent-space output google-docs batch-update --document-id <\u6587\u6863ID> --intent <\u610F\u56FE> --requests-json ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/docs/requests.json\uFF1B\u968F\u540E\u8FD0\u884C agent-space output validate\u3002\u4E0D\u8981\u76F4\u63A5\u8FD0\u884C gws\uFF0C\u4E0D\u8981\u8BF7\u6C42\u6216\u8F93\u51FA token\uFF0C\u4E0D\u8981\u6307\u5B9A CLI binary\u3002`,
      `${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH} \u662F output CLI \u4E0E daemon \u4E4B\u95F4\u7684\u5185\u90E8\u6587\u4EF6\uFF0C\u4E0D\u8981\u624B\u5DE5\u7F16\u8F91\u3002`
    ].join("\n") : "",
    channelDocumentsContextDir ? `\u5982\u679C\u9700\u8981\u8BFB\u53D6\u6216\u66F4\u65B0\u7FA4\u6587\u6863\uFF0C\u8BF7\u67E5\u770B\u76EE\u5F55\uFF1A${channelDocumentsContextDir}` : "",
    `\u5982\u679C\u5185\u5BB9\u5C5E\u4E8E\u957F\u671F\u5171\u4EAB\u5DE5\u4F5C\u7A3F\uFF0C\u4F18\u5148\u9075\u5FAA ${BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME2} skill\uFF0C\u5E76\u66F4\u65B0\u7FA4\u6587\u6863\uFF0C\u800C\u4E0D\u662F\u53EA\u53D1\u4E00\u6B21\u6027\u9644\u4EF6\u3002`,
    `\u5982\u9700\u66F4\u65B0\u7FA4\u6587\u6863\uFF0C\u53EA\u6709 editor/forwarder \u6587\u6863\u53EF\u4F7F\u7528 agent-space output document upsert ...\u3001agent-space output document replace-block ...\u3001agent-space output document insert-after ... \u6216 agent-space output document delete-block ...\uFF0C\u5E76\u8FD0\u884C agent-space output validate\uFF1Bviewer \u6587\u6863\u53EA\u80FD\u8BFB\u53D6\u3002${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH} \u662F output CLI \u4E0E daemon \u4E4B\u95F4\u7684\u5185\u90E8\u6587\u4EF6\uFF0C\u4E0D\u8981\u624B\u5DE5\u7F16\u8F91\u3002`
  ].filter(Boolean);
}
function normalizeDocumentContexts(documentsOrContexts) {
  return documentsOrContexts.map((entry) => {
    if ("document" in entry) {
      return entry;
    }
    return {
      document: entry,
      role: "editor",
      source: "channel_context",
      allowedActions: ["view", "edit"]
    };
  });
}
function applyChannelDocumentOperations(workDir, context) {
  const warnings = [];
  const documentUpdates = [];
  const operationsPath = getRuntimeOutputChannelDocumentsPath(workDir);
  if (!existsSync16(operationsPath)) {
    return { warnings, documentUpdates };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync13(operationsPath, "utf8"));
  } catch (error) {
    return {
      warnings: [`\u68C0\u6D4B\u5230 ${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH}\uFF0C\u4F46 JSON \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`],
      documentUpdates
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { warnings: [`${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH} \u5FC5\u987B\u662F\u5BF9\u8C61\u3002`], documentUpdates };
  }
  const manifest = parsed;
  const operations = Array.isArray(manifest.documents) ? manifest.documents : [];
  const existingDocuments = [...listChannelDocumentsSync(context.channelName, context.workspaceId)];
  for (const operation of operations) {
    const normalized = normalizeChannelDocumentOperation(workDir, operation);
    if ("error" in normalized) {
      warnings.push(normalized.error);
      continue;
    }
    try {
      const existing = (normalized.documentId ? existingDocuments.find((document2) => document2.id === normalized.documentId) : void 0) ?? existingDocuments.find((document2) => sameValue5(document2.title, normalized.title) && document2.status === "active");
      if (existing && normalized.operations.length > 0) {
        assertAgentDocumentActionAllowedSync({
          workspaceId: context.workspaceId ?? "default",
          agentName: context.actorName,
          documentId: existing.id,
          channelName: context.channelName,
          action: "edit"
        });
        const normalizedOperations = normalized.operations.map(
          (item) => item.op === "insert_after" ? {
            ...item,
            contentMarkdown: readFileSync13(item.contentAbsolutePath, "utf8")
          } : "contentAbsolutePath" in item ? {
            ...item,
            contentMarkdown: readFileSync13(item.contentAbsolutePath, "utf8")
          } : item
        );
        const result = applyChannelDocumentBlockOperations({
          state: readWorkspaceStateSync(context.workspaceId),
          document: existing,
          baseVersionId: normalized.baseVersionId ?? existing.currentVersionId,
          actorId: context.actorName,
          actorType: "agent",
          operations: normalizedOperations,
          summary: normalized.summary,
          sourceMessageId: context.sourceMessageId,
          sourceTaskQueueId: context.sourceTaskQueueId
        });
        if (result.document && result.version) {
          documentUpdates.push({
            documentId: result.document.id,
            documentVersionId: result.document.currentVersionId
          });
        }
        if (result.conflictCount > 0) {
          warnings.push(`\u7FA4\u6587\u6863\u300A${existing.title}\u300B\u6709 ${result.conflictCount} \u4E2A block \u66F4\u65B0\u51B2\u7A81\u3002`);
        }
        continue;
      }
      const contentMarkdown = normalized.contentAbsolutePath ? readFileSync13(normalized.contentAbsolutePath, "utf8") : "";
      if (existing && normalized.mode !== "create") {
        assertAgentDocumentActionAllowedSync({
          workspaceId: context.workspaceId ?? "default",
          agentName: context.actorName,
          documentId: existing.id,
          channelName: context.channelName,
          action: "edit"
        });
        if (normalized.baseVersionId && existing.currentVersionId !== normalized.baseVersionId) {
          recordChannelDocumentConflictSync({
            documentId: existing.id,
            actorId: context.actorName,
            actorType: "agent",
            baseVersionId: normalized.baseVersionId,
            operationsJson: JSON.stringify([
              {
                op: "replace_document",
                title: normalized.title,
                contentMarkdown,
                summary: normalized.summary
              }
            ]),
            sourceMessageId: context.sourceMessageId,
            sourceTaskQueueId: context.sourceTaskQueueId
          }, context.workspaceId);
          warnings.push(`\u7FA4\u6587\u6863\u300A${existing.title}\u300B\u5728\u63D0\u4EA4\u671F\u95F4\u5DF2\u88AB\u66F4\u65B0\uFF0C\u672C\u6B21\u4FEE\u6539\u5DF2\u6807\u8BB0\u4E3A conflict\u3002`);
          continue;
        }
        const { document: document2 } = updateChannelDocumentSync({
          documentId: existing.id,
          contentMarkdown,
          summary: normalized.summary,
          updatedBy: context.actorName,
          updatedByType: "agent",
          triggerType: normalized.triggerType,
          sourceMessageId: context.sourceMessageId,
          sourceTaskQueueId: context.sourceTaskQueueId
        }, context.workspaceId);
        const index = existingDocuments.findIndex((documentItem) => documentItem.id === document2.id);
        if (index >= 0) {
          existingDocuments[index] = document2;
        }
        documentUpdates.push({
          documentId: document2.id,
          documentVersionId: document2.currentVersionId
        });
        continue;
      }
      const { document } = createChannelDocumentSync({
        channelName: context.channelName,
        title: normalized.title,
        contentMarkdown,
        summary: normalized.summary,
        createdBy: context.actorName,
        createdByType: "agent",
        triggerType: normalized.triggerType,
        sourceMessageId: context.sourceMessageId,
        sourceTaskQueueId: context.sourceTaskQueueId
      }, context.workspaceId);
      existingDocuments.unshift(document);
      documentUpdates.push({
        documentId: document.id,
        documentVersionId: document.currentVersionId
      });
    } catch (error) {
      if (error instanceof AgentDocumentPermissionError) {
        throw error;
      }
      warnings.push(`\u7FA4\u6587\u6863\u64CD\u4F5C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { warnings, documentUpdates };
}
function clearChannelDocumentOperationArtifacts(workDir) {
  rmSync9(getRuntimeOutputChannelDocumentsPath(workDir), { force: true });
}
function normalizeChannelDocumentOperation(workDir, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { error: "documents[] \u7684\u6BCF\u4E00\u9879\u90FD\u5FC5\u987B\u662F\u5BF9\u8C61\u3002" };
  }
  const candidate = entry;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  if (!title) {
    return { error: "documents[].title \u4E0D\u80FD\u4E3A\u7A7A\u3002" };
  }
  const contentPath = typeof candidate.contentPath === "string" ? candidate.contentPath.trim() : "";
  const operations = Array.isArray(candidate.operations) ? candidate.operations : [];
  if (!contentPath && operations.length === 0) {
    return { error: `\u7FA4\u6587\u6863\u300A${title}\u300B\u7F3A\u5C11 contentPath \u6216 operations\u3002` };
  }
  let contentAbsolutePath;
  if (contentPath) {
    const resolvedContentPath = resolveDocumentContentPath(workDir, contentPath);
    if (typeof resolvedContentPath !== "string") {
      return resolvedContentPath;
    }
    contentAbsolutePath = resolvedContentPath;
  }
  const normalizedOperations = operations.map((operation) => normalizeDocumentOperationEntry(workDir, operation)).filter((item) => !("error" in item));
  const operationError = operations.map((operation) => normalizeDocumentOperationEntry(workDir, operation)).find((item) => "error" in item);
  if (operationError) {
    return operationError;
  }
  return {
    documentId: typeof candidate.documentId === "string" && candidate.documentId.trim().length > 0 ? candidate.documentId.trim() : void 0,
    baseVersionId: typeof candidate.baseVersionId === "string" && candidate.baseVersionId.trim().length > 0 ? candidate.baseVersionId.trim() : void 0,
    title,
    contentPath,
    contentAbsolutePath,
    summary: typeof candidate.summary === "string" && candidate.summary.trim().length > 0 ? candidate.summary.trim() : void 0,
    mode: candidate.mode === "create" || candidate.mode === "update" ? candidate.mode : "create_or_update",
    triggerType: candidate.triggerType === "handoff" ? "handoff" : "agent",
    operations: normalizedOperations
  };
}
function normalizeDocumentOperationEntry(workDir, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { error: "documents[].operations[] \u7684\u6BCF\u4E00\u9879\u90FD\u5FC5\u987B\u662F\u5BF9\u8C61\u3002" };
  }
  const candidate = entry;
  if (candidate.op === "delete_block") {
    if (typeof candidate.blockId !== "string" || candidate.blockId.trim().length === 0) {
      return { error: "delete_block \u7F3A\u5C11 blockId\u3002" };
    }
    if (typeof candidate.baseRevision !== "number") {
      return { error: "delete_block \u7F3A\u5C11 baseRevision\u3002" };
    }
    return {
      op: "delete_block",
      blockId: candidate.blockId.trim(),
      baseRevision: candidate.baseRevision
    };
  }
  const contentPath = typeof candidate.contentPath === "string" ? candidate.contentPath.trim() : "";
  if (!contentPath) {
    return { error: `operation ${String(candidate.op)} \u7F3A\u5C11 contentPath\u3002` };
  }
  const resolved = resolveDocumentContentPath(workDir, contentPath);
  if (typeof resolved !== "string") {
    return resolved;
  }
  if (candidate.op === "replace_block") {
    if (typeof candidate.blockId !== "string" || candidate.blockId.trim().length === 0) {
      return { error: "replace_block \u7F3A\u5C11 blockId\u3002" };
    }
    if (typeof candidate.baseRevision !== "number") {
      return { error: "replace_block \u7F3A\u5C11 baseRevision\u3002" };
    }
    return {
      op: "replace_block",
      blockId: candidate.blockId.trim(),
      baseRevision: candidate.baseRevision,
      contentAbsolutePath: resolved,
      heading: typeof candidate.heading === "string" ? candidate.heading.trim() : void 0
    };
  }
  if (candidate.op === "insert_after") {
    return {
      op: "insert_after",
      afterBlockId: typeof candidate.afterBlockId === "string" && candidate.afterBlockId.trim().length > 0 ? candidate.afterBlockId.trim() : void 0,
      contentAbsolutePath: resolved,
      heading: typeof candidate.heading === "string" ? candidate.heading.trim() : void 0
    };
  }
  return { error: `\u4E0D\u652F\u6301\u7684\u7FA4\u6587\u6863 operation\uFF1A${String(candidate.op)}` };
}
function resolveDocumentContentPath(workDir, contentPath) {
  if (isAbsolute6(contentPath)) {
    return { error: `\u7FA4\u6587\u6863 contentPath \u53EA\u652F\u6301\u76F8\u5BF9\u8DEF\u5F84\uFF1A${contentPath}` };
  }
  if (containsParentTraversal(contentPath)) {
    return { error: `\u7FA4\u6587\u6863 contentPath \u4E0D\u5141\u8BB8\u5305\u542B .. \uFF1A${contentPath}` };
  }
  const absolutePath = resolve17(workDir, contentPath);
  if (!existsSync16(absolutePath)) {
    return { error: `\u7FA4\u6587\u6863\u5185\u5BB9\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${contentPath}` };
  }
  const realWorkDir = realpathSync3(workDir);
  const realFilePath = realpathSync3(absolutePath);
  const relativeToWorkDir = relative5(realWorkDir, realFilePath);
  if (relativeToWorkDir !== "" && relativeToWorkDir !== "." && (relativeToWorkDir.startsWith("..") || isAbsolute6(relativeToWorkDir))) {
    return { error: `\u7FA4\u6587\u6863 contentPath \u8D85\u51FA\u5F53\u524D workDir\uFF1A${contentPath}` };
  }
  const fileStat = statSync8(realFilePath);
  if (!fileStat.isFile()) {
    return { error: `\u7FA4\u6587\u6863 contentPath \u4E0D\u662F\u6587\u4EF6\uFF1A${contentPath}` };
  }
  return realFilePath;
}
function containsParentTraversal(value) {
  return value.replace(/\\/g, "/").split("/").some((segment) => segment.trim() === "..");
}
function sanitizePathSegment2(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "document";
}
function sameValue5(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
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
function parseTaskPayload(task) {
  return parseTaskInputJson(task.inputJson);
}
function resolveConversationThreadId(input) {
  const isConversationTrigger = input.triggerType === "channel_chat" || input.triggerType === "mention_chat";
  if (!isConversationTrigger && !input.payload.contactId) {
    return void 0;
  }
  return input.payload.channelName ?? input.payload.channel;
}
function prepareDaemonTaskContext(input) {
  const payload = {
    ...parseTaskPayload(input.task),
    ...input.payloadOverride ?? {}
  };
  const attachmentLines = materializeAttachments(payload.attachments, input.workDir);
  const workspaceState = readWorkspaceStateSync(input.task.workspaceId);
  const runtimeApps = listRuntimeAppContextEntriesForRuntimeSync({
    workspaceId: input.task.workspaceId,
    runtimeId: input.runtime.id
  });
  const agentDocumentContexts = input.agentDocumentContexts ?? contextsFromLegacyDocuments(input.channelDocuments ?? []);
  const agentName = payload.assignee ?? input.task.agentId;
  const agentNotifications = resolveAgentNotificationsForTask({
    workspaceId: input.task.workspaceId,
    agentName,
    task: input.task,
    payload,
    agentDocumentContexts
  });
  const documentPermissionRequests = listDocumentPermissionRequestsSync2({
    workspaceId: input.task.workspaceId,
    requestedByAgentName: agentName
  }).filter((request) => request.status === "pending" || request.status === "rejected");
  const visibleDocuments = agentDocumentContexts.map((context) => context.document);
  let agentSkills = resolveAgentSkills(workspaceState, input.agentProfile, input.task.workspaceId);
  agentSkills = includeGoogleWorkspaceCliSkill(agentSkills, workspaceState.skills, visibleDocuments, {
    workspaceId: input.task.workspaceId,
    agentName,
    channelName: payload.channelName ?? payload.channel
  });
  agentSkills = filterRuntimeAppSkillsByRuntimeAvailability(agentSkills, runtimeApps);
  const agentKnowledgePages = resolveAgentKnowledgePages(workspaceState, input.agentProfile, input.task.workspaceId);
  const skillDirectories = materializeAgentSkills(agentSkills, input.workDir, input.runtime.provider);
  const knowledgeContextDir = materializeAgentKnowledgePages(agentKnowledgePages, input.workDir);
  const channelDocumentsContextDir = agentDocumentContexts.length > 0 ? materializeChannelDocuments(agentDocumentContexts, input.workDir, input.task.workspaceId) : void 0;
  return {
    prompt: buildTaskPromptWithDocumentContexts(
      input.runtime,
      payload,
      attachmentLines,
      input.agentProfile,
      agentSkills,
      skillDirectories.compatibilityDir,
      skillDirectories.nativeDir,
      agentDocumentContexts,
      channelDocumentsContextDir,
      input.contactContext,
      { pages: agentKnowledgePages, contextDir: knowledgeContextDir },
      runtimeApps,
      documentPermissionRequests,
      agentNotifications,
      input.routerSessionContext
    ),
    payload,
    agentProfile: input.agentProfile,
    agentSkills,
    agentKnowledgePages,
    runtimeApps,
    agentDocumentContexts,
    agentNotifications,
    attachmentLines,
    skillContextDir: skillDirectories.compatibilityDir,
    providerSkillContextDir: skillDirectories.nativeDir,
    channelDocumentsContextDir,
    knowledgeContextDir
  };
}
function buildTaskPrompt(runtime, payload, attachmentLines, agentProfile, agentSkills = [], skillContextDir, providerSkillContextDir, channelDocuments = [], channelDocumentsContextDir, contactContext, knowledgeContext, runtimeApps = [], documentPermissionRequests = [], agentNotifications = [], routerSessionContext) {
  const agentDocumentContexts = contextsFromLegacyDocuments(channelDocuments);
  return buildTaskPromptWithDocumentContexts(
    runtime,
    payload,
    attachmentLines,
    agentProfile,
    agentSkills,
    skillContextDir,
    providerSkillContextDir,
    agentDocumentContexts,
    channelDocumentsContextDir,
    contactContext,
    knowledgeContext,
    runtimeApps,
    documentPermissionRequests,
    agentNotifications,
    routerSessionContext
  );
}
function buildTaskPromptWithDocumentContexts(runtime, payload, attachmentLines, agentProfile, agentSkills = [], skillContextDir, providerSkillContextDir, agentDocumentContexts = [], channelDocumentsContextDir, contactContext, knowledgeContext, runtimeApps = [], documentPermissionRequests = [], agentNotifications = [], routerSessionContext) {
  const agentContextLines = buildAgentContextLines(
    agentProfile,
    agentSkills,
    runtime.provider,
    skillContextDir,
    providerSkillContextDir
  );
  const contactContextLines = buildContactContextLines(contactContext);
  const knowledgeContextLines = buildKnowledgeContextLines(knowledgeContext);
  const runtimeAppLines = buildRuntimeAppContextLines(runtimeApps);
  const documentPromptLines = buildChannelDocumentPromptLines(agentDocumentContexts, channelDocumentsContextDir);
  const documentPermissionRequestLines = buildDocumentPermissionRequestLines(documentPermissionRequests);
  const agentNotificationLines = buildAgentNotificationLines(agentNotifications);
  const routerSessionLines = buildRouterSessionContextLines(routerSessionContext);
  if (payload.channelName && payload.channelMessage) {
    const isDirectConversation = Boolean(payload.contactId);
    const historyLines = payload.channelHistory?.map((message) => {
      const attachmentText = message.attachments && message.attachments.length > 0 ? ` [\u9644\u4EF6: ${message.attachments.join(", ")}]` : "";
      const kindText = message.kind === "process" ? ` [\u8FC7\u7A0B:${message.processType ?? "unknown"}]` : "";
      const mentionText = message.mentions && message.mentions.length > 0 ? ` [\u63D0\u53CA: ${message.mentions.join(", ")}]` : "";
      return `- ${message.time ?? "\u672A\u77E5\u65F6\u95F4"} | ${message.speaker}: ${message.summary}${kindText}${mentionText}${attachmentText}`;
    }) ?? [];
    return [
      "\u4EE5\u4E0B\u662F\u5F53\u524D Agent \u7684\u7528\u6237\u914D\u7F6E\u3002\u8EAB\u4EFD\u3001\u8BED\u6C14\u548C\u804C\u8D23\u53EA\u80FD\u57FA\u4E8E\u8FD9\u4E9B\u7528\u6237\u914D\u7F6E\u51B3\u5B9A\uFF0C\u4E0D\u8981\u8865\u5145\u4EFB\u4F55\u901A\u7528\u7CFB\u7EDF\u8EAB\u4EFD\u3002",
      `\u5F53\u524D provider: ${runtime.provider}`,
      payload.assignee ? `Agent \u540D\u79F0: ${payload.assignee}` : "",
      isDirectConversation && payload.contactId ? `\u5F53\u524D\u5171\u4EAB\u4F1A\u8BDD\u5BF9\u5E94 Agent: ${payload.contactId}` : "",
      payload.mentionType === "agent" ? "\u8FD9\u6B21\u89E6\u53D1\u6765\u81EA\u7FA4\u804A\u91CC\u7684\u663E\u5F0F @ mention\uFF0C\u53EA\u9700\u8981\u4EE5\u88AB\u70B9\u540D Agent \u7684\u8EAB\u4EFD\u56DE\u590D\u3002" : "",
      payload.assigneeMentionToken ? `\u4F60\u5728\u6D88\u606F\u91CC\u88AB\u5199\u4F5C: @${payload.assigneeMentionToken}` : "",
      payload.mentionedAgentLabels && payload.mentionedAgentLabels.length > 0 ? `\u8FD9\u6761\u6D88\u606F\u540C\u65F6\u63D0\u5230\u4E86: ${payload.mentionedAgentLabels.map((item) => `@${item}`).join("\u3001")}` : "",
      !isDirectConversation ? "\u4F60\u53EF\u4EE5\u5728\u6700\u7EC8\u56DE\u590D\u91CC\u663E\u5F0F @\u9891\u9053\u5185\u6210\u5458 \u8BF7\u6C42\u786E\u8BA4\uFF0C\u6216 @\u9891\u9053\u5185 Agent \u53D1\u8D77\u660E\u786E\u4EA4\u63A5\uFF1B@\u4EBA\u4F1A\u8FDB\u5165\u771F\u5B9E mention\uFF0C@Agent \u4F1A\u5728\u6743\u9650\u548C\u9632\u5FAA\u73AF\u89C4\u5219\u5141\u8BB8\u65F6\u89E6\u53D1\u5BF9\u65B9\u3002\u4E0D\u8981\u4E3A\u4E86\u793C\u8C8C\u6216\u6CDB\u6CDB\u5F15\u7528\u800C @\u3002" : "",
      payload.mentionSource === "agent_output" && payload.initiatorAgentId ? `\u8FD9\u6B21 @ \u6765\u81EA Agent ${payload.initiatorAgentId} \u7684\u6700\u7EC8\u56DE\u590D\u3002` : "",
      typeof payload.mentionCascadeDepth === "number" ? `\u5F53\u524D Agent @ \u7EA7\u8054\u6DF1\u5EA6: ${payload.mentionCascadeDepth}` : "",
      payload.mentionRootMessageId ? `Agent @ \u6839\u6D88\u606F ID: ${payload.mentionRootMessageId}` : "",
      payload.sourceMessageId ? `\u6E90\u6D88\u606F ID: ${payload.sourceMessageId}` : "",
      payload.sourceTaskQueueId ? `\u6E90\u4EFB\u52A1\u961F\u5217 ID: ${payload.sourceTaskQueueId}` : "",
      payload.stepInstruction ? `\u672C\u6B21\u4F60\u8D1F\u8D23\u7684\u6B65\u9AA4: ${payload.stepInstruction}` : "",
      payload.stepDependsOnIds && payload.stepDependsOnIds.length > 0 ? `\u672C\u6B65\u9AA4\u4F9D\u8D56\u4E0A\u6E38\u6B65\u9AA4: ${payload.stepDependsOnIds.join(", ")}` : "",
      payload.stepHandoffKind ? `\u672C\u6B65\u9AA4\u4EA4\u63A5\u7C7B\u578B: ${payload.stepHandoffKind}` : "",
      payload.handoffDocumentIds && payload.handoffDocumentIds.length > 0 ? `\u4E0A\u6E38\u6B65\u9AA4\u4EA7\u51FA\u7684\u6587\u6863 ID: ${payload.handoffDocumentIds.join(", ")}` : "",
      payload.handoffDocumentVersionIds && payload.handoffDocumentVersionIds.length > 0 ? `\u4E0A\u6E38\u6B65\u9AA4\u4EA7\u51FA\u7684\u6587\u6863\u7248\u672C ID: ${payload.handoffDocumentVersionIds.join(", ")}` : "",
      agentContextLines.length > 0 ? "\u4EE5\u4E0B\u662F\u8FD9\u4E2A Agent \u7684\u957F\u671F\u914D\u7F6E\uFF1A" : "",
      ...agentContextLines,
      "\u5982\u679C\u9700\u8981\u81EA\u6211\u4ECB\u7ECD\uFF0C\u53EA\u6839\u636E\u4E0A\u9762\u7684\u7528\u6237\u914D\u7F6E\u56DE\u7B54\uFF0C\u4E0D\u8981\u81EA\u79F0\u5E73\u53F0\u9ED8\u8BA4 Agent\u3002",
      contactContextLines.length > 0 ? "\u4EE5\u4E0B\u662F\u5F53\u524D Agent \u5728 workspace \u4E2D\u53EF\u89C1\u7684\u534F\u4F5C\u5173\u7CFB\u4E8B\u5B9E\uFF1A" : "",
      ...contactContextLines,
      contactContextLines.length > 0 ? "\u8FD9\u4E9B\u4E8B\u5B9E\u53EA\u63CF\u8FF0\u5F53\u524D workspace \u5185\u53EF\u89C1\u7684\u534F\u4F5C\u5173\u7CFB\uFF0C\u4E0D\u4EE3\u8868\u73B0\u5B9E\u4E16\u754C\u8EAB\u4EFD\uFF0C\u4E5F\u4E0D\u5305\u542B\u7528\u6237\u4FA7\u79C1\u6709\u5C55\u793A\u5B57\u6BB5\u3002" : "",
      ...routerSessionLines,
      ...knowledgeContextLines,
      ...runtimeAppLines,
      ...agentNotificationLines,
      ...documentPermissionRequestLines,
      isDirectConversation ? `\u5F53\u524D\u5171\u4EAB\u4F1A\u8BDD: ${payload.channelName}` : `\u7FA4\u804A\u9891\u9053: ${payload.channelName}`,
      ...documentPromptLines,
      historyLines.length > 0 ? isDirectConversation ? "\u4EE5\u4E0B\u662F\u8FD9\u6761\u4F1A\u8BDD\u5B8C\u6574\u5386\u53F2\u6D88\u606F\uFF0C\u6309\u65F6\u95F4\u987A\u5E8F\u6392\u5217\uFF1A" : "\u4EE5\u4E0B\u662F\u8BE5\u9891\u9053\u5B8C\u6574\u5386\u53F2\u6D88\u606F\uFF0C\u6309\u65F6\u95F4\u987A\u5E8F\u6392\u5217\uFF1A" : "",
      ...historyLines,
      payload.channelHistoryPath ? isDirectConversation ? `\u5982\u679C\u4E0A\u9762\u7684\u5185\u8054\u5386\u53F2\u4ECD\u7136\u4E0D\u591F\uFF0C\u8BF7\u7EE7\u7EED\u8BFB\u53D6 workspace \u4E2D\u7684\u4F1A\u8BDD\u5386\u53F2 Markdown\uFF1A${payload.channelHistoryPath}` : `\u5982\u679C\u4E0A\u9762\u7684\u5185\u8054\u5386\u53F2\u4ECD\u7136\u4E0D\u591F\uFF0C\u8BF7\u7EE7\u7EED\u8BFB\u53D6 workspace \u4E2D\u7684\u9891\u9053\u5386\u53F2 Markdown\uFF1A${payload.channelHistoryPath}` : "",
      isDirectConversation ? "\u4EE5\u4E0B\u662F\u4F1A\u8BDD\u91CC\u7684\u65B0\u6D88\u606F\u3002\u8BF7\u4EE5\u79C1\u804A\u5BF9\u8C61\u8EAB\u4EFD\uFF0C\u7ED9\u51FA\u4E00\u6BB5\u81EA\u7136\u3001\u7B80\u6D01\u3001\u9002\u5408\u76F4\u63A5\u53D1\u56DE\u8FD9\u6761\u4F1A\u8BDD\u7684\u56DE\u590D\u3002\u8BED\u8A00\u6309\u7167\u7528\u6237\u6D88\u606F\u7684\u8BED\u8A00\u51B3\u5B9A\u3002" : "\u4EE5\u4E0B\u662F\u7FA4\u91CC\u7684\u65B0\u6D88\u606F\u3002\u8BF7\u4EE5\u7FA4\u6210\u5458\u8EAB\u4EFD\uFF0C\u7ED9\u51FA\u4E00\u6BB5\u81EA\u7136\u3001\u7B80\u6D01\u3001\u9002\u5408\u76F4\u63A5\u53D1\u56DE\u7FA4\u804A\u7684\u56DE\u590D\u3002\u8BED\u8A00\u6309\u7167\u7528\u6237\u6D88\u606F\u7684\u8BED\u8A00\u51B3\u5B9A\u3002",
      isDirectConversation ? `\u4F1A\u8BDD\u6D88\u606F: ${payload.channelMessage}` : `\u7FA4\u804A\u6D88\u606F: ${payload.channelMessage}`,
      attachmentLines.length > 0 ? isDirectConversation ? "\u4F1A\u8BDD\u91CC\u8FD8\u9644\u5E26\u4E86\u4EE5\u4E0B\u6587\u4EF6\uFF1A" : "\u7FA4\u91CC\u8FD8\u9644\u5E26\u4E86\u4EE5\u4E0B\u6587\u4EF6\uFF1A" : "",
      ...attachmentLines,
      "\u5982\u679C\u4F60\u4E0D\u9700\u8981\u56DE\u590D\uFF0C\u4E5F\u8981\u660E\u786E\u8BF4\u660E\u539F\u56E0\uFF1B\u4E0D\u8981\u7A7A\u56DE\u590D\u3002"
    ].filter(Boolean).join("\n");
  }
  return [
    "\u4EE5\u4E0B\u662F\u5F53\u524D Agent \u7684\u7528\u6237\u914D\u7F6E\u3002\u8EAB\u4EFD\u3001\u8BED\u6C14\u548C\u804C\u8D23\u53EA\u80FD\u57FA\u4E8E\u8FD9\u4E9B\u7528\u6237\u914D\u7F6E\u51B3\u5B9A\uFF0C\u4E0D\u8981\u8865\u5145\u4EFB\u4F55\u901A\u7528\u7CFB\u7EDF\u8EAB\u4EFD\u3002",
    `\u5F53\u524D provider: ${runtime.provider}`,
    payload.assignee ? `\u4EFB\u52A1\u63A5\u6536\u4EBA: ${payload.assignee}` : "",
    agentContextLines.length > 0 ? "\u4EE5\u4E0B\u662F\u5F53\u524D\u4EFB\u52A1\u63A5\u6536 Agent \u7684\u957F\u671F\u914D\u7F6E\uFF1A" : "",
    ...agentContextLines,
    ...routerSessionLines,
    ...knowledgeContextLines,
    ...runtimeAppLines,
    ...agentNotificationLines,
    ...documentPermissionRequestLines,
    ...documentPromptLines,
    payload.channel ? `\u9891\u9053: ${payload.channel}` : "",
    payload.priority ? `\u4F18\u5148\u7EA7: ${payload.priority}` : "",
    payload.title ? `\u4EFB\u52A1\u6807\u9898: ${payload.title}` : "",
    attachmentLines.length > 0 ? "\u9644\u5E26\u6587\u4EF6\uFF1A" : "",
    ...attachmentLines,
    "\u8BF7\u76F4\u63A5\u6267\u884C\u8FD9\u6761\u4EFB\u52A1\uFF0C\u5E76\u8F93\u51FA\u4E00\u6BB5\u7B80\u6D01\u3001\u53EF\u53D1\u56DE\u5DE5\u4F5C\u53F0\u7684\u56DE\u590D\u3002\u8BED\u8A00\u6309\u7167\u7528\u6237\u6D88\u606F\u7684\u8BED\u8A00\u51B3\u5B9A\u3002",
    "\u5982\u679C\u4EFB\u52A1\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u4E5F\u8BF7\u660E\u786E\u8BF4\u660E\u7F3A\u4EC0\u4E48\uFF0C\u4E0D\u8981\u7A7A\u56DE\u590D\u3002"
  ].filter(Boolean).join("\n");
}
function resolveAgentNotificationsForTask(input) {
  const notifications = listNotificationsForRecipientSync({
    workspaceId: input.workspaceId,
    recipientType: "agent",
    recipientId: input.agentName,
    status: "unread",
    limit: 30
  });
  const relatedChannels = new Set([
    input.payload.channelName,
    input.payload.channel,
    input.payload.sourceChannel
  ].map(normalizeComparable).filter((value) => Boolean(value)));
  const relatedTaskIds = new Set([
    input.task.id,
    input.payload.taskId,
    input.payload.sourceTaskQueueId
  ].map(normalizeComparable).filter((value) => Boolean(value)));
  const relatedDocumentIds = new Set([
    ...input.agentDocumentContexts.map((context) => context.document.id),
    ...input.payload.handoffDocumentIds ?? []
  ].map(normalizeComparable).filter((value) => Boolean(value)));
  return notifications.filter((notification) => isNotificationRelatedToTask(notification, {
    relatedChannels,
    relatedTaskIds,
    relatedDocumentIds
  })).slice(0, 8);
}
function isNotificationRelatedToTask(notification, context) {
  const channelName = normalizeComparable(notification.channelName);
  if (channelName && context.relatedChannels.has(channelName)) {
    return true;
  }
  const resourceId = normalizeComparable(notification.resourceId);
  if (!resourceId) {
    return false;
  }
  if (notification.resourceType === "task") {
    return context.relatedTaskIds.has(resourceId);
  }
  if (notification.resourceType === "document") {
    return context.relatedDocumentIds.has(resourceId);
  }
  return false;
}
function buildAgentNotificationLines(notifications) {
  if (notifications.length === 0) {
    return [];
  }
  return [
    "\u4EE5\u4E0B\u662F\u5F53\u524D\u4EFB\u52A1\u76F8\u5173\u7684\u672A\u8BFB Agent \u901A\u77E5\uFF1B\u53EA\u628A\u5B83\u4EEC\u4F5C\u4E3A\u72B6\u6001\u4E8B\u5B9E\u4F7F\u7528\uFF0C\u4E0D\u8981\u81EA\u52A8\u89E6\u53D1\u989D\u5916\u6267\u884C\uFF1A",
    ...notifications.map((notification) => {
      const parts = [
        `- ${notification.type}`,
        notification.resourceType,
        notification.resourceId ? `resource ${notification.resourceId}` : "",
        notification.channelName ? `channel ${notification.channelName}` : "",
        `${notification.title}: ${truncateNotificationText(notification.body)}`
      ].filter(Boolean);
      return parts.join(" | ");
    })
  ];
}
function buildRouterSessionContextLines(context) {
  if (!context) {
    return [];
  }
  const lines = [
    "\u4EE5\u4E0B\u662F AgentSpace \u5E73\u53F0\u7EA7 Router Session \u72B6\u6001\uFF1B\u5B83\u662F\u8FDE\u7EED\u6027\u7684\u4E8B\u5B9E\u6E90\uFF0Cprovider \u539F\u751F session \u53EA\u662F\u4E0D\u53EF\u9760\u7684\u53EF\u590D\u7528\u7F13\u5B58\uFF1A",
    `- routerSessionId: ${context.routerSessionId}`,
    context.conversationKey ? `- conversationKey: ${context.conversationKey}` : "",
    context.sourceType ? `- sourceType: ${context.sourceType}` : "",
    context.continuationMode ? `- continuationMode: ${formatContinuationMode(context.continuationMode)}` : "",
    context.selectedRuntimeId ? `- selectedRuntimeId: ${context.selectedRuntimeId}` : "",
    context.previousRuntimeId && context.previousRuntimeId !== context.selectedRuntimeId ? `- previousRuntimeId: ${context.previousRuntimeId}` : "",
    context.providerSessionId ? `- providerSessionId: ${context.providerSessionId}\uFF08\u53EA\u53EF\u5728\u5F53\u524D provider/runtime \u517C\u5BB9\u65F6\u4F5C\u4E3A resume hint\uFF09` : "- providerSessionId: none\uFF08\u8BF7\u57FA\u4E8E\u5E73\u53F0\u4E0A\u4E0B\u6587\u51B7\u542F\u52A8\u7EE7\u7EED\uFF09",
    typeof context.attemptCount === "number" ? `- attemptCount: ${context.attemptCount}` : "",
    context.fallbackReason ? `- fallbackReason: ${context.fallbackReason}` : "",
    context.memorySummary?.trim() ? "Router memory summary:" : "",
    context.memorySummary?.trim() ? truncateRouterContextBlock(context.memorySummary) : "",
    context.latestHandoffSnapshot?.trim() ? "Latest handoff snapshot:" : "",
    context.latestHandoffSnapshot?.trim() ? truncateRouterContextBlock(context.latestHandoffSnapshot) : "",
    context.transcriptLines && context.transcriptLines.length > 0 ? "Compact router transcript / event log:" : "",
    ...(context.transcriptLines ?? []).slice(-40).map((line) => `- ${truncateRouterLine(line)}`),
    "\u5982\u679C provider session \u7F3A\u5931\u3001\u5931\u6548\u6216 provider/runtime \u5DF2\u5207\u6362\uFF0C\u4E0D\u8981\u5047\u8BBE\u9690\u85CF\u4F1A\u8BDD\u72B6\u6001\u4ECD\u5B58\u5728\uFF1B\u8BF7\u6839\u636E\u4E0A\u9762\u7684\u5E73\u53F0\u72B6\u6001\u3001\u9891\u9053\u5386\u53F2\u3001\u6587\u6863\u3001\u77E5\u8BC6\u548C\u9644\u4EF6\u7EE7\u7EED\u3002"
  ];
  return lines.filter(Boolean);
}
function formatContinuationMode(mode) {
  if (mode === "same_provider_resume") {
    return "same provider resume";
  }
  if (mode === "fallback") {
    return "runtime fallback with cold rebuild";
  }
  return "cold rebuild";
}
function truncateRouterContextBlock(value) {
  const normalized = value.trim();
  return normalized.length <= 2400 ? normalized : `${normalized.slice(0, 2397)}...`;
}
function truncateRouterLine(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 220 ? normalized : `${normalized.slice(0, 217)}...`;
}
function truncateNotificationText(value) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177)}...`;
}
function normalizeComparable(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : void 0;
}
function buildDocumentPermissionRequestLines(requests) {
  const relevantRequests = requests.filter((request) => request.status === "pending" || request.status === "rejected").slice(0, 10);
  if (relevantRequests.length === 0) {
    return [];
  }
  return [
    "\u4EE5\u4E0B\u662F\u5F53\u524D Agent \u5DF2\u6709\u7684\u6587\u6863\u6743\u9650\u7533\u8BF7\u72B6\u6001\uFF1B\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u540C\u4E00\u6587\u6863/\u89D2\u8272/\u76EE\u6807\u9891\u9053\u7533\u8BF7\uFF0C\u9664\u975E\u7528\u6237\u63D0\u4F9B\u65B0\u7684\u660E\u786E\u7406\u7531\uFF1A",
    ...relevantRequests.map((request) => {
      const target = request.documentId ?? request.externalUrl ?? request.externalFileId ?? "unknown";
      const parts = [
        `- ${request.status}`,
        `role ${request.requestedRole}`,
        `target ${target}`,
        request.requestedForChannelName ? `channel ${request.requestedForChannelName}` : "",
        request.reason ? `reason ${request.reason}` : "",
        request.decisionNote ? `decision ${request.decisionNote}` : ""
      ].filter(Boolean);
      return parts.join(" | ");
    })
  ];
}
function contextsFromLegacyDocuments(documents) {
  return documents.map((document) => ({
    document,
    role: "editor",
    source: "channel_context",
    allowedActions: ["view", "edit"]
  }));
}
function buildRuntimeAppContextLines(runtimeApps) {
  if (runtimeApps.length === 0) {
    return ["\u5F53\u524D\u7ED1\u5B9A runtime \u672A\u62A5\u544A\u5DF2\u5B89\u88C5\u7684 CLI-Hub runtime app\uFF1B\u4E0D\u8981\u58F0\u79F0\u53EF\u4EE5\u76F4\u63A5\u8C03\u7528\u672A\u5217\u51FA\u7684 CLI\u3002"];
  }
  const lines = [
    `\u5F53\u524D\u7ED1\u5B9A runtime \u5DF2\u5B89\u88C5\u5E76\u542F\u7528\u7684 CLI-Hub runtime apps: ${runtimeApps.length} \u4E2A\u3002`
  ];
  for (const app of runtimeApps.slice(0, 20)) {
    const parts = [
      `- ${app.displayName} (${app.source}:${app.name})`,
      app.entryPoint ? `entry point: ${app.entryPoint}` : "",
      app.version ? `version: ${app.version}` : "",
      app.category ? `category: ${app.category}` : "",
      app.requiresText ? `requires: ${app.requiresText}` : "",
      app.skillMd ? `SKILL.md: ${app.skillMd}` : ""
    ].filter(Boolean);
    lines.push(parts.join(" | "));
  }
  if (runtimeApps.length > 20) {
    lines.push(`\u8FD8\u6709 ${runtimeApps.length - 20} \u4E2A runtime app \u672A\u5728 prompt \u4E2D\u9010\u9879\u5217\u51FA\u3002`);
  }
  lines.push("\u53EA\u6709\u4E0A\u9762\u5217\u51FA\u7684 runtime app \u53EF\u88AB\u89C6\u4E3A\u5F53\u524D\u4EFB\u52A1\u771F\u5B9E\u53EF\u7528\uFF1Bworkspace skill \u53EA\u662F\u4F7F\u7528\u8BF4\u660E\uFF0C\u4E0D\u4EE3\u8868\u8F6F\u4EF6\u5DF2\u5B89\u88C5\u3002");
  return lines;
}
function materializeAgentSkills(skills, workDir, provider = "gemini") {
  return materializeWorkspaceSkillsForProvider({
    skills,
    workDir,
    provider
  });
}
function resolveAgentKnowledgePages(_workspaceState, agentProfile, workspaceId) {
  if (!agentProfile) {
    return [];
  }
  return listEmployeeKnowledgePagesSync(agentProfile.name, workspaceId);
}
function materializeAgentKnowledgePages(pages, workDir) {
  if (pages.length === 0) {
    return void 0;
  }
  const knowledgeDir = join21(workDir, ".agent_context", "knowledge");
  const pagesDir = join21(knowledgeDir, "pages");
  rmSync10(knowledgeDir, { recursive: true, force: true });
  mkdirSync11(pagesDir, { recursive: true });
  const manifestPages = pages.map((page, index) => {
    const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizePathSegment3(page.title)}-${page.id.slice(-6)}.md`;
    writeFileSync9(join21(pagesDir, fileName), page.contentMarkdown, "utf8");
    return {
      id: page.id,
      title: page.title,
      tags: page.tags,
      assignmentMode: page.assignmentMode ?? "all_agents",
      updatedAt: page.updatedAt,
      path: `pages/${fileName}`
    };
  });
  writeFileSync9(
    join21(knowledgeDir, "manifest.json"),
    JSON.stringify({
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageCount: manifestPages.length,
      pages: manifestPages
    }, null, 2),
    "utf8"
  );
  return knowledgeDir;
}
function materializeAttachments(attachments, workDir) {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  const targetDir = join21(workDir, "attachments");
  mkdirSync11(targetDir, { recursive: true });
  return attachments.map((attachment, index) => {
    const safeName = sanitizePathSegment3(attachment.fileName.replace(/[\\/]/g, "-"));
    const targetPath = join21(targetDir, `${String(index + 1).padStart(2, "0")}-${safeName}`);
    try {
      copyFileSync3(attachment.storedPath, targetPath);
      return `- ${attachment.fileName} (${targetPath})`;
    } catch {
      return `- ${attachment.fileName} (${attachment.storedPath})`;
    }
  });
}
function resolveAgentSkills(workspaceState, agentProfile, workspaceId) {
  if (!agentProfile) {
    return [];
  }
  const assignmentSkillIds = listEmployeeSkillIdsSync(agentProfile.name, workspaceId);
  const assignedSkills = workspaceState.skills.filter((skill) => assignmentSkillIds.includes(skill.id));
  const builtinOutputSkill = workspaceState.skills.find((skill) => sameValue(skill.name, BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME2));
  if (builtinOutputSkill && !assignedSkills.some((skill) => skill.id === builtinOutputSkill.id)) {
    assignedSkills.unshift(builtinOutputSkill);
  }
  const builtinWorkspaceContextSkill = workspaceState.skills.find((skill) => sameValue(skill.name, BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME2));
  if (builtinWorkspaceContextSkill && !assignedSkills.some((skill) => skill.id === builtinWorkspaceContextSkill.id)) {
    assignedSkills.unshift(builtinWorkspaceContextSkill);
  }
  const builtinChannelDocumentsSkill = workspaceState.skills.find((skill) => sameValue(skill.name, BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME2));
  if (builtinChannelDocumentsSkill && !assignedSkills.some((skill) => skill.id === builtinChannelDocumentsSkill.id)) {
    assignedSkills.unshift(builtinChannelDocumentsSkill);
  }
  return assignedSkills;
}
function includeGoogleWorkspaceCliSkill(assignedSkills, workspaceSkills, channelDocuments, context) {
  if (!channelDocuments.some(isExternalGoogleWorkspaceDocument) && !canCreateGoogleSheetInChannel(context)) {
    return assignedSkills;
  }
  const googleWorkspaceCliSkill = workspaceSkills.find((skill) => sameValue(skill.name, BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME2));
  if (!googleWorkspaceCliSkill || assignedSkills.some((skill) => skill.id === googleWorkspaceCliSkill.id)) {
    return assignedSkills;
  }
  return [googleWorkspaceCliSkill, ...assignedSkills];
}
function canCreateGoogleSheetInChannel(input) {
  if (process.env.AGENT_SPACE_AGENT_GOOGLE_SHEET_CREATE_ENABLED === "false" || !input.channelName) {
    return false;
  }
  return Boolean(readActiveAgentGoogleWorkspaceDelegationSync({
    workspaceId: input.workspaceId,
    employeeName: input.agentName
  }));
}
function filterRuntimeAppSkillsByRuntimeAvailability(skills, runtimeApps) {
  const availableAppKeys = new Set(runtimeApps.map((app) => `${app.source}:${app.name}`));
  return skills.filter((skill) => {
    if (skill.sourceType !== "clihub_runtime_app") {
      return true;
    }
    const requiredAppKey = readRuntimeAppSkillConfigKey(skill.configJson);
    return Boolean(requiredAppKey && availableAppKeys.has(requiredAppKey));
  });
}
function readRuntimeAppSkillConfigKey(configJson) {
  if (!configJson) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(configJson);
    if (typeof parsed.runtimeApp?.source === "string" && typeof parsed.runtimeApp.name === "string") {
      return `${parsed.runtimeApp.source}:${parsed.runtimeApp.name}`;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function isExternalGoogleWorkspaceDocument(document) {
  return document.storageMode === "external" && document.externalProvider === "google_workspace" && Boolean(document.externalFileId);
}
function buildAgentContextLines(agentProfile, agentSkills, provider, skillContextDir, providerSkillContextDir) {
  if (!agentProfile) {
    return [];
  }
  const lines = [
    `Agent \u5C55\u793A\u540D: ${agentProfile.remarkName?.trim() || agentProfile.name}`,
    `Agent \u5185\u90E8\u540D: ${agentProfile.name}`,
    agentProfile.role.trim().length > 0 && agentProfile.role !== "Agent" ? `\u89D2\u8272: ${agentProfile.role}` : "",
    agentProfile.summary.trim().length > 0 ? `\u5B9A\u4F4D: ${agentProfile.summary.trim()}` : "",
    agentProfile.instructions?.trim() ? `Instructions:
${agentProfile.instructions.trim()}` : ""
  ].filter(Boolean);
  if (agentSkills.length > 0) {
    lines.push(`\u5DF2\u5206\u914D Skills: ${agentSkills.map((skill) => skill.name).join(", ")}`);
    if (providerSkillContextDir) {
      lines.push(`\u5F53\u524D provider(${provider}) \u539F\u751F\u6280\u80FD\u76EE\u5F55: ${providerSkillContextDir}`);
    }
    if (skillContextDir) {
      lines.push(`\u517C\u5BB9\u6280\u80FD\u76EE\u5F55: ${skillContextDir}`);
      lines.push("\u6BCF\u4E2A skill \u5B50\u76EE\u5F55\u91CC\u90FD\u5305\u542B SKILL.md \u548C supporting files\uFF1B\u5F00\u59CB\u5DE5\u4F5C\u524D\uFF0C\u8BF7\u6309\u9700\u9605\u8BFB\u4E0E\u4F60\u5F53\u524D\u4EFB\u52A1\u76F8\u5173\u7684 skill\u3002\u82E5\u5F53\u524D provider \u652F\u6301\u539F\u751F skills\uFF0C\u8BF7\u4F18\u5148\u6309\u7167\u539F\u751F\u76EE\u5F55\u52A0\u8F7D\u3002");
    }
  }
  lines.push("\u5982\u9700\u56DE\u4F20\u6587\u4EF6\u3001\u7FA4\u6587\u6863\u3001skill import\u3001Google Docs \u64CD\u4F5C\u6216\u5DF2\u6267\u884C\u7684\u5916\u90E8\u8868\u683C\u7ED3\u679C\uFF0C\u53EA\u4F7F\u7528 agent-space output ...\uFF1BCLI \u4F1A\u751F\u6210 runtime-output manifest\uFF0Cdaemon \u4F1A\u5728\u4EFB\u52A1\u7ED3\u675F\u540E\u56DE\u6536\u3002");
  lines.push(`\u5982\u9700\u56DE\u4F20\u6587\u4EF6\u6216\u56FE\u7247\uFF0C\u8BF7\u9075\u5FAA ${BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME2} skill\uFF0C\u4F7F\u7528 agent-space output attach ...\uFF0C\u7136\u540E\u8FD0\u884C agent-space output validate\u3002`);
  lines.push("\u5982\u9700\u628A\u65B0 skill \u5BFC\u5165\u5DE5\u4F5C\u533A\uFF0C\u4F7F\u7528 agent-space output skill import ...\uFF0C\u7136\u540E\u8FD0\u884C agent-space output validate\u3002");
  lines.push("\u5982\u679C\u672C\u6B21\u4EFB\u52A1\u603B\u7ED3\u51FA\u53EF\u590D\u7528\u7684\u89C4\u5219\u3001\u6D41\u7A0B\u3001\u7EA6\u675F\u6216\u5DF2\u9A8C\u8BC1\u4E8B\u5B9E\uFF0C\u53EF\u4EE5\u7528 agent-space output knowledge propose-create/propose-update \u63D0\u4EA4 workspace knowledge \u5019\u9009\uFF1B\u8FD9\u53EA\u4F1A\u8FDB\u5165\u4EBA\u7C7B\u5BA1\u6279\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u5199\u5165\u5168\u5C40\u77E5\u8BC6\u5E93\u3002");
  lines.push("\u53EA\u6C89\u6DC0\u957F\u671F\u6709\u7528\u4E14\u5DF2\u9A8C\u8BC1\u7684\u5185\u5BB9\uFF1B\u4E0D\u8981\u628A\u4E34\u65F6\u4EFB\u52A1\u7ED3\u679C\u3001\u9690\u79C1\u4FE1\u606F\u3001\u51ED\u636E\u3001token\u3001\u672A\u7ECF\u9A8C\u8BC1\u7684\u63A8\u6D4B\u6216\u53EA\u5BF9\u5F53\u524D\u5BF9\u8BDD\u6709\u6548\u7684\u7EC6\u8282\u63D0\u4EA4\u4E3A workspace knowledge\u3002");
  lines.push("\u63D0\u4EA4\u77E5\u8BC6\u5019\u9009\u65F6\uFF0C\u5148\u628A Markdown \u6B63\u6587\u5199\u5230 runtime-output/artifacts/knowledge/*.md\uFF0C\u518D\u7528 output CLI \u751F\u6210 manifest\uFF1B\u4E0D\u8981\u624B\u5199 runtime-output/knowledge-proposals.json\u3002reason \u5FC5\u987B\u8BF4\u660E\u6765\u6E90\u4EFB\u52A1\u4E0A\u4E0B\u6587\u548C\u4E3A\u4EC0\u4E48\u503C\u5F97\u590D\u7528\u3002");
  return lines;
}
function buildContactContextLines(contactContext) {
  if (!contactContext) {
    return [];
  }
  const lines = [];
  if (contactContext.self.channels.length > 0) {
    lines.push(`\u5F53\u524D Agent \u6240\u5728\u9891\u9053: ${contactContext.self.channels.join("\u3001")}`);
  }
  if (contactContext.knownEntities.length === 0) {
    lines.push("\u5F53\u524D\u8FD8\u6CA1\u6709\u53EF\u786E\u8BA4\u7684 workspace \u534F\u4F5C\u5B9E\u4F53\u3002");
    return lines;
  }
  lines.push(`\u5F53\u524D\u53EF\u786E\u8BA4\u7684 workspace \u534F\u4F5C\u8005: ${contactContext.knownEntities.length} \u4E2A`);
  for (const entity of contactContext.knownEntities) {
    const parts = [
      `- ${entity.name}`,
      entity.role.trim().length > 0 ? `\u89D2\u8272 ${entity.role}` : "",
      entity.sharedChannels.length > 0 ? `\u5171\u540C\u9891\u9053 ${entity.sharedChannels.join("\u3001")}` : "",
      entity.observedLabels.length > 0 ? `\u53EF\u89C1\u5386\u53F2\u79F0\u547C ${entity.observedLabels.join("\u3001")}` : "",
      entity.recentSharedInteractionSummary ? `\u6700\u8FD1\u534F\u4F5C ${entity.recentSharedInteractionChannel ?? "\u672A\u77E5\u9891\u9053"}${entity.recentSharedInteractionTime ? ` ${entity.recentSharedInteractionTime}` : ""} \xB7 ${entity.recentSharedInteractionSummary}` : ""
    ].filter(Boolean);
    lines.push(parts.join(" | "));
  }
  return lines;
}
function buildKnowledgeContextLines(knowledgeContext) {
  if (!knowledgeContext) {
    return [];
  }
  const pages = knowledgeContext.pages;
  if (pages.length === 0) {
    return ["\u5F53\u524D Agent \u672A\u5206\u914D\u989D\u5916\u77E5\u8BC6\uFF1B\u4E0D\u8981\u9690\u5F0F\u8BFB\u53D6\u6574\u4E2A workspace \u77E5\u8BC6\u5E93\u3002"];
  }
  const titleLines = pages.slice(0, 12).map((page) => `- ${page.title} (${page.id})`);
  return [
    `\u5F53\u524D Agent \u53EF\u7528\u77E5\u8BC6\u9875: ${pages.length} \u7BC7\u3002`,
    ...titleLines,
    pages.length > titleLines.length ? `\u8FD8\u6709 ${pages.length - titleLines.length} \u7BC7\u77E5\u8BC6\u9875\u672A\u5728 prompt \u4E2D\u9010\u9879\u5217\u51FA\u3002` : "",
    knowledgeContext.contextDir ? `\u53EF\u7528\u77E5\u8BC6\u76EE\u5F55: ${knowledgeContext.contextDir}\uFF1Bmanifest.json \u5217\u51FA\u5168\u90E8\u9875\u9762\uFF0Cpages/ \u4E0B\u662F Markdown \u6B63\u6587\u3002` : ""
  ].filter(Boolean);
}
function sanitizePathSegment3(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "attachment";
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
  writeFileSync10(pidPath, `${process.pid}
`, "utf8");
  const detected = detectProviders();
  if (detected.length === 0) {
    rmSync11(pidPath, { force: true });
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
    rmSync11(pidPath, { force: true });
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
      rmSync11(pidPath, { force: true });
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
  writeFileSync10(pidPath, `${child.pid}
`, "utf8");
  await sleep2(750);
  if (!readPidIfRunning(pidPath)) {
    rmSync11(pidPath, { force: true });
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
    return resolve18(invokedPath);
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
      rmSync11(pidPath, { force: true });
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
  if (!existsSync17(logPath)) {
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
  let position = statSync9(logPath).size;
  const poll = setInterval(() => {
    const size = statSync9(logPath).size;
    if (size <= position) {
      return;
    }
    const next = createReadStream(logPath, { encoding: "utf8", start: position, end: size - 1 });
    next.on("data", (chunk) => {
      position += Buffer.byteLength(chunk);
      process.stdout.write(chunk);
    });
  }, 1e3);
  await new Promise((resolve20) => {
    const stop = () => {
      clearInterval(poll);
      resolve20();
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
    rmSync11(workDir, { recursive: true, force: true });
  }
  mkdirSync12(workDir, { recursive: true });
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
      rmSync11(workDir, { recursive: true, force: true });
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
  return new Promise((resolve20) => setTimeout(resolve20, ms));
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

// src/task-output.ts
import { existsSync as existsSync18, lstatSync as lstatSync2, readFileSync as readFileSync14, realpathSync as realpathSync4, rmSync as rmSync12, statSync as statSync10 } from "node:fs";
import { basename as basename7, isAbsolute as isAbsolute7, join as join23, relative as relative6, resolve as resolve19 } from "node:path";
function clearTaskOutputArtifacts2(workDir) {
  rmSync12(join23(workDir, "last-message.txt"), { force: true });
  rmSync12(getRuntimeOutputDir(workDir), { recursive: true, force: true });
  clearChannelDocumentOperationArtifacts(workDir);
}
function loadTaskOutputEnvelope(workDir, fallbackText, workspaceId) {
  const warnings = [];
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  const fallbackOutput = fallbackText.trim();
  if (!existsSync18(manifestPath)) {
    return {
      text: fallbackOutput,
      attachments: [],
      warnings
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync14(manifestPath, "utf8"));
  } catch (error) {
    warnings.push(`\u68C0\u6D4B\u5230 ${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH}\uFF0C\u4F46 JSON \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    return {
      text: fallbackOutput,
      attachments: [],
      warnings
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push(`${RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH} \u5FC5\u987B\u662F\u5BF9\u8C61\u3002`);
    return {
      text: fallbackOutput,
      attachments: [],
      warnings
    };
  }
  const manifest = parsed;
  const attachments = Array.isArray(manifest.attachments) ? manifest.attachments : [];
  if (attachments.length > MAX_OUTPUT_ATTACHMENTS) {
    warnings.push(`\u9644\u4EF6\u6570\u8D85\u8FC7\u9650\u5236\uFF0C\u6700\u591A\u53EA\u63A5\u53D7 ${MAX_OUTPUT_ATTACHMENTS} \u4E2A\u3002`);
  }
  const persistedAttachments = [];
  let totalAcceptedBytes = 0;
  for (const attachment of attachments.slice(0, MAX_OUTPUT_ATTACHMENTS)) {
    const normalized = normalizeOutputAttachmentEntry(workDir, attachment);
    if ("error" in normalized) {
      warnings.push(normalized.error);
      continue;
    }
    if (totalAcceptedBytes + normalized.sizeBytes > MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES) {
      warnings.push(
        `\u9644\u4EF6\u603B\u5927\u5C0F\u8D85\u8FC7\u9650\u5236\uFF0C\u6700\u591A\u53EA\u63A5\u53D7 ${(MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB\u3002`
      );
      continue;
    }
    try {
      const persisted = persistWorkspaceAttachmentFromFileSync({
        workspaceId,
        sourcePath: normalized.absolutePath,
        fileName: normalized.fileName,
        mediaType: normalized.mediaType
      });
      persistedAttachments.push(persisted);
      totalAcceptedBytes += normalized.sizeBytes;
    } catch (error) {
      warnings.push(`\u9644\u4EF6\u843D\u76D8\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const manifestText = typeof manifest.text === "string" ? manifest.text.trim() : "";
  return {
    text: manifestText || fallbackOutput,
    attachments: persistedAttachments,
    warnings
  };
}
function discardTaskOutputAttachments(attachments) {
  if (attachments.length > 0) {
    deleteWorkspaceAttachmentsSync(attachments);
  }
}
function normalizeOutputAttachmentEntry(workDir, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { error: "attachments[] \u7684\u6BCF\u4E00\u9879\u90FD\u5FC5\u987B\u662F\u5BF9\u8C61\u3002" };
  }
  const candidate = entry;
  const relativePath = typeof candidate.path === "string" ? candidate.path.trim() : "";
  if (!relativePath) {
    return { error: "attachments[].path \u4E0D\u80FD\u4E3A\u7A7A\u3002" };
  }
  if (isAbsolute7(relativePath)) {
    return { error: `\u53EA\u652F\u6301\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u4E0D\u5141\u8BB8\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${relativePath}` };
  }
  if (containsParentTraversal2(relativePath)) {
    return { error: `\u9644\u4EF6\u8DEF\u5F84\u4E0D\u5141\u8BB8\u5305\u542B .. \uFF1A${relativePath}` };
  }
  const absolutePath = resolve19(workDir, relativePath);
  const realWorkDir = realpathSync4(workDir);
  if (containsSymlinkBetween2(workDir, absolutePath)) {
    return { error: `\u9644\u4EF6\u8DEF\u5F84\u4E0D\u5141\u8BB8\u7ECF\u8FC7\u7B26\u53F7\u94FE\u63A5\uFF1A${relativePath}` };
  }
  if (!existsSync18(absolutePath)) {
    return { error: `\u9644\u4EF6\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${relativePath}` };
  }
  const fileStat = statSync10(absolutePath);
  if (!fileStat.isFile()) {
    return { error: `\u9644\u4EF6\u8DEF\u5F84\u4E0D\u662F\u6587\u4EF6\uFF1A${relativePath}` };
  }
  if (fileStat.size <= 0) {
    return { error: `\u9644\u4EF6\u6587\u4EF6\u4E0D\u80FD\u4E3A\u7A7A\uFF1A${relativePath}` };
  }
  if (fileStat.size > MAX_OUTPUT_ATTACHMENT_BYTES) {
    return { error: `\u9644\u4EF6\u6587\u4EF6\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\uFF1A${relativePath}` };
  }
  const realFilePath = realpathSync4(absolutePath);
  const relativeToWorkDir = relative6(realWorkDir, realFilePath);
  if (relativeToWorkDir === "" || relativeToWorkDir === "." || !relativeToWorkDir.startsWith("..") && !isAbsolute7(relativeToWorkDir)) {
    return {
      absolutePath: realFilePath,
      fileName: typeof candidate.name === "string" && candidate.name.trim().length > 0 ? candidate.name.trim() : basename7(relativePath),
      mediaType: typeof candidate.mediaType === "string" && candidate.mediaType.trim().length > 0 ? candidate.mediaType.trim() : void 0,
      sizeBytes: fileStat.size
    };
  }
  return { error: `\u9644\u4EF6\u8DEF\u5F84\u8D85\u51FA\u5F53\u524D workDir\uFF1A${relativePath}` };
}
function containsParentTraversal2(value) {
  return value.replace(/\\/g, "/").split("/").some((segment) => segment.trim() === "..");
}
function containsSymlinkBetween2(baseDir, targetPath) {
  const relativePath = relative6(baseDir, targetPath);
  if (!relativePath || relativePath === ".") {
    return false;
  }
  let currentPath = baseDir;
  for (const segment of relativePath.split(/[\\/]+/).filter((item) => item.length > 0)) {
    currentPath = join23(currentPath, segment);
    if (lstatSync2(currentPath).isSymbolicLink()) {
      return true;
    }
  }
  return false;
}
export {
  AGENT_ROUTER_HARNESSES,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_LOG_LINES,
  DEFAULT_STATE_DIR_NAME,
  DEFAULT_TASK_POLL_INTERVAL_MS,
  HttpDaemonClient,
  MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES,
  MAX_OUTPUT_ATTACHMENTS,
  MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES,
  MAX_OUTPUT_ATTACHMENT_BYTES,
  MAX_RUNTIME_OUTPUT_BUNDLE_FILES,
  MAX_RUNTIME_OUTPUT_BUNDLE_SINGLE_FILE_BYTES,
  MAX_RUNTIME_OUTPUT_BUNDLE_TOTAL_BYTES,
  RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATHS,
  appendAgentOutputAttachment,
  appendChannelDocumentManifestEntry,
  appendDocumentPermissionRequest,
  appendExternalDocumentCreateGoogleSheetOperation,
  appendExternalDocumentLinkOperation,
  appendExternalGoogleDocOperation,
  appendExternalSheetOperation,
  appendExternalSheetResult,
  appendKnowledgeProposalManifestEntry,
  appendSkillImportManifestEntry,
  applyChannelDocumentOperations,
  applyDocumentRuntimeOutputOperations,
  applyKnowledgeProposalOperations,
  applySkillImportOperations,
  buildCapabilityAllowedTools,
  buildCapabilityPathDirs,
  buildChannelDocumentPromptLines,
  buildDefaultClaudeAllowedTools,
  buildDocumentRuntimeToolCapabilities,
  buildOpenClawProviderHealthSnapshot,
  buildProviderRuntimeMetadata,
  buildRemoteDaemonConfig,
  buildRemoteDaemonRelaunchCommand,
  buildTaskPrompt,
  buildTaskPromptWithDocumentContexts,
  cleanupStalePidFile,
  clearTaskOutputArtifacts as clearBundledTaskOutputArtifacts,
  clearChannelDocumentOperationArtifacts,
  clearSkillImportOperationArtifacts,
  clearTaskOutputArtifacts2 as clearTaskOutputArtifacts,
  collectRuntimeOutputBundle,
  collectRuntimeOutputBundleFiles,
  createRuntimeOutputPreview,
  detectAgentRouterHarnesses,
  detectProviders,
  discardTaskOutputAttachments,
  ensureDaemonStateDir,
  getDaemonLogFilePath,
  getDaemonPidFilePath,
  getStandaloneCliEntryPath,
  inspectOpenClawDaemonAuthHealth,
  isAgentRouterHarness,
  isProcessRunning,
  listAgentRouterHarnesses,
  loadTaskOutputEnvelope,
  materializeAgentKnowledgePages,
  materializeAgentSkills,
  materializeAttachments,
  materializeChannelDocuments,
  materializeInputBundle,
  normalizeOpenClawProviderError,
  normalizeProviderTaskErrorCategory,
  normalizeRuntimeToolCapabilities,
  openDaemonLogFile,
  parseTaskInputJson,
  parseTaskPayload,
  prepareDaemonTaskContext,
  prepareRuntimeOutputArtifactReference,
  prepareSkillImportOperationArtifacts,
  printRemoteDaemonHelp,
  readAgentOutputManifest,
  readChannelDocumentsManifest,
  readDocumentPermissionRequestsManifest,
  readExternalDocumentsManifest,
  readExternalGoogleDocsManifest,
  readExternalSheetsManifest,
  readExternalSheetsResultsManifest,
  readGoogleWorkspaceReadiness,
  readKnowledgeProposalsManifest,
  readLastLines,
  readNodeMetadata,
  readPidIfRunning,
  readProviderTaskFailureMetadata,
  readSkillImportsManifest,
  renderDaemonSummary,
  resolveAgentKnowledgePages,
  resolveAgentSkills,
  resolveChannelDocuments,
  resolveConversationThreadId,
  resolveDefaultDaemonStateDir,
  resolveLogFileSize,
  resolveModelId,
  resolveRemoteTaskProviderSessionId,
  runAgentRouter,
  runProviderTask,
  runRemoteDaemonCommand,
  runRemoteDaemonForeground,
  sanitizePathSegment,
  setAgentOutputText,
  validateRuntimeOutputManifests,
  writeAgentOutputManifest
};
