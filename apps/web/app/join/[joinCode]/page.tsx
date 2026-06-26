import { redirect } from "next/navigation";
import { AuthScreen } from "@/features/auth/auth-screen";
import { buildGoogleStartUrl, readPublicAppUrl } from "@/features/auth/public-app-url";
import { getCurrentUser, hasRegisteredUsersSync } from "@/features/auth/server-auth";
import { joinWorkspaceByCodeForUser } from "@/features/auth/workspace-join-codes";
import { isFeishuOAuthConfigured } from "@/features/auth/feishu-oauth";

export const dynamic = "force-dynamic";

export default async function WorkspaceJoinCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ joinCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { joinCode } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const authError = typeof resolvedSearchParams.authError === "string" ? resolvedSearchParams.authError : undefined;
  const currentUser = await getCurrentUser();

  if (currentUser) {
    let redirectPath: string;
    try {
      const joined = await joinWorkspaceByCodeForUser({
        joinCode,
        userId: currentUser.id,
        actorDisplayName: currentUser.displayName,
      });
      redirectPath = joined.redirectPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : "workspace.join_code.invalid";
      redirect(`/?joinCode=${encodeURIComponent(joinCode)}&authError=${encodeURIComponent(message)}`);
    }
    redirect(redirectPath);
  }

  return (
    <AuthScreen
      googleStartUrl={buildGoogleStartUrl(readPublicAppUrl(), undefined, joinCode)}
      feishuStartUrl={isFeishuOAuthConfigured() ? `/api/auth/feishu/start` : undefined}
      hasUsers={hasRegisteredUsersSync()}
      initialError={authError}
      initialWorkspaceJoinCode={joinCode}
    />
  );
}
