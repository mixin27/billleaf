"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

/**
 * Client-portal data. Requests carry the `billleaf_portal` cookie (the
 * typed client sends credentials); a 401 means "show the sign-in form".
 */
export const portalKeys = {
  all: (slug: string) => ["portal", slug] as const,
  workspace: (slug: string) => ["portal", slug, "workspace"] as const,
  me: (slug: string) => ["portal", slug, "me"] as const,
  list: (slug: string, kind: string) => ["portal", slug, "list", kind] as const,
  doc: (slug: string, kind: string, id: string) =>
    ["portal", slug, "doc", kind, id] as const,
}

const path = { params: (slug: string) => ({ path: { slug } }) }

export function usePortalWorkspace(slug: string) {
  return useQuery({
    queryKey: portalKeys.workspace(slug),
    queryFn: () =>
      unwrap(api.GET("/v1/portal/{slug}", { params: path.params(slug) })),
    staleTime: 5 * 60_000,
  })
}

export function usePortalMe(slug: string) {
  return useQuery({
    queryKey: portalKeys.me(slug),
    queryFn: () =>
      unwrap(api.GET("/v1/portal/{slug}/me", { params: path.params(slug) })),
    retry: false,
  })
}

export const isSignedOut = (e: unknown) =>
  e instanceof ApiError && e.status === 401

export function usePortalQuotes(slug: string) {
  return useQuery({
    queryKey: portalKeys.list(slug, "quotes"),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/portal/{slug}/quotes", { params: path.params(slug) })
        )
      ).items,
  })
}

export function usePortalInvoices(slug: string) {
  return useQuery({
    queryKey: portalKeys.list(slug, "invoices"),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/portal/{slug}/invoices", { params: path.params(slug) })
        )
      ).items,
  })
}

export function usePortalContracts(slug: string) {
  return useQuery({
    queryKey: portalKeys.list(slug, "contracts"),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/portal/{slug}/contracts", { params: path.params(slug) })
        )
      ).items,
  })
}

export function usePortalReceipts(slug: string) {
  return useQuery({
    queryKey: portalKeys.list(slug, "receipts"),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/portal/{slug}/receipts", { params: path.params(slug) })
        )
      ).items,
  })
}

export function usePortalQuote(slug: string, id: string) {
  return useQuery({
    queryKey: portalKeys.doc(slug, "quote", id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/portal/{slug}/quotes/{id}", {
          params: { path: { slug, id } },
        })
      ),
  })
}

export function usePortalInvoice(slug: string, id: string) {
  return useQuery({
    queryKey: portalKeys.doc(slug, "invoice", id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/portal/{slug}/invoices/{id}", {
          params: { path: { slug, id } },
        })
      ),
  })
}

export function usePortalContract(slug: string, id: string) {
  return useQuery({
    queryKey: portalKeys.doc(slug, "contract", id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/portal/{slug}/contracts/{id}", {
          params: { path: { slug, id } },
        })
      ),
  })
}

/** Direct PDF URL (opened in a new tab; the cookie goes along). */
export function portalPdfUrl(
  slug: string,
  kind: "quotes" | "invoices" | "contracts" | "receipts",
  id: string
) {
  return `${env.NEXT_PUBLIC_API_URL}/v1/portal/${encodeURIComponent(slug)}/${kind}/${id}/pdf`
}

export function useRequestSignIn(slug: string) {
  return useMutation({
    mutationFn: (email: string) =>
      unwrap(
        api.POST("/v1/portal/{slug}/sign-in", {
          params: path.params(slug),
          body: { email },
        })
      ),
  })
}

export function useCreatePortalSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST("/v1/portal/session", { body: { token } })),
    onSuccess: (s) =>
      qc.invalidateQueries({ queryKey: portalKeys.all(s.workspaceSlug) }),
  })
}

export function usePortalSignOut(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/portal/sign-out")),
    onSuccess: () => qc.removeQueries({ queryKey: portalKeys.all(slug) }),
  })
}
