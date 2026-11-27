import { create } from "zustand"

import type { ContractFilter } from "@/features/contracts"
import type { QuoteFilter } from "@/features/quotes"
export type SalesPane = "invoices" | "quotes" | "contracts"
export type WorkPane = "clients" | "projects"

/**
 * Which half the Sales tab (invoices, quotes, contracts) shows, kept outside
 * the screen so it reopens where you left it and More can open a pane.
 */
export const useSalesPane = create<{
  pane: SalesPane
  quoteFilter: QuoteFilter
  contractFilter: ContractFilter
  setPane: (p: SalesPane) => void
  setQuoteFilter: (f: QuoteFilter) => void
  setContractFilter: (f: ContractFilter) => void
}>((set) => ({
  pane: "invoices",
  quoteFilter: "sent",
  contractFilter: "sent",
  setPane: (pane) => set({ pane }),
  setQuoteFilter: (quoteFilter) => set({ quoteFilter }),
  setContractFilter: (contractFilter) => set({ contractFilter }),
}))

/** Clients or projects on the Clients tab (as above). */
export const useWorkPane = create<{
  pane: WorkPane
  setPane: (p: WorkPane) => void
}>((set) => ({
  pane: "clients",
  setPane: (pane) => set({ pane }),
}))
