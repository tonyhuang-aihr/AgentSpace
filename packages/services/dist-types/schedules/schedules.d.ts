import type { AgentSpaceState, ScheduledTask } from "@agent-space/domain/workspace";
export declare function listScheduledTasksSync(workspaceId?: string): ScheduledTask[];
export declare function readScheduledTaskSync(id: string, workspaceId?: string): ScheduledTask | undefined;
export declare function createScheduledTaskSync(input: {
    title: string;
    description?: string;
    assignee?: string;
    channelName?: string;
    repeat: ScheduledTask["repeat"];
    cronExpression?: string;
    scheduledAt: string;
    createdBy?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateScheduledTaskSync(id: string, input: {
    title?: string;
    description?: string;
    assignee?: string;
    channelName?: string;
    repeat?: ScheduledTask["repeat"];
    cronExpression?: string;
    scheduledAt?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function toggleScheduledTaskSync(id: string, status: "active" | "paused", workspaceId?: string): AgentSpaceState;
export declare function deleteScheduledTaskSync(id: string, workspaceId?: string): AgentSpaceState;
