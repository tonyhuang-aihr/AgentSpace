import { NextResponse } from "next/server";
import { buildWorkspacePath } from "@/features/auth/workspace-paths";
import { acceptWorkspaceInvitationForUser } from "@/features/auth/workspace-invitations";
import { createSessionForFeishuLogin } from "@/features/auth/server-auth";
import { exchangeFeishuCodeForProfile, readFeishuOAuthConfig, verifyFeishuOAuthCallbackState } from "@/features/auth/feishu-oauth";
import { joinWorkspaceByCodeForUser } from "@/features/auth/workspace-join-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { appUrl } = readFeishuOAuthConfig();
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const error = url.searchParams.get("error")?.trim();

  if (error) {
    return NextResponse.redirect(buildPublicAppUrl(`/auth/error?code=${encodeURIComponent(error)}`, appUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(buildPublicAppUrl("/auth/error?code=auth.feishu_exchange_failed", appUrl));
  }

  let invitationToken: string | undefined;
  let joinCode: string | undefined;
  try {
    const verifiedState = await verifyFeishuOAuthCallbackState(state);
    invitationToken = verifiedState.invitationToken;
    joinCode = verifiedState.joinCode;
    const profile = await exchangeFeishuCodeForProfile({ code });

    // Use open_id as provider subject, email or open_id as email
    const currentUser = await createSessionForFeishuLogin({
      providerSubject: profile.openId,
      email: profile.email || `${profile.openId}@feishu`,
      emailVerified: Boolean(profile.email),
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
      invitationToken: verifiedState.invitationToken,
      joinCode: verifiedState.joinCode,
    });

    if (verifiedState.invitationToken) {
      const accepted = await acceptWorkspaceInvitationForUser({
        token: verifiedState.invitationToken,
        userId: currentUser.id,
        actorDisplayName: currentUser.displayName,
      });
      return NextResponse.redirect(buildPublicAppUrl(buildWorkspacePath(accepted.workspaceSlug, "/im"), appUrl));
    }

    if (verifiedState.joinCode) {
      const joined = await joinWorkspaceByCodeForUser({
        joinCode: verifiedState.joinCode,
        userId: currentUser.id,
        actorDisplayName: currentUser.displayName,
      });
      return NextResponse.redirect(buildPublicAppUrl(joined.redirectPath, appUrl));
    }

    return NextResponse.redirect(buildPublicAppUrl("/", appUrl));
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : "auth.feishu_exchange_failed";
    if (message === "auth.feishu_account_link_required") {
      const target = invitationToken
        ? `/auth/link/feishu?invitationToken=${encodeURIComponent(invitationToken)}`
        : "/auth/link/feishu";
      return NextResponse.redirect(buildPublicAppUrl(target, appUrl));
    }
    if (message === "auth.feishu_profile_setup_required") {
      return NextResponse.redirect(buildPublicAppUrl("/auth/setup/feishu", appUrl));
    }
    const target = invitationToken
      ? `/invite/${encodeURIComponent(invitationToken)}?authError=${encodeURIComponent(message)}`
      : joinCode
        ? `/?joinCode=${encodeURIComponent(joinCode)}&authError=${encodeURIComponent(message)}`
      : `/auth/error?code=${encodeURIComponent(message)}`;
    return NextResponse.redirect(buildPublicAppUrl(target, appUrl));
  }
}

function buildPublicAppUrl(path: string, appUrl: string): URL {
  return new URL(path, appUrl.endsWith("/") ? appUrl : `${appUrl}/`);
}
