import { type AgentSpaceState, type WorkspaceSkill, type WorkspaceSkillFile } from "@agent-space/domain/workspace";
export declare const BUILTIN_RETURN_OUTPUT_FILES_SKILL_NAME = "return-output-files";
export declare const BUILTIN_WORKSPACE_CONTEXT_SKILL_NAME = "workspace-context";
export declare const BUILTIN_UPDATE_CHANNEL_DOCUMENTS_SKILL_NAME = "update-channel-documents";
export declare const BUILTIN_GOOGLE_WORKSPACE_CLI_SKILL_NAME = "google-workspace-cli";
export declare function isSystemSkillName(name: string): boolean;
export declare function listWorkspaceSkillsSync(workspaceId?: string): WorkspaceSkill[];
export declare function ensurePredefinedAgentTemplateSkillsSync(workspaceId?: string): WorkspaceSkill[];
export declare function createWorkspaceSkillSync(input: {
    name: string;
    description?: string;
    content?: string;
    sourceType?: string;
    sourceUrl?: string;
    configJson?: string;
}, workspaceId?: string): WorkspaceSkill;
export declare function updateWorkspaceSkillSync(input: {
    skillId: string;
    name?: string;
    description?: string;
    sourceType?: string;
    sourceUrl?: string;
    configJson?: string;
}, workspaceId?: string): WorkspaceSkill;
export declare function readWorkspaceSkillSync(skillId: string, workspaceId?: string): WorkspaceSkill | null;
export declare function deleteWorkspaceSkillSync(skillId: string, workspaceId?: string): AgentSpaceState;
export declare function upsertWorkspaceSkillFileSync(input: {
    skillId: string;
    fileId?: string;
    path: string;
    content: string;
}, workspaceId?: string): WorkspaceSkillFile;
export declare function deleteWorkspaceSkillFileSync(skillId: string, fileId: string, workspaceId?: string): AgentSpaceState;
export declare function isBuiltinSkill(name: string): boolean;
