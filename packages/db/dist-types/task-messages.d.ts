import type { TaskMessageRecord } from "./types.ts";
export declare function appendTaskMessageSync(input: {
    taskId: string;
    type: string;
    content?: string;
    tool?: string;
    inputJson?: Record<string, unknown>;
    output?: string;
}): TaskMessageRecord;
export declare function listTaskMessagesForTaskSync(taskId: string): TaskMessageRecord[];
