import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Copy, Scissors, Undo, Play, Square, Loader2, Download, ListMusic, SkipForward, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoicePicker } from "./voice-picker";
import { FavoriteVoicesButton } from "./favorite-voices-button";

const VOICE_STORAGE_KEY = "tts-selected-voice";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function buildHtml(lines: string[]) {
  if (lines.length === 0) return "<div><br></div>";
  return lines.map((l) => `<div>${l ? escapeHtml(l) : "<br>"}</div>`).join("");
}
function extractLines(el: HTMLDivElement): string[] {
  const children = Array.from(el.children) as HTMLElement[];
  if (children.length === 0) return [""];
  return children.map((c) => c.innerText.replace(/\n$/, ""));
}
function normalizePastedLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
}

interface LineEditorProps {
  editorKey: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}
function LineEditor({ editorKey, value, onChange, placeholder }: LineEditorProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const internalChange = useRef(false);

  useEffect(() => {
    if (internalChange.current) { internalChange.current = false; return; }
    const el = innerRef.current;
    if (!el) return;
    const newHtml = buildHtml(value);
    if (el.innerHTML !== newHtml) el.innerHTML = newHtml;
  }, [value, editorKey]);

  const handleInput = () => {
    if (!innerRef.current) return;
    internalChange.current = true;
    onChange(extractLines(innerRef.current));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.execCommand("insertHTML", false, "<div><br></div>");
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text/plain");
    if (!innerRef.current || !pastedText) return;
    const pastedLines = normalizePastedLines(pastedText);
    if (pastedLines.length === 0) return;

    if (pastedLines.length === 1) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(pastedLines[0]);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        internalChange.current = true;
        onChange(extractLines(innerRef.current));
        return;
      }
    }

    const sel = window.getSelection();
    let insertAfterIdx = -1;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      let node: Node = range.startContainer;
      while (node.parentNode && node.parentNode !== innerRef.current) node = node.parentNode;
      if (node.parentNode === innerRef.current) insertAfterIdx = Array.from(innerRef.current.children).indexOf(node as Element);
    }

    const existingLines = Array.from(innerRef.current.children as HTMLCollectionOf<HTMLElement>).map((c) => c.innerText.replace(/\n$/, ""));
    let newLines: string[];
    if (existingLines.length === 0 || (existingLines.length === 1 && existingLines[0] === "")) {
      newLines = pastedLines;
    } else if (insertAfterIdx === -1) {
      newLines = [...existingLines, ...pastedLines];
    } else {
      newLines = [...existingLines.slice(0, insertAfterIdx + 1), ...pastedLines, ...existingLines.slice(insertAfterIdx + 1)];
    }
    innerRef.current.innerHTML = buildHtml(newLines);
    internalChange.current = true;
    onChange(extractLines(innerRef.current));
  };

  return (
    <div
      ref={(el) => {
        innerRef.current = el;
        if (el && el.innerHTML === "") el.innerHTML = buildHtml(value);
      }}
      key={editorKey}
      contentEditable
      suppressContentEditableWarning
      data-line-editor
      data-placeholder={placeholder}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className="flex-1 min-h-0 overflow-y-auto outline-none px-5 pt-4 pb-14 text-sm text-foreground"
      style={{ minHeight: 0, scrollPaddingBottom: "3.5rem" }}
    />
  );
}

interface AudioEntry {
  url: string;
  text: string;
}

interface AudioPoolProps {
  lines: string[];
  selectedVoice: string | null;
}

