export type SkillImportConflict = "reject" | "rename" | "replace" | "skip";
export type SkillImportSourceType = "github" | "skills.sh" | "clawhub" | "local";
export interface SkillImportResult {
    skillId: string;
    skillName: string;
    created: boolean;
    renamed: boolean;
    replaced: boolean;
    skipped: boolean;
    sourceType: SkillImportSourceType;
    warnings: string[];
}
export declare function importWorkspaceSkillFromUrl(input: {
    workspaceId?: string;
    url: string;
    conflict?: SkillImportConflict;
}): Promise<SkillImportResult>;
