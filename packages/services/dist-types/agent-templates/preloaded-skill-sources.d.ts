export interface PreloadedAgentTemplateSkillSourceFile {
    path: string;
    content: string;
}
export interface PreloadedAgentTemplateSkillSource {
    key: string;
    name: string;
    description: string;
    sourceType: "github" | "skills.sh" | "clawhub";
    sourceUrl: string;
    resolvedSourceUrl: string;
    resolvedCommit: string;
    sourcePath: string;
    files: PreloadedAgentTemplateSkillSourceFile[];
}
export declare const PRELOADED_AGENT_TEMPLATE_SKILL_SOURCES: PreloadedAgentTemplateSkillSource[];
export declare function findPreloadedAgentTemplateSkillSource(input: {
    key: string;
    sourceType: string;
    sourceUrl: string;
}): PreloadedAgentTemplateSkillSource | undefined;