function AudioPool({ lines, selectedVoice }: AudioPoolProps) {
  const [poolAudio, setPoolAudio] = useState<Record<number, AudioEntry>>({});
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayRef = useRef(false);
  const currentAutoIndexRef = useRef<number>(0);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const validLines = lines.filter((l) => l.trim());

  useEffect(() => {
    return () => {
      autoPlayRef.current = false;
      if (audioRef.current) {
        audioRef.current.onerror = null;
        audioRef.current.onended = null;
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const stopAll = () => {
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    if (audioRef.current) {
      audioRef.current.onerror = null;
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlayingIndex(null);
    setLoadingIndex(null);
  };

  const fetchAudio = async (index: number, text: string): Promise<string | null> => {
    if (poolAudio[index]) return poolAudio[index].url;
    const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), ...(selectedVoice ? { voice: selectedVoice } : {}) }),
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setPoolAudio((prev) => ({ ...prev, [index]: { url, text } }));
    return url;
  };

  const playSingle = async (index: number) => {
    const line = lines[index];
    if (!line?.trim()) return;
    if (playingIndex === index && !isAutoPlaying) { stopAll(); return; }
    stopAll();
    setLoadingIndex(index);
    try {
      const url = await fetchAudio(index, line);
      if (!url) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingIndex(null); setLoadingIndex(null); };
      audio.onerror = () => { toast.error("Playback failed"); stopAll(); };
      await audio.play();
      setLoadingIndex(null);
      setPlayingIndex(index);
      itemRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      toast.error("Could not generate voice");
      stopAll();
    }
  };

  const playNextAuto = async (index: number) => {
    if (!autoPlayRef.current) return;
    const realLines = lines.map((l, i) => ({ text: l, i })).filter((x) => x.text.trim());
    const entry = realLines.find((x) => x.i === index);
    if (!entry) { stopAll(); return; }

    setLoadingIndex(index);
    setPlayingIndex(null);
    itemRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
      const url = await fetchAudio(index, entry.text);
      if (!url || !autoPlayRef.current) { stopAll(); return; }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (!autoPlayRef.current) { setPlayingIndex(null); setLoadingIndex(null); return; }
        const nextEntry = realLines.find((x) => x.i > index);
        if (nextEntry) {
          playNextAuto(nextEntry.i);
        } else {
          stopAll();
          toast.success("All lines played!");
        }
      };
      audio.onerror = () => { toast.error("Playback failed"); stopAll(); };
      await audio.play();
      setLoadingIndex(null);
      setPlayingIndex(index);
    } catch {
      if (autoPlayRef.current) toast.error("Could not generate voice");
      stopAll();
    }
  };

  const startAutoPlay = () => {
    if (isAutoPlaying) { stopAll(); return; }
    const realLines = lines.map((l, i) => ({ text: l, i })).filter((x) => x.text.trim());
    if (realLines.length === 0) { toast.error("No lines to play"); return; }
    stopAll();
    autoPlayRef.current = true;
    setIsAutoPlaying(true);
    playNextAuto(realLines[0].i);
  };

  const resetPool = () => {
    stopAll();
    Object.values(poolAudio).forEach((e) => URL.revokeObjectURL(e.url));
    setPoolAudio({});
    toast.success("Audio pool cleared");
  };

  const total = validLines.length;
  const cached = Object.keys(poolAudio).length;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: "340px" }}>
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card rounded-t-xl">
        <div className="flex items-center gap-2">
          <ListMusic size={14} className="text-emerald-500" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Audio Pool</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            মোট : {total}
          </span>
          {cached > 0 && (
            <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-full">
              {cached}টি তৈরি
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startAutoPlay}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full transition-all ${
              isAutoPlaying
                ? "bg-red-100 text-red-600 dark:bg-red-950 hover:bg-red-200"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 hover:bg-emerald-200"
            }`}
          >
            {isAutoPlaying ? (
              <><Square size={10} className="fill-current" /> বন্ধ করুন</>
            ) : (
              <><SkipForward size={10} /> সব Play করুন</>
            )}
          </button>
          <button
            onClick={resetPool}
            className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
          >
            <RotateCcw size={10} /> রিসেট
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {lines.length === 0 || (lines.length === 1 && !lines[0].trim()) ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            Cut view-এ লাইন যোগ করুন
          </div>
        ) : (
          lines.map((line, index) => {
            if (!line.trim()) return null;
            const isLoading = loadingIndex === index;
            const isPlaying = playingIndex === index;
            const isCached = !!poolAudio[index];
            return (
              <div
                key={index}
                ref={(el) => { itemRefs.current[index] = el; }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all ${
                  isPlaying
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm"
                    : isLoading
                    ? "border-emerald-300 bg-muted/50"
                    : "border-border bg-background hover:border-emerald-300"
                }`}
              >
                <div className="text-muted-foreground/60 font-mono text-xs select-none shrink-0 w-8 text-right">
                  {String(index + 1).padStart(3, "0")}
                </div>
                {isCached && !isPlaying && !isLoading && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Cached" />
                )}
                {isPlaying && (
                  <div className="flex gap-0.5 items-end shrink-0">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-emerald-500 rounded-full animate-bounce"
                        style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                )}
                {isLoading && <Loader2 size={12} className="animate-spin text-emerald-500 shrink-0" />}
                <p className="flex-1 text-sm text-foreground truncate">{line}</p>
                <button
                  onClick={() => playSingle(index)}
                  disabled={isAutoPlaying}
                  className={`shrink-0 p-1.5 rounded-md transition-colors ${
                    isPlaying
                      ? "text-emerald-600 hover:bg-emerald-100"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  } disabled:opacity-40`}
                  title={isPlaying ? "Stop" : "Play"}
                >
                  {isLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isPlaying ? (
                    <Square size={13} className="fill-current" />
                  ) : (
                    <Play size={13} />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function Editor() {
  const [content, setContent] = useState<string[]>([""]);
  const [history, setHistory] = useState<string[][]>([[""]]);
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
      audioRef.current.onerror = null;
      audioRef.current.onended = null;
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
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  const downloadLine = async (index: number, text: string) => {
    if (downloadingIndex !== null) return;
    const trimmed = text.trim();
    if (!trimmed) { toast.error("Nothing to download"); return; }
    setDownloadingIndex(index);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, ...(selectedVoice ? { voice: selectedVoice } : {}) }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `note-${String(index + 1).padStart(3, "0")}.mp3`;
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
    if (playingIndex === index || loadingIndex === index) { stopPlayback(); return; }
    stopPlayback();
    const trimmed = text.trim();
    if (!trimmed) { toast.error("Nothing to read"); return; }
    setLoadingIndex(index);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, ...(selectedVoice ? { voice: selectedVoice } : {}) }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopPlayback();
      audio.onerror = () => { toast.error("Playback failed"); stopPlayback(); };
      await audio.play();
      setLoadingIndex(null);
      setPlayingIndex(index);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate voice");
      stopPlayback();
    }
  };

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

  const handleLineBlur = () => { saveHistory(content); };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText) return;
    const lines = pastedText.split(/\r?\n/);
    const sentences: string[] = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      const parts = line.split(/(?<=[.!?])\s*(?=[A-Z])/);
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
  const totalPtu = (content.join("\n").match(/[.?।]/g) || []).length;

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top card with Favorites and Language Search */}
      <div className="bg-card border border-border rounded-xl shadow-sm px-4 py-2.5 flex items-center justify-end gap-2">
        <FavoriteVoicesButton selectedVoice={selectedVoice} onSelect={setSelectedVoice} />
        <VoicePicker selectedVoice={selectedVoice} onSelect={setSelectedVoice} />
      </div>

      {/* Editor Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Original</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {totalLines} {totalLines === 1 ? "line" : "lines"}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${totalPtu !== totalLines ? "text-red-500 bg-red-100 dark:bg-red-950" : "text-muted-foreground bg-muted"}`}>
              {totalPtu} ptu
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleCopy} title="Copy all text" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Copy size={14} />
            </button>
            <button onClick={handleCut} title="Split into sub-cards" className={`p-1.5 rounded-md hover:bg-muted transition-colors ${isCutView ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}>
              <Scissors size={14} />
            </button>
            <button onClick={handleUndo} disabled={historyIndex === 0} title="Undo" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
              <Undo size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden" ref={containerRef}>
          {isCutView ? (
            <div className="flex flex-col gap-3 overflow-y-auto p-6">
              {content.map((line, index) => {
                const isLoading = loadingIndex === index;
                const isPlaying = playingIndex === index;
                const isDownloading = downloadingIndex === index;
                const disabled = !line.trim();
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-background border border-emerald-400/60 rounded-lg px-4 shadow-sm hover:border-emerald-500 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 h-14"
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
                      onPaste={(e) => handlePaste(e, index)}
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
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => downloadLine(index, line)}
                      disabled={disabled || isDownloading}
                      title="Download MP3"
                    >
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <LineEditor
              editorKey="main"
              value={content}
              onChange={(lines) => { setContent(lines); saveHistory(lines); }}
              placeholder="Start typing..."
            />
          )}
        </div>
      </div>

      {/* Audio Pool Card */}
      {isCutView && (
        <AudioPool lines={content} selectedVoice={selectedVoice} />
      )}
    </div>
  );
}
