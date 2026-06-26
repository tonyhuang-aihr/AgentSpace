import type { AgentSpaceState, ChannelDocument } from "@agent-space/domain/workspace";
import { type ContactContextEntity } from "./provider.ts";
export interface WorkspaceContextChannelSummary {
    name: string;
    memberNames: string[];
    documentCount: number;
}
export interface WorkspaceContextMessageResult {
    channelName: string;
    speaker: string;
    summary: string;
    time?: string;
}
export declare function listWorkspaceContextEntitiesSync(agentName: string, workspaceId?: string): ContactContextEntity[];
export declare function listWorkspaceContextEntities(state: AgentSpaceState, agentName: string): ContactContextEntity[];
export declare function resolveWorkspaceContextEntitySync(agentName: string, query: string, workspaceId?: string): ContactContextEntity | undefined;
export declare function resolveWorkspaceContextEntity(state: AgentSpaceState, agentName: string, query: string): ContactContextEntity | undefined;
export declare function listWorkspaceContextChannelsSync(agentName: string, workspaceId?: string): WorkspaceContextChannelSummary[];
export declare function listWorkspaceContextChannels(state: AgentSpaceState, agentName: string): WorkspaceContextChannelSummary[];
export declare function listWorkspaceContextDocumentsSync(agentName: string, channelName?: string, workspaceId?: string): ChannelDocument[];
export declare function listWorkspaceContextDocuments(state: AgentSpaceState, agentName: string, channelName?: string): ChannelDocument[];
export declare function searchWorkspaceContextMessagesSync(agentName: string, query: string, channelName?: string, workspaceId?: string): WorkspaceContextMessageResult[];
export declare function searchWorkspaceContextMessages(state: AgentSpaceState, agentName: string, query: string, channelName?: string): WorkspaceContextMessageResult[];
