import type { CollaborationActorRef, CollaborationComment, CollaborationCommentThread, CollaborationCommentThreadWithComments, CollaborativeObjectType } from "@agent-space/domain";
export declare function listCollaborationCommentThreadsSync(filter?: {
    objectType?: CollaborativeObjectType;
    objectId?: string;
    status?: CollaborationCommentThread["status"];
}, workspaceId?: string): CollaborationCommentThreadWithComments[];
export declare function createCollaborationCommentThreadSync(input: {
    objectType: CollaborativeObjectType;
    objectId: string;
    anchor?: Record<string, unknown>;
    createdBy: CollaborationActorRef;
    body: string;
}, workspaceId?: string): CollaborationCommentThreadWithComments;
export declare function addCollaborationCommentSync(input: {
    threadId: string;
    author: CollaborationActorRef;
    body: string;
}, workspaceId?: string): CollaborationComment;
