import { isReservedWorkspaceSlug } from "@workspace/contracts"
import {
  invitationEmail,
  magicLinkEmail,
  type EmailMessage,
} from "@workspace/emails"
import {
  admin,
  magicLink,
  openAPI,
  organization,
  twoFactor,
} from "better-auth/plugins"
import { expo } from "@better-auth/expo"
import { APIError } from "better-auth/api"

export interface AuthPluginDeps {
  webUrl: string
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
  onInvitationAccepted: (
    workspaceId: string,
    memberId: string,
    invitationId: string
  ) => Promise<void>
}

/**
 * Better Auth plugins. Kept separate from `auth.ts` (no DB import) so
 * `scripts/generate-auth-schema.ts` can derive the Drizzle schema from the
 * exact same plugin set. Changing plugins ⇒ run `pnpm --filter api auth:generate`
 * then `pnpm db:generate`.
 */
export function buildAuthPlugins(deps: AuthPluginDeps) {
  return [
    organization({
      allowUserToCreateOrganization: true,
      sendInvitationEmail: async ({ email, organization: org, inviter, id }) =>
        deps.sendEmail(
          invitationEmail({
            to: email,
            workspaceName: org.name,
            inviterName: inviter.user.name,
            url: `${deps.webUrl}/accept-invitation/${id}`,
          })
        ),
      organizationHooks: {
        // billleaf.com/<slug> is the workspace: keep the app's own paths free.
        beforeCreateOrganization: async ({ organization: org }) => {
          if (org.slug && isReservedWorkspaceSlug(org.slug))
            throw new APIError("BAD_REQUEST", {
              message: "That URL is reserved. Pick another one.",
            })
        },
        beforeUpdateOrganization: async ({ organization: org }) => {
          if (org.slug && isReservedWorkspaceSlug(org.slug))
            throw new APIError("BAD_REQUEST", {
              message: "That URL is reserved. Pick another one.",
            })
        },
        afterCreateOrganization: async ({ organization: org, member }) => {
          await deps.onWorkspaceCreated(org.id, member.id)
        },
        afterAddMember: async ({ member, organization: org }) => {
          if (member.role !== "owner") {
            await deps.onMemberAdded(org.id, member.id, member.role)
          }
        },
        afterAcceptInvitation: async ({
          member,
          organization: org,
          invitation,
        }) => {
          await deps.onInvitationAccepted(org.id, member.id, invitation.id)
        },
      },
    }),
    twoFactor({ issuer: "Billleaf" }),
    magicLink({
      sendMagicLink: async ({ email, url }) =>
        deps.sendEmail(magicLinkEmail({ to: email, url })),
    }),
    // Platform admins (user.role = "admin"). Only impersonation is reachable
    // over HTTP; everything else goes through /v1/admin (2FA + audit).
    admin({ impersonationSessionDuration: 60 * 60 }),
    openAPI(),
    // The mobile app (apps/mobile) sends no Origin; the Expo client sends
    // `expo-origin: billleaf://` instead, which this maps to Origin so
    // Better Auth's CSRF/origin check can match a trusted origin. Browsers
    // can't set it cross-site (CORS doesn't allow the header).
    expo(),
  ]
}

export const AUTH_ADVANCED_DATABASE = { generateId: "uuid" } as const
