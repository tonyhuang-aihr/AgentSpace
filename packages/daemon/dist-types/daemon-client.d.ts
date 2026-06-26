import type { ClaimTaskResponse, CompleteTaskRequest, CreateRuntimeApprovalRequest, CreateRuntimeApprovalResponse, DaemonTaskInputBundle, DaemonTaskOutputBundle, FailTaskRequest, ClaimRuntimeAppOperationResponse, CompleteRuntimeAppOperationRequest, FailRuntimeAppOperationRequest, GetRuntimeApprovalResponse, HeartbeatDaemonResponse, HeartbeatDaemonRequest, RegisterDaemonRequest, RegisterDaemonResponse, ReportTaskMessagesRequest, StartRuntimeAppOperationRequest } from "./daemon-api.ts";
export type { ClaimTaskResponse, CompleteTaskRequest, CreateRuntimeApprovalRequest, CreateRuntimeApprovalResponse, DaemonTaskInputBundle, DaemonTaskOutputBundle, FailTaskRequest, ClaimRuntimeAppOperationResponse, CompleteRuntimeAppOperationRequest, FailRuntimeAppOperationRequest, GetRuntimeApprovalResponse, HeartbeatDaemonResponse, HeartbeatDaemonRequest, RegisterDaemonRequest, RegisterDaemonResponse, ReportTaskMessagesRequest, StartRuntimeAppOperationRequest, } from "./daemon-api.ts";
export declare class HttpDaemonClient {
    private readonly serverUrl;
    private readonly daemonToken;
    private readonly retryDelayMs;
    private readonly maxRetryAttempts;
    constructor(serverUrl: string, daemonToken: string, options?: {
        retryDelayMs?: number;
        maxRetryAttempts?: number;
    });
    register(request: RegisterDaemonRequest): Promise<RegisterDaemonResponse>;
    sendHeartbeat(daemonKey: string): Promise<HeartbeatDaemonResponse>;
    sendHeartbeatWithMetadata(daemonKey: string, metadata: Record<string, unknown>, runtimes?: HeartbeatDaemonRequest["runtimes"]): Promise<HeartbeatDaemonResponse>;
    claimTask(runtimeId: string): Promise<ClaimTaskResponse>;
    claimRuntimeAppOperation(runtimeId: string): Promise<ClaimRuntimeAppOperationResponse>;
    startRuntimeAppOperation(operationId: string, body?: StartRuntimeAppOperationRequest): Promise<void>;
    completeRuntimeAppOperation(operationId: string, body: CompleteRuntimeAppOperationRequest): Promise<void>;
    failRuntimeAppOperation(operationId: string, body: FailRuntimeAppOperationRequest): Promise<void>;
    startTask(taskId: string): Promise<void>;
    getInputBundle(taskId: string): Promise<DaemonTaskInputBundle>;
    reportMessages(taskId: string, body: ReportTaskMessagesRequest): Promise<void>;
    createRuntimeApproval(taskId: string, body: CreateRuntimeApprovalRequest): Promise<CreateRuntimeApprovalResponse>;
    getRuntimeApproval(taskId: string, approvalId: string): Promise<GetRuntimeApprovalResponse>;
    uploadOutputBundle(taskId: string, bundle: DaemonTaskOutputBundle): Promise<void>;
    completeTask(taskId: string, body: CompleteTaskRequest): Promise<void>;
    failTask(taskId: string, body: FailTaskRequest): Promise<void>;
    deregister(daemonKey: string, lastError?: string): Promise<void>;
    private getJson;
    private postJson;
    private buildHeaders;
    private resolveUrl;
    private requestJson;
    private readJson;
}
