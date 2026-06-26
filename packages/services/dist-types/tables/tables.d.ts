import type { AgentSpaceState, DataTable, DataColumn } from "@agent-space/domain/workspace";
export declare function listDataTablesSync(workspaceId?: string): DataTable[];
export declare function readDataTableSync(id: string, workspaceId?: string): DataTable | undefined;
export declare function createDataTableSync(input: {
    name: string;
    channelName?: string;
    columns: Array<{
        name: string;
        type: DataColumn["type"];
        options?: string[];
        required?: boolean;
    }>;
    createdBy?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateDataTableSync(id: string, input: {
    name?: string;
    channelName?: string;
    columns?: Array<{
        id?: string;
        name: string;
        type: DataColumn["type"];
        options?: string[];
        required?: boolean;
    }>;
}, workspaceId?: string): AgentSpaceState;
export declare function deleteDataTableSync(id: string, workspaceId?: string): AgentSpaceState;
export declare function addDataRowSync(tableId: string, input: {
    cells: Record<string, unknown>;
    createdBy?: string;
}, workspaceId?: string): AgentSpaceState;
export declare function updateDataRowSync(tableId: string, rowId: string, cells: Record<string, unknown>, workspaceId?: string): AgentSpaceState;
export declare function deleteDataRowSync(tableId: string, rowId: string, workspaceId?: string): AgentSpaceState;
