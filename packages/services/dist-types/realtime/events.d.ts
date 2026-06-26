export type WorkspaceRealtimeEvent = {
    type: "channel.message.created";
    workspaceId: string;
    channelName: string;
    messageId: string;
    sequence: number;
    createdAt: string;
} | {
    type: "channel.thread.changed";
    workspaceId: string;
    channelName: string;
    sequence: number;
    changedAt: string;
} | {
    type: "task.execution_event.created";
    workspaceId: string;
    channelName: string;
    taskId: string;
    eventId: string;
    sequence: number;
    createdAt: string;
};
export type WorkspaceRealtimeListener = (event: WorkspaceRealtimeEvent) => void;
export declare function publishChannelMessageCreatedEvent(input: {
    workspaceId: string;
    channelName: string;
    messageId: string;
    createdAt: string;
}): WorkspaceRealtimeEvent;
export declare function publishChannelThreadChangedEvent(input: {
    workspaceId: string;
    channelName: string;
    changedAt: string;
}): WorkspaceRealtimeEvent;
export declare function publishTaskExecutionEventCreatedEvent(input: {
    workspaceId: string;
    channelName: string;
    taskId: string;
    eventId: string;
    createdAt: string;
}): WorkspaceRealtimeEvent;
export declare function subscribeWorkspaceRealtimeEvents(workspaceId: string, listener: WorkspaceRealtimeListener): () => void;
