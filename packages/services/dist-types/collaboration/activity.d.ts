import type { CollaborationActivity, CollaborationActorRef, CollaborativeObjectType } from "@agent-space/domain";
import type { AgentSpaceState } from "@agent-space/domain/workspace";
export interface CollaborationObjectFilter {
    objectType?: CollaborativeObjectType;
    objectId?: string;
}
export declare function listCollaborationActivitiesSync(filter?: CollaborationObjectFilter, workspaceId?: string): CollaborationActivity[];
export declare function recordCollaborationActivitySync(input: {
    objectType: CollaborativeObjectType;
    objectId: string;
    actor: CollaborationActorRef;
    verb: string;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
}, workspaceId?: string): CollaborationActivity;
export declare function appendCollaborationActivity(state: AgentSpaceState, input: {
    objectType: CollaborativeObjectType;
    objectId: string;
    actor: CollaborationActorRef;
    verb: string;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
}, workspaceId?: string): CollaborationActivity;
