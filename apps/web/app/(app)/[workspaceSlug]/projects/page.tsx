import type { Metadata } from "next"

import { ProjectsList } from "@/features/projects"

export const metadata: Metadata = { title: "Projects" }

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          The work you're doing, and what's left to do.
        </p>
      </div>
      <ProjectsList />
    </div>
  )
}
