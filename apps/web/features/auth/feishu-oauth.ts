import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { readServerEnvValue } from "./server-env";

const FEISHU_AUTH_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/index";
const FEISHU_APP_TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/auth/v2/app_access_token/internal";
const FEISHU_USER_TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/oidc/access_token";
const FEISHU_USERINFO_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v1/user_info";
const OAUTH_STATE_COOKIE = "agent_space_feishu_oauth_state";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

interface FeishuOAuthStatePayload {
  csrf: string;
  nonce: string;
  invitationToken?: string;
  joinCode?: string;
  createdAt: number;
}

export interface FeishuOAuthConfig {
  appUrl: string;
  appId: string;
  appSecret: string;
  callbackUrl: string;
  stateSecret: string;
}

export interface FeishuUserProfile {
  openId: string;
  unionId: string;
  email: string;
  name: string;
  enName?: string;
  avatarUrl?: string;
  mobile?: string;
  userId?: string;
}

export function readFeishuOAuthConfig(): FeishuOAuthConfig {
  const appUrl = readRequiredAuthEnv("AGENT_SPACE_APP_URL");
  const appId = readRequiredAuthEnv("AGENT_SPACE_FEISHU_APP_ID");
  const appSecret = readRequiredAuthEnv("AGENT_SPACE_FEISHU_APP_SECRET");
  const callbackUrl = readServerEnvValue("AGENT_SPACE_FEISHU_CALLBACK_URL")?.trim() || `${appUrl}/api/auth/feishu/callback`;
  const stateSecret = readRequiredAuthEnv("AGENT_SPACE_OAUTH_STATE_SECRET");
  return { appUrl, appId, appSecret, callbackUrl, stateSecret };
}

export function isFeishuOAuthConfigured(): boolean {
  const appId = readServerEnvValue("AGENT_SPACE_FEISHU_APP_ID")?.trim();
  const appSecret = readServerEnvValue("AGENT_SPACE_FEISHU_APP_SECRET")?.trim();
  return Boolean(appId && appSecret);
}

export async function createFeishuAuthorizationUrl(input?: {
  invitationToken?: string;
  joinCode?: string;
}): Promise<string> {
  const config = readFeishuOAuthConfig();
  const statePayload: FeishuOAuthStatePayload = {
    csrf: randomBytes(16).toString("hex"),
    nonce: randomBytes(16).toString("hex"),
    invitationToken: input?.invitationToken?.trim() || undefined,
    joinCode: input?.joinCode?.trim() || undefined,
    createdAt: Date.now(),
  };
  const state = signOAuthState(statePayload, config.stateSecret);
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: config.callbackUrl,
    state,
  });
  return `${FEISHU_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function verifyFeishuOAuthCallbackState(state: string): Promise<{
  invitationToken?: string;
  joinCode?: string;
  nonce: string;
}> {
  const config = readFeishuOAuthConfig();
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value?.trim();
  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true, maxAge: 0, path: "/",
    secure: process.env.NODE_ENV === "production", sameSite: "lax",
  });
  if (!cookieState || cookieState !== state.trim()) {
    throw new Error("auth.feishu_state_invalid");
  }
  const payload = readAndVerifyOAuthState(cookieState, config.stateSecret);
  if (Date.now() - payload.createdAt > OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
    throw new Error("auth.feishu_state_invalid");
  }
  return { invitationToken: payload.invitationToken, joinCode: payload.joinCode, nonce: payload.nonce };
}

export async function exchangeFeishuCodeForProfile(input: { code: string }): Promise<FeishuUserProfile> {
  const config = readFeishuOAuthConfig();
  // Step 1: Get app_access_token
  const appTokenResponse = await fetch(FEISHU_APP_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
    cache: "no-store",
  });
  if (!appTokenResponse.ok) throw new Error("auth.feishu_app_token_failed");
  const appTokenPayload = await appTokenResponse.json() as { code?: number; app_access_token?: string };
  if (appTokenPayload.code !== 0 || !appTokenPayload.app_access_token) throw new Error("auth.feishu_app_token_failed");

  // Step 2: Exchange code for user_access_token
  const userTokenResponse = await fetch(FEISHU_USER_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appTokenPayload.app_access_token}` },
    body: JSON.stringify({ grant_type: "authorization_code", code: input.code }),
    cache: "no-store",
  });
  if (!userTokenResponse.ok) throw new Error("auth.feishu_exchange_failed");
  const userTokenPayload = await userTokenResponse.json() as { code?: number; data?: { access_token?: string } };
  if (userTokenPayload.code !== 0 || !userTokenPayload.data?.access_token) throw new Error("auth.feishu_exchange_failed");

  // Step 3: Get user info
  const userInfoResponse = await fetch(FEISHU_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${userTokenPayload.data.access_token}` },
    cache: "no-store",
  });
  if (!userInfoResponse.ok) throw new Error("auth.feishu_userinfo_failed");
  const userInfoPayload = await userInfoResponse.json() as {
    code?: number; data?: { name?: string; en_name?: string; avatar_url?: string; open_id?: string; union_id?: string; email?: string; user_id?: string; mobile?: string };
  };
  if (userInfoPayload.code !== 0 || !userInfoPayload.data?.open_id) throw new Error("auth.feishu_userinfo_failed");
  const data = userInfoPayload.data;
  return {
    openId: data.open_id!,
    unionId: data.union_id ?? "",
    email: data.email?.trim() ?? "",
    name: data.name?.trim() || data.en_name?.trim() || data.open_id!,
    enName: data.en_name?.trim() || undefined,
    avatarUrl: data.avatar_url?.trim() || undefined,
    mobile: data.mobile?.trim() || undefined,
    userId: data.user_id?.trim() || undefined,
  };
}

function readRequiredAuthEnv(name: string): string {
  const value = readServerEnvValue(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function signOAuthState(payload: FeishuOAuthStatePayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function readAndVerifyOAuthState(state: string, secret: string): FeishuOAuthStatePayload {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) throw new Error("auth.feishu_state_invalid");
  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  if (signature !== expectedSignature) throw new Error("auth.feishu_state_invalid");
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as FeishuOAuthStatePayload;
}
