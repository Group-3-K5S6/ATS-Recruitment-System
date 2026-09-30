export const SESSION_EXPIRED_KEY = "sessionExpired";
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "atsUser";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

// ADDED: store the real backend tokens and identity so routes use the login response,
// instead of the former hard-coded Admin demo account.
export function saveSession(accessToken: string, refreshToken: string, user: SessionUser) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSession() {
  const rawUser = sessionStorage.getItem(USER_KEY);
  if (!rawUser || !sessionStorage.getItem(ACCESS_TOKEN_KEY)) return null;
  try {
    return {
      accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY)!,
      refreshToken: sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? "",
      user: JSON.parse(rawUser) as SessionUser,
    };
  } catch {
    clearLocalSession();
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
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}
