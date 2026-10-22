export const SESSION_EXPIRED_KEY = "sessionExpired";

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
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}