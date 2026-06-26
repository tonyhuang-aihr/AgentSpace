import { type AgentSpaceState, type TaskRecord, type TaskStatus } from "@agent-space/domain/workspace";
export declare function listTasksSync(workspaceId?: string): TaskRecord[];
export declare function createTaskSync(input: {
    title: string;
    channel: string;
    assignee: string;
    priority: TaskRecord["priority"];
    requestedByUserId?: string;
    requestedByDisplayName?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateTaskStatusSync(taskId: string, status: TaskStatus, workspaceId?: string): AgentSpaceState;
export declare function reorderTaskSync(taskId: string, newSortOrder: number, workspaceId?: string): AgentSpaceState;
export declare function addTaskLabelSync(taskId: string, label: string, workspaceId?: string): AgentSpaceState;
export declare function removeTaskLabelSync(taskId: string, label: string, workspaceId?: string): AgentSpaceState;
