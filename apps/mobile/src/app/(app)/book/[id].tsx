import { useLocalSearchParams } from "expo-router"

import { BookView } from "@/components/cashbook/book-view"

/** A cashbook on a phone (on a tablet it also opens beside the list). */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <BookView id={id} />
}
