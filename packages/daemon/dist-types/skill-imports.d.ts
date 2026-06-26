export interface AppliedSkillImportOperation {
    skillId: string;
    skillName: string;
    sourceUrl: string;
    created: boolean;
    renamed: boolean;
    replaced: boolean;
    skipped: boolean;
    assignedToSelf: boolean;
}
export interface SkillImportOperationResult {
    warnings: string[];
    imports: AppliedSkillImportOperation[];
    statusMessages: string[];
}
export interface PreparedSkillImportOperationArtifacts {
    warnings: string[];
    packaged: number;
}
export declare function prepareSkillImportOperationArtifacts(workDir: string): PreparedSkillImportOperationArtifacts;
export declare function applySkillImportOperations(workDir: string, context: {
    workspaceId: string;
    agentName?: string;
}): Promise<SkillImportOperationResult>;
export declare function clearSkillImportOperationArtifacts(workDir: string): void;
