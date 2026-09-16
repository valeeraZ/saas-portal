/** Auth-owned v1 response subset consumed by Portal; provider owns OpenAPI. */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleting";
};
export type Membership = {
  tenantId: string;
  userId: string;
  tenantRole: "owner" | "admin" | "member";
  status: string;
};
export type CurrentUser = {
  user: {
    id: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    status: string;
  };
  tenants: Tenant[];
  nextTenantsCursor: string | null;
};
export type TenantContext = {
  tenant: Tenant;
  membership: Membership;
  authorizationVersion: number;
};
