/**
 * Shared Sentry data-collection policy (Sentry v11 `dataCollection` option).
 * Billleaf handles client and financial data, so nothing from requests is
 * sent: no bodies, cookies, headers, query strings or auto user info.
 * Attach only ids (user/workspace) explicitly when needed.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
} as const
