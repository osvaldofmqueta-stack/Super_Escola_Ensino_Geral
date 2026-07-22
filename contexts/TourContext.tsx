/**
 * TourContext — partilha o estado do tour guiado entre DrawerLeft e ProfessorTour.
 * O DrawerLeft lê `tourRoute` para destacar o item activo e publica a sua posição
 * em ecrã (`tourItemRect`) para que o cartão do tour (GuidedTour) possa apontar
 * exactamente para o item em causa, em vez de ficar sempre centrado no ecrã.
 * O ProfessorTour/GuidedTour escreve `tourRoute` a cada mudança de passo.
 */
import React, { createContext, useContext, useState } from 'react';

export interface TourItemRect {
  top: number;
  height: number;
}

interface TourCtxType {
  /** Rota do passo actual do tour (null quando o tour está fechado) */
  tourRoute: string | null;
  setTourRoute: (r: string | null) => void;
  /** Posição (em coordenadas de ecrã) do item de menu destacado, para o GuidedTour apontar correctamente */
  tourItemRect: TourItemRect | null;
  setTourItemRect: (r: TourItemRect | null) => void;
}

const TourContext = createContext<TourCtxType>({
  tourRoute: null,
  setTourRoute: () => {},
  tourItemRect: null,
  setTourItemRect: () => {},
});

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [tourRoute, setTourRoute] = useState<string | null>(null);
  const [tourItemRect, setTourItemRect] = useState<TourItemRect | null>(null);
  return (
    <TourContext.Provider value={{ tourRoute, setTourRoute, tourItemRect, setTourItemRect }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTourCtx() {
  return useContext(TourContext);
}
