import type { WorkspaceSkill } from "./workspace.ts";
export type AgentTemplateId = "finance-analyst" | "product-manager" | "product-designer";
export type AgentTemplateSkillRequirement = "required" | "recommended" | "optional";
export interface AgentTemplateSkillRecommendation {
    key: string;
    label: string;
    requirement: AgentTemplateSkillRequirement;
    sourceType: "skills.sh" | "clawhub" | "github";
    sourceUrl: string;
    description: string;
    aliases: string[];
    searchTerms: string[];
}
export interface SystemAgentTemplatePreset {
    id: AgentTemplateId;
    version: number;
    category: "finance" | "product" | "design";
    displayName: string;
    shortDescription: string;
    defaultAgentName: string;
    defaultRemarkName: string;
    defaultTitle: string;
    summary: string;
    fit: string;
    traits: string[];
    instructions: string;
    skillRecommendations: AgentTemplateSkillRecommendation[];
}
export interface AgentTemplateSkillMatch {
    recommendation: AgentTemplateSkillRecommendation;
    matchedSkill?: WorkspaceSkill;
    score: number;
    reason: string;
}
export declare const SYSTEM_AGENT_TEMPLATE_PRESETS: readonly SystemAgentTemplatePreset[];
export declare function getSystemAgentTemplatePreset(templateId: string): SystemAgentTemplatePreset | undefined;
export declare function resolveAgentTemplateSkillMatches(template: SystemAgentTemplatePreset, workspaceSkills: readonly WorkspaceSkill[]): AgentTemplateSkillMatch[];
export declare function resolveAgentTemplateSkillIds(template: SystemAgentTemplatePreset, workspaceSkills: readonly WorkspaceSkill[]): string[];
