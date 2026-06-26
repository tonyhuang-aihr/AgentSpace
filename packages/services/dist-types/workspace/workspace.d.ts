import { type AgentSpaceState, type WorkspaceSnapshot } from "@agent-space/domain/workspace";
export declare function bootstrapWorkspaceSync(input: {
    organizationName: string;
    ownerName: string;
    ownerRole: string;
    firstChannelName: string;
}, workspaceId?: string): AgentSpaceState;
export declare function initializeOrganizationSync(input: {
    organizationName: string;
    ownerName: string;
    ownerRole: string;
    firstChannelName?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function addHumanMemberSync(input: {
    name: string;
    role: string;
}, workspaceId?: string): AgentSpaceState;
export declare function readWorkspaceSnapshotSync(): WorkspaceSnapshot;
export declare function readWorkspaceSummarySync(): Record<string, string | number>;
