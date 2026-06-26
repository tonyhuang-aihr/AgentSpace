import type { Readable } from "node:stream";
import { type AttachmentRuntimeConfig } from "../config/deployment.ts";
export interface StoredAttachmentObject {
    provider: "local" | "r2";
    bucket?: string;
    region?: string;
    endpoint?: string;
    key?: string;
    url?: string;
    storedPath: string;
    sizeBytes: number;
    sha256: string;
}
export interface AttachmentStoragePutInput {
    workspaceId: string;
    attachmentId: string;
    fileName: string;
    contentBytes: Uint8Array;
    localPath: string;
    mediaType?: string;
}
export interface AttachmentStorageReadInput {
    storageProvider?: string;
    storageBucket?: string;
    storageRegion?: string;
    storageEndpoint?: string;
    storageKey?: string;
    storedPath: string;
}
export interface AttachmentStorageObjectMetadata {
    provider: "local" | "r2";
    bucket?: string;
    region?: string;
    endpoint?: string;
    key?: string;
    storedPath: string;
    sizeBytes?: number;
    contentType?: string;
    etag?: string;
    lastModified?: string;
}
export interface AttachmentStorageClient {
    putObject(input: AttachmentStoragePutInput): Promise<StoredAttachmentObject>;
    putObjectSync(input: AttachmentStoragePutInput): StoredAttachmentObject;
    getObject(input: AttachmentStorageReadInput): Promise<Uint8Array>;
    headObject(input: AttachmentStorageReadInput): Promise<AttachmentStorageObjectMetadata | null>;
    deleteObject(input: AttachmentStorageReadInput): Promise<void>;
    deleteObjectSync(input: AttachmentStorageReadInput): void;
    createReadUrl(input: AttachmentStorageReadInput): Promise<string | null>;
}
export declare function createAttachmentStorageClient(config?: AttachmentRuntimeConfig): AttachmentStorageClient;
export declare function buildAttachmentStorageKey(input: {
    workspaceId: string;
    attachmentId: string;
    fileName: string;
    createdAt?: Date;
}): string;
export declare function sha256Hex(contentBytes: Uint8Array): string;
export declare function readableToUint8Array(readable: Readable): Promise<Uint8Array>;
