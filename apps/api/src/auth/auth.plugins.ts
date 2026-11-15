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
        afterCreateOrganization: async ({ organization: org, member }) => {
          await deps.onWorkspaceCreated(org.id, member.id)
        },
        afterAddMember: async ({ member, organization: org }) => {
          if (member.role !== "owner") {
            await deps.onMemberAdded(org.id, member.id, member.role)
          }
        },
        afterAcceptInvitation: async ({ member, organization: org }) => {
          await deps.onMemberAdded(org.id, member.id, member.role)
        },
      },
    }),
    twoFactor({ issuer: "Billleaf" }),
    magicLink({
      sendMagicLink: async ({ email, url }) =>
        deps.sendEmail(magicLinkEmail({ to: email, url })),
    }),
    admin(),
    openAPI(),
  ]
}

export const AUTH_ADVANCED_DATABASE = { generateId: "uuid" } as const
