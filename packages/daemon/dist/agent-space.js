#!/usr/bin/env node

// ../../apps/cli/src/index.ts
import { pathToFileURL } from "node:url";

// ../services/src/shared/state-io.ts
import { rmSync as rmSync4 } from "node:fs";
import { join as join8 } from "node:path";

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
function redactPostgresDatabaseUrl(databaseUrl2) {
  try {
    const parsed = new URL(databaseUrl2);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return databaseUrl2.replace(/:[^:@/]+@/, ":***@");
  }
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
function getDatabaseConnectionLabel() {
  return redactPostgresDatabaseUrl(resolvePostgresDatabaseUrl());
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
function countRows(db, tableName) {
  const row = db.prepare(`SELECT COUNT(*)::int AS count FROM ${tableName}`).get();
  return typeof row?.count === "number" ? row.count : 0;
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
var SYSTEM_WORKSPACE_ID = "__system__";
var LOCAL_DAEMON_STATE_DIR = join3("data", "daemon");
function getWorkspaceAttachmentsDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return ensureDirectory(join3(getWorkspaceDataDirPath(workspaceId), "attachments"));
}
function getWorkspaceChannelHistoryDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return ensureDirectory(join3(getWorkspaceDataDirPath(workspaceId), "channel-history"));
}
function getLocalDaemonStateDirPath() {
  return ensureDirectory(join3(resolveRepositoryRoot(), LOCAL_DAEMON_STATE_DIR));
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
function getDatabaseStatusSync() {
  const db = getDatabase();
  return {
    engine: "postgres",
    databaseUrl: getDatabaseConnectionLabel(),
    schemaVersion: readMetadataValue(db, "schema_version") ?? "unknown",
    workspaces: countRows(db, "workspace"),
    skills: countRows(db, "skill"),
    skillFiles: countRows(db, "skill_file"),
    agentSkills: countRows(db, "agent_skill"),
    agentGoogleWorkspaceDelegations: countRows(db, "agent_google_workspace_delegation"),
    users: countRows(db, "users"),
    authIdentities: countRows(db, "auth_identity"),
    sessions: countRows(db, "session"),
    workspaceSnapshots: countRows(db, "workspace_snapshot"),
    daemons: countRows(db, "daemon_connection"),
    runtimes: countRows(db, "agent_runtime"),
    documentAgentAccess: countRows(db, "document_agent_access"),
    documentPermissionRequests: countRows(db, "document_permission_request"),
    agentAccessRequests: countRows(db, "agent_access_request"),
    knowledgeProposals: countRows(db, "knowledge_proposal"),
    agentRouterSessions: countRows(db, "agent_router_session"),
    agentRouterProviderSessions: countRows(db, "agent_router_provider_session"),
    agentTaskAttempts: countRows(db, "agent_task_attempt"),
    agentRouterEvents: countRows(db, "agent_router_event"),
    agentRouterContextSnapshots: countRows(db, "agent_router_context_snapshot"),
    queuedTasks: countRows(db, "agent_task_queue"),
    taskExecutionEvents: countRows(db, "task_execution_event"),
    taskMessages: countRows(db, "task_message")
  };
}
function resetWorkspaceExecutionStateSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  let removedDocumentAgentAccessRows = 0;
  let removedDocumentPermissionRequestRows = 0;
  let removedAgentAccessRequestRows = 0;
  let removedKnowledgeProposalRows = 0;
  let removedAgentRouterProviderSessionRows = 0;
  let removedAgentTaskAttemptRows = 0;
  let removedAgentRouterEventRows = 0;
  let removedAgentRouterContextSnapshotRows = 0;
  let removedAgentRouterSessionRows = 0;
  let removedBindings = 0;
  let removedQueuedTasks = 0;
  let removedTaskMessages = 0;
  let removedRuntimes = 0;
  let removedDaemons = 0;
  let removedTasks = 0;
  let removedChannels = 0;
  let removedEmployees = 0;
  db.exec("BEGIN");
  try {
    const documentAgentAccessResult = db.prepare(
      `DELETE FROM document_agent_access
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedDocumentAgentAccessRows = Number(documentAgentAccessResult.changes);
    const documentPermissionRequestResult = db.prepare(
      `DELETE FROM document_permission_request
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedDocumentPermissionRequestRows = Number(documentPermissionRequestResult.changes);
    const agentAccessRequestResult = db.prepare(
      `DELETE FROM agent_access_request
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentAccessRequestRows = Number(agentAccessRequestResult.changes);
    const knowledgeProposalResult = db.prepare(
      `DELETE FROM knowledge_proposal
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedKnowledgeProposalRows = Number(knowledgeProposalResult.changes);
    const taskMessageResult = db.prepare(
      `DELETE FROM task_message
         WHERE task_id IN (
           SELECT id
           FROM agent_task_queue
           WHERE workspace_id = ?
         )`
    ).run(workspaceId);
    removedTaskMessages = Number(taskMessageResult.changes);
    const routerEventResult = db.prepare(
      `DELETE FROM agent_router_event
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentRouterEventRows = Number(routerEventResult.changes);
    const routerContextSnapshotResult = db.prepare(
      `DELETE FROM agent_router_context_snapshot
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentRouterContextSnapshotRows = Number(routerContextSnapshotResult.changes);
    const taskAttemptResult = db.prepare(
      `DELETE FROM agent_task_attempt
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentTaskAttemptRows = Number(taskAttemptResult.changes);
    const routerProviderSessionResult = db.prepare(
      `DELETE FROM agent_router_provider_session
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentRouterProviderSessionRows = Number(routerProviderSessionResult.changes);
    const queueResult = db.prepare(
      `DELETE FROM agent_task_queue
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedQueuedTasks = Number(queueResult.changes);
    const routerSessionResult = db.prepare(
      `DELETE FROM agent_router_session
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedAgentRouterSessionRows = Number(routerSessionResult.changes);
    const bindingResult = db.prepare(
      `DELETE FROM employee_runtime_binding
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedBindings = Number(bindingResult.changes);
    const runtimeResult = db.prepare(
      `DELETE FROM agent_runtime
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedRuntimes = Number(runtimeResult.changes);
    const daemonResult = db.prepare(
      `DELETE FROM daemon_connection
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedDaemons = Number(daemonResult.changes);
    const workspaceTaskResult = db.prepare(
      `DELETE FROM workspace_task
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedTasks = Number(workspaceTaskResult.changes);
    const workspaceChannelResult = db.prepare(
      `DELETE FROM workspace_channel
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedChannels = Number(workspaceChannelResult.changes);
    const workspaceEmployeeResult = db.prepare(
      `DELETE FROM workspace_employee
         WHERE workspace_id = ?`
    ).run(workspaceId);
    removedEmployees = Number(workspaceEmployeeResult.changes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    removedDocumentAgentAccessRows,
    removedDocumentPermissionRequestRows,
    removedAgentAccessRequestRows,
    removedKnowledgeProposalRows,
    removedAgentRouterProviderSessionRows,
    removedAgentTaskAttemptRows,
    removedAgentRouterEventRows,
    removedAgentRouterContextSnapshotRows,
    removedAgentRouterSessionRows,
    removedBindings,
    removedQueuedTasks,
    removedTaskMessages,
    removedRuntimes,
    removedDaemons,
    removedTasks,
    removedChannels,
    removedEmployees
  };
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
function attachWorkspaceStateVersion(state, version2) {
  Object.defineProperty(state, WORKSPACE_STATE_VERSION, {
    value: version2,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return state;
}

// ../domain/src/mentions.ts
var MENTION_SEPARATOR = /[\s#，。,.!！？?;；:：、()[\]{}<>《》「」『』"'`~]/;
function parseAgentMentions(input, candidates) {
  if (!input.includes("@")) {
    return { mentions: [], unknownMentions: [] };
  }
  const aliases = buildAliasDirectory(candidates);
  const mentions = [];
  const unknownMentions = [];
  const seenAgentIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== "@") {
      continue;
    }
    if (!isBoundary(input, index - 1)) {
      continue;
    }
    const matchedAlias = aliases.find((alias) => aliasMatchesAt(input, index + 1, alias.alias));
    if (matchedAlias) {
      if (!seenAgentIds.has(matchedAlias.agentId)) {
        mentions.push({
          agentId: matchedAlias.agentId,
          label: matchedAlias.label,
          token: matchedAlias.alias,
          mentionType: "agent",
          inChannel: matchedAlias.inChannel
        });
        seenAgentIds.add(matchedAlias.agentId);
      }
      index += matchedAlias.alias.length;
      continue;
    }
    const token = readMentionToken(input, index + 1);
    if (token.length > 0 && !unknownMentions.some((value) => sameText(value, token))) {
      unknownMentions.push(token);
      index += token.length;
    }
  }
  return { mentions, unknownMentions };
}
function buildAliasDirectory(candidates) {
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of candidates) {
    const aliasValues = uniqueStrings([candidate.label, ...candidate.aliases]);
    for (const alias of aliasValues) {
      const key = `${candidate.agentId}::${alias.toLocaleLowerCase("zh-CN")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push({
        agentId: candidate.agentId,
        label: candidate.label,
        alias,
        inChannel: candidate.inChannel
      });
    }
  }
  return rows.sort((left, right) => right.alias.length - left.alias.length);
}
function aliasMatchesAt(input, startIndex, alias) {
  const candidate = input.slice(startIndex, startIndex + alias.length);
  if (!sameText(candidate, alias)) {
    return false;
  }
  return isBoundary(input, startIndex + alias.length);
}
function readMentionToken(input, startIndex) {
  let endIndex = startIndex;
  while (endIndex < input.length && !isBoundary(input, endIndex) && input[endIndex] !== "@") {
    endIndex += 1;
  }
  return input.slice(startIndex, endIndex).trim();
}
function isBoundary(input, index) {
  if (index < 0 || index >= input.length) {
    return true;
  }
  return MENTION_SEPARATOR.test(input[index]);
}
function sameText(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function uniqueStrings(values) {
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (result.some((existing) => sameText(existing, trimmed))) {
      continue;
    }
    result.push(trimmed);
  }
  return result;
}

// ../domain/src/mention-plan.ts
var MENTION_SEPARATOR2 = /[\s#，。,.!！？?;；:：、()[\]{}<>《》「」『』"'`~]/;
var SEQUENTIAL_MARKERS = ["\u7136\u540E", "\u518D", "\u4E4B\u540E", "\u63A5\u7740", "\u5B8C\u6210\u540E", "\u5148"];
var HANDOFF_DOCUMENT_MARKERS = ["markdown", "\u6587\u6863", "\u8BA1\u5212", "\u6E05\u5355", "\u7EAA\u8981", "\u8349\u7A3F"];
var HANDOFF_ATTACHMENT_MARKERS = ["\u9644\u4EF6", "\u6587\u4EF6", "\u56FE\u7247", "pdf", "PDF"];
var DOCUMENT_CONTINUATION_MARKERS = ["\u7EE7\u7EED", "\u5B8C\u5584", "\u8865\u5145", "\u9605\u8BFB\u540E", "\u57FA\u4E8E\u5B83", "\u5728\u8FD9\u7248\u57FA\u7840\u4E0A"];
var DIRECT_HANDOFF_MARKERS = ["\u53D1\u7ED9", "\u4EA4\u7ED9", "\u7ED9", "\u8F6C\u7ED9", "\u53D1\u6211", "\u7ED9 @", "\u4EA4\u7ED9 @"];
var AMBIGUOUS_SEQUENTIAL_MARKERS = ["\u7EE7\u7EED", "\u5B8C\u5584", "\u8865\u5145", "\u9605\u8BFB\u540E", "\u57FA\u4E8E\u5B83", "\u5728\u8FD9\u7248\u57FA\u7840\u4E0A", "\u4E00\u8D77"];
function parseMentionPlan(input, candidates) {
  const mentionResult = parseAgentMentions(input, candidates);
  if (mentionResult.mentions.length <= 1) {
    return {
      mode: "parallel",
      steps: mentionResult.mentions.map((mention, index) => ({
        id: `step-${index + 1}`,
        agentId: mention.agentId,
        agentLabel: mention.label,
        instruction: input.trim(),
        dependsOnStepIds: [],
        handoffKind: inferHandoffKind(input)
      })),
      warnings: [],
      unknownMentions: mentionResult.unknownMentions
    };
  }
  const clauses = splitSequentialClauses(input);
  const steps = [];
  const warnings = [];
  const mentionsWithOffsets = collectMentionsWithOffsets(input, candidates);
  if (clauses.length === 1 && mentionResult.mentions.length >= 2 && hasDirectHandoff(input)) {
    const primary = mentionResult.mentions[0];
    const secondary = mentionResult.mentions[1];
    const handoffKind = inferHandoffKind(input);
    return {
      mode: "sequential",
      steps: [
        {
          id: "step-1",
          agentId: primary.agentId,
          agentLabel: primary.label,
          instruction: input.trim(),
          dependsOnStepIds: [],
          handoffKind
        },
        {
          id: "step-2",
          agentId: secondary.agentId,
          agentLabel: secondary.label,
          instruction: inheritedContinuationInstruction(input, secondary.token),
          dependsOnStepIds: ["step-1"],
          handoffKind
        }
      ],
      warnings,
      unknownMentions: mentionResult.unknownMentions
    };
  }
  for (const clause of clauses) {
    const clauseMentions = mentionsWithOffsets.filter((entry) => entry.start >= clause.start && entry.start < clause.end).sort((left, right) => left.start - right.start);
    if (clauseMentions.length === 0) {
      continue;
    }
    const primary = clauseMentions[0].mention;
    const previousStep = steps[steps.length - 1];
    steps.push({
      id: `step-${steps.length + 1}`,
      agentId: primary.agentId,
      agentLabel: primary.label,
      instruction: clause.text.trim(),
      dependsOnStepIds: clause.isSequential && steps.length > 0 ? [steps[steps.length - 1].id] : [],
      handoffKind: inferHandoffKind(clause.text, previousStep?.handoffKind)
    });
  }
  if (steps.length <= 1) {
    if (mentionResult.mentions.length > 1 && looksAmbiguousSequential(input)) {
      warnings.push("\u65E0\u6CD5\u53EF\u9760\u8BC6\u522B\u987A\u5E8F\u4F9D\u8D56\uFF0C\u8BF7\u660E\u786E\u5199\u51FA\u5148\u540E\u987A\u5E8F\u3002");
    }
    return {
      mode: "parallel",
      steps: mentionResult.mentions.map((mention, index) => ({
        id: `step-${index + 1}`,
        agentId: mention.agentId,
        agentLabel: mention.label,
        instruction: input.trim(),
        dependsOnStepIds: [],
        handoffKind: inferHandoffKind(input)
      })),
      warnings,
      unknownMentions: mentionResult.unknownMentions
    };
  }
  if (!clauses.some((clause) => clause.isSequential)) {
    if (looksAmbiguousSequential(input)) {
      warnings.push("\u65E0\u6CD5\u53EF\u9760\u8BC6\u522B\u987A\u5E8F\u4F9D\u8D56\uFF0C\u8BF7\u660E\u786E\u5199\u51FA\u5148\u540E\u987A\u5E8F\u3002");
    }
    return {
      mode: "parallel",
      steps: mentionResult.mentions.map((mention, index) => ({
        id: `step-${index + 1}`,
        agentId: mention.agentId,
        agentLabel: mention.label,
        instruction: input.trim(),
        dependsOnStepIds: [],
        handoffKind: inferHandoffKind(input)
      })),
      warnings,
      unknownMentions: mentionResult.unknownMentions
    };
  }
  return {
    mode: "sequential",
    steps,
    warnings,
    unknownMentions: mentionResult.unknownMentions
  };
}
function collectMentionsWithOffsets(input, candidates) {
  const mentions = [];
  const aliases = candidates.flatMap(
    (candidate) => [candidate.label, ...candidate.aliases].filter((alias, index, all) => all.findIndex((value) => sameText2(value, alias)) === index).map((alias) => ({ mention: candidate, alias }))
  ).sort((left, right) => right.alias.length - left.alias.length);
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== "@") {
      continue;
    }
    if (!isBoundary2(input, index - 1)) {
      continue;
    }
    for (const entry of aliases) {
      if (!aliasMatchesAt2(input, index + 1, entry.alias)) {
        continue;
      }
      mentions.push({
        start: index,
        mention: {
          agentId: entry.mention.agentId,
          label: entry.mention.label,
          token: entry.alias,
          mentionType: "agent",
          inChannel: entry.mention.inChannel
        }
      });
      break;
    }
  }
  return mentions;
}
function splitSequentialClauses(input) {
  const clauses = [];
  let cursor = 0;
  let previousEnd = 0;
  while (cursor < input.length) {
    const nextMatch = findNextSequentialMarker(input, cursor);
    if (!nextMatch) {
      const text2 = input.slice(previousEnd).trim();
      if (text2.length > 0) {
        clauses.push({ text: text2, start: previousEnd, end: input.length, isSequential: clauses.length > 0 });
      }
      break;
    }
    const text = input.slice(previousEnd, nextMatch.index).trim();
    if (text.length > 0) {
      clauses.push({ text, start: previousEnd, end: nextMatch.index, isSequential: clauses.length > 0 });
    }
    cursor = nextMatch.index + nextMatch.marker.length;
    previousEnd = cursor;
  }
  return clauses;
}
function findNextSequentialMarker(input, fromIndex) {
  let best = null;
  for (const marker of SEQUENTIAL_MARKERS) {
    const index = input.indexOf(marker, fromIndex);
    if (index < 0) {
      continue;
    }
    if (!best || index < best.index) {
      best = { marker, index };
    }
  }
  return best;
}
function inferHandoffKind(input, inheritedKind) {
  const lower = input.toLowerCase();
  if (HANDOFF_DOCUMENT_MARKERS.some((marker) => input.includes(marker) || lower.includes(marker.toLowerCase()))) {
    return "document";
  }
  if (HANDOFF_ATTACHMENT_MARKERS.some((marker) => input.includes(marker) || lower.includes(marker.toLowerCase()))) {
    return "attachment";
  }
  if (inheritedKind === "document" && DOCUMENT_CONTINUATION_MARKERS.some((marker) => input.includes(marker))) {
    return "document";
  }
  return "message";
}
function hasDirectHandoff(input) {
  return DIRECT_HANDOFF_MARKERS.some((marker) => input.includes(marker));
}
function looksAmbiguousSequential(input) {
  return AMBIGUOUS_SEQUENTIAL_MARKERS.some((marker) => input.includes(marker));
}
function inheritedContinuationInstruction(input, mentionToken) {
  const directMentionIndex = input.indexOf(`@${mentionToken}`);
  if (directMentionIndex >= 0) {
    const tail = input.slice(directMentionIndex + mentionToken.length + 1).trim();
    if (tail.length > 0) {
      return tail;
    }
  }
  return "\u57FA\u4E8E\u4E0A\u6E38\u4EA4\u4ED8\u7EE7\u7EED\u5904\u7406";
}
function sameText2(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function aliasMatchesAt2(input, startIndex, alias) {
  const candidate = input.slice(startIndex, startIndex + alias.length);
  if (!sameText2(candidate, alias)) {
    return false;
  }
  return isBoundary2(input, startIndex + alias.length);
}
function isBoundary2(input, index) {
  if (index < 0 || index >= input.length) {
    return true;
  }
  return MENTION_SEPARATOR2.test(input[index]);
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
function isDaemonProvider(value) {
  return DAEMON_PROVIDER_IDS.includes(value);
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

// ../db/src/daemons.ts
function registerDaemonRuntimesSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const daemonKey = input.daemonKey.trim();
  const deviceName = input.deviceName.trim();
  if (!daemonKey) {
    throw new Error("daemonKey is required.");
  }
  if (!deviceName) {
    throw new Error("deviceName is required.");
  }
  if (input.runtimes.length === 0) {
    throw new Error("At least one runtime is required.");
  }
  withTransaction(db, () => {
    const existingDaemon = db.prepare(
      `SELECT
          id,
          workspace_id AS workspaceId,
          daemon_key AS daemonKey,
          device_name AS deviceName,
          status,
          metadata_json AS metadataJson,
          last_heartbeat_at AS lastHeartbeatAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM daemon_connection
        WHERE daemon_key = ?`
    ).get(daemonKey);
    const daemonId = existingDaemon && typeof existingDaemon.id === "string" ? existingDaemon.id : `daemon-${randomLikeId()}`;
    const daemonMetadataJson = JSON.stringify(input.metadata ?? {});
    db.prepare(
      `INSERT INTO daemon_connection (
        id,
        workspace_id,
        daemon_key,
        device_name,
        status,
        metadata_json,
        last_heartbeat_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'online', ?, ?, ?, ?)
      ON CONFLICT(daemon_key) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        device_name = excluded.device_name,
        status = 'online',
        metadata_json = excluded.metadata_json,
        last_heartbeat_at = excluded.last_heartbeat_at,
        updated_at = excluded.updated_at`
    ).run(
      daemonId,
      workspaceId,
      daemonKey,
      deviceName,
      daemonMetadataJson,
      now,
      existingDaemon && typeof existingDaemon.createdAt === "string" ? existingDaemon.createdAt : now,
      now
    );
    const seenProviders = /* @__PURE__ */ new Set();
    for (const runtime of input.runtimes) {
      const provider = runtime.provider.trim();
      if (!provider) {
        continue;
      }
      seenProviders.add(provider);
      const existingRuntime = db.prepare(
        `SELECT
            id,
            created_at AS createdAt
          FROM agent_runtime
          WHERE workspace_id = ? AND daemon_connection_id = ? AND provider = ?`
      ).get(workspaceId, daemonId, provider);
      const runtimeId = existingRuntime && typeof existingRuntime.id === "string" ? existingRuntime.id : `runtime-${provider}-${randomLikeId()}`;
      const version2 = runtime.version?.trim() ?? "";
      const deviceInfo = runtime.deviceInfo?.trim() ?? deviceName;
      const metadataJson = JSON.stringify(runtime.metadata ?? {});
      db.prepare(
        `INSERT INTO agent_runtime (
          id,
          workspace_id,
          daemon_connection_id,
          provider,
          name,
          version,
          status,
          device_info,
          metadata_json,
          connected_at,
          last_heartbeat_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, daemon_connection_id, provider) DO UPDATE SET
          name = excluded.name,
          version = excluded.version,
          status = 'online',
          device_info = excluded.device_info,
          metadata_json = excluded.metadata_json,
          connected_at = COALESCE(agent_runtime.connected_at, excluded.connected_at),
          last_heartbeat_at = excluded.last_heartbeat_at,
          last_error = NULL,
          updated_at = excluded.updated_at`
      ).run(
        runtimeId,
        workspaceId,
        daemonId,
        provider,
        runtime.name.trim(),
        version2,
        deviceInfo,
        metadataJson,
        now,
        now,
        existingRuntime && typeof existingRuntime.createdAt === "string" ? existingRuntime.createdAt : now,
        now
      );
    }
    const runtimeRows = db.prepare(
      `SELECT id, provider
         FROM agent_runtime
         WHERE workspace_id = ? AND daemon_connection_id = ?`
    ).all(workspaceId, daemonId);
    for (const row of runtimeRows) {
      if (typeof row.provider !== "string") {
        continue;
      }
      if (seenProviders.has(row.provider)) {
        continue;
      }
      if (typeof row.id !== "string") {
        continue;
      }
      db.prepare(
        `UPDATE agent_runtime
         SET status = 'offline',
             updated_at = ?
         WHERE id = ?`
      ).run(now, row.id);
    }
  });
  return readDaemonSnapshotSync(daemonKey);
}
function heartbeatDaemonSync(daemonKey, options) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  withTransaction(db, () => {
    const daemon = readDaemonConnectionRow(db, daemonKey);
    if (!daemon) {
      throw new Error(`Daemon "${daemonKey}" does not exist.`);
    }
    if (options?.metadata) {
      db.prepare(
        `UPDATE daemon_connection
         SET status = 'online',
             metadata_json = ?,
             last_heartbeat_at = ?,
             updated_at = ?
         WHERE daemon_key = ?`
      ).run(JSON.stringify(options.metadata), now, now, daemonKey);
    } else {
      db.prepare(
        `UPDATE daemon_connection
         SET status = 'online',
             last_heartbeat_at = ?,
             updated_at = ?
         WHERE daemon_key = ?`
      ).run(now, now, daemonKey);
    }
    db.prepare(
      `UPDATE agent_runtime
       SET status = 'online',
           last_heartbeat_at = ?,
           updated_at = ?
       WHERE daemon_connection_id = ?`
    ).run(now, now, daemon.id);
    for (const runtime of options?.runtimes ?? []) {
      if (!runtime.metadata || !isRecord(runtime.metadata)) {
        continue;
      }
      const selectors = ["daemon_connection_id = ?"];
      const params = [daemon.id];
      if (runtime.id?.trim()) {
        selectors.push("id = ?");
        params.push(runtime.id.trim());
      } else if (runtime.provider?.trim()) {
        selectors.push("provider = ?");
        params.push(runtime.provider.trim());
      } else {
        continue;
      }
      const row = db.prepare(
        `SELECT metadata_json AS metadataJson
         FROM agent_runtime
         WHERE ${selectors.join(" AND ")}
         LIMIT 1`
      ).get(...params);
      const existingMetadata = parseMetadataJson(row?.metadataJson);
      db.prepare(
        `UPDATE agent_runtime
         SET metadata_json = ?,
             updated_at = ?
         WHERE ${selectors.join(" AND ")}`
      ).run(JSON.stringify({ ...existingMetadata, ...runtime.metadata }), now, ...params);
    }
  });
  return readDaemonSnapshotSync(daemonKey);
}
function parseMetadataJson(value) {
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function markDaemonOfflineSync(daemonKey, options) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  withTransaction(db, () => {
    const daemon = readDaemonConnectionRow(db, daemonKey);
    if (!daemon) {
      throw new Error(`Daemon "${daemonKey}" does not exist.`);
    }
    db.prepare(
      `UPDATE daemon_connection
       SET status = 'offline',
           updated_at = ?
       WHERE daemon_key = ?`
    ).run(now, daemonKey);
    db.prepare(
      `UPDATE agent_runtime
       SET status = 'offline',
           last_error = COALESCE(?, last_error),
           updated_at = ?
       WHERE daemon_connection_id = ?`
    ).run(options?.lastError ?? null, now, daemon.id);
  });
  return readDaemonSnapshotSync(daemonKey);
}
function readDaemonSnapshotSync(daemonKey) {
  const db = getDatabase();
  const daemon = readDaemonConnectionRow(db, daemonKey);
  if (!daemon) {
    throw new Error(`Daemon "${daemonKey}" does not exist.`);
  }
  return {
    daemon,
    runtimes: listDaemonRuntimesSync(daemon.id)
  };
}
function readAgentRuntimeSync(runtimeId) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        daemon_connection_id AS daemonConnectionId,
        provider,
        name,
        version,
        status,
        device_info AS deviceInfo,
        metadata_json AS metadataJson,
        connected_at AS connectedAt,
        last_heartbeat_at AS lastHeartbeatAt,
        last_error AS lastError,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM agent_runtime
      WHERE id = ?`
  ).get(runtimeId);
  return row ? mapAgentRuntimeRecord(row) : null;
}
function listDaemonSnapshotsSync(workspaceId) {
  const db = getDatabase();
  const hasWorkspaceId = typeof workspaceId === "string";
  const daemons = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        daemon_key AS daemonKey,
        device_name AS deviceName,
        status,
        metadata_json AS metadataJson,
        last_heartbeat_at AS lastHeartbeatAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM daemon_connection
      ${hasWorkspaceId ? "WHERE workspace_id = ?" : ""}
      ORDER BY created_at ASC`
  ).all(...hasWorkspaceId ? [workspaceId] : []);
  const runtimes = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        daemon_connection_id AS daemonConnectionId,
        provider,
        name,
        version,
        status,
        device_info AS deviceInfo,
        metadata_json AS metadataJson,
        connected_at AS connectedAt,
        last_heartbeat_at AS lastHeartbeatAt,
        last_error AS lastError,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM agent_runtime
      ${hasWorkspaceId ? "WHERE workspace_id = ?" : ""}
      ORDER BY daemon_connection_id ASC, provider ASC`
  ).all(...hasWorkspaceId ? [workspaceId] : []);
  const runtimesByDaemonId = /* @__PURE__ */ new Map();
  for (const runtime of runtimes.map((row) => mapAgentRuntimeRecord(row)).filter((row) => row !== null)) {
    const daemonConnectionId = runtime.daemonConnectionId;
    if (!daemonConnectionId) {
      continue;
    }
    const next = runtimesByDaemonId.get(daemonConnectionId) ?? [];
    next.push(runtime);
    runtimesByDaemonId.set(daemonConnectionId, next);
  }
  return daemons.map((row) => mapDaemonConnectionRecord(row)).filter((row) => row !== null).map((daemon) => ({
    daemon,
    runtimes: runtimesByDaemonId.get(daemon.id) ?? []
  }));
}
function pruneOfflineDaemonsSync(maxOfflineAgeMs, options) {
  const db = getDatabase();
  const cutoff = Date.now() - maxOfflineAgeMs;
  const daemons = listDaemonSnapshotsSync(options?.workspaceId);
  let removed = 0;
  withTransaction(db, () => {
    for (const snapshot of daemons) {
      if (snapshot.daemon.status !== "offline") {
        continue;
      }
      const lastTouched = snapshot.daemon.lastHeartbeatAt ?? snapshot.daemon.updatedAt;
      if (new Date(lastTouched).getTime() >= cutoff) {
        continue;
      }
      db.prepare("DELETE FROM agent_runtime WHERE daemon_connection_id = ?").run(snapshot.daemon.id);
      db.prepare("DELETE FROM daemon_connection WHERE id = ?").run(snapshot.daemon.id);
      removed += 1;
    }
  });
  return removed;
}
function readDaemonConnectionRow(db, daemonKey) {
  const row = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        daemon_key AS daemonKey,
        device_name AS deviceName,
        status,
        metadata_json AS metadataJson,
        last_heartbeat_at AS lastHeartbeatAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM daemon_connection
      WHERE daemon_key = ?`
  ).get(daemonKey);
  return row ? mapDaemonConnectionRecord(row) : null;
}
function listDaemonRuntimesSync(daemonConnectionId) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        daemon_connection_id AS daemonConnectionId,
        provider,
        name,
        version,
        status,
        device_info AS deviceInfo,
        metadata_json AS metadataJson,
        connected_at AS connectedAt,
        last_heartbeat_at AS lastHeartbeatAt,
        last_error AS lastError,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM agent_runtime
      WHERE daemon_connection_id = ?
      ORDER BY provider ASC`
  ).all(daemonConnectionId);
  return rows.map((row) => mapAgentRuntimeRecord(row)).filter((row) => row !== null);
}
function mapDaemonConnectionRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.daemonKey !== "string" || typeof value.deviceName !== "string" || value.status !== "online" && value.status !== "offline" || typeof value.metadataJson !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    daemonKey: value.daemonKey,
    deviceName: value.deviceName,
    status: value.status,
    metadataJson: value.metadataJson,
    lastHeartbeatAt: typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : void 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}
function mapAgentRuntimeRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || !isDaemonProvider(value.provider) || typeof value.name !== "string" || typeof value.version !== "string" || value.status !== "online" && value.status !== "offline" || typeof value.deviceInfo !== "string" || typeof value.metadataJson !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    daemonConnectionId: typeof value.daemonConnectionId === "string" ? value.daemonConnectionId : void 0,
    provider: value.provider,
    name: value.name,
    version: value.version,
    status: value.status,
    deviceInfo: value.deviceInfo,
    metadataJson: value.metadataJson,
    connectedAt: typeof value.connectedAt === "string" ? value.connectedAt : void 0,
    lastHeartbeatAt: typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : void 0,
    lastError: typeof value.lastError === "string" ? value.lastError : void 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

// ../db/src/daemon-tokens.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
function createDaemonApiTokenSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const token = `adt_${randomBytes(24).toString("hex")}`;
  const id = `daemon-token-${randomLikeId()}`;
  const tokenHash = hashDaemonToken(token);
  db.prepare(
    `INSERT INTO daemon_api_token (
      id,
      workspace_id,
      label,
      token_hash,
      status,
      created_by,
      created_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)`
  ).run(id, workspaceId, input.label.trim(), tokenHash, input.createdBy.trim(), now);
  const record = readDaemonApiTokenSync(id);
  if (!record) {
    throw new Error(`Daemon API token "${id}" could not be read back.`);
  }
  return {
    ...record,
    token
  };
}
function listDaemonApiTokensSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        label,
        token_hash AS tokenHash,
        status,
        created_by AS createdBy,
        last_used_at AS lastUsedAt,
        created_at AS createdAt,
        revoked_at AS revokedAt
      FROM daemon_api_token
      WHERE workspace_id = ?
      ORDER BY created_at DESC`
  ).all(workspaceId);
  return rows.map((row) => mapDaemonApiTokenRecord(row)).filter((row) => row !== null);
}
function readDaemonApiTokenSync(id) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
        id,
        workspace_id AS workspaceId,
        label,
        token_hash AS tokenHash,
        status,
        created_by AS createdBy,
        last_used_at AS lastUsedAt,
        created_at AS createdAt,
        revoked_at AS revokedAt
      FROM daemon_api_token
      WHERE id = ?`
  ).get(id);
  return row ? mapDaemonApiTokenRecord(row) : null;
}
function revokeDaemonApiTokenSync(id) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `UPDATE daemon_api_token
     SET status = 'revoked',
         revoked_at = ?,
         last_used_at = COALESCE(last_used_at, ?)
     WHERE id = ?`
  ).run(now, now, id);
  const record = readDaemonApiTokenSync(id);
  if (!record) {
    throw new Error(`Daemon API token "${id}" does not exist.`);
  }
  return record;
}
function hashDaemonToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function mapDaemonApiTokenRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.label !== "string" || typeof value.tokenHash !== "string" || value.status !== "active" && value.status !== "revoked" || typeof value.createdBy !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    label: value.label,
    tokenHash: value.tokenHash,
    status: value.status,
    createdBy: value.createdBy,
    lastUsedAt: typeof value.lastUsedAt === "string" ? value.lastUsedAt : void 0,
    createdAt: value.createdAt,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : void 0
  };
}

// ../db/src/employee-bindings.ts
function bindEmployeeRuntimeSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const employeeName = input.employeeName.trim();
  const runtimeId = input.runtimeId.trim();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!employeeName) {
    throw new Error("employeeName is required.");
  }
  if (!runtimeId) {
    throw new Error("runtimeId is required.");
  }
  const runtime = db.prepare(
    `SELECT
        id,
        provider,
        name
      FROM agent_runtime
      WHERE id = ? AND workspace_id = ?`
  ).get(runtimeId, workspaceId);
  if (!runtime || typeof runtime.provider !== "string" || typeof runtime.name !== "string") {
    throw new Error(`Runtime "${runtimeId}" does not exist.`);
  }
  db.prepare(
    `INSERT INTO employee_runtime_binding (
      workspace_id,
      employee_name,
      runtime_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, employee_name) DO UPDATE SET
      runtime_id = excluded.runtime_id,
      updated_at = excluded.updated_at`
  ).run(workspaceId, employeeName, runtimeId, now, now);
  return readEmployeeRuntimeBindingSync(employeeName, workspaceId);
}
function unbindEmployeeRuntimeSync(employeeName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const result = db.prepare(
    `DELETE FROM employee_runtime_binding
       WHERE workspace_id = ? AND employee_name = ?`
  ).run(workspaceId, employeeName.trim());
  return result.changes > 0;
}
function readEmployeeRuntimeBindingSync(employeeName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
        erb.workspace_id AS workspaceId,
        erb.employee_name AS employeeName,
        erb.runtime_id AS runtimeId,
        ar.provider AS provider,
        ar.name AS runtimeName,
        erb.created_at AS boundAt,
        erb.updated_at AS updatedAt
      FROM employee_runtime_binding erb
      JOIN agent_runtime ar ON ar.id = erb.runtime_id
      WHERE erb.workspace_id = ? AND erb.employee_name = ?`
  ).get(workspaceId, employeeName.trim());
  return row ? mapEmployeeRuntimeBindingRecord(row) : null;
}
function listEmployeeRuntimeBindingsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
        erb.workspace_id AS workspaceId,
        erb.employee_name AS employeeName,
        erb.runtime_id AS runtimeId,
        ar.provider AS provider,
        ar.name AS runtimeName,
        erb.created_at AS boundAt,
        erb.updated_at AS updatedAt
      FROM employee_runtime_binding erb
      JOIN agent_runtime ar ON ar.id = erb.runtime_id
      WHERE erb.workspace_id = ?
      ORDER BY erb.employee_name ASC`
  ).all(workspaceId);
  return rows.map((row) => mapEmployeeRuntimeBindingRecord(row)).filter((row) => row !== null);
}
function mapEmployeeRuntimeBindingRecord(value) {
  if (typeof value.workspaceId !== "string" || typeof value.employeeName !== "string" || typeof value.runtimeId !== "string" || !isDaemonProvider(value.provider) || typeof value.runtimeName !== "string" || typeof value.boundAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    workspaceId: value.workspaceId,
    employeeName: value.employeeName,
    runtimeId: value.runtimeId,
    provider: value.provider,
    runtimeName: value.runtimeName,
    boundAt: value.boundAt,
    updatedAt: value.updatedAt
  };
}

// ../db/src/agent-router-sessions.ts
function resolveTaskRouterConversationIdentity(task) {
  const payload = safeParseJsonObject(task.inputJson);
  const channelName = readString(payload.channelName) ?? readString(payload.channel);
  const contactId = readString(payload.contactId);
  const title = readString(payload.title) ?? task.issueId ?? task.id;
  if ((task.triggerType === "channel_chat" || task.triggerType === "mention_chat" || contactId) && (channelName || contactId)) {
    const sourceType = contactId ? "direct_conversation" : "channel_conversation";
    return {
      conversationKey: `${sourceType}:${channelName ?? contactId}`,
      sourceType,
      title
    };
  }
  if (task.issueId) {
    return {
      conversationKey: `workspace_task:${task.issueId}`,
      sourceType: "workspace_task",
      title
    };
  }
  return {
    conversationKey: `task:${task.id}`,
    sourceType: "task",
    title
  };
}
function resolveRouterSessionForTaskSync(task) {
  const identity = resolveTaskRouterConversationIdentity(task);
  return upsertAgentRouterSessionSync({
    workspaceId: task.workspaceId,
    agentId: task.agentId,
    conversationKey: identity.conversationKey,
    sourceType: identity.sourceType,
    title: identity.title
  });
}
function upsertAgentRouterSessionSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const agentId = input.agentId.trim();
  const conversationKey = input.conversationKey?.trim() || void 0;
  const sourceType = input.sourceType?.trim() || "task";
  if (!agentId) {
    throw new Error("agentId is required.");
  }
  const existing = conversationKey ? db.prepare(
    `SELECT id
         FROM agent_router_session
         WHERE workspace_id = ? AND agent_id = ? AND conversation_key = ?
         LIMIT 1`
  ).get(workspaceId, agentId, conversationKey) : void 0;
  const id = typeof existing?.id === "string" ? existing.id : `router-session-${randomLikeId()}`;
  if (existing) {
    db.prepare(
      `UPDATE agent_router_session
       SET source_type = ?,
           status = 'active',
           title = COALESCE(?, title),
           summary = COALESCE(?, summary),
           memory_summary = COALESCE(?, memory_summary),
           updated_at = ?,
           closed_at = NULL
       WHERE id = ?`
    ).run(
      sourceType,
      input.title?.trim() || null,
      input.summary?.trim() || null,
      input.memorySummary?.trim() || null,
      now,
      id
    );
  } else {
    db.prepare(
      `INSERT INTO agent_router_session (
        id,
        workspace_id,
        agent_id,
        conversation_key,
        source_type,
        status,
        title,
        summary,
        memory_summary,
        created_at,
        updated_at,
        closed_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL)`
    ).run(
      id,
      workspaceId,
      agentId,
      conversationKey ?? null,
      sourceType,
      input.title?.trim() || null,
      input.summary?.trim() || null,
      input.memorySummary?.trim() || null,
      now,
      now
    );
  }
  const session = readAgentRouterSessionSync(id);
  if (!session) {
    throw new Error(`Router session "${id}" could not be read after write.`);
  }
  return session;
}
function readAgentRouterSessionSync(id) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      agent_id AS agentId,
      conversation_key AS conversationKey,
      source_type AS sourceType,
      status,
      title,
      summary,
      memory_summary AS memorySummary,
      created_at AS createdAt,
      updated_at AS updatedAt,
      closed_at AS closedAt
     FROM agent_router_session
     WHERE id = ?`
  ).get(id);
  return row ? mapAgentRouterSessionRecord(row) : null;
}
function readAgentRouterSessionForTaskSync(task) {
  return task.routerSessionId ? readAgentRouterSessionSync(task.routerSessionId) : null;
}
function upsertAgentRouterProviderSessionSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const providerSessionId = input.providerSessionId.trim();
  if (!providerSessionId) {
    throw new Error("providerSessionId is required.");
  }
  const existing = db.prepare(
    `SELECT id, created_at AS createdAt
     FROM agent_router_provider_session
     WHERE workspace_id = ? AND router_session_id = ? AND runtime_id = ? AND provider = ?
     LIMIT 1`
  ).get(workspaceId, input.routerSessionId, input.runtimeId, input.provider);
  const id = typeof existing?.id === "string" ? existing.id : `provider-session-${randomLikeId()}`;
  const createdAt = typeof existing?.createdAt === "string" ? existing.createdAt : now;
  db.prepare(
    `INSERT INTO agent_router_provider_session (
      id,
      workspace_id,
      router_session_id,
      runtime_id,
      provider,
      provider_session_id,
      status,
      last_used_at,
      last_error,
      metadata_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, router_session_id, runtime_id, provider) DO UPDATE SET
      provider_session_id = excluded.provider_session_id,
      status = excluded.status,
      last_used_at = excluded.last_used_at,
      last_error = excluded.last_error,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`
  ).run(
    id,
    workspaceId,
    input.routerSessionId,
    input.runtimeId,
    input.provider,
    providerSessionId,
    input.status ?? "active",
    now,
    input.lastError ?? null,
    JSON.stringify(input.metadata ?? {}),
    createdAt,
    now
  );
  const providerSession = readAgentRouterProviderSessionSync(id);
  if (!providerSession) {
    throw new Error(`Provider session "${id}" could not be read after write.`);
  }
  return providerSession;
}
function markAgentRouterProviderSessionInvalidSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const where = ["workspace_id = ?", "router_session_id = ?"];
  const params = [workspaceId, input.routerSessionId];
  if (input.runtimeId) {
    where.push("runtime_id = ?");
    params.push(input.runtimeId);
  }
  if (input.provider) {
    where.push("provider = ?");
    params.push(input.provider);
  }
  if (input.providerSessionId) {
    where.push("provider_session_id = ?");
    params.push(input.providerSessionId);
  }
  db.prepare(
    `UPDATE agent_router_provider_session
     SET status = 'invalid',
         last_error = ?,
         updated_at = ?
     WHERE ${where.join(" AND ")}`
  ).run(input.lastError, now, ...params);
}
function readAgentRouterProviderSessionSync(id) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      router_session_id AS routerSessionId,
      runtime_id AS runtimeId,
      provider,
      provider_session_id AS providerSessionId,
      status,
      last_used_at AS lastUsedAt,
      last_error AS lastError,
      metadata_json AS metadataJson,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM agent_router_provider_session
     WHERE id = ?`
  ).get(id);
  return row ? mapAgentRouterProviderSessionRecord(row) : null;
}
function findActiveProviderSessionForRouterSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      router_session_id AS routerSessionId,
      runtime_id AS runtimeId,
      provider,
      provider_session_id AS providerSessionId,
      status,
      last_used_at AS lastUsedAt,
      last_error AS lastError,
      metadata_json AS metadataJson,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM agent_router_provider_session
     WHERE workspace_id = ?
       AND router_session_id = ?
       AND runtime_id = ?
       AND provider = ?
       AND status = 'active'
     ORDER BY last_used_at DESC, updated_at DESC
     LIMIT 1`
  ).get(workspaceId, input.routerSessionId, input.runtimeId, input.provider);
  return row ? mapAgentRouterProviderSessionRecord(row) : null;
}
function createAgentTaskAttemptSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = `attempt-${randomLikeId()}`;
  const status = input.status ?? "claimed";
  db.prepare(
    `INSERT INTO agent_task_attempt (
      id,
      workspace_id,
      task_queue_id,
      router_session_id,
      runtime_id,
      provider,
      provider_session_id,
      status,
      started_at,
      finished_at,
      error_text,
      handoff_snapshot_id,
      metadata_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    input.taskQueueId,
    input.routerSessionId,
    input.runtimeId,
    input.provider,
    input.providerSessionId ?? null,
    status,
    status === "running" ? now : null,
    JSON.stringify(input.metadata ?? {}),
    now,
    now
  );
  const attempt = readAgentTaskAttemptSync(id);
  if (!attempt) {
    throw new Error(`Task attempt "${id}" could not be read after write.`);
  }
  return attempt;
}
function readAgentTaskAttemptSync(id) {
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
     WHERE id = ?`
  ).get(id);
  return row ? mapAgentTaskAttemptRecord(row) : null;
}
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
function listAgentTaskAttemptsSync(options = {}) {
  const where = [];
  const params = [];
  if (options.workspaceId) {
    where.push("workspace_id = ?");
    params.push(options.workspaceId);
  }
  if (options.taskQueueId) {
    where.push("task_queue_id = ?");
    params.push(options.taskQueueId);
  }
  if (options.routerSessionId) {
    where.push("router_session_id = ?");
    params.push(options.routerSessionId);
  }
  const rows = getDatabase().prepare(
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
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at ASC, id ASC
     LIMIT ?`
  ).all(...params, normalizeLimit(options.limit, 200));
  return rows.map(mapAgentTaskAttemptRecord).filter((attempt) => attempt !== null);
}
function updateAgentTaskAttemptSync(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  getDatabase().prepare(
    `UPDATE agent_task_attempt
     SET status = ?,
         provider_session_id = COALESCE(?, provider_session_id),
         started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
         finished_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN COALESCE(finished_at, ?) ELSE finished_at END,
         error_text = COALESCE(?, error_text),
         handoff_snapshot_id = COALESCE(?, handoff_snapshot_id),
         metadata_json = COALESCE(?, metadata_json),
         updated_at = ?
     WHERE id = ?`
  ).run(
    input.status,
    input.providerSessionId ?? null,
    input.status,
    now,
    input.status,
    now,
    input.errorText ?? null,
    input.handoffSnapshotId ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
    input.attemptId
  );
  const attempt = readAgentTaskAttemptSync(input.attemptId);
  if (!attempt) {
    throw new Error(`Task attempt "${input.attemptId}" does not exist.`);
  }
  return attempt;
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
function listAgentRouterEventsSync(options = {}) {
  const where = [];
  const params = [];
  if (options.workspaceId) {
    where.push("workspace_id = ?");
    params.push(options.workspaceId);
  }
  if (options.routerSessionId) {
    where.push("router_session_id = ?");
    params.push(options.routerSessionId);
  }
  if (options.taskQueueId) {
    where.push("task_queue_id = ?");
    params.push(options.taskQueueId);
  }
  const order = options.order === "desc" ? "DESC" : "ASC";
  const rows = getDatabase().prepare(
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
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at ${order}, id ${order}
     LIMIT ?`
  ).all(...params, normalizeLimit(options.limit, 300));
  return rows.map(mapAgentRouterEventRecord).filter((event) => event !== null);
}
function createAgentRouterContextSnapshotSync(input) {
  const db = getDatabase();
  const id = `router-snapshot-${randomLikeId()}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO agent_router_context_snapshot (
      id,
      workspace_id,
      router_session_id,
      task_queue_id,
      snapshot_type,
      content_markdown,
      source_event_ids_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    input.routerSessionId,
    input.taskQueueId ?? null,
    input.snapshotType,
    input.contentMarkdown,
    JSON.stringify(input.sourceEventIds ?? []),
    now
  );
  const snapshot = readAgentRouterContextSnapshotSync(id);
  if (!snapshot) {
    throw new Error(`Router context snapshot "${id}" could not be read after write.`);
  }
  return snapshot;
}
function readAgentRouterContextSnapshotSync(id) {
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      router_session_id AS routerSessionId,
      task_queue_id AS taskQueueId,
      snapshot_type AS snapshotType,
      content_markdown AS contentMarkdown,
      source_event_ids_json AS sourceEventIdsJson,
      created_at AS createdAt
     FROM agent_router_context_snapshot
     WHERE id = ?`
  ).get(id);
  return row ? mapAgentRouterContextSnapshotRecord(row) : null;
}
function readLatestAgentRouterContextSnapshotSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const where = ["workspace_id = ?", "router_session_id = ?"];
  const params = [workspaceId, input.routerSessionId];
  if (input.snapshotType) {
    where.push("snapshot_type = ?");
    params.push(input.snapshotType);
  }
  const row = getDatabase().prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      router_session_id AS routerSessionId,
      task_queue_id AS taskQueueId,
      snapshot_type AS snapshotType,
      content_markdown AS contentMarkdown,
      source_event_ids_json AS sourceEventIdsJson,
      created_at AS createdAt
     FROM agent_router_context_snapshot
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 1`
  ).get(...params);
  return row ? mapAgentRouterContextSnapshotRecord(row) : null;
}
function chooseProviderSessionForTaskSync(input) {
  if (!input.task.routerSessionId) {
    return null;
  }
  const runtime = readAgentRuntimeSync(input.task.runtimeId);
  if (!runtime || runtime.provider === "hermes") {
    return null;
  }
  return findActiveProviderSessionForRouterSync({
    workspaceId: input.task.workspaceId,
    routerSessionId: input.task.routerSessionId,
    runtimeId: input.task.runtimeId,
    provider: runtime.provider
  });
}
function mapAgentRouterSessionRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.agentId !== "string" || !isAgentRouterSessionStatus(value.status) || typeof value.sourceType !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    agentId: value.agentId,
    conversationKey: typeof value.conversationKey === "string" ? value.conversationKey : void 0,
    sourceType: value.sourceType,
    status: value.status,
    title: typeof value.title === "string" ? value.title : void 0,
    summary: typeof value.summary === "string" ? value.summary : void 0,
    memorySummary: typeof value.memorySummary === "string" ? value.memorySummary : void 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    closedAt: typeof value.closedAt === "string" ? value.closedAt : void 0
  };
}
function mapAgentRouterProviderSessionRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.routerSessionId !== "string" || typeof value.runtimeId !== "string" || typeof value.provider !== "string" || typeof value.providerSessionId !== "string" || !isAgentRouterProviderSessionStatus(value.status) || typeof value.metadataJson !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    routerSessionId: value.routerSessionId,
    runtimeId: value.runtimeId,
    provider: value.provider,
    providerSessionId: value.providerSessionId,
    status: value.status,
    lastUsedAt: typeof value.lastUsedAt === "string" ? value.lastUsedAt : void 0,
    lastError: typeof value.lastError === "string" ? value.lastError : void 0,
    metadataJson: value.metadataJson,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
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
function mapAgentRouterContextSnapshotRecord(value) {
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.routerSessionId !== "string" || !isAgentRouterContextSnapshotType(value.snapshotType) || typeof value.contentMarkdown !== "string" || typeof value.sourceEventIdsJson !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    routerSessionId: value.routerSessionId,
    taskQueueId: typeof value.taskQueueId === "string" ? value.taskQueueId : void 0,
    snapshotType: value.snapshotType,
    contentMarkdown: value.contentMarkdown,
    sourceEventIdsJson: value.sourceEventIdsJson,
    createdAt: value.createdAt
  };
}
function isAgentRouterSessionStatus(value) {
  return value === "active" || value === "closed";
}
function isAgentRouterProviderSessionStatus(value) {
  return value === "active" || value === "invalid" || value === "expired";
}
function isAgentRouterActorType(value) {
  return value === "human" || value === "agent" || value === "runtime" || value === "system";
}
function isAgentRouterContextSnapshotType(value) {
  return value === "context" || value === "memory" || value === "handoff";
}
function isAgentTaskAttemptStatus(value) {
  return value === "claimed" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}
function normalizeLimit(limit, defaultLimit) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return defaultLimit;
  }
  return Math.min(1e3, Math.max(1, Math.floor(limit)));
}
function safeParseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}

// ../db/src/runtime-grants.ts
function canUserUseRuntimeSync(workspaceId, runtimeId, userId) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT 1
     FROM workspace_runtime_grant
     WHERE workspace_id = ?
       AND runtime_id = ?
       AND user_id = ?
       AND permission = 'use'
       AND status = 'active'
     LIMIT 1`
  ).get(workspaceId, runtimeId.trim(), userId.trim());
  return Boolean(row);
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

// ../db/src/notifications.ts
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
  const limit = normalizeLimit2(options.limit);
  const rows = db.prepare(
    `${workspaceNotificationSelectSql()}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).all(...params, limit);
  return rows.map(mapWorkspaceNotificationRecord).filter((record) => record !== null);
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
function isRecordMetadataJson(value) {
  return typeof value === "string" || Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeMetadataJson(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value ?? {});
}
function normalizeLimit2(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(Math.round(value), 500));
}
function normalizeStatusFilter(value) {
  const statuses = Array.isArray(value) ? value : value ? [value] : [];
  return statuses.filter(isStatus);
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
function deleteStoredWorkspaceSkillSync(skillId, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const result = db.prepare(
    `DELETE FROM skill
       WHERE workspace_id = ? AND id = ?`
  ).run(workspaceId, skillId);
  return result.changes > 0;
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
function resetStoredWorkspaceSkillsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare(
      `DELETE FROM agent_skill
       WHERE workspace_id = ?`
    ).run(workspaceId);
    db.prepare(
      `DELETE FROM skill
       WHERE workspace_id = ?`
    ).run(workspaceId);
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
function resetStoredKnowledgeAssignmentsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  withTransaction(db, () => {
    db.prepare("DELETE FROM agent_knowledge_page WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM knowledge_page_assignment_policy WHERE workspace_id = ?").run(workspaceId);
  });
}
function mapStoredKnowledgeAssignmentPolicyRecord(value) {
  if (typeof value.workspaceId !== "string" || typeof value.knowledgePageId !== "string" || !isKnowledgeAssignmentMode(value.assignmentMode) || typeof value.updatedAt !== "string") {
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
function isKnowledgeAssignmentMode(value) {
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
function priorityToNumber(priority) {
  if (priority === "high") {
    return 3;
  }
  if (priority === "medium") {
    return 2;
  }
  return 1;
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
  const payload = safeParseJsonObject2(task.inputJson);
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
function safeParseJsonObject2(value) {
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
      ...safeParseJsonObject2(event.dataJson)
    },
    createdAt: event.createdAt
  });
}

// ../db/src/task-queue.ts
function enqueueNativeTaskSync(input) {
  const db = getDatabase();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const binding = readEmployeeRuntimeBindingSync(input.assignee, workspaceId);
  if (!binding) {
    return null;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const queueId = `queue-${randomLikeId()}`;
  const payload = {
    taskId: input.taskId,
    assignee: input.assignee,
    title: input.title,
    channel: input.channel,
    priority: input.priority,
    ...input.metadata ?? {},
    requester: input.requestedByUserId || input.requestedByDisplayName ? {
      userId: input.requestedByUserId,
      displayName: input.requestedByDisplayName
    } : void 0
  };
  const routerSession = resolveRouterSessionForTaskSync({
    id: queueId,
    workspaceId,
    agentId: input.assignee,
    triggerType: input.triggerType ?? "manual",
    inputJson: JSON.stringify(payload),
    issueId: input.taskId
  });
  db.prepare(
    `INSERT INTO agent_task_queue (
      id,
      workspace_id,
      agent_id,
      runtime_id,
      router_session_id,
      issue_id,
      trigger_type,
      priority,
      status,
      input_json,
      requested_by_user_id,
      requested_by_display_name,
      queued_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`
  ).run(
    queueId,
    workspaceId,
    input.assignee,
    binding.runtimeId,
    routerSession.id,
    input.taskId ?? null,
    input.triggerType ?? "manual",
    priorityToNumber(input.priority),
    JSON.stringify(payload),
    input.requestedByUserId ?? null,
    input.requestedByDisplayName ?? null,
    now,
    now,
    now
  );
  const task = readQueuedTaskSync(queueId);
  if (task) {
    recordRouterLifecycleEvent(task, {
      type: "task_queued",
      actorType: "system",
      summary: input.title,
      data: {
        priority: input.priority,
        preferredRuntimeId: binding.runtimeId,
        requestedByUserId: input.requestedByUserId,
        requestedByDisplayName: input.requestedByDisplayName
      }
    });
    recordQueueLifecycleEvent(task, {
      type: "queued",
      title: "Task entered the execution queue",
      summary: `${input.title} is waiting for ${binding.runtimeName}.`,
      status: "pending",
      data: {
        priority: input.priority,
        requestedByUserId: input.requestedByUserId,
        requestedByDisplayName: input.requestedByDisplayName
      }
    });
  }
  return task;
}
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
function readLatestChannelExecutionSync(agentId, channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return readLatestConversationExecutionSync(agentId, { channelName }, workspaceId);
}
function readLatestConversationExecutionSync(agentId, input, workspaceId = DEFAULT_WORKSPACE_ID) {
  return listQueuedTasksSync({ workspaceId }).filter((task) => task.agentId === agentId).filter((task) => {
    try {
      const payload = JSON.parse(task.inputJson);
      const matchesChannel = typeof input.channelName === "string" && typeof payload.channelName === "string" && payload.channelName === input.channelName;
      const matchesLegacyContact = typeof input.contactId === "string" && typeof payload.contactId === "string" && payload.contactId === input.contactId;
      return matchesChannel || matchesLegacyContact;
    } catch {
      return false;
    }
  }).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null;
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
function claimNextQueuedTaskForRuntimeSync(runtimeId, workspaceId) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let claimedId = null;
  let fallbackReason;
  db.exec("BEGIN");
  try {
    let row = selectQueuedTaskForRuntime(db, runtimeId, workspaceId);
    if (!row) {
      const fallback = selectFallbackQueuedTaskForRuntime(db, runtimeId, workspaceId);
      if (fallback) {
        row = fallback.row;
        fallbackReason = fallback.reason;
        db.prepare(
          `UPDATE agent_task_queue
           SET runtime_id = ?,
               updated_at = ?
           WHERE id = ? AND status = 'queued'`
        ).run(runtimeId, now, row.id);
      }
    }
    if (row && typeof row.id === "string") {
      db.prepare(
        `UPDATE agent_task_queue
         SET status = 'claimed',
             claimed_at = ?,
             updated_at = ?
         WHERE id = ? AND status = 'queued'`
      ).run(now, now, row.id);
      claimedId = row.id;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const task = claimedId ? readQueuedTaskSync(claimedId) : null;
  if (task) {
    const runtime = readAgentRuntimeSync(task.runtimeId);
    const providerSession = chooseProviderSessionForTaskSync({ task });
    const attempt = runtime && task.routerSessionId ? createAgentTaskAttemptSync({
      workspaceId: task.workspaceId,
      taskQueueId: task.id,
      routerSessionId: task.routerSessionId,
      runtimeId: task.runtimeId,
      provider: runtime.provider,
      providerSessionId: providerSession?.providerSessionId,
      status: "claimed",
      metadata: {
        routingMode: providerSession ? "same_provider_resume" : fallbackReason ? "cold_rebuild_fallback" : "cold_rebuild",
        fallbackReason,
        previousRuntimeId: fallbackReason ? readStringFromTaskInput(task.inputJson, "__previousRuntimeId") : void 0
      }
    }) : null;
    recordRouterLifecycleEvent(task, {
      attemptId: attempt?.id,
      type: fallbackReason ? "runtime_fallback_selected" : "runtime_selected",
      actorType: "system",
      runtimeId: task.runtimeId,
      provider: runtime?.provider,
      summary: fallbackReason ? `Task was reassigned to runtime ${task.runtimeId}: ${fallbackReason}.` : `Task was assigned to runtime ${task.runtimeId}.`,
      data: {
        attemptId: attempt?.id,
        providerSessionId: providerSession?.providerSessionId,
        routingMode: providerSession ? "same_provider_resume" : fallbackReason ? "cold_rebuild_fallback" : "cold_rebuild",
        fallbackReason
      }
    });
    recordQueueLifecycleEvent(task, {
      type: "assigned",
      title: "Runtime claimed the task",
      summary: fallbackReason ? `${task.agentId} fell back to runtime ${task.runtimeId}.` : `${task.agentId} is assigned to runtime ${task.runtimeId}.`,
      status: "running",
      data: {
        claimedAt: task.claimedAt,
        attemptId: attempt?.id,
        routingMode: providerSession ? "same_provider_resume" : fallbackReason ? "cold_rebuild_fallback" : "cold_rebuild",
        fallbackReason,
        providerSessionId: providerSession?.providerSessionId
      }
    });
  }
  return task;
}
function startQueuedTaskSync(taskId) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const previous = readQueuedTaskSync(taskId);
  db.prepare(
    `UPDATE agent_task_queue
     SET status = 'running',
         started_at = COALESCE(started_at, ?),
         updated_at = ?
     WHERE id = ?`
  ).run(now, now, taskId);
  const task = readQueuedTaskSync(taskId);
  if (!task) {
    throw new Error(`Queued task "${taskId}" does not exist.`);
  }
  if (previous?.status !== "running") {
    const attempt = readLatestAgentTaskAttemptForTaskSync(task.id);
    if (attempt && attempt.status !== "running") {
      updateAgentTaskAttemptSync({ attemptId: attempt.id, status: "running" });
    }
    const runtime = readAgentRuntimeSync(task.runtimeId);
    recordRouterLifecycleEvent(task, {
      attemptId: attempt?.id,
      type: "provider_started",
      actorType: "runtime",
      actorId: task.runtimeId,
      runtimeId: task.runtimeId,
      provider: runtime?.provider,
      summary: `Runtime ${task.runtimeId} started execution.`,
      data: {
        attemptId: attempt?.id,
        providerSessionId: attempt?.providerSessionId
      }
    });
    recordQueueLifecycleEvent(task, {
      type: "workspace_prepared",
      title: "Execution started",
      summary: `Runtime ${task.runtimeId} started the task.`,
      status: "running",
      data: { startedAt: task.startedAt }
    });
  }
  return task;
}
function completeQueuedTaskSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const previous = readQueuedTaskSync(input.taskId);
  db.prepare(
    `UPDATE agent_task_queue
     SET status = 'completed',
         result_json = ?,
         session_id = ?,
         work_dir = ?,
         finished_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    input.resultJson ? JSON.stringify(input.resultJson) : null,
    input.sessionId ?? null,
    input.workDir ?? null,
    now,
    now,
    input.taskId
  );
  const task = readQueuedTaskSync(input.taskId);
  if (!task) {
    throw new Error(`Queued task "${input.taskId}" does not exist.`);
  }
  if (previous?.status !== "completed") {
    const attempt = readLatestAgentTaskAttemptForTaskSync(task.id);
    const runtime = readAgentRuntimeSync(task.runtimeId);
    if (attempt) {
      updateAgentTaskAttemptSync({
        attemptId: attempt.id,
        status: "completed",
        providerSessionId: input.sessionId ?? null,
        metadata: mergeJsonObject(attempt.metadataJson, {
          workDir: input.workDir,
          completedAt: task.finishedAt,
          resumeMode: attempt.providerSessionId ? "same_provider_resume" : "cold_rebuild"
        })
      });
    }
    if (runtime && task.routerSessionId && input.sessionId) {
      upsertAgentRouterProviderSessionSync({
        workspaceId: task.workspaceId,
        routerSessionId: task.routerSessionId,
        runtimeId: task.runtimeId,
        provider: runtime.provider,
        providerSessionId: input.sessionId,
        metadata: {
          taskQueueId: task.id,
          attemptId: attempt?.id,
          workDir: input.workDir
        }
      });
    }
    recordRouterLifecycleEvent(task, {
      attemptId: attempt?.id,
      type: "final_answer",
      actorType: "agent",
      actorId: task.agentId,
      runtimeId: task.runtimeId,
      provider: runtime?.provider,
      summary: readResultSummary(input.resultJson),
      data: {
        attemptId: attempt?.id,
        providerSessionId: input.sessionId,
        workDir: input.workDir
      }
    });
    recordArtifactEvents(task, input.resultJson);
    recordQueueLifecycleEvent(task, {
      type: "completed",
      title: "Task completed",
      summary: "The agent returned a final result and the task is closed.",
      status: "succeeded",
      data: {
        finishedAt: task.finishedAt,
        sessionId: input.sessionId,
        workDir: input.workDir
      }
    });
  }
  return task;
}
function failQueuedTaskSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const previous = readQueuedTaskSync(input.taskId);
  db.prepare(
    `UPDATE agent_task_queue
     SET status = 'failed',
         error_text = ?,
         session_id = COALESCE(?, session_id),
         work_dir = COALESCE(?, work_dir),
         finished_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(input.errorText, input.sessionId ?? null, input.workDir ?? null, now, now, input.taskId);
  const task = readQueuedTaskSync(input.taskId);
  if (!task) {
    throw new Error(`Queued task "${input.taskId}" does not exist.`);
  }
  if (previous?.status !== "failed") {
    const blocked = isBlockedFailure(input);
    const attempt = readLatestAgentTaskAttemptForTaskSync(task.id);
    const runtime = readAgentRuntimeSync(task.runtimeId);
    const handoffSnapshot = task.routerSessionId ? createAgentRouterContextSnapshotSync({
      workspaceId: task.workspaceId,
      routerSessionId: task.routerSessionId,
      taskQueueId: task.id,
      snapshotType: "handoff",
      contentMarkdown: buildFailureHandoffSnapshot(task, input)
    }) : null;
    if (attempt) {
      updateAgentTaskAttemptSync({
        attemptId: attempt.id,
        status: "failed",
        providerSessionId: input.sessionId ?? null,
        errorText: input.errorText,
        handoffSnapshotId: handoffSnapshot?.id ?? null,
        metadata: mergeJsonObject(attempt.metadataJson, {
          workDir: input.workDir,
          errorCode: input.errorCode,
          errorCategory: input.errorCategory,
          provider: input.provider,
          failedAt: task.finishedAt
        })
      });
    }
    if (task.routerSessionId && isProviderSessionInvalidFailure(input)) {
      markAgentRouterProviderSessionInvalidSync({
        workspaceId: task.workspaceId,
        routerSessionId: task.routerSessionId,
        runtimeId: task.runtimeId,
        provider: runtime?.provider,
        providerSessionId: input.sessionId,
        lastError: input.errorText
      });
    } else if (runtime && task.routerSessionId && input.sessionId) {
      upsertAgentRouterProviderSessionSync({
        workspaceId: task.workspaceId,
        routerSessionId: task.routerSessionId,
        runtimeId: task.runtimeId,
        provider: runtime.provider,
        providerSessionId: input.sessionId,
        status: "active",
        lastError: input.errorText,
        metadata: {
          taskQueueId: task.id,
          attemptId: attempt?.id,
          workDir: input.workDir,
          failure: true
        }
      });
    }
    recordRouterLifecycleEvent(task, {
      attemptId: attempt?.id,
      type: "failure",
      actorType: "runtime",
      actorId: task.runtimeId,
      runtimeId: task.runtimeId,
      provider: runtime?.provider ?? readDaemonProvider(input.provider),
      summary: truncateSummary(input.errorText),
      data: {
        attemptId: attempt?.id,
        handoffSnapshotId: handoffSnapshot?.id,
        providerSessionId: input.sessionId,
        providerSessionInvalid: isProviderSessionInvalidFailure(input),
        errorCode: input.errorCode,
        errorCategory: input.errorCategory,
        rawProviderMessage: truncateSummary(input.rawProviderMessage),
        workDir: input.workDir
      }
    });
    if (handoffSnapshot) {
      recordRouterLifecycleEvent(task, {
        attemptId: attempt?.id,
        type: "handoff_snapshot_created",
        actorType: "system",
        runtimeId: task.runtimeId,
        provider: runtime?.provider ?? readDaemonProvider(input.provider),
        summary: "A handoff snapshot was captured from the failed task attempt.",
        data: {
          handoffSnapshotId: handoffSnapshot.id,
          attemptId: attempt?.id
        }
      });
    }
    recordQueueLifecycleEvent(task, {
      type: blocked ? "blocked" : "failed",
      title: blocked ? "Task is blocked" : "Task failed",
      summary: truncateSummary(input.errorText),
      severity: "error",
      status: "failed",
      data: {
        errorCode: input.errorCode,
        errorCategory: input.errorCategory,
        provider: input.provider,
        rawProviderMessage: truncateSummary(input.rawProviderMessage),
        sessionId: input.sessionId,
        workDir: input.workDir
      }
    });
  }
  return task;
}
function recordQueueLifecycleEvent(task, event) {
  const context = buildTaskExecutionEventContext(task);
  recordTaskExecutionEventSync({
    ...context,
    type: event.type,
    title: event.title,
    summary: event.summary,
    severity: event.severity,
    status: event.status,
    data: {
      triggerType: context.triggerType,
      issueId: context.issueId,
      taskTitle: context.taskTitle,
      ...event.data
    }
  });
}
function recordRouterLifecycleEvent(task, event) {
  if (!task.routerSessionId) {
    return;
  }
  recordAgentRouterEventSync({
    workspaceId: task.workspaceId,
    routerSessionId: task.routerSessionId,
    taskQueueId: task.id,
    attemptId: event.attemptId,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    runtimeId: event.runtimeId ?? task.runtimeId,
    provider: event.provider,
    summary: event.summary,
    data: event.data
  });
}
function recordArtifactEvents(task, resultJson) {
  if (!resultJson) {
    return;
  }
  const attachments = readObjectArray(resultJson.attachments);
  const skillImports = readObjectArray(resultJson.skillImports);
  const documentUpdates = readObjectArray(resultJson.documentUpdates);
  const externalSheetOperations = readObjectArray(resultJson.externalSheetOperations);
  const knowledgeProposals = readObjectArray(resultJson.knowledgeProposals);
  const artifactCount = attachments.length + skillImports.length + documentUpdates.length + externalSheetOperations.length + knowledgeProposals.length;
  if (artifactCount === 0) {
    return;
  }
  recordQueueLifecycleEvent(task, {
    type: "artifact_detected",
    title: "Runtime output contained artifacts",
    summary: `${artifactCount} runtime output artifact${artifactCount === 1 ? "" : "s"} will be collected.`,
    status: "running",
    data: {
      attachmentCount: attachments.length,
      skillImportCount: skillImports.length,
      documentUpdateCount: documentUpdates.length,
      externalSheetOperationCount: externalSheetOperations.length,
      knowledgeProposalCount: knowledgeProposals.length
    }
  });
  for (const attachment of attachments) {
    const id = readString2(attachment.id);
    const fileName = readString2(attachment.fileName) ?? "attachment";
    recordQueueLifecycleEvent(task, {
      type: "artifact_collected",
      title: `Attachment collected: ${fileName}`,
      summary: "The artifact is available as a workspace attachment.",
      status: "succeeded",
      data: {
        artifactKind: "attachment",
        attachmentId: id,
        fileName,
        mediaType: readString2(attachment.mediaType),
        sizeBytes: typeof attachment.sizeBytes === "number" ? attachment.sizeBytes : void 0,
        targetHref: id ? `/api/attachments/${encodeURIComponent(id)}` : void 0
      }
    });
  }
  for (const documentUpdate of documentUpdates) {
    const documentId = readString2(documentUpdate.documentId);
    recordQueueLifecycleEvent(task, {
      type: "artifact_collected",
      title: "Channel document updated",
      summary: "The runtime output was promoted into a channel document.",
      status: "succeeded",
      data: {
        artifactKind: "channel_document",
        documentId,
        documentVersionId: readString2(documentUpdate.documentVersionId),
        targetHref: documentId ? `/im?tab=documents&doc=${encodeURIComponent(documentId)}` : void 0
      }
    });
  }
  for (const skillImport of skillImports) {
    const skillName = readString2(skillImport.skillName) ?? readString2(skillImport.name) ?? "skill";
    recordQueueLifecycleEvent(task, {
      type: "artifact_collected",
      title: `Skill import collected: ${skillName}`,
      summary: "The runtime output was applied to the workspace skill library.",
      status: "succeeded",
      data: {
        artifactKind: "skill_import",
        skillName,
        skillId: readString2(skillImport.skillId)
      }
    });
  }
  for (const operation of externalSheetOperations) {
    recordQueueLifecycleEvent(task, {
      type: "artifact_collected",
      title: "External sheet operation collected",
      summary: "The runtime output was applied to a connected Google Workspace document.",
      status: readString2(operation.status) === "failed" ? "failed" : "succeeded",
      severity: readString2(operation.status) === "failed" ? "error" : "info",
      data: {
        artifactKind: "external_sheet_operation",
        operationId: readString2(operation.id),
        operationType: readString2(operation.operationType),
        status: readString2(operation.status),
        documentId: readString2(operation.channelDocumentId) ?? readString2(operation.documentId)
      }
    });
  }
  for (const proposal of knowledgeProposals) {
    const title = readString2(proposal.title) ?? "Knowledge proposal";
    recordQueueLifecycleEvent(task, {
      type: "approval_requested",
      title: `Knowledge proposal collected: ${title}`,
      summary: readString2(proposal.message) ?? "The runtime output submitted a workspace knowledge proposal for human approval.",
      status: readString2(proposal.status) === "failed" ? "failed" : "pending",
      severity: readString2(proposal.status) === "failed" ? "error" : "warning",
      data: {
        artifactKind: "knowledge_proposal",
        proposalId: readString2(proposal.proposalId),
        approvalId: readString2(proposal.approvalId),
        operation: readString2(proposal.operation),
        status: readString2(proposal.status)
      }
    });
  }
}
function selectQueuedTaskForRuntime(db, runtimeId, workspaceId) {
  return db.prepare(
    `SELECT id
       FROM agent_task_queue
       WHERE runtime_id = ? AND status = 'queued'
       ${typeof workspaceId === "string" ? "AND workspace_id = ?" : ""}
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`
  ).get(...typeof workspaceId === "string" ? [runtimeId, workspaceId] : [runtimeId]);
}
function selectFallbackQueuedTaskForRuntime(db, runtimeId, workspaceId) {
  const runtime = readAgentRuntimeSync(runtimeId);
  if (!runtime || runtime.status !== "online") {
    return null;
  }
  const rows = db.prepare(
    `SELECT
       q.id,
       q.runtime_id AS runtimeId,
       q.workspace_id AS workspaceId,
       q.requested_by_user_id AS requestedByUserId,
       r.status AS selectedRuntimeStatus,
       r.provider AS selectedProvider
     FROM agent_task_queue q
     JOIN agent_runtime r ON r.id = q.runtime_id
     WHERE q.status = 'queued'
       AND q.runtime_id <> ?
       ${typeof workspaceId === "string" ? "AND q.workspace_id = ?" : ""}
     ORDER BY q.priority DESC, q.created_at ASC
     LIMIT 20`
  ).all(...typeof workspaceId === "string" ? [runtimeId, workspaceId] : [runtimeId]);
  for (const row of rows) {
    if (row.workspaceId !== runtime.workspaceId) {
      continue;
    }
    if (row.selectedRuntimeStatus === "online") {
      continue;
    }
    const requesterUserId = typeof row.requestedByUserId === "string" ? row.requestedByUserId : void 0;
    if (requesterUserId && !canUserUseRuntimeSync(runtime.workspaceId, runtime.id, requesterUserId)) {
      continue;
    }
    const selectedProvider = typeof row.selectedProvider === "string" ? row.selectedProvider : void 0;
    if (selectedProvider && runtime.provider !== selectedProvider && existsUsableOnlineRuntimeForProvider({
      db,
      workspaceId: runtime.workspaceId,
      provider: selectedProvider,
      requesterUserId
    })) {
      continue;
    }
    return {
      row,
      reason: selectedProvider && runtime.provider !== selectedProvider ? `preferred runtime ${String(row.runtimeId)} is offline and no usable ${selectedProvider} runtime is online` : requesterUserId ? `preferred runtime ${String(row.runtimeId)} is offline and requester can use ${runtime.id}` : `preferred runtime ${String(row.runtimeId)} is offline`
    };
  }
  return null;
}
function existsUsableOnlineRuntimeForProvider(input) {
  const rows = input.db.prepare(
    `SELECT id
     FROM agent_runtime
     WHERE workspace_id = ?
       AND provider = ?
       AND status = 'online'`
  ).all(input.workspaceId, input.provider);
  if (!input.requesterUserId) {
    return rows.length > 0;
  }
  return rows.some(
    (row) => typeof row.id === "string" && canUserUseRuntimeSync(input.workspaceId, row.id, input.requesterUserId)
  );
}
function isBlockedFailure(input) {
  const value = `${input.errorCode ?? ""} ${input.errorCategory ?? ""} ${input.errorText}`.toLowerCase();
  return /\b(auth|permission|denied|forbidden|credential|budget|quota|approval|profile|context|blocked|unauthorized)\b/.test(value);
}
function isProviderSessionInvalidFailure(input) {
  return input.errorCode === "provider.session_invalid" || /\b(session invalid|invalid session|session.*not found|no conversation found|no rollout found|harness\.session_missing)\b/i.test(input.errorText);
}
function buildFailureHandoffSnapshot(task, input) {
  const payload = safeParseJsonObject3(task.inputJson);
  const lines = [
    "# Handoff Snapshot",
    "",
    `Task queue id: ${task.id}`,
    `Agent: ${task.agentId}`,
    `Runtime: ${task.runtimeId}`,
    input.provider ? `Provider: ${input.provider}` : "",
    input.sessionId ? `Provider session at failure: ${input.sessionId}` : "",
    input.workDir ? `Runtime-local workDir: ${input.workDir}` : "",
    "",
    "## Current Task Goal",
    readString2(payload.title) ?? readString2(payload.channelMessage) ?? task.issueId ?? task.id,
    "",
    "## Failure",
    input.errorCode ? `Error code: ${input.errorCode}` : "",
    input.errorCategory ? `Error category: ${input.errorCategory}` : "",
    truncateSummary(input.errorText) ?? input.errorText,
    input.rawProviderMessage ? `Provider detail: ${truncateSummary(input.rawProviderMessage)}` : "",
    "",
    "## Continuation Guidance",
    "- Treat provider hidden state, provider session id, credentials, and runtime-local workDir as non-portable unless the next attempt is on the same runtime and provider.",
    "- Rebuild context from AgentSpace messages, router events, knowledge, documents, attachments, and formal output records.",
    "- Continue from the task goal above and explicitly call out any missing runtime-local artifact if it was not promoted to formal storage."
  ];
  return lines.filter((line) => line !== "").join("\n");
}
function readResultSummary(resultJson) {
  if (!resultJson) {
    return void 0;
  }
  return truncateSummary(readString2(resultJson.output) ?? readString2(resultJson.summary));
}
function mergeJsonObject(json, patch) {
  return {
    ...safeParseJsonObject3(json),
    ...dropUndefined(patch)
  };
}
function dropUndefined(input) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
function safeParseJsonObject3(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function readStringFromTaskInput(inputJson, key) {
  return readString2(safeParseJsonObject3(inputJson)[key]);
}
function readObjectArray(value) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
function readString2(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function readDaemonProvider(value) {
  return typeof value === "string" && isDaemonProvider(value) ? value : void 0;
}
function truncateSummary(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return void 0;
  }
  return compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
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

// ../db/src/task-messages.ts
function appendTaskMessageSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const currentSeqRow = db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM task_message WHERE task_id = ?").get(input.taskId);
  const seq = typeof currentSeqRow?.seq === "number" ? currentSeqRow.seq + 1 : 1;
  const messageId = `task-msg-${randomLikeId()}`;
  db.prepare(
    `INSERT INTO task_message (
      id,
      task_id,
      seq,
      type,
      tool,
      content,
      input_json,
      output,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    messageId,
    input.taskId,
    seq,
    input.type,
    input.tool ?? null,
    input.content ?? null,
    input.inputJson ? JSON.stringify(input.inputJson) : null,
    input.output ?? null,
    now
  );
  const row = db.prepare(
    `SELECT
        id,
        task_id AS taskId,
        seq,
        type,
        tool,
        content,
        input_json AS inputJson,
        output,
        created_at AS createdAt
      FROM task_message
      WHERE id = ?`
  ).get(messageId);
  const mapped = mapTaskMessageRecord(row);
  if (!mapped) {
    throw new Error(`Task message "${messageId}" could not be read back.`);
  }
  recordTaskMessageExecutionEvent(mapped);
  return mapped;
}
function listTaskMessagesForTaskSync(taskId) {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT
        id,
        task_id AS taskId,
        seq,
        type,
        tool,
        content,
        input_json AS inputJson,
        output,
        created_at AS createdAt
      FROM task_message
      WHERE task_id = ?
      ORDER BY seq ASC`
  ).all(taskId);
  return rows.map((row) => mapTaskMessageRecord(row)).filter((row) => row !== null);
}
function mapTaskMessageRecord(value) {
  if (typeof value.id !== "string" || typeof value.taskId !== "string" || typeof value.seq !== "number" || typeof value.type !== "string" || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    id: value.id,
    taskId: value.taskId,
    seq: value.seq,
    type: value.type,
    tool: typeof value.tool === "string" ? value.tool : void 0,
    content: typeof value.content === "string" ? value.content : void 0,
    inputJson: typeof value.inputJson === "string" ? value.inputJson : void 0,
    output: typeof value.output === "string" ? value.output : void 0,
    createdAt: value.createdAt
  };
}
function recordTaskMessageExecutionEvent(message) {
  const task = readQueuedTaskSync(message.taskId);
  if (!task) {
    return;
  }
  const event = deriveTaskMessageExecutionEvent(message);
  if (!event) {
    return;
  }
  const context = buildTaskExecutionEventContext(task);
  recordTaskExecutionEventSync({
    ...context,
    ...event,
    data: {
      triggerType: context.triggerType,
      issueId: context.issueId,
      taskTitle: context.taskTitle,
      taskMessageId: message.id,
      taskMessageSeq: message.seq,
      messageType: message.type,
      tool: message.tool
    }
  });
}
function deriveTaskMessageExecutionEvent(message) {
  const tool = message.tool ?? "tool";
  if (message.type === "tool_use") {
    return {
      type: "tool_started",
      title: `${tool} started`,
      summary: truncateUserFacingSummary(message.content),
      status: "running"
    };
  }
  if (message.type === "tool_result") {
    return {
      type: "tool_finished",
      title: `${tool} finished`,
      summary: truncateUserFacingSummary(message.content ?? message.output),
      status: "succeeded"
    };
  }
  if (message.type === "error") {
    return {
      type: "blocked",
      title: "Runtime reported an error",
      summary: truncateUserFacingSummary(message.content ?? message.output),
      severity: "error",
      status: "failed"
    };
  }
  if (message.type === "text") {
    return {
      type: "message_posted",
      title: "Agent response captured",
      summary: truncateUserFacingSummary(message.content ?? message.output),
      status: "succeeded"
    };
  }
  if (message.type === "status" && /^Task started on\b/i.test(message.content ?? "")) {
    return {
      type: "context_loaded",
      title: "Provider context loaded",
      summary: truncateUserFacingSummary(message.content),
      status: "running"
    };
  }
  return null;
}
function truncateUserFacingSummary(value) {
  if (!value) {
    return void 0;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return void 0;
  }
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

// ../db/src/token-usage.ts
var DEFAULT_PRICING = [
  { modelId: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", inputPer1M: 0.8, outputPer1M: 4 },
  { modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", inputPer1M: 3, outputPer1M: 15 },
  { modelId: "claude-opus-4-6", displayName: "Claude Opus 4.6", inputPer1M: 15, outputPer1M: 75 },
  { modelId: "gpt-4o", displayName: "GPT-4o", inputPer1M: 2.5, outputPer1M: 10 },
  { modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPer1M: 0.15, outputPer1M: 0.6 },
  { modelId: "o3", displayName: "o3", inputPer1M: 2, outputPer1M: 8 },
  { modelId: "codex-mini", displayName: "Codex Mini", inputPer1M: 1.5, outputPer1M: 6 },
  { modelId: "gemini-2.0-flash-lite", displayName: "Gemini 2.0 Flash Lite", inputPer1M: 0.075, outputPer1M: 0.3 },
  { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputPer1M: 1.25, outputPer1M: 10 },
  { modelId: "opencode-default", displayName: "OpenCode Default (configure pricing)", inputPer1M: 0, outputPer1M: 0 },
  { modelId: "nanobot-default", displayName: "NanoBot Default (configure pricing)", inputPer1M: 0, outputPer1M: 0 }
];
function ensureDefaultPricingSync() {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = db.prepare("SELECT COUNT(*) AS count FROM model_pricing").get();
  if (existing.count > 0) return;
  const stmt = db.prepare(
    `INSERT INTO model_pricing (model_id, display_name, input_per_1m, output_per_1m, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(model_id) DO NOTHING`
  );
  for (const p of DEFAULT_PRICING) {
    stmt.run(p.modelId, p.displayName, p.inputPer1M, p.outputPer1M, now);
  }
}
function listModelPricingSync() {
  const db = getDatabase();
  ensureDefaultPricingSync();
  const rows = db.prepare("SELECT * FROM model_pricing ORDER BY input_per_1m ASC").all();
  return rows.map((row) => ({
    modelId: row.model_id,
    displayName: row.display_name,
    inputPer1M: row.input_per_1m,
    outputPer1M: row.output_per_1m,
    updatedAt: row.updated_at
  }));
}
function readModelPricingSync(modelId) {
  const db = getDatabase();
  ensureDefaultPricingSync();
  const row = db.prepare("SELECT * FROM model_pricing WHERE model_id = ?").get(modelId);
  if (!row) return void 0;
  return {
    modelId: row.model_id,
    displayName: row.display_name,
    inputPer1M: row.input_per_1m,
    outputPer1M: row.output_per_1m,
    updatedAt: row.updated_at
  };
}
function computeCostUsd(inputTokens, outputTokens, pricing) {
  return inputTokens / 1e6 * pricing.inputPer1M + outputTokens / 1e6 * pricing.outputPer1M;
}
function recordTokenUsageSync(input) {
  const db = getDatabase();
  const id = randomLikeId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const pricing = readModelPricingSync(input.modelId);
  const costUsd = pricing ? computeCostUsd(input.inputTokens, input.outputTokens, pricing) : 0;
  const workspaceId = input.workspaceId ?? readWorkspaceIdForTaskQueueSync(input.taskQueueId) ?? DEFAULT_WORKSPACE_ID;
  db.prepare(
    `INSERT INTO token_usage (id, workspace_id, task_queue_id, agent_id, model_id, input_tokens, output_tokens, cost_usd, channel_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, input.taskQueueId, input.agentId, input.modelId, input.inputTokens, input.outputTokens, costUsd, input.channelName ?? null, now);
  return {
    id,
    workspaceId,
    taskQueueId: input.taskQueueId,
    agentId: input.agentId,
    modelId: input.modelId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd,
    channelName: input.channelName,
    createdAt: now
  };
}
function listTokenUsageSync(filters) {
  const db = getDatabase();
  const conditions = [];
  const params = [];
  conditions.push("workspace_id = ?");
  params.push(filters?.workspaceId ?? DEFAULT_WORKSPACE_ID);
  if (filters?.agentId) {
    conditions.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters?.channelName) {
    conditions.push("channel_name = ?");
    params.push(filters.channelName);
  }
  if (filters?.since) {
    conditions.push("created_at >= ?");
    params.push(filters.since);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM token_usage ${where} ORDER BY created_at DESC`).all(...params);
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    taskQueueId: row.task_queue_id,
    agentId: row.agent_id,
    modelId: row.model_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    channelName: row.channel_name ?? void 0,
    createdAt: row.created_at
  }));
}
function getAgentCostSummarySync(agentId, since, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const params = [workspaceId, agentId];
  let dateFilter = "";
  if (since) {
    dateFilter = " AND created_at >= ?";
    params.push(since);
  }
  const row = db.prepare(
    `SELECT COALESCE(SUM(input_tokens), 0) AS total_input,
            COALESCE(SUM(output_tokens), 0) AS total_output,
            COALESCE(SUM(cost_usd), 0) AS total_cost,
            COUNT(*) AS task_count
     FROM token_usage WHERE workspace_id = ? AND agent_id = ?${dateFilter}`
  ).get(...params);
  return {
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    totalCostUsd: row.total_cost,
    taskCount: row.task_count
  };
}
function getWorkspaceCostSummarySync(since, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const params = [workspaceId];
  let dateFilter = " WHERE workspace_id = ?";
  if (since) {
    dateFilter += " AND created_at >= ?";
    params.push(since);
  }
  const rows = db.prepare(
    `SELECT agent_id, model_id,
            COALESCE(SUM(input_tokens), 0) AS total_input,
            COALESCE(SUM(output_tokens), 0) AS total_output,
            COALESCE(SUM(cost_usd), 0) AS total_cost,
            COUNT(*) AS task_count
     FROM token_usage${dateFilter}
     GROUP BY agent_id, model_id
     ORDER BY total_cost DESC`
  ).all(...params);
  return rows.map((row) => ({
    agentId: row.agent_id,
    modelId: row.model_id,
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    totalCostUsd: row.total_cost,
    taskCount: row.task_count
  }));
}
function readWorkspaceIdForTaskQueueSync(taskQueueId) {
  const db = getDatabase();
  const row = db.prepare(
    "SELECT workspace_id AS workspaceId FROM agent_task_queue WHERE id = ?"
  ).get(taskQueueId);
  return typeof row?.workspaceId === "string" ? row.workspaceId : null;
}

// ../db/src/budgets.ts
function upsertBudgetSync(input) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const period = input.period ?? "monthly";
  const action = input.action ?? "warn";
  const warningThreshold = input.warningThreshold ?? 0.8;
  const createdBy = input.createdBy ?? "";
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const scopeId = normalizeBudgetScopeId(input.scope, input.scopeId, workspaceId);
  const existing = db.prepare(
    "SELECT id FROM budget WHERE workspace_id = ? AND scope = ? AND scope_id = ?"
  ).get(workspaceId, input.scope, scopeId);
  if (existing) {
    db.prepare(
      `UPDATE budget SET limit_usd = ?, period = ?, action = ?, warning_threshold = ?, updated_at = ?, created_by = ?
       WHERE id = ?`
    ).run(input.limitUsd, period, action, warningThreshold, now, createdBy, existing.id);
    return readBudgetByIdSync(existing.id, workspaceId);
  }
  const id = randomLikeId();
  db.prepare(
    `INSERT INTO budget (id, workspace_id, scope, scope_id, limit_usd, period, action, warning_threshold, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(id, workspaceId, input.scope, scopeId, input.limitUsd, period, action, warningThreshold, createdBy, now, now);
  return readBudgetByIdSync(id, workspaceId);
}
function readBudgetByIdSync(id, workspaceId) {
  const db = getDatabase();
  const row = workspaceId ? db.prepare("SELECT * FROM budget WHERE id = ? AND workspace_id = ?").get(id, workspaceId) : db.prepare("SELECT * FROM budget WHERE id = ?").get(id);
  return row ? mapBudgetRow(row) : void 0;
}
function readBudgetSync(scope, scopeId, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const normalizedScopeId = normalizeBudgetScopeId(scope, scopeId, workspaceId);
  const row = db.prepare(
    "SELECT * FROM budget WHERE workspace_id = ? AND scope = ? AND scope_id = ?"
  ).get(workspaceId, scope, normalizedScopeId);
  return row ? mapBudgetRow(row) : void 0;
}
function listBudgetsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM budget WHERE workspace_id = ? ORDER BY scope, scope_id"
  ).all(workspaceId);
  return rows.map(mapBudgetRow);
}
function toggleBudgetSync(id, enabled, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  db.prepare("UPDATE budget SET enabled = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").run(
    enabled ? 1 : 0,
    (/* @__PURE__ */ new Date()).toISOString(),
    id,
    workspaceId
  );
}
function deleteBudgetSync(id, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  db.prepare("DELETE FROM budget WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
}
function getSpentUsdSync(scope, scopeId, since, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  let query;
  const params = [];
  if (scope === "workspace") {
    query = "SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM token_usage WHERE workspace_id = ?";
    params.push(workspaceId);
    if (since) {
      query += " AND created_at >= ?";
      params.push(since);
    }
  } else if (scope === "agent") {
    query = "SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM token_usage WHERE workspace_id = ? AND agent_id = ?";
    params.push(workspaceId);
    params.push(scopeId);
    if (since) {
      query += " AND created_at >= ?";
      params.push(since);
    }
  } else {
    query = "SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM token_usage WHERE workspace_id = ? AND channel_name = ?";
    params.push(workspaceId);
    params.push(scopeId);
    if (since) {
      query += " AND created_at >= ?";
      params.push(since);
    }
  }
  const row = db.prepare(query).get(...params);
  return row.spent;
}
function getMonthStartIso() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
function mapBudgetRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    scope: row.scope,
    scopeId: row.scope_id,
    limitUsd: row.limit_usd,
    period: row.period,
    action: row.action,
    warningThreshold: row.warning_threshold,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function normalizeBudgetScopeId(scope, scopeId, workspaceId) {
  if (scope === "workspace") {
    return workspaceId;
  }
  return scopeId;
}

// ../db/src/workspaces.ts
import { randomBytes as randomBytes2 } from "node:crypto";
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
  const bytes = randomBytes2(JOIN_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }
  return code;
}
function normalizeWorkspaceJoinCode(joinCode) {
  return joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function hardDeleteWorkspaceSync(id) {
  if (id === DEFAULT_WORKSPACE_ID) {
    throw new Error(`Cannot hard-delete the default workspace "${DEFAULT_WORKSPACE_ID}".`);
  }
  const db = getDatabase();
  return withTransaction(db, () => {
    const removedTaskMessageRows = Number(
      db.prepare(
        `DELETE FROM task_message
         WHERE task_id IN (
           SELECT id
           FROM agent_task_queue
           WHERE workspace_id = ?
         )`
      ).run(id).changes
    );
    const removedTokenUsageRows = Number(
      db.prepare("DELETE FROM token_usage WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentRouterEventRows = Number(
      db.prepare("DELETE FROM agent_router_event WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentRouterContextSnapshotRows = Number(
      db.prepare("DELETE FROM agent_router_context_snapshot WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentTaskAttemptRows = Number(
      db.prepare("DELETE FROM agent_task_attempt WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentRouterProviderSessionRows = Number(
      db.prepare("DELETE FROM agent_router_provider_session WHERE workspace_id = ?").run(id).changes
    );
    const removedQueuedTaskRows = Number(
      db.prepare("DELETE FROM agent_task_queue WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentRouterSessionRows = Number(
      db.prepare("DELETE FROM agent_router_session WHERE workspace_id = ?").run(id).changes
    );
    const removedBindingRows = Number(
      db.prepare("DELETE FROM employee_runtime_binding WHERE workspace_id = ?").run(id).changes
    );
    const removedRuntimeGrantRows = Number(
      db.prepare("DELETE FROM workspace_runtime_grant WHERE workspace_id = ?").run(id).changes
    );
    const removedDocumentAgentAccessRows = Number(
      db.prepare("DELETE FROM document_agent_access WHERE workspace_id = ?").run(id).changes
    );
    const removedDocumentPermissionRequestRows = Number(
      db.prepare("DELETE FROM document_permission_request WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentAccessRequestRows = Number(
      db.prepare("DELETE FROM agent_access_request WHERE workspace_id = ?").run(id).changes
    );
    const removedKnowledgeProposalRows = Number(
      db.prepare("DELETE FROM knowledge_proposal WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentForkSnapshotRows = Number(
      db.prepare("DELETE FROM agent_fork_snapshot WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentForkInvitationRows = Number(
      db.prepare("DELETE FROM agent_fork_invitation WHERE workspace_id = ?").run(id).changes
    );
    const removedNotificationRows = Number(
      db.prepare("DELETE FROM workspace_notification WHERE workspace_id = ?").run(id).changes
    );
    const removedRuntimeDisplayNameRows = Number(
      db.prepare("DELETE FROM workspace_runtime_display_name WHERE workspace_id = ?").run(id).changes
    );
    const removedRuntimeRows = Number(
      db.prepare("DELETE FROM agent_runtime WHERE workspace_id = ?").run(id).changes
    );
    const removedDaemonRows = Number(
      db.prepare("DELETE FROM daemon_connection WHERE workspace_id = ?").run(id).changes
    );
    const removedDaemonTokenRows = Number(
      db.prepare("DELETE FROM daemon_api_token WHERE workspace_id = ?").run(id).changes
    );
    const removedTaskRows = Number(
      db.prepare("DELETE FROM workspace_task WHERE workspace_id = ?").run(id).changes
    );
    const removedChannelRows = Number(
      db.prepare("DELETE FROM workspace_channel WHERE workspace_id = ?").run(id).changes
    );
    const removedEmployeeRows = Number(
      db.prepare("DELETE FROM workspace_employee WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentSkillRows = Number(
      db.prepare("DELETE FROM agent_skill WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentKnowledgePageRows = Number(
      db.prepare("DELETE FROM agent_knowledge_page WHERE workspace_id = ?").run(id).changes
    );
    const removedKnowledgeAssignmentPolicyRows = Number(
      db.prepare("DELETE FROM knowledge_page_assignment_policy WHERE workspace_id = ?").run(id).changes
    );
    const removedSkillImportEventRows = Number(
      db.prepare("DELETE FROM skill_import_event WHERE workspace_id = ?").run(id).changes
    );
    const removedBudgetRows = Number(
      db.prepare("DELETE FROM budget WHERE workspace_id = ?").run(id).changes
    );
    const removedSkillRows = Number(
      db.prepare("DELETE FROM skill WHERE workspace_id = ?").run(id).changes
    );
    const removedMembershipRows = Number(
      db.prepare("DELETE FROM workspace_membership WHERE workspace_id = ?").run(id).changes
    );
    const removedInvitationRows = Number(
      db.prepare("DELETE FROM workspace_invitation WHERE workspace_id = ?").run(id).changes
    );
    const removedAgentGoogleWorkspaceDelegationRows = Number(
      db.prepare("DELETE FROM agent_google_workspace_delegation WHERE workspace_id = ?").run(id).changes
    );
    const removedGoogleOAuthCredentialRows = Number(
      db.prepare("DELETE FROM google_oauth_credential WHERE workspace_id = ?").run(id).changes
    );
    const removedWorkspaceSnapshotRows = Number(
      db.prepare("DELETE FROM workspace_snapshot WHERE id = ?").run(id).changes
    );
    const removedWorkspaceRows = Number(
      db.prepare("DELETE FROM workspace WHERE id = ?").run(id).changes
    );
    return {
      deletedWorkspace: removedWorkspaceRows > 0,
      removedWorkspaceRows,
      removedWorkspaceSnapshotRows,
      removedMembershipRows,
      removedInvitationRows,
      removedGoogleOAuthCredentialRows,
      removedAgentGoogleWorkspaceDelegationRows,
      removedChannelRows,
      removedEmployeeRows,
      removedTaskRows,
      removedDaemonRows,
      removedDaemonTokenRows,
      removedRuntimeRows,
      removedRuntimeDisplayNameRows,
      removedRuntimeGrantRows,
      removedDocumentAgentAccessRows,
      removedDocumentPermissionRequestRows,
      removedAgentAccessRequestRows,
      removedKnowledgeProposalRows,
      removedAgentForkInvitationRows,
      removedAgentForkSnapshotRows,
      removedNotificationRows,
      removedBindingRows,
      removedAgentRouterProviderSessionRows,
      removedAgentTaskAttemptRows,
      removedAgentRouterEventRows,
      removedAgentRouterContextSnapshotRows,
      removedAgentRouterSessionRows,
      removedQueuedTaskRows,
      removedTaskMessageRows,
      removedTokenUsageRows,
      removedSkillRows,
      removedAgentSkillRows,
      removedKnowledgeAssignmentPolicyRows,
      removedAgentKnowledgePageRows,
      removedSkillImportEventRows,
      removedBudgetRows
    };
  });
}

// ../db/src/workspace-memberships.ts
function readWorkspaceMembershipSync(workspaceId, userId) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT id, workspace_id, user_id, role, status, joined_at, invited_by
     FROM workspace_membership
     WHERE workspace_id = ? AND user_id = ? AND status = 'active'`
  ).get(workspaceId, userId) ?? null;
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by ?? void 0
  };
}

// ../db/src/workspace-invitations.ts
var DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;

// ../db/src/channel-access.ts
var CHANNEL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function readChannelParticipantSync(workspaceId, channelName, userId, options) {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      channel_name AS channelName,
      user_id AS userId,
      status,
      added_by AS addedBy,
      joined_at AS joinedAt,
      removed_at AS removedAt,
      updated_at AS updatedAt
     FROM channel_participant
     WHERE workspace_id = ? AND channel_name = ? AND user_id = ?
       AND (? = 1 OR status = 'active')`
  ).get(workspaceId, channelName, userId, options?.includeRemoved ? 1 : 0);
  return row ? mapChannelParticipantRecord(row) : null;
}
function listChannelParticipantsSync(workspaceId, channelName, options) {
  const db = getDatabase();
  const conditions = ["workspace_id = ?", "channel_name = ?"];
  const params = [workspaceId, channelName];
  const statuses = options?.statuses?.length ? options.statuses : ["active"];
  conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
  params.push(...statuses);
  if (options?.userId) {
    conditions.push("user_id = ?");
    params.push(options.userId);
  }
  const rows = db.prepare(
    `SELECT
      id,
      workspace_id AS workspaceId,
      channel_name AS channelName,
      user_id AS userId,
      status,
      added_by AS addedBy,
      joined_at AS joinedAt,
      removed_at AS removedAt,
      updated_at AS updatedAt
     FROM channel_participant
     WHERE ${conditions.join(" AND ")}
     ORDER BY joined_at ASC, user_id ASC`
  ).all(...params);
  return rows.map(mapChannelParticipantRecord).filter((record) => record !== null);
}
function mapChannelParticipantRecord(row) {
  if (typeof row.id !== "string" || typeof row.workspaceId !== "string" || typeof row.channelName !== "string" || typeof row.userId !== "string" || row.status !== "active" && row.status !== "removed" || typeof row.joinedAt !== "string" || typeof row.updatedAt !== "string") {
    return null;
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelName: row.channelName,
    userId: row.userId,
    status: row.status,
    addedBy: typeof row.addedBy === "string" ? row.addedBy : void 0,
    joinedAt: row.joinedAt,
    removedAt: typeof row.removedAt === "string" ? row.removedAt : void 0,
    updatedAt: row.updatedAt
  };
}

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
function deleteStoredChannelSync(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const result = db.prepare(
    `DELETE FROM workspace_channel
     WHERE workspace_id = ? AND name = ?`
  ).run(workspaceId, channelName);
  return result.changes > 0;
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
function updateStoredTaskSync(taskId, next, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.prepare(
    `UPDATE workspace_task
     SET title = ?,
         channel_name = ?,
         assignee = ?,
         priority = ?,
         status = ?,
         sort_order = ?,
         labels_json = ?,
         version = version + 1,
         updated_at = ?
     WHERE workspace_id = ? AND id = ?`
  ).run(
    next.title,
    next.channel,
    next.assignee,
    next.priority,
    next.status,
    next.sortOrder ?? null,
    JSON.stringify(next.labels ?? []),
    now,
    workspaceId,
    taskId
  );
  if (result.changes === 0) {
    return null;
  }
  return readStoredTaskSync(taskId, workspaceId);
}
function deleteStoredTasksForChannelSync(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  db.prepare(
    `DELETE FROM workspace_task
     WHERE workspace_id = ? AND channel_name = ?`
  ).run(workspaceId, channelName);
}
function renameStoredTasksChannelSync(channelName, nextName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `UPDATE workspace_task
     SET channel_name = ?,
         version = version + 1,
         updated_at = ?
     WHERE workspace_id = ? AND channel_name = ?`
  ).run(nextName, now, workspaceId, channelName);
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
import { existsSync as existsSync4 } from "node:fs";
import { basename, extname, join as join4, resolve as resolve4 } from "node:path";
var STATE_DIR = "data";
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
function resolveRepositoryRoot3() {
  const candidates = [
    process.env.AGENT_SPACE_REPOSITORY_ROOT,
    /*turbopackIgnore: true*/
    process.cwd(),
    join4(
      /*turbopackIgnore: true*/
      process.cwd(),
      ".."
    ),
    join4(
      /*turbopackIgnore: true*/
      process.cwd(),
      "..",
      ".."
    )
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    const resolved = resolve4(candidate);
    if (existsSync4(
      /*turbopackIgnore: true*/
      join4(resolved, "Target.md")
    )) {
      return resolved;
    }
  }
  return (
    /*turbopackIgnore: true*/
    process.cwd()
  );
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
import { existsSync as existsSync6, readFileSync as readFileSync3, readdirSync, rmSync as rmSync3, statSync as statSync2 } from "node:fs";
import { basename as basename2, join as join7, resolve as resolve5 } from "node:path";

// ../services/src/shared/conversation-execution-workspaces.ts
function buildConversationExecutionWorkspaceKey(input) {
  const kind = input.conversationKind ?? "group";
  return `${kind}:${input.channelName}:${input.agentId}`;
}
function resolveConversationExecutionWorkspacePath(input) {
  return getDaemonChannelWorkDirPath(getLocalDaemonStateDirPath(), {
    workspaceId: input.workspaceId,
    threadId: input.channelName,
    agentId: input.agentId
  });
}
function readConversationExecutionWorkspaceState(state, input) {
  const conversationKey = buildConversationExecutionWorkspaceKey({
    conversationKind: input.contactId ? "direct" : "group",
    channelName: input.channelName,
    agentId: input.agentId
  });
  const existing = state.conversationExecutionWorkspaces?.find((workspace) => workspace.conversationKey === conversationKey);
  if (existing) {
    return existing;
  }
  const contactId = input.contactId;
  if (!contactId) {
    return void 0;
  }
  const legacyDirectConversation = state.directConversations.find((conversation) => sameValue(conversation.contactId, contactId));
  if (!legacyDirectConversation) {
    return void 0;
  }
  return {
    conversationKey,
    conversationKind: "direct",
    channelName: input.channelName,
    agentId: input.agentId,
    contactId,
    humanMemberName: legacyDirectConversation.humanMemberName,
    updatedAt: legacyDirectConversation.updatedAt,
    sessionId: legacyDirectConversation.sessionId,
    workDir: legacyDirectConversation.workDir
  };
}
function upsertConversationExecutionWorkspaceState(state, input) {
  const updatedAt = input.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const conversationKey = buildConversationExecutionWorkspaceKey({
    conversationKind: input.contactId ? "direct" : "group",
    channelName: input.channelName,
    agentId: input.agentId
  });
  const conversationKind = input.contactId ? "direct" : "group";
  const currentList = state.conversationExecutionWorkspaces ?? [];
  const existingIndex = currentList.findIndex((workspace) => workspace.conversationKey === conversationKey);
  const existing = existingIndex >= 0 ? currentList[existingIndex] : void 0;
  const nextWorkspace = {
    conversationKey,
    conversationKind,
    channelName: input.channelName,
    agentId: input.agentId,
    contactId: input.contactId ?? existing?.contactId,
    humanMemberName: input.humanMemberName ?? existing?.humanMemberName,
    updatedAt,
    lastTaskQueueId: input.lastTaskQueueId ?? existing?.lastTaskQueueId,
    sessionId: input.sessionId === null ? void 0 : input.sessionId ?? existing?.sessionId,
    workDir: input.workDir === null ? void 0 : input.workDir ?? existing?.workDir,
    lastError: input.lastError === null ? void 0 : input.lastError ?? existing?.lastError,
    autoContinuation: input.autoContinuation === null ? void 0 : input.autoContinuation ?? existing?.autoContinuation
  };
  const nextList = currentList.filter((workspace) => workspace.conversationKey !== conversationKey);
  nextList.unshift(nextWorkspace);
  state.conversationExecutionWorkspaces = nextList;
  return nextWorkspace;
}
function writeConversationExecutionWorkspaceStateSync(input, workspaceId, stateArg) {
  const state = stateArg ?? ensureWorkspaceStateSync(workspaceId);
  upsertConversationExecutionWorkspaceState(state, input);
  return stateArg ? state : writeWorkspaceStateSync(state, workspaceId);
}

// ../services/src/shared/messaging.ts
import { appendFileSync, existsSync as existsSync5, renameSync, rmSync, writeFileSync } from "node:fs";
import { join as join5 } from "node:path";

// ../services/src/documents/runs.ts
function createChannelDocumentRun(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const run = {
    id: `channel-doc-run-${createOpaqueId2()}`,
    channelName: input.channelName,
    sourceMessageId: input.sourceMessageId,
    sourceSummary: input.sourceSummary,
    mode: input.plan.mode,
    status: input.plan.mode === "parallel" ? "running" : "pending",
    createdAt: now,
    updatedAt: now
  };
  const stepIdMap = new Map(input.plan.steps.map((step) => [step.id, `channel-doc-run-step-${createOpaqueId2()}`]));
  const steps = input.plan.steps.map((step) => {
    const dependsOnStepIds = step.dependsOnStepIds.map((dependsOnStepId) => stepIdMap.get(dependsOnStepId)).filter((dependsOnStepId) => typeof dependsOnStepId === "string");
    return {
      id: stepIdMap.get(step.id),
      runId: run.id,
      agentId: step.agentId,
      agentLabel: step.agentLabel,
      instruction: step.instruction,
      dependsOnStepIds,
      handoffKind: step.handoffKind,
      status: dependsOnStepIds.length > 0 ? "pending" : "ready",
      createdAt: now,
      updatedAt: now
    };
  });
  input.state.channelDocumentRuns.unshift(run);
  input.state.channelDocumentRunSteps.unshift(...steps);
  return { state: input.state, run, steps };
}
function listChannelDocumentRunSteps(state, runId) {
  return state.channelDocumentRunSteps.filter((step) => step.runId === runId).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
function findChannelDocumentRunStepByQueuedTaskId(state, queuedTaskId) {
  return state.channelDocumentRunSteps.find((step) => step.queuedTaskId === queuedTaskId) ?? null;
}
function markChannelDocumentRunStepQueued(state, stepId, queuedTaskId) {
  const step = requireChannelDocumentRunStep(state, stepId);
  step.status = "queued";
  step.queuedTaskId = queuedTaskId;
  step.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  touchChannelDocumentRun(state, step.runId);
  return step;
}
function markChannelDocumentRunStepRunning(state, stepId) {
  const step = requireChannelDocumentRunStep(state, stepId);
  step.status = "running";
  step.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const run = requireChannelDocumentRun(state, step.runId);
  run.status = "running";
  run.updatedAt = step.updatedAt;
  return step;
}
function markChannelDocumentRunStepCompleted(state, input) {
  const step = requireChannelDocumentRunStep(state, input.stepId);
  step.status = input.warningText ? "completed_with_warning" : "completed";
  step.documentId = input.documentUpdates?.[0]?.documentId;
  step.documentVersionId = input.documentUpdates?.[0]?.documentVersionId;
  step.lastWarning = input.warningText?.trim() || void 0;
  step.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const run = requireChannelDocumentRun(state, step.runId);
  run.updatedAt = step.updatedAt;
  const steps = listChannelDocumentRunSteps(state, run.id);
  const readySteps = [];
  for (const candidate of steps) {
    if (candidate.status !== "pending" && candidate.status !== "ready") {
      continue;
    }
    const allDepsCompleted = candidate.dependsOnStepIds.every(
      (dependsOnStepId) => steps.some(
        (dependency) => dependency.id === dependsOnStepId && (dependency.status === "completed" || dependency.status === "completed_with_warning")
      )
    );
    if (!allDepsCompleted) {
      continue;
    }
    candidate.status = "ready";
    candidate.updatedAt = step.updatedAt;
    readySteps.push(candidate);
  }
  if (steps.every((candidate) => candidate.status === "completed" || candidate.status === "completed_with_warning")) {
    run.status = steps.some((candidate) => candidate.status === "completed_with_warning") ? "completed_with_warning" : "completed";
  }
  return { step, run, readySteps };
}
function markChannelDocumentRunStepFailed(state, stepId, errorText) {
  const step = requireChannelDocumentRunStep(state, stepId);
  step.status = "failed";
  step.lastError = errorText;
  step.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const run = requireChannelDocumentRun(state, step.runId);
  run.status = "failed";
  run.updatedAt = step.updatedAt;
  return { step, run };
}
function normalizeChannelDocumentRuns(runs, fallback) {
  if (!Array.isArray(runs)) {
    return fallback;
  }
  return runs.map((run) => normalizeChannelDocumentRun(run)).filter((run) => run !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
function normalizeChannelDocumentRunSteps(steps, fallback) {
  if (!Array.isArray(steps)) {
    return fallback;
  }
  return steps.map((step) => normalizeChannelDocumentRunStep(step)).filter((step) => step !== null).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
function normalizeChannelDocumentRun(run) {
  if (!run || typeof run !== "object") {
    return null;
  }
  const candidate = run;
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
function requireChannelDocumentRun(state, runId) {
  const run = state.channelDocumentRuns.find((item) => item.id === runId);
  if (!run) {
    throw new Error(`Channel document run "${runId}" does not exist.`);
  }
  return run;
}
function requireChannelDocumentRunStep(state, stepId) {
  const step = state.channelDocumentRunSteps.find((item) => item.id === stepId);
  if (!step) {
    throw new Error(`Channel document run step "${stepId}" does not exist.`);
  }
  return step;
}
function touchChannelDocumentRun(state, runId) {
  const run = requireChannelDocumentRun(state, runId);
  run.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
function createOpaqueId2() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ../services/src/runtime-access/runtime-access.ts
function isWorkspaceAdminOrOwnerSync(input) {
  if (!input.userId) {
    return false;
  }
  const membership = readWorkspaceMembershipSync(input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.userId);
  return membership?.role === "owner" || membership?.role === "admin";
}
function canUseRuntimeForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (!runtimeBelongsToWorkspaceSync(workspaceId, input.runtimeId)) {
    return false;
  }
  if (isWorkspaceAdminOrOwnerSync({ workspaceId, userId: input.actorUserId })) {
    return true;
  }
  if (!input.actorUserId) {
    return false;
  }
  return canUserUseRuntimeSync(workspaceId, input.runtimeId, input.actorUserId);
}
function assertCanUseRuntimeForActorSync(input) {
  if (!canUseRuntimeForActorSync(input)) {
    throw new Error("The selected runtime is not available to this user.");
  }
}
function canManageEmployeeForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (isWorkspaceAdminOrOwnerSync({ workspaceId, userId: input.actorUserId })) {
    return true;
  }
  if (!input.actorUserId) {
    return false;
  }
  const employee = readStoredEmployeeSync(input.employeeName, workspaceId);
  return employee?.ownerUserId === input.actorUserId;
}
function assertCanManageEmployeeForActorSync(input) {
  if (!canManageEmployeeForActorSync(input)) {
    throw new Error("This agent is not managed by the current user.");
  }
}
function canUseEmployeeForActorSync(input) {
  return canManageEmployeeForActorSync(input);
}
function canUseEmployeeInChannelForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (canUseEmployeeForActorSync({
    workspaceId,
    employeeName: input.employeeName,
    actorUserId: input.actorUserId
  })) {
    return true;
  }
  return canUseChannelEnabledEmployeeInChannelForActorSync(input);
}
function canUseChannelEnabledEmployeeInChannelForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (!input.actorUserId) {
    return false;
  }
  const state = ensureWorkspaceStateSync(workspaceId);
  const employee = state.activeEmployees.find((item) => sameValue(item.name, input.employeeName));
  if (!employee) {
    return false;
  }
  if ((employee.channelMemberAccess ?? "enabled") !== "enabled") {
    return false;
  }
  if (!employee.channels.some((channelName) => sameValue(channelName, input.channelName))) {
    return false;
  }
  return canReadChannelForActorSync({
    workspaceId,
    channelName: input.channelName,
    actor: {
      userId: input.actorUserId,
      displayName: input.actorDisplayName,
      role: input.actorRole
    }
  });
}
function assertCanUseEmployeeInChannelForActorSync(input) {
  if (!canUseEmployeeInChannelForActorSync(input)) {
    throw new Error("This agent is not available to the current user.");
  }
}
function canUseEmployeeRuntimeForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (!canUseEmployeeForActorSync({ workspaceId, employeeName: input.employeeName, actorUserId: input.actorUserId })) {
    return false;
  }
  const binding = readEmployeeRuntimeBindingSync(input.employeeName, workspaceId);
  if (!binding) {
    return false;
  }
  return canUseRuntimeForActorSync({
    workspaceId,
    runtimeId: binding.runtimeId,
    actorUserId: input.actorUserId
  });
}
function canUseEmployeeRuntimeInChannelForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (canUseEmployeeRuntimeForActorSync({
    workspaceId,
    employeeName: input.employeeName,
    actorUserId: input.actorUserId
  })) {
    return true;
  }
  if (!canUseChannelEnabledEmployeeInChannelForActorSync(input)) {
    return false;
  }
  const binding = readEmployeeRuntimeBindingSync(input.employeeName, workspaceId);
  if (!binding) {
    return false;
  }
  return runtimeBelongsToWorkspaceSync(workspaceId, binding.runtimeId);
}
function assertCanUseBoundEmployeeRuntimeInChannelForActorSync(input) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const binding = readEmployeeRuntimeBindingSync(input.employeeName, workspaceId);
  if (!binding) {
    return;
  }
  if (canUseEmployeeRuntimeInChannelForActorSync(input)) {
    return;
  }
  throw new Error("This agent runtime is not available to the current user.");
}
function runtimeBelongsToWorkspaceSync(workspaceId, runtimeId) {
  const runtime = readAgentRuntimeSync(runtimeId.trim());
  return runtime?.workspaceId === workspaceId;
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
function buildMentionCandidates(state, channelName) {
  return state.activeEmployees.map((employee) => ({
    agentId: employee.name,
    label: employee.remarkName?.trim() || employee.name,
    aliases: [employee.name, employee.remarkName?.trim() || employee.name],
    inChannel: employee.channels.some((name) => sameValue(name, channelName))
  }));
}
function buildChannelHistorySnapshot(state, channelName) {
  return state.messages.filter((message) => sameValue(message.channel ?? "", channelName)).slice().reverse().map((message) => ({
    speaker: message.speaker,
    role: message.role,
    summary: message.summary,
    time: message.time,
    status: message.status,
    kind: message.kind,
    processType: message.processType,
    mentions: message.mentions?.map((item) => item.token) ?? [],
    attachments: message.attachments?.map((attachment) => attachment.fileName) ?? []
  }));
}
function enqueueChannelMentionStepSync(state, input) {
  const agent = state.activeEmployees.find((employee) => sameValue(employee.name, input.step.agentId));
  if (!agent) {
    return false;
  }
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (input.requesterUserId) {
    assertCanUseEmployeeInChannelForActorSync({
      workspaceId,
      employeeName: agent.name,
      channelName: input.channelName,
      actorUserId: input.requesterUserId,
      actorDisplayName: input.requesterDisplayName
    });
    assertCanUseBoundEmployeeRuntimeInChannelForActorSync({
      workspaceId,
      employeeName: agent.name,
      channelName: input.channelName,
      actorUserId: input.requesterUserId,
      actorDisplayName: input.requesterDisplayName
    });
  }
  const existingExecutionWorkspace = readConversationExecutionWorkspaceState(state, {
    channelName: input.channelName,
    agentId: agent.name
  });
  const lastExecution = readLatestChannelExecutionSync(agent.name, input.channelName, workspaceId);
  const resumedSessionId = existingExecutionWorkspace?.sessionId ?? lastExecution?.sessionId;
  const resumedWorkDir = existingExecutionWorkspace?.workDir ?? lastExecution?.workDir;
  const queued = enqueueNativeTaskSync({
    workspaceId,
    assignee: agent.name,
    title: `@\u63D0\u53CA \xB7 ${input.channelName} \xB7 ${input.step.agentLabel}`,
    channel: input.channelName,
    priority: "medium",
    triggerType: "mention_chat",
    requestedByUserId: input.requesterUserId,
    requestedByDisplayName: input.requesterDisplayName,
    metadata: {
      orchestrationRunId: input.step.runId,
      orchestrationStepId: input.step.id,
      stepInstruction: input.step.instruction,
      stepDependsOnIds: input.step.dependsOnStepIds,
      stepHandoffKind: input.step.handoffKind,
      handoffDocumentIds: input.handoffDocumentIds ?? [],
      handoffDocumentVersionIds: input.handoffDocumentVersionIds ?? [],
      sourceChannel: input.channelName,
      sourceMessageId: input.sourceMessage?.id,
      mentionType: "agent",
      mentionedAgentIds: input.mentionedAgentIds,
      mentionedAgentLabels: input.mentionedAgentLabels,
      assigneeMentionToken: input.step.agentLabel,
      channelName: input.channelName,
      channelMessage: input.fullMessage,
      channelHistory: buildChannelHistorySnapshot(state, input.channelName),
      channelHistoryPath: getChannelHistoryFilePath(input.channelName, workspaceId),
      channelSessionId: resumedSessionId,
      attachments: input.attachments?.map((attachment) => ({
        fileName: attachment.fileName,
        storedPath: attachment.storedPath,
        mediaType: attachment.mediaType,
        kind: attachment.kind
      })) ?? []
    }
  });
  if (!queued) {
    return false;
  }
  upsertConversationExecutionWorkspaceState(state, {
    channelName: input.channelName,
    agentId: agent.name,
    sessionId: resumedSessionId,
    workDir: resumedWorkDir ?? resolveConversationExecutionWorkspacePath({
      workspaceId,
      channelName: input.channelName,
      agentId: agent.name
    }),
    lastTaskQueueId: queued.id,
    lastError: null
  });
  markChannelDocumentRunStepQueued(state, input.step.id, queued.id);
  pushWorkspaceMessageToChannel(state, input.channelName, {
    speaker: agent.name,
    role: "agent",
    summary: "Thinking",
    code: "agent.pending",
    data: { agent_name: agent.name },
    status: "pending"
  }, workspaceId);
  return true;
}
function getChannelHistoryFilePath(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  return join5(getChannelHistoryDirPath(workspaceId), `${slugify(channelName)}.md`);
}
function renameChannelHistoryFile(previousName, nextName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const previousPath = getChannelHistoryFilePath(previousName, workspaceId);
  const nextPath = getChannelHistoryFilePath(nextName, workspaceId);
  if (existsSync5(previousPath) && previousPath !== nextPath) {
    renameSync(previousPath, nextPath);
  }
  ensureChannelHistoryFile(nextName, workspaceId);
}
function removeChannelHistoryFile(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const filePath = getChannelHistoryFilePath(channelName, workspaceId);
  if (existsSync5(filePath)) {
    rmSync(filePath, { force: true });
  }
}
function sortDirectConversations(threads) {
  return [...threads].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}
function getChannelHistoryDirPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  return getWorkspaceChannelHistoryDirPath(workspaceId);
}
function ensureChannelHistoryFile(channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const filePath = getChannelHistoryFilePath(channelName, workspaceId);
  if (!existsSync5(filePath)) {
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
var AUTO_CONTINUATION_REPLY = "\u597D\u7684\uFF0C\u5982\u679C\u6CA1\u505A\u5B8C\uFF0C\u7EE7\u7EED\u5F80\u4E0B\u6536\u5C3E\uFF0C\u5982\u679C\u505A\u5B8C\u4E86\u5BFB\u627E\u6709\u6CA1\u6709\u522B\u7684\u53EF\u4EE5\u505A\u7684\u7136\u540E\u7EE7\u7EED\u505A";
function parseAutoContinuationDirective(message, now = /* @__PURE__ */ new Date()) {
  const normalized = message.replace(/[，。；;]/g, " ");
  const durationMatch = /(?:从现在起|现在起|接下来|连续|持续|自动接管|接管|工作)?\s*(?:连续工作|持续工作|自动接管|接管|工作|连续)\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|小时|个小时)/i.exec(normalized);
  if (durationMatch) {
    const hours = Number(durationMatch[1]);
    if (Number.isFinite(hours) && hours > 0) {
      return buildDirective(now, hours * HOUR_MS);
    }
  }
  const untilMatch = /(?:直到|到)\s*(今天|明天)?\s*(\d{1,2})(?:[:：点](\d{1,2}))?\s*(?:分)?/.exec(normalized);
  if (untilMatch && /(连续|持续|自动接管|接管|工作)/.test(normalized)) {
    const target = new Date(now.getTime());
    const dayWord = untilMatch[1];
    const hour = Number(untilMatch[2]);
    const minute = untilMatch[3] ? Number(untilMatch[3]) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      target.setHours(hour, minute, 0, 0);
      if (dayWord === "\u660E\u5929" || dayWord !== "\u4ECA\u5929" && target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      const durationMs = target.getTime() - now.getTime();
      if (durationMs > 0) {
        return buildDirective(now, durationMs);
      }
    }
  }
  return null;
}
function createAutoContinuationState(input) {
  return {
    mode: "until",
    status: "active",
    startedAt: input.directive.startedAt,
    until: input.directive.until,
    instruction: input.directive.instruction,
    requestedByUserId: input.requestedByUserId,
    requestedByDisplayName: input.requestedByDisplayName,
    sourceMessageId: input.sourceMessageId,
    iteration: 0
  };
}
function buildDirective(now, durationMs) {
  return {
    mode: "until",
    startedAt: now.toISOString(),
    until: new Date(now.getTime() + durationMs).toISOString(),
    instruction: AUTO_CONTINUATION_REPLY,
    durationMs
  };
}

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
function publishChannelThreadChangedEvent(input) {
  const event = {
    type: "channel.thread.changed",
    workspaceId: input.workspaceId,
    channelName: input.channelName,
    sequence: nextSequence(),
    changedAt: input.changedAt
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
var RUNTIME_COORDINATOR = "\u7CFB\u7EDF\u63D0\u793A";
var DOC_COORDINATOR = "\u7CFB\u7EDF\u63D0\u793A";
var AUTO_CONTINUATION_COORDINATOR = "\u7CFB\u7EDF\u63D0\u793A";
var AGENT_OUTPUT_MENTION_MAX_DISPATCHES = 3;
var AGENT_OUTPUT_MENTION_MAX_CASCADE_DEPTH = 2;
var AGENT_OUTPUT_MENTION_MAX_ROOT_TASKS = 6;
function formatConversationFailureSummary(input) {
  const label = input.isDirectConversation ? "\u79C1\u804A" : "\u7FA4\u804A";
  return `${input.agentName} \u5728${label} ${input.channelName} \u4E2D\u6267\u884C\u5931\u8D25\uFF1A${formatUserFacingTaskFailure(input.errorText)}`;
}
function formatTaskFailureSummary(input) {
  return `\u4EFB\u52A1 ${input.title} \u6267\u884C\u5931\u8D25\uFF1A${formatUserFacingTaskFailure(input.errorText)}`;
}
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
function parseChannelMentionsSync(state, channelName, summary) {
  const agentMentionParse = parseAgentMentions(summary, buildMentionCandidates(state, channelName));
  const humanMentionParse = parseHumanMentions(summary, buildHumanMentionCandidates(state, channelName));
  const humanMentions = humanMentionParse.mentions.filter(
    (mention) => !agentMentionParse.mentions.some((agentMention) => sameValue(agentMention.token, mention.token))
  );
  const agentMentions = agentMentionParse.mentions.map((mention) => ({
    agentId: mention.agentId,
    label: mention.label,
    token: mention.token,
    mentionType: "agent",
    inChannel: mention.inChannel
  }));
  const unknownMentions = agentMentionParse.unknownMentions.filter(
    (token) => !humanMentionParse.mentions.some((mention) => sameValue(mention.token, token))
  );
  const inChannelAgentMentions = agentMentions.filter((mention) => mention.inChannel);
  const inChannelHumanMentions = humanMentions.filter((mention) => mention.inChannel);
  return {
    agentMentions: inChannelAgentMentions,
    humanMentions: inChannelHumanMentions,
    unknownMentions,
    outOfChannelAgentMentions: agentMentions.filter((mention) => !mention.inChannel),
    outOfChannelHumanMentions: humanMentions.filter((mention) => !mention.inChannel),
    allMentions: [...inChannelAgentMentions, ...inChannelHumanMentions]
  };
}
function sendChannelHumanMessageSync(channelName, speaker, summary, attachments, replyToMessageId, workspaceId, requesterUserId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const effectiveWorkspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel) {
    throw new Error(`Channel "${channelName}" does not exist.`);
  }
  assertHumanCanAccessChannel(state, channel.name, speaker, requesterUserId, effectiveWorkspaceId);
  const trimmed = summary.trim();
  if (!trimmed) {
    throw new Error("Message content is required.");
  }
  const mentionCandidates = buildMentionCandidates(state, channel.name);
  const mentionParse = parseChannelMentionsSync(state, channel.name, trimmed);
  if (mentionParse.outOfChannelAgentMentions.length > 0) {
    throw new Error(`\u4EE5\u4E0B Agent \u4E0D\u5728\u5F53\u524D\u7FA4\u7EC4\u4E2D\uFF1A${mentionParse.outOfChannelAgentMentions.map((mention) => `@${mention.token}`).join("\u3001")}\u3002`);
  }
  if (mentionParse.outOfChannelHumanMentions.length > 0) {
    throw new Error(`\u4EE5\u4E0B\u6210\u5458\u4E0D\u5728\u5F53\u524D\u7FA4\u7EC4\u4E2D\uFF1A${mentionParse.outOfChannelHumanMentions.map((mention) => `@${mention.token}`).join("\u3001")}\u3002`);
  }
  if (mentionParse.unknownMentions.length > 0) {
    throw new Error(`\u672A\u627E\u5230\u53EF\u7528\u6210\u5458\u6216 Agent\uFF1A${mentionParse.unknownMentions.map((token) => `@${token}`).join("\u3001")}\u3002`);
  }
  const mentionPlan = parseMentionPlan(trimmed, mentionCandidates);
  const autoContinuationDirective = mentionParse.agentMentions.length === 1 ? parseAutoContinuationDirective(trimmed) : null;
  const humanMessage = pushWorkspaceMessageToChannel(state, channel.name, {
    speaker,
    speakerUserId: requesterUserId,
    role: "human",
    summary: trimmed,
    status: "completed",
    attachments,
    mentions: mentionParse.allMentions,
    replyToMessageId
  }, effectiveWorkspaceId);
  if (mentionParse.agentMentions.length === 0) {
    state.ledger.unshift({
      title: "Channel message",
      note: `${speaker} sent a regular message in ${channel.name} without triggering any agent.`
    });
    return writeChannelMessageStateAndPublish(state, effectiveWorkspaceId, channel.name, humanMessage.id, humanMessage.time);
  }
  if (mentionPlan.mode === "parallel" && mentionPlan.warnings.length > 0) {
    pushWorkspaceMessageToChannel(state, channel.name, {
      speaker: DOC_COORDINATOR,
      role: "agent",
      summary: "Unable to infer a safe handoff order. Please rewrite the message with explicit sequencing such as \u201C@A ... \u7136\u540E @B ...\u201D\u3002",
      code: "channel_document.plan_ambiguous_notice",
      data: {
        channel_name: channel.name
      },
      status: "error"
    }, effectiveWorkspaceId);
    state.ledger.unshift({
      title: "Channel document workflow ambiguous",
      note: `${speaker} \u5728 ${channel.name} \u53D1\u8D77\u7684\u591A agent \u534F\u4F5C\u8868\u8FBE\u987A\u5E8F\u4E0D\u660E\u786E\uFF0C\u7CFB\u7EDF\u8981\u6C42\u6539\u5199\u3002`,
      code: "channel_document.run_ambiguous",
      data: {
        channel_name: channel.name
      }
    });
    return writeChannelMessageStateAndPublish(state, effectiveWorkspaceId, channel.name, humanMessage.id, humanMessage.time);
  }
  if (mentionPlan.mode === "sequential" && mentionPlan.steps.length > 1) {
    const { run, steps } = createChannelDocumentRun({
      state,
      channelName: channel.name,
      sourceMessageId: humanMessage.id,
      sourceSummary: trimmed,
      plan: mentionPlan
    });
    let queuedCount2 = 0;
    const unavailableAgents2 = [];
    for (const step of steps.filter((item) => item.status === "ready")) {
      const queued = enqueueChannelMentionStepSync(state, {
        channelName: channel.name,
        sourceMessage: humanMessage,
        fullMessage: trimmed,
        attachments,
        step,
        mentionedAgentIds: mentionParse.agentMentions.map((item) => item.agentId),
        mentionedAgentLabels: mentionParse.agentMentions.map((item) => item.label),
        workspaceId: effectiveWorkspaceId,
        requesterUserId,
        requesterDisplayName: speaker
      });
      if (queued) {
        queuedCount2 += 1;
        continue;
      }
      unavailableAgents2.push(step.agentLabel);
      step.status = "blocked";
      step.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (unavailableAgents2.length > 0) {
      pushWorkspaceMessageToChannel(state, channel.name, {
        speaker: RUNTIME_COORDINATOR,
        role: "agent",
        summary: `${unavailableAgents2.join(", ")} does not have an executable runtime bound and cannot start the document handoff flow.`,
        code: "mention.unavailable",
        data: { agent_names: unavailableAgents2.join("\u3001") },
        status: "error"
      }, effectiveWorkspaceId);
    }
    state.ledger.unshift({
      title: "Channel document run",
      note: `${speaker} \u5728 ${channel.name} \u53D1\u8D77\u4E86\u4E00\u6761\u4E32\u884C\u534F\u4F5C\u6587\u6863\u6D41\u7A0B\uFF0C\u5171 ${steps.length} \u6B65\u3002`,
      code: "channel_document.run_created",
      data: {
        channel_name: channel.name,
        run_id: run.id,
        step_count: String(steps.length)
      }
    });
    pushWorkspaceMessageToChannel(state, channel.name, {
      speaker: DOC_COORDINATOR,
      role: "agent",
      summary: `Document workflow started with ${steps.length} step(s).`,
      code: "channel_document.run_created_notice",
      data: {
        channel_name: channel.name,
        run_id: run.id,
        step_count: String(steps.length)
      }
    }, effectiveWorkspaceId);
    return writeChannelMessageStateAndPublish(state, effectiveWorkspaceId, channel.name, humanMessage.id, humanMessage.time);
  }
  let queuedCount = 0;
  const unavailableAgents = [];
  for (const mention of mentionParse.agentMentions) {
    const agent = state.activeEmployees.find((employee) => sameValue(employee.name, mention.agentId));
    if (!agent) {
      continue;
    }
    if (requesterUserId) {
      assertCanUseEmployeeInChannelForActorSync({
        workspaceId: effectiveWorkspaceId,
        employeeName: agent.name,
        channelName: channel.name,
        actorUserId: requesterUserId,
        actorDisplayName: speaker
      });
      assertCanUseBoundEmployeeRuntimeInChannelForActorSync({
        workspaceId: effectiveWorkspaceId,
        employeeName: agent.name,
        channelName: channel.name,
        actorUserId: requesterUserId,
        actorDisplayName: speaker
      });
    }
    const existingExecutionWorkspace = readConversationExecutionWorkspaceState(state, {
      channelName: channel.name,
      agentId: agent.name
    });
    const lastExecution = readLatestChannelExecutionSync(agent.name, channel.name, effectiveWorkspaceId);
    const resumedSessionId = existingExecutionWorkspace?.sessionId ?? lastExecution?.sessionId;
    const resumedWorkDir = existingExecutionWorkspace?.workDir ?? lastExecution?.workDir;
    const autoContinuation = autoContinuationDirective ? createAutoContinuationState({
      directive: autoContinuationDirective,
      requestedByUserId: requesterUserId,
      requestedByDisplayName: speaker,
      sourceMessageId: humanMessage.id
    }) : void 0;
    const queued = enqueueNativeTaskSync({
      workspaceId: effectiveWorkspaceId,
      assignee: agent.name,
      title: `@\u63D0\u53CA \xB7 ${channel.name} \xB7 ${mention.label}`,
      channel: channel.name,
      priority: "medium",
      triggerType: "mention_chat",
      requestedByUserId: requesterUserId,
      requestedByDisplayName: speaker,
      metadata: {
        sourceChannel: channel.name,
        sourceMessageId: humanMessage.id,
        mentionType: "agent",
        mentionedAgentIds: mentionParse.agentMentions.map((item) => item.agentId),
        mentionedAgentLabels: mentionParse.agentMentions.map((item) => item.label),
        assigneeMentionToken: mention.token,
        channelName: channel.name,
        channelMessage: trimmed,
        channelHistory: buildChannelHistorySnapshot(state, channel.name),
        channelHistoryPath: getChannelHistoryFilePath(channel.name, effectiveWorkspaceId),
        channelSessionId: resumedSessionId,
        autoContinuation,
        attachments: attachments?.map((attachment) => ({
          fileName: attachment.fileName,
          storedPath: attachment.storedPath,
          mediaType: attachment.mediaType,
          kind: attachment.kind
        })) ?? []
      }
    });
    if (queued) {
      queuedCount += 1;
      upsertConversationExecutionWorkspaceState(state, {
        channelName: channel.name,
        agentId: agent.name,
        sessionId: resumedSessionId,
        workDir: resumedWorkDir ?? resolveConversationExecutionWorkspacePath({
          workspaceId: effectiveWorkspaceId,
          channelName: channel.name,
          agentId: agent.name
        }),
        lastTaskQueueId: queued.id,
        lastError: null,
        autoContinuation
      });
      if (autoContinuation) {
        state.ledger.unshift({
          title: "Auto continuation started",
          note: `${speaker} \u5728 ${channel.name} \u8981\u6C42 ${agent.name} \u81EA\u52A8\u7EED\u8DD1\u5230 ${autoContinuation.until}\u3002`,
          code: "auto_continuation.started",
          data: {
            channel_name: channel.name,
            agent_name: agent.name,
            until: autoContinuation.until,
            source_message_id: humanMessage.id
          }
        });
        pushWorkspaceMessageToChannel(state, channel.name, {
          speaker: AUTO_CONTINUATION_COORDINATOR,
          role: "agent",
          summary: `Auto continuation started for ${agent.name} until ${autoContinuation.until}.`,
          code: "auto_continuation.started_notice",
          data: {
            channel_name: channel.name,
            agent_name: agent.name,
            until: autoContinuation.until,
            source_message_id: humanMessage.id
          }
        }, effectiveWorkspaceId);
      }
      pushWorkspaceMessageToChannel(state, channel.name, {
        speaker: agent.name,
        role: "agent",
        summary: "Thinking",
        code: "agent.pending",
        data: { agent_name: agent.name },
        status: "pending"
      }, effectiveWorkspaceId);
      continue;
    }
    unavailableAgents.push(mention.label);
  }
  if (unavailableAgents.length > 0) {
    pushWorkspaceMessageToChannel(state, channel.name, {
      speaker: RUNTIME_COORDINATOR,
      role: "agent",
      summary: `${unavailableAgents.join(", ")} does not have an executable runtime bound and cannot respond to this mention.`,
      code: "mention.unavailable",
      data: { agent_names: unavailableAgents.join("\u3001") },
      status: "error"
    }, effectiveWorkspaceId);
  }
  state.ledger.unshift({
    title: "Channel mention",
    note: queuedCount > 0 ? `${speaker} directly mentioned ${mentionParse.agentMentions.map((item) => item.label).join(", ")} in ${channel.name}, dispatching ${queuedCount} agent(s).` : `${speaker} mentioned ${mentionParse.agentMentions.map((item) => item.label).join(", ")} in ${channel.name}, but the target agent is not executable right now.`
  });
  return writeChannelMessageStateAndPublish(state, effectiveWorkspaceId, channel.name, humanMessage.id, humanMessage.time);
}
function buildHumanMentionCandidates(state, channelName) {
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  const channelHumanNames = channel ? resolveChannelHumanMemberNames(state, channel) : [];
  const names = uniqueNames2([
    ...state.humanMembers.map((member) => member.name),
    ...state.channels.flatMap((item) => resolveChannelHumanMemberNames(state, item))
  ]);
  return names.map((name) => ({
    agentId: `human:${name}`,
    label: name,
    aliases: [name],
    inChannel: channelHumanNames.some((memberName) => sameValue(memberName, name))
  }));
}
function parseHumanMentions(input, candidates) {
  const parsed = parseAgentMentions(input, candidates);
  return {
    mentions: parsed.mentions.map((mention) => ({
      humanId: mention.agentId.replace(/^human:/, ""),
      label: mention.label,
      token: mention.token,
      mentionType: "human",
      inChannel: mention.inChannel
    }))
  };
}
function uniqueNames2(values) {
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || result.some((existing) => sameValue(existing, trimmed))) {
      continue;
    }
    result.push(trimmed);
  }
  return result;
}
function assertHumanCanAccessChannel(state, channelName, actorName, actorUserId, workspaceId) {
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel) {
    throw new Error(`Channel "${channelName}" does not exist.`);
  }
  if (actorUserId && canReadChannelForActorSync({
    workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
    channelName,
    actor: { userId: actorUserId, displayName: actorName }
  })) {
    return;
  }
  const visibleHumanNames = resolveChannelHumanMemberNames(state, channel);
  if (visibleHumanNames.some((name) => sameValue(name, actorName))) {
    return;
  }
  throw new Error(`Human member "${actorName}" does not belong to channel "${channelName}".`);
}
function completeAgentChannelReplySync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const effectiveWorkspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
  const channel = state.channels.find((item) => sameValue(item.name, input.channel));
  if (!channel) {
    throw new Error(`Channel "${input.channel}" does not exist.`);
  }
  if (input.pendingSpeaker?.trim()) {
    state.messages = state.messages.filter(
      (message2) => !(sameValue(message2.channel ?? "", channel.name) && message2.role === "agent" && message2.status === "pending" && sameValue(message2.speaker, input.pendingSpeaker ?? ""))
    );
  }
  const shouldProcessMentions = channel.kind !== "direct";
  const mentionParse = shouldProcessMentions ? parseChannelMentionsSync(state, channel.name, input.summary) : emptyChannelMentionParseResult();
  const warnings = shouldProcessMentions ? buildAgentOutputMentionParseWarnings(mentionParse) : [];
  const message = pushWorkspaceMessageToChannel(state, channel.name, {
    speaker: input.speaker,
    role: "agent",
    summary: input.summary,
    status: "completed",
    attachments: input.attachments,
    mentions: mentionParse.allMentions
  }, effectiveWorkspaceId);
  const dispatchResult = shouldProcessMentions ? dispatchAgentOutputMentionsSync(state, {
    channelName: channel.name,
    sourceMessage: message,
    sourceTaskQueueId: input.sourceTaskQueueId,
    initiatorAgentId: input.speaker,
    agentMentions: mentionParse.agentMentions,
    workspaceId: effectiveWorkspaceId,
    requestedByUserId: input.requestedByUserId,
    requestedByDisplayName: input.requestedByDisplayName,
    mentionCascadeDepth: input.mentionCascadeDepth,
    mentionRootMessageId: input.mentionRootMessageId,
    sessionId: input.sessionId,
    workDir: input.workDir
  }) : { queuedTaskIds: [], dispatchedAgentIds: [], warnings: [] };
  warnings.push(...dispatchResult.warnings);
  if (warnings.length > 0 || dispatchResult.queuedTaskIds.length > 0) {
    state.ledger.unshift({
      title: "Agent output mentions",
      note: dispatchResult.queuedTaskIds.length > 0 ? `${input.speaker} mentioned ${mentionParse.agentMentions.map((mention) => mention.label).join(", ")} in ${channel.name}, dispatching ${dispatchResult.queuedTaskIds.length} agent(s).` : `${input.speaker} mentioned channel participants in ${channel.name}; no follow-up agent task was dispatched.`,
      code: "agent_output_mentions.processed",
      data: {
        channel_name: channel.name,
        source_message_id: message.id,
        queued_count: String(dispatchResult.queuedTaskIds.length),
        warning_count: String(warnings.length)
      }
    });
  }
  for (const warning of warnings) {
    state.ledger.unshift({
      title: "Agent output mention warning",
      note: warning,
      code: "agent_output_mentions.warning",
      data: {
        channel_name: channel.name,
        source_message_id: message.id
      }
    });
  }
  const nextState = writeWorkspaceStateSync(state, effectiveWorkspaceId);
  publishChannelThreadChangedEvent({
    workspaceId: effectiveWorkspaceId,
    channelName: channel.name,
    changedAt: message.time
  });
  return {
    state: nextState,
    message,
    warnings,
    queuedTaskIds: dispatchResult.queuedTaskIds,
    dispatchedAgentIds: dispatchResult.dispatchedAgentIds
  };
}
function replacePendingChannelMessageSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  state.messages = state.messages.filter(
    (message2) => !(sameValue(message2.channel ?? "", input.channel) && message2.role === "agent" && message2.status === "pending" && sameValue(message2.speaker, input.pendingSpeaker))
  );
  const message = pushWorkspaceMessageToChannel(state, input.channel, {
    speaker: input.speaker,
    role: input.role,
    summary: input.summary,
    status: input.status ?? "completed",
    attachments: input.attachments
  }, workspaceId);
  const nextState = writeWorkspaceStateSync(state, workspaceId);
  publishChannelThreadChangedEvent({
    workspaceId: workspaceId ?? DEFAULT_WORKSPACE_ID,
    channelName: input.channel,
    changedAt: message.time
  });
  return nextState;
}
function buildAgentOutputMentionParseWarnings(parse2) {
  const warnings = [];
  for (const token of parse2.unknownMentions) {
    warnings.push(`Agent output mentioned @${token}, but no channel member or Agent matches that name.`);
  }
  for (const mention of parse2.outOfChannelAgentMentions) {
    warnings.push(`Agent output mentioned @${mention.token}, but Agent "${mention.label}" is not in this channel.`);
  }
  for (const mention of parse2.outOfChannelHumanMentions) {
    warnings.push(`Agent output mentioned @${mention.token}, but member "${mention.label}" is not in this channel.`);
  }
  return warnings;
}
function emptyChannelMentionParseResult() {
  return {
    agentMentions: [],
    humanMentions: [],
    unknownMentions: [],
    outOfChannelAgentMentions: [],
    outOfChannelHumanMentions: [],
    allMentions: []
  };
}
function dispatchAgentOutputMentionsSync(state, input) {
  const queuedTaskIds = [];
  const dispatchedAgentIds = [];
  const warnings = [];
  if (input.agentMentions.length === 0) {
    return { queuedTaskIds, dispatchedAgentIds, warnings };
  }
  const currentDepth = normalizeMentionCascadeDepth(input.mentionCascadeDepth);
  const mentionRootMessageId = input.mentionRootMessageId?.trim() || input.sourceMessage.id;
  if (currentDepth >= AGENT_OUTPUT_MENTION_MAX_CASCADE_DEPTH) {
    warnings.push(
      `Agent output mention cascade depth ${currentDepth} reached the limit ${AGENT_OUTPUT_MENTION_MAX_CASCADE_DEPTH}; no follow-up agent task was created.`
    );
    return { queuedTaskIds, dispatchedAgentIds, warnings };
  }
  let rootTaskCount = countAgentOutputMentionTasksForRoot(input.workspaceId, mentionRootMessageId);
  const nextDepth = currentDepth + 1;
  const mentionedAgentIds = input.agentMentions.map((mention) => mention.agentId);
  const mentionedAgentLabels = input.agentMentions.map((mention) => mention.label);
  for (const mention of input.agentMentions) {
    if (queuedTaskIds.length >= AGENT_OUTPUT_MENTION_MAX_DISPATCHES) {
      warnings.push(
        `Agent output mentioned @${mention.token}, but each reply can dispatch at most ${AGENT_OUTPUT_MENTION_MAX_DISPATCHES} agent task(s).`
      );
      continue;
    }
    if (rootTaskCount >= AGENT_OUTPUT_MENTION_MAX_ROOT_TASKS) {
      warnings.push(
        `Agent output mentioned @${mention.token}, but mention root ${mentionRootMessageId} already reached the ${AGENT_OUTPUT_MENTION_MAX_ROOT_TASKS} task limit.`
      );
      continue;
    }
    if (sameValue(input.initiatorAgentId, mention.agentId)) {
      warnings.push(`Agent output mentioned itself as @${mention.token}; self-mentions do not create follow-up tasks.`);
      continue;
    }
    if (hasQueuedAgentOutputMentionForSource(input.workspaceId, input.sourceMessage.id, mention.agentId)) {
      warnings.push(`Agent output already dispatched @${mention.token} for source message ${input.sourceMessage.id}.`);
      continue;
    }
    const agent = state.activeEmployees.find((employee) => sameValue(employee.name, mention.agentId));
    if (!agent || !agent.channels.some((channelName) => sameValue(channelName, input.channelName))) {
      warnings.push(`Agent output mentioned @${mention.token}, but the target Agent is not available in channel ${input.channelName}.`);
      continue;
    }
    if (!input.requestedByUserId && agent.ownerUserId) {
      warnings.push(`Agent output mentioned @${mention.token}, but personal Agent "${agent.name}" requires a human requester context.`);
      continue;
    }
    if (input.requestedByUserId) {
      try {
        assertCanUseEmployeeInChannelForActorSync({
          workspaceId: input.workspaceId,
          employeeName: agent.name,
          channelName: input.channelName,
          actorUserId: input.requestedByUserId,
          actorDisplayName: input.requestedByDisplayName
        });
        assertCanUseBoundEmployeeRuntimeInChannelForActorSync({
          workspaceId: input.workspaceId,
          employeeName: agent.name,
          channelName: input.channelName,
          actorUserId: input.requestedByUserId,
          actorDisplayName: input.requestedByDisplayName
        });
      } catch (error) {
        warnings.push(
          `Agent output mentioned @${mention.token}, but the inherited requester cannot dispatch that Agent: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
    }
    const existingExecutionWorkspace = readConversationExecutionWorkspaceState(state, {
      channelName: input.channelName,
      agentId: agent.name
    });
    const lastExecution = readLatestChannelExecutionSync(agent.name, input.channelName, input.workspaceId);
    const resumedSessionId = existingExecutionWorkspace?.sessionId ?? lastExecution?.sessionId;
    const resumedWorkDir = existingExecutionWorkspace?.workDir ?? lastExecution?.workDir;
    const queued = enqueueNativeTaskSync({
      workspaceId: input.workspaceId,
      assignee: agent.name,
      title: `Agent @\u63D0\u53CA \xB7 ${input.channelName} \xB7 ${mention.label}`,
      channel: input.channelName,
      priority: "medium",
      triggerType: "mention_chat",
      requestedByUserId: input.requestedByUserId,
      requestedByDisplayName: input.requestedByDisplayName,
      metadata: {
        mentionSource: "agent_output",
        initiatorAgentId: input.initiatorAgentId,
        sourceChannel: input.channelName,
        sourceMessageId: input.sourceMessage.id,
        sourceTaskQueueId: input.sourceTaskQueueId,
        mentionType: "agent",
        mentionedAgentIds,
        mentionedAgentLabels,
        assigneeMentionToken: mention.token,
        channelName: input.channelName,
        channelMessage: input.sourceMessage.summary,
        channelHistory: buildChannelHistorySnapshot(state, input.channelName),
        channelHistoryPath: getChannelHistoryFilePath(input.channelName, input.workspaceId),
        channelSessionId: resumedSessionId,
        mentionCascadeDepth: nextDepth,
        mentionRootMessageId
      }
    });
    if (!queued) {
      warnings.push(`Agent output mentioned @${mention.token}, but the target Agent does not have an executable runtime bound.`);
      continue;
    }
    queuedTaskIds.push(queued.id);
    dispatchedAgentIds.push(agent.name);
    rootTaskCount += 1;
    upsertConversationExecutionWorkspaceState(state, {
      channelName: input.channelName,
      agentId: agent.name,
      sessionId: resumedSessionId ?? input.sessionId,
      workDir: resumedWorkDir ?? input.workDir ?? resolveConversationExecutionWorkspacePath({
        workspaceId: input.workspaceId,
        channelName: input.channelName,
        agentId: agent.name
      }),
      lastTaskQueueId: queued.id,
      lastError: null
    });
    pushWorkspaceMessageToChannel(state, input.channelName, {
      speaker: agent.name,
      role: "agent",
      summary: "Thinking",
      code: "agent.pending",
      data: {
        agent_name: agent.name,
        source_message_id: input.sourceMessage.id,
        mention_source: "agent_output"
      },
      status: "pending"
    }, input.workspaceId);
  }
  return { queuedTaskIds, dispatchedAgentIds, warnings };
}
function normalizeMentionCascadeDepth(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}
function countAgentOutputMentionTasksForRoot(workspaceId, mentionRootMessageId) {
  return listQueuedTasksSync({ workspaceId }).filter((task) => {
    const payload = safeParseQueuePayload(task.inputJson);
    return payload?.mentionSource === "agent_output" && payload.mentionRootMessageId === mentionRootMessageId;
  }).length;
}
function hasQueuedAgentOutputMentionForSource(workspaceId, sourceMessageId, targetAgentId) {
  return listQueuedTasksSync({ workspaceId }).some((task) => {
    const payload = safeParseQueuePayload(task.inputJson);
    return task.agentId === targetAgentId && payload?.mentionSource === "agent_output" && payload.sourceMessageId === sourceMessageId;
  });
}
function safeParseQueuePayload(inputJson) {
  try {
    const parsed = JSON.parse(inputJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function formatUserFacingTaskFailure(errorText) {
  const trimmed = errorText.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "\u8FD0\u884C\u65F6\u8FD4\u56DE\u4E86\u7A7A\u9519\u8BEF\u3002";
  }
  if (/--dangerously-skip-permissions cannot be used with root\/sudo privileges/i.test(trimmed)) {
    return "\u8FD0\u884C\u65F6\u6743\u9650\u6A21\u5F0F\u4E0E root/sudo \u73AF\u5883\u4E0D\u517C\u5BB9\uFF0C\u4EFB\u52A1\u672A\u80FD\u542F\u52A8\u3002";
  }
  if (/This command requires approval/i.test(trimmed)) {
    return "\u8FD0\u884C\u65F6\u9700\u8981\u547D\u4EE4\u5BA1\u6279\uFF0C\u4F46\u5F53\u524D\u4F1A\u8BDD\u65E0\u6CD5\u4EA4\u4E92\u5BA1\u6279\u3002";
  }
  const withoutDiagnosticBlock = trimmed.replace(/\s*\((?:code|exitCode|timedOut|events|resultEvent|textEvent|toolEvent|parseErrors|nonJsonLines|stdoutTail|stderrTail|sessionId)=[\s\S]*\)\s*$/i, "").trim();
  const compact = withoutDiagnosticBlock || trimmed;
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
function writeChannelMessageStateAndPublish(state, workspaceId, channelName, messageId, createdAt) {
  const nextState = writeWorkspaceStateSync(state, workspaceId);
  publishChannelMessageCreatedEvent({
    workspaceId,
    channelName,
    messageId,
    createdAt
  });
  return nextState;
}

// ../services/src/notifications/notifications.ts
function listNotificationsForRecipientSync(input) {
  return listWorkspaceNotificationsForRecipientSync(input);
}

// ../services/src/channel-access/channel-access.ts
function isWorkspaceAdminOrOwnerRole(role) {
  return role === "owner" || role === "admin";
}
function canReadChannelForActorSync(input) {
  const channelName = input.channelName?.trim();
  if (!channelName) {
    return true;
  }
  const state = ensureWorkspaceStateSync(input.workspaceId);
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (channel?.kind === "direct") {
    return canReadDirectChannelForActorSync({
      workspaceId: input.workspaceId,
      channel,
      actor: input.actor,
      state
    });
  }
  if (isWorkspaceAdminOrOwnerRole(resolveActorRole(input.workspaceId, input.actor))) {
    return true;
  }
  if (!input.actor.userId.trim()) {
    return false;
  }
  const participant = readChannelParticipantSync(input.workspaceId, channelName, input.actor.userId);
  if (participant?.status === "active") {
    return true;
  }
  return canReadChannelByLegacyMembership(input.workspaceId, channelName, input.actor);
}
function canReadDirectChannelForActorSync(input) {
  const actorUserId = input.actor.userId.trim();
  if (!actorUserId) {
    return false;
  }
  const participant = readChannelParticipantSync(input.workspaceId, input.channel.name, actorUserId);
  if (participant?.status === "active") {
    return true;
  }
  const state = input.state ?? ensureWorkspaceStateSync(input.workspaceId);
  const actorDisplayName = input.actor.displayName?.trim() || readUserSync(actorUserId)?.displayName;
  if (actorDisplayName && resolveChannelHumanMemberNames(state, input.channel).some((name) => sameValue(name, actorDisplayName))) {
    return true;
  }
  return input.channel.employeeNames.some((employeeName) => {
    const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
    return employee?.ownerUserId === actorUserId;
  });
}
function resolveActorRole(workspaceId, actor) {
  if (actor.role) {
    return actor.role;
  }
  return readWorkspaceMembershipSync(workspaceId, actor.userId)?.role;
}
function canReadChannelByLegacyMembership(workspaceId, channelName, actor) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel) {
    return false;
  }
  const hasStructuredAccessRows = listChannelParticipantsSync(workspaceId, channel.name, {
    statuses: ["active", "removed"]
  }).length > 0;
  if (hasStructuredAccessRows) {
    return false;
  }
  const displayName = actor.displayName?.trim() || readUserSync(actor.userId)?.displayName;
  if (!displayName) {
    return false;
  }
  const visibleHumanNames = resolveChannelHumanMemberNames(state, channel);
  if (visibleHumanNames.length === 0) {
    return true;
  }
  return visibleHumanNames.some((candidate) => sameValue(candidate, displayName));
}

// ../services/src/attachments/storage.ts
import { createHash as createHash3, createHmac } from "node:crypto";
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
  return createHash3("sha256").update(contentBytes).digest("hex");
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
  return createHash3("sha256").update(value).digest("hex");
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
function pruneOrphanWorkspaceAttachmentsSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const attachmentsDir = getWorkspaceAttachmentsDirPath2(workspaceId);
  const referencedPaths = collectReferencedAttachmentPaths(readWorkspaceStateSync(workspaceId));
  let scannedCount = 0;
  let deletedCount = 0;
  for (const entry of readdirSync(attachmentsDir)) {
    const candidatePath = join7(attachmentsDir, entry);
    if (!statSync2(candidatePath).isFile()) {
      continue;
    }
    scannedCount += 1;
    if (referencedPaths.has(resolve5(candidatePath))) {
      continue;
    }
    rmSync3(candidatePath, { force: true });
    deletedCount += 1;
  }
  return {
    scannedCount,
    deletedCount
  };
}
function collectReferencedAttachmentPaths(state) {
  const result = /* @__PURE__ */ new Set();
  for (const message of state.messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.deletedAt) {
        continue;
      }
      result.add(resolve5(attachment.storedPath));
    }
  }
  for (const page of state.knowledgePages) {
    if (page.sourceAttachmentStoredPath) {
      result.add(resolve5(page.sourceAttachmentStoredPath));
    }
  }
  for (const version2 of state.channelDocumentVersions) {
    if (version2.sourceAttachmentStoredPath) {
      result.add(resolve5(version2.sourceAttachmentStoredPath));
    }
  }
  return result;
}

// ../services/src/channels/channels.ts
var SYSTEM_NOTICE = "System";
function isDirectChannel(channel) {
  return channel.kind === "direct";
}
function findDirectChannelRecord(state, input) {
  const humanMemberName = input.humanMemberName.trim();
  const employeeName = input.employeeName.trim();
  if (!humanMemberName || !employeeName) {
    return void 0;
  }
  return state.channels.find(
    (channel) => isDirectChannel(channel) && (channel.humanMemberNames ?? []).some((name) => sameValue(name, humanMemberName)) && channel.employeeNames.some((name) => sameValue(name, employeeName))
  );
}
function resolveChannelHumanMemberNames(state, channel) {
  const explicitNames = uniqueNames(channel.humanMemberNames ?? []);
  if (explicitNames.length > 0) {
    return explicitNames;
  }
  return state.humanMembers.slice(0, Math.max(0, channel.humanMembers)).map((member) => member.name);
}
function ensureDirectChannelRecord(state, input) {
  const humanMemberName = input.humanMemberName.trim();
  const employeeName = input.employeeName.trim();
  const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
  if (!humanMemberName) {
    throw new Error("Human member name is required.");
  }
  if (!state.humanMembers.some((member) => sameValue(member.name, humanMemberName))) {
    state.humanMembers.push({ name: humanMemberName, role: "Member" });
  }
  if (!employee) {
    throw new Error(`Active employee "${employeeName}" does not exist.`);
  }
  let channel = findDirectChannelRecord(state, { humanMemberName, employeeName });
  if (!channel) {
    channel = {
      name: `direct-${createOpaqueId()}`,
      kind: "direct",
      humanMemberNames: [humanMemberName],
      humanMembers: 1,
      employeeNames: [employee.name]
    };
    state.channels.unshift(channel);
  } else {
    channel.kind = "direct";
    channel.humanMemberNames = uniqueNames([...channel.humanMemberNames ?? [], humanMemberName]);
    channel.humanMembers = channel.humanMemberNames.length;
    channel.employeeNames = uniqueNames([...channel.employeeNames, employee.name]);
  }
  state.activeEmployees = state.activeEmployees.map((item) => {
    if (!sameValue(item.name, employee.name)) {
      return item;
    }
    if (item.channels.some((name) => sameValue(name, channel.name))) {
      return item;
    }
    return {
      ...item,
      channels: [...item.channels, channel.name]
    };
  });
  return channel;
}
function resolveCompatibleDirectChannelRecord(state, employeeName) {
  const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
  if (!employee) {
    return null;
  }
  const existingDirectChannels = state.channels.filter(
    (channel) => isDirectChannel(channel) && channel.employeeNames.some((name) => sameValue(name, employee.name))
  );
  if (existingDirectChannels.length === 1) {
    return existingDirectChannels[0] ?? null;
  }
  if (existingDirectChannels.length > 1) {
    return null;
  }
  const humanName = state.directConversations.find((conversation) => sameValue(conversation.contactId, employee.name))?.humanMemberName ?? (state.humanMembers.length === 1 ? state.humanMembers[0]?.name : void 0);
  if (!humanName) {
    return null;
  }
  return findDirectChannelRecord(state, {
    humanMemberName: humanName,
    employeeName: employee.name
  }) ?? ensureDirectChannelRecord(state, {
    humanMemberName: humanName,
    employeeName: employee.name
  });
}
function removeChannelArtifactsFromState(state, channelName, workspaceId) {
  const documentIds = new Set(
    state.channelDocuments.filter((document) => sameValue(document.channelName, channelName)).map((document) => document.id)
  );
  const runIds = new Set(
    state.channelDocumentRuns.filter((run) => sameValue(run.channelName, channelName)).map((run) => run.id)
  );
  state.channels = state.channels.filter((item) => !sameValue(item.name, channelName));
  state.conversationExecutionWorkspaces = (state.conversationExecutionWorkspaces ?? []).filter(
    (workspace) => !sameValue(workspace.channelName, channelName)
  );
  state.messages = state.messages.filter((message) => !sameValue(message.channel ?? "", channelName));
  state.tasks = state.tasks.filter((task) => !sameValue(task.channel, channelName));
  state.approvals = state.approvals.filter((approval) => !sameValue(approval.channelName, channelName));
  state.dataTables = state.dataTables.map(
    (table) => sameValue(table.channelName ?? "", channelName) ? {
      ...table,
      channelName: void 0
    } : table
  );
  state.scheduledTasks = state.scheduledTasks.map(
    (task) => sameValue(task.channelName ?? "", channelName) ? {
      ...task,
      channelName: void 0
    } : task
  );
  state.channelDocuments = state.channelDocuments.filter((document) => !documentIds.has(document.id));
  state.channelDocumentVersions = state.channelDocumentVersions.filter((version2) => !documentIds.has(version2.documentId));
  state.channelDocumentBlocks = state.channelDocumentBlocks.filter((block) => !documentIds.has(block.documentId));
  state.channelDocumentAccesses = state.channelDocumentAccesses.filter((access) => !documentIds.has(access.documentId));
  state.channelDocumentChangeSets = state.channelDocumentChangeSets.filter((changeSet) => !documentIds.has(changeSet.documentId));
  state.channelDocumentConflicts = state.channelDocumentConflicts.filter((conflict) => !documentIds.has(conflict.documentId));
  state.channelDocumentPresences = state.channelDocumentPresences.filter((presence) => !documentIds.has(presence.documentId));
  state.channelDocumentRuns = state.channelDocumentRuns.filter((run) => !runIds.has(run.id));
  state.channelDocumentRunSteps = state.channelDocumentRunSteps.filter((step) => !runIds.has(step.runId));
  state.externalSheetOperationRuns = (state.externalSheetOperationRuns ?? []).filter(
    (run) => !documentIds.has(run.channelDocumentId)
  );
  state.activeEmployees = state.activeEmployees.map((employee) => ({
    ...employee,
    channels: employee.channels.filter((name) => !sameValue(name, channelName))
  }));
  removeChannelHistoryFile(channelName, workspaceId);
  return state;
}
function createChannelSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const humanMemberNames = uniqueNames(input.humanMemberNames ?? []);
  const employeeNames = uniqueNames(input.employeeNames ?? []);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Channel name is required.");
  }
  if (state.channels.some((channel) => sameValue(channel.name, name))) {
    throw new Error(`Channel "${name}" already exists.`);
  }
  ensureLegacyHumanMembersForDisplayNames(state, humanMemberNames, workspaceId);
  for (const memberName of humanMemberNames) {
    if (!state.humanMembers.some((member) => sameValue(member.name, memberName))) {
      throw new Error(`Human member "${memberName}" does not exist.`);
    }
  }
  for (const employeeName of employeeNames) {
    if (!state.activeEmployees.some((employee) => sameValue(employee.name, employeeName))) {
      throw new Error(`Active employee "${employeeName}" does not exist.`);
    }
  }
  state.channels.push({
    name,
    kind: input.kind ?? "group",
    humanMemberNames,
    humanMembers: humanMemberNames.length,
    employeeNames: [...employeeNames]
  });
  upsertStoredChannelRecordSync(state.channels[state.channels.length - 1], workspaceId);
  state.activeEmployees = state.activeEmployees.map((employee) => {
    if (!employeeNames.some((employeeName) => sameValue(employee.name, employeeName))) {
      return employee;
    }
    if (employee.channels.some((channelName) => sameValue(channelName, name))) {
      return employee;
    }
    return {
      ...employee,
      channels: [...employee.channels, name]
    };
  });
  state.ledger.unshift({
    title: "Channel created",
    note: `Created channel ${name} with ${humanMemberNames.length} human member(s) and ${employeeNames.length} agent(s).`
  });
  pushWorkspaceMessageIfChannel(state, name, {
    speaker: SYSTEM_NOTICE,
    role: "agent",
    summary: `Channel ${name} was created and is ready for collaboration.`,
    code: "channel.created_notice",
    data: { channel_name: name }
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}
function deleteChannelSync(channelName, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel) {
    throw new Error(`Channel "${channelName}" does not exist.`);
  }
  deleteStoredChannelSync(channelName, workspaceId);
  deleteStoredTasksForChannelSync(channelName, workspaceId);
  removeChannelArtifactsFromState(state, channelName, workspaceId);
  state.ledger.unshift({
    title: "Channel deleted",
    note: `Channel ${channelName} was deleted along with related messages, tasks, and memberships.`
  });
  const written = writeWorkspaceStateSync(state, workspaceId);
  pruneOrphanWorkspaceAttachmentsSync(workspaceId ?? DEFAULT_WORKSPACE_ID);
  return written;
}
function renameChannelSync(channelName, nextName, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const trimmedNextName = nextName.trim();
  const channel = state.channels.find((item) => sameValue(item.name, channelName));
  if (!channel) {
    throw new Error(`Channel "${channelName}" does not exist.`);
  }
  if (!trimmedNextName) {
    throw new Error("Next channel name is required.");
  }
  if (sameValue(channel.name, trimmedNextName)) {
    return state;
  }
  if (state.channels.some((item) => !sameValue(item.name, channelName) && sameValue(item.name, trimmedNextName))) {
    throw new Error(`Channel "${trimmedNextName}" already exists.`);
  }
  state.channels = state.channels.map(
    (item) => sameValue(item.name, channelName) ? {
      ...item,
      name: trimmedNextName
    } : item
  );
  state.messages = state.messages.map(
    (message) => sameValue(message.channel ?? "", channelName) ? {
      ...message,
      channel: trimmedNextName
    } : message
  );
  state.conversationExecutionWorkspaces = (state.conversationExecutionWorkspaces ?? []).map(
    (workspace) => sameValue(workspace.channelName, channelName) ? {
      ...workspace,
      channelName: trimmedNextName,
      conversationKey: `${workspace.conversationKind}:${trimmedNextName}:${workspace.agentId}`
    } : workspace
  );
  state.tasks = state.tasks.map(
    (task) => sameValue(task.channel, channelName) ? {
      ...task,
      channel: trimmedNextName
    } : task
  );
  state.activeEmployees = state.activeEmployees.map((employee) => ({
    ...employee,
    channels: employee.channels.map((name) => sameValue(name, channelName) ? trimmedNextName : name)
  }));
  const renamedChannel = state.channels.find((item) => sameValue(item.name, trimmedNextName));
  if (renamedChannel) {
    updateStoredChannelSync(channelName, renamedChannel, workspaceId);
  }
  renameStoredTasksChannelSync(channelName, trimmedNextName, workspaceId);
  renameChannelHistoryFile(channelName, trimmedNextName, workspaceId);
  state.ledger.unshift({
    title: "Channel renamed",
    note: `Channel ${channelName} was renamed to ${trimmedNextName}.`
  });
  pushWorkspaceMessageIfChannel(state, trimmedNextName, {
    speaker: SYSTEM_NOTICE,
    role: "agent",
    summary: `Channel ${channelName} was renamed to ${trimmedNextName}.`,
    code: "channel.renamed_notice",
    data: { previous_name: channelName, next_name: trimmedNextName }
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}
function upsertStoredChannelRecordSync(channel, workspaceId) {
  const existing = readStoredChannelSync(channel.name, workspaceId);
  if (existing) {
    updateStoredChannelSync(channel.name, channel, workspaceId);
    return;
  }
  createStoredChannelSync(channel, workspaceId);
}
function ensureLegacyHumanMembersForDisplayNames(state, displayNames, workspaceId) {
  const missingNames = uniqueNames(displayNames).filter(
    (displayName) => !state.humanMembers.some((member) => sameValue(member.name, displayName))
  );
  if (missingNames.length === 0) {
    return;
  }
  const workspaceMembers = listWorkspaceMemberUsersSync(workspaceId ?? DEFAULT_WORKSPACE_ID);
  for (const displayName of missingNames) {
    const workspaceMember = workspaceMembers.find((member) => sameValue(member.displayName, displayName));
    if (!workspaceMember || state.humanMembers.some((member) => sameValue(member.name, workspaceMember.displayName))) {
      continue;
    }
    state.humanMembers.push({
      name: workspaceMember.displayName,
      role: formatLegacyWorkspaceRole(workspaceMember.role)
    });
  }
}
function formatLegacyWorkspaceRole(role) {
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Member";
}

// ../services/src/documents/access.ts
function ensureChannelDocumentAccessSeeds(state) {
  let changed = false;
  for (const document of state.channelDocuments) {
    const existing = state.channelDocumentAccesses.filter((access) => access.documentId === document.id);
    if (existing.length > 0) {
      continue;
    }
    state.channelDocumentAccesses.unshift(...buildDefaultDocumentAccesses(state, document));
    changed = true;
  }
  return changed;
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

// ../services/src/documents/model.ts
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
  return runs.map((run) => normalizeExternalSheetOperationRun(run)).filter((run) => run !== null && documentIds.has(run.channelDocumentId)).sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
}
function normalizeExternalSheetOperationRun(run) {
  if (!run || typeof run !== "object") {
    return null;
  }
  const candidate = run;
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
  return versions.map((version2) => normalizeChannelDocumentVersion(version2)).filter((version2) => version2 !== null && documentIds.has(version2.documentId)).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
function normalizeChannelDocumentVersion(version2) {
  if (!version2 || typeof version2 !== "object") {
    return null;
  }
  const candidate = version2;
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
function listChannelDocumentBlocks(state, documentId) {
  return state.channelDocumentBlocks.filter((block) => block.documentId === documentId).sort((left, right) => left.order - right.order);
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
  return accesses.map((access) => normalizeChannelDocumentAccess(access)).filter((access) => access !== null).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
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
function normalizeChannelDocumentAccess(access) {
  if (!access || typeof access !== "object") {
    return null;
  }
  const candidate = access;
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
  return sortDirectConversations2(
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
function sortDirectConversations2(threads) {
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
function getWorkspaceDatabaseFilePath() {
  return getDatabaseConnectionLabel();
}
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
function resetWorkspaceStateSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  ensureWorkspaceRecordForStateSync(workspaceId);
  resetWorkspaceExecutionStateSync(workspaceId);
  resetStoredWorkspaceSkillsSync(workspaceId);
  resetStoredKnowledgeAssignmentsSync(workspaceId);
  clearWorkspaceStorageArtifactsSync(workspaceId);
  return writeWorkspaceStateSync(createDefaultWorkspaceState(), workspaceId, {
    skipVersionCheck: true
  });
}
function clearWorkspaceStorageArtifactsSync(workspaceId) {
  rmSync4(getWorkspaceDataDirPath(workspaceId), { recursive: true, force: true });
  rmSync4(getDaemonWorkspaceExecutionRootDir(getLocalDaemonStateDirPath(), workspaceId), {
    recursive: true,
    force: true
  });
  if (workspaceId !== DEFAULT_WORKSPACE_ID) {
    return;
  }
  const dataDir = getDataDirPath();
  rmSync4(join8(dataDir, "attachments"), { recursive: true, force: true });
  rmSync4(join8(dataDir, "channel-history"), { recursive: true, force: true });
  rmSync4(join8(dataDir, "daemon-remote-staging"), { recursive: true, force: true });
  rmSync4(join8(getLocalDaemonStateDirPath(), "workdirs"), { recursive: true, force: true });
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

// ../services/src/workspace/workspace.ts
function bootstrapWorkspaceSync(input, workspaceId) {
  const state = createDefaultWorkspaceState();
  state.organizationName = input.organizationName;
  state.humanMembers = [{ name: input.ownerName, role: input.ownerRole }];
  state.channels = [
    {
      name: input.firstChannelName,
      humanMembers: 1,
      employeeNames: []
    }
  ];
  return writeWorkspaceStateSync(state, workspaceId);
}
function initializeOrganizationSync(input, workspaceId) {
  return bootstrapWorkspaceSync({
    organizationName: input.organizationName,
    ownerName: input.ownerName,
    ownerRole: input.ownerRole,
    firstChannelName: input.firstChannelName ?? "\u603B\u63A7\u5BA4"
  }, workspaceId);
}
function readWorkspaceSnapshotSync() {
  return createWorkspaceSnapshot(ensureWorkspaceStateSync());
}
function readWorkspaceSummarySync() {
  const state = ensureWorkspaceStateSync();
  const snapshot = createWorkspaceSnapshot(state);
  return {
    mode: "im",
    organization: state.organizationName,
    database: getWorkspaceDatabaseFilePath(),
    onlineDigitalEmployees: snapshot.stats[0]?.value ?? "00",
    pendingHandoffs: snapshot.stats[1]?.value ?? "00",
    humanParticipants: snapshot.stats[2]?.value ?? "00",
    channels: state.channels.length,
    materials: state.materials.length,
    messages: state.messages.length,
    tasks: state.tasks.length,
    activeEmployees: state.activeEmployees.length
  };
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
function deleteWorkspaceSkillSync(skillId, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const skill = requireStoredSkill(skillId, workspaceId);
  if (isBuiltinSkill(skill.name)) {
    throw new Error(`${skill.name} \u662F\u7CFB\u7EDF\u9884\u5B9A\u4E49 skill\uFF0C\u4E0D\u80FD\u5220\u9664\u3002`);
  }
  const removed = deleteStoredWorkspaceSkillSync(skillId, workspaceId);
  if (!removed) {
    throw new Error(`Skill "${skillId}" does not exist.`);
  }
  removeStateSkillSnapshot(state, skillId);
  state.activeEmployees = state.activeEmployees.map((employee) => ({
    ...employee,
    skillIds: employee.skillIds.filter((id) => id !== skillId)
  }));
  state.ledger.unshift({
    title: "Skill deleted",
    note: `${skill.name} was removed from the workspace skill library and all agent assignments were cleared.`
  });
  return writeWorkspaceStateRecordSync(normalizeWorkspaceState(state), workspaceId);
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
function removeStateSkillSnapshot(state, skillId) {
  state.skills = state.skills.filter((item) => item.id !== skillId);
}

// ../services/src/employees/employees.ts
var RUNTIME_COORDINATOR2 = "\u7CFB\u7EDF\u63D0\u793A";
function listActiveEmployeesSync() {
  return ensureWorkspaceStateSync().activeEmployees;
}
function listEmployeeRuntimeBindingsForWorkspaceSync(workspaceId) {
  return listEmployeeRuntimeBindingsSync(workspaceId);
}
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
function bindEmployeeRuntimeSync2(employeeName, runtimeId, workspaceId, actorUserId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
  if (!employee) {
    throw new Error(`Active employee "${employeeName}" does not exist.`);
  }
  if (actorUserId) {
    assertCanManageEmployeeForActorSync({ workspaceId, employeeName: employee.name, actorUserId });
    assertCanUseRuntimeForActorSync({ workspaceId, runtimeId, actorUserId });
  }
  const binding = bindEmployeeRuntimeSync({
    workspaceId,
    employeeName: employee.name,
    runtimeId
  });
  state.ledger.unshift({
    title: "Runtime bound",
    note: `${employee.name} was bound to ${binding.runtimeName}.`
  });
  pushWorkspaceMessageIfChannel(state, employee.channels[0], {
    speaker: RUNTIME_COORDINATOR2,
    role: "agent",
    summary: `${employee.name} is now bound to native runtime ${binding.runtimeName}.`,
    code: "runtime.bound",
    data: { employee_name: employee.name, runtime_name: binding.runtimeName }
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}
function unbindEmployeeRuntimeSync2(employeeName, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const employee = state.activeEmployees.find((item) => sameValue(item.name, employeeName));
  if (!employee) {
    throw new Error(`Active employee "${employeeName}" does not exist.`);
  }
  const removed = unbindEmployeeRuntimeSync(employee.name, workspaceId);
  if (!removed) {
    throw new Error(`${employee.name} \u5F53\u524D\u6CA1\u6709\u7ED1\u5B9A runtime\u3002`);
  }
  state.ledger.unshift({
    title: "Runtime unbound",
    note: `${employee.name} was unbound from the native runtime.`
  });
  pushWorkspaceMessageIfChannel(state, employee.channels[0], {
    speaker: RUNTIME_COORDINATOR2,
    role: "agent",
    summary: `${employee.name} was unbound from the native runtime.`,
    code: "runtime.unbound",
    data: { employee_name: employee.name }
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}
function createEmployeeSync(input, workspaceId) {
  const workspaceSkills = listWorkspaceSkillsSync(workspaceId);
  const state = ensureWorkspaceStateSync(workspaceId);
  if (state.activeEmployees.some((employee) => sameValue(employee.name, input.name))) {
    throw new Error(`Active employee "${input.name}" already exists.`);
  }
  const activeEmployee = {
    name: input.name,
    role: input.role ?? "Agent",
    remarkName: input.remarkName?.trim() || input.name,
    ownerUserId: input.ownerUserId?.trim() || void 0,
    channelMemberAccess: input.channelMemberAccess ?? (input.ownerUserId?.trim() ? "disabled" : "enabled"),
    origin: input.origin ?? "manual",
    summary: input.summary ?? `${input.name} joined the workspace directly.`,
    traits: input.traits ?? [],
    fit: input.fit ?? "Ready to collaborate immediately.",
    skillIds: normalizeSkillIds(input.skillIds, workspaceSkills),
    channels: [],
    status: "active",
    instructions: input.instructions?.trim() || ""
  };
  state.activeEmployees.push(activeEmployee);
  createStoredEmployeeSync(activeEmployee, workspaceId);
  setStoredEmployeeSkillAssignmentsSync(activeEmployee.name, activeEmployee.skillIds, workspaceId);
  state.pendingHandoffs += 1;
  state.ledger.unshift({
    title: "Employee created",
    note: `${input.name} joined the workspace directly and is waiting to be added to channels.`
  });
  return writeWorkspaceStateSync(state, workspaceId);
}

// ../services/src/contacts/contacts.ts
function upsertDirectConversationStateSync(input, workspaceId, stateArg) {
  const state = stateArg ?? ensureWorkspaceStateSync(workspaceId);
  const employee = state.activeEmployees.find((item) => sameValue(item.name, input.contactId));
  const shell = ensureLegacyContactShell(
    state,
    input.contactId,
    employee,
    Boolean(input.sessionId || input.workDir || input.humanMemberName),
    input.humanMemberName
  );
  if (!shell) {
    throw new Error(`Direct conversation "${input.contactId}" does not exist.`);
  }
  shell.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  shell.humanMemberName = input.humanMemberName ?? shell.humanMemberName;
  shell.sessionId = input.sessionId === null ? void 0 : input.sessionId ?? shell.sessionId;
  shell.workDir = input.workDir === null ? void 0 : input.workDir ?? shell.workDir;
  state.directConversations = sortDirectConversations(state.directConversations);
  return stateArg ? state : writeWorkspaceStateSync(state, workspaceId);
}
function ensureLegacyContactShell(state, contactId, employee, required = false, humanMemberName) {
  const existing = state.directConversations.find((item) => sameValue(item.contactId, contactId));
  if (existing) {
    return existing;
  }
  if (!employee || !required) {
    return null;
  }
  const shell = {
    contactId: employee.name,
    humanMemberName: humanMemberName ?? state.humanMembers[0]?.name,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  state.directConversations.unshift(shell);
  return shell;
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
import { mkdirSync as mkdirSync4, rmSync as rmSync5, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname4, join as join9 } from "node:path";
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
  const compatibilityDir = join9(input.workDir, ".agent_context", "skills");
  writeSkillsToRoot(input.skills, compatibilityDir);
  const nativeSegments = PROVIDER_NATIVE_SKILL_ROOT_SEGMENTS[input.provider];
  const nativeDir = nativeSegments ? join9(input.workDir, ...nativeSegments) : void 0;
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
  rmSync5(rootDir, { recursive: true, force: true });
  mkdirSync4(rootDir, { recursive: true });
  for (const skill of skills) {
    const skillDir = join9(rootDir, `${sanitizeSkillDirectoryName(skill.name)}-${skill.id.slice(-6)}`);
    mkdirSync4(skillDir, { recursive: true });
    for (const file of skill.files) {
      const relativePath = normalizeSkillFilePath(file.path);
      if (!relativePath) {
        continue;
      }
      const targetPath = join9(skillDir, relativePath);
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
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
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
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (val instanceof u8)
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
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
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i = 0; i < str.length; ++i)
      ar_1[i] = str.charCodeAt(i);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
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
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i = 0; i < files.length; ++i) {
    var f = files[i];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}
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

// ../services/src/skills/export.ts
function exportWorkspaceSkillsArchiveSync(input) {
  const uniqueSkillIds = [...new Set(input.skillIds.map((skillId) => skillId.trim()).filter(Boolean))];
  if (uniqueSkillIds.length === 0) {
    throw new Error("At least one skill must be selected for export.");
  }
  const skills = uniqueSkillIds.map((skillId) => {
    const skill = readWorkspaceSkillSync(skillId, input.workspaceId);
    if (!skill) {
      throw new Error(`Skill "${skillId}" does not exist.`);
    }
    return skill;
  });
  const files = {};
  const manifestSkills = [];
  for (const skill of skills) {
    const skillDir = `${sanitizeArchiveSegment(skill.name)}-${skill.id.slice(-6)}`;
    manifestSkills.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sourceType: skill.sourceType,
      sourceUrl: skill.sourceUrl,
      fileCount: skill.files.length,
      updatedAt: skill.updatedAt
    });
    files[`${skillDir}/skill.json`] = strToU8(JSON.stringify({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sourceType: skill.sourceType ?? "manual",
      sourceUrl: skill.sourceUrl ?? null,
      configJson: skill.configJson ?? "{}",
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt
    }, null, 2));
    for (const file of skill.files) {
      files[`${skillDir}/${file.path}`] = strToU8(file.content);
    }
  }
  const exportedAt = (/* @__PURE__ */ new Date()).toISOString();
  const manifest = {
    exportedAt,
    skillCount: manifestSkills.length,
    skills: manifestSkills
  };
  files["skills-manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return {
    fileName: manifestSkills.length === 1 ? `${sanitizeArchiveSegment(manifestSkills[0]?.name ?? "skill")}.zip` : `skills-export-${exportedAt.slice(0, 10)}.zip`,
    zipBytes: zipSync(files, { level: 6 }),
    manifest
  };
}
function sanitizeArchiveSegment(value) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "skill";
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

// ../services/src/tasks/tasks.ts
var RUNTIME_COORDINATOR3 = "\u7CFB\u7EDF\u63D0\u793A";
var TASK_DISPATCHER = "\u7CFB\u7EDF\u63D0\u793A";
function listTasksSync(workspaceId) {
  return ensureWorkspaceStateSync(workspaceId).tasks;
}
function createTaskSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  if (!state.channels.some((channel) => sameValue(channel.name, input.channel))) {
    throw new Error(`Channel "${input.channel}" does not exist.`);
  }
  if (!state.activeEmployees.some((employee) => sameValue(employee.name, input.assignee))) {
    throw new Error(`Active employee "${input.assignee}" does not exist.`);
  }
  if (input.requestedByUserId) {
    assertCanUseEmployeeInChannelForActorSync({
      workspaceId,
      employeeName: input.assignee,
      channelName: input.channel,
      actorUserId: input.requestedByUserId,
      actorDisplayName: input.requestedByDisplayName
    });
    assertCanUseBoundEmployeeRuntimeInChannelForActorSync({
      workspaceId,
      employeeName: input.assignee,
      channelName: input.channel,
      actorUserId: input.requestedByUserId,
      actorDisplayName: input.requestedByDisplayName
    });
  }
  state.tasks.unshift({
    id: `task-${Date.now()}`,
    title: input.title,
    channel: input.channel,
    assignee: input.assignee,
    priority: input.priority,
    status: "todo"
  });
  const createdTask = state.tasks[0];
  if (createdTask) {
    createStoredTaskSync(createdTask, workspaceId);
  }
  state.pendingHandoffs += 1;
  state.ledger.unshift({
    title: "Task created",
    note: `${input.assignee} received task ${input.title} in ${input.channel}.`
  });
  pushWorkspaceMessageToChannel(state, input.channel, {
    speaker: TASK_DISPATCHER,
    role: "agent",
    summary: `A new task was assigned to ${input.assignee}: ${input.title}.`,
    code: "task.assigned_notice",
    data: { assignee: input.assignee, task_title: input.title }
  }, workspaceId);
  const binding = readEmployeeRuntimeBindingSync(input.assignee, workspaceId);
  if (binding && createdTask) {
    const queued = enqueueNativeTaskSync({
      workspaceId,
      taskId: createdTask.id,
      assignee: input.assignee,
      title: input.title,
      channel: input.channel,
      priority: input.priority,
      requestedByUserId: input.requestedByUserId,
      requestedByDisplayName: input.requestedByDisplayName
    });
    if (queued) {
      state.ledger.unshift({
        title: "Task queued",
        note: `${input.title} entered the native queue and is waiting for ${binding.runtimeName}.`
      });
      pushWorkspaceMessageToChannel(state, input.channel, {
        speaker: RUNTIME_COORDINATOR3,
        role: "agent",
        summary: `Task ${input.title} entered the native queue for runtime ${binding.runtimeName}.`,
        code: "task.queued_notice",
        data: { task_title: input.title, runtime_name: binding.runtimeName }
      }, workspaceId);
    }
  }
  return writeWorkspaceStateSync(state, workspaceId);
}
function updateTaskStatusSync(taskId, status, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(`Task "${taskId}" does not exist.`);
  }
  task.status = status;
  updateStoredTaskSync(task.id, task, workspaceId);
  state.ledger.unshift({
    title: "Task status updated",
    note: `Task ${task.title} was updated to ${status}.`
  });
  pushWorkspaceMessageToChannel(state, task.channel, {
    speaker: TASK_DISPATCHER,
    role: "agent",
    summary: `Task ${task.title} status was updated to ${status}.`,
    code: "task.status_notice",
    data: { task_title: task.title, status }
  }, workspaceId);
  if (status === "blocked") {
    recordTaskBlockedByWorkspaceStatus(task, workspaceId);
  }
  if (status === "done" && state.pendingHandoffs > 0) {
    state.pendingHandoffs -= 1;
  }
  return writeWorkspaceStateSync(state, workspaceId);
}
function recordTaskBlockedByWorkspaceStatus(task, workspaceId) {
  const queued = listQueuedTasksSync({ workspaceId }).find((candidate) => candidate.issueId === task.id);
  if (!queued) {
    return;
  }
  const context = buildTaskExecutionEventContext(queued);
  recordTaskExecutionEventSync2({
    ...context,
    type: "blocked",
    title: "Task marked blocked",
    summary: `${task.title} needs intervention before it can continue.`,
    severity: "warning",
    status: "failed",
    data: {
      issueId: task.id,
      taskTitle: task.title,
      workspaceTaskStatus: task.status,
      triggerType: context.triggerType
    }
  });
}

// ../services/src/materials/materials.ts
import { copyFileSync, existsSync as existsSync7, mkdirSync as mkdirSync5, readFileSync as readFileSync4, statSync as statSync3 } from "node:fs";
import { basename as basename4, extname as extname3, join as join10 } from "node:path";
function listMaterialsSync() {
  return ensureWorkspaceStateSync().materials;
}
function addMaterialSync(source, status) {
  const state = ensureWorkspaceStateSync();
  state.materials.unshift({
    id: `mat-${Date.now()}`,
    source,
    status,
    kind: "note"
  });
  state.ledger.unshift({
    title: "Material added",
    note: `Added material source ${source} with status ${status}.`
  });
  return writeWorkspaceStateSync(state);
}
function importMaterialFileSync(input) {
  const state = ensureWorkspaceStateSync();
  if (!existsSync7(input.filePath)) {
    throw new Error(`File "${input.filePath}" does not exist.`);
  }
  const materialsDir = join10(resolveRepositoryRoot3(), STATE_DIR, "materials");
  if (!existsSync7(materialsDir)) {
    mkdirSync5(materialsDir, { recursive: true });
  }
  const originalName = basename4(input.filePath);
  const ext = extname3(originalName);
  const base = originalName.slice(0, Math.max(0, originalName.length - ext.length));
  const safeBase = slugify(base);
  const targetName = `${Date.now()}-${safeBase}${ext}`;
  const targetPath = join10(materialsDir, targetName);
  copyFileSync(input.filePath, targetPath);
  const fileStat = statSync3(targetPath);
  const source = input.label ?? originalName;
  state.materials.unshift({
    id: `mat-${Date.now()}`,
    source,
    status: input.status,
    kind: "file",
    originalPath: input.filePath,
    storedPath: targetPath,
    sizeBytes: fileStat.size
  });
  state.ledger.unshift({
    title: "File imported",
    note: `Imported file ${source} and stored it as ${targetName} for downstream processing.`
  });
  return writeWorkspaceStateSync(state);
}
function parseMaterialSync(id) {
  const state = ensureWorkspaceStateSync();
  const material = state.materials.find((item) => item.id === id);
  if (!material) {
    throw new Error(`Material "${id}" does not exist.`);
  }
  const targetPath = material.storedPath ?? material.originalPath;
  if (!targetPath || !existsSync7(targetPath)) {
    throw new Error(`Material "${material.source}" has no readable file source.`);
  }
  const raw = readFileSync4(targetPath, "utf8");
  const preview = raw.replace(/\s+/g, " ").trim().slice(0, 220);
  material.preview = preview || "The file is readable, but there is no displayable text to preview.";
  material.status = "parsed";
  state.ledger.unshift({
    title: "Material parsed",
    note: `File ${material.source} completed first-pass parsing and is ready for downstream processing.`
  });
  return writeWorkspaceStateSync(state);
}

// ../services/src/documents/service.ts
function listChannelDocumentVersions(state, documentId) {
  return state.channelDocumentVersions.filter((version2) => version2.documentId === documentId).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

// ../services/src/context/provider.ts
function buildContactAgentContext(state, agentName) {
  const self = state.activeEmployees.find((employee) => sameValue(employee.name, agentName));
  const selfChannels = self?.channels ?? [];
  if (!self) {
    return {
      self: {
        name: agentName,
        role: "Agent",
        channels: []
      },
      knownEntities: []
    };
  }
  const knownEntities = state.activeEmployees.filter((employee) => !sameValue(employee.name, self.name)).map((employee) => buildContactContextEntity(state, self, employee)).filter((entity) => entity !== void 0).sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" }));
  return {
    self: {
      name: self.name,
      role: self.role,
      channels: [...selfChannels]
    },
    knownEntities
  };
}
function buildContactContextEntity(state, self, candidate) {
  const sharedChannels = getSharedChannels(self, candidate);
  if (sharedChannels.length === 0) {
    return void 0;
  }
  const recentInteraction = findRecentSharedInteraction(state.messages, self.name, candidate.name, sharedChannels);
  return {
    type: "employee",
    name: candidate.name,
    role: candidate.role,
    relationship: "workspace-collaborator",
    sharedChannels,
    observedLabels: collectObservedLabels(state.messages, candidate.name, sharedChannels),
    recentSharedInteractionChannel: recentInteraction?.channel,
    recentSharedInteractionTime: recentInteraction?.time,
    recentSharedInteractionSummary: recentInteraction?.summary
  };
}
function getSharedChannels(self, candidate) {
  return uniqueNames(
    self.channels.filter((channelName) => candidate.channels.some((item) => sameValue(item, channelName)))
  );
}
function collectObservedLabels(messages, entityName, sharedChannels) {
  const labels = [];
  for (const message of messages) {
    const channelName = message.channel;
    if (!channelName || !sharedChannels.some((sharedChannel) => sameValue(sharedChannel, channelName))) {
      continue;
    }
    for (const mention of message.mentions ?? []) {
      if (mention.mentionType !== "agent" || !sameValue(mention.agentId, entityName)) {
        continue;
      }
      const token = mention.token.trim();
      if (!token || sameValue(token, entityName)) {
        continue;
      }
      labels.push(token);
    }
  }
  return uniqueNames(labels);
}
function findRecentSharedInteraction(messages, selfName, entityName, sharedChannels) {
  let best;
  for (const message of messages) {
    const channelName = message.channel;
    if (!channelName || !sharedChannels.some((sharedChannel) => sameValue(sharedChannel, channelName))) {
      continue;
    }
    if (message.status === "pending") {
      continue;
    }
    const score = scoreSharedInteraction(message, selfName, entityName);
    if (score === 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = {
        score,
        channel: channelName,
        time: message.time,
        summary: truncateInteractionSummary(message.summary)
      };
    }
  }
  if (!best) {
    return void 0;
  }
  return {
    channel: best.channel,
    time: best.time,
    summary: best.summary
  };
}
function scoreSharedInteraction(message, selfName, entityName) {
  const mentionsSelf = message.mentions?.some((mention) => mention.mentionType === "agent" && sameValue(mention.agentId, selfName)) ?? false;
  const mentionsEntity = message.mentions?.some((mention) => mention.mentionType === "agent" && sameValue(mention.agentId, entityName)) ?? false;
  const speakerIsSelf = sameValue(message.speaker, selfName);
  const speakerIsEntity = sameValue(message.speaker, entityName);
  if (speakerIsEntity && mentionsSelf || speakerIsSelf && mentionsEntity) {
    return 5;
  }
  if (mentionsSelf && mentionsEntity) {
    return 4;
  }
  if (speakerIsEntity && mentionsEntity) {
    return 3;
  }
  if (mentionsEntity) {
    return 2;
  }
  if (speakerIsEntity) {
    return 1;
  }
  return 0;
}
function truncateInteractionSummary(value) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 177)}...`;
}

// ../services/src/context/query.ts
function listWorkspaceContextEntitiesSync(agentName, workspaceId) {
  return listWorkspaceContextEntities(ensureWorkspaceStateSync(workspaceId), agentName);
}
function listWorkspaceContextEntities(state, agentName) {
  return buildContactAgentContext(state, agentName).knownEntities;
}
function resolveWorkspaceContextEntitySync(agentName, query, workspaceId) {
  return resolveWorkspaceContextEntity(ensureWorkspaceStateSync(workspaceId), agentName, query);
}
function resolveWorkspaceContextEntity(state, agentName, query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return void 0;
  }
  return listWorkspaceContextEntities(state, agentName).find(
    (entity) => sameValue(entity.name, trimmed) || entity.observedLabels.some((label) => sameValue(label, trimmed))
  );
}
function listWorkspaceContextChannelsSync(agentName, workspaceId) {
  return listWorkspaceContextChannels(ensureWorkspaceStateSync(workspaceId), agentName);
}
function listWorkspaceContextChannels(state, agentName) {
  const visibleChannels = getVisibleChannels(state, agentName);
  return visibleChannels.map((channelName) => {
    const channel = state.channels.find((item) => sameValue(item.name, channelName));
    return {
      name: channelName,
      memberNames: channel?.employeeNames.filter((item) => !sameValue(item, agentName)) ?? [],
      documentCount: state.channelDocuments.filter(
        (document) => sameValue(document.channelName, channelName) && document.status === "active"
      ).length
    };
  });
}
function listWorkspaceContextDocumentsSync(agentName, channelName, workspaceId) {
  return listWorkspaceContextDocuments(ensureWorkspaceStateSync(workspaceId), agentName, channelName);
}
function listWorkspaceContextDocuments(state, agentName, channelName) {
  const visibleChannels = getVisibleChannels(state, agentName);
  const canReadSpecificChannel = !channelName || visibleChannels.some((visibleChannel) => sameValue(visibleChannel, channelName));
  if (!canReadSpecificChannel) {
    return [];
  }
  return state.channelDocuments.filter((document) => {
    if (document.status !== "active") {
      return false;
    }
    if (channelName && !sameValue(document.channelName, channelName)) {
      return false;
    }
    return visibleChannels.some((visibleChannel) => sameValue(visibleChannel, document.channelName));
  });
}
function searchWorkspaceContextMessagesSync(agentName, query, channelName, workspaceId) {
  return searchWorkspaceContextMessages(ensureWorkspaceStateSync(workspaceId), agentName, query, channelName);
}
function searchWorkspaceContextMessages(state, agentName, query, channelName) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const visibleChannels = getVisibleChannels(state, agentName);
  const lowerQuery = trimmed.toLocaleLowerCase("zh-CN");
  return state.messages.filter((message) => isVisibleMessage(message, visibleChannels, channelName)).filter((message) => message.summary.toLocaleLowerCase("zh-CN").includes(lowerQuery)).slice(0, 20).map((message) => ({
    channelName: message.channel ?? "",
    speaker: message.speaker,
    summary: message.summary,
    time: message.time
  }));
}
function getVisibleChannels(state, agentName) {
  const self = state.activeEmployees.find((employee) => sameValue(employee.name, agentName));
  if (!self) {
    return [];
  }
  return uniqueNames(self.channels);
}
function isVisibleMessage(message, visibleChannels, channelName) {
  if (!message.channel) {
    return false;
  }
  if (!visibleChannels.some((visibleChannel) => sameValue(visibleChannel, message.channel ?? ""))) {
    return false;
  }
  if (channelName && !sameValue(channelName, message.channel)) {
    return false;
  }
  if (message.status === "pending") {
    return false;
  }
  return true;
}

// ../services/src/budgets/budgets.ts
function checkBudgetSync(scope, scopeId, workspaceId = DEFAULT_WORKSPACE_ID) {
  const budget = readBudgetSync(scope, scopeId, workspaceId);
  if (!budget || !budget.enabled) {
    return { status: "ok" };
  }
  const since = budget.period === "monthly" ? getMonthStartIso() : void 0;
  const spentUsd = getSpentUsdSync(scope, scopeId, since, workspaceId);
  const percentUsed = budget.limitUsd > 0 ? spentUsd / budget.limitUsd : 0;
  if (spentUsd >= budget.limitUsd) {
    return { status: "exceeded", budget, spentUsd, percentUsed, action: budget.action };
  }
  if (percentUsed >= budget.warningThreshold) {
    return { status: "warning", budget, spentUsd, percentUsed };
  }
  return { status: "ok" };
}
function checkAllBudgetsForAgentSync(agentId, channelName, workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceCheck = checkBudgetSync("workspace", workspaceId, workspaceId);
  if (workspaceCheck.status === "exceeded") return workspaceCheck;
  const agentCheck = checkBudgetSync("agent", agentId, workspaceId);
  if (agentCheck.status === "exceeded") return agentCheck;
  if (channelName) {
    const channelCheck = checkBudgetSync("channel", channelName, workspaceId);
    if (channelCheck.status === "exceeded") return channelCheck;
  }
  if (workspaceCheck.status === "warning") return workspaceCheck;
  if (agentCheck.status === "warning") return agentCheck;
  if (channelName) {
    const channelCheck = checkBudgetSync("channel", channelName, workspaceId);
    if (channelCheck.status === "warning") return channelCheck;
  }
  return { status: "ok" };
}
function listBudgetsWithSpentSync(workspaceId = DEFAULT_WORKSPACE_ID) {
  const budgets = listBudgetsSync(workspaceId);
  return budgets.map((budget) => {
    const since = budget.period === "monthly" ? getMonthStartIso() : void 0;
    const spentUsd = getSpentUsdSync(budget.scope, budget.scopeId, since, workspaceId);
    return {
      ...budget,
      spentUsd,
      percentUsed: budget.limitUsd > 0 ? spentUsd / budget.limitUsd : 0
    };
  });
}

// ../services/src/documents/sync.ts
var DOC_COORDINATOR2 = "\u7CFB\u7EDF\u63D0\u793A";
function listChannelDocumentVersionsSync(documentId, workspaceId) {
  return listChannelDocumentVersions(ensureWorkspaceStateSync(workspaceId), documentId);
}
function listChannelDocumentBlocksSync(documentId, workspaceId) {
  return listChannelDocumentBlocks(ensureWorkspaceStateSync(workspaceId), documentId);
}
function markChannelDocumentRunStepRunningSync(queuedTaskId, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const step = findChannelDocumentRunStepByQueuedTaskId(state, queuedTaskId);
  if (!step) {
    return state;
  }
  markChannelDocumentRunStepRunning(state, step.id);
  if (step.documentId) {
    upsertDocumentPresence(state, {
      documentId: step.documentId,
      actorId: step.agentLabel,
      actorType: "agent",
      status: "processing"
    });
  }
  return writeWorkspaceStateSync(state, workspaceId);
}
function completeChannelDocumentRunStepSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const step = findChannelDocumentRunStepByQueuedTaskId(state, input.queuedTaskId);
  if (!step) {
    return state;
  }
  const derivedWarningText = input.warningText?.trim() || (step.handoffKind === "document" && (input.documentUpdates?.length ?? 0) === 0 ? `No new document version was written by ${step.agentLabel}.` : void 0);
  const { readySteps } = markChannelDocumentRunStepCompleted(state, {
    stepId: step.id,
    documentUpdates: input.documentUpdates,
    warningText: derivedWarningText
  });
  const run = state.channelDocumentRuns.find((item) => item.id === step.runId);
  if (run) {
    const sourceMessage = state.messages.find((message) => message.id === run.sourceMessageId);
    const attachments = sourceMessage?.attachments;
    const runSteps = listChannelDocumentRunSteps(state, run.id);
    pushWorkspaceMessageToChannel(state, run.channelName, {
      speaker: DOC_COORDINATOR2,
      role: "agent",
      summary: step.status === "completed_with_warning" ? `Workflow step finished by ${step.agentLabel} with warning: ${step.lastWarning ?? "warning"}.` : `Workflow step completed by ${step.agentLabel}.`,
      code: step.status === "completed_with_warning" ? "channel_document.step_completed_without_update_notice" : "channel_document.step_completed_notice",
      data: {
        channel_name: run.channelName,
        run_id: run.id,
        agent_label: step.agentLabel
      },
      status: step.status === "completed_with_warning" ? "error" : "completed"
    }, workspaceId);
    for (const readyStep of readySteps) {
      const handoffDocumentId = runSteps.filter((item) => readyStep.dependsOnStepIds.includes(item.id) && item.documentId).map((item) => item.documentId).filter((value, index, all) => all.indexOf(value) === index);
      const handoffDocumentVersionId = runSteps.filter((item) => readyStep.dependsOnStepIds.includes(item.id) && item.documentVersionId).map((item) => item.documentVersionId).filter((value, index, all) => all.indexOf(value) === index);
      if (readyStep.handoffKind === "document" && handoffDocumentId.length === 1) {
        readyStep.documentId = handoffDocumentId[0];
      }
      if (readyStep.handoffKind === "document" && handoffDocumentVersionId.length === 1) {
        readyStep.documentVersionId = handoffDocumentVersionId[0];
      }
      enqueueChannelMentionStepSync(state, {
        channelName: run.channelName,
        sourceMessage,
        fullMessage: run.sourceSummary,
        attachments,
        step: readyStep,
        mentionedAgentIds: runSteps.map((item) => item.agentId),
        mentionedAgentLabels: runSteps.map((item) => item.agentLabel),
        handoffDocumentIds: handoffDocumentId,
        handoffDocumentVersionIds: handoffDocumentVersionId,
        workspaceId
      });
      pushWorkspaceMessageToChannel(state, run.channelName, {
        speaker: DOC_COORDINATOR2,
        role: "agent",
        summary: `Workflow moved to ${readyStep.agentLabel}: ${readyStep.instruction}`,
        code: "channel_document.step_queued_notice",
        data: {
          channel_name: run.channelName,
          run_id: run.id,
          agent_label: readyStep.agentLabel
        }
      }, workspaceId);
    }
    const latestRun = state.channelDocumentRuns.find((item) => item.id === run.id);
    if (latestRun?.status === "completed" || latestRun?.status === "completed_with_warning") {
      const hasDocumentStepWithoutNewVersion = runSteps.some(
        (item) => item.handoffKind === "document" && (item.status === "completed" || item.status === "completed_with_warning") && !item.documentVersionId
      );
      pushWorkspaceMessageToChannel(state, run.channelName, {
        speaker: DOC_COORDINATOR2,
        role: "agent",
        summary: latestRun.status === "completed_with_warning" || hasDocumentStepWithoutNewVersion ? "Document workflow finished, but some document steps did not write a new version." : "Document workflow completed.",
        code: latestRun.status === "completed_with_warning" || hasDocumentStepWithoutNewVersion ? "channel_document.run_completed_with_warning_notice" : "channel_document.run_completed_notice",
        data: {
          channel_name: run.channelName,
          run_id: run.id
        },
        status: latestRun.status === "completed_with_warning" || hasDocumentStepWithoutNewVersion ? "error" : "completed"
      }, workspaceId);
    }
  }
  if (step.documentId) {
    clearDocumentPresence(state, {
      documentId: step.documentId,
      actorId: step.agentLabel,
      actorType: "agent"
    });
  }
  return writeWorkspaceStateSync(state, workspaceId);
}
function failChannelDocumentRunStepSync(input, workspaceId) {
  const state = ensureWorkspaceStateSync(workspaceId);
  const step = findChannelDocumentRunStepByQueuedTaskId(state, input.queuedTaskId);
  if (!step) {
    return state;
  }
  const { run } = markChannelDocumentRunStepFailed(state, step.id, input.errorText);
  if (step.documentId) {
    clearDocumentPresence(state, {
      documentId: step.documentId,
      actorId: step.agentLabel,
      actorType: "agent"
    });
  }
  pushWorkspaceMessageToChannel(state, run.channelName, {
    speaker: DOC_COORDINATOR2,
    role: "agent",
    summary: `Document workflow failed at ${step.agentLabel}: ${input.errorText}`,
    code: "channel_document.run_failed_notice",
    data: {
      channel_name: run.channelName,
      run_id: run.id,
      agent_label: step.agentLabel
    },
    status: "error"
  }, workspaceId);
  return writeWorkspaceStateSync(state, workspaceId);
}
function upsertDocumentPresence(state, input) {
  const existing = state.channelDocumentPresences.find(
    (presence) => presence.documentId === input.documentId && sameValue(presence.actorId, input.actorId) && presence.actorType === input.actorType
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing) {
    existing.status = input.status;
    existing.updatedAt = now;
    return;
  }
  state.channelDocumentPresences.unshift({
    id: `channel-doc-presence-${createOpaqueId()}`,
    documentId: input.documentId,
    actorId: input.actorId,
    actorType: input.actorType,
    status: input.status,
    updatedAt: now
  });
}
function clearDocumentPresence(state, input) {
  state.channelDocumentPresences = state.channelDocumentPresences.filter(
    (presence) => !(presence.documentId === input.documentId && sameValue(presence.actorId, input.actorId) && presence.actorType === input.actorType)
  );
}

// ../services/src/document-permissions/document-permissions.ts
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
function listDocumentPermissionRequestsSync2(input) {
  return listDocumentPermissionRequestsSync({
    workspaceId: input.workspaceId,
    requestedByAgentName: input.requestedByAgentName,
    documentId: input.documentId
  });
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
function resolveChannelContextRole(state, document, agentName) {
  const access = state.channelDocumentAccesses.find(
    (item) => item.documentId === document.id && item.actorType === "agent" && sameValue(item.actorId, agentName)
  );
  if (access?.role === "owner") {
    return void 0;
  }
  return access?.role ?? "editor";
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

// ../../apps/cli/src/lib/args.ts
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

// ../../apps/cli/src/lib/format.ts
function parseFormat(args) {
  const rest = [];
  let format = "text";
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--json") {
      format = "json";
      continue;
    }
    if (token === "--format") {
      const nextValue = args[index + 1];
      if (nextValue === "json" || nextValue === "text") {
        format = nextValue;
        index += 1;
        continue;
      }
    }
    rest.push(token);
  }
  return { format, rest };
}
function writeData(format, value) {
  if (format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    console.log(renderTable(value));
    return;
  }
  if (value && typeof value === "object") {
    console.log(renderObject(value));
    return;
  }
  console.log(String(value));
}
function renderObject(value) {
  return Object.entries(value).map(([key, entry]) => `${key}: ${String(entry)}`).join("\n");
}
function renderTable(rows) {
  if (rows.length === 0) {
    return "No rows.";
  }
  const normalizedRows = rows.map((row) => normalizeRow(row));
  const headers = Array.from(new Set(normalizedRows.flatMap((row) => Object.keys(row))));
  const widths = headers.map(
    (header) => Math.max(header.length, ...normalizedRows.map((row) => String(row[header] ?? "").length))
  );
  const head = headers.map((header, index) => header.padEnd(widths[index])).join("  ");
  const rule = widths.map((width) => "-".repeat(width)).join("  ");
  const body = normalizedRows.map(
    (row) => headers.map((header, index) => String(row[header] ?? "").padEnd(widths[index])).join("  ")
  );
  return [head, rule, ...body].join("\n");
}
function normalizeRow(row) {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    return row;
  }
  return { value: row };
}

// ../../apps/cli/src/commands/channel.ts
function runChannelCommand(subcommand, args, format) {
  if (subcommand === "list") {
    writeData(format, readWorkspaceSnapshotSync().channels);
    return 0;
  }
  if (subcommand === "create") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    if (!name) {
      console.error("Usage: agent-space channel create --name <name> [--json]");
      return 1;
    }
    const state = createChannelSync({ name });
    writeData(format, {
      ok: true,
      channel: name,
      totalChannels: state.channels.length
    });
    return 0;
  }
  if (subcommand === "delete") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    if (!name) {
      console.error("Usage: agent-space channel delete --name <name> [--json]");
      return 1;
    }
    const state = deleteChannelSync(name);
    writeData(format, {
      ok: true,
      channel: name,
      totalChannels: state.channels.length
    });
    return 0;
  }
  if (subcommand === "rename") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    const nextName = getStringFlag(flags, "to");
    if (!name || !nextName) {
      console.error("Usage: agent-space channel rename --name <name> --to <next-name> [--json]");
      return 1;
    }
    const state = renameChannelSync(name, nextName);
    writeData(format, {
      ok: true,
      from: name,
      to: nextName,
      totalChannels: state.channels.length
    });
    return 0;
  }
  console.error("Usage: agent-space channel list [--json]");
  console.error("   or: agent-space channel create --name <name> [--json]");
  console.error("   or: agent-space channel delete --name <name> [--json]");
  console.error("   or: agent-space channel rename --name <name> --to <next-name> [--json]");
  return 1;
}

// ../../apps/cli/src/commands/daemon.ts
import {
  createReadStream,
  existsSync as existsSync9,
  mkdirSync as mkdirSync8,
  openSync,
  readFileSync as readFileSync6,
  rmSync as rmSync8,
  statSync as statSync5,
  writeFileSync as writeFileSync6
} from "node:fs";
import { spawn } from "node:child_process";
import { dirname as dirname5, join as join14 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { arch, platform, version as nodeVersion } from "node:process";
import {
  detectProviders as detectSharedProviders,
  collectRuntimeOutputBundle,
  applyDocumentRuntimeOutputOperations,
  applyKnowledgeProposalOperations,
  buildDocumentRuntimeToolCapabilities,
  normalizeProviderTaskErrorCategory,
  buildProviderRuntimeMetadata,
  readProviderTaskFailureMetadata,
  readGoogleWorkspaceReadiness,
  resolveModelId as resolveSharedModelId,
  runProviderTask as runSharedProviderTask,
  runRemoteDaemonForeground as runStandaloneRemoteDaemonForeground
} from "agent-space-daemon";

// ../../apps/cli/src/lib/channel-documents.ts
import {
  applyChannelDocumentOperations,
  buildChannelDocumentPromptLines,
  clearChannelDocumentOperationArtifacts,
  materializeChannelDocuments,
  resolveChannelDocuments
} from "agent-space-daemon";

// src/task-context.ts
import { copyFileSync as copyFileSync2, mkdirSync as mkdirSync7, rmSync as rmSync7, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join13 } from "node:path";

// src/channel-documents.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync6, readFileSync as readFileSync5, realpathSync, rmSync as rmSync6, statSync as statSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { isAbsolute, join as join12, relative, resolve as resolve7 } from "node:path";

// src/runtime-output.ts
import { join as join11 } from "node:path";
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
function getRuntimeOutputArtifactsDir(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_ARTIFACTS_DIR);
}
function getRuntimeOutputManifestPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_MANIFEST_FILE);
}
function getRuntimeOutputChannelDocumentsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE);
}
function getRuntimeOutputSkillImportsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_SKILL_IMPORTS_FILE);
}
function getRuntimeOutputKnowledgeProposalsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_FILE);
}
function getRuntimeOutputExternalSheetsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE);
}
function getRuntimeOutputExternalSheetsResultsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE);
}
function getRuntimeOutputExternalGoogleDocsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE);
}
function getRuntimeOutputExternalDocumentsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE);
}
function getRuntimeOutputPermissionRequestsPath(workDir) {
  return join11(workDir, RUNTIME_OUTPUT_DIR, RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE);
}

// src/channel-documents.ts
function materializeChannelDocuments2(documentsOrContexts, workDir, workspaceId) {
  const contexts = normalizeDocumentContexts(documentsOrContexts);
  if (contexts.length === 0) {
    return void 0;
  }
  const documentsDir = join12(workDir, ".agent_context", "channel-documents");
  rmSync6(documentsDir, { recursive: true, force: true });
  mkdirSync6(documentsDir, { recursive: true });
  for (const context of contexts) {
    const { document } = context;
    const versions = listChannelDocumentVersionsSync(document.id, workspaceId);
    const currentVersion = versions.find((version2) => version2.id === document.currentVersionId) ?? versions[0];
    if (!currentVersion) {
      continue;
    }
    const documentDir = join12(documentsDir, `${sanitizePathSegment(document.slug)}-${document.id.slice(-6)}`);
    mkdirSync6(documentDir, { recursive: true });
    writeFileSync4(
      join12(documentDir, "meta.json"),
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
    writeFileSync4(
      join12(documentDir, "blocks.json"),
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
    writeFileSync4(join12(documentDir, "document.md"), currentVersion.contentMarkdown, "utf8");
  }
  return documentsDir;
}
function buildChannelDocumentPromptLines2(channelDocumentsOrContexts, channelDocumentsContextDir) {
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
function sanitizePathSegment(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "document";
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
  const channelDocumentsContextDir = agentDocumentContexts.length > 0 ? materializeChannelDocuments2(agentDocumentContexts, input.workDir, input.task.workspaceId) : void 0;
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
  const documentPromptLines = buildChannelDocumentPromptLines2(agentDocumentContexts, channelDocumentsContextDir);
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
  const knowledgeDir = join13(workDir, ".agent_context", "knowledge");
  const pagesDir = join13(knowledgeDir, "pages");
  rmSync7(knowledgeDir, { recursive: true, force: true });
  mkdirSync7(pagesDir, { recursive: true });
  const manifestPages = pages.map((page, index) => {
    const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizePathSegment2(page.title)}-${page.id.slice(-6)}.md`;
    writeFileSync5(join13(pagesDir, fileName), page.contentMarkdown, "utf8");
    return {
      id: page.id,
      title: page.title,
      tags: page.tags,
      assignmentMode: page.assignmentMode ?? "all_agents",
      updatedAt: page.updatedAt,
      path: `pages/${fileName}`
    };
  });
  writeFileSync5(
    join13(knowledgeDir, "manifest.json"),
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
  const targetDir = join13(workDir, "attachments");
  mkdirSync7(targetDir, { recursive: true });
  return attachments.map((attachment, index) => {
    const safeName = sanitizePathSegment2(attachment.fileName.replace(/[\\/]/g, "-"));
    const targetPath = join13(targetDir, `${String(index + 1).padStart(2, "0")}-${safeName}`);
    try {
      copyFileSync2(attachment.storedPath, targetPath);
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
function sanitizePathSegment2(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "attachment";
}

// ../../apps/cli/src/lib/daemon-task-output.ts
import {
  clearTaskOutputArtifacts,
  discardTaskOutputAttachments,
  loadTaskOutputEnvelope
} from "agent-space-daemon";

// ../../apps/cli/src/lib/skill-imports.ts
import {
  applySkillImportOperations,
  clearSkillImportOperationArtifacts,
  prepareSkillImportOperationArtifacts
} from "agent-space-daemon";

// ../../apps/cli/src/commands/daemon.ts
var DEFAULT_HEARTBEAT_INTERVAL_MS = 15e3;
var DEFAULT_TASK_POLL_INTERVAL_MS = 3e3;
var DEFAULT_OFFLINE_PRUNE_MS = 7 * 24 * 60 * 60 * 1e3;
var DEFAULT_LOG_LINES = 50;
async function runDaemonCommand(subcommand, args, format) {
  if (subcommand === "start") {
    return await runDaemonStart(args);
  }
  if (subcommand === "stop") {
    return await runDaemonStop();
  }
  if (subcommand === "status") {
    return runDaemonStatus(format);
  }
  if (subcommand === "logs") {
    return await runDaemonLogs(args);
  }
  if (subcommand === "token") {
    return runDaemonTokenCommand(args, format);
  }
  console.error(
    "Usage: agent-space daemon start [--foreground] [--daemon-id <id>] [--device-name <name>] [--runtime-name <label>] [--heartbeat-interval <ms>] [--task-timeout <ms>]"
  );
  console.error("   or: agent-space daemon stop");
  console.error("   or: agent-space daemon status [--json]");
  console.error("   or: agent-space daemon logs [--lines <n>] [--follow]");
  console.error("   or: agent-space daemon token create --label <label> [--created-by <name>] [--json]");
  console.error("   or: agent-space daemon token list [--json]");
  console.error("   or: agent-space daemon token revoke --id <token-id> [--json]");
  return 1;
}
async function runDaemonStart(args) {
  const parsed = parseArgs(args);
  const foreground = parsed.flags.foreground === true;
  const config = buildDaemonConfig(parsed.flags);
  if (foreground) {
    return await runDaemonForeground(config);
  }
  const stateDir = ensureDaemonStateDir();
  const pidPath = getDaemonPidFilePath();
  const logPath = getDaemonLogFilePath();
  const existingPid = readPidIfRunning(pidPath);
  if (existingPid) {
    console.error(`Daemon is already running (pid ${existingPid}).`);
    return 1;
  }
  pruneOfflineDaemonsSync(DEFAULT_OFFLINE_PRUNE_MS);
  const logFd = openSync(logPath, "a");
  const entryPath = resolveCliEntryPath();
  const childArgs = [
    "--experimental-strip-types",
    entryPath,
    "daemon",
    "start",
    "--foreground",
    "--mode",
    config.mode,
    "--daemon-id",
    config.daemonKey,
    "--device-name",
    config.deviceName,
    "--runtime-name",
    config.runtimeName,
    "--heartbeat-interval",
    String(config.heartbeatIntervalMs),
    "--task-timeout",
    String(config.taskTimeoutMs)
  ];
  if (config.serverUrl) {
    childArgs.push("--server-url", config.serverUrl);
  }
  if (config.daemonToken) {
    childArgs.push("--daemon-token", config.daemonToken);
  }
  const child = spawn(process.execPath, childArgs, {
    cwd: resolveRepositoryRoot5(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env
  });
  child.unref();
  if (!child.pid) {
    console.error("Failed to start daemon process.");
    return 1;
  }
  writeFileSync6(pidPath, `${child.pid}
`, "utf8");
  await sleep(750);
  if (!isProcessRunning(child.pid)) {
    rmSync8(pidPath, { force: true });
    console.error("Daemon process exited immediately. Check logs:");
    console.error(`  ${logPath}`);
    return 1;
  }
  console.log(`Daemon started (pid ${child.pid}).`);
  console.log(`State: ${stateDir}`);
  console.log(`Logs: ${logPath}`);
  return 0;
}
async function runDaemonForeground(config) {
  if (config.mode === "remote") {
    return runRemoteDaemonForeground(config);
  }
  return runLocalDaemonForeground(config);
}
async function runLocalDaemonForeground(config) {
  const pidPath = getDaemonPidFilePath();
  writeFileSync6(pidPath, `${process.pid}
`, "utf8");
  process.env.AGENT_SPACE_TASK_TIMEOUT_MS = String(config.taskTimeoutMs);
  const detected = detectProviders();
  if (detected.length === 0) {
    rmSync8(pidPath, { force: true });
    console.error(
      "No supported provider CLI found. Install `codex`, `claude`, `gemini`, `opencode`, `openclaw`, `nanobot`, or `hermes` and ensure it is on PATH."
    );
    return 1;
  }
  const snapshot = registerDaemonRuntimesSync({
    daemonKey: config.daemonKey,
    deviceName: config.deviceName,
    metadata: buildLocalDaemonMetadata(config),
    runtimes: detected.map((provider) => ({
      provider: provider.provider,
      name: `${config.runtimeName} \xB7 ${provider.label}`,
      version: provider.version,
      deviceInfo: config.deviceName,
      metadata: buildProviderRuntimeMetadata({
        provider: provider.provider,
        metadata: {
          executablePath: provider.executablePath,
          mode: "local"
        }
      })
    }))
  });
  console.log(`Daemon online: ${snapshot.daemon.daemonKey}`);
  console.log(`Providers: ${snapshot.runtimes.map((runtime) => runtime.provider).join(", ")}`);
  const heartbeatTimer = setInterval(() => {
    try {
      heartbeatDaemonSync(config.daemonKey, {
        metadata: buildLocalDaemonMetadata(config),
        runtimes: listLocalRuntimeHeartbeatMetadata(config.daemonKey)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Heartbeat failed: ${message}`);
    }
  }, config.heartbeatIntervalMs);
  const activeRuntimes = /* @__PURE__ */ new Set();
  let polling = false;
  const taskPollTimer = setInterval(() => {
    if (polling) {
      return;
    }
    polling = true;
    void pollQueuedTasks(config, activeRuntimes).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Task polling failed: ${message}`);
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
    clearInterval(heartbeatTimer);
    clearInterval(taskPollTimer);
    rmSync8(pidPath, { force: true });
    try {
      markDaemonOfflineSync(config.daemonKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to mark daemon offline: ${message}`);
    }
    console.log(`Daemon stopped (${signal}).`);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {
  });
  return 0;
}
function buildLocalDaemonMetadata(config) {
  return {
    mode: "local",
    pid: String(process.pid),
    runtimeName: config.runtimeName,
    nodeVersion,
    platform,
    arch,
    googleWorkspaceReadiness: readGoogleWorkspaceReadiness()
  };
}
async function runRemoteDaemonForeground(config) {
  return runStandaloneRemoteDaemonForeground({
    stateDir: ensureDaemonStateDir(),
    daemonKey: config.daemonKey,
    deviceName: config.deviceName,
    runtimeName: config.runtimeName,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    taskPollIntervalMs: config.taskPollIntervalMs,
    taskTimeoutMs: config.taskTimeoutMs,
    serverUrl: config.serverUrl,
    daemonToken: config.daemonToken
  });
}
async function runDaemonStop() {
  const pidPath = getDaemonPidFilePath();
  const pid = readPidIfRunning(pidPath);
  if (!pid) {
    cleanupStalePidFile(pidPath);
    const snapshots = listDaemonSnapshotsSync().filter((snapshot) => snapshot.daemon.status === "online");
    for (const snapshot of snapshots) {
      markDaemonOfflineSync(snapshot.daemon.daemonKey, { lastError: "Stopped without active PID." });
    }
    if (snapshots.length > 0) {
      console.log(`Marked ${snapshots.length} daemon registration(s) offline.`);
      return 0;
    }
    console.error("Daemon is not running.");
    return 1;
  }
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 5e3;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      rmSync8(pidPath, { force: true });
      console.log(`Daemon stopped (pid ${pid}).`);
      return 0;
    }
    await sleep(100);
  }
  console.error(`Timed out waiting for daemon ${pid} to stop.`);
  return 1;
}
function runDaemonStatus(format) {
  const pidPath = getDaemonPidFilePath();
  const pid = readPidIfRunning(pidPath);
  const snapshots = listDaemonSnapshotsSync();
  const summary = {
    running: Boolean(pid),
    pid: pid ?? "",
    pidFile: pidPath,
    logFile: getDaemonLogFilePath(),
    daemons: snapshots.length,
    onlineDaemons: snapshots.filter((snapshot) => snapshot.daemon.status === "online").length,
    runtimes: snapshots.reduce((sum, snapshot) => sum + snapshot.runtimes.length, 0)
  };
  if (format === "json") {
    writeData(format, {
      summary,
      daemons: snapshots.map((snapshot) => ({
        daemon: snapshot.daemon,
        runtimes: snapshot.runtimes
      }))
    });
    return 0;
  }
  console.log(renderDaemonSummary(summary));
  if (snapshots.length === 0) {
    console.log("\nNo daemon registrations found.");
    return 0;
  }
  const rows = snapshots.flatMap(
    (snapshot) => snapshot.runtimes.map((runtime) => ({
      daemon: snapshot.daemon.daemonKey,
      device: snapshot.daemon.deviceName,
      daemonStatus: snapshot.daemon.status,
      provider: runtime.provider,
      runtime: runtime.name,
      runtimeStatus: runtime.status,
      version: runtime.version || "-",
      heartbeat: runtime.lastHeartbeatAt ?? snapshot.daemon.lastHeartbeatAt ?? "-"
    }))
  );
  console.log("");
  writeData("text", rows);
  return 0;
}
async function runDaemonLogs(args) {
  const parsed = parseArgs(args);
  const follow = parsed.flags.follow === true;
  const linesRaw = getStringFlag(parsed.flags, "lines");
  const lines = linesRaw ? Number(linesRaw) : DEFAULT_LOG_LINES;
  const logPath = getDaemonLogFilePath();
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
  let position = statSync5(logPath).size;
  const poll = setInterval(() => {
    const size = statSync5(logPath).size;
    if (size <= position) {
      return;
    }
    const next = createReadStream(logPath, { encoding: "utf8", start: position, end: size - 1 });
    next.on("data", (chunk) => {
      position += Buffer.byteLength(chunk);
      process.stdout.write(chunk);
    });
  }, 1e3);
  await new Promise((resolve12) => {
    const stop = () => {
      clearInterval(poll);
      resolve12();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}
function runDaemonTokenCommand(args, format) {
  const parsed = parseArgs(args);
  const action = parsed.positionals[0];
  if (action === "create") {
    const label = getStringFlag(parsed.flags, "label")?.trim() ?? "";
    const createdBy = getStringFlag(parsed.flags, "created-by")?.trim() ?? "system";
    if (!label) {
      console.error("Usage: agent-space daemon token create --label <label> [--created-by <name>] [--json]");
      return 1;
    }
    const created = createDaemonApiTokenSync({
      label,
      createdBy
    });
    writeData(format, created);
    return 0;
  }
  if (action === "list") {
    writeData(format, listDaemonApiTokensSync().map((token) => ({
      id: token.id,
      workspaceId: token.workspaceId,
      label: token.label,
      status: token.status,
      createdBy: token.createdBy,
      lastUsedAt: token.lastUsedAt ?? "",
      createdAt: token.createdAt,
      revokedAt: token.revokedAt ?? ""
    })));
    return 0;
  }
  if (action === "revoke") {
    const id = getStringFlag(parsed.flags, "id")?.trim() ?? "";
    if (!id) {
      console.error("Usage: agent-space daemon token revoke --id <token-id> [--json]");
      return 1;
    }
    writeData(format, revokeDaemonApiTokenSync(id));
    return 0;
  }
  console.error(
    "Usage: agent-space daemon token create --label <label> [--created-by <name>] [--json]\n       agent-space daemon token list [--json]\n       agent-space daemon token revoke --id <token-id> [--json]"
  );
  return 1;
}
function buildDaemonConfig(flags) {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || "local-machine";
  const mode = getStringFlag(flags, "mode")?.trim() === "remote" ? "remote" : "local";
  return {
    mode,
    daemonKey: getStringFlag(flags, "daemon-id")?.trim() || hostname,
    deviceName: getStringFlag(flags, "device-name")?.trim() || hostname,
    runtimeName: getStringFlag(flags, "runtime-name")?.trim() || "Local Agent",
    heartbeatIntervalMs: Math.max(
      1e3,
      Number(getStringFlag(flags, "heartbeat-interval") ?? DEFAULT_HEARTBEAT_INTERVAL_MS)
    ),
    taskPollIntervalMs: DEFAULT_TASK_POLL_INTERVAL_MS,
    taskTimeoutMs: Math.max(
      1e3,
      Number(
        getStringFlag(flags, "task-timeout") ?? process.env.AGENT_SPACE_TASK_TIMEOUT_MS ?? 12 * 60 * 60 * 1e3
      )
    ),
    serverUrl: getStringFlag(flags, "server-url")?.trim(),
    daemonToken: getStringFlag(flags, "daemon-token")?.trim()
  };
}
function detectProviders() {
  return detectSharedProviders();
}
function ensureDaemonStateDir() {
  return getLocalDaemonStateDirPath();
}
function getDaemonPidFilePath() {
  return join14(ensureDaemonStateDir(), "daemon.pid");
}
function getDaemonLogFilePath() {
  return join14(ensureDaemonStateDir(), "daemon.log");
}
function readPidIfRunning(pidPath) {
  if (!existsSync9(pidPath)) {
    return null;
  }
  const raw = readFileSync6(pidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return isProcessRunning(pid) ? pid : null;
}
function cleanupStalePidFile(pidPath) {
  if (!existsSync9(pidPath)) {
    return;
  }
  const raw = readFileSync6(pidPath, "utf8").trim();
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
  const content = readFileSync6(filePath, "utf8");
  const chunks = content.split(/\r?\n/).filter((line, index, all) => !(index === all.length - 1 && line === ""));
  return chunks.slice(-lines);
}
function renderDaemonSummary(summary) {
  return Object.entries(summary).map(([key, value]) => `${key}: ${String(value)}`).join("\n");
}
function resolveCliEntryPath() {
  const currentFile = fileURLToPath2(import.meta.url);
  return join14(dirname5(currentFile), "..", "index.ts");
}
function resolveRepositoryRoot5() {
  let currentDir = process.cwd();
  while (true) {
    if (existsSync9(join14(currentDir, "Target.md"))) {
      return currentDir;
    }
    const parentDir = dirname5(currentDir);
    if (parentDir === currentDir) {
      return process.cwd();
    }
    currentDir = parentDir;
  }
}
function sleep(ms) {
  return new Promise((resolve12) => setTimeout(resolve12, ms));
}
async function pollQueuedTasks(config, activeRuntimes) {
  const snapshot = readDaemonSnapshotSync(config.daemonKey);
  for (const runtime of snapshot.runtimes) {
    if (runtime.status !== "online" || activeRuntimes.has(runtime.id)) {
      continue;
    }
    const queuedTask = claimNextQueuedTaskForRuntimeSync(runtime.id, runtime.workspaceId);
    if (!queuedTask) {
      continue;
    }
    activeRuntimes.add(runtime.id);
    void executeQueuedTask(runtime, queuedTask).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Task ${queuedTask.id} crashed: ${message}`);
    }).finally(() => {
      activeRuntimes.delete(runtime.id);
    });
  }
}
function canAgentCreateGoogleSheet(input) {
  if (process.env.AGENT_SPACE_AGENT_GOOGLE_SHEET_CREATE_ENABLED === "false" || !input.channelName) {
    return false;
  }
  return Boolean(readActiveAgentGoogleWorkspaceDelegationSync({
    workspaceId: input.workspaceId,
    employeeName: input.agentName
  }));
}
async function executeQueuedTask(runtime, queuedTask) {
  const task = startQueuedTaskSync(queuedTask.id);
  writeWorkspaceStateSync(markChannelDocumentRunStepRunningSync(task.id, task.workspaceId), task.workspaceId);
  const payload = parseTaskPayload(task);
  const budgetCheck = checkAllBudgetsForAgentSync(
    payload.assignee ?? task.agentId,
    payload.channelName ?? payload.channel,
    task.workspaceId
  );
  if (budgetCheck.status === "exceeded" && budgetCheck.action === "pause") {
    const pct = Math.round(budgetCheck.percentUsed * 100);
    const msg = `Budget exceeded (${pct}% of $${budgetCheck.budget.limitUsd.toFixed(2)}). Task paused.`;
    appendTaskMessageSync({ taskId: task.id, type: "status", content: msg });
    failQueuedTaskSync({ taskId: task.id, errorText: msg });
    if (payload.taskId) updateTaskStatusSync(payload.taskId, "blocked", task.workspaceId);
    return;
  }
  const workspaceState = readWorkspaceStateSync(task.workspaceId);
  const agentProfile = workspaceState.activeEmployees.find(
    (employee) => sameValue2(employee.name, payload.assignee ?? task.agentId)
  );
  const compatibleDirectChannelName = payload.contactId && !payload.channelName ? resolveCompatibleDirectChannelRecord(workspaceState, payload.contactId)?.name : void 0;
  const effectiveChannelName = payload.channelName ?? compatibleDirectChannelName;
  const effectivePayload = effectiveChannelName && payload.contactId && !payload.channelName ? {
    ...payload,
    channelName: effectiveChannelName,
    channelMessage: payload.channelMessage
  } : payload;
  const contactContext = payload.contactId ? buildContactAgentContext(workspaceState, payload.contactId) : void 0;
  const channelThreadId = resolveConversationThreadId({
    triggerType: task.triggerType,
    payload: {
      channel: payload.channel,
      channelName: effectiveChannelName,
      contactId: payload.contactId
    }
  });
  appendTaskMessageSync({
    taskId: task.id,
    type: "status",
    content: `Task started on ${runtime.name}.`
  });
  if (payload.taskId) {
    updateTaskStatusSync(payload.taskId, "in_progress", task.workspaceId);
  }
  const workDir = resolveWorkspaceTaskWorkDir({
    workspaceId: task.workspaceId,
    taskId: task.id,
    agentId: task.agentId,
    channelThreadId
  });
  mkdirSync8(workDir, { recursive: true });
  const agentName = effectivePayload.assignee ?? task.agentId;
  const agentDocumentContexts = resolveAgentDocumentContextSync({
    workspaceId: task.workspaceId,
    agentName,
    channelName: effectiveChannelName
  });
  const routerSessionContext = buildRouterSessionPromptContext(task);
  const preparedContext = prepareDaemonTaskContext({
    runtime,
    task,
    workDir,
    agentProfile,
    agentDocumentContexts,
    contactContext,
    payloadOverride: effectivePayload,
    routerSessionContext
  });
  const tokenAcc = {
    inputTokens: 0,
    outputTokens: 0,
    modelId: resolveModelId(runtime)
  };
  let persistedOutputAttachments = [];
  try {
    const providerSession = chooseProviderSessionForTaskSync({ task });
    const result = await runProviderTask(
      runtime,
      preparedContext.prompt,
      workDir,
      {
        sessionId: providerSession?.providerSessionId ?? effectivePayload.channelSessionId,
        contextEnv: {
          AGENT_SPACE_CONTEXT_AGENT_NAME: agentName,
          AGENT_SPACE_CONTEXT_TASK_ID: task.id,
          AGENT_SPACE_CONTEXT_TRIGGER_TYPE: task.triggerType
        },
        runtimeToolCapabilities: buildDocumentRuntimeToolCapabilities(agentDocumentContexts, {
          canCreateGoogleSheet: canAgentCreateGoogleSheet({
            workspaceId: task.workspaceId,
            agentName,
            channelName: effectivePayload.channelName ?? effectivePayload.channel
          })
        }),
        onEvent: (event) => {
          appendTaskMessageSync({
            taskId: task.id,
            type: event.type,
            content: event.content,
            tool: event.tool,
            inputJson: event.inputJson,
            output: event.output
          });
          if (event.type === "usage" && event.inputJson) {
            const u = event.inputJson;
            tokenAcc.inputTokens += u.input_tokens ?? 0;
            tokenAcc.outputTokens += u.output_tokens ?? 0;
          }
        }
      }
    );
    const documentOperations = channelThreadId ? applyChannelDocumentOperations(workDir, {
      channelName: channelThreadId,
      sourceMessageId: effectivePayload.sourceMessageId,
      sourceTaskQueueId: task.id,
      actorName: agentName,
      workspaceId: task.workspaceId
    }) : { warnings: [], documentUpdates: [] };
    const preparedSkillImports = prepareSkillImportOperationArtifacts(workDir);
    const skillImportOperations = await applySkillImportOperations(workDir, {
      workspaceId: task.workspaceId,
      agentName
    });
    const documentRuntimeOutputOperations = applyDocumentRuntimeOutputOperations({
      workDir,
      workspaceId: task.workspaceId,
      actorName: agentName,
      sourceTaskQueueId: task.id,
      sourceChannelName: effectiveChannelName,
      requestedByUserId: task.requestedByUserId,
      requestedByDisplayName: task.requestedByDisplayName
    });
    const knowledgeProposalOperations = applyKnowledgeProposalOperations({
      workDir,
      workspaceId: task.workspaceId,
      actorName: agentName,
      sourceTaskQueueId: task.id,
      sourceChannelName: effectiveChannelName
    });
    const outputEnvelope = loadTaskOutputEnvelope(workDir, result.output, task.workspaceId);
    persistedOutputAttachments = outputEnvelope.attachments;
    appendTaskMessageSync({
      taskId: task.id,
      type: "text",
      content: outputEnvelope.text
    });
    for (const warning of outputEnvelope.warnings) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: warning
      });
    }
    for (const warning of preparedSkillImports.warnings) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: warning
      });
    }
    for (const message of skillImportOperations.statusMessages) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: message
      });
    }
    for (const warning of skillImportOperations.warnings) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: warning
      });
    }
    for (const message of documentRuntimeOutputOperations.statusMessages) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: message
      });
    }
    for (const message of knowledgeProposalOperations.statusMessages) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: message
      });
    }
    for (const warning of documentOperations.warnings) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: warning
      });
    }
    completeQueuedTaskSync({
      taskId: task.id,
      resultJson: {
        provider: runtime.provider,
        output: outputEnvelope.text,
        attachments: outputEnvelope.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mediaType: attachment.mediaType,
          kind: attachment.kind,
          sizeBytes: attachment.sizeBytes
        })),
        skillImports: skillImportOperations.imports,
        documentUpdates: documentOperations.documentUpdates,
        externalDocumentLinks: documentRuntimeOutputOperations.externalDocumentLinks,
        documentPermissionRequests: documentRuntimeOutputOperations.permissionRequests,
        knowledgeProposals: knowledgeProposalOperations.knowledgeProposals
      },
      sessionId: result.sessionId,
      workDir
    });
    if (tokenAcc.modelId && (tokenAcc.inputTokens > 0 || tokenAcc.outputTokens > 0)) {
      recordTokenUsageSync({
        workspaceId: task.workspaceId,
        taskQueueId: task.id,
        agentId: agentName,
        modelId: tokenAcc.modelId,
        inputTokens: tokenAcc.inputTokens,
        outputTokens: tokenAcc.outputTokens,
        channelName: payload.channelName ?? payload.channel
      });
    }
    if (payload.taskId) {
      updateTaskStatusSync(payload.taskId, "done", task.workspaceId);
    }
    if (payload.orchestrationStepId) {
      writeWorkspaceStateSync(
        completeChannelDocumentRunStepSync({
          queuedTaskId: task.id,
          documentUpdates: documentOperations.documentUpdates,
          warningText: documentOperations.warnings[0]
        }, task.workspaceId),
        task.workspaceId
      );
    }
    if (channelThreadId && payload.channel) {
      const replyResult = completeAgentChannelReplySync({
        channel: payload.channel,
        pendingSpeaker: agentName,
        speaker: agentName,
        summary: outputEnvelope.text,
        attachments: outputEnvelope.attachments,
        sourceTaskQueueId: task.id,
        requestedByUserId: task.requestedByUserId,
        requestedByDisplayName: task.requestedByDisplayName,
        mentionCascadeDepth: payload.mentionCascadeDepth,
        mentionRootMessageId: payload.mentionRootMessageId ?? payload.sourceMessageId,
        sessionId: result.sessionId,
        workDir
      }, task.workspaceId);
      for (const warning of replyResult.warnings) {
        appendTaskMessageSync({
          taskId: task.id,
          type: "status",
          content: warning
        });
      }
      if (payload.contactId) {
        writeConversationExecutionWorkspaceStateSync({
          channelName: payload.channel,
          agentId: payload.contactId,
          contactId: payload.contactId,
          sessionId: result.sessionId,
          workDir,
          lastTaskQueueId: task.id,
          lastError: null
        }, task.workspaceId);
        upsertDirectConversationStateSync(
          {
            contactId: payload.contactId,
            sessionId: result.sessionId,
            workDir
          },
          task.workspaceId
        );
      }
    } else if (payload.channel) {
      const replyResult = completeAgentChannelReplySync({
        channel: payload.channel,
        speaker: runtime.name,
        summary: outputEnvelope.text,
        attachments: outputEnvelope.attachments,
        sourceTaskQueueId: task.id,
        requestedByUserId: task.requestedByUserId,
        requestedByDisplayName: task.requestedByDisplayName,
        mentionCascadeDepth: payload.mentionCascadeDepth,
        mentionRootMessageId: payload.mentionRootMessageId ?? payload.sourceMessageId,
        sessionId: result.sessionId,
        workDir
      }, task.workspaceId);
      for (const warning of replyResult.warnings) {
        appendTaskMessageSync({
          taskId: task.id,
          type: "status",
          content: warning
        });
      }
      writeConversationExecutionWorkspaceStateSync({
        channelName: payload.channel,
        agentId: agentName,
        sessionId: result.sessionId,
        workDir,
        lastTaskQueueId: task.id,
        lastError: null
      }, task.workspaceId);
    }
  } catch (error) {
    if (persistedOutputAttachments.length > 0) {
      deleteWorkspaceAttachmentsSync(persistedOutputAttachments);
      persistedOutputAttachments = [];
    }
    const message = error instanceof Error ? error.message : String(error);
    appendTaskMessageSync({
      taskId: task.id,
      type: "error",
      content: message
    });
    const failureMetadata = readProviderTaskFailureMetadata(error);
    const providerError = failureMetadata?.providerError;
    if (providerError) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: `provider diagnostic: ${providerError.code}${providerError.rawProviderMessage ? ` \xB7 ${providerError.rawProviderMessage}` : ""}`
      });
    }
    failQueuedTaskSync({
      taskId: task.id,
      errorText: message,
      errorCode: providerError?.code,
      errorCategory: providerError?.category,
      provider: providerError?.provider,
      rawProviderMessage: providerError?.rawProviderMessage,
      sessionId: failureMetadata?.sessionId ?? payload.channelSessionId,
      workDir: failureMetadata?.workDir ?? workDir
    });
    if (payload.taskId) {
      updateTaskStatusSync(payload.taskId, "blocked", task.workspaceId);
    }
    if (payload.orchestrationStepId) {
      writeWorkspaceStateSync(
        failChannelDocumentRunStepSync({
          queuedTaskId: task.id,
          errorText: message
        }, task.workspaceId),
        task.workspaceId
      );
    }
    if (channelThreadId && payload.channel) {
      replacePendingChannelMessageSync({
        channel: payload.channel,
        pendingSpeaker: agentName,
        speaker: "\u7CFB\u7EDF\u63D0\u793A",
        role: "agent",
        summary: formatConversationFailureSummary({
          agentName,
          channelName: payload.channel,
          errorText: message,
          isDirectConversation: Boolean(payload.contactId)
        }),
        status: "error"
      }, task.workspaceId);
      if (payload.contactId) {
        writeConversationExecutionWorkspaceStateSync({
          channelName: payload.channel,
          agentId: payload.contactId,
          contactId: payload.contactId,
          sessionId: payload.channelSessionId,
          workDir,
          lastTaskQueueId: task.id,
          lastError: message
        }, task.workspaceId);
        upsertDirectConversationStateSync(
          {
            contactId: payload.contactId,
            sessionId: payload.channelSessionId,
            workDir
          },
          task.workspaceId
        );
      }
    } else if (payload.channel) {
      postMessageSync({
        channel: payload.channel,
        speaker: "\u7CFB\u7EDF\u63D0\u793A",
        role: "agent",
        summary: formatTaskFailureSummary({
          title: payload.title || task.id,
          errorText: message
        }),
        status: "error"
      }, task.workspaceId);
      writeConversationExecutionWorkspaceStateSync({
        channelName: payload.channel,
        agentId: agentName,
        sessionId: payload.channelSessionId,
        workDir,
        lastTaskQueueId: task.id,
        lastError: message
      }, task.workspaceId);
    }
  } finally {
    try {
      clearTaskOutputArtifacts(workDir);
      pruneOrphanWorkspaceAttachmentsSync(task.workspaceId);
    } catch (cleanupError) {
      appendTaskMessageSync({
        taskId: task.id,
        type: "status",
        content: `\u6E05\u7406\u4EFB\u52A1\u4EA7\u7269\u65F6\u51FA\u73B0\u8B66\u544A\uFF1A${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      });
    }
  }
}
async function runProviderTask(runtime, prompt, workDir, options = {}) {
  return runSharedProviderTask(toProviderRuntimeRecord(runtime), prompt, workDir, options);
}
function resolveModelId(runtime) {
  return resolveSharedModelId(toProviderRuntimeRecord(runtime));
}
function buildRouterSessionPromptContext(task) {
  const routerSession = readAgentRouterSessionForTaskSync(task);
  if (!routerSession) {
    return void 0;
  }
  const providerSession = chooseProviderSessionForTaskSync({ task });
  const attempts = listAgentTaskAttemptsSync({
    workspaceId: task.workspaceId,
    routerSessionId: routerSession.id,
    limit: 80
  });
  const taskAttempts = attempts.filter((attempt) => attempt.taskQueueId === task.id);
  const previousAttempt = taskAttempts.length > 1 ? taskAttempts[taskAttempts.length - 2] : void 0;
  const latestAttempt = taskAttempts[taskAttempts.length - 1];
  const metadata = latestAttempt ? safeParseJsonObject4(latestAttempt.metadataJson) : {};
  const fallbackReason = readStringValue(metadata.fallbackReason);
  const latestHandoff = readLatestAgentRouterContextSnapshotSync({
    workspaceId: task.workspaceId,
    routerSessionId: routerSession.id,
    snapshotType: "handoff"
  });
  const events = listAgentRouterEventsSync({
    workspaceId: task.workspaceId,
    routerSessionId: routerSession.id,
    order: "asc",
    limit: 80
  });
  return {
    routerSessionId: routerSession.id,
    conversationKey: routerSession.conversationKey,
    sourceType: routerSession.sourceType,
    memorySummary: routerSession.memorySummary,
    providerSessionId: providerSession?.providerSessionId,
    continuationMode: fallbackReason ? "fallback" : providerSession ? "same_provider_resume" : "cold_rebuild",
    previousRuntimeId: previousAttempt?.runtimeId,
    selectedRuntimeId: task.runtimeId,
    fallbackReason,
    transcriptLines: events.map((event) => {
      const actor = event.actorId ? `${event.actorType}:${event.actorId}` : event.actorType;
      return `${event.createdAt} | ${event.type} | ${actor} | ${event.summary ?? ""}`;
    }),
    latestHandoffSnapshot: latestHandoff?.contentMarkdown,
    attemptCount: attempts.length
  };
}
function toProviderRuntimeRecord(runtime) {
  let metadata = {};
  try {
    metadata = JSON.parse(runtime.metadataJson);
  } catch {
    metadata = {};
  }
  return {
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    provider: runtime.provider,
    name: runtime.name,
    version: runtime.version,
    status: runtime.status,
    deviceInfo: runtime.deviceInfo,
    metadata: {
      executablePath: typeof metadata.executablePath === "string" ? metadata.executablePath : "",
      mode: metadata.mode === "remote" ? "remote" : "local",
      providerHealth: isRecord2(metadata.providerHealth) ? metadata.providerHealth : void 0,
      openClawProfile: typeof metadata.openClawProfile === "string" ? metadata.openClawProfile : void 0,
      openClawModel: typeof metadata.openClawModel === "string" ? metadata.openClawModel : void 0
    }
  };
}
function listLocalRuntimeHeartbeatMetadata(daemonKey) {
  return readDaemonSnapshotSync(daemonKey).runtimes.map((runtime) => {
    const providerRuntime = toProviderRuntimeRecord(runtime);
    return {
      id: runtime.id,
      provider: runtime.provider,
      metadata: buildProviderRuntimeMetadata(providerRuntime)
    };
  });
}
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function safeParseJsonObject4(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function readStringValue(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function sameValue2(left, right) {
  return left.localeCompare(right, "zh-CN", { sensitivity: "base" }) === 0;
}
function resolveConversationThreadId(input) {
  const isConversationTrigger = input.triggerType === "channel_chat" || input.triggerType === "mention_chat";
  if (!isConversationTrigger && !input.payload.contactId) {
    return void 0;
  }
  return input.payload.channelName ?? input.payload.channel;
}
function resolveWorkspaceTaskWorkDir(input) {
  if (input.channelThreadId) {
    return getDaemonChannelWorkDirPath(ensureDaemonStateDir(), {
      workspaceId: input.workspaceId,
      threadId: input.channelThreadId,
      agentId: input.agentId
    });
  }
  return getDaemonTaskWorkDirPath(ensureDaemonStateDir(), {
    workspaceId: input.workspaceId,
    taskId: input.taskId
  });
}

// ../services/src/storage/storage-scan.ts
import { existsSync as existsSync10, readdirSync as readdirSync2 } from "node:fs";
import { basename as basename6, extname as extname4, join as join15 } from "node:path";
var EMPTY_ISSUE_COUNTS = {
  "orphan-workspace": 0,
  "orphan-channel-history": 0,
  "orphan-daemon-workdir": 0,
  "orphan-remote-staging": 0,
  "legacy-storage-root": 0
};
function scanStorageArtifactsSync() {
  const issues = [];
  let scannedCount = 0;
  const workspaceCache = /* @__PURE__ */ new Map();
  const pushIssue = (issue) => {
    issues.push(issue);
  };
  const getWorkspaceContext = (workspaceId) => {
    if (workspaceCache.has(workspaceId)) {
      return workspaceCache.get(workspaceId) ?? null;
    }
    if (workspaceId !== SYSTEM_WORKSPACE_ID && readWorkspaceSync(workspaceId) === null) {
      workspaceCache.set(workspaceId, null);
      return null;
    }
    const context = {
      workspaceId,
      channelSlugs: new Set(listStoredChannelsSync(workspaceId).map((channel) => slugify(channel.name))),
      daemonChannelSlugs: new Set(
        listStoredChannelsSync(workspaceId).map((channel) => sanitizeStoragePathSegment(channel.name, "channel"))
      ),
      daemonAgentIds: new Set(
        listStoredEmployeesSync(workspaceId).map((employee) => sanitizeStoragePathSegment(employee.name, "agent"))
      ),
      queuedTaskIds: new Set(listQueuedTasksSync({ workspaceId }).map((task) => sanitizeStoragePathSegment(task.id, "task")))
    };
    workspaceCache.set(workspaceId, context);
    return context;
  };
  const workspaceRoot = join15(getDataDirPath(), "workspaces");
  for (const workspaceEntry of listDirectoryEntries(workspaceRoot)) {
    scannedCount += 1;
    const workspacePath = join15(workspaceRoot, workspaceEntry.name);
    if (!workspaceEntry.isDirectory()) {
      pushIssue({
        kind: "orphan-workspace",
        reason: "unexpected_entry",
        path: workspacePath
      });
      continue;
    }
    const workspaceId = workspaceEntry.name;
    const workspaceContext = getWorkspaceContext(workspaceId);
    if (workspaceContext === null) {
      pushIssue({
        kind: "orphan-workspace",
        reason: "workspace_missing",
        path: workspacePath,
        workspaceId
      });
      continue;
    }
    scannedCount += scanWorkspaceChannelHistory(workspaceContext, pushIssue);
    scannedCount += scanWorkspaceRemoteStaging(workspaceContext, pushIssue);
  }
  const daemonWorkspacesRoot = join15(getLocalDaemonStateDirPath(), "workspaces");
  for (const workspaceEntry of listDirectoryEntries(daemonWorkspacesRoot)) {
    scannedCount += 1;
    const workspacePath = join15(daemonWorkspacesRoot, workspaceEntry.name);
    if (!workspaceEntry.isDirectory()) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "unexpected_entry",
        path: workspacePath
      });
      continue;
    }
    const workspaceId = workspaceEntry.name;
    const workspaceContext = getWorkspaceContext(workspaceId);
    if (workspaceContext === null) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "workspace_missing",
        path: workspacePath,
        workspaceId
      });
      continue;
    }
    scannedCount += scanDaemonTaskWorkDirs(workspaceContext, join15(workspacePath, "workdirs"), pushIssue);
    scannedCount += scanDaemonRemoteWorkDirs(workspaceContext, join15(workspacePath, "remote-workdirs"), pushIssue);
  }
  scannedCount += scanLegacyStorageRoots(pushIssue);
  const issueCounts = { ...EMPTY_ISSUE_COUNTS };
  for (const issue of issues) {
    issueCounts[issue.kind] += 1;
  }
  issues.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }
    return left.path.localeCompare(right.path);
  });
  return {
    scannedCount,
    issueCounts,
    issues
  };
}
function scanLegacyStorageRoots(pushIssue) {
  const legacyRoots = [
    join15(getDataDirPath(), "attachments"),
    join15(getDataDirPath(), "channel-history"),
    join15(getDataDirPath(), "daemon-remote-staging"),
    join15(getLocalDaemonStateDirPath(), "workdirs")
  ];
  let scannedCount = 0;
  for (const legacyRoot of legacyRoots) {
    if (!existsSync10(legacyRoot)) {
      continue;
    }
    scannedCount += 1;
    pushIssue({
      kind: "legacy-storage-root",
      reason: "legacy_path",
      path: legacyRoot
    });
  }
  return scannedCount;
}
function scanWorkspaceChannelHistory(workspace, pushIssue) {
  const historyDir = join15(getDataDirPath(), "workspaces", workspace.workspaceId, "channel-history");
  let scannedCount = 0;
  for (const entry of listDirectoryEntries(historyDir)) {
    scannedCount += 1;
    const entryPath = join15(historyDir, entry.name);
    if (!entry.isFile() || extname4(entry.name).toLowerCase() !== ".md") {
      pushIssue({
        kind: "orphan-channel-history",
        reason: "unexpected_entry",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    const channelSlug = basename6(entry.name, extname4(entry.name));
    if (!workspace.channelSlugs.has(channelSlug)) {
      pushIssue({
        kind: "orphan-channel-history",
        reason: "channel_missing",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
    }
  }
  return scannedCount;
}
function scanWorkspaceRemoteStaging(workspace, pushIssue) {
  const stagingDir = join15(getDataDirPath(), "workspaces", workspace.workspaceId, "daemon-remote-staging");
  let scannedCount = 0;
  for (const entry of listDirectoryEntries(stagingDir)) {
    scannedCount += 1;
    const entryPath = join15(stagingDir, entry.name);
    if (!entry.isDirectory()) {
      pushIssue({
        kind: "orphan-remote-staging",
        reason: "unexpected_entry",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    if (!workspace.queuedTaskIds.has(entry.name)) {
      pushIssue({
        kind: "orphan-remote-staging",
        reason: "task_missing",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
    }
  }
  return scannedCount;
}
function scanDaemonTaskWorkDirs(workspace, workDirsRoot, pushIssue) {
  let scannedCount = 0;
  for (const entry of listDirectoryEntries(workDirsRoot)) {
    if (entry.name === "channels") {
      scannedCount += scanDaemonChannelWorkDirs(workspace, join15(workDirsRoot, entry.name), pushIssue);
      continue;
    }
    scannedCount += 1;
    const entryPath = join15(workDirsRoot, entry.name);
    if (!entry.isDirectory()) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "unexpected_entry",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    if (!workspace.queuedTaskIds.has(entry.name)) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "task_missing",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
    }
  }
  return scannedCount;
}
function scanDaemonChannelWorkDirs(workspace, channelsRoot, pushIssue) {
  let scannedCount = 0;
  for (const threadEntry of listDirectoryEntries(channelsRoot)) {
    scannedCount += 1;
    const threadPath = join15(channelsRoot, threadEntry.name);
    if (!threadEntry.isDirectory()) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "unexpected_entry",
        path: threadPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    if (!workspace.daemonChannelSlugs.has(threadEntry.name)) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "channel_missing",
        path: threadPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    for (const agentEntry of listDirectoryEntries(threadPath)) {
      scannedCount += 1;
      const agentPath = join15(threadPath, agentEntry.name);
      if (!agentEntry.isDirectory()) {
        pushIssue({
          kind: "orphan-daemon-workdir",
          reason: "unexpected_entry",
          path: agentPath,
          workspaceId: workspace.workspaceId
        });
        continue;
      }
      if (!workspace.daemonAgentIds.has(agentEntry.name)) {
        pushIssue({
          kind: "orphan-daemon-workdir",
          reason: "agent_missing",
          path: agentPath,
          workspaceId: workspace.workspaceId
        });
      }
    }
  }
  return scannedCount;
}
function scanDaemonRemoteWorkDirs(workspace, remoteWorkDirsRoot, pushIssue) {
  let scannedCount = 0;
  for (const entry of listDirectoryEntries(remoteWorkDirsRoot)) {
    scannedCount += 1;
    const entryPath = join15(remoteWorkDirsRoot, entry.name);
    if (!entry.isDirectory()) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "unexpected_entry",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
      continue;
    }
    if (!workspace.queuedTaskIds.has(entry.name)) {
      pushIssue({
        kind: "orphan-daemon-workdir",
        reason: "task_missing",
        path: entryPath,
        workspaceId: workspace.workspaceId
      });
    }
  }
  return scannedCount;
}
function listDirectoryEntries(dirPath) {
  if (!existsSync10(dirPath)) {
    return [];
  }
  return readdirSync2(dirPath, { withFileTypes: true });
}

// ../services/src/storage/workspace-purge.ts
import { existsSync as existsSync11, rmSync as rmSync9 } from "node:fs";
import { join as join16 } from "node:path";
function purgeWorkspaceStorageSync(workspaceId, options) {
  const workspaceDataDirPath = join16(getDataDirPath(), "workspaces", workspaceId);
  const daemonExecutionRootDirPath = getDaemonWorkspaceExecutionRootDir(
    options?.daemonStateDir ?? getLocalDaemonStateDirPath(),
    workspaceId
  );
  const removedWorkspaceDataDir = existsSync11(workspaceDataDirPath);
  const removedDaemonExecutionRootDir = existsSync11(daemonExecutionRootDirPath);
  const db = hardDeleteWorkspaceSync(workspaceId);
  rmSync9(workspaceDataDirPath, { recursive: true, force: true });
  rmSync9(daemonExecutionRootDirPath, { recursive: true, force: true });
  return {
    workspaceId,
    db,
    removedWorkspaceDataDir,
    removedDaemonExecutionRootDir
  };
}

// ../../apps/cli/src/commands/db.ts
function runDatabaseCommand(subcommand, args, format) {
  if (subcommand === "status") {
    writeData(format, getDatabaseStatusSync());
    return 0;
  }
  if (subcommand === "storage-scan") {
    writeData(format, scanStorageArtifactsSync());
    return 0;
  }
  if (subcommand === "workspace-purge") {
    const { flags } = parseArgs(args);
    const workspaceIdentifier = getStringFlag(flags, "id");
    const force = flags.force === true;
    if (!workspaceIdentifier || !force) {
      console.error("Usage: agent-space db workspace-purge --id <workspace-id> --force [--json]");
      return 1;
    }
    const workspace = readWorkspaceSync(workspaceIdentifier.trim());
    if (!workspace) {
      throw new Error(`Workspace "${workspaceIdentifier}" does not exist.`);
    }
    writeData(format, {
      ok: true,
      workspaceId: workspace.id,
      result: purgeWorkspaceStorageSync(workspace.id)
    });
    return 0;
  }
  console.error("Usage: agent-space db status [--json]");
  console.error("   or: agent-space db storage-scan [--json]");
  console.error("   or: agent-space db workspace-purge --id <workspace-id> --force [--json]");
  return 1;
}

// ../../apps/cli/src/commands/dev.ts
import { spawn as spawn2 } from "node:child_process";
async function runDevCommand(args) {
  const [target, ...rest] = args;
  if (target !== "web") {
    console.error("Usage: agent-space dev web [--port <n>] [--hostname <host>]");
    return 1;
  }
  const forwardedArgs = ["--prefix", "apps/web", "run", "dev", "--"];
  if (rest.length > 0) {
    forwardedArgs.push(...rest);
  } else {
    forwardedArgs.push("--hostname", "0.0.0.0", "--port", "1455");
  }
  const child = spawn2("npm", forwardedArgs, {
    stdio: "inherit"
  });
  return await new Promise((resolve12) => {
    child.on("close", (code) => resolve12(code ?? 1));
    child.on("error", () => {
      console.error("Failed to start npm. Ensure npm is installed and available on PATH.");
      resolve12(1);
    });
  });
}

// ../../apps/cli/src/commands/doctor.ts
import { existsSync as existsSync12 } from "node:fs";
import { join as join17 } from "node:path";
import { cwd, version } from "node:process";
function runDoctorCommand(format) {
  const rootDir = cwd();
  let databaseConfigured = false;
  let databaseConnectionNote = "PostgreSQL \u4E3B\u5E93\u8FDE\u63A5\u4E32";
  try {
    getWorkspaceDatabaseFilePath();
    databaseConfigured = true;
  } catch (error) {
    databaseConnectionNote = formatErrorNote(error, "\u7F3A\u5C11 PostgreSQL \u4E3B\u5E93\u8FDE\u63A5\u4E32");
  }
  let workspaceSnapshotReady = false;
  let workspaceSnapshotNote = "workspace snapshot \u53EF\u8BFB\u5199";
  if (databaseConfigured) {
    try {
      ensureWorkspaceStateSync();
      workspaceSnapshotReady = true;
    } catch (error) {
      workspaceSnapshotNote = formatErrorNote(error, "workspace snapshot \u8BBF\u95EE\u5931\u8D25");
    }
  } else {
    workspaceSnapshotNote = "\u5148\u914D\u7F6E AGENT_SPACE_DEPLOYMENT_MODE\uFF0C\u5E76\u8BBE\u7F6E SELF_HOSTED_DATABASE_URL \u6216 NEON_DATABASE_URL";
  }
  const checks = [
    check("Target.md", existsSync12(join17(rootDir, "Target.md")), "\u4ED3\u5E93\u6839\u76EE\u5F55\u6807\u8BB0"),
    check("apps/web", existsSync12(join17(rootDir, "apps", "web")), "Web \u5E94\u7528"),
    check("apps/cli", existsSync12(join17(rootDir, "apps", "cli")), "\u672C\u5730\u63A7\u5236 CLI"),
    check("packages/domain", existsSync12(join17(rootDir, "packages", "domain")), "\u5171\u4EAB\u9886\u57DF\u6A21\u578B"),
    check("packages/services", existsSync12(join17(rootDir, "packages", "services")), "\u4E1A\u52A1\u903B\u8F91\u5C42"),
    check("packages/db", existsSync12(join17(rootDir, "packages", "db")), "PostgreSQL \u6301\u4E45\u5316\u5C42"),
    check("postgres", databaseConfigured, databaseConnectionNote),
    check("workspace_snapshot", workspaceSnapshotReady, workspaceSnapshotNote)
  ];
  const summary = {
    projectRoot: rootDir,
    node: version,
    passedChecks: checks.filter((item) => item.status === "ok").length,
    totalChecks: checks.length
  };
  if (format === "json") {
    writeData(format, { summary, checks });
    return 0;
  }
  console.log("AgentSpace Doctor");
  console.log("");
  console.log(`root: ${summary.projectRoot}`);
  console.log(`node: ${summary.node}`);
  console.log(`checks: ${summary.passedChecks}/${summary.totalChecks}`);
  console.log("");
  writeData(format, checks);
  return 0;
}
function check(name, passed, note) {
  return {
    name,
    status: passed ? "ok" : "missing",
    note
  };
}
function formatErrorNote(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

// ../../apps/cli/src/commands/employee.ts
function runEmployeeCommand(subcommand, args, format) {
  if (subcommand === "list") {
    const bindings = new Map(
      listEmployeeRuntimeBindingsForWorkspaceSync().map((binding) => [binding.employeeName, binding.runtimeName])
    );
    writeData(
      format,
      listActiveEmployeesSync().map((employee) => ({
        name: employee.name,
        role: employee.role,
        origin: employee.origin,
        channels: employee.channels.join(", "),
        traits: employee.traits.join(", "),
        runtime: bindings.get(employee.name) ?? ""
      }))
    );
    return 0;
  }
  if (subcommand === "create") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    const role = getStringFlag(flags, "role");
    const summary = getStringFlag(flags, "summary");
    const fit = getStringFlag(flags, "fit");
    const origin = getStringFlag(flags, "origin") ?? "\u624B\u52A8\u521B\u5EFA";
    const traitsValue = getStringFlag(flags, "traits") ?? "";
    const traits = traitsValue.split(",").map((item) => item.trim()).filter(Boolean);
    if (!name || !role) {
      console.error(
        "Usage: agent-space employee create --name <name> --role <role> [--traits a,b] [--summary <text>] [--fit <text>] [--origin <label>] [--json]"
      );
      return 1;
    }
    const state = createEmployeeSync({
      name,
      role,
      summary,
      traits,
      fit,
      origin,
      active: true
    });
    writeData(format, {
      ok: true,
      employee: name,
      role,
      origin,
      totalActiveEmployees: state.activeEmployees.length
    });
    return 0;
  }
  if (subcommand === "bind-runtime") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    const runtimeId = getStringFlag(flags, "runtime-id");
    if (!name || !runtimeId) {
      console.error(
        "Usage: agent-space employee bind-runtime --name <employee> --runtime-id <runtime-id> [--json]"
      );
      return 1;
    }
    const state = bindEmployeeRuntimeSync2(name, runtimeId);
    writeData(format, {
      ok: true,
      employee: name,
      runtimeId,
      totalActiveEmployees: state.activeEmployees.length
    });
    return 0;
  }
  if (subcommand === "unbind-runtime") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name");
    if (!name) {
      console.error("Usage: agent-space employee unbind-runtime --name <employee> [--json]");
      return 1;
    }
    const state = unbindEmployeeRuntimeSync2(name);
    writeData(format, {
      ok: true,
      employee: name,
      totalActiveEmployees: state.activeEmployees.length
    });
    return 0;
  }
  console.error("Usage: agent-space employee list [--json]");
  console.error(
    "   or: agent-space employee create --name <name> --role <role> [--traits a,b] [--summary <text>] [--fit <text>] [--origin <label>] [--json]"
  );
  console.error(
    "   or: agent-space employee bind-runtime --name <employee> --runtime-id <runtime-id> [--json]"
  );
  console.error("   or: agent-space employee unbind-runtime --name <employee> [--json]");
  return 1;
}

// ../../apps/cli/src/commands/im.ts
function runImCommand(subcommand, format) {
  const snapshot = readWorkspaceSnapshotSync();
  if (subcommand === "channels") {
    writeData(format, snapshot.channels);
    return 0;
  }
  if (subcommand === "feed") {
    writeData(format, snapshot.messages);
    return 0;
  }
  console.error("Usage: agent-space im channels [--json]");
  console.error("   or: agent-space im feed [--json]");
  return 1;
}

// ../../apps/cli/src/commands/material.ts
function runMaterialCommand(subcommand, args, format) {
  if (subcommand === "list") {
    writeData(format, listMaterialsSync());
    return 0;
  }
  if (subcommand === "add") {
    const { flags } = parseArgs(args);
    const source = getStringFlag(flags, "source");
    const status = getStringFlag(flags, "status") ?? "\u5F85\u5904\u7406";
    if (!source) {
      console.error("Usage: agent-space material add --source <source> [--status <status>] [--json]");
      return 1;
    }
    const state = addMaterialSync(source, status);
    writeData(format, {
      ok: true,
      source,
      status,
      totalMaterials: state.materials.length
    });
    return 0;
  }
  if (subcommand === "import-file") {
    const { flags } = parseArgs(args);
    const filePath = getStringFlag(flags, "path");
    const label = getStringFlag(flags, "label");
    const status = getStringFlag(flags, "status") ?? "\u5DF2\u5BFC\u5165\u6587\u4EF6";
    if (!filePath) {
      console.error(
        "Usage: agent-space material import-file --path <file-path> [--label <name>] [--status <status>] [--json]"
      );
      return 1;
    }
    const state = importMaterialFileSync({
      filePath,
      label,
      status
    });
    writeData(format, {
      ok: true,
      filePath,
      label: label ?? null,
      status,
      totalMaterials: state.materials.length
    });
    return 0;
  }
  if (subcommand === "parse") {
    const { flags } = parseArgs(args);
    const id = getStringFlag(flags, "id");
    if (!id) {
      console.error("Usage: agent-space material parse --id <material-id> [--json]");
      return 1;
    }
    const state = parseMaterialSync(id);
    const material = state.materials.find((item) => item.id === id);
    writeData(format, {
      ok: true,
      id,
      source: material?.source ?? null,
      status: material?.status ?? null,
      preview: material?.preview ?? null
    });
    return 0;
  }
  if (subcommand === "generate") {
    console.error("material generate \u5DF2\u79FB\u9664\uFF1B\u5F53\u524D\u8BF7\u4F7F\u7528\u7FA4\u6587\u6863\u3001skills \u6216 agent \u521B\u5EFA\u6D41\u7A0B\u3002");
    return 1;
  }
  console.error("Usage: agent-space material list [--json]");
  console.error("   or: agent-space material add --source <source> [--status <status>] [--json]");
  console.error(
    "   or: agent-space material import-file --path <file-path> [--label <name>] [--status <status>] [--json]"
  );
  console.error("   or: agent-space material parse --id <material-id> [--json]");
  console.error("   or: agent-space material generate --id <material-id> [--json]");
  return 1;
}

// ../../apps/cli/src/commands/message.ts
function runMessageCommand(subcommand, args, format) {
  if (subcommand === "list") {
    writeData(format, readWorkspaceSnapshotSync().messages);
    return 0;
  }
  if (subcommand === "post") {
    const { flags } = parseArgs(args);
    const channel = getStringFlag(flags, "channel");
    const speaker = getStringFlag(flags, "speaker") ?? "Operator \xB7 CLI";
    const summary = getStringFlag(flags, "summary");
    const roleFlag = getStringFlag(flags, "role");
    const role = roleFlag === "agent" ? "agent" : "human";
    if (!channel || !summary) {
      console.error(
        "Usage: agent-space message post --channel <name> --summary <text> [--speaker <name>] [--role human|agent] [--json]"
      );
      return 1;
    }
    const state = role === "human" ? sendChannelHumanMessageSync(channel, speaker, summary) : postMessageSync({ channel, speaker, role, summary });
    writeData(format, {
      ok: true,
      channel,
      speaker,
      role,
      totalMessages: state.messages.length
    });
    return 0;
  }
  console.error("Usage: agent-space message list [--json]");
  console.error(
    "   or: agent-space message post --channel <name> --summary <text> [--speaker <name>] [--role human|agent] [--json]"
  );
  return 1;
}

// ../../apps/cli/src/commands/output.ts
import { existsSync as existsSync15, readFileSync as readFileSync9, statSync as statSync8 } from "node:fs";
import { basename as basename9, isAbsolute as isAbsolute5, relative as relative4, resolve as resolve11 } from "node:path";

// src/runtime-output-manifests.ts
import {
  copyFileSync as copyFileSync3,
  existsSync as existsSync13,
  lstatSync as lstatSync2,
  mkdirSync as mkdirSync9,
  readFileSync as readFileSync7,
  readdirSync as readdirSync3,
  realpathSync as realpathSync3,
  statSync as statSync6,
  writeFileSync as writeFileSync7
} from "node:fs";
import { basename as basename7, dirname as dirname6, extname as extname5, isAbsolute as isAbsolute3, join as join18, parse, relative as relative2, resolve as resolve9 } from "node:path";
var MAX_OUTPUT_ATTACHMENTS = 5;
var MAX_OUTPUT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
var MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;
var MAX_RUNTIME_OUTPUT_BUNDLE_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
var MAX_RUNTIME_OUTPUT_BUNDLE_TOTAL_BYTES = 25 * 1024 * 1024;
var MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES = 256 * 1024;
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
  const workDir = resolve9(input.workDir);
  const sourcePath = input.sourcePath.trim();
  if (!sourcePath) {
    throw new Error("File path is required.");
  }
  if (isAbsolute3(sourcePath) && !input.copyOutsideWorkDir) {
    throw new Error("Absolute file paths require --copy.");
  }
  const sourceAbsolutePath = isAbsolute3(sourcePath) ? resolve9(sourcePath) : resolve9(workDir, sourcePath);
  if (!existsSync13(sourceAbsolutePath)) {
    throw new Error(`File does not exist: ${sourcePath}`);
  }
  if (containsSymlinkBetween(workDir, sourceAbsolutePath) && !input.copyOutsideWorkDir) {
    throw new Error(`File path cannot pass through a symlink: ${sourcePath}`);
  }
  const sourceStats = statSync6(sourceAbsolutePath);
  if (!sourceStats.isFile()) {
    throw new Error(`Path is not a file: ${sourcePath}`);
  }
  if (sourceStats.size <= 0) {
    throw new Error(`File is empty: ${sourcePath}`);
  }
  const artifactsDir = getRuntimeOutputArtifactsDir(workDir);
  const realWorkDir = realpathSync3(workDir);
  const realSourcePath = realpathSync3(sourceAbsolutePath);
  const sourceInsideWorkDir = isPathInside(realWorkDir, realSourcePath);
  const artifactsInsideWorkDir = resolve9(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const sourceInsideArtifacts = sourceInsideWorkDir && isPathInside(artifactsInsideWorkDir, sourceAbsolutePath);
  if (!sourceInsideWorkDir && !input.copyOutsideWorkDir) {
    throw new Error("File must be inside workDir unless --copy is provided.");
  }
  if (sourceInsideArtifacts) {
    return {
      absolutePath: sourceAbsolutePath,
      relativePath: normalizePathSeparators(relative2(workDir, sourceAbsolutePath)),
      copied: false
    };
  }
  mkdirSync9(artifactsDir, { recursive: true });
  const targetPath = resolveUniqueArtifactPath(artifactsDir, basename7(sourceAbsolutePath));
  copyFileSync3(sourceAbsolutePath, targetPath);
  return {
    absolutePath: targetPath,
    relativePath: normalizePathSeparators(relative2(workDir, targetPath)),
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
  const resolvedWorkDir = resolve9(workDir);
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
function validateAgentOutputManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputManifestPath(workDir);
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
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
    if (!isRecord3(attachment)) {
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
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (!Array.isArray(parsed.documents)) {
    errors.push(`${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH}.documents must be an array.`);
    return;
  }
  for (const [index, document] of parsed.documents.entries()) {
    const label = `${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH}.documents[${index}]`;
    if (!isRecord3(document)) {
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
  if (!isRecord3(operation)) {
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
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
    errors.push(`${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH} must be an object.`);
    return;
  }
  if (!Array.isArray(parsed.imports)) {
    errors.push(`${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}.imports must be an array.`);
    return;
  }
  for (const [index, entry] of parsed.imports.entries()) {
    const label = `${RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH}.imports[${index}]`;
    if (!isRecord3(entry)) {
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
  if (!existsSync13(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync7(manifestPath, "utf8"), RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_KNOWLEDGE_PROPOSALS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
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
    if (!isRecord3(proposal)) {
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
    validateNoSensitiveOutput(readFileSync7(file.absolutePath, "utf8"), `${label}.contentPath`, errors);
  }
}
function validateExternalSheetsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalSheetsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  const operations = Array.isArray(parsed) ? parsed : isRecord3(parsed) && Array.isArray(parsed.operations) ? parsed.operations : null;
  if (!operations) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH} must be an array or an object with operations[].`);
    return;
  }
  for (const [index, operation] of operations.entries()) {
    const label = `${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH}.operations[${index}]`;
    if (!isRecord3(operation)) {
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
      } else if (operation.requests.some((request) => !isRecord3(request))) {
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
  if (!existsSync13(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync7(manifestPath, "utf8"), RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
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
    if (!isRecord3(result)) {
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
    if (result.preview !== void 0 && !isRecord3(result.preview)) {
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
    validateNoSensitiveOutput(readFileSync7(file.absolutePath, "utf8"), `${label}.resultPath`, errors);
  }
}
function validateExternalGoogleDocsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalGoogleDocsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return;
  }
  validateNoSensitiveOutput(readFileSync7(manifestPath, "utf8"), RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH, errors);
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (isRecord3(parsed) && parsed.version !== void 0 && parsed.version !== 1) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH}.version must be 1.`);
  }
  const operations = Array.isArray(parsed) ? parsed : isRecord3(parsed) && Array.isArray(parsed.operations) ? parsed.operations : null;
  if (!operations) {
    errors.push(`${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH} must be an array or an object with operations[].`);
    return;
  }
  for (const [index, operation] of operations.entries()) {
    validateExternalGoogleDocOperation(workDir, operation, `${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH}.operations[${index}]`, errors);
  }
}
function validateExternalGoogleDocOperation(workDir, operation, label, errors) {
  if (!isRecord3(operation)) {
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
  } else if (operation.requests.some((request) => !isRecord3(request))) {
    errors.push(`${label}.requests entries must be objects.`);
  }
  if (operation.requestsPath !== void 0) {
    validateExternalGoogleDocArtifactReference(workDir, operation.requestsPath, `${label}.requestsPath`, errors, { json: true });
  }
}
function validateExternalDocumentsManifest(workDir, errors) {
  const manifestPath = getRuntimeOutputExternalDocumentsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
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
    if (!isRecord3(operation)) {
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
      const content = readFileSync7(file.absolutePath, "utf8");
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
  if (!isRecord3(parsed)) {
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
  if (!existsSync13(manifestPath)) {
    return;
  }
  const parsed = parseJsonManifest(manifestPath, RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH, errors);
  if (parsed === void 0) {
    return;
  }
  if (!isRecord3(parsed)) {
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
    if (!isRecord3(request)) {
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
  if (!existsSync13(manifestPath)) {
    return { exists: false, attachmentCount: 0, totalAttachmentBytes: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  if (!isRecord3(parsed)) {
    return { exists: true, attachmentCount: 0, totalAttachmentBytes: 0 };
  }
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  let totalAttachmentBytes = 0;
  for (const attachment of attachments) {
    if (!isRecord3(attachment)) {
      continue;
    }
    const file = resolveManifestPath(workDir, attachment.path);
    if (!file || !existsSync13(file.absolutePath)) {
      continue;
    }
    const stats = statSync6(file.absolutePath);
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
  if (!existsSync13(manifestPath)) {
    return { exists: false, documentOperations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  if (!isRecord3(parsed) || !Array.isArray(parsed.documents)) {
    return { exists: true, documentOperations: 0 };
  }
  const documentOperations = parsed.documents.reduce((count, document) => {
    if (!isRecord3(document)) {
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
  if (!existsSync13(manifestPath)) {
    return { exists: false, imports: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    imports: isRecord3(parsed) && Array.isArray(parsed.imports) ? parsed.imports.length : 0
  };
}
function summarizeKnowledgeProposalsManifest(workDir) {
  const manifestPath = getRuntimeOutputKnowledgeProposalsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return { exists: false, proposals: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    proposals: isRecord3(parsed) && Array.isArray(parsed.proposals) ? parsed.proposals.length : 0
  };
}
function summarizeExternalSheetsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalSheetsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return { exists: false, operations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  const operations = Array.isArray(parsed) ? parsed : isRecord3(parsed) && Array.isArray(parsed.operations) ? parsed.operations : [];
  return {
    exists: true,
    operations: operations.length
  };
}
function summarizeExternalSheetsResultsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalSheetsResultsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return { exists: false, results: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    results: isRecord3(parsed) && Array.isArray(parsed.results) ? parsed.results.length : 0
  };
}
function summarizeExternalGoogleDocsManifest(workDir) {
  const manifestPath = getRuntimeOutputExternalGoogleDocsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return { exists: false, operations: 0, operationSummaries: [] };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  const operations = Array.isArray(parsed) ? parsed : isRecord3(parsed) && Array.isArray(parsed.operations) ? parsed.operations : [];
  const operationSummaries = operations.filter(isRecord3).map((operation) => ({
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
  if (!existsSync13(manifestPath)) {
    return { exists: false, operations: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    operations: isRecord3(parsed) && Array.isArray(parsed.operations) ? parsed.operations.length : 0
  };
}
function summarizePermissionRequestsManifest(workDir) {
  const manifestPath = getRuntimeOutputPermissionRequestsPath(workDir);
  if (!existsSync13(manifestPath)) {
    return { exists: false, requests: 0 };
  }
  const parsed = parseJsonManifestQuiet(manifestPath);
  return {
    exists: true,
    requests: isRecord3(parsed) && Array.isArray(parsed.requests) ? parsed.requests.length : 0
  };
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
  const content = readFileSync7(file.absolutePath, "utf8");
  validateNoSensitiveOutput(content, label, errors);
  if (options.json) {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((request) => !isRecord3(request))) {
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
  if (!existsSync13(resolved.absolutePath)) {
    if (options.requireExists !== false) {
      errors.push(`${label} does not exist: ${normalized.relativePath}`);
    }
    return null;
  }
  if (containsSymlinkBetween(workDir, resolved.absolutePath)) {
    errors.push(`${label} cannot pass through a symlink: ${normalized.relativePath}`);
    return null;
  }
  const stats = statSync6(resolved.absolutePath);
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
  if (!relativePath || isAbsolute3(relativePath)) {
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
  const absolutePath = resolve9(workDir, normalized.relativePath);
  if (!isPathInside(resolve9(workDir), absolutePath)) {
    return null;
  }
  if (existsSync13(absolutePath)) {
    const realWorkDir = realpathSync3(workDir);
    const realPath = realpathSync3(absolutePath);
    if (!isPathInside(realWorkDir, realPath)) {
      return null;
    }
  }
  return {
    relativePath: normalized.relativePath,
    absolutePath
  };
}
function isRuntimeOutputArtifactsReference(value) {
  return value === RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR || value.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`);
}
function readManifestObject(path, fallback) {
  const value = readManifestValue(path, fallback);
  return isRecord3(value) ? value : fallback;
}
function readManifestValue(path, fallback) {
  if (!existsSync13(path)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync7(path, "utf8"));
  } catch {
    return fallback;
  }
}
function writeManifestFile(workDir, relativePath, value) {
  const absolutePath = resolve9(workDir, relativePath);
  mkdirSync9(dirname6(absolutePath), { recursive: true });
  writeFileSync7(absolutePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function parseJsonManifest(path, relativePath, errors) {
  try {
    return JSON.parse(readFileSync7(path, "utf8"));
  } catch (error) {
    errors.push(`${relativePath} JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return void 0;
  }
}
function parseJsonManifestQuiet(path) {
  try {
    return JSON.parse(readFileSync7(path, "utf8"));
  } catch {
    return void 0;
  }
}
function isRecord3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function resolveUniqueArtifactPath(artifactsDir, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const parsed = parse(safeFileName);
  let candidate = join18(artifactsDir, safeFileName);
  let index = 2;
  while (existsSync13(candidate)) {
    candidate = join18(artifactsDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}
function sanitizeFileName(value) {
  const clean = basename7(value).replace(/[^\w .-]+/g, "-").replace(/^-+|-+$/g, "");
  if (clean.trim().length > 0 && clean !== "." && clean !== "..") {
    return clean;
  }
  return `artifact${extname5(value)}`;
}
function containsSymlinkBetween(baseDir, targetPath) {
  const relativePath = relative2(baseDir, targetPath);
  if (!relativePath || relativePath === ".") {
    return false;
  }
  let currentPath = baseDir;
  for (const segment of relativePath.split(/[\\/]+/).filter((item) => item.length > 0)) {
    currentPath = join18(currentPath, segment);
    if (existsSync13(currentPath) && lstatSync2(currentPath).isSymbolicLink()) {
      return true;
    }
  }
  return false;
}
function isPathInside(rootDir, candidatePath) {
  const relativePath = relative2(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute3(relativePath);
}
function normalizePathSeparators(value) {
  return value.replace(/\\/g, "/");
}

// src/skill-imports.ts
import { existsSync as existsSync14, mkdirSync as mkdirSync10, readdirSync as readdirSync4, readFileSync as readFileSync8, realpathSync as realpathSync4, rmSync as rmSync10, statSync as statSync7, writeFileSync as writeFileSync8 } from "node:fs";
import { basename as basename8, dirname as dirname7, extname as extname6, isAbsolute as isAbsolute4, join as join19, relative as relative3, resolve as resolve10 } from "node:path";
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
function prepareSkillImportOperationArtifacts2(workDir) {
  const warnings = [];
  const operationsPath = getRuntimeOutputSkillImportsPath(workDir);
  if (!existsSync14(operationsPath)) {
    return { warnings, packaged: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync8(operationsPath, "utf8"));
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
    writeFileSync8(
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
  return !isAbsolute4(normalized) && (normalized === RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR || normalized.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`));
}
function resolveExistingRuntimeArtifactReference(value, field, workDir) {
  if (field === "url") {
    return null;
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized) {
    return null;
  }
  if (!isAbsolute4(normalized)) {
    if (normalized !== RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR && !normalized.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR}/`)) {
      return null;
    }
    return normalized;
  }
  const artifactsRoot = resolve10(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR);
  const absolutePath = resolve10(normalized);
  if (!isPathInside2(artifactsRoot, absolutePath)) {
    return null;
  }
  return join19(RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR, relative3(artifactsRoot, absolutePath)).replace(/\\/g, "/");
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
  if (isAbsolute4(value)) {
    return value;
  }
  return resolve10(workDir, value);
}
function packageLocalSkillImportSource(sourcePath, workDir, warnings) {
  const absolutePath = resolve10(sourcePath);
  if (!existsSync14(absolutePath)) {
    throw new Error(`\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${absolutePath}`);
  }
  const stats = statSync7(absolutePath);
  const archive = stats.isFile() && extname6(absolutePath).toLowerCase() === ".zip";
  const directSkillFile = stats.isFile() && samePathName(basename8(absolutePath), "SKILL.md");
  if (!stats.isDirectory() && !archive && !directSkillFile) {
    throw new Error("\u672C\u5730 skill \u6765\u6E90\u5FC5\u987B\u662F skill \u76EE\u5F55\u3001.zip \u6587\u4EF6\u6216 SKILL.md\u3002");
  }
  const artifactName = resolveUniqueSkillArtifactName(workDir, deriveSkillArtifactName(absolutePath, directSkillFile));
  if (archive) {
    const relativePath2 = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}.zip`;
    const targetPath = resolve10(workDir, relativePath2);
    mkdirSync10(dirname7(targetPath), { recursive: true });
    writeFileSync8(targetPath, readFileSync8(absolutePath));
    return { relativePath: relativePath2, archive: true };
  }
  const relativePath = `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${artifactName}`;
  const targetDir = resolve10(workDir, relativePath);
  mkdirSync10(targetDir, { recursive: true });
  if (directSkillFile) {
    writeFileSync8(join19(targetDir, "SKILL.md"), readFileSync8(absolutePath));
    return { relativePath, archive: false };
  }
  const copiedFiles = copySkillDirectoryFiles(absolutePath, targetDir, warnings);
  if (!copiedFiles.some((path) => samePathName(path, "SKILL.md"))) {
    rmSync10(targetDir, { recursive: true, force: true });
    throw new Error(`\u672C\u5730 skill \u76EE\u5F55\u5FC5\u987B\u5305\u542B SKILL.md\uFF1A${absolutePath}`);
  }
  return { relativePath, archive: false };
}
function copySkillDirectoryFiles(sourceDir, targetDir, warnings, relativePrefix = "") {
  const copiedFiles = [];
  for (const entry of readdirSync4(sourceDir, { withFileTypes: true })) {
    const relativePath = normalizeSkillArtifactFilePath(relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name);
    if (!relativePath) {
      continue;
    }
    const sourcePath = join19(sourceDir, entry.name);
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
    const targetPath = join19(targetDir, relativePath);
    mkdirSync10(dirname7(targetPath), { recursive: true });
    writeFileSync8(targetPath, readFileSync8(sourcePath));
    copiedFiles.push(relativePath);
  }
  return copiedFiles;
}
function deriveSkillArtifactName(sourcePath, directSkillFile) {
  const rawName = directSkillFile ? basename8(dirname7(sourcePath)) : basename8(sourcePath).replace(/\.zip$/i, "");
  return sanitizeSkillArtifactSegment(rawName);
}
function resolveUniqueSkillArtifactName(workDir, baseName) {
  let candidate = baseName;
  let index = 2;
  while (existsSync14(resolve10(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}`)) || existsSync14(resolve10(workDir, `${PACKAGED_SKILL_IMPORTS_RELATIVE_DIR}/${candidate}.zip`))) {
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
  return IMPORTABLE_TEXT_EXTENSIONS2.has(extname6(path).toLowerCase());
}
function samePathName(left, right) {
  return left.localeCompare(right, "en-US", { sensitivity: "base" }) === 0;
}
function isPathInside2(rootDir, candidatePath) {
  const relativePath = relative3(rootDir, candidatePath);
  return relativePath === "" || relativePath === "." || !relativePath.startsWith("..") && !isAbsolute4(relativePath);
}

// ../../apps/cli/src/lib/runtime-output.ts
var RUNTIME_OUTPUT_DIR2 = "runtime-output";
var RUNTIME_OUTPUT_ARTIFACTS_DIR2 = "artifacts";
var RUNTIME_OUTPUT_MANIFEST_FILE2 = "agent-output.json";
var RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE2 = "channel-documents.json";
var RUNTIME_OUTPUT_SKILL_IMPORTS_FILE2 = "skill-imports.json";
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE2 = "external-sheets.json";
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE2 = "external-sheets-results.json";
var RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE2 = "external-google-docs.json";
var RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE2 = "external-documents.json";
var RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE2 = "permission-requests.json";
var RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_MANIFEST_FILE2}`;
var RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_CHANNEL_DOCUMENTS_FILE2}`;
var RUNTIME_OUTPUT_SKILL_IMPORTS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_SKILL_IMPORTS_FILE2}`;
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_EXTERNAL_SHEETS_FILE2}`;
var RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_EXTERNAL_SHEETS_RESULTS_FILE2}`;
var RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_EXTERNAL_GOOGLE_DOCS_FILE2}`;
var RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_EXTERNAL_DOCUMENTS_FILE2}`;
var RUNTIME_OUTPUT_PERMISSION_REQUESTS_RELATIVE_PATH2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_PERMISSION_REQUESTS_FILE2}`;
var RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2 = `${RUNTIME_OUTPUT_DIR2}/${RUNTIME_OUTPUT_ARTIFACTS_DIR2}`;

// ../../apps/cli/src/commands/output.ts
async function runOutputCommand(subcommand, args, format) {
  try {
    if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
      printOutputHelp();
      return subcommand ? 0 : 1;
    }
    if (subcommand === "attach") {
      return runAttach(args, format);
    }
    if (subcommand === "text") {
      return runText(args, format);
    }
    if (subcommand === "validate") {
      if (hasHelpFlag(args)) {
        printOutputHelp();
        return 0;
      }
      return runValidate(args, format);
    }
    if (subcommand === "preview") {
      return runPreview(args, format);
    }
    if (subcommand === "document") {
      return runDocumentCommand(args, format);
    }
    if (subcommand === "skill") {
      return runSkillCommand(args, format);
    }
    if (subcommand === "knowledge") {
      return runKnowledgeCommand(args, format);
    }
    if (subcommand === "sheets") {
      return runSheetsCommand(args, format);
    }
    if (subcommand === "sheets-result") {
      return runSheetsResultCommand(args, format);
    }
    if (subcommand === "google-docs") {
      return runGoogleDocsCommand(args, format);
    }
    if (subcommand === "external-document") {
      return runExternalDocumentCommand(args, format);
    }
    if (subcommand === "permission") {
      return runPermissionCommand(args, format);
    }
    printOutputHelp();
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
function runAttach(args, format) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const sourcePath = parsed.positionals[0];
  if (!sourcePath) {
    throw new Error("Usage: agent-space output attach <file> [--name <display-name>] [--media-type <mime>] [--text <message>] [--copy] [--work-dir <path>]");
  }
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath,
    copyOutsideWorkDir: parsed.flags.copy === true
  });
  const manifest = appendAgentOutputAttachment(
    workDir,
    {
      path: prepared.relativePath,
      name: getStringFlag(parsed.flags, "name") ?? basename9(prepared.relativePath),
      mediaType: getStringFlag(parsed.flags, "media-type")
    },
    getStringFlag(parsed.flags, "text")
  );
  if (format === "json") {
    writeData(format, manifest);
  } else {
    console.log(`Attached ${prepared.relativePath}${prepared.copied ? " (copied)" : ""}.`);
  }
  return 0;
}
function runText(args, format) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const text = parsed.positionals.join(" ").trim();
  if (!text) {
    throw new Error("Usage: agent-space output text <message> [--work-dir <path>]");
  }
  const manifest = setAgentOutputText(workDir, text);
  if (format === "json") {
    writeData(format, manifest);
  } else {
    console.log("Updated runtime-output/agent-output.json text.");
  }
  return 0;
}
function runValidate(args, format) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const result = validateRuntimeOutputManifests(workDir);
  if (format === "json") {
    writeData(format, result);
  } else if (result.valid) {
    console.log("runtime-output manifests are valid.");
  } else {
    for (const error of result.errors) {
      console.error(error);
    }
  }
  return result.valid ? 0 : 1;
}
function runPreview(args, format) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const preview = createRuntimeOutputPreview(workDir);
  if (format === "json") {
    writeData(format, preview);
  } else {
    printPreview(preview);
  }
  return preview.errors.length === 0 ? 0 : 1;
}
function runDocumentCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printDocumentHelp();
    return action ? 0 : 1;
  }
  if (action === "upsert") {
    return runDocumentUpsert(rest, format);
  }
  if (action === "replace-block") {
    return runDocumentBlockOperation(rest, format, "replace_block");
  }
  if (action === "insert-after") {
    return runDocumentBlockOperation(rest, format, "insert_after");
  }
  if (action === "delete-block") {
    return runDocumentBlockOperation(rest, format, "delete_block");
  }
  printDocumentHelp();
  return 1;
}
function runDocumentUpsert(args, format) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const title = requireStringFlag(parsed.flags, "title");
  const content = requireStringFlag(parsed.flags, "content");
  const mode = normalizeDocumentMode(getStringFlag(parsed.flags, "mode"));
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: content
  });
  const manifest = appendChannelDocumentManifestEntry(workDir, {
    title,
    contentPath: prepared.relativePath,
    documentId: getStringFlag(parsed.flags, "document-id"),
    baseVersionId: getStringFlag(parsed.flags, "base-version-id"),
    summary: getStringFlag(parsed.flags, "summary"),
    mode
  });
  writeCommandResult(format, manifest, `Added document upsert for "${title}".`);
  return 0;
}
function runDocumentBlockOperation(args, format, op) {
  const parsed = parseArgs(args);
  const workDir = resolveWorkDir(parsed.flags);
  const title = requireStringFlag(parsed.flags, "title");
  const documentId = requireStringFlag(parsed.flags, "document-id");
  const baseVersionId = requireStringFlag(parsed.flags, "base-version-id");
  const operation = buildDocumentBlockOperation(workDir, parsed.flags, op);
  const entry = {
    title,
    documentId,
    baseVersionId,
    mode: "create_or_update",
    operations: [operation]
  };
  const summary = getStringFlag(parsed.flags, "summary");
  if (summary) {
    entry.summary = summary;
  }
  const manifest = appendChannelDocumentManifestEntry(workDir, entry);
  writeCommandResult(format, manifest, `Added ${op} operation for "${title}".`);
  return 0;
}
function buildDocumentBlockOperation(workDir, flags, op) {
  if (op === "delete_block") {
    return {
      op,
      blockId: requireStringFlag(flags, "block-id"),
      baseRevision: requireNumberFlag(flags, "base-revision")
    };
  }
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: requireStringFlag(flags, "content")
  });
  const operation = {
    op,
    contentPath: prepared.relativePath,
    heading: getStringFlag(flags, "heading")
  };
  if (op === "replace_block") {
    operation.blockId = requireStringFlag(flags, "block-id");
    operation.baseRevision = requireNumberFlag(flags, "base-revision");
  }
  if (op === "insert_after") {
    operation.afterBlockId = getStringFlag(flags, "after-block-id");
  }
  return operation;
}
function runSkillCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printSkillHelp();
    return action ? 0 : 1;
  }
  if (action !== "import") {
    printSkillHelp();
    return 1;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const entry = buildSkillImportEntry(workDir, parsed.flags);
  appendSkillImportManifestEntry(workDir, entry);
  if (getStringFlag(parsed.flags, "local-path")) {
    const prepared = prepareSkillImportOperationArtifacts2(workDir);
    const validation = validateRuntimeOutputManifests(workDir);
    if (!validation.valid) {
      throw new Error(validation.errors.join("\n"));
    }
    for (const warning of prepared.warnings) {
      console.error(warning);
    }
  }
  const manifest = readSkillImportsManifest(workDir);
  writeCommandResult(format, manifest, "Added skill import operation.");
  return 0;
}
function buildSkillImportEntry(workDir, flags) {
  const url = getStringFlag(flags, "url");
  const path = getStringFlag(flags, "path");
  const localPath = getStringFlag(flags, "local-path");
  const sources = [url ? "url" : "", path ? "path" : "", localPath ? "local-path" : ""].filter(Boolean);
  if (sources.length !== 1) {
    throw new Error("skill import requires exactly one of --url, --path, or --local-path.");
  }
  const entry = {
    conflict: normalizeConflict(getStringFlag(flags, "conflict")),
    assignToSelf: parseBooleanFlag(flags, "assign-to-self", true)
  };
  if (url) {
    assertSkillImportUrl(url);
    entry.url = url;
  } else if (path) {
    entry.path = normalizeRuntimeArtifactPath(workDir, path);
  } else if (localPath) {
    entry.path = localPath;
  }
  return entry;
}
function runKnowledgeCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printKnowledgeHelp();
    return action ? 0 : 1;
  }
  if (action !== "propose-create" && action !== "propose-update") {
    printKnowledgeHelp();
    return 1;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const proposal = buildKnowledgeProposal(workDir, action, parsed.flags);
  const manifest = appendKnowledgeProposalManifestEntry(workDir, proposal);
  writeCommandResult(format, manifest, `Added knowledge ${action} proposal for "${proposal.title}".`);
  return 0;
}
function buildKnowledgeProposal(workDir, action, flags) {
  const contentFile = requireStringFlag(flags, "content-file");
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: contentFile,
    copyOutsideWorkDir: true
  });
  if (!prepared.relativePath.toLocaleLowerCase("en-US").endsWith(".md")) {
    throw new Error("--content-file must point to a Markdown .md file.");
  }
  const assignmentMode = normalizeKnowledgeAssignmentMode(getStringFlag(flags, "assignment-mode"));
  const assignedEmployeeNames = parseCommaSeparatedFlag(getStringFlag(flags, "assigned-employee-names"));
  const tags = parseCommaSeparatedFlag(getStringFlag(flags, "tags"));
  const entry = removeUndefinedProperties({
    operation: action === "propose-create" ? "create" : "update",
    title: requireStringFlag(flags, "title"),
    contentPath: prepared.relativePath,
    summary: getStringFlag(flags, "summary")?.trim(),
    reason: getStringFlag(flags, "reason")?.trim(),
    tags: tags.length > 0 ? tags : void 0,
    parentId: getStringFlag(flags, "parent-id")?.trim(),
    assignmentMode,
    assignedEmployeeNames: assignedEmployeeNames.length > 0 ? assignedEmployeeNames : void 0,
    assignToSelf: parseBooleanFlag(flags, "assign-to-self", true),
    targetKnowledgePageId: getStringFlag(flags, "knowledge-page-id")?.trim(),
    baseUpdatedAt: getStringFlag(flags, "base-updated-at")?.trim()
  });
  if (entry.operation === "update") {
    if (!entry.targetKnowledgePageId) {
      throw new Error("propose-update requires --knowledge-page-id.");
    }
    if (!entry.baseUpdatedAt) {
      throw new Error("propose-update requires --base-updated-at.");
    }
  }
  return entry;
}
function normalizeKnowledgeAssignmentMode(value) {
  if (!value) {
    return "selected_agents";
  }
  if (value === "all_agents" || value === "selected_agents") {
    return value;
  }
  throw new Error("--assignment-mode must be all_agents or selected_agents.");
}
function assertSkillImportUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--url must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("--url must use HTTPS.");
  }
  const allowedHosts = /* @__PURE__ */ new Set(["github.com", "raw.githubusercontent.com", "skills.sh", "clawhub.ai"]);
  const hostname = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostname) && !hostname.endsWith(".clawhub.ai")) {
    throw new Error("--url host must be GitHub, skills.sh, or ClawHub.");
  }
}
function runSheetsCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printSheetsHelp();
    return action ? 0 : 1;
  }
  if (action !== "read" && action !== "append-rows" && action !== "update-values" && action !== "batch-update") {
    printSheetsHelp();
    return 1;
  }
  if (hasHelpFlag(rest)) {
    printSheetsHelp();
    return 0;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const operation = buildSheetOperation(action, parsed.flags);
  const manifest = appendExternalSheetOperation(workDir, operation);
  writeCommandResult(format, manifest, `Added sheets ${action} operation.`);
  return 0;
}
function buildSheetOperation(action, flags) {
  const documentId = requireStringFlag(flags, "document-id");
  const intent = requireStringFlag(flags, "intent");
  if (action === "batch-update") {
    const requests = parseJsonFlag(flags, "requests-json");
    if (!Array.isArray(requests) || requests.length === 0 || requests.some((item) => !isRecord4(item))) {
      throw new Error("--requests-json must be a non-empty JSON array of objects.");
    }
    return {
      documentId,
      intent,
      operationType: "batch_update",
      requests
    };
  }
  const rangeA1 = requireStringFlag(flags, "range");
  if (action === "read") {
    return {
      documentId,
      intent,
      operationType: "read",
      rangeA1
    };
  }
  const values = parseJsonFlag(flags, "values-json");
  if (!Array.isArray(values) || values.length === 0 || values.some((row) => !Array.isArray(row))) {
    throw new Error("--values-json must be a non-empty two-dimensional JSON array.");
  }
  return {
    documentId,
    intent,
    operationType: action === "append-rows" ? "append_rows" : "update_values",
    rangeA1,
    values
  };
}
function runSheetsResultCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printSheetsResultHelp();
    return action ? 0 : 1;
  }
  if (action !== "add") {
    printSheetsResultHelp();
    return 1;
  }
  if (hasHelpFlag(rest)) {
    printSheetsResultHelp();
    return 0;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const result = buildSheetResultEntry(workDir, parsed.flags);
  const manifest = appendExternalSheetResult(workDir, result);
  writeCommandResult(format, manifest, `Added sheets ${result.operation} result.`);
  return 0;
}
function runGoogleDocsCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printGoogleDocsHelp();
    return action ? 0 : 1;
  }
  if (action !== "append-text" && action !== "batch-update") {
    printGoogleDocsHelp();
    return 1;
  }
  if (hasHelpFlag(rest)) {
    printGoogleDocsHelp();
    return 0;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const operation = buildGoogleDocOperation(workDir, action, parsed.flags);
  const manifest = appendExternalGoogleDocOperation(workDir, operation);
  writeCommandResult(format, manifest, `Added Google Docs ${action} operation.`);
  return 0;
}
function buildGoogleDocOperation(workDir, action, flags) {
  const documentId = requireStringFlag(flags, "document-id");
  const intent = requireStringFlag(flags, "intent");
  const requestSummary = getStringFlag(flags, "request-summary")?.trim();
  if (action === "append-text") {
    const textFile = requireStringFlag(flags, "text-file");
    const prepared2 = prepareRuntimeOutputArtifactReference({
      workDir,
      sourcePath: textFile,
      copyOutsideWorkDir: true
    });
    const text = readFileSyncUtf8(prepared2.absolutePath);
    if (containsSensitiveTokenMaterial(text)) {
      throw new Error("--text-file appears to contain Google Workspace token material. Remove credentials before registering the operation.");
    }
    return removeUndefinedProperties({
      documentId,
      operationType: "append_text",
      intent,
      text,
      textPath: prepared2.relativePath,
      requestSummary
    });
  }
  const requestsJson = requireStringFlag(flags, "requests-json");
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: requestsJson,
    copyOutsideWorkDir: true
  });
  if (!prepared.relativePath.toLocaleLowerCase("en-US").endsWith(".json")) {
    throw new Error("--requests-json must point to a JSON file.");
  }
  const requests = readGoogleDocsRequestsJsonArtifact(prepared.absolutePath);
  return removeUndefinedProperties({
    documentId,
    operationType: "batch_update",
    intent,
    requests,
    requestsPath: prepared.relativePath,
    requestSummary
  });
}
function runExternalDocumentCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printExternalDocumentHelp();
    return action ? 0 : 1;
  }
  if (action !== "link-google-sheet" && action !== "create-google-sheet") {
    printExternalDocumentHelp();
    return 1;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  if (action === "create-google-sheet") {
    const operation2 = buildExternalDocumentCreateGoogleSheetOperation(workDir, parsed.flags);
    const manifest2 = appendExternalDocumentCreateGoogleSheetOperation(workDir, operation2);
    writeCommandResult(format, manifest2, `Added agent-created Google Sheet "${operation2.title}".`);
    return 0;
  }
  const operation = buildExternalDocumentLinkOperation(parsed.flags);
  const manifest = appendExternalDocumentLinkOperation(workDir, operation);
  writeCommandResult(format, manifest, `Added external Google Sheet link for "${operation.title}".`);
  return 0;
}
function buildExternalDocumentLinkOperation(flags) {
  const sourceDocumentId = getStringFlag(flags, "source-document-id")?.trim();
  const externalFileId = getStringFlag(flags, "external-file-id")?.trim();
  const externalUrl = getStringFlag(flags, "external-url")?.trim();
  const sources = [sourceDocumentId, externalFileId, externalUrl].filter((value) => value && value.length > 0);
  if (sources.length === 0) {
    throw new Error("link-google-sheet requires --source-document-id, --external-file-id, or --external-url.");
  }
  return removeUndefinedProperties({
    operationType: "link_google_sheet",
    sourceDocumentId,
    externalFileId,
    externalUrl,
    targetChannel: requireStringFlag(flags, "target-channel"),
    title: requireStringFlag(flags, "title"),
    summary: getStringFlag(flags, "summary")?.trim()
  });
}
function buildExternalDocumentCreateGoogleSheetOperation(workDir, flags) {
  const externalFileId = requireStringFlag(flags, "external-file-id").trim();
  const externalUrl = requireStringFlag(flags, "external-url").trim();
  const gwsResultJson = requireStringFlag(flags, "gws-result-json");
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: gwsResultJson
  });
  if (!prepared.relativePath.toLocaleLowerCase("en-US").endsWith(".json")) {
    throw new Error("--gws-result-json must point to a JSON file.");
  }
  const rawResult = readResultJsonArtifact(prepared.absolutePath);
  assertGoogleSheetCreateResultMatches(rawResult, {
    externalFileId,
    externalUrl
  });
  return removeUndefinedProperties({
    operationType: "create_google_sheet",
    targetChannel: requireStringFlag(flags, "target-channel"),
    title: requireStringFlag(flags, "title"),
    summary: getStringFlag(flags, "summary")?.trim(),
    externalFileId,
    externalUrl,
    externalMimeType: getStringFlag(flags, "external-mime-type")?.trim() || "application/vnd.google-apps.spreadsheet",
    externalRevisionId: getStringFlag(flags, "external-revision-id")?.trim() || readStringProperty(rawResult, ["headRevisionId", "version"]),
    externalUpdatedAt: getStringFlag(flags, "external-updated-at")?.trim() || readStringProperty(rawResult, ["modifiedTime"]),
    resultPath: prepared.relativePath,
    parentFolderId: getStringFlag(flags, "parent-folder-id")?.trim()
  });
}
function runPermissionCommand(args, format) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help") {
    printPermissionHelp();
    return action ? 0 : 1;
  }
  if (action !== "request-document") {
    printPermissionHelp();
    return 1;
  }
  const parsed = parseArgs(rest);
  const workDir = resolveWorkDir(parsed.flags);
  const request = buildDocumentPermissionRequest(parsed.flags);
  const manifest = appendDocumentPermissionRequest(workDir, request);
  writeCommandResult(format, manifest, `Added document permission request for ${request.requestedRole}.`);
  return 0;
}
function buildDocumentPermissionRequest(flags) {
  const requestedRole = normalizeDocumentPermissionRole(requireStringFlag(flags, "role"));
  const documentId = getStringFlag(flags, "document-id")?.trim();
  const externalUrl = getStringFlag(flags, "external-url")?.trim();
  const externalFileId = getStringFlag(flags, "external-file-id")?.trim();
  const externalProvider = normalizeExternalProvider2(getStringFlag(flags, "external-provider") ?? (externalUrl || externalFileId ? "google_workspace" : void 0));
  const sources = [documentId, externalUrl, externalFileId].filter((value) => value && value.length > 0);
  if (sources.length === 0) {
    throw new Error("request-document requires --document-id, --external-file-id, or --external-url.");
  }
  return removeUndefinedProperties({
    requestedRole,
    reason: requireStringFlag(flags, "reason"),
    documentId,
    externalProvider,
    externalFileId,
    externalUrl,
    targetChannel: getStringFlag(flags, "target-channel")?.trim()
  });
}
function buildSheetResultEntry(workDir, flags) {
  const documentId = requireStringFlag(flags, "document-id");
  const operation = normalizeSheetResultOperation(requireStringFlag(flags, "operation"));
  const resultJson = requireStringFlag(flags, "result-json");
  const prepared = prepareRuntimeOutputArtifactReference({
    workDir,
    sourcePath: resultJson
  });
  const rawResult = readResultJsonArtifact(prepared.absolutePath);
  const preview = buildSheetResultPreview(rawResult);
  const range = getStringFlag(flags, "range")?.trim() || readStringProperty(rawResult, ["range", "updatedRange"]);
  const summary = getStringFlag(flags, "summary")?.trim() || buildDefaultSheetResultSummary(operation, preview);
  const startedAt = getStringFlag(flags, "started-at")?.trim();
  const finishedAt = getStringFlag(flags, "finished-at")?.trim();
  const durationMs = getStringFlag(flags, "duration-ms")?.trim();
  const result = {
    documentId,
    operation,
    range,
    resultPath: prepared.relativePath,
    summary,
    requestSummary: getStringFlag(flags, "request-summary")?.trim() || buildDefaultSheetRequestSummary(operation, range),
    rowCount: preview.rowCount,
    cellCount: preview.cellCount,
    headers: preview.headers,
    rowsPreview: preview.rowsPreview,
    truncated: preview.truncated,
    preview,
    status: "succeeded",
    startedAt,
    finishedAt,
    durationMs: durationMs ? requireNonNegativeInteger(durationMs, "--duration-ms") : void 0
  };
  return removeUndefinedProperties(result);
}
function readResultJsonArtifact(path) {
  const raw = existsSync15(path) ? statSync8(path) : void 0;
  if (!raw?.isFile()) {
    throw new Error(`--result-json must point to a JSON file: ${path}`);
  }
  const content = readFileSyncUtf8(path);
  if (containsSensitiveTokenMaterial(content)) {
    throw new Error("--result-json appears to contain Google Workspace token material. Remove credentials before registering the result.");
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`--result-json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function assertGoogleSheetCreateResultMatches(value, input) {
  if (!isRecord4(value)) {
    throw new Error("--gws-result-json must contain a JSON object.");
  }
  if (value.id !== void 0 && value.id !== input.externalFileId) {
    throw new Error("--gws-result-json id must match --external-file-id.");
  }
  if (value.mimeType !== void 0 && value.mimeType !== "application/vnd.google-apps.spreadsheet") {
    throw new Error("--gws-result-json mimeType must be application/vnd.google-apps.spreadsheet.");
  }
  const resultFileId = typeof value.webViewLink === "string" ? extractGoogleWorkspaceFileId2(value.webViewLink) : void 0;
  const urlFileId = extractGoogleWorkspaceFileId2(input.externalUrl);
  if (!urlFileId || urlFileId !== input.externalFileId) {
    throw new Error("--external-url must be a Google Sheets URL for --external-file-id.");
  }
  if (resultFileId && resultFileId !== input.externalFileId) {
    throw new Error("--gws-result-json webViewLink must point to --external-file-id.");
  }
}
function readGoogleDocsRequestsJsonArtifact(path) {
  const raw = existsSync15(path) ? statSync8(path) : void 0;
  if (!raw?.isFile()) {
    throw new Error(`--requests-json must point to a JSON file: ${path}`);
  }
  const content = readFileSyncUtf8(path);
  if (containsSensitiveTokenMaterial(content)) {
    throw new Error("--requests-json appears to contain Google Workspace token material. Remove credentials before registering the operation.");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`--requests-json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => !isRecord4(item))) {
    throw new Error("--requests-json must contain a non-empty JSON array of objects.");
  }
  return parsed;
}
function buildSheetResultPreview(value) {
  const values = readSheetValues(value);
  const rowCount = values.length;
  const cellCount = countCells(values);
  const rowsPreview = values.slice(0, 6).map((row) => row.slice(0, 8));
  const headers = values[0]?.map((cell) => stringifyCell(cell)).filter((cell) => cell.length > 0).slice(0, 8) ?? [];
  const truncated = values.length > rowsPreview.length || values.some((row) => row.length > 8);
  return {
    rowCount,
    cellCount,
    headers,
    rowsPreview,
    truncated
  };
}
function readSheetValues(value) {
  if (isRecord4(value) && Array.isArray(value.values)) {
    return value.values.filter((row) => Array.isArray(row));
  }
  if (Array.isArray(value) && value.every((row) => Array.isArray(row))) {
    return value;
  }
  return [];
}
function buildDefaultSheetResultSummary(operation, preview) {
  if (operation === "read") {
    return `Read ${preview.rowCount ?? 0} rows and ${preview.cellCount ?? 0} cells.`;
  }
  if (operation === "batch_update") {
    return "Applied Google Sheets batch update.";
  }
  return `Completed Google Sheets ${operation}.`;
}
function buildDefaultSheetRequestSummary(operation, range) {
  if (operation === "batch_update") {
    return "Batch update executed by Agent runtime gws.";
  }
  return `${operation} ${range ? `range ${range}` : "Google Sheet"} via Agent runtime gws.`;
}
function normalizeSheetResultOperation(value) {
  if (value === "read" || value === "append_rows" || value === "update_values" || value === "batch_update") {
    return value;
  }
  if (value === "append-rows") {
    return "append_rows";
  }
  if (value === "update-values") {
    return "update_values";
  }
  if (value === "batch-update") {
    return "batch_update";
  }
  throw new Error("--operation must be read, append_rows, update_values, or batch_update.");
}
function normalizeDocumentPermissionRole(value) {
  if (value === "viewer" || value === "editor" || value === "forwarder") {
    return value;
  }
  if (value === "owner") {
    throw new Error("Agents cannot request owner document access.");
  }
  throw new Error("--role must be viewer, editor, or forwarder.");
}
function normalizeExternalProvider2(value) {
  if (!value) {
    return void 0;
  }
  if (value === "google_workspace" || value === "notion" || value === "microsoft_365") {
    return value;
  }
  throw new Error("--external-provider must be google_workspace, notion, or microsoft_365.");
}
function extractGoogleWorkspaceFileId2(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return void 0;
  }
  const match = /\/(?:spreadsheets|document)\/d\/([^/?#]+)/.exec(trimmed);
  return match?.[1] ? decodeURIComponent(match[1]) : void 0;
}
function parseCommaSeparatedFlag(value) {
  if (!value) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter((item, index, items) => item.length > 0 && items.indexOf(item) === index);
}
function resolveWorkDir(flags) {
  return resolve11(getStringFlag(flags, "work-dir") ?? process.cwd());
}
function normalizeDocumentMode(value) {
  if (!value) {
    return "create_or_update";
  }
  if (value === "create" || value === "update" || value === "create_or_update") {
    return value;
  }
  throw new Error("--mode must be create, update, or create_or_update.");
}
function normalizeConflict(value) {
  if (!value) {
    return "skip";
  }
  if (value === "reject" || value === "rename" || value === "replace" || value === "skip") {
    return value;
  }
  throw new Error("--conflict must be reject, rename, replace, or skip.");
}
function normalizeRuntimeArtifactPath(workDir, value) {
  const raw = value.replace(/\\/g, "/").trim();
  if (!raw) {
    throw new Error("Artifact path is required.");
  }
  if (isAbsolute5(raw)) {
    const artifactsRoot = resolve11(workDir, RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2);
    const absolutePath2 = resolve11(raw);
    const relativePath = relative4(artifactsRoot, absolutePath2).replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..") || isAbsolute5(relativePath)) {
      throw new Error(`Artifact path must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2}/.`);
    }
    if (!existsSync15(absolutePath2)) {
      throw new Error(`Artifact path does not exist: ${raw}`);
    }
    const stats2 = statSync8(absolutePath2);
    if (!stats2.isDirectory() && !stats2.isFile()) {
      throw new Error(`Artifact path is not a file or directory: ${raw}`);
    }
    return `${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2}/${relativePath}`;
  }
  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Artifact path cannot contain . or ..");
  }
  if (raw !== RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2 && !raw.startsWith(`${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2}/`)) {
    throw new Error(`Artifact path must be under ${RUNTIME_OUTPUT_ARTIFACTS_RELATIVE_DIR2}/.`);
  }
  const absolutePath = resolve11(workDir, raw);
  if (!existsSync15(absolutePath)) {
    throw new Error(`Artifact path does not exist: ${raw}`);
  }
  const stats = statSync8(absolutePath);
  if (!stats.isDirectory() && !stats.isFile()) {
    throw new Error(`Artifact path is not a file or directory: ${raw}`);
  }
  return segments.join("/");
}
function parseBooleanFlag(flags, key, fallback) {
  const value = flags[key];
  if (value === void 0) {
    return fallback;
  }
  if (value === true) {
    return true;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`--${key} must be true or false.`);
}
function requireStringFlag(flags, key) {
  const value = getStringFlag(flags, key)?.trim();
  if (!value) {
    throw new Error(`--${key} is required.`);
  }
  return value;
}
function requireNumberFlag(flags, key) {
  const value = requireStringFlag(flags, key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be a number.`);
  }
  return parsed;
}
function requireNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}
function parseJsonFlag(flags, key) {
  const value = requireStringFlag(flags, key);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`--${key} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function writeCommandResult(format, value, message) {
  if (format === "json") {
    writeData(format, value);
    return;
  }
  console.log(message);
}
function printPreview(preview) {
  console.log(`workDir: ${preview.workDir}`);
  console.log(`agent-output: ${preview.manifests.agentOutput.exists ? "yes" : "no"} (${preview.manifests.agentOutput.attachmentCount} attachments, ${preview.manifests.agentOutput.totalAttachmentBytes} bytes)`);
  console.log(`channel-documents: ${preview.manifests.channelDocuments.exists ? "yes" : "no"} (${preview.manifests.channelDocuments.documentOperations} operations)`);
  console.log(`skill-imports: ${preview.manifests.skillImports.exists ? "yes" : "no"} (${preview.manifests.skillImports.imports} imports)`);
  console.log(`external-sheets: ${preview.manifests.externalSheets.exists ? "yes" : "no"} (${preview.manifests.externalSheets.operations} operations)`);
  console.log(`external-sheets-results: ${preview.manifests.externalSheetResults.exists ? "yes" : "no"} (${preview.manifests.externalSheetResults.results} results)`);
  console.log(`external-google-docs: ${preview.manifests.externalGoogleDocs.exists ? "yes" : "no"} (${preview.manifests.externalGoogleDocs.operations} operations)`);
  for (const operation of preview.manifests.externalGoogleDocs.operationSummaries) {
    console.log(`- Google Docs ${operation.operationType}: ${operation.documentId} \xB7 ${operation.intent}`);
  }
  console.log(`external-documents: ${preview.manifests.externalDocuments.exists ? "yes" : "no"} (${preview.manifests.externalDocuments.operations} operations)`);
  console.log(`permission-requests: ${preview.manifests.permissionRequests.exists ? "yes" : "no"} (${preview.manifests.permissionRequests.requests} requests)`);
  console.log(`knowledge-proposals: ${preview.manifests.knowledgeProposals.exists ? "yes" : "no"} (${preview.manifests.knowledgeProposals.proposals} proposals)`);
  if (preview.errors.length > 0) {
    console.log("errors:");
    for (const error of preview.errors) {
      console.log(`- ${error}`);
    }
  }
}
function printOutputHelp() {
  console.log(`Usage:
  agent-space output attach <file> [--name <display-name>] [--media-type <mime>] [--text <message>] [--copy] [--work-dir <path>] [--json]
  agent-space output text <message> [--work-dir <path>] [--json]
  agent-space output document <command> ...
  agent-space output skill import ...
  agent-space output knowledge propose-create ...
  agent-space output knowledge propose-update ...
  agent-space output sheets <command> ...
  agent-space output sheets-result add ...
  agent-space output google-docs <command> ...
  agent-space output external-document link-google-sheet ...
  agent-space output external-document create-google-sheet ...
  agent-space output permission request-document ...
  agent-space output validate [--work-dir <path>] [--json]
  agent-space output preview [--work-dir <path>] [--json]`);
}
function printDocumentHelp() {
  console.log(`Usage:
  agent-space output document upsert --title <title> --content <path> [--document-id <id>] [--base-version-id <id>] [--summary <text>] [--mode create|update|create_or_update]
  agent-space output document replace-block --document-id <id> --base-version-id <id> --title <title> --block-id <id> --base-revision <n> --content <path> [--heading <text>]
  agent-space output document insert-after --document-id <id> --base-version-id <id> --title <title> [--after-block-id <id>] --content <path> [--heading <text>]
  agent-space output document delete-block --document-id <id> --base-version-id <id> --title <title> --block-id <id> --base-revision <n>`);
}
function printSkillHelp() {
  console.log(`Usage:
  agent-space output skill import --url <url> [--conflict reject|rename|replace|skip] [--assign-to-self true|false]
  agent-space output skill import --path runtime-output/artifacts/skills/name [--conflict reject|rename|replace|skip]
  agent-space output skill import --local-path <path> [--conflict reject|rename|replace|skip]`);
}
function printKnowledgeHelp() {
  console.log(`Usage:
  agent-space output knowledge propose-create --title <title> --content-file runtime-output/artifacts/knowledge/page.md [--assignment-mode all_agents|selected_agents] [--assigned-employee-names "Agent A,Agent B"] [--assign-to-self true|false] [--tags "tag-a,tag-b"] [--parent-id <page-id>] [--summary <text>] [--reason <text>]
  agent-space output knowledge propose-update --knowledge-page-id <page-id> --base-updated-at <iso> --title <title> --content-file runtime-output/artifacts/knowledge/page.md [--assignment-mode all_agents|selected_agents] [--assigned-employee-names "Agent A,Agent B"] [--tags "tag-a,tag-b"] [--summary <text>] [--reason <text>]`);
}
function printSheetsHelp() {
  console.log(`Usage:
  agent-space output sheets read --document-id <id> --range <A1> --intent <text>
  agent-space output sheets append-rows --document-id <id> --range <A1> --intent <text> --values-json <json>
  agent-space output sheets update-values --document-id <id> --range <A1> --intent <text> --values-json <json>
  agent-space output sheets batch-update --document-id <id> --intent <text> --requests-json <json>`);
}
function printSheetsResultHelp() {
  console.log(`Usage:
  agent-space output sheets-result add --document-id <id> --operation read|append_rows|update_values|batch_update --result-json runtime-output/artifacts/sheets/result.json [--range <A1>] [--summary <text>] [--request-summary <text>] [--started-at <iso>] [--finished-at <iso>] [--duration-ms <ms>]`);
}
function printGoogleDocsHelp() {
  console.log(`Usage:
  agent-space output google-docs append-text --document-id <doc-id> --intent <text> --text-file runtime-output/artifacts/docs/summary.md [--request-summary <text>]
  agent-space output google-docs batch-update --document-id <doc-id> --intent <text> --requests-json runtime-output/artifacts/docs/requests.json [--request-summary <text>]`);
}
function printExternalDocumentHelp() {
  console.log(`Usage:
  agent-space output external-document link-google-sheet --source-document-id <doc-id> --target-channel <channel> --title <title> [--summary <text>]
  agent-space output external-document link-google-sheet --external-file-id <spreadsheet-id> --external-url <url> --target-channel <channel> --title <title> [--summary <text>]
  agent-space output external-document create-google-sheet --external-file-id <spreadsheet-id> --external-url <url> --target-channel <channel> --title <title> --gws-result-json runtime-output/artifacts/sheets/create-sheet.json [--summary <text>]`);
}
function printPermissionHelp() {
  console.log(`Usage:
  agent-space output permission request-document --role viewer|editor|forwarder --reason <text> --document-id <doc-id> [--target-channel <channel>]
  agent-space output permission request-document --role viewer|editor|forwarder --reason <text> --external-url <url> [--external-provider google_workspace] [--target-channel <channel>]`);
}
function isRecord4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readFileSyncUtf8(path) {
  return readFileSync9(path, "utf8");
}
function readStringProperty(value, keys) {
  if (!isRecord4(value)) {
    return void 0;
  }
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item.trim().length > 0) {
      return item.trim();
    }
  }
  return void 0;
}
function stringifyCell(value) {
  if (value === null || value === void 0) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
function countCells(rows) {
  return rows.reduce((sum, row) => sum + row.length, 0);
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
function removeUndefinedProperties(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== void 0));
}
function hasHelpFlag(args) {
  return args.includes("--help") || args.includes("-h");
}

// ../../apps/cli/src/commands/skill.ts
import { writeFileSync as writeFileSync9 } from "node:fs";
async function runSkillCommand2(subcommand, args, format) {
  if (subcommand === "list") {
    const { flags } = parseArgs(args);
    writeData(format, listWorkspaceSkillsSync(getStringFlag(flags, "workspace-id") ?? void 0).map(toSkillSummary));
    return 0;
  }
  if (subcommand === "get") {
    const parsed = parseArgs(args);
    const skillId = parsed.positionals[0]?.trim();
    if (!skillId) {
      console.error("Usage: agent-space skill get <skill-id> [--workspace-id <id>] [--json]");
      return 1;
    }
    const skill = readWorkspaceSkillSync(skillId, getStringFlag(parsed.flags, "workspace-id") ?? void 0);
    if (!skill) {
      console.error(`Skill "${skillId}" not found.`);
      return 1;
    }
    writeData(format, skill);
    return 0;
  }
  if (subcommand === "create") {
    const { flags } = parseArgs(args);
    const name = getStringFlag(flags, "name")?.trim();
    if (!name) {
      console.error("Usage: agent-space skill create --name <name> [--description <text>] [--workspace-id <id>] [--json]");
      return 1;
    }
    const skill = createWorkspaceSkillSync({
      name,
      description: getStringFlag(flags, "description")
    }, getStringFlag(flags, "workspace-id") ?? void 0);
    writeData(format, skill);
    return 0;
  }
  if (subcommand === "update") {
    const parsed = parseArgs(args);
    const skillId = parsed.positionals[0]?.trim();
    if (!skillId) {
      console.error("Usage: agent-space skill update <skill-id> [--name <name>] [--description <text>] [--workspace-id <id>] [--json]");
      return 1;
    }
    const skill = updateWorkspaceSkillSync({
      skillId,
      name: getStringFlag(parsed.flags, "name"),
      description: getStringFlag(parsed.flags, "description")
    }, getStringFlag(parsed.flags, "workspace-id") ?? void 0);
    writeData(format, skill);
    return 0;
  }
  if (subcommand === "delete") {
    const parsed = parseArgs(args);
    const skillId = parsed.positionals[0]?.trim();
    if (!skillId) {
      console.error("Usage: agent-space skill delete <skill-id> [--workspace-id <id>] [--json]");
      return 1;
    }
    deleteWorkspaceSkillSync(skillId, getStringFlag(parsed.flags, "workspace-id") ?? void 0);
    writeData(format, { ok: true, skillId });
    return 0;
  }
  if (subcommand === "export") {
    const parsed = parseArgs(args);
    const workspaceId = getStringFlag(parsed.flags, "workspace-id") ?? void 0;
    const outPath = getStringFlag(parsed.flags, "out")?.trim();
    const skillIds = [
      ...parsed.positionals.map((value) => value.trim()).filter(Boolean),
      ...String(getStringFlag(parsed.flags, "skill-ids") ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    ];
    if (skillIds.length === 0) {
      console.error("Usage: agent-space skill export <skill-id> [more-skill-ids...] [--workspace-id <id>] [--out <zip-path>] [--json]");
      return 1;
    }
    const archive = exportWorkspaceSkillsArchiveSync({
      skillIds,
      workspaceId
    });
    if (outPath) {
      writeFileSync9(outPath, archive.zipBytes);
      writeData(format, {
        ok: true,
        fileName: archive.fileName,
        outPath,
        skillCount: archive.manifest.skillCount
      });
      return 0;
    }
    writeData(format, {
      fileName: archive.fileName,
      archiveBase64: Buffer.from(archive.zipBytes).toString("base64"),
      manifest: archive.manifest
    });
    return 0;
  }
  if (subcommand === "files") {
    return runSkillFilesCommand(args, format);
  }
  if (subcommand === "import") {
    const { flags } = parseArgs(args);
    const url = getStringFlag(flags, "url")?.trim();
    if (!url) {
      console.error("Usage: agent-space skill import --url <url> [--conflict reject|rename|replace|skip] [--workspace-id <id>] [--json]");
      return 1;
    }
    const conflict = getStringFlag(flags, "conflict");
    if (conflict && conflict !== "reject" && conflict !== "rename" && conflict !== "replace" && conflict !== "skip") {
      console.error("Invalid --conflict value. Expected reject, rename, replace, or skip.");
      return 1;
    }
    const result = await importWorkspaceSkillFromUrl({
      workspaceId: getStringFlag(flags, "workspace-id") ?? void 0,
      url,
      conflict
    });
    writeData(format, result);
    return 0;
  }
  console.error("Usage:");
  console.error("  agent-space skill list [--workspace-id <id>] [--json]");
  console.error("  agent-space skill get <skill-id> [--workspace-id <id>] [--json]");
  console.error("  agent-space skill create --name <name> [--description <text>] [--workspace-id <id>] [--json]");
  console.error("  agent-space skill update <skill-id> [--name <name>] [--description <text>] [--workspace-id <id>] [--json]");
  console.error("  agent-space skill delete <skill-id> [--workspace-id <id>] [--json]");
  console.error("  agent-space skill files list <skill-id> [--workspace-id <id>] [--json]");
  console.error("  agent-space skill files upsert <skill-id> --path <path> --content <content> [--file-id <id>] [--workspace-id <id>] [--json]");
  console.error("  agent-space skill files delete <skill-id> --file-id <id> [--workspace-id <id>] [--json]");
  console.error("  agent-space skill import --url <url> [--conflict reject|rename|replace|skip] [--workspace-id <id>] [--json]");
  console.error("  agent-space skill export <skill-id> [more-skill-ids...] [--workspace-id <id>] [--out <zip-path>] [--json]");
  return 1;
}
function runSkillFilesCommand(args, format) {
  const parsed = parseArgs(args);
  const action = parsed.positionals[0];
  const skillId = parsed.positionals[1]?.trim();
  const workspaceId = getStringFlag(parsed.flags, "workspace-id") ?? void 0;
  if (action === "list") {
    if (!skillId) {
      console.error("Usage: agent-space skill files list <skill-id> [--workspace-id <id>] [--json]");
      return 1;
    }
    const skill = readWorkspaceSkillSync(skillId, workspaceId);
    if (!skill) {
      console.error(`Skill "${skillId}" not found.`);
      return 1;
    }
    writeData(format, skill.files);
    return 0;
  }
  if (action === "upsert") {
    if (!skillId) {
      console.error("Usage: agent-space skill files upsert <skill-id> --path <path> --content <content> [--file-id <id>] [--workspace-id <id>] [--json]");
      return 1;
    }
    const path = getStringFlag(parsed.flags, "path")?.trim();
    const content = getStringFlag(parsed.flags, "content");
    if (!path || content === void 0) {
      console.error("Both --path and --content are required.");
      return 1;
    }
    const file = upsertWorkspaceSkillFileSync({
      skillId,
      fileId: getStringFlag(parsed.flags, "file-id")?.trim() || void 0,
      path,
      content
    }, workspaceId);
    writeData(format, file);
    return 0;
  }
  if (action === "delete") {
    if (!skillId) {
      console.error("Usage: agent-space skill files delete <skill-id> --file-id <id> [--workspace-id <id>] [--json]");
      return 1;
    }
    const fileId = getStringFlag(parsed.flags, "file-id")?.trim();
    if (!fileId) {
      console.error("--file-id is required.");
      return 1;
    }
    deleteWorkspaceSkillFileSync(skillId, fileId, workspaceId);
    writeData(format, { ok: true, skillId, fileId });
    return 0;
  }
  console.error("Usage:");
  console.error("  agent-space skill files list <skill-id> [--workspace-id <id>] [--json]");
  console.error("  agent-space skill files upsert <skill-id> --path <path> --content <content> [--file-id <id>] [--workspace-id <id>] [--json]");
  console.error("  agent-space skill files delete <skill-id> --file-id <id> [--workspace-id <id>] [--json]");
  return 1;
}
function toSkillSummary(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    sourceType: skill.sourceType ?? "manual",
    sourceUrl: skill.sourceUrl ?? "",
    fileCount: skill.files.length,
    updatedAt: skill.updatedAt
  };
}

// ../../apps/cli/src/commands/task.ts
function runTaskCommand(subcommand, args, format) {
  if (subcommand === "list") {
    const queuedByIssueId = new Map(listQueuedTasksSync().map((task) => [task.issueId ?? "", task]));
    writeData(
      format,
      listTasksSync().map((task) => {
        const queued = queuedByIssueId.get(task.id);
        return {
          ...task,
          queueStatus: queued?.status ?? "",
          runtimeId: queued?.runtimeId ?? ""
        };
      })
    );
    return 0;
  }
  if (subcommand === "create") {
    const { flags } = parseArgs(args);
    const title = getStringFlag(flags, "title");
    const channel = getStringFlag(flags, "channel");
    const assignee = getStringFlag(flags, "assignee");
    const priorityValue = getStringFlag(flags, "priority");
    const priority = priorityValue === "low" || priorityValue === "high" ? priorityValue : "medium";
    if (!title || !channel || !assignee) {
      console.error(
        "Usage: agent-space task create --title <title> --channel <name> --assignee <employee> [--priority low|medium|high] [--json]"
      );
      return 1;
    }
    const state = createTaskSync({
      title,
      channel,
      assignee,
      priority
    });
    writeData(format, {
      ok: true,
      title,
      channel,
      assignee,
      priority,
      totalTasks: state.tasks.length
    });
    return 0;
  }
  if (subcommand === "inspect") {
    const { flags } = parseArgs(args);
    const id = getStringFlag(flags, "id");
    if (!id) {
      console.error("Usage: agent-space task inspect --id <task-id> [--json]");
      return 1;
    }
    const task = listTasksSync().find((entry) => entry.id === id);
    if (!task) {
      console.error(`Task "${id}" does not exist.`);
      return 1;
    }
    const queued = listQueuedTasksSync().find((entry) => entry.issueId === id);
    const messages = queued ? listTaskMessagesForTaskSync(queued.id) : [];
    writeData(format, {
      task,
      queue: queued ?? null,
      taskMessages: messages
    });
    return 0;
  }
  if (subcommand === "move") {
    const { flags } = parseArgs(args);
    const id = getStringFlag(flags, "id");
    const status = getStringFlag(flags, "status");
    if (!id || !status || !["todo", "in_progress", "blocked", "done"].includes(status)) {
      console.error(
        "Usage: agent-space task move --id <task-id> --status todo|in_progress|blocked|done [--json]"
      );
      return 1;
    }
    const state = updateTaskStatusSync(id, status);
    writeData(format, {
      ok: true,
      id,
      status,
      totalTasks: state.tasks.length
    });
    return 0;
  }
  console.error("Usage: agent-space task list [--json]");
  console.error(
    "   or: agent-space task create --title <title> --channel <name> --assignee <employee> [--priority low|medium|high] [--json]"
  );
  console.error(
    "   or: agent-space task move --id <task-id> --status todo|in_progress|blocked|done [--json]"
  );
  console.error("   or: agent-space task inspect --id <task-id> [--json]");
  return 1;
}

// ../../apps/cli/src/commands/cost.ts
function runCostCommand(subcommand, args, format) {
  if (subcommand === "summary") {
    return runCostSummary(args, format);
  }
  if (subcommand === "agent") {
    return runCostAgent(args, format);
  }
  if (subcommand === "recent") {
    return runCostRecent(args, format);
  }
  if (subcommand === "pricing") {
    writeData(format, listModelPricingSync());
    return 0;
  }
  if (subcommand === "budget") {
    return runBudgetCommand(args, format);
  }
  console.error("Usage: agent-space cost summary [--workspace-id <id>] [--period monthly|total] [--json]");
  console.error("   or: agent-space cost agent --name <agent> [--workspace-id <id>] [--period monthly|total] [--json]");
  console.error("   or: agent-space cost recent [--workspace-id <id>] [--agent <name>] [--limit <n>] [--json]");
  console.error("   or: agent-space cost pricing [--json]");
  console.error("   or: agent-space cost budget list [--workspace-id <id>] [--json]");
  console.error("   or: agent-space cost budget set --scope <workspace|agent|channel> [--scope-id <id>] --workspace-id <id> --limit <usd> [--period monthly|total] [--action warn|pause|approve] [--threshold <0-1>] [--json]");
  console.error("   or: agent-space cost budget toggle --id <budget-id> [--workspace-id <id>] --enabled true|false [--json]");
  console.error("   or: agent-space cost budget delete --id <budget-id> [--workspace-id <id>] [--json]");
  console.error("   or: agent-space cost budget check --agent <name> [--workspace-id <id>] [--channel <name>] [--json]");
  return 1;
}
function runCostSummary(args, format) {
  const { flags } = parseArgs(args);
  const periodFlag = getStringFlag(flags, "period");
  const workspaceId = resolveWorkspaceIdFlag(flags);
  const since = periodFlag === "total" ? void 0 : getMonthStartIso();
  const summaries = getWorkspaceCostSummarySync(since, workspaceId);
  const totalCost = summaries.reduce((sum, s) => sum + s.totalCostUsd, 0);
  const totalTasks = summaries.reduce((sum, s) => sum + s.taskCount, 0);
  const totalInput = summaries.reduce((sum, s) => sum + s.totalInputTokens, 0);
  const totalOutput = summaries.reduce((sum, s) => sum + s.totalOutputTokens, 0);
  writeData(format, {
    period: periodFlag === "total" ? "total" : "monthly",
    totalCostUsd: Math.round(totalCost * 1e4) / 1e4,
    totalTasks,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    agents: summaries.map((s) => ({
      agentId: s.agentId,
      modelId: s.modelId,
      costUsd: Math.round(s.totalCostUsd * 1e4) / 1e4,
      tasks: s.taskCount,
      inputTokens: s.totalInputTokens,
      outputTokens: s.totalOutputTokens
    }))
  });
  return 0;
}
function runCostAgent(args, format) {
  const { flags } = parseArgs(args);
  const name = getStringFlag(flags, "name");
  if (!name) {
    console.error("Usage: agent-space cost agent --name <agent> [--period monthly|total] [--json]");
    return 1;
  }
  const periodFlag = getStringFlag(flags, "period");
  const workspaceId = resolveWorkspaceIdFlag(flags);
  const since = periodFlag === "total" ? void 0 : getMonthStartIso();
  const summary = getAgentCostSummarySync(name, since, workspaceId);
  writeData(format, {
    agentId: name,
    period: periodFlag === "total" ? "total" : "monthly",
    ...summary,
    avgCostPerTask: summary.taskCount > 0 ? Math.round(summary.totalCostUsd / summary.taskCount * 1e4) / 1e4 : 0
  });
  return 0;
}
function runCostRecent(args, format) {
  const { flags } = parseArgs(args);
  const agentId = getStringFlag(flags, "agent") ?? void 0;
  const workspaceId = resolveWorkspaceIdFlag(flags);
  const limitRaw = getStringFlag(flags, "limit");
  const limit = limitRaw ? Math.max(1, Math.min(Number(limitRaw), 100)) : 20;
  const usages = listTokenUsageSync({ agentId, workspaceId }).slice(0, limit);
  writeData(format, usages);
  return 0;
}
function runBudgetCommand(args, format) {
  const { positionals, flags } = parseArgs(args);
  const action = positionals[0];
  const workspaceId = resolveWorkspaceIdFlag(flags);
  if (action === "list" || !action) {
    writeData(format, listBudgetsWithSpentSync(workspaceId));
    return 0;
  }
  if (action === "set") {
    const scope = getStringFlag(flags, "scope");
    const scopeId = getStringFlag(flags, "scope-id");
    const limitRaw = getStringFlag(flags, "limit");
    if (!scope || !limitRaw || scope !== "workspace" && !scopeId) {
      console.error("Usage: agent-space cost budget set --scope <workspace|agent|channel> [--scope-id <id>] --limit <usd> [--period monthly|total] [--action warn|pause|approve] [--threshold <0-1>] [--json]");
      return 1;
    }
    if (!["workspace", "agent", "channel"].includes(scope)) {
      console.error("Scope must be one of: workspace, agent, channel");
      return 1;
    }
    const limitUsd = parseFloat(limitRaw);
    if (!Number.isFinite(limitUsd) || limitUsd < 0) {
      console.error("Limit must be a non-negative number.");
      return 1;
    }
    const period = getStringFlag(flags, "period") ?? "monthly";
    const budgetAction = getStringFlag(flags, "action") ?? "warn";
    const threshold = parseFloat(getStringFlag(flags, "threshold") ?? "0.8");
    const budget = upsertBudgetSync({
      workspaceId,
      scope,
      scopeId: scopeId ?? workspaceId,
      limitUsd,
      period,
      action: budgetAction,
      warningThreshold: Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.8
    });
    writeData(format, { ok: true, budget });
    return 0;
  }
  if (action === "toggle") {
    const id = getStringFlag(flags, "id");
    const enabledRaw = getStringFlag(flags, "enabled");
    if (!id || !enabledRaw) {
      console.error("Usage: agent-space cost budget toggle --id <budget-id> --enabled true|false [--json]");
      return 1;
    }
    toggleBudgetSync(id, enabledRaw === "true", workspaceId);
    writeData(format, { ok: true, id, enabled: enabledRaw === "true" });
    return 0;
  }
  if (action === "delete") {
    const id = getStringFlag(flags, "id");
    if (!id) {
      console.error("Usage: agent-space cost budget delete --id <budget-id> [--json]");
      return 1;
    }
    deleteBudgetSync(id, workspaceId);
    writeData(format, { ok: true, id });
    return 0;
  }
  if (action === "check") {
    const agent = getStringFlag(flags, "agent");
    if (!agent) {
      console.error("Usage: agent-space cost budget check --agent <name> [--channel <name>] [--json]");
      return 1;
    }
    const channel = getStringFlag(flags, "channel") ?? void 0;
    const result = checkAllBudgetsForAgentSync(agent, channel, workspaceId);
    writeData(format, result);
    return 0;
  }
  console.error("Unknown budget subcommand. Use: list, set, toggle, delete, check");
  return 1;
}
function resolveWorkspaceIdFlag(flags) {
  return getStringFlag(flags, "workspace-id") ?? DEFAULT_WORKSPACE_ID;
}

// ../../apps/cli/src/commands/workspace.ts
var WORKSPACE_CONTEXT_AGENT_ENV = "AGENT_SPACE_CONTEXT_AGENT_NAME";
var WORKSPACE_CONTEXT_TASK_ENV = "AGENT_SPACE_CONTEXT_TASK_ID";
function runWorkspaceCommand(subcommand, args, format) {
  if (subcommand === "context") {
    return runWorkspaceContextCommand(args, format);
  }
  if (subcommand === "status") {
    writeData(format, readWorkspaceSummarySync());
    return 0;
  }
  if (subcommand === "init") {
    const { flags } = parseArgs(args);
    const organizationName = getStringFlag(flags, "name");
    const ownerName = getStringFlag(flags, "owner");
    const ownerRole = getStringFlag(flags, "owner-role");
    const shouldReset = flags.reset === true;
    if (!shouldReset && !organizationName && !ownerName && !ownerRole) {
      console.error(
        "Usage: agent-space workspace init --reset [--json]\n       agent-space workspace init --name <organization> --owner <name> --owner-role <role> [--json]"
      );
      console.error("Refusing to reset the workspace without an explicit --reset flag.");
      return 1;
    }
    const state = organizationName || ownerName || ownerRole ? initializeOrganizationSync({
      organizationName: organizationName ?? "AgentSpace",
      ownerName: ownerName ?? "Mina",
      ownerRole: ownerRole ?? "CEO"
    }) : resetWorkspaceStateSync();
    writeData(format, {
      ok: true,
      organization: state.organizationName,
      owner: state.humanMembers[0]?.name ?? null,
      ownerRole: state.humanMembers[0]?.role ?? null,
      activeEmployees: state.activeEmployees.length,
      channels: state.channels.length
    });
    return 0;
  }
  console.error("Usage: agent-space workspace status [--json]");
  console.error("   or: agent-space workspace context <subcommand> [options] [--json]");
  console.error(
    "   or: agent-space workspace init --reset [--json]"
  );
  console.error(
    "   or: agent-space workspace init --name <organization> --owner <name> --owner-role <role> [--json]"
  );
  return 1;
}
function runWorkspaceContextCommand(args, format) {
  const parsed = parseArgs(args);
  const action = parsed.positionals[0];
  const agentName = resolveWorkspaceContextAgentName();
  if (!agentName) {
    console.error(
      `Workspace context is only available inside an agent task runtime. Missing ${WORKSPACE_CONTEXT_AGENT_ENV} / ${WORKSPACE_CONTEXT_TASK_ENV}.`
    );
    return 1;
  }
  if (action === "list-entities") {
    writeData(format, listWorkspaceContextEntitiesSync(agentName));
    return 0;
  }
  if (action === "resolve-entity") {
    const query = getStringFlag(parsed.flags, "query")?.trim();
    if (!query) {
      console.error("Usage: agent-space workspace context resolve-entity --query <text> [--json]");
      return 1;
    }
    writeData(format, resolveWorkspaceContextEntitySync(agentName, query) ?? { entity: null });
    return 0;
  }
  if (action === "list-channels") {
    writeData(format, listWorkspaceContextChannelsSync(agentName));
    return 0;
  }
  if (action === "search-messages") {
    const query = getStringFlag(parsed.flags, "query")?.trim();
    if (!query) {
      console.error("Usage: agent-space workspace context search-messages --query <text> [--channel <name>] [--json]");
      return 1;
    }
    writeData(
      format,
      searchWorkspaceContextMessagesSync(agentName, query, getStringFlag(parsed.flags, "channel") ?? void 0)
    );
    return 0;
  }
  if (action === "list-documents") {
    writeData(format, listWorkspaceContextDocumentsSync(agentName, getStringFlag(parsed.flags, "channel") ?? void 0));
    return 0;
  }
  console.error("Usage:");
  console.error("  agent-space workspace context list-entities [--json]");
  console.error("  agent-space workspace context resolve-entity --query <text> [--json]");
  console.error("  agent-space workspace context list-channels [--json]");
  console.error("  agent-space workspace context search-messages --query <text> [--channel <name>] [--json]");
  console.error("  agent-space workspace context list-documents [--channel <name>] [--json]");
  return 1;
}
function resolveWorkspaceContextAgentName() {
  const directAgentName = process.env[WORKSPACE_CONTEXT_AGENT_ENV]?.trim();
  if (directAgentName) {
    return directAgentName;
  }
  const taskId = process.env[WORKSPACE_CONTEXT_TASK_ENV]?.trim();
  if (!taskId) {
    return void 0;
  }
  return readQueuedTaskSync(taskId)?.agentId;
}

// ../../apps/cli/src/lib/help.ts
function printRootHelp() {
  console.log(`agent-space \u2014 local control CLI for AgentSpace

Usage:
  agent-space <command> [subcommand] [options]

Commands:
  doctor                    Check local project readiness
  db status                 Show database status
  db storage-scan           Scan orphan workspace and daemon storage artifacts
  db workspace-purge        Hard-delete a workspace and its storage roots
  daemon start              Start the native daemon
  daemon stop               Stop the native daemon
  daemon status             Show native daemon status
  daemon logs               Show daemon logs
  daemon token              Manage remote daemon API tokens
  dev web [--port <n>]      Start the web app
  workspace status          Show current workspace summary
  workspace context         Query workspace context from the current agent runtime
  workspace init            Initialize workspace; use --reset to clear current state
  im channels               List IM channels
  im feed                   Show recent collaboration feed
  channel list              List channels
  channel create            Create a new channel
  employee list             List active digital employees
  employee create           Create an active employee
  material list             List imported source materials
  material add              Add a new source material
  material import-file      Import a real file into local workspace state
  material parse            Parse an imported file into preview text
  skill list                List workspace skills
  skill import              Import a skill from a supported external URL
  skill export              Export one or more skills as a zip bundle
  output attach             Add a runtime-output attachment manifest entry
  output sheets-result      Register an Agent-executed Google Sheet result
  output google-docs        Register Google Docs operations
  output validate           Validate runtime-output manifests
  output preview            Preview runtime-output manifests
  message list              List recent collaboration messages
  message post              Post a new collaboration message
  task list                 List current tasks
  task create               Create a task
  task move                 Change task status
  cost summary              Show workspace cost summary
  cost agent                Show cost for a specific agent
  cost recent               Show recent token usage records
  cost pricing              List model pricing table
  cost budget list          List budget settings
  cost budget set           Create or update a budget
  cost budget check         Check budget status for an agent
  help                      Show this help

Output:
  --json
  --format json|text

Examples:
  agent-space doctor
  agent-space db status
  agent-space daemon start
  agent-space daemon token create --label build-box-1
  agent-space workspace status
  agent-space workspace context list-entities --json
  agent-space im channels --json
  agent-space employee create --name Vega --role "\u53D1\u5E03\u534F\u8C03\u5458" --traits \u53D1\u5E03\u7A97\u53E3,\u8DE8\u7EC4\u534F\u8C03
  agent-space employee create --name Nova --role "\u503C\u5B88\u534F\u8C03\u5458" --channel general
  agent-space material add --source "\u5BA2\u6237\u5F55\u97F3" --status "\u5F85\u8F6C\u5199"
  agent-space material import-file --path ./Target.md --label "\u4EA7\u54C1\u76EE\u6807\u6587\u6863"
  agent-space material parse --id mat-123
  agent-space skill list --json
  agent-space skill import --url https://github.com/octo-org/skill-repo/tree/main/skills/research-pack --conflict rename --json
  agent-space skill export skill-abc123 --out ./research-pack.zip --json
  agent-space output attach runtime-output/artifacts/chart.png --name chart.png --media-type image/png --text "\u56FE\u8868\u5DF2\u751F\u6210\u3002"
  agent-space output sheets-result add --document-id channel-doc-123 --operation read --range Sheet1!A1:Z20 --result-json runtime-output/artifacts/sheets/read-1.json --summary "Read 20 rows."
  agent-space output google-docs append-text --document-id channel-doc-456 --intent "Append meeting notes" --text-file runtime-output/artifacts/docs/summary.md
  agent-space output validate --json
  agent-space message post --channel general --summary "\u5148\u786E\u8BA4\u4ECA\u5929\u7684\u4F18\u5148\u7EA7"
  agent-space task create --title "\u6574\u7406\u8054\u8C03\u987A\u5E8F" --channel general --assignee Nova --priority high
  agent-space dev web --port 1455`);
}
function printCommandHelp(command) {
  if (command === "dev") {
    console.log(`Usage:
  agent-space dev web [--port <n>] [--hostname <host>]`);
    return;
  }
  if (command === "db") {
    console.log(`Usage:
  agent-space db status [--json]
  agent-space db storage-scan [--json]
  agent-space db workspace-purge --id <workspace-id> --force [--json]`);
    return;
  }
  if (command === "daemon") {
    console.log(`Usage:
  agent-space daemon start [--foreground] [--mode local|remote] [--daemon-id <id>] [--device-name <name>] [--runtime-name <label>] [--heartbeat-interval <ms>] [--server-url <url>] [--daemon-token <token>]
  agent-space daemon stop
  agent-space daemon status [--json]
  agent-space daemon logs [--lines <n>] [--follow]
  agent-space daemon token create --label <label> [--created-by <name>] [--json]
  agent-space daemon token list [--json]
  agent-space daemon token revoke --id <token-id> [--json]`);
    return;
  }
  if (command === "workspace") {
    console.log(`Usage:
  agent-space workspace status [--json]
  agent-space workspace context list-entities [--json]
  agent-space workspace context resolve-entity --query <text> [--json]
  agent-space workspace context list-channels [--json]
  agent-space workspace context search-messages --query <text> [--channel <name>] [--json]
  agent-space workspace context list-documents [--channel <name>] [--json]
  agent-space workspace init --reset [--json]
  agent-space workspace init --name <organization> --owner <name> --owner-role <role> [--json]`);
    return;
  }
  if (command === "im") {
    console.log(`Usage:
  agent-space im channels [--json]
  agent-space im feed [--json]`);
    return;
  }
  if (command === "channel") {
    console.log(`Usage:
  agent-space channel list [--json]
  agent-space channel create --name <name> [--json]
  agent-space channel delete --name <name> [--json]
  agent-space channel rename --name <name> --to <next-name> [--json]`);
    return;
  }
  if (command === "employee") {
    console.log(`Usage:
  agent-space employee list [--json]
  agent-space employee create --name <name> --role <role> [--traits a,b] [--summary <text>] [--fit <text>] [--origin <label>] [--json]
  agent-space employee bind-runtime --name <employee> --runtime-id <runtime-id> [--json]
  agent-space employee unbind-runtime --name <employee> [--json]`);
    return;
  }
  if (command === "material") {
    console.log(`Usage:
  agent-space material list [--json]
  agent-space material add --source <source> [--status <status>] [--json]
  agent-space material import-file --path <file-path> [--label <name>] [--status <status>] [--json]
  agent-space material parse --id <material-id> [--json]`);
    return;
  }
  if (command === "skill") {
    console.log(`Usage:
  agent-space skill list [--workspace-id <id>] [--json]
  agent-space skill get <skill-id> [--workspace-id <id>] [--json]
  agent-space skill create --name <name> [--description <text>] [--workspace-id <id>] [--json]
  agent-space skill update <skill-id> [--name <name>] [--description <text>] [--workspace-id <id>] [--json]
  agent-space skill delete <skill-id> [--workspace-id <id>] [--json]
  agent-space skill files list <skill-id> [--workspace-id <id>] [--json]
  agent-space skill files upsert <skill-id> --path <path> --content <content> [--file-id <id>] [--workspace-id <id>] [--json]
  agent-space skill files delete <skill-id> --file-id <id> [--workspace-id <id>] [--json]
  agent-space skill import --url <url> [--conflict reject|rename|replace|skip] [--workspace-id <id>] [--json]
  agent-space skill export <skill-id> [more-skill-ids...] [--workspace-id <id>] [--out <zip-path>] [--json]`);
    return;
  }
  if (command === "output") {
    console.log(`Usage:
  agent-space output attach <file> [--name <display-name>] [--media-type <mime>] [--text <message>] [--copy] [--work-dir <path>] [--json]
  agent-space output text <message> [--work-dir <path>] [--json]
  agent-space output document upsert --title <title> --content <path> [--document-id <id>] [--base-version-id <id>] [--summary <text>] [--mode create|update|create_or_update] [--json]
  agent-space output document replace-block --document-id <id> --base-version-id <id> --title <title> --block-id <id> --base-revision <n> --content <path> [--heading <text>] [--json]
  agent-space output document insert-after --document-id <id> --base-version-id <id> --title <title> [--after-block-id <id>] --content <path> [--heading <text>] [--json]
  agent-space output document delete-block --document-id <id> --base-version-id <id> --title <title> --block-id <id> --base-revision <n> [--json]
  agent-space output skill import --url <url> [--conflict reject|rename|replace|skip] [--assign-to-self true|false] [--json]
  agent-space output skill import --path runtime-output/artifacts/skills/name [--conflict reject|rename|replace|skip] [--json]
  agent-space output skill import --local-path <path> [--conflict reject|rename|replace|skip] [--json]
  agent-space output knowledge propose-create --title <title> --content-file runtime-output/artifacts/knowledge/page.md [--assignment-mode all_agents|selected_agents] [--reason <text>] [--json]
  agent-space output knowledge propose-update --knowledge-page-id <page-id> --base-updated-at <iso> --title <title> --content-file runtime-output/artifacts/knowledge/page.md [--reason <text>] [--json]
  agent-space output sheets read --document-id <id> --range <A1> --intent <text> [--json]
  agent-space output sheets append-rows --document-id <id> --range <A1> --intent <text> --values-json <json> [--json]
  agent-space output sheets update-values --document-id <id> --range <A1> --intent <text> --values-json <json> [--json]
  agent-space output sheets batch-update --document-id <id> --intent <text> --requests-json <json> [--json]
  agent-space output sheets-result add --document-id <id> --operation read|append_rows|update_values|batch_update --result-json runtime-output/artifacts/sheets/result.json [--range <A1>] [--summary <text>] [--request-summary <text>] [--json]
  agent-space output google-docs append-text --document-id <doc-id> --intent <text> --text-file runtime-output/artifacts/docs/summary.md [--request-summary <text>] [--json]
  agent-space output google-docs batch-update --document-id <doc-id> --intent <text> --requests-json runtime-output/artifacts/docs/requests.json [--request-summary <text>] [--json]
  agent-space output validate [--work-dir <path>] [--json]
  agent-space output preview [--work-dir <path>] [--json]`);
    return;
  }
  if (command === "message") {
    console.log(`Usage:
  agent-space message list [--json]
  agent-space message post --channel <name> --summary <text> [--speaker <name>] [--role human|agent] [--json]`);
    return;
  }
  if (command === "task") {
    console.log(`Usage:
  agent-space task list [--json]
  agent-space task create --title <title> --channel <name> --assignee <employee> [--priority low|medium|high] [--json]
  agent-space task move --id <task-id> --status todo|in_progress|blocked|done [--json]
  agent-space task inspect --id <task-id> [--json]`);
    return;
  }
  if (command === "cost") {
    console.log(`Usage:
  agent-space cost summary [--workspace-id <id>] [--period monthly|total] [--json]
  agent-space cost agent --name <agent> [--workspace-id <id>] [--period monthly|total] [--json]
  agent-space cost recent [--workspace-id <id>] [--agent <name>] [--limit <n>] [--json]
  agent-space cost pricing [--json]
  agent-space cost budget list [--workspace-id <id>] [--json]
  agent-space cost budget set --scope <workspace|agent|channel> [--scope-id <id>] --workspace-id <id> --limit <usd> [--period monthly|total] [--action warn|pause|approve] [--threshold <0-1>] [--json]
  agent-space cost budget toggle --id <budget-id> [--workspace-id <id>] --enabled true|false [--json]
  agent-space cost budget delete --id <budget-id> [--workspace-id <id>] [--json]
  agent-space cost budget check --agent <name> [--workspace-id <id>] [--channel <name>] [--json]`);
    return;
  }
  printRootHelp();
}

// ../../apps/cli/src/index.ts
async function main() {
  const args = stripPnpmSeparator(process.argv.slice(2));
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    printRootHelp();
    return 0;
  }
  if (args[0] === "--version" || args[0] === "version") {
    console.log("0.1.0");
    return 0;
  }
  const [command, subcommand, ...restArgs] = args;
  const { format, rest } = parseFormat([subcommand ?? "", ...restArgs].filter(Boolean));
  const actualSubcommand = rest[0];
  const actualArgs = rest.slice(1);
  if (command === "doctor") {
    return runDoctorCommand(format);
  }
  if (command === "db") {
    return runDatabaseCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "daemon") {
    return runDaemonCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "dev") {
    if (subcommand === "help" || subcommand === "--help") {
      printCommandHelp("dev");
      return 0;
    }
    return runDevCommand([subcommand, ...restArgs].filter(Boolean));
  }
  if (command === "workspace") {
    return runWorkspaceCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "im") {
    return runImCommand(actualSubcommand, format);
  }
  if (command === "channel") {
    return runChannelCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "employee") {
    return runEmployeeCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "material") {
    return runMaterialCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "message") {
    return runMessageCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "task") {
    return runTaskCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "skill") {
    return runSkillCommand2(actualSubcommand, actualArgs, format);
  }
  if (command === "output") {
    return runOutputCommand(actualSubcommand, actualArgs, format);
  }
  if (command === "cost") {
    return runCostCommand(actualSubcommand, actualArgs, format);
  }
  printRootHelp();
  return 1;
}
function stripPnpmSeparator(args) {
  if (args[0] === "--") {
    return args.slice(1);
  }
  return args;
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
