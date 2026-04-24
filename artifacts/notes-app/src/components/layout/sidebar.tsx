import { useState } from "react";
import { Moon, Sun, Plus, Search, FileText, Trash2, ArchiveRestore, ChevronDown } from "lucide-react";
import { Project } from "@/lib/store";
import { useTheme } from "@/hooks/use-theme";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type SidebarProps = {
  projects: Project[];
  trash: Project[];
  activeProjectId: string | null;
  createProject: () => void;
  setActiveProject: (id: string | null) => void;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  deletePermanently: (id: string) => void;
};

export function Sidebar({
  projects,
  trash,
  activeProjectId,
  createProject,
  setActiveProject,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveToTrash(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="w-full border-b border-border bg-sidebar flex-shrink-0">
      {/* Top row: logo, new project, search, trash, theme */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 font-bold text-base text-sidebar-foreground shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
        </div>

        <Button
          onClick={createProject}
          className="shrink-0 gap-1.5 font-medium"
          size="sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Button>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-background/50 border-sidebar-border"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Trash dropdown */}
          <DropdownMenu open={isTrashOpen} onOpenChange={setIsTrashOpen}>
            <DropdownMenuTrigger asChild>
              <button
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Trash</span>
                {trash.length > 0 && (
                  <span className="bg-muted px-1.5 py-0.5 rounded text-xs leading-none">
                    {trash.length}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {trash.length === 0 ? (
                <div className="text-xs text-center py-4 text-muted-foreground">
                  Trash is empty. Drag projects here.
                </div>
              ) : (
                <>
                  {trash.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted group"
                    >
                      <span className="text-xs truncate text-muted-foreground flex-1" title={p.title}>
                        {p.title}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => restoreFromTrash(p.id)}
                          className="p-1 hover:bg-background rounded text-muted-foreground hover:text-primary transition-colors"
                          title="Restore"
                        >
                          <ArchiveRestore className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deletePermanently(p.id)}
                          className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs text-destructive focus:text-destructive"
                    onClick={() => trash.forEach((p) => deletePermanently(p.id))}
                  >
                    Empty trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/50"
          >
            {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Project tabs row */}
      <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto scrollbar-none">
        <AnimatePresence initial={false}>
          {filteredProjects.map((p) => (
            <motion.button
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.15 }}
              draggable
              onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, p.id)}
              onClick={() => setActiveProject(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap shrink-0 transition-colors border ${
                activeProjectId === p.id
                  ? "bg-primary/10 border-primary/20 text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="max-w-[140px] truncate">{p.title}</span>
            </motion.button>
          ))}
        </AnimatePresence>
        {filteredProjects.length === 0 && (
          <span className="text-xs text-muted-foreground px-2 py-1.5">No projects found.</span>
        )}
      </div>
    </div>
  );
}
