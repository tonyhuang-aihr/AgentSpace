import type { AgentSpaceState } from "@agent-space/domain/workspace";
export declare function normalizeCollaborationCommentThreads(threads: AgentSpaceState["collaborationCommentThreads"] | undefined, fallback: AgentSpaceState["collaborationCommentThreads"]): AgentSpaceState["collaborationCommentThreads"];
export declare function normalizeCollaborationComments(comments: AgentSpaceState["collaborationComments"] | undefined, fallback: AgentSpaceState["collaborationComments"]): AgentSpaceState["collaborationComments"];
export declare function normalizeCollaborationActivities(activities: AgentSpaceState["collaborationActivities"] | undefined, fallback: AgentSpaceState["collaborationActivities"]): AgentSpaceState["collaborationActivities"];
export declare function normalizeCollaborationChangeProposals(proposals: AgentSpaceState["collaborationChangeProposals"] | undefined, fallback: AgentSpaceState["collaborationChangeProposals"]): AgentSpaceState["collaborationChangeProposals"];
