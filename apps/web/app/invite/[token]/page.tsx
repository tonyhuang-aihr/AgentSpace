import { redirect } from "next/navigation";
import { AuthScreen } from "@/features/auth/auth-screen";
import { buildGoogleStartUrl, readPublicAppUrl } from "@/features/auth/public-app-url";
import { getCurrentUser, hasRegisteredUsersSync } from "@/features/auth/server-auth";
import { buildWorkspacePath } from "@/features/auth/workspace-paths";
import { isFeishuOAuthConfigured } from "@/features/auth/feishu-oauth";
import { acceptWorkspaceInvitationForUser, readWorkspaceInvitationDetailsSync } from "@/features/auth/workspace-invitations";
import { InvitationStatusScreen } from "@/features/auth/invitation-status-screen";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const invitation = readWorkspaceInvitationDetailsSync(token, { includeInactive: true });
  if (!invitation) {
    return <InvitationStatusScreen status="invalid" />;
  }

  const currentUser = await getCurrentUser();
  if (currentUser && invitation.status === "active") {
    try {
      const accepted = await acceptWorkspaceInvitationForUser({
        token,
        userId: currentUser.id,
        actorDisplayName: currentUser.displayName,
      });
      redirect(buildWorkspacePath(accepted.workspaceSlug, "/im"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return (
        <InvitationStatusScreen
          email={invitation.email}
          reasonCode={message}
          status="accept_failed"
          workspaceName={invitation.workspaceName}
        />
      );
    }
  }

  if (invitation.status !== "active") {
    return (
      <InvitationStatusScreen
        email={invitation.email}
        status={invitation.status}
        workspaceName={invitation.workspaceName}
      />
    );
  }

  return (
    <AuthScreen
      googleStartUrl={buildGoogleStartUrl(readPublicAppUrl(), token)}
      feishuStartUrl={isFeishuOAuthConfigured() ? `/api/auth/feishu/start?invitationToken=${encodeURIComponent(invitation.token)}` : undefined}
      hasUsers={hasRegisteredUsersSync()}
      initialError={typeof resolvedSearchParams.authError === "string" ? resolvedSearchParams.authError : undefined}
      invitation={{
        token,
        workspaceName: invitation.workspaceName,
        email: invitation.email,
        role: invitation.role,
      }}
    />
  );
}
