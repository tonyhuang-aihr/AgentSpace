import type { ChannelRecord } from "@agent-space/domain/workspace";
export declare function listStoredChannelsSync(workspaceId?: string): ChannelRecord[];
export declare function readStoredChannelSync(channelName: string, workspaceId?: string): ChannelRecord | null;
export declare function createStoredChannelSync(channel: ChannelRecord, workspaceId?: string): ChannelRecord;
export declare function updateStoredChannelSync(channelName: string, next: ChannelRecord, workspaceId?: string): ChannelRecord | null;
export declare function deleteStoredChannelSync(channelName: string, workspaceId?: string): boolean;
export declare function replaceStoredChannelsSync(channels: ChannelRecord[], workspaceId?: string): void;
