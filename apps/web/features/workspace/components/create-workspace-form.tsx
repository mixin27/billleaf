"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useCreateWorkspace } from "../api/mutations"

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
})
type Values = z.infer<typeof schema>

const toSlug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export function CreateWorkspaceForm() {
  const router = useRouter()
  const create = useCreateWorkspace()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const ws = await create.mutateAsync(values)
      router.push(`/${ws.slug}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input
          id="name"
          {...form.register("name", {
            onChange: (e) => {
              if (!form.formState.dirtyFields.slug) {
                form.setValue("slug", toSlug(e.target.value))
              }
            },
          })}
        />
        <FieldError message={form.formState.errors.name?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">URL</Label>
        <Input id="slug" {...form.register("slug")} />
        <FieldError message={form.formState.errors.slug?.message} />
      </div>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}
