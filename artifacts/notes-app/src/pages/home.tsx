import { useStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/sidebar";
import { Editor } from "@/components/editor/note-editor";
import { FileText } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const {
    projects,
    trash,
    activeProjectId,
    activeProject,
    createProject,
    updateProject,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    setActiveProject,
  } = useStore();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar
        projects={projects}
        trash={trash}
        activeProjectId={activeProjectId}
        createProject={createProject}
        setActiveProject={setActiveProject}
        moveToTrash={moveToTrash}
        restoreFromTrash={restoreFromTrash}
        deletePermanently={deletePermanently}
      />
      <main className="flex-1 h-screen overflow-y-auto relative bg-dot-pattern">
        {activeProject ? (
          <Editor
            key={activeProject.id}
            project={activeProject}
            updateProject={updateProject}
            closeProject={() => setActiveProject(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in duration-700">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="w-24 h-24 rounded-2xl bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/30"
            >
              <FileText className="w-12 h-12" />
            </motion.div>
            <h2 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Select a project</h2>
            <p className="text-muted-foreground max-w-sm">
              Choose a project from the sidebar or create a new one to start writing. Your work is always auto-saved locally.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
