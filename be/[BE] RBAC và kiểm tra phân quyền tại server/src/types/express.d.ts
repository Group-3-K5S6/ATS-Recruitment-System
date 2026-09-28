declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; fullName: string; departmentId: string | null; roles: string[]; permissions: string[] };
      token?: string;
    }
  }
}
export {};
