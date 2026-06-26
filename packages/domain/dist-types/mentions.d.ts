export interface MentionCandidate {
    agentId: string;
    label: string;
    aliases: string[];
    inChannel: boolean;
}
export interface ParsedMention {
    agentId: string;
    label: string;
    token: string;
    mentionType: "agent";
    inChannel: boolean;
}
export interface MentionParseResult {
    mentions: ParsedMention[];
    unknownMentions: string[];
}
export interface MentionQueryMatch {
    query: string;
    start: number;
    end: number;
}
export declare function parseAgentMentions(input: string, candidates: MentionCandidate[]): MentionParseResult;
export declare function findDraftMentionQuery(input: string, caretIndex: number): MentionQueryMatch | null;
export declare function applyMentionSelection(input: string, caretIndex: number, label: string): {
    value: string;
    caretIndex: number;
};
