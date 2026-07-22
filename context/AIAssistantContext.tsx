import React, { createContext, useContext, useRef, useCallback } from 'react';

interface AIAssistantContextValue {
  registerOpenPanel: (fn: () => void) => void;
  openAIPanel: () => void;
}

const AIAssistantContext = createContext<AIAssistantContextValue>({
  registerOpenPanel: () => {},
  openAIPanel: () => {},
});

export function AIAssistantProvider({ children }: { children: React.ReactNode }) {
  const openPanelRef = useRef<(() => void) | null>(null);

  const registerOpenPanel = useCallback((fn: () => void) => {
    openPanelRef.current = fn;
  }, []);

  const openAIPanel = useCallback(() => {
    openPanelRef.current?.();
  }, []);

  return (
    <AIAssistantContext.Provider value={{ registerOpenPanel, openAIPanel }}>
      {children}
    </AIAssistantContext.Provider>
  );
}

export function useAIAssistant() {
  return useContext(AIAssistantContext);
}
