import { type RuntimeAppCatalogSource } from "@agent-space/db";
export interface RuntimeAppSkillSyncResult {
    status: "created" | "existing" | "not_available";
    skillId?: string;
    warning?: string;
}
export declare function syncRuntimeAppSkill(input: {
    workspaceId: string;
    runtimeId: string;
    source: RuntimeAppCatalogSource;
    name: string;
    fetchImpl?: typeof fetch;
}): Promise<RuntimeAppSkillSyncResult>;
