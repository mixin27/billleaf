"use client"

import {
  type ContractTemplate,
  SAMPLE_CONTRACT_TEMPLATE,
} from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import {
  useDeleteContractTemplate,
  useSaveContractTemplate,
} from "../api/mutations"
import { useContractTemplate } from "../api/queries"
import { ContractBodyField } from "./contract-body-field"

type Values = { name: string; body: string }

export function ContractTemplateEdit({ id }: { id: string }) {
  const template = useContractTemplate(id)
  if (template.isPending) return <Skeleton className="h-96 w-full" />
  if (template.error)
    return <p className="text-sm text-destructive">{template.error.message}</p>
  return <ContractTemplateEditor template={template.data} />
}

export function ContractTemplateEditor({
  template,
}: {
  template?: ContractTemplate
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { can } = usePermissions()
  const save = useSaveContractTemplate(template?.id)
  const remove = useDeleteContractTemplate(template?.id ?? "")
  const [confirm, setConfirm] = React.useState(false)
  const readOnly = !can("contract.update")
  const back = `/${slug}/contracts/templates`

  const { register, control, handleSubmit, formState, setValue } =
    useForm<Values>({
      defaultValues: { name: template?.name ?? "", body: template?.body ?? "" },
    })

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
      toast.success(template ? "Template saved" : "Template created")
      router.push(back)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Name"
          htmlFor="name"
          error={formState.errors.name?.message}
          className="min-w-64 flex-1"
        >
          <Input
            id="name"
            disabled={readOnly}
            {...register("name", { required: "Name the template" })}
          />
        </Field>
        {template || readOnly ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setValue("name", SAMPLE_CONTRACT_TEMPLATE.name)
              setValue("body", SAMPLE_CONTRACT_TEMPLATE.body)
            }}
          >
            Use the sample
          </Button>
        )}
      </div>
      <Field label="Text" htmlFor="body">
        <Controller
          control={control}
          name="body"
          rules={{
            validate: (v) => v.trim().length > 0 || "Write the template text",
          }}
          render={({ field }) => (
            <ContractBodyField
              id="body"
              value={field.value}
              onChange={field.onChange}
              error={formState.errors.body?.message}
            />
          )}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Changing a template never changes contracts already created from it. The
        sample is a starting point, not legal advice.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          {template && !readOnly ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm(true)}
            >
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(back)}
          >
            {readOnly ? "Back" : "Cancel"}
          </Button>
          {readOnly ? null : (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Contracts created from it keep their text.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Template deleted")
                    router.push(back)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
