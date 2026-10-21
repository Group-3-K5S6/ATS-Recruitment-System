import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

type Props = {
  children: ReactNode;
};

const INTERNAL_EMPLOYEE_ROLES = new Set([
  "RECRUITER",
  "HIRING_MANAGER",
  "INTERVIEWER",
  "HR_MANAGER",
  "APPROVER",
  "ADMIN",
]);

export default function InternalEmployeeRouteGuard({
  children,
}: Props) {
  let authenticated = false;
  let roles: string[] = [];

  try {
    const stored = sessionStorage.getItem("atsUser");

    const user = stored
      ? (JSON.parse(stored) as {
          id?: string;
          roles?: string[];
        })
      : null;

    authenticated = Boolean(
      sessionStorage.getItem("accessToken") &&
        user?.id,
    );

    roles = Array.isArray(user?.roles)
      ? user.roles
      : [];
  } catch {
    authenticated = false;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  const isInternalEmployee = roles.some((role) =>
    INTERNAL_EMPLOYEE_ROLES.has(role),
  );

  if (!isInternalEmployee) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}