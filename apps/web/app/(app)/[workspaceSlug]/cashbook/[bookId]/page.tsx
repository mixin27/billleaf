import type { Metadata } from "next"

import { CashbookBook } from "@/features/cashbook"

export const metadata: Metadata = { title: "Cashbook" }

export default async function CashbookBookPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  return <CashbookBook bookId={bookId} />
}
