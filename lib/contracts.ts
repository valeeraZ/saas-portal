/** Auth-owned direct user identity; no platform data tenancy. */
export type CurrentUser = {
  user: {
    id: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    status: string;
  };
};
