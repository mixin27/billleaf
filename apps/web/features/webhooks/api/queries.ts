"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryStatus,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

export const webhookKeys = {
  all: (ws: string | undefined) => ["webhooks", ws] as const,
  list: (ws: string | undefined) => ["webhooks", ws, "list"] as const,
  deliveries: (
    ws: string | undefined,
    id: string,
    page: number,
    status?: WebhookDeliveryStatus
  ) => ["webhooks", ws, "deliveries", id, page, status ?? "all"] as const,
}

export function useWebhooks() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: webhookKeys.list(ws),
    queryFn: () => unwrap(api.GET("/v1/webhooks")),
    enabled: Boolean(ws),
  })
}

export function useWebhookDeliveries(
  id: string,
  page: number,
  status?: WebhookDeliveryStatus
) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: webhookKeys.deliveries(ws, id, page, status),
    queryFn: () =>
      unwrap(
        api.GET("/v1/webhooks/{id}/deliveries", {
          params: {
            path: { id },
            query: { page, pageSize: 20, ...(status ? { status } : {}) },
          },
        })
      ),
    enabled: Boolean(ws),
    // Pending deliveries settle within seconds; keep the log fresh.
    refetchInterval: (q) =>
      q.state.data?.items.some((d) => d.status === "pending") ? 3_000 : false,
    refetchIntervalInBackground: true,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: webhookKeys.all(ws) })
}

export function useCreateWebhook() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateWebhookEndpointInput) =>
      unwrap(api.POST("/v1/webhooks", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateWebhook() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: UpdateWebhookEndpointInput & { id: string }) =>
      unwrap(
        api.PATCH("/v1/webhooks/{id}", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteWebhook() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/webhooks/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useRotateWebhookSecret() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/webhooks/{id}/rotate-secret", {
          params: { path: { id } },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useTestWebhook() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/v1/webhooks/{id}/test", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useResendDelivery() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/webhook-deliveries/{id}/resend", {
          params: { path: { id } },
        })
      ),
    onSuccess: invalidate,
  })
}
