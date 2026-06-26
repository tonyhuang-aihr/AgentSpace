import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  createAuthIdentitySync,
  countUsersSync,
  createPasswordAuthIdentitySync,
  createSessionSync,
  createUserSync,
  deleteSessionByTokenHashSync,
  listUserWorkspacesSync,
  readAuthIdentityByProviderSubjectSync,
  readPasswordAuthIdentityByEmailSync,
  readSessionByTokenHashSync,
  readUserByEmailSync,
  readUserSync,
  readWorkspaceSync,
  type StoredSessionRecord,
  touchSessionLastSeenSync,
  updateUserSync,
  type StoredUserRecord,
} from "@agent-space/db";
import { tryRecordWorkspaceAuditEventSync } from "@agent-space/services";
import { acceptWorkspaceInvitationForUser } from "./workspace-invitations";
import { createOwnedWorkspaceForUserSync } from "./user-workspaces";
import {
  clearPendingGoogleLinkHandoff,
  readPendingGoogleLinkHandoff,
  writePendingGoogleLinkHandoff,
} from "./google-link-handoff";
import {
  clearPendingGoogleRegistrationHandoff,
  readPendingGoogleRegistrationHandoff,
  writePendingGoogleRegistrationHandoff,
} from "./google-registration-handoff";
import { buildWorkspacePath } from "./workspace-paths";
import { clearWorkspaceSelectionCookie, writeWorkspaceSelectionCookie } from "./workspace-selection";
import { joinWorkspaceByCodeForUser } from "./workspace-join-codes";

const AUTH_COOKIE_NAME = "agent_space_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthUser {
  id: string;
  organizationName: string;
  displayName: string;
  role: string;
  email: string;
}

export function hasRegisteredUsersSync(): boolean {
  return countUsersSync() > 0;
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getCurrentSession();
  if (!session) {
    return null;
  }

  const user = readUserSync(session.userId);
  return user ? toPublicUser(user) : null;
});

export const getCurrentSession = cache(async function getCurrentSession(): Promise<StoredSessionRecord | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return readSessionBySessionToken(token);
});

export async function createSessionForRegistration(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  if (readUserByEmailSync(input.email)) {
    throw new Error("auth.email_exists");
  }

  const user = createUserSync({
    displayName: input.displayName,
    primaryEmail: input.email,
  });
  createPasswordAuthIdentitySync({
    userId: user.id,
    email: input.email,
    passwordHash: hashPassword(input.email, input.password),
  });
  const ownedWorkspace = createOwnedWorkspaceForUserSync({
    userId: user.id,
    displayName: input.displayName,
  });
  tryRecordWorkspaceAuditEventSync({
    workspaceId: ownedWorkspace.workspace.id,
    title: "Workspace registered",
    note: `${input.displayName} created workspace "${ownedWorkspace.workspace.name}".`,
    code: "auth.registration_succeeded",
    data: {
      actorType: "session_user",
      resourceType: "workspace",
      resourceId: ownedWorkspace.workspace.id,
    },
  });
  await writeWorkspaceSelectionCookie(ownedWorkspace.workspace.slug);

  await setSessionCookieForUser(user.id);
  return toPublicUser(user);
}

export async function createSessionForLogin(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const passwordIdentity = readPasswordAuthIdentityByEmailSync(input.email);
  if (!passwordIdentity) {
    throw new Error("auth.account_not_found");
  }

  const providedHash = hashPassword(input.email, input.password);
  if (!constantTimeEqual(passwordIdentity.passwordHash, providedHash)) {
    tryRecordUserWorkspaceAuditEventSync(passwordIdentity.identity.userId, {
      title: "Login failed",
      note: `Password login failed for ${input.email.trim().toLowerCase()}.`,
      code: "auth.login_failed",
    });
    throw new Error("auth.invalid_password");
  }

  const user = readUserSync(passwordIdentity.identity.userId);
  if (!user) {
    throw new Error("auth.account_not_found");
  }

  await setSessionCookieForUser(user.id);
  tryRecordUserWorkspaceAuditEventSync(user.id, {
    title: "Login succeeded",
    note: `${user.displayName} signed in with password login.`,
    code: "auth.login_succeeded",
  });
  return toPublicUser(user);
}

