import type { ActiveEmployee } from "@agent-space/domain/workspace";
export declare function listStoredEmployeesSync(workspaceId?: string): ActiveEmployee[];
export declare function readStoredEmployeeSync(employeeName: string, workspaceId?: string): ActiveEmployee | null;
export declare function createStoredEmployeeSync(employee: ActiveEmployee, workspaceId?: string): ActiveEmployee;
export declare function updateStoredEmployeeSync(employeeName: string, next: ActiveEmployee, workspaceId?: string): ActiveEmployee | null;
export declare function deleteStoredEmployeeSync(employeeName: string, workspaceId?: string): boolean;
export declare function replaceStoredEmployeesSync(employees: ActiveEmployee[], workspaceId?: string): void;
