import { type StoredAgentKnowledgePageRecord, type StoredKnowledgeAssignmentPolicyRecord } from "@agent-space/db";
import type { AgentSpaceState, KnowledgeAssignmentMode, KnowledgePage } from "@agent-space/domain/workspace";
export type KnowledgeAssignmentPolicy = StoredKnowledgeAssignmentPolicyRecord;
export type AgentKnowledgePageAssignment = StoredAgentKnowledgePageRecord;
export declare function listKnowledgeAssignmentPoliciesSync(workspaceId?: string): KnowledgeAssignmentPolicy[];
export declare function listKnowledgeAssignmentsSync(workspaceId?: string): AgentKnowledgePageAssignment[];
export declare function listKnowledgeAssignmentsByPageIdSync(pageId: string, workspaceId?: string): AgentKnowledgePageAssignment[];
export declare function listKnowledgeAssignmentsByEmployeeSync(employeeName: string, workspaceId?: string): AgentKnowledgePageAssignment[];
export declare function listEmployeeKnowledgePageIdsSync(employeeName: string, workspaceId?: string): string[];
export declare function listEmployeeKnowledgePagesSync(employeeName: string, workspaceId?: string): KnowledgePage[];
export declare function setKnowledgePageAssignmentModeSync(pageId: string, assignmentMode: KnowledgeAssignmentMode, actor?: string, workspaceId?: string): AgentSpaceState;
export declare function setKnowledgePageAssignedEmployeesSync(pageId: string, employeeNames: string[], actor?: string, workspaceId?: string): AgentSpaceState;
export declare function setEmployeeKnowledgePageIdsSync(employeeName: string, pageIds: string[], actor?: string, workspaceId?: string): AgentSpaceState;
export declare function deleteKnowledgeAssignmentsForPageSync(pageIds: string[], workspaceId?: string): {
    removedPolicies: number;
    removedAssignments: number;
};
export declare function deleteKnowledgeAssignmentsForEmployeeSync(employeeName: string, workspaceId?: string): number;
