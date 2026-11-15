"use client"

import { Button } from "@workspace/ui/components/button"
import * as React from "react"

import { Can } from "@/components/permissions/can"

import { TagsDialog } from "./tags-dialog"

/** Page header actions on /time (tag management for time.manage). */
export function TimePageActions() {
  const [tags, setTags] = React.useState(false)
  return (
    <>
      <Can permission="time.manage">
        <Button variant="outline" onClick={() => setTags(true)}>
          Tags
        </Button>
        <TagsDialog open={tags} onOpenChange={setTags} />
      </Can>
    </>
  )
}
