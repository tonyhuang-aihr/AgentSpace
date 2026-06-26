export interface SkillExportManifestEntry {
    id: string;
    name: string;
    description: string;
    sourceType?: string;
    sourceUrl?: string;
    fileCount: number;
    updatedAt: string;
}
export interface ExportedSkillsArchive {
    fileName: string;
    zipBytes: Uint8Array;
    manifest: {
        exportedAt: string;
        skillCount: number;
        skills: SkillExportManifestEntry[];
    };
}
export declare function exportWorkspaceSkillsArchiveSync(input: {
    skillIds: string[];
    workspaceId?: string;
}): ExportedSkillsArchive;
