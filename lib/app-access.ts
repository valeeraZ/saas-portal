import { auth } from "./http.ts";
import type { Session } from "./store.ts";
export type AppRole = {
  key: string;
  name: string;
  description: string;
  active: boolean;
};
export type OwnRequest = {
  id: string;
  roles: string[];
  reason: string;
  status: "pending" | "approved" | "rejected";
  comment: string | null;
  reviewer: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
export type AppAccess = {
  roles: AppRole[];
  granted: string[];
  requests: OwnRequest[];
};
export async function loadAppAccess(
  s: Session,
  appId: string,
): Promise<AppAccess> {
  const [roles, permissions, requests] = await Promise.all([
    auth<{ appId: string; roles: AppRole[] }>(`/v1/apps/${appId}/roles`, s),
    auth<{ appId: string; roles: string[]; allowed: boolean }>(
      `/v1/apps/${appId}/permissions`,
      s,
    ),
    auth<{ items: OwnRequest[] }>(`/v1/apps/${appId}/requests`, s),
  ]);
  if (roles.appId !== appId || permissions.appId !== appId)
    throw Error("Invalid access context");
  return {
    roles: roles.roles,
    granted: permissions.allowed ? permissions.roles : [],
    requests: requests.items,
  };
}
