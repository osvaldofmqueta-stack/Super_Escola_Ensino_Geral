/**
 * ProfessorTour — wrapper fino sobre o GuidedTour genérico, mantido para compatibilidade
 * com o código existente (professor-hub.tsx). Os passos do tour do Professor vivem agora
 * em `constants/tourSteps.tsx`, ao lado dos passos de todos os outros perfis.
 */
import React from 'react';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { PROFESSOR_TOUR_STEPS, PROFESSOR_TOUR_KEY } from '@/constants/tourSteps';

interface ProfessorTourProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}

export default function ProfessorTour({ visible, onClose, onNavigate }: ProfessorTourProps) {
  return (
    <GuidedTour
      visible={visible}
      onClose={onClose}
      onNavigate={onNavigate}
      steps={PROFESSOR_TOUR_STEPS}
      storageKey={PROFESSOR_TOUR_KEY}
    />
  );
}

export function useProfessorTour() {
  return useGuidedTour(PROFESSOR_TOUR_KEY);
}
