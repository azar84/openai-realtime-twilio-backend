import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import { z } from "zod";
import { getEnabledToolsForTwilio, getEnabledToolsForWebRTC } from "./agent-tools";

// 1) Types that mirror your DB (agent_configs table)
export type DBAgentConfig = {
  id: number;
  name: string | null;
  instructions: string | null;
  voice: string | null; // e.g., 'alloy' | 'verse' | 'ash' | ...
  model: string | null; // e.g., 'gpt-realtime' or 'gpt-4o-realtime-preview-2024-12-17'
  temperature: number | null; // 0.0 - 2.0
  max_tokens: number | null;

  input_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw" | null;
  output_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw" | null;

  turn_detection_type: "server_vad" | "none" | "semantic_vad" | null;
  turn_detection_threshold: number | null;           // server_vad only
  turn_detection_prefix_padding_ms: number | null;   // server_vad only
  turn_detection_silence_duration_ms: number | null; // server_vad only
  
  // Additional turn detection fields
  turn_detection_eagerness: string | null;           // semantic_vad only
  turn_detection_create_response: boolean | null;    // server_vad only
  turn_detection_interrupt_response: boolean | null; // server_vad and semantic_vad

  modalities: string[] | null; // e.g., ["text","audio"]
  tools_enabled: boolean | null;
  enabled_tools: string[] | null;
  max_output_tokens: number | null;

  // Language configuration
  primary_language: string | null;
  secondary_languages: string[] | null;
  primary_language_id: number | null;
  secondary_language_ids: number[] | null;
  primary_language_code: string | null;
  primary_language_name: string | null;
  primary_language_native_name: string | null;
  secondary_language_codes: string[] | null;
  secondary_language_names: string[] | null;

  // Personality configuration fields
  config_title: string | null;
  config_description: string | null;
  identity_option_id: number | null;
  task_option_id: number | null;
  demeanor_option_id: number | null;
  tone_option_id: number | null;
  enthusiasm_option_id: number | null;
  formality_option_id: number | null;
  emotion_option_id: number | null;
  filler_words_option_id: number | null;
  pacing_option_id: number | null;
  custom_instructions: string[] | null;
  
  // Personality values (from JOIN query)
  identity_value: string | null;
  task_value: string | null;
  demeanor_value: string | null;
  tone_value: string | null;
  enthusiasm_value: string | null;
  formality_value: string | null;
  emotion_value: string | null;
  filler_words_value: string | null;
  pacing_value: string | null;
  

  is_active: boolean | null;
  created_at?: string;
  updated_at?: string;
};

