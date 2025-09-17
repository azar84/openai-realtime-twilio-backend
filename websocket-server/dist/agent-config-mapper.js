"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeConfig = normalizeConfig;
exports.buildAgentFromDB = buildAgentFromDB;
exports.buildTwilioSessionFromDB = buildTwilioSessionFromDB;
exports.applyLiveUpdateFromDB = applyLiveUpdateFromDB;
exports.switchVoiceWithRestart = switchVoiceWithRestart;
exports.registerTool = registerTool;
exports.getAvailableTools = getAvailableTools;
exports.getTool = getTool;
const realtime_1 = require("@openai/agents/realtime");
const agents_extensions_1 = require("@openai/agents-extensions");
const agent_tools_1 = require("./agent-tools");
// Tool registry moved to agent-tools.ts
// 2) Normalize and validate a DB row
function normalizeConfig(db) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        // Reasonable fallbacks
        const model = (_a = db.model) !== null && _a !== void 0 ? _a : "gpt-realtime";
        const voice = (_b = db.voice) !== null && _b !== void 0 ? _b : "alloy";
        const instructions = (_c = db.instructions) !== null && _c !== void 0 ? _c : "You are a helpful, concise voice agent. Keep answers short.";
        const inputAudioFormat = (_d = db.input_audio_format) !== null && _d !== void 0 ? _d : "g711_ulaw";
        const outputAudioFormat = (_e = db.output_audio_format) !== null && _e !== void 0 ? _e : "g711_ulaw";
        // VAD / turn detection mapping
        let turn_detection;
        switch ((_f = db.turn_detection_type) !== null && _f !== void 0 ? _f : "server_vad") {
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
                    eagerness: (_g = db.turn_detection_eagerness) !== null && _g !== void 0 ? _g : "medium",
                    interrupt_response: (_h = db.turn_detection_interrupt_response) !== null && _h !== void 0 ? _h : true,
                };
                break;
            default:
                // server_vad default - optimized for low latency
                turn_detection = {
                    type: "server_vad",
                    threshold: (_j = db.turn_detection_threshold) !== null && _j !== void 0 ? _j : 0.5,
                    prefix_padding_ms: (_k = db.turn_detection_prefix_padding_ms) !== null && _k !== void 0 ? _k : 300,
                    silence_duration_ms: (_l = db.turn_detection_silence_duration_ms) !== null && _l !== void 0 ? _l : 200,
                    create_response: (_m = db.turn_detection_create_response) !== null && _m !== void 0 ? _m : true,
                    interrupt_response: (_o = db.turn_detection_interrupt_response) !== null && _o !== void 0 ? _o : true,
                };
        }
        // Tools - get tools based on enabled_tools array from database
        const toolsEnabled = (_p = db.tools_enabled) !== null && _p !== void 0 ? _p : true;
        const enabledToolNames = (_q = db.enabled_tools) !== null && _q !== void 0 ? _q : [];
        const enabledToolsForTwilio = toolsEnabled ? (0, agent_tools_1.getEnabledToolsForTwilio)(enabledToolNames) : [];
        const enabledToolsForWebRTC = toolsEnabled ? (0, agent_tools_1.getEnabledToolsForWebRTC)(enabledToolNames) : [];
        return {
            model,
            voice,
            instructions,
            temperature: (_r = db.temperature) !== null && _r !== void 0 ? _r : 0.7,
            max_output_tokens: (_s = db.max_tokens) !== null && _s !== void 0 ? _s : undefined,
            inputAudioFormat,
            outputAudioFormat,
            turn_detection,
            modalities: (_t = db.modalities) !== null && _t !== void 0 ? _t : ["text", "audio"],
            toolsEnabled,
            enabledToolsForTwilio,
            enabledToolsForWebRTC,
        };
    });
}
// 3) Build Agent + Session from DB row (for voice chat - uses PCM16)
function buildAgentFromDB(dbRow) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const cfg = yield normalizeConfig(dbRow);
        const agent = new realtime_1.RealtimeAgent({
            name: (_a = dbRow.name) !== null && _a !== void 0 ? _a : "Default Assistant",
            instructions: cfg.instructions,
            voice: cfg.voice, // choose before first audio output
            tools: [], // WebRTC tools need to be handled differently - using direct OpenAI API
        });
        const session = new realtime_1.RealtimeSession(agent, {
            model: cfg.model,
            config: {
                audio: {
                    input: {
                        format: "pcm16", // Browser sends 24kHz PCM16 mono - optimal for Realtime API
                        turnDetection: cfg.turn_detection,
                    },
                    output: {
                        voice: cfg.voice,
                    },
                },
            },
        });
        return { agent, session, cfg };
    });
}
// 4) Build Twilio-specific session from DB row (uses g711_ulaw)
function buildTwilioSessionFromDB(dbRow, twilioWebSocket) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const cfg = yield normalizeConfig(dbRow);
        const agent = new realtime_1.RealtimeAgent({
            name: (_a = dbRow.name) !== null && _a !== void 0 ? _a : "Twilio Assistant",
            instructions: cfg.instructions,
            voice: cfg.voice,
            tools: [], // Tools are handled in the session configuration, not agent
        });
        const twilioTransport = new agents_extensions_1.TwilioRealtimeTransportLayer({
            twilioWebSocket: twilioWebSocket,
        });
        const session = new realtime_1.RealtimeSession(agent, {
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
    });
}
// 5) Hot-update mid-call (e.g., user changes settings in UI)
function applyLiveUpdateFromDB(session, dbRow) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const cfg = yield normalizeConfig(dbRow);
        // Build a minimal patch — avoid touching voice if the agent already spoke.
        // If you must change voice mid-call, end the session and start a new one.
        const patch = Object.assign(Object.assign({ instructions: cfg.instructions, temperature: cfg.temperature }, (cfg.max_output_tokens ? { max_output_tokens: cfg.max_output_tokens } : { max_output_tokens: undefined })), { turn_detection: cfg.turn_detection });
        // Note: The RealtimeSession doesn't have an update method in the current SDK
        // For now, we'll create a new agent and update it
        const newAgent = new realtime_1.RealtimeAgent({
            name: (_a = dbRow.name) !== null && _a !== void 0 ? _a : "Updated Assistant",
            instructions: cfg.instructions,
            voice: cfg.voice,
            tools: [], // Tools are handled in the session configuration, not agent
        });
        yield session.updateAgent(newAgent);
    });
}
// 6) Switch voice with restart (when voice changes)
function switchVoiceWithRestart(oldSession, dbRow, newVoice) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // 1) cleanly close current session
        yield ((_a = oldSession.close) === null || _a === void 0 ? void 0 : _a.call(oldSession));
        // 2) write to DB (optional) then re-read
        dbRow.voice = newVoice;
        const { session: newSession } = yield buildAgentFromDB(dbRow);
        // 3) reconnect
        yield newSession.connect({ apiKey: process.env.OPENAI_API_KEY });
        return newSession;
    });
}
// 7) Register a new tool dynamically
function registerTool(name, toolDefinition) {
    console.warn('⚠️ registerTool() is deprecated. Add tools directly to TOOL_REGISTRY in agent-tools.ts');
}
// 8) Get all available tools
function getAvailableTools() {
    console.warn('⚠️ getAvailableTools() is deprecated. Use getAvailableToolNames() from agent-tools.ts');
    return [];
}
// 9) Get tool by name
function getTool(name) {
    console.warn('⚠️ getTool() is deprecated. Use TOOL_REGISTRY from agent-tools.ts');
    return undefined;
}
