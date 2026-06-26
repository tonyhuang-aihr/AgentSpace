import { type AgentSpaceState, type MaterialInput } from "@agent-space/domain/workspace";
export declare function listMaterialsSync(): MaterialInput[];
export declare function addMaterialSync(source: string, status: string): AgentSpaceState;
export declare function importMaterialFileSync(input: {
    filePath: string;
    label?: string;
    status: string;
}): AgentSpaceState;
export declare function parseMaterialSync(id: string): AgentSpaceState;
