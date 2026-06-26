import type { RuntimeAppCatalogItemRecord, RuntimeAppRiskLevel } from "@agent-space/db";
import type { RuntimeAppInstallPlan, RuntimeAppOperationType } from "@agent-space/domain";
export declare function buildRuntimeAppInstallPlan(input: {
    item: RuntimeAppCatalogItemRecord;
    operation: RuntimeAppOperationType;
    cliHubAvailable?: boolean;
}): RuntimeAppInstallPlan;
export declare function assessRuntimeAppRisk(item: Pick<RuntimeAppCatalogItemRecord, "installCmd" | "requiresText" | "installStrategy">): RuntimeAppRiskLevel;
