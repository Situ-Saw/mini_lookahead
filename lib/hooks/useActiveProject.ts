"use client";

import { useState, useEffect } from "react";

type ActiveProject = {
  id: string;
  name: string;
  code: string;
  role: string;
};

export function useActiveProject() {
  const [activeProject, setActiveProject] =
    useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("active_project");
    if (stored) {
      setActiveProject(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  return { activeProject, isLoading };
}
