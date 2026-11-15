"use client"

import {
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import { env } from "./env"

/** Better Auth client talking to the NestJS API (`/api/auth/*`). */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  basePath: "/api/auth",
  plugins: [organizationClient(), twoFactorClient(), magicLinkClient()],
})

export const { useSession, signIn, signUp, signOut } = authClient
