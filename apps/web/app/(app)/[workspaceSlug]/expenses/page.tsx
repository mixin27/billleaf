import type { Metadata } from "next"

import { ExpensesList } from "@/features/expenses"

export const metadata: Metadata = { title: "Expenses" }

export default function ExpensesPage() {
  return <ExpensesList />
}
