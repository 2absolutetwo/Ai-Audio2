import { Editor } from "@/components/editor/note-editor";

export default function Home() {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <main className="flex-1 h-screen overflow-y-auto relative bg-dot-pattern">
        <Editor />
      </main>
    </div>
  );
}
