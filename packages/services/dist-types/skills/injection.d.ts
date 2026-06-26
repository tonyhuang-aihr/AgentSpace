import type { DaemonProvider } from "@agent-space/domain";
import type { WorkspaceSkill } from "@agent-space/domain/workspace";
export interface MaterializedSkillDirectories {
    compatibilityDir?: string;
    nativeDir?: string;
    primaryDir?: string;
}
export declare function materializeWorkspaceSkillsForProvider(input: {
    skills: WorkspaceSkill[];
    workDir: string;
    provider: DaemonProvider;
}): MaterializedSkillDirectories;
