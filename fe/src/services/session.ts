export const SESSION_EXPIRED_KEY = "sessionExpired";
export const USER_SESSION_KEY = "userSession";

export type UserSession = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

export function saveLocalSession(
  accessToken: string,
  refreshToken: string,
  user: UserSession,
) {
  sessionStorage.setItem("accessToken", accessToken);
  sessionStorage.setItem("refreshToken", refreshToken);
  sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
}

export function getLocalSession(): UserSession | null {
  const value = sessionStorage.getItem(USER_SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as UserSession;
  } catch {
    return null;
  }
}

export function markSessionExpired() {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "true");
}

export function consumeSessionExpired() {
  const expired =
    sessionStorage.getItem(SESSION_EXPIRED_KEY) === "true";

  if (expired) {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  }

  return expired;
}

export function clearLocalSession() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem(USER_SESSION_KEY);
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}
