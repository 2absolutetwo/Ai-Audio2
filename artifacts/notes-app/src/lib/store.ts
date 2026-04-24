import { useState, useEffect, useCallback } from "react";

export type Project = {
  id: string;
  title: string;
  content: string[];
  updatedAt: number;
};

const DEFAULT_PROJECT: Project = {
  id: "inception-1",
  title: "Inception",
  content: [
    "We need to go deeper.",
    "A dream within a dream.",
    "The top is still spinning."
  ],
  updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
};

type StoreState = {
  projects: Project[];
  trash: Project[];
  activeProjectId: string | null;
};

export function useStore() {
  const [state, setState] = useState<StoreState>(() => {
    const stored = localStorage.getItem("task-store");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse store", e);
      }
    }
    return {
      projects: [DEFAULT_PROJECT],
      trash: [],
      activeProjectId: DEFAULT_PROJECT.id,
    };
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem("task-store", JSON.stringify(state));
    }, 500);
    return () => clearTimeout(timeout);
  }, [state]);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setState(s => ({
      ...s,
      projects: s.projects.map(p => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p)
    }));
  }, []);

  const createProject = useCallback(() => {
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 9),
      title: "Untitled Project",
      content: [""],
      updatedAt: Date.now(),
    };
    setState(s => ({
      ...s,
      projects: [newProject, ...s.projects],
      activeProjectId: newProject.id,
    }));
  }, []);

  const moveToTrash = useCallback((id: string) => {
    setState(s => {
      const p = s.projects.find(x => x.id === id);
      if (!p) return s;
      return {
        ...s,
        projects: s.projects.filter(x => x.id !== id),
        trash: [p, ...s.trash],
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      };
    });
  }, []);

  const restoreFromTrash = useCallback((id: string) => {
    setState(s => {
      const p = s.trash.find(x => x.id === id);
      if (!p) return s;
      return {
        ...s,
        trash: s.trash.filter(x => x.id !== id),
        projects: [p, ...s.projects],
      };
    });
  }, []);

  const deletePermanently = useCallback((id: string) => {
    setState(s => ({
      ...s,
      trash: s.trash.filter(x => x.id !== id),
    }));
  }, []);

  const setActiveProject = useCallback((id: string | null) => {
    setState(s => ({ ...s, activeProjectId: id }));
  }, []);

  return {
    projects: state.projects,
    trash: state.trash,
    activeProjectId: state.activeProjectId,
    activeProject: state.projects.find(p => p.id === state.activeProjectId) || null,
    updateProject,
    createProject,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    setActiveProject,
  };
}