export async function createSessionForGoogleLogin(input: {
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  invitationToken?: string;
  joinCode?: string;
}): Promise<AuthUser> {
  await clearPendingGoogleRegistrationHandoff();
  await clearPendingGoogleLinkHandoff();
  if (!input.emailVerified) {
    throw new Error("auth.google_email_not_verified");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("auth.google_profile_missing_email");
  }

  const existingIdentity = readAuthIdentityByProviderSubjectSync("google", input.providerSubject);
  const user = existingIdentity ? readUserSync(existingIdentity.userId) : null;

  if (!user) {
    const existingUser = readUserByEmailSync(normalizedEmail);
    if (existingUser) {
      await writePendingGoogleLinkHandoff({
        providerSubject: input.providerSubject,
        email: normalizedEmail,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        invitationToken: input.invitationToken,
        joinCode: input.joinCode,
      });
      throw new Error("auth.google_account_link_required");
    } else {
      await writePendingGoogleRegistrationHandoff({
        providerSubject: input.providerSubject,
        email: normalizedEmail,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        invitationToken: input.invitationToken,
        joinCode: input.joinCode,
      });
      throw new Error("auth.google_profile_setup_required");
    }
  }

  const updatedUser = updateUserSync({
    userId: user.id,
    primaryEmail: normalizedEmail,
    avatarUrl: input.avatarUrl,
  }) ?? user;

  await setSessionCookieForUser(updatedUser.id);
  tryRecordUserWorkspaceAuditEventSync(updatedUser.id, {
    title: "Google login succeeded",
    note: `${updatedUser.displayName} signed in with Google.`,
    code: "auth.google_login_succeeded",
  });
  return toPublicUser(updatedUser);
}



export async function createSessionForFeishuLogin(input: {
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  invitationToken?: string;
  joinCode?: string;
}): Promise<AuthUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("auth.feishu_profile_missing_email");
  }

  const existingIdentity = readAuthIdentityByProviderSubjectSync("feishu", input.providerSubject);
  const user = existingIdentity ? readUserSync(existingIdentity.userId) : null;

  if (!user) {
    // New user - auto-register (Feishu users are corporate, so we trust them)
    const newUser = createUserSync({
      displayName: input.displayName,
      primaryEmail: normalizedEmail,
      avatarUrl: input.avatarUrl,
    });
    createAuthIdentitySync({
      userId: newUser.id,
      provider: "feishu",
      providerSubject: input.providerSubject,
      email: normalizedEmail,
      emailVerified: input.emailVerified,
      profileJson: JSON.stringify({ avatarUrl: input.avatarUrl ?? null }),
    });
    const ownedWorkspace = createOwnedWorkspaceForUserSync({
      userId: newUser.id,
      displayName: input.displayName,
    });
    tryRecordWorkspaceAuditEventSync({
      workspaceId: ownedWorkspace.workspace.id,
      title: "Workspace registered",
      note: `${input.displayName} created workspace via Feishu login.`,
      code: "auth.feishu_registration_succeeded",
      data: {
        actorType: "session_user",
        resourceType: "workspace",
        resourceId: ownedWorkspace.workspace.id,
      },
    });
    await writeWorkspaceSelectionCookie(ownedWorkspace.workspace.slug);

    // Handle invitation/join code
    if (input.invitationToken) {
      await acceptWorkspaceInvitationForUser({
        token: input.invitationToken,
        userId: newUser.id,
        actorDisplayName: newUser.displayName,
      });
    }
    if (input.joinCode) {
      await joinWorkspaceByCodeForUser({
        joinCode: input.joinCode,
        userId: newUser.id,
        actorDisplayName: newUser.displayName,
      });
    }

    await setSessionCookieForUser(newUser.id);
    return toPublicUser(newUser);
  }

  // Existing user - update and login
  const updatedUser = updateUserSync({
    userId: user.id,
    primaryEmail: normalizedEmail,
    avatarUrl: input.avatarUrl,
  }) ?? user;

  await setSessionCookieForUser(updatedUser.id);
  tryRecordUserWorkspaceAuditEventSync(updatedUser.id, {
    title: "Feishu login succeeded",
    note: `${updatedUser.displayName} signed in with Feishu.`,
    code: "auth.feishu_login_succeeded",
  });
  return toPublicUser(updatedUser);
}

