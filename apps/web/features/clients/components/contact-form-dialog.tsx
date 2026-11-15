"use client"

import type { ClientContact } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { ApiError, errorMessage } from "@/lib/api"

import { useSaveContact } from "../api/mutations"

type Values = {
  name: string
  email: string
  phone: string
  title: string
  isPrimary: boolean
}

const toValues = (c?: ClientContact): Values => ({
  name: c?.name ?? "",
  email: c?.email ?? "",
  phone: c?.phone ?? "",
  title: c?.title ?? "",
  isPrimary: c?.isPrimary ?? false,
})

export function ContactFormDialog({
  clientId,
  contact,
  open,
  onOpenChange,
}: {
  clientId: string
  contact?: ClientContact
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const save = useSaveContact(clientId)
  const form = useForm<Values>({ defaultValues: toValues(contact) })
  const { register, handleSubmit, reset, setError, formState } = form

  React.useEffect(() => {
    if (open) reset(toValues(contact))
  }, [open, contact, reset])

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, contactId: contact?.id })
      toast.success(contact ? "Contact updated" : "Contact added")
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        for (const [path, message] of Object.entries(e.fieldErrors)) {
          setError(path as keyof Values, { message })
        }
      }
      toast.error(errorMessage(e))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>
        <form id="contact-form" onSubmit={onSubmit} className="grid gap-4">
          <Field
            label="Name"
            htmlFor="contact-name"
            error={formState.errors.name?.message}
          >
            <Input
              id="contact-name"
              autoFocus
              {...register("name", { required: "Required" })}
            />
          </Field>
          <Field label="Job title" htmlFor="contact-title">
            <Input id="contact-title" {...register("title")} />
          </Field>
          <Field
            label="Email"
            htmlFor="contact-email"
            error={formState.errors.email?.message}
          >
            <Input id="contact-email" type="email" {...register("email")} />
          </Field>
          <Field label="Phone" htmlFor="contact-phone">
            <Input id="contact-phone" {...register("phone")} />
          </Field>
          <Controller
            control={form.control}
            name="isPrimary"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(Boolean(c))}
                />
                Primary contact (receives documents by default)
              </Label>
            )}
          />
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="contact-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
