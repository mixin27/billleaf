import type { ContractStatus } from "@workspace/contracts"

/** How each state reads in a list or on the contract (same as the web). */
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Awaiting signature",
  signed: "Signed",
  declined: "Declined",
  void: "Void",
}

/** The colour role for a state: done, bad, or neither. */
export function contractTone(
  status: ContractStatus
): "good" | "bad" | "neutral" {
  if (status === "signed") return "good"
  if (status === "declined" || status === "void") return "bad"
  return "neutral"
}
