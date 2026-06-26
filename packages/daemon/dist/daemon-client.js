// src/daemon-client.ts
var HttpDaemonClient = class {
  serverUrl;
  daemonToken;
  retryDelayMs;
  maxRetryAttempts;
  constructor(serverUrl, daemonToken, options) {
    this.serverUrl = serverUrl;
    this.daemonToken = daemonToken;
    this.retryDelayMs = options?.retryDelayMs ?? 250;
    this.maxRetryAttempts = Math.max(1, options?.maxRetryAttempts ?? 3);
  }
  async register(request) {
    return this.postJson("/api/daemon/register", request);
  }
  async sendHeartbeat(daemonKey) {
    return this.postJson("/api/daemon/heartbeat", { daemonKey }, { retryable: true });
  }
  async sendHeartbeatWithMetadata(daemonKey, metadata, runtimes) {
    return this.postJson("/api/daemon/heartbeat", { daemonKey, metadata, runtimes }, { retryable: true });
  }
  async claimTask(runtimeId) {
    return this.postJson(`/api/daemon/runtimes/${encodeURIComponent(runtimeId)}/tasks/claim`, {}, { retryable: true });
  }
  async claimRuntimeAppOperation(runtimeId) {
    return this.postJson(`/api/daemon/runtimes/${encodeURIComponent(runtimeId)}/apps/operations/claim`, {}, { retryable: true });
  }
  async startRuntimeAppOperation(operationId, body = {}) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/start`, body);
  }
  async completeRuntimeAppOperation(operationId, body) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/complete`, body);
  }
  async failRuntimeAppOperation(operationId, body) {
    await this.postJson(`/api/daemon/runtime-app-operations/${encodeURIComponent(operationId)}/fail`, body);
  }
  async startTask(taskId) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/start`, {});
  }
  async getInputBundle(taskId) {
    return this.getJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/input-bundle`, { retryable: true });
  }
  async reportMessages(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/messages`, body);
  }
  async createRuntimeApproval(taskId, body) {
    return this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/runtime-approvals`, body);
  }
  async getRuntimeApproval(taskId, approvalId) {
    return this.getJson(
      `/api/daemon/tasks/${encodeURIComponent(taskId)}/runtime-approvals/${encodeURIComponent(approvalId)}`,
      { retryable: true }
    );
  }
  async uploadOutputBundle(taskId, bundle) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/output-bundle`, bundle);
  }
  async completeTask(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/complete`, body);
  }
  async failTask(taskId, body) {
    await this.postJson(`/api/daemon/tasks/${encodeURIComponent(taskId)}/fail`, body);
  }
  async deregister(daemonKey, lastError) {
    await this.postJson("/api/daemon/deregister", {
      daemonKey,
      lastError
    });
  }
  async getJson(path, options) {
    return this.requestJson(path, {
      method: "GET",
      retryable: options?.retryable
    });
  }
  async postJson(path, body, options) {
    return this.requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
      retryable: options?.retryable
    });
  }
  buildHeaders() {
    return {
      authorization: `Bearer ${this.daemonToken}`,
      "content-type": "application/json"
    };
  }
  resolveUrl(path) {
    return new URL(path, this.serverUrl).toString();
  }
  async requestJson(path, options) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt += 1) {
      try {
        const response = await fetch(this.resolveUrl(path), {
          method: options.method,
          headers: this.buildHeaders(),
          body: options.body
        });
        if (options.retryable && response.status >= 500 && attempt < this.maxRetryAttempts) {
          await sleep(this.retryDelayMs);
          continue;
        }
        return this.readJson(response);
      } catch (error) {
        lastError = error;
        if (!options.retryable || attempt >= this.maxRetryAttempts) {
          throw error;
        }
        await sleep(this.retryDelayMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Daemon client request failed.");
  }
  async readJson(response) {
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload.error) {
          message = payload.error;
        }
      } catch {
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return void 0;
    }
    return response.json();
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  HttpDaemonClient
};
