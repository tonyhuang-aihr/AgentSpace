import { NextResponse } from "next/server";
import { createFeishuAuthorizationUrl } from "@/features/auth/feishu-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const invitationToken = searchParams.get("invitationToken")?.trim() || undefined;
  const joinCode = searchParams.get("joinCode")?.trim() || undefined;
  const authorizationUrl = await createFeishuAuthorizationUrl({ invitationToken, joinCode });
  return NextResponse.redirect(authorizationUrl);
}
