import type { MessageAttachment } from "@agent-space/domain/workspace";
export declare const STATE_DIR = "data";
export declare function createOpaqueId(): string;
export declare function uniqueNames(values: string[]): string[];
export declare function uniqueStringValues(values: string[]): string[];
export declare function slugify(value: string): string;
export declare function nowTime(): string;
export declare function formatTimeOfDay(value?: string | Date): string;
export declare function sameValue(left: string, right: string): boolean;
export declare function resolveRepositoryRoot(): string;
export declare function sanitizeAttachmentFileName(value: string): string;
export declare function inferAttachmentMediaType(fileName: string, inputMediaType?: string): string;
export declare function resolveAttachmentMediaType(fileName: string, inputMediaType?: string): string;
export declare function inferAttachmentKind(mediaType: string): MessageAttachment["kind"];
export declare function normalizeSkillFilePath(path: unknown): string;
export declare function normalizeSkillIds(skillIds: unknown, skills: Array<{
    id: string;
}>): string[];
export declare function readSkillFileContent(skill: {
    files: Array<{
        path: string;
        content: string;
    }>;
}, path: string): string;
