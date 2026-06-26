import type { WorkspaceSkill } from "@agent-space/domain/workspace";
import type { StoredAgentSkillRecord, StoredSkillImportEventRecord } from "./types.ts";
export declare function listStoredWorkspaceSkillsSync(workspaceId?: string): WorkspaceSkill[];
export declare function readStoredWorkspaceSkillSync(skillId: string, workspaceId?: string): WorkspaceSkill | null;
export declare function listStoredAgentSkillAssignmentsSync(workspaceId?: string): StoredAgentSkillRecord[];
export declare function recordStoredSkillImportEventSync(input: {
    workspaceId?: string;
    skillId?: string;
    skillName: string;
    sourceType: string;
    sourceUrl?: string;
    importMode: "created" | "renamed" | "replaced";
    metadataJson?: string;
    importedAt?: string;
}): StoredSkillImportEventRecord;
export declare function listStoredSkillImportEventsSync(workspaceId?: string, limit?: number): StoredSkillImportEventRecord[];
export declare function replaceStoredWorkspaceSkillsSync(skills: WorkspaceSkill[], workspaceId?: string): void;
export declare function createStoredWorkspaceSkillSync(skill: WorkspaceSkill, workspaceId?: string): WorkspaceSkill;
export declare function updateStoredWorkspaceSkillMetaSync(input: {
    skillId: string;
    name: string;
    description: string;
    sourceType?: string;
    sourceUrl?: string;
    configJson?: string;
    updatedAt: string;
}, workspaceId?: string): WorkspaceSkill | null;
export declare function upsertStoredWorkspaceSkillFileSync(input: {
    skillId: string;
    file: {
        id: string;
        path: string;
        content: string;
        createdAt: string;
        updatedAt: string;
    };
    skillUpdatedAt: string;
}, workspaceId?: string): WorkspaceSkill | null;
export declare function deleteStoredWorkspaceSkillFileSync(skillId: string, fileId: string, skillUpdatedAt: string, workspaceId?: string): WorkspaceSkill | null;
export declare function deleteStoredWorkspaceSkillSync(skillId: string, workspaceId?: string): boolean;
export declare function replaceStoredAgentSkillAssignmentsSync(assignments: Array<{
    employeeName: string;
    skillIds: string[];
}>, workspaceId?: string): void;
export declare function setStoredEmployeeSkillAssignmentsSync(employeeName: string, skillIds: string[], workspaceId?: string): void;
export declare function resetStoredWorkspaceSkillsSync(workspaceId?: string): void;
