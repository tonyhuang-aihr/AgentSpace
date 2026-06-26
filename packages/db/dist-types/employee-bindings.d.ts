import type { EmployeeRuntimeBindingRecord } from "./types.ts";
export declare function bindEmployeeRuntimeSync(input: {
    workspaceId?: string;
    employeeName: string;
    runtimeId: string;
}): EmployeeRuntimeBindingRecord;
export declare function unbindEmployeeRuntimeSync(employeeName: string, workspaceId?: string): boolean;
export declare function deleteEmployeeExecutionStateSync(employeeName: string, workspaceId?: string): {
    removedBinding: boolean;
    removedQueuedTasks: number;
};
export declare function readEmployeeRuntimeBindingSync(employeeName: string, workspaceId?: string): EmployeeRuntimeBindingRecord | null;
export declare function listEmployeeRuntimeBindingsSync(workspaceId?: string): EmployeeRuntimeBindingRecord[];
