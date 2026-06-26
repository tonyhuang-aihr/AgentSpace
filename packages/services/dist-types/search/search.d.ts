export type SearchResultType = "message" | "document" | "task" | "agent" | "skill" | "knowledge";
export interface SearchResult {
    type: SearchResultType;
    id: string;
    title: string;
    snippet: string;
    score: number;
    meta?: Record<string, string>;
}
export interface SearchOptions {
    types?: SearchResultType[];
    channelName?: string;
    assignedAgentName?: string;
    limit?: number;
    workspaceId?: string;
}
export declare function globalSearchSync(query: string, options?: SearchOptions): SearchResult[];
