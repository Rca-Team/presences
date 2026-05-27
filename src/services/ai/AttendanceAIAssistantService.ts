import { supabase } from '@/integrations/supabase/client';

export interface DetectionBoxSuggestion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AttendanceAssistantInput {
  facesInFrame: number;
  recognizedFaces: number;
  unknownFaces: number;
  averageConfidence: number;
  fps: number;
  currentZone: DetectionBoxSuggestion | null;
  cameraFacingMode: 'user' | 'environment';
}

export interface AttendanceAssistantDecision {
  decision: 'stable' | 'adjust_zone' | 'pause_for_quality' | 'slow_down';
  reasoning: string;
  voicePrompt: string;
  shouldAdjustZone: boolean;
  suggestedZone?: DetectionBoxSuggestion;
  confidence: number;
}

const fallbackDecision: AttendanceAssistantDecision = {
  decision: 'stable',
  reasoning: 'System is stable. Continue scanning.',
  voicePrompt: 'Scanning is stable.',
  shouldAdjustZone: false,
  confidence: 0.5,
};

export async function getAttendanceAssistantDecision(
  input: AttendanceAssistantInput
): Promise<AttendanceAssistantDecision> {
  const { data, error } = await supabase.functions.invoke('attendance-ai-assist', {
    body: input,
  });

  if (error) {
    console.error('attendance-ai-assist invocation failed:', error);
    return fallbackDecision;
  }

  const decision = data?.decision as AttendanceAssistantDecision | undefined;
  if (!decision) return fallbackDecision;

  return {
    ...fallbackDecision,
    ...decision,
  };
}