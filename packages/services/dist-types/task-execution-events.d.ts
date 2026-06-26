import { type TaskExecutionEventInput, type TaskExecutionEventListOptions, type TaskExecutionEventRecord } from "@agent-space/db";
export declare function recordTaskExecutionEventSync(input: TaskExecutionEventInput): TaskExecutionEventRecord;
export declare function listTaskExecutionEventsSync(options?: TaskExecutionEventListOptions): TaskExecutionEventRecord[];
export type { TaskExecutionEventInput, TaskExecutionEventListOptions, TaskExecutionEventRecord };
