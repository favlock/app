import {
  BookmarkIcon,
  ChevronDown,
  ListTodo,
  PlusIcon,
  StickyNote,
} from "lucide-react";
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui/dropdown";

interface HomeAddMenuProps {
  onAddBookmark: () => void;
  onAddNote: () => void;
  onAddTodo: () => void;
}

export default function HomeAddMenu({
  onAddBookmark,
  onAddNote,
  onAddTodo,
}: HomeAddMenuProps) {
  return (
    <Dropdown>
      <DropdownButton
        color="emerald"
        className="min-h-11 items-center gap-2 whitespace-nowrap"
        aria-label="Add new"
      >
        <PlusIcon data-slot="icon" aria-hidden="true" />
        <span className="hidden sm:inline">Add new</span>
        <ChevronDown
          data-slot="icon"
          className="hidden sm:block"
          aria-hidden="true"
        />
      </DropdownButton>

      <DropdownMenu anchor="bottom end" className="min-w-56">
        <DropdownItem onClick={onAddBookmark}>
          <BookmarkIcon data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Bookmark</DropdownLabel>
          <DropdownDescription>Save a useful link</DropdownDescription>
        </DropdownItem>
        <DropdownItem onClick={onAddNote}>
          <StickyNote data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Document</DropdownLabel>
          <DropdownDescription>Capture a thought</DropdownDescription>
        </DropdownItem>
        <DropdownItem onClick={onAddTodo}>
          <ListTodo data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Task</DropdownLabel>
          <DropdownDescription>Add a next action</DropdownDescription>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
