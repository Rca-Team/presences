import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Zone = { x: number; y: number; w: number; h: number };

type Input = {
  facesInFrame: number;
  recognizedFaces: number;
  unknownFaces: number;
  averageConfidence: number;
  fps: number;
  currentZone: Zone | null;
  cameraFacingMode: 'user' | 'environment';
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function validateInput(data: any): Input | null {
  if (!data || typeof data !== 'object') return null;
  const num = ['facesInFrame', 'recognizedFaces', 'unknownFaces', 'averageConfidence', 'fps'] as const;
  for (const k of num) {
    if (typeof data[k] !== 'number' || Number.isNaN(data[k])) return null;
  }
  if (data.cameraFacingMode !== 'user' && data.cameraFacingMode !== 'environment') return null;
  if (data.currentZone !== null) {
    const z = data.currentZone;
    if (!z || typeof z !== 'object') return null;
    if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.w !== 'number' || typeof z.h !== 'number') return null;
  }
  return data as Input;
}

function heuristicDecision(input: Input) {
  const unknownRatio = input.facesInFrame > 0 ? input.unknownFaces / input.facesInFrame : 0;
  const baseZone: Zone = input.currentZone ?? { x: 0.31, y: 0.14, w: 0.38, h: 0.68 };

  let decision: 'stable' | 'adjust_zone' | 'pause_for_quality' | 'slow_down' = 'stable';
  let reasoning = 'Detection quality is stable.';
  let voicePrompt = 'Scanning stable. Continue attendance.';
  let shouldAdjustZone = false;
  let suggestedZone: Zone | undefined;

  if (input.fps < 12) {
    decision = 'slow_down';
    reasoning = 'Low frame rate detected. Reduce movement and scanning complexity.';
    voicePrompt = 'System is under load. Please hold the camera steady.';
  }

  if (input.averageConfidence < 0.5) {
    decision = 'pause_for_quality';
    reasoning = 'Face confidence is low. Better framing and lighting are needed.';
    voicePrompt = 'Low confidence. Move closer and improve lighting.';
  }

  if (unknownRatio >= 0.5 && input.facesInFrame >= 2) {
    decision = 'adjust_zone';
    shouldAdjustZone = true;
    reasoning = 'Many unknown faces detected. Tighten detection area to reduce noise.';
    voicePrompt = 'Adjusting detection zone for better accuracy.';

    suggestedZone = {
      x: clamp(baseZone.x + 0.03, 0, 0.8),
      y: clamp(baseZone.y + 0.02, 0, 0.8),
      w: clamp(baseZone.w - 0.06, 0.2, 1),
      h: clamp(baseZone.h - 0.05, 0.2, 1),
    };
  }

  return {
    decision,
    reasoning,
    voicePrompt,
    shouldAdjustZone,
    suggestedZone,
    confidence: clamp(input.averageConfidence || 0.5, 0.3, 0.98),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Backend config missing' }, 500);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData.user) return json({ error: 'Invalid or expired authentication token' }, 401);

    const raw = await req.json();
    const input = validateInput(raw);
    if (!input) return json({ error: 'Invalid request payload' }, 400);

    const heuristic = heuristicDecision(input);
    if (!lovableApiKey) return json({ decision: heuristic });

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': lovableApiKey,
        'X-Lovable-AIG-SDK': 'vercel-ai-sdk',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a realtime attendance assistant. Return concise JSON with keys: decision, reasoning, voicePrompt, shouldAdjustZone, suggestedZone, confidence. Use decision in stable|adjust_zone|pause_for_quality|slow_down. suggestedZone must include x,y,w,h in 0..1 only when shouldAdjustZone is true.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              telemetry: input,
              baseline: heuristic,
              instruction:
                'Refine the baseline decision for live classroom attendance scanning. Keep reasoning short and operational.',
            }),
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      return json({ decision: heuristic });
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content) return json({ decision: heuristic });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ decision: heuristic });
    }

    const finalDecision = {
      decision: ['stable', 'adjust_zone', 'pause_for_quality', 'slow_down'].includes(parsed?.decision)
        ? parsed.decision
        : heuristic.decision,
      reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : heuristic.reasoning,
      voicePrompt: typeof parsed?.voicePrompt === 'string' ? parsed.voicePrompt : heuristic.voicePrompt,
      shouldAdjustZone:
        typeof parsed?.shouldAdjustZone === 'boolean' ? parsed.shouldAdjustZone : heuristic.shouldAdjustZone,
      suggestedZone:
        parsed?.suggestedZone && typeof parsed.suggestedZone === 'object'
          ? {
              x: clamp(Number(parsed.suggestedZone.x ?? heuristic.suggestedZone?.x ?? 0.31), 0, 1),
              y: clamp(Number(parsed.suggestedZone.y ?? heuristic.suggestedZone?.y ?? 0.14), 0, 1),
              w: clamp(Number(parsed.suggestedZone.w ?? heuristic.suggestedZone?.w ?? 0.38), 0.2, 1),
              h: clamp(Number(parsed.suggestedZone.h ?? heuristic.suggestedZone?.h ?? 0.68), 0.2, 1),
            }
          : heuristic.suggestedZone,
      confidence: clamp(Number(parsed?.confidence ?? heuristic.confidence), 0.3, 0.99),
    };

    return json({ decision: finalDecision });
  } catch (error) {
    console.error('attendance-ai-assist failed:', error);
    return json({ error: (error as Error).message || 'Unexpected error' }, 500);
  }
});