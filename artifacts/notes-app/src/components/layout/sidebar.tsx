import { useState } from "react";
import { Moon, Sun, Plus, Search, FileText, ChevronDown, ChevronRight, Trash2, ArchiveRestore } from "lucide-react";
import { Project } from "@/lib/store";
import { useTheme } from "@/hooks/use-theme";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

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

  const filteredProjects = projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

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
    <div className="w-72 border-r border-border bg-sidebar flex flex-col h-screen flex-shrink-0">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/50"
          >
            {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>

        <Button onClick={createProject} className="w-full justify-start gap-2 shadow-sm font-medium" size="lg">
          <Plus className="w-4 h-4" />
          New Project
        </Button>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/50 border-sidebar-border"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-1 pb-4">
          <AnimatePresence>
            {filteredProjects.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onClick={() => setActiveProject(p.id)}
                  className={`group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                    activeProjectId === p.id
                      ? "bg-primary/10 border-primary/20"
                      : "border-transparent hover:bg-muted/50"
                  }`}
                >
                  <FileText
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      activeProjectId === p.id ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-medium truncate text-sm ${
                        activeProjectId === p.id ? "text-primary" : "text-sidebar-foreground"
                      }`}
                    >
                      {p.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {formatDistanceToNow(p.updatedAt, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {filteredProjects.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">No projects found.</div>
          )}
        </div>
      </ScrollArea>

      <div className="mt-auto border-t border-border bg-sidebar/50 p-2">
        <Collapsible
          open={isTrashOpen}
          onOpenChange={setIsTrashOpen}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="rounded-lg bg-background/30 border border-border"
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              <span>Trash</span>
              {trash.length > 0 && (
                <span className="bg-muted px-1.5 py-0.5 rounded text-xs leading-none">
                  {trash.length}
                </span>
              )}
            </div>
            {isTrashOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            {trash.length === 0 ? (
              <div className="text-xs text-center py-4 text-muted-foreground border border-dashed border-border rounded-md bg-muted/20">
                Drag projects here
              </div>
            ) : (
              <div className="flex flex-col gap-1 mt-1 max-h-40 overflow-y-auto pr-1">
                {trash.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 p-2 rounded border border-transparent hover:border-border hover:bg-background/50 group"
                  >
                    <span className="text-xs truncate text-muted-foreground flex-1" title={p.title}>
                      {p.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => restoreFromTrash(p.id)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors"
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
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
