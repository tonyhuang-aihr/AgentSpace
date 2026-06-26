export declare const MAX_OUTPUT_ATTACHMENTS = 5;
export declare const MAX_OUTPUT_ATTACHMENT_BYTES: number;
export declare const MAX_OUTPUT_ATTACHMENTS_TOTAL_BYTES: number;
export declare const MAX_RUNTIME_OUTPUT_BUNDLE_FILES = 64;
export declare const MAX_RUNTIME_OUTPUT_BUNDLE_SINGLE_FILE_BYTES: number;
export declare const MAX_RUNTIME_OUTPUT_BUNDLE_TOTAL_BYTES: number;
export declare const MAX_KNOWLEDGE_PROPOSAL_MARKDOWN_BYTES: number;
export declare const RUNTIME_OUTPUT_MANIFEST_RELATIVE_PATHS: readonly ["runtime-output/agent-output.json", "runtime-output/channel-documents.json", "runtime-output/skill-imports.json", "runtime-output/knowledge-proposals.json", "runtime-output/external-documents.json", "runtime-output/permission-requests.json", "runtime-output/external-sheets.json", "runtime-output/external-sheets-results.json", "runtime-output/external-google-docs.json"];
type SkillImportConflict = "reject" | "rename" | "replace" | "skip";
type ExternalSheetOperationType = "read" | "append_rows" | "update_values" | "batch_update";
type ExternalGoogleDocOperationType = "append_text" | "batch_update";
type ExternalSheetResultStatus = "succeeded" | "failed";
type AgentAssignableDocumentAccessRole = "viewer" | "editor" | "forwarder";
type KnowledgeProposalOperation = "create" | "update";
export interface AgentOutputAttachmentManifest {
    path: string;
    name?: string;
    mediaType?: string;
}
export interface AgentOutputManifest {
    text?: string;
    attachments?: AgentOutputAttachmentManifest[];
}
export interface ChannelDocumentManifestOperation {
    op: "replace_block" | "insert_after" | "delete_block";
    blockId?: string;
    afterBlockId?: string;
    baseRevision?: number;
    contentPath?: string;
    heading?: string;
}
export interface ChannelDocumentManifestEntry {
    documentId?: string;
    baseVersionId?: string;
    title: string;
    contentPath?: string;
    summary?: string;
    mode?: "create" | "update" | "create_or_update";
    triggerType?: "agent" | "handoff";
    operations?: ChannelDocumentManifestOperation[];
}
export interface ChannelDocumentsManifest {
    documents: ChannelDocumentManifestEntry[];
}
export interface SkillImportManifestEntry {
    url?: string;
    path?: string;
    archivePath?: string;
    conflict?: SkillImportConflict;
    assignToSelf?: boolean;
}
export interface SkillImportsManifest {
    imports: SkillImportManifestEntry[];
}
export interface KnowledgeProposalManifestEntry {
    operation: KnowledgeProposalOperation;
    title: string;
    contentPath: string;
    summary?: string;
    reason?: string;
    tags?: string[];
    parentId?: string | null;
    assignmentMode?: "all_agents" | "selected_agents";
    assignedEmployeeNames?: string[];
    assignToSelf?: boolean;
    targetKnowledgePageId?: string;
    baseUpdatedAt?: string;
}
export interface KnowledgeProposalsManifest {
    version?: 1;
    generatedBy?: "agent-space-cli";
    proposals: KnowledgeProposalManifestEntry[];
}
export interface ExternalSheetManifestOperation {
    documentId: string;
    operationType: ExternalSheetOperationType;
    intent: string;
    rangeA1?: string;
    values?: unknown[][];
    requests?: Array<Record<string, unknown>>;
    requestSummary?: string;
    valueInputOption?: "RAW" | "USER_ENTERED";
    insertDataOption?: "OVERWRITE" | "INSERT_ROWS";
}
export interface ExternalSheetsManifest {
    operations: ExternalSheetManifestOperation[];
}
export interface ExternalSheetResultPreview {
    rowCount?: number;
    cellCount?: number;
    headers?: string[];
    rowsPreview?: unknown[][];
    truncated?: boolean;
}
export interface ExternalSheetResultManifestEntry {
    documentId: string;
    operation: ExternalSheetOperationType;
    range?: string;
    resultPath: string;
    summary: string;
    requestSummary?: string;
    rowCount?: number;
    cellCount?: number;
    headers?: string[];
    rowsPreview?: unknown[][];
    truncated?: boolean;
    preview?: ExternalSheetResultPreview;
    status?: ExternalSheetResultStatus;
    errorCode?: string;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
}
export interface ExternalSheetsResultsManifest {
    version?: 1;
    results: ExternalSheetResultManifestEntry[];
}
export type ExternalGoogleDocManifestOperation = {
    documentId: string;
    operationType: "append_text";
    intent: string;
    text: string;
    textPath?: string;
    requestSummary?: string;
} | {
    documentId: string;
    operationType: "batch_update";
    intent: string;
    requests: Array<Record<string, unknown>>;
    requestsPath?: string;
    requestSummary?: string;
};
export interface ExternalGoogleDocsManifest {
    version?: 1;
    operations: ExternalGoogleDocManifestOperation[];
}
export interface ExternalDocumentLinkManifestEntry {
    operationType: "link_google_sheet";
    sourceDocumentId?: string;
    externalFileId?: string;
    externalUrl?: string;
    targetChannel: string;
    title: string;
    summary?: string;
}
export interface ExternalDocumentCreateGoogleSheetManifestEntry {
    operationType: "create_google_sheet";
    externalFileId: string;
    externalUrl: string;
    targetChannel: string;
    title: string;
    summary?: string;
    externalMimeType?: string;
    externalRevisionId?: string;
    externalUpdatedAt?: string;
    resultPath: string;
    parentFolderId?: string;
}
export type ExternalDocumentManifestEntry = ExternalDocumentLinkManifestEntry | ExternalDocumentCreateGoogleSheetManifestEntry;
export interface ExternalDocumentsManifest {
    version?: 1;
    generatedBy?: "agent-space-cli";
    operations: ExternalDocumentManifestEntry[];
}
export interface DocumentPermissionRequestManifestEntry {
    requestedRole: AgentAssignableDocumentAccessRole;
    reason: string;
    documentId?: string;
    externalProvider?: "google_workspace" | "notion" | "microsoft_365";
    externalFileId?: string;
    externalUrl?: string;
    targetChannel?: string;
}
export interface DocumentPermissionRequestsManifest {
    version?: 1;
    generatedBy?: "agent-space-cli";
    requests: DocumentPermissionRequestManifestEntry[];
}
export interface RuntimeOutputValidationResult {
    valid: boolean;
    warnings: string[];
    errors: string[];
}
export interface RuntimeOutputPreview {
    workDir: string;
    manifests: {
        agentOutput: {
            exists: boolean;
            text?: string;
            attachmentCount: number;
            totalAttachmentBytes: number;
        };
        channelDocuments: {
            exists: boolean;
            documentOperations: number;
        };
        skillImports: {
            exists: boolean;
            imports: number;
        };
        knowledgeProposals: {
            exists: boolean;
            proposals: number;
        };
        externalSheets: {
            exists: boolean;
            operations: number;
        };
        externalSheetResults: {
            exists: boolean;
            results: number;
        };
        externalGoogleDocs: {
            exists: boolean;
            operations: number;
            operationSummaries: Array<{
                documentId: string;
                operationType: ExternalGoogleDocOperationType;
                intent: string;
            }>;
        };
        externalDocuments: {
            exists: boolean;
            operations: number;
        };
        permissionRequests: {
            exists: boolean;
            requests: number;
        };
    };
    warnings: string[];
    errors: string[];
}
export interface PreparedRuntimeOutputArtifact {
    relativePath: string;
    absolutePath: string;
    copied: boolean;
}
export interface RuntimeOutputBundleFile {
    path: string;
    contentBase64: string;
}
export declare function readAgentOutputManifest(workDir: string): AgentOutputManifest;
export declare function writeAgentOutputManifest(workDir: string, manifest: AgentOutputManifest): void;
export declare function appendAgentOutputAttachment(workDir: string, attachment: AgentOutputAttachmentManifest, text?: string): AgentOutputManifest;
export declare function setAgentOutputText(workDir: string, text: string): AgentOutputManifest;
export declare function readChannelDocumentsManifest(workDir: string): ChannelDocumentsManifest;
export declare function appendChannelDocumentManifestEntry(workDir: string, entry: ChannelDocumentManifestEntry): ChannelDocumentsManifest;
export declare function readSkillImportsManifest(workDir: string): SkillImportsManifest;
export declare function appendSkillImportManifestEntry(workDir: string, entry: SkillImportManifestEntry): SkillImportsManifest;
export declare function readKnowledgeProposalsManifest(workDir: string): KnowledgeProposalsManifest;
export declare function appendKnowledgeProposalManifestEntry(workDir: string, entry: KnowledgeProposalManifestEntry): KnowledgeProposalsManifest;
export declare function readExternalSheetsManifest(workDir: string): ExternalSheetsManifest;
export declare function appendExternalSheetOperation(workDir: string, operation: ExternalSheetManifestOperation): ExternalSheetsManifest;
export declare function readExternalSheetsResultsManifest(workDir: string): ExternalSheetsResultsManifest;
export declare function appendExternalSheetResult(workDir: string, result: ExternalSheetResultManifestEntry): ExternalSheetsResultsManifest;
export declare function readExternalGoogleDocsManifest(workDir: string): ExternalGoogleDocsManifest;
export declare function appendExternalGoogleDocOperation(workDir: string, operation: ExternalGoogleDocManifestOperation): ExternalGoogleDocsManifest;
export declare function readExternalDocumentsManifest(workDir: string): ExternalDocumentsManifest;
export declare function appendExternalDocumentLinkOperation(workDir: string, operation: ExternalDocumentLinkManifestEntry): ExternalDocumentsManifest;
export declare function appendExternalDocumentCreateGoogleSheetOperation(workDir: string, operation: ExternalDocumentCreateGoogleSheetManifestEntry): ExternalDocumentsManifest;
export declare function readDocumentPermissionRequestsManifest(workDir: string): DocumentPermissionRequestsManifest;
export declare function appendDocumentPermissionRequest(workDir: string, request: DocumentPermissionRequestManifestEntry): DocumentPermissionRequestsManifest;
export declare function prepareRuntimeOutputArtifactReference(input: {
    workDir: string;
    sourcePath: string;
    copyOutsideWorkDir?: boolean;
}): PreparedRuntimeOutputArtifact;
export declare function validateRuntimeOutputManifests(workDir: string): RuntimeOutputValidationResult;
export declare function createRuntimeOutputPreview(workDir: string): RuntimeOutputPreview;
export declare function collectRuntimeOutputBundleFiles(workDir: string): RuntimeOutputBundleFile[];
export {};
