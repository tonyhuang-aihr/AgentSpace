import type { AgentSpaceState, Template } from "@agent-space/domain/workspace";
export declare function listTemplatesSync(workspaceId?: string): Template[];
export declare function readTemplateSync(id: string, workspaceId?: string): Template | undefined;
export declare function createTemplateSync(input: {
    category: Template["category"];
    name: string;
    description?: string;
    configJson: string;
    createdBy?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateTemplateSync(id: string, input: {
    name?: string;
    description?: string;
    configJson?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function deleteTemplateSync(id: string, workspaceId?: string): AgentSpaceState;
