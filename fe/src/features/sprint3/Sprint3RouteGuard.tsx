import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

type Props = { allowedRole: 'HR_MANAGER' | 'HIRING_MANAGER' | 'RECRUITER' | 'APPROVER'; children: ReactNode };
export default function Sprint3RouteGuard({ allowedRole, children }: Props) {
  let roles: string[] = [];
  let authenticated = false;
  try {
    const stored = sessionStorage.getItem('atsUser');
    const user = stored ? JSON.parse(stored) as { id?: string; roles?: string[] } : null;
    authenticated = Boolean(sessionStorage.getItem('accessToken') && user?.id);
    roles = Array.isArray(user?.roles) ? user.roles : [];
  } catch { /* invalid browser session */ }
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!roles.includes(allowedRole)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
