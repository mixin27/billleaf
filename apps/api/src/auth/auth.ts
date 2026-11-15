import {
  resetPasswordEmail,
  verifyEmail,
  type EmailMessage,
} from "@workspace/emails"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import type { Env } from "../core/config/env.js"
import { AUTH_ADVANCED_DATABASE, buildAuthPlugins } from "./auth.plugins.js"

export interface AuthDeps {
  env: Env
  db: Database
  sendEmail: (message: EmailMessage) => Promise<void>
  onWorkspaceCreated: (
    workspaceId: string,
    ownerMemberId: string
  ) => Promise<void>
  onMemberAdded: (
    workspaceId: string,
    memberId: string,
    role: string
  ) => Promise<void>
}

/**
 * Better Auth instance. Billleaf terminology: organization == workspace.
 *
 * Better Auth owns identity (users, sessions, accounts, 2FA, invitations).
 * Authorization inside a workspace is Billleaf's own dynamic RBAC
 * (see src/iam) — Better Auth's `member.role` is only used as the initial
 * role slug when someone joins.
 */
export function createAuth({
  env,
  db,
  sendEmail,
  onWorkspaceCreated,
  onMemberAdded,
}: AuthDeps) {
  const trustedOrigins = [env.WEB_URL, ...env.TRUSTED_ORIGINS]

  return betterAuth({
    appName: "Billleaf",
    baseURL: env.API_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    advanced: {
      database: AUTH_ADVANCED_DATABASE,
      cookiePrefix: "billleaf",
      ...(env.COOKIE_DOMAIN
        ? {
            crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
          }
        : {}),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url }) =>
        sendEmail(resetPasswordEmail({ to: user.email, name: user.name, url })),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        sendEmail(verifyEmail({ to: user.email, name: user.name, url })),
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: env.NODE_ENV === "production", storage: "memory" },
    // Role changes go through Billleaf RBAC (PUT /v1/members/:id/roles).
    disabledPaths: ["/organization/update-member-role"],
    plugins: buildAuthPlugins({
      webUrl: env.WEB_URL,
      sendEmail,
      onWorkspaceCreated,
      onMemberAdded,
    }),
  })
}

export type Auth = ReturnType<typeof createAuth>
