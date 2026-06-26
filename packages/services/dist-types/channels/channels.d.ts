import { type AgentSpaceState, type ChannelRecord } from "@agent-space/domain/workspace";
export declare function isDirectChannel(channel: Pick<ChannelRecord, "kind">): boolean;
export declare function isGroupChannel(channel: Pick<ChannelRecord, "kind">): boolean;
export declare function findDirectChannelRecord(state: AgentSpaceState, input: {
    humanMemberName: string;
    employeeName: string;
}): ChannelRecord | undefined;
export declare function resolveChannelHumanMemberNames(state: AgentSpaceState, channel: Pick<ChannelRecord, "humanMemberNames" | "humanMembers">): string[];
export declare function resolveChannelHumanMemberCount(state: AgentSpaceState, channel: Pick<ChannelRecord, "humanMemberNames" | "humanMembers">): number;
export declare function ensureDirectChannelRecord(state: AgentSpaceState, input: {
    humanMemberName: string;
    employeeName: string;
}): ChannelRecord;
export declare function resolveCompatibleDirectChannelRecord(state: AgentSpaceState, employeeName: string): ChannelRecord | null;
export declare function ensureDirectChannelSync(input: {
    humanMemberName: string;
    employeeName: string;
}, workspaceId?: string): {
    state: AgentSpaceState;
    channelName: string;
};
export declare function removeChannelArtifactsFromState(state: AgentSpaceState, channelName: string, workspaceId?: string): AgentSpaceState;
export declare function createChannelSync(input: {
    name: string;
    humanMemberNames?: string[];
    employeeNames?: string[];
    kind?: ChannelRecord["kind"];
}, workspaceId?: string): AgentSpaceState;
export declare function addChannelEmployeesToState(state: AgentSpaceState, input: {
    channelName: string;
    employeeNames: string[];
}): ChannelRecord;
export declare function addChannelEmployeesSync(input: {
    channelName: string;
    employeeNames: string[];
}, workspaceId?: string): AgentSpaceState;
export declare function updateChannelHumanMemberNamesSync(input: {
    channelName: string;
    humanMemberNames: string[];
}, workspaceId?: string): AgentSpaceState;
export declare function deleteChannelSync(channelName: string, workspaceId?: string): AgentSpaceState;
export declare function renameChannelSync(channelName: string, nextName: string, workspaceId?: string): AgentSpaceState;
