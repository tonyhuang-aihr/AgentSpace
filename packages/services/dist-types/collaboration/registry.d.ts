import type { CollaborativeObjectRef, CollaborativeObjectType } from "@agent-space/domain";
import type { AgentSpaceState } from "@agent-space/domain/workspace";
export interface CollaborativeObjectInput {
    objectType: CollaborativeObjectType;
    objectId: string;
}
export declare function resolveCollaborativeObjectSync(input: CollaborativeObjectInput, workspaceId?: string): CollaborativeObjectRef;
export declare function resolveCollaborativeObject(state: AgentSpaceState, input: CollaborativeObjectInput, workspaceId?: string): CollaborativeObjectRef;
