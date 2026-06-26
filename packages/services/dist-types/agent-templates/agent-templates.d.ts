import { type AgentTemplateSkillMatch, type SystemAgentTemplatePreset } from "@agent-space/domain";
export interface ResolvedAgentTemplateForWorkspace {
    template: SystemAgentTemplatePreset;
    skillIds: string[];
    skillMatches: AgentTemplateSkillMatch[];
}
export declare function resolveSystemAgentTemplateForWorkspaceSync(templateId: string, workspaceId?: string): ResolvedAgentTemplateForWorkspace;
