import type { Metadata } from "next"

import { CreditNotesList } from "@/features/credit-notes"

export const metadata: Metadata = { title: "Credit notes" }

export default function CreditNotesPage() {
  return <CreditNotesList />
}
