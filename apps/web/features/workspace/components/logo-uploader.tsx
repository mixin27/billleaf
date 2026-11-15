"use client"

import { useQueryClient } from "@tanstack/react-query"
import type { WorkspaceProfile } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import * as React from "react"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

import { workspaceKeys } from "../api/keys"
import { useWorkspaceStore } from "../stores/workspace-store"

const MAX_BYTES = 1024 * 1024

/** Upload/replace/remove the workspace logo (PNG or JPEG, ≤ 1 MB). */
export function LogoUploader({
  profile,
  disabled,
}: {
  profile: WorkspaceProfile
  disabled?: boolean
}) {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const done = (p: WorkspaceProfile, message: string) => {
    qc.setQueryData(workspaceKeys.profile(p.workspaceId), p)
    toast.success(message)
  }

  const upload = async (file: File) => {
    if (!["image/png", "image/jpeg"].includes(file.type))
      return toast.error("Upload a PNG or JPEG image")
    if (file.size > MAX_BYTES)
      return toast.error("Images must be 1 MB or smaller")
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      // openapi-fetch doesn't do multipart well; this is the one raw call.
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/workspace/logo`, {
        method: "PUT",
        body: form,
        credentials: "include",
        headers: workspaceId ? { "x-workspace-id": workspaceId } : {},
      })
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      done(body as WorkspaceProfile, "Logo updated")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      done(await unwrap(api.DELETE("/v1/workspace/logo")), "Logo removed")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {profile.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
          <img
            src={profile.logoUrl}
            alt={`${profile.name} logo`}
            className="max-h-14 max-w-36 object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">No logo</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Working…" : profile.logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {profile.logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={remove}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG or JPEG, up to 1 MB. Shown on quotes, invoices and receipts.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
    </div>
  )
}