export async function completePendingGoogleRegistration(input: {
  displayName: string;
  workspaceName: string;
}): Promise<{ user: AuthUser; redirectPath: string }> {
  const handoff = await readPendingGoogleRegistrationHandoff();
  if (!handoff) {
    throw new Error("auth.google_profile_setup_expired");
  }

  const normalizedDisplayName = input.displayName.trim();
  const normalizedWorkspaceName = input.workspaceName.trim();
  if (!normalizedDisplayName) {
    throw new Error("Missing form value \"displayName\".");
  }
  if (!normalizedWorkspaceName) {
    throw new Error("Missing form value \"workspaceName\".");
  }

  const existingIdentity = readAuthIdentityByProviderSubjectSync("google", handoff.providerSubject);
  let user = existingIdentity ? readUserSync(existingIdentity.userId) : null;
  let redirectPath = "/";

  if (!user) {
    const existingUser = readUserByEmailSync(handoff.email);
    if (existingUser) {
      await clearPendingGoogleRegistrationHandoff();
      await writePendingGoogleLinkHandoff({
        providerSubject: handoff.providerSubject,
        email: handoff.email,
        displayName: handoff.displayName,
        avatarUrl: handoff.avatarUrl,
        invitationToken: handoff.invitationToken,
        joinCode: handoff.joinCode,
      });
      throw new Error("auth.google_account_link_required");
    }

    user = createUserSync({
      displayName: normalizedDisplayName,
      primaryEmail: handoff.email,
      avatarUrl: handoff.avatarUrl,
    });
    createAuthIdentitySync({
      userId: user.id,
      provider: "google",
      providerSubject: handoff.providerSubject,
      email: handoff.email,
      emailVerified: true,
      profileJson: JSON.stringify({ avatarUrl: handoff.avatarUrl ?? null }),
    });
    const ownedWorkspace = createOwnedWorkspaceForUserSync({
      userId: user.id,
      displayName: normalizedDisplayName,
      workspaceName: normalizedWorkspaceName,
    });
    tryRecordWorkspaceAuditEventSync({
      workspaceId: ownedWorkspace.workspace.id,
      title: "Workspace registered",
      note: `${normalizedDisplayName} created workspace "${ownedWorkspace.workspace.name}" via Google login.`,
      code: "auth.google_registration_succeeded",
      data: {
        actorType: "session_user",
        resourceType: "workspace",
        resourceId: ownedWorkspace.workspace.id,
      },
    });
    await writeWorkspaceSelectionCookie(ownedWorkspace.workspace.slug);
    redirectPath = buildWorkspacePath(ownedWorkspace.workspace.slug, "/im");
  }

  const updatedUser = updateUserSync({
    userId: user.id,
    displayName: normalizedDisplayName,
    primaryEmail: handoff.email,
    avatarUrl: handoff.avatarUrl,
  }) ?? user;

  await setSessionCookieForUser(updatedUser.id);
  if (handoff.invitationToken) {
    const accepted = await acceptWorkspaceInvitationForUser({
      token: handoff.invitationToken,
      userId: updatedUser.id,
      actorDisplayName: updatedUser.displayName,
    });
    redirectPath = buildWorkspacePath(accepted.workspaceSlug, "/im");
  }
  if (handoff.joinCode) {
    const joined = await joinWorkspaceByCodeForUser({
      joinCode: handoff.joinCode,
      userId: updatedUser.id,
      actorDisplayName: updatedUser.displayName,
    });
    redirectPath = joined.redirectPath;
  }
  await clearPendingGoogleRegistrationHandoff();

  tryRecordUserWorkspaceAuditEventSync(updatedUser.id, {
    title: "Google login registration completed",
    note: `${updatedUser.displayName} completed Google account setup.`,
    code: "auth.google_registration_completed",
  });

  return {
    user: toPublicUser(updatedUser),
    redirectPath,
  };
}