export type PersonalityOption = {
  id: number;
  category: string;
  value: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

// Tool registry moved to agent-tools.ts

// 2) Normalize and validate a DB row
export async function normalizeConfig(db: DBAgentConfig) {
  // Reasonable fallbacks
  const model = db.model ?? "gpt-realtime";
  const voice = db.voice ?? "alloy";
  const instructions = db.instructions ?? "You are a helpful, concise voice agent. Keep answers short.";

  const inputAudioFormat = db.input_audio_format ?? "g711_ulaw";
  const outputAudioFormat = db.output_audio_format ?? "g711_ulaw";

  // VAD / turn detection mapping
  let turn_detection:
    | { type: "none" }
    | {
        type: "server_vad";
        threshold?: number;
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
        create_response?: boolean;
        interrupt_response?: boolean;
      }
    | {
        type: "semantic_vad";
        eagerness?: "low" | "medium" | "high";
        interrupt_response?: boolean;
      };

  switch (db.turn_detection_type ?? "server_vad") {
    case "none":
      // OpenAI Realtime API doesn't support "none", so we use server_vad with minimal settings
      turn_detection = {
        type: "server_vad",
        threshold: 0.1, // Very low threshold to be permissive
        prefix_padding_ms: 0,
        silence_duration_ms: 1000, // Longer silence to avoid cutting off
        create_response: false, // Manual response control
        interrupt_response: true,
      };
      break;
    case "semantic_vad":
      turn_detection = {
        type: "semantic_vad",
        eagerness: (db.turn_detection_eagerness as "low" | "medium" | "high") ?? "medium",
        interrupt_response: db.turn_detection_interrupt_response ?? true,
      };
      break;
    default:
      // server_vad default - optimized for low latency
      turn_detection = {
        type: "server_vad",
        threshold: db.turn_detection_threshold ?? 0.5,
        prefix_padding_ms: db.turn_detection_prefix_padding_ms ?? 300,
        silence_duration_ms: db.turn_detection_silence_duration_ms ?? 200,
        create_response: db.turn_detection_create_response ?? true,
        interrupt_response: db.turn_detection_interrupt_response ?? true,
      };
  }

  // Tools - get tools based on enabled_tools array from database
  const toolsEnabled = db.tools_enabled ?? true;
  const enabledToolNames = db.enabled_tools ?? [];
  const enabledToolsForTwilio = toolsEnabled ? getEnabledToolsForTwilio(enabledToolNames) : [];
  const enabledToolsForWebRTC = toolsEnabled ? getEnabledToolsForWebRTC(enabledToolNames) : [];

  return {
    model,
    voice,
    instructions,
    temperature: db.temperature ?? 0.7,
    max_output_tokens: db.max_tokens ?? undefined,
    inputAudioFormat,
    outputAudioFormat,
    turn_detection,
    modalities: db.modalities ?? ["text", "audio"],
    toolsEnabled,
    enabledToolsForTwilio,
    enabledToolsForWebRTC,
  };
}

// 3) Build Agent + Session from DB row (for voice chat - uses PCM16)
export async function buildAgentFromDB(dbRow: DBAgentConfig) {
  const cfg = await normalizeConfig(dbRow);

  const agent = new RealtimeAgent({
    name: dbRow.name ?? "Default Assistant",
    instructions: cfg.instructions,
    voice: cfg.voice,                // choose before first audio output
    tools: [], // WebRTC tools need to be handled differently - using direct OpenAI API
  });

  const session = new RealtimeSession(agent, {
    model: cfg.model,
    config: {
      audio: {
        input: {
          format: "pcm16", // Browser sends 24kHz PCM16 mono - optimal for Realtime API
          turnDetection: cfg.turn_detection as any,
        },
        output: {
          voice: cfg.voice,
        },
      },
    },
  });

  return { agent, session, cfg };
}

// 4) Build Twilio-specific session from DB row (uses g711_ulaw)
export async function buildTwilioSessionFromDB(dbRow: DBAgentConfig, twilioWebSocket: any) {
  const cfg = await normalizeConfig(dbRow);

  const agent = new RealtimeAgent({
    name: dbRow.name ?? "Twilio Assistant",
    instructions: cfg.instructions,
    voice: cfg.voice,
    tools: [], // Tools are handled in the session configuration, not agent
  });

  const twilioTransport = new TwilioRealtimeTransportLayer({
    twilioWebSocket: twilioWebSocket,
  });

  const session = new RealtimeSession(agent, {
    transport: twilioTransport,
    model: cfg.model,
    config: {
      audio: {
        output: {
          voice: cfg.voice,
        },
        input: {
          turnDetection: cfg.turn_detection,
        },
      },
    },
  });

  return { agent, session, cfg };
}

// 5) Hot-update mid-call (e.g., user changes settings in UI)
export async function applyLiveUpdateFromDB(
  session: RealtimeSession,
  dbRow: DBAgentConfig
) {
  const cfg = await normalizeConfig(dbRow);

  // Build a minimal patch — avoid touching voice if the agent already spoke.
  // If you must change voice mid-call, end the session and start a new one.
  const patch: any = {
    instructions: cfg.instructions,
    temperature: cfg.temperature,
    ...(cfg.max_output_tokens ? { max_output_tokens: cfg.max_output_tokens } : { max_output_tokens: undefined }),
    turn_detection: cfg.turn_detection,
    // audio formats are generally best set at start; change only if you know it's safe
    // input_audio_format: cfg.inputAudioFormat,
    // output_audio_format: cfg.outputAudioFormat,
  };

  // Note: The RealtimeSession doesn't have an update method in the current SDK
  // For now, we'll create a new agent and update it
  const newAgent = new RealtimeAgent({
    name: dbRow.name ?? "Updated Assistant",
    instructions: cfg.instructions,
    voice: cfg.voice,
    tools: [], // Tools are handled in the session configuration, not agent
  });

  await session.updateAgent(newAgent);
}

// 6) Switch voice with restart (when voice changes)
export async function switchVoiceWithRestart(
  oldSession: RealtimeSession,
  dbRow: DBAgentConfig,
  newVoice: string
) {
  // 1) cleanly close current session
  await oldSession.close?.();

  // 2) write to DB (optional) then re-read
  dbRow.voice = newVoice;
  const { session: newSession } = await buildAgentFromDB(dbRow);

  // 3) reconnect
  await newSession.connect({ apiKey: process.env.OPENAI_API_KEY! });
  return newSession;
}

// 7) Register a new tool dynamically
export function registerTool(name: string, toolDefinition: ReturnType<typeof tool>) {
  console.warn('⚠️ registerTool() is deprecated. Add tools directly to TOOL_REGISTRY in agent-tools.ts');
}

// 8) Get all available tools
export function getAvailableTools() {
  console.warn('⚠️ getAvailableTools() is deprecated. Use getAvailableToolNames() from agent-tools.ts');
  return [];
}

// 9) Get tool by name
export function getTool(name: string) {
  console.warn('⚠️ getTool() is deprecated. Use TOOL_REGISTRY from agent-tools.ts');
  return undefined;
}
