import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Copy, Scissors, Undo, X, FileText, Clock, CheckCircle2, Play, Square, Loader2, Download } from "lucide-react";
import { Project } from "@/lib/store";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VoicePicker } from "./voice-picker";
import { FavoriteVoicesButton } from "./favorite-voices-button";

const VOICE_STORAGE_KEY = "tts-selected-voice";

type EditorProps = {
  project: Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  closeProject: () => void;
};

export function Editor({ project, updateProject, closeProject }: EditorProps) {
  const [content, setContent] = useState<string[]>(project.content.length > 0 ? project.content : [""]);
  const [history, setHistory] = useState<string[][]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isCutView, setIsCutView] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(VOICE_STORAGE_KEY);
    return stored && stored !== "null" ? stored : null;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedVoice) {
      localStorage.setItem(VOICE_STORAGE_KEY, selectedVoice);
    } else {
      localStorage.removeItem(VOICE_STORAGE_KEY);
    }
  }, [selectedVoice]);

  const stopPlayback = React.useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingIndex(null);
    setLoadingIndex(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const downloadLine = async (index: number, text: string) => {
    if (downloadingIndex !== null) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Nothing to download");
      return;
    }
    setDownloadingIndex(index);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          ...(selectedVoice ? { voice: selectedVoice } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safeTitle = (project.title || "note")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "note";
      const filename = `${safeTitle}-${String(index + 1).padStart(3, "0")}.mp3`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not download voice");
    } finally {
      setDownloadingIndex(null);
    }
  };

  const playLine = async (index: number, text: string) => {
    if (playingIndex === index || loadingIndex === index) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Nothing to read");
      return;
    }
    setLoadingIndex(index);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          ...(selectedVoice ? { voice: selectedVoice } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopPlayback();
      audio.onerror = () => {
        toast.error("Playback failed");
        stopPlayback();
      };
      await audio.play();
      setLoadingIndex(null);
      setPlayingIndex(index);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate voice");
      stopPlayback();
    }
  };

  // Sync incoming project content if it changes externally
  useEffect(() => {
    setContent(project.content.length > 0 ? project.content : [""]);
  }, [project.id]);

  // Debounced save
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (JSON.stringify(content) !== JSON.stringify(project.content)) {
        updateProject(project.id, { content });
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [content, project.id, project.content, updateProject]);

  const saveHistory = (newContent: string[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newContent]);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleLineChange = (index: number, text: string) => {
    const newContent = [...content];
    newContent[index] = text;
    setContent(newContent);
  };

  const handleLineBlur = () => {
    // Only save history on blur to avoid excessive history states
    saveHistory(content);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText) return;

    const lines = pastedText.split(/\r?\n/);
    const sentences: string[] = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      const parts = line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      sentences.push(...parts.map((s) => s.trim()).filter((s) => s));
    }

    if (sentences.length <= 1) return;

    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const cursorPos = input.selectionStart || 0;
    const currentText = content[index];
    const before = currentText.slice(0, cursorPos);
    const after = currentText.slice(input.selectionEnd || cursorPos);

    const newContent = [...content];
    const firstSentence = before + sentences[0];
    const lastSentence = sentences[sentences.length - 1] + after;
    const middle = sentences.slice(1, -1);

    newContent.splice(index, 1, firstSentence, ...middle, lastSentence);
    setContent(newContent);
    saveHistory(newContent);

    setTimeout(() => {
      const nextIndex = index + sentences.length - 1;
      const nextInput = containerRef.current?.querySelector(`input[data-index="${nextIndex}"]`) as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        const pos = sentences[sentences.length - 1].length;
        nextInput.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newContent = [...content];
      const currentText = newContent[index];
      const cursorPosition = (e.target as HTMLInputElement).selectionStart || 0;
      
      const beforeCursor = currentText.slice(0, cursorPosition);
      const afterCursor = currentText.slice(cursorPosition);
      
      newContent[index] = beforeCursor;
      newContent.splice(index + 1, 0, afterCursor);
      setContent(newContent);
      saveHistory(newContent);
      
      // Focus next input
      setTimeout(() => {
        const nextInput = containerRef.current?.querySelector(`input[data-index="${index + 1}"]`) as HTMLInputElement;
        if (nextInput) nextInput.focus();
      }, 0);
    } else if (e.key === "Backspace") {
      if (content[index] === "" && content.length > 1) {
        e.preventDefault();
        const newContent = [...content];
        newContent.splice(index, 1);
        setContent(newContent);
        saveHistory(newContent);
        
        // Focus previous input at the end
        setTimeout(() => {
          const prevInput = containerRef.current?.querySelector(`input[data-index="${index - 1}"]`) as HTMLInputElement;
          if (prevInput) {
            prevInput.focus();
            const len = prevInput.value.length;
            prevInput.setSelectionRange(len, len);
          }
        }, 0);
      } else if ((e.target as HTMLInputElement).selectionStart === 0 && index > 0) {
        e.preventDefault();
        const newContent = [...content];
        const currentText = newContent[index];
        const prevText = newContent[index - 1];
        
        newContent[index - 1] = prevText + currentText;
        newContent.splice(index, 1);
        setContent(newContent);
        saveHistory(newContent);
        
        setTimeout(() => {
          const prevInput = containerRef.current?.querySelector(`input[data-index="${index - 1}"]`) as HTMLInputElement;
          if (prevInput) {
            prevInput.focus();
            prevInput.setSelectionRange(prevText.length, prevText.length);
          }
        }, 0);
      }
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      const prevInput = containerRef.current?.querySelector(`input[data-index="${index - 1}"]`) as HTMLInputElement;
      if (prevInput) prevInput.focus();
    } else if (e.key === "ArrowDown" && index < content.length - 1) {
      e.preventDefault();
      const nextInput = containerRef.current?.querySelector(`input[data-index="${index + 1}"]`) as HTMLInputElement;
      if (nextInput) nextInput.focus();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content.join("\n"));
    toast.success("Copied to clipboard");
  };

  const handleCut = () => {
    stopPlayback();
    setIsCutView((prev) => {
      const next = !prev;
      toast.success(next ? "Split into sub-cards" : "Back to single card");
      return next;
    });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setContent(history[newIndex]);
    }
  };

  const totalLines = content.length;
  const totalChars = content.reduce((acc, line) => acc + line.length, 0);

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full p-8 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Card */}
      <div className="relative bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-6 flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mt-1">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              value={project.title}
              onChange={(e) => updateProject(project.id, { title: e.target.value })}
              className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground/60 focus:ring-0 mb-2 truncate"
              placeholder="Project Title"
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-medium">Auto-saved locally</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 self-start mt-1 flex items-center gap-2">
            <FavoriteVoicesButton
              selectedVoice={selectedVoice}
              onSelect={setSelectedVoice}
            />
            <VoicePicker
              selectedVoice={selectedVoice}
              onSelect={setSelectedVoice}
            />
          </div>
        </div>
      </div>

      {/* Editor Card */}
      <div className="relative bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-gradient-to-b from-muted/40 to-muted/10 backdrop-blur">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] tracking-wider rounded-md px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">ORIGINAL</Badge>
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider rounded-md px-2 py-0.5 border-border/60 bg-background/70 text-muted-foreground">{totalLines} lines</Badge>
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider rounded-md px-2 py-0.5 border-border/60 bg-background/70 text-muted-foreground">{totalChars} ptu</Badge>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" onClick={handleCopy} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" onClick={handleCut} title="Cut">
              <Scissors className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" onClick={handleUndo} disabled={historyIndex === 0} title="Undo">
              <Undo className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1.5" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={closeProject} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 relative" ref={containerRef}>
          {isCutView ? (
            <div className="flex flex-col gap-3">
              {content.map((line, index) => {
                const isLoading = loadingIndex === index;
                const isPlaying = playingIndex === index;
                const isDownloading = downloadingIndex === index;
                const disabled = !line.trim();
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-background border border-emerald-400/60 rounded-lg px-4 py-3 shadow-sm hover:border-emerald-500 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <div className="text-muted-foreground/60 font-mono text-sm select-none shrink-0">
                      {String(index + 1).padStart(3, "0")}.
                    </div>
                    <input
                      data-index={index}
                      value={line}
                      onChange={(e) => handleLineChange(index, e.target.value)}
                      onBlur={handleLineBlur}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-base"
                      placeholder={index === 0 && content.length === 1 ? "Start typing..." : ""}
                    />
                    <Button
                      type="button"
                      variant={isPlaying ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8 rounded-md shrink-0"
                      onClick={() => playLine(index, line)}
                      disabled={disabled}
                      title={isPlaying ? "Stop" : "Play"}
                      data-testid={`button-play-${index}`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isPlaying ? (
                        <Square className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => downloadLine(index, line)}
                      disabled={disabled || isDownloading}
                      title="Download MP3"
                      data-testid={`button-download-${index}`}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="absolute left-[3.25rem] top-6 bottom-6 w-px bg-border/50 pointer-events-none" />
              {content.map((line, index) => (
                <div key={index} className="flex items-start group relative">
                  <div className="w-10 text-right pr-4 text-muted-foreground/40 group-focus-within:text-primary font-mono text-sm pt-1.5 select-none transition-colors">
                    {index + 1}.
                  </div>
                  <input
                    data-index={index}
                    value={line}
                    onChange={(e) => handleLineChange(index, e.target.value)}
                    onBlur={handleLineBlur}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onPaste={(e) => handlePaste(e, index)}
                    className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-base py-1.5 pl-3 min-h-[32px] rounded-md focus:bg-muted/30 transition-colors"
                    placeholder={index === 0 && content.length === 1 ? "Start typing..." : ""}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
