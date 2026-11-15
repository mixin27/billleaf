"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import Link from "next/link"

import { useBreadcrumbStore } from "./breadcrumb-store"
import { useNav } from "./use-nav"

/** Sidebar toggle + breadcrumbs: section → page title (when different). */
export function AppTopbar() {
  const { current } = useNav()
  const title = useBreadcrumbStore((s) => s.title)
  const leaf = title && title !== current?.title ? title : null

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {current ? (
            <BreadcrumbItem className="shrink-0">
              {leaf ? (
                <BreadcrumbLink render={<Link href={current.url} />}>
                  {current.title}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{current.title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          ) : null}
          {leaf ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{leaf}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
