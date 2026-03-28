import type { CoachAnswers } from "../types"

export interface StepProps {
  answers: CoachAnswers
  onUpdate: (patch: Partial<CoachAnswers>) => void
  onNext: () => void
  onBack: () => void
}
