"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCallConnection = handleCallConnection;
exports.handleFrontendConnection = handleFrontendConnection;
const ws_1 = require("ws");
const db_1 = require("./db");
const agent_config_mapper_1 = require("./agent-config-mapper");
const agent_instructions_1 = __importDefault(require("./agent-instructions"));
let session = {};
function handleCallConnection(ws, openAIApiKey) {
    // Clean up any existing connections and reset session
    closeAllConnections();
    // Initialize fresh session for new call
    session.twilioConn = ws;
    session.openAIApiKey = openAIApiKey;
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    session.saved_config = undefined;
    session.dbSessionId = undefined;
    ws.on("message", handleTwilioMessage);
    ws.on("error", ws.close);
    ws.on("close", () => {
        cleanupConnection(session.modelConn);
        cleanupConnection(session.twilioConn);
        session.twilioConn = undefined;
        session.modelConn = undefined;
        session.streamSid = undefined;
        session.lastAssistantItem = undefined;
        session.responseStartTimestamp = undefined;
        session.latestMediaTimestamp = undefined;
        if (!session.frontendConn)
            session = {};
    });
}
function handleFrontendConnection(ws) {
    cleanupConnection(session.frontendConn);
    session.frontendConn = ws;
    ws.on("message", handleFrontendMessage);
    ws.on("close", () => {
        cleanupConnection(session.frontendConn);
        session.frontendConn = undefined;
        if (!session.twilioConn && !session.modelConn)
            session = {};
    });
}
function handleFunctionCall(item) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Handling function call:", item);
        try {
            // Get the tool from our registry
            const { TOOL_REGISTRY } = yield Promise.resolve().then(() => __importStar(require('./agent-tools')));
            const tool = TOOL_REGISTRY[item.name];
            if (!tool) {
                throw new Error(`No handler found for function: ${item.name}`);
            }
            let args;
            try {
                args = JSON.parse(item.arguments);
            }
            catch (_a) {
                return JSON.stringify({
                    error: "Invalid JSON arguments for function call.",
                });
            }
            console.log("Calling function:", tool.schema.name, args);
            const sessionContext = { streamSid: session.streamSid };
            const result = yield tool.handler(args, sessionContext);
            return result;
        }
        catch (err) {
            console.error("Error running function:", err);
            return JSON.stringify({
                error: `Error running function ${item.name}: ${err.message}`,
            });
        }
    });
}
function handleTwilioMessage(data) {
    const msg = parseMessage(data);
    if (!msg)
        return;
    switch (msg.event) {
        case "start":
            session.streamSid = msg.start.streamSid;
            session.latestMediaTimestamp = 0;
            session.lastAssistantItem = undefined;
            session.responseStartTimestamp = undefined;
            // Create database session for this call
            createDatabaseSession(msg.start.streamSid).catch(console.error);
            tryConnectModel().catch(console.error);
            break;
        case "media":
            session.latestMediaTimestamp = msg.media.timestamp;
            if (isOpen(session.modelConn)) {
                jsonSend(session.modelConn, {
                    type: "input_audio_buffer.append",
                    audio: msg.media.payload,
                });
            }
            break;
        case "close":
            // Update session status to ended
            if (session.dbSessionId) {
                (0, db_1.updateSessionStatus)(session.dbSessionId, 'ended').catch(console.error);
            }
            closeAllConnections();
            break;
    }
}
function handleFrontendMessage(data) {
    const msg = parseMessage(data);
    if (!msg)
        return;
    if (isOpen(session.modelConn)) {
        jsonSend(session.modelConn, msg);
    }
    if (msg.type === "session.update") {
        session.saved_config = msg.session;
    }
}
function tryConnectModel() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!session.twilioConn || !session.streamSid || !session.openAIApiKey)
            return;
        if (isOpen(session.modelConn))
            return;
        // Get the model from database configuration
        const agentConfig = yield (0, db_1.getActiveAgentConfig)();
        const model = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.model) || 'gpt-4o-realtime-preview-2024-12-17';
        console.log('🔗 Connecting Twilio to OpenAI with model:', model);
        session.modelConn = new ws_1.WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
            headers: {
                Authorization: `Bearer ${session.openAIApiKey}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });
        session.modelConn.on("open", () => __awaiter(this, void 0, void 0, function* () {
            const config = session.saved_config || {};
            // Get agent configuration from database
            console.log('🔍 Fetching agent configuration for Twilio...');
            const agentConfig = yield (0, db_1.getActiveAgentConfig)();
            if (!agentConfig) {
                console.error('❌ No active agent configuration found for Twilio');
                return;
            }
            // Normalize config and get fresh template-based instructions (same as WebRTC)
            const normalizedConfig = yield (0, agent_config_mapper_1.normalizeConfig)(agentConfig);
            console.log('📝 Generating fresh instructions from template for Twilio...');
            const freshInstructions = yield (0, agent_instructions_1.default)();
            const validTemperature = Math.max(0.6, Math.min(1.0, normalizedConfig.temperature));
            console.log('🤖 Twilio Agent Config:', {
                model: normalizedConfig.model,
                voice: normalizedConfig.voice,
                temperature: validTemperature,
                maxTokens: normalizedConfig.max_output_tokens,
                turnDetection: normalizedConfig.turn_detection,
                instructions: freshInstructions.substring(0, 100) + '...',
            });
            // First, configure the session
            jsonSend(session.modelConn, {
                type: "session.update",
                session: Object.assign({ model: normalizedConfig.model, voice: normalizedConfig.voice, instructions: freshInstructions, temperature: validTemperature, max_response_output_tokens: normalizedConfig.max_output_tokens || undefined, turn_detection: normalizedConfig.turn_detection, modalities: normalizedConfig.modalities, input_audio_transcription: {
                        model: 'whisper-1'
                    }, input_audio_format: "g711_ulaw", output_audio_format: "g711_ulaw", tool_choice: "auto", tools: normalizedConfig.toolsEnabled ? normalizedConfig.enabledToolsForTwilio : [] }, config),
            });
            // Then send initial greeting after a short delay
            console.log('🎤 Scheduling initial greeting for Twilio caller...');
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                if (isOpen(session.modelConn)) {
                    const agentName = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.name) || 'Assistant';
                    console.log(`🎤 Sending initial greeting as ${agentName}...`);
                    jsonSend(session.modelConn, {
                        type: "conversation.item.create",
                        item: {
                            type: "message",
                            role: "user",
                            content: [
                                {
                                    type: "input_text",
                                    text: `Hello ${agentName}, the call has started. Please greet the caller naturally and introduce yourself.`
                                }
                            ]
                        }
                    });
                    // Trigger a response to the greeting
                    jsonSend(session.modelConn, {
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"]
                        }
                    });
                }
            }), 2000); // Give session time to be fully configured
        }));
        session.modelConn.on("message", handleModelMessage);
        session.modelConn.on("error", closeModel);
        session.modelConn.on("close", closeModel);
    });
}
function createDatabaseSession(streamSid) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get the active agent configuration
            const agentConfig = yield (0, db_1.getActiveAgentConfig)();
            const configId = agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.id;
            // Create a unique session ID
            const sessionId = `twilio-${streamSid}-${Date.now()}`;
            // Create the database session
            const dbSessionId = yield (0, db_1.createSession)(sessionId, configId, streamSid);
            session.dbSessionId = dbSessionId;
            console.log('📝 Created database session:', { sessionId, dbSessionId, configId });
        }
        catch (error) {
            console.error('❌ Error creating database session:', error);
        }
    });
}
function saveUserMessage(item) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            if (!session.dbSessionId)
                return;
            // Extract text content from the message
            const content = ((_b = (_a = item.content) === null || _a === void 0 ? void 0 : _a.find((c) => c.type === "input_text")) === null || _b === void 0 ? void 0 : _b.text) ||
                ((_d = (_c = item.content) === null || _c === void 0 ? void 0 : _c.find((c) => c.type === "text")) === null || _d === void 0 ? void 0 : _d.text) ||
                JSON.stringify(item.content);
            yield (0, db_1.saveConversationMessage)(session.dbSessionId, 'user', content, session.streamSid, {
                item_id: item.id,
                role: item.role,
                content_type: (_e = item.content) === null || _e === void 0 ? void 0 : _e.map((c) => c.type).join(', ')
            }, undefined, false);
            console.log('💾 Saved user message to database:', { content: content.substring(0, 50) + '...' });
        }
        catch (error) {
            console.error('❌ Error saving user message:', error);
        }
    });
}
function saveAssistantMessage(item) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            if (!session.dbSessionId)
                return;
            // Extract text content from the message
            const content = ((_b = (_a = item.content) === null || _a === void 0 ? void 0 : _a.find((c) => c.type === "text")) === null || _b === void 0 ? void 0 : _b.text) ||
                ((_d = (_c = item.content) === null || _c === void 0 ? void 0 : _c.find((c) => c.type === "output_text")) === null || _d === void 0 ? void 0 : _d.text) ||
                JSON.stringify(item.content);
            yield (0, db_1.saveConversationMessage)(session.dbSessionId, 'assistant', content, session.streamSid, {
                item_id: item.id,
                role: item.role,
                content_type: (_e = item.content) === null || _e === void 0 ? void 0 : _e.map((c) => c.type).join(', ')
            }, undefined, false);
            console.log('💾 Saved assistant message to database:', { content: content.substring(0, 50) + '...' });
        }
        catch (error) {
            console.error('❌ Error saving assistant message:', error);
        }
    });
}
function handleModelMessage(data) {
    const event = parseMessage(data);
    if (!event)
        return;
    jsonSend(session.frontendConn, event);
    switch (event.type) {
        case "input_audio_buffer.speech_started":
            handleTruncation();
            break;
        case "response.audio.delta":
            if (session.twilioConn && session.streamSid) {
                if (session.responseStartTimestamp === undefined) {
                    session.responseStartTimestamp = session.latestMediaTimestamp || 0;
                }
                if (event.item_id)
                    session.lastAssistantItem = event.item_id;
                jsonSend(session.twilioConn, {
                    event: "media",
                    streamSid: session.streamSid,
                    media: { payload: event.delta },
                });
                jsonSend(session.twilioConn, {
                    event: "mark",
                    streamSid: session.streamSid,
                });
            }
            break;
        case "conversation.item.created":
            // Save user messages to database
            if (event.item && event.item.role === "user" && session.dbSessionId) {
                saveUserMessage(event.item).catch(console.error);
            }
            break;
        case "response.output_item.done": {
            const { item } = event;
            // Save assistant messages to database
            if (item && item.role === "assistant" && session.dbSessionId) {
                saveAssistantMessage(item).catch(console.error);
            }
            if (item.type === "function_call") {
                handleFunctionCall(item)
                    .then((output) => {
                    if (session.modelConn) {
                        jsonSend(session.modelConn, {
                            type: "conversation.item.create",
                            item: {
                                type: "function_call_output",
                                call_id: item.call_id,
                                output: JSON.stringify(output),
                            },
                        });
                        jsonSend(session.modelConn, { type: "response.create" });
                    }
                })
                    .catch((err) => {
                    console.error("Error handling function call:", err);
                });
            }
            break;
        }
    }
}
function handleTruncation() {
    if (!session.lastAssistantItem ||
        session.responseStartTimestamp === undefined)
        return;
    const elapsedMs = (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
    const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;
    if (isOpen(session.modelConn)) {
        jsonSend(session.modelConn, {
            type: "conversation.item.truncate",
            item_id: session.lastAssistantItem,
            content_index: 0,
            audio_end_ms,
        });
    }
    if (session.twilioConn && session.streamSid) {
        jsonSend(session.twilioConn, {
            event: "clear",
            streamSid: session.streamSid,
        });
    }
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
}
function closeModel() {
    cleanupConnection(session.modelConn);
    session.modelConn = undefined;
    if (!session.twilioConn && !session.frontendConn)
        session = {};
}
function closeAllConnections() {
    if (session.twilioConn) {
        session.twilioConn.close();
        session.twilioConn = undefined;
    }
    if (session.modelConn) {
        session.modelConn.close();
        session.modelConn = undefined;
    }
    if (session.frontendConn) {
        session.frontendConn.close();
        session.frontendConn = undefined;
    }
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    session.saved_config = undefined;
}
function cleanupConnection(ws) {
    if (isOpen(ws))
        ws.close();
}
function parseMessage(data) {
    try {
        return JSON.parse(data.toString());
    }
    catch (_a) {
        return null;
    }
}
function jsonSend(ws, obj) {
    if (!isOpen(ws))
        return;
    ws.send(JSON.stringify(obj));
}
function isOpen(ws) {
    return !!ws && ws.readyState === ws_1.WebSocket.OPEN;
}
