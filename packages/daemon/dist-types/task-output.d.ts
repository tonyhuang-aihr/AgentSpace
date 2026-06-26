import type { MessageAttachment } from "@agent-space/domain/workspace";
export declare function clearTaskOutputArtifacts(workDir: string): void;
export declare function loadTaskOutputEnvelope(workDir: string, fallbackText: string, workspaceId: string): {
    text: string;
    attachments: MessageAttachment[];
    warnings: string[];
};
export declare function discardTaskOutputAttachments(attachments: MessageAttachment[]): void;
