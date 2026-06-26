import { type ActiveEmployee, type AgentSpaceState, type WorkspaceSkill, type WorkspaceSkillFile } from "@agent-space/domain/workspace";
export declare function normalizeWorkspaceState(state: Partial<AgentSpaceState>): AgentSpaceState;
export declare function buildRecoveredActiveEmployee(state: AgentSpaceState, employeeName: string, runtimeName: string): ActiveEmployee;
export declare function createWorkspaceSkillRecord(input: {
    name: string;
    description: string;
    content?: string;
    sourceType?: string;
    sourceUrl?: string;
    configJson?: string;
}): WorkspaceSkill;
export declare function ensureRequiredSkillFile(skill: WorkspaceSkill): WorkspaceSkill;
export declare function sortWorkspaceSkills(skills: WorkspaceSkill[]): WorkspaceSkill[];
export declare function sortWorkspaceSkillFiles(files: WorkspaceSkillFile[]): WorkspaceSkillFile[];
export declare function ensureBuiltinWorkspaceSkills(skills: WorkspaceSkill[]): WorkspaceSkill[];
export declare function createPredefinedAgentTemplateSkillRecords(): WorkspaceSkill[];
export declare function isPredefinedAgentTemplateSkillName(name: string): boolean;
export declare function createUniqueWorkspaceSkillName(skills: WorkspaceSkill[], baseName: string): string;
export declare function migrateLegacySkillIds(skills: unknown, skillPool: WorkspaceSkill[], employeeName: string): string[];
export declare function createBuiltinReturnOutputFilesSkillContent(): string;
export declare function createBuiltinWorkspaceContextSkillContent(): string;
export declare function createBuiltinUpdateChannelDocumentsSkillContent(): string;
export declare function createBuiltinGoogleWorkspaceCliSkillContent(): string;
export declare function normalizeLedgerData(data: unknown): Record<string, string> | undefined;
export declare function inferLegacyWorkspaceMessage(speaker: string, summary: string): {
    code: string;
    data?: Record<string, string>;
} | null;
export declare function normalizeWorkspaceSkillFiles(files: unknown, skillName: string, skillDescription: string): WorkspaceSkillFile[];