export async function confirmGoogleAccountLink(input: {
  password: string;
}): Promise<{ user: AuthUser; redirectPath?: string }> {
  const handoff = await readPendingGoogleLinkHandoff();
  if (!handoff) {
    throw new Error("auth.google_link_expired");
  }

  const normalizedPassword = input.password.trim();
  if (!normalizedPassword) {
    throw new Error("Missing form value \"password\".");
  }

  const passwordIdentity = readPasswordAuthIdentityByEmailSync(handoff.email);
  if (!passwordIdentity) {
    throw new Error("auth.google_link_requires_password");
  }

  const providedHash = hashPassword(handoff.email, normalizedPassword);
  if (!constantTimeEqual(passwordIdentity.passwordHash, providedHash)) {
    throw new Error("auth.invalid_password");
  }

  const existingGoogleIdentity = readAuthIdentityByProviderSubjectSync("google", handoff.providerSubject);
  if (existingGoogleIdentity && existingGoogleIdentity.userId !== passwordIdentity.identity.userId) {
    throw new Error("auth.google_account_conflict");
  }

  if (!existingGoogleIdentity) {
    createAuthIdentitySync({
      userId: passwordIdentity.identity.userId,
      provider: "google",
      providerSubject: handoff.providerSubject,
      email: handoff.email,
      emailVerified: true,
      profileJson: JSON.stringify({ avatarUrl: handoff.avatarUrl ?? null }),
    });
  }

  const existingUser = readUserSync(passwordIdentity.identity.userId);
  if (!existingUser) {
    throw new Error("auth.account_not_found");
  }

  const updatedUser = updateUserSync({
    userId: existingUser.id,
    avatarUrl: handoff.avatarUrl ?? existingUser.avatarUrl,
  }) ?? existingUser;

  await setSessionCookieForUser(updatedUser.id);
  let redirectPath: string | undefined;
  if (handoff.invitationToken) {
    const accepted = await acceptWorkspaceInvitationForUser({
      token: handoff.invitationToken,
      userId: updatedUser.id,
      actorDisplayName: updatedUser.displayName,
    });
    redirectPath = buildWorkspacePath(accepted.workspaceSlug, "/im");
  }
  if (handoff.joinCode) {
    const joined = await joinWorkspaceByCodeForUser({
      joinCode: handoff.joinCode,
      userId: updatedUser.id,
      actorDisplayName: updatedUser.displayName,
    });
    redirectPath = joined.redirectPath;
  }
  tryRecordUserWorkspaceAuditEventSync(updatedUser.id, {
    title: "Google identity linked",
    note: `${updatedUser.displayName} confirmed linking a Google identity.`,
    code: "auth.google_link_confirmed",
  });
  await clearPendingGoogleLinkHandoff();

  return { user: toPublicUser(updatedUser), redirectPath };
}

export async function clearCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashSessionToken(token);
    const session = readSessionByTokenHashSync(tokenHash);
    if (session) {
      tryRecordUserWorkspaceAuditEventSync(session.userId, {
        title: "Logout",
        note: "Session was signed out.",
        code: "auth.logout",
      });
    }
    deleteSessionByTokenHashSync(tokenHash);
  }
  await clearWorkspaceSelectionCookie();

  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

function readSessionBySessionToken(token: string): StoredSessionRecord | null {
  const tokenHash = hashSessionToken(token);
  const session = readSessionByTokenHashSync(tokenHash);
  if (!session || session.revokedAt) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    deleteSessionByTokenHashSync(tokenHash);
    return null;
  }

  touchSessionLastSeenSync(tokenHash);
  return readSessionByTokenHashSync(tokenHash);
}

async function setSessionCookieForUser(userId: string): Promise<void> {
  const token = `sess-${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const headerStore = await headers();
  createSessionSync({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    ipAddress: extractIpAddress(headerStore.get("x-forwarded-for")),
    userAgent: headerStore.get("user-agent")?.trim() || undefined,
  });

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

function hashPassword(email: string, password: string): string {
  return scryptSync(password, email.toLowerCase(), 64).toString("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function toPublicUser(user: StoredUserRecord): AuthUser {
  const memberships = listUserWorkspacesSync(user.id);
  const membership = memberships[0];
  const workspace = membership ? readWorkspaceSync(membership.workspaceId) : null;

  return {
    id: user.id,
    organizationName: workspace?.name ?? "",
    displayName: user.displayName,
    role: membership?.role ?? "member",
    email: user.primaryEmail ?? "",
  };
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tryRecordUserWorkspaceAuditEventSync(
  userId: string,
  input: {
    title: string;
    note: string;
    code: string;
  },
): void {
  const membership = listUserWorkspacesSync(userId)[0];
  if (!membership) {
    return;
  }

  tryRecordWorkspaceAuditEventSync({
    workspaceId: membership.workspaceId,
    title: input.title,
    note: input.note,
    code: input.code,
    data: {
      actorType: "session_user",
      resourceType: "auth_session",
      userId,
    },
  });
}

function extractIpAddress(forwardedFor: string | null): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const firstHop = forwardedFor.split(",")[0]?.trim();
  return firstHop || undefined;
}
