import { type ChannelDocumentAccessRole } from "@agent-space/domain";
import type { AgentSpaceState, ChannelDocument } from "@agent-space/domain/workspace";
export declare function ensureChannelDocumentAccessSeeds(state: AgentSpaceState): boolean;
export declare function listChannelDocumentAccesses(state: AgentSpaceState, documentId: string): AgentSpaceState["channelDocumentAccesses"];
export declare function resolveChannelDocumentRole(state: AgentSpaceState, documentId: string, actorId: string, actorType: "human" | "agent"): ChannelDocumentAccessRole | null;
export declare function canViewChannelDocument(state: AgentSpaceState, document: ChannelDocument, actorId: string, actorType: "human" | "agent"): boolean;
export declare function assertCanViewChannelDocument(state: AgentSpaceState, document: ChannelDocument, actorId: string, actorType: "human" | "agent"): void;
export declare function assertCanCreateChannelDocument(state: AgentSpaceState, channelName: string, actorId: string, actorType: "human" | "agent"): void;
export declare function assertCanEditChannelDocument(state: AgentSpaceState, document: ChannelDocument, actorId: string, actorType: "human" | "agent"): void;
export declare function assertCanManageChannelDocument(state: AgentSpaceState, document: ChannelDocument, actorId: string, actorType: "human" | "agent"): void;
export declare function upsertChannelDocumentAccessRole(state: AgentSpaceState, input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    role: ChannelDocumentAccessRole;
}): AgentSpaceState["channelDocumentAccesses"][number];
export declare function addChannelDocumentCollaborator(state: AgentSpaceState, input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
    role: ChannelDocumentAccessRole;
}): AgentSpaceState["channelDocumentAccesses"][number];
export declare function removeChannelDocumentCollaborator(state: AgentSpaceState, input: {
    documentId: string;
    actorId: string;
    actorType: "human" | "agent";
}): AgentSpaceState["channelDocumentAccesses"][number];
export declare function ensureDocumentKeepsAnOwner(state: AgentSpaceState, documentId: string, nextActorId: string, nextActorType: "human" | "agent", nextRole: ChannelDocumentAccessRole): void;
