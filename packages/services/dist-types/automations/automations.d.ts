import type { AgentSpaceState, AutomationRule, AutomationTrigger, AutomationCondition, AutomationAction } from "@agent-space/domain/workspace";
export declare function listAutomationRulesSync(workspaceId?: string): AutomationRule[];
export declare function readAutomationRuleSync(id: string, workspaceId?: string): AutomationRule | undefined;
export declare function createAutomationRuleSync(input: {
    name: string;
    description?: string;
    trigger: AutomationTrigger;
    conditions?: AutomationCondition[];
    actions: AutomationAction[];
    createdBy?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateAutomationRuleSync(id: string, input: {
    name?: string;
    description?: string;
    trigger?: AutomationTrigger;
    conditions?: AutomationCondition[];
    actions?: AutomationAction[];
}, workspaceId?: string): AgentSpaceState;
export declare function toggleAutomationRuleSync(id: string, enabled: boolean, workspaceId?: string): AgentSpaceState;
export declare function deleteAutomationRuleSync(id: string, workspaceId?: string): AgentSpaceState;
