import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";

interface ActiveSpaceInfo {
  id: string;
  title: string;
  hostId: string;
}

interface ActiveSpaceContextValue {
  activeSpace: ActiveSpaceInfo | null;
  minimized: boolean;
  joinSpace: (space: ActiveSpaceInfo) => void;
  leaveSpace: () => void;
  toggleMinimize: () => void;
  maximize: () => void;
}

const ActiveSpaceContext = createContext<ActiveSpaceContextValue>({
  activeSpace: null,
  minimized: false,
  joinSpace: () => {},
  leaveSpace: () => {},
  toggleMinimize: () => {},
  maximize: () => {},
});

export const useActiveSpace = () => useContext(ActiveSpaceContext);

export const ActiveSpaceProvider = ({ children }: { children: ReactNode }) => {
  const [activeSpace, setActiveSpace] = useState<ActiveSpaceInfo | null>(null);
  const [minimized, setMinimized] = useState(false);

  const joinSpace = useCallback((space: ActiveSpaceInfo) => {
    setActiveSpace(space);
    setMinimized(false);
  }, []);

  const leaveSpace = useCallback(() => {
    setActiveSpace(null);
    setMinimized(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setMinimized((prev) => !prev);
  }, []);

  const maximize = useCallback(() => {
    setMinimized(false);
  }, []);

  return React.createElement(
    ActiveSpaceContext.Provider,
    { value: { activeSpace, minimized, joinSpace, leaveSpace, toggleMinimize, maximize } },
    children
  );
};
