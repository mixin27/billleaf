import type { Metadata } from "next"

import { ProjectsList } from "@/features/projects"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Projects" }

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="The work you're doing, and what's left to do."
      />
      <ProjectsList />
    </div>
  )
}
