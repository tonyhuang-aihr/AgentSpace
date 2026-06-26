import type { KnowledgeAssignmentMode } from "@agent-space/domain/workspace";
import type { StoredAgentKnowledgePageRecord, StoredKnowledgeAssignmentPolicyRecord } from "./types.ts";
export declare function listStoredKnowledgeAssignmentPoliciesSync(workspaceId?: string): StoredKnowledgeAssignmentPolicyRecord[];
export declare function setStoredKnowledgePageAssignmentPolicySync(input: {
    workspaceId?: string;
    knowledgePageId: string;
    assignmentMode: KnowledgeAssignmentMode;
    updatedBy?: string;
    updatedAt?: string;
}): StoredKnowledgeAssignmentPolicyRecord;
export declare function deleteStoredKnowledgeAssignmentPoliciesForPagesSync(knowledgePageIds: string[], workspaceId?: string): number;
export declare function listStoredAgentKnowledgePageAssignmentsSync(workspaceId?: string): StoredAgentKnowledgePageRecord[];
export declare function listStoredKnowledgeAssignmentsByPageIdSync(knowledgePageId: string, workspaceId?: string): StoredAgentKnowledgePageRecord[];
export declare function listStoredKnowledgeAssignmentsByEmployeeSync(employeeName: string, workspaceId?: string): StoredAgentKnowledgePageRecord[];
export declare function setStoredKnowledgePageAssignedEmployeesSync(input: {
    workspaceId?: string;
    knowledgePageId: string;
    employeeNames: string[];
    createdBy?: string;
}): void;
export declare function setStoredEmployeeKnowledgePageAssignmentsSync(input: {
    workspaceId?: string;
    employeeName: string;
    knowledgePageIds: string[];
    createdBy?: string;
}): void;
export declare function deleteStoredKnowledgeAssignmentsForPagesSync(knowledgePageIds: string[], workspaceId?: string): number;
export declare function deleteStoredKnowledgeAssignmentsForEmployeeSync(employeeName: string, workspaceId?: string): number;
export declare function resetStoredKnowledgeAssignmentsSync(workspaceId?: string): void;
