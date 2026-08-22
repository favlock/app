import type { ColorConstant } from '../constants/colors'

export interface Tag {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Bookmark {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
  is_favorite?: boolean | null
  favorited_at?: string | null
  folders?: Folder[]
  tags?: Tag[]
}

export interface Folder {
  id: string
  user_id: string
  name: string
  color: ColorConstant | null
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface BookmarkFolder {
  bookmark_id: string
  folder_id: string
}

export interface ListItem {
  bookmark: Bookmark
  position: number
  completed_at: string | null
  created_at: string
}

export interface BookmarkList {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
  items: ListItem[]
}

export type EntryKind = "note" | "todo" | "read";

export interface EntryBase {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  folder?: Folder | null
  tags?: Tag[]
}

export interface Note extends EntryBase {
  kind: "note"
}

export interface Todo extends EntryBase {
  kind: "todo"
  is_completed: boolean
  completed_at: string | null
  due_date?: string | null
}

export interface ReadspaceEntry extends EntryBase {
  kind: "read"
}

export type Entry = Note | Todo | ReadspaceEntry
