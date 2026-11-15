import type { Metadata } from "next"

import { ProjectDetail } from "@/features/projects"

export const metadata: Metadata = { title: "Project" }

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ProjectDetail projectId={projectId} />
}
