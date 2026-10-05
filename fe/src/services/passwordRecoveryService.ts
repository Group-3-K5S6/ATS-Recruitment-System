export type PasswordRecoveryErrorCode = "invalid" | "expired" | "used" | "network";

export class PasswordRecoveryError extends Error {
  readonly code: PasswordRecoveryErrorCode;

  constructor(code: PasswordRecoveryErrorCode) {
    super(code);
    this.name = "PasswordRecoveryError";
    this.code = code;
  }
}

export interface PasswordRecoveryService {
  requestResetLink(email: string): Promise<void>;
  validateResetToken(token: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

const mockTokenLifetime = 30 * 60 * 1000;
const mockTokens = new Map<string, { expiresAt: number; used: boolean }>([
  ["demo-valid-token", { expiresAt: Date.now() + mockTokenLifetime, used: false }],
  ["demo-expired-token", { expiresAt: Date.now() - 1, used: false }],
  ["demo-used-token", { expiresAt: Date.now() + mockTokenLifetime, used: true }],
]);

const waitForMockResponse = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

const getUsableMockToken = (token: string) => {
  const mockToken = mockTokens.get(token);
  if (!mockToken) {
    throw new PasswordRecoveryError("invalid");
  }
  if (mockToken.expiresAt <= Date.now()) {
    throw new PasswordRecoveryError("expired");
  }
  if (mockToken.used) {
    throw new PasswordRecoveryError("used");
  }

  return mockToken;
};

const mockPasswordRecoveryService: PasswordRecoveryService = {
  async requestResetLink() {
    await waitForMockResponse();
  },

  async validateResetToken(token) {
    await waitForMockResponse();
    getUsableMockToken(token);
  },

  async resetPassword(token) {
    await waitForMockResponse();
    const mockToken = getUsableMockToken(token);
    mockToken.used = true;
  },
};

export const passwordRecoveryService: PasswordRecoveryService =
  mockPasswordRecoveryService;