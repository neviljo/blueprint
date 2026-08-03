import { redirect } from "@tanstack/react-router";
import { authApi, type UserSession } from "./api";

let cachedSession: UserSession | null | undefined;

export async function getCurrentSession(force = false): Promise<UserSession> {
  if (force || cachedSession === undefined) {
    const session = await authApi.getSession();
    cachedSession = session ?? { user: null, session: null };
  }
  return cachedSession!;
}

export function clearSessionCache() {
  cachedSession = undefined;
}

export async function requireAuth() {
  const session = await getCurrentSession();
  if (!session.user) {
    throw redirect({ to: "/" });
  }
  return session;
}
