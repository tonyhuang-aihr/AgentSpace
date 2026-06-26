import { type MentionCandidate } from "./mentions.ts";
export interface MentionStep {
    id: string;
    agentId: string;
    agentLabel: string;
    instruction: string;
    dependsOnStepIds: string[];
    handoffKind: "document" | "attachment" | "message";
}
export interface MentionPlan {
    mode: "parallel" | "sequential";
    steps: MentionStep[];
    warnings: string[];
    unknownMentions: string[];
}
export declare function parseMentionPlan(input: string, candidates: MentionCandidate[]): MentionPlan;
