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
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const fs_1 = require("fs");
const path_1 = require("path");
const cors_1 = __importDefault(require("cors"));
const twilio_handler_1 = require("./twilio-handler");
// agentTools import removed - using dynamic tool loading instead
const db_1 = require("./db");
const ephemeral_1 = require("./ephemeral");
const agent_instructions_1 = __importDefault(require("./agent-instructions"));
dotenv_1.default.config();
const PORT = parseInt(process.env.PORT || "8081", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY environment variable is required");
    process.exit(1);
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json()); // Parse JSON request bodies
app.use(express_1.default.urlencoded({ extended: false }));
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
// Add ephemeral key endpoint
app.get('/api/ephemeral', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, ephemeral_1.getEphemeralKey)(req, res);
}));
// Add agent instructions endpoint
app.get('/api/agent-instructions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const instructions = yield (0, agent_instructions_1.default)();
        res.json({ instructions });
    }
    catch (error) {
        console.error('Error getting agent instructions:', error);
        res.status(500).json({ error: 'Failed to get agent instructions' });
    }
}));
// Add agent instructions for specific configuration endpoint
app.get('/api/agent-instructions/:configId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const configId = parseInt(req.params.configId);
        const instructions = yield (0, agent_instructions_1.default)(configId);
        res.json({ instructions });
    }
    catch (error) {
        console.error('Error getting agent instructions for config:', error);
        res.status(500).json({ error: 'Failed to get agent instructions' });
    }
}));
// Configuration management endpoints
app.get('/api/configurations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const configs = yield (0, db_1.getAllAgentConfigs)();
        res.json(configs);
    }
    catch (error) {
        console.error('Error fetching configurations:', error);
        res.status(500).json({ error: 'Failed to fetch configurations' });
    }
}));
app.post('/api/configurations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const configData = req.body;
        const newConfig = yield (0, db_1.createAgentConfig)(configData);
        res.json(newConfig);
    }
    catch (error) {
        console.error('Error creating configuration:', error);
        res.status(500).json({ error: 'Failed to create configuration' });
    }
}));
app.put('/api/configurations/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id);
        const configData = req.body;
        console.log('=== PUT /api/configurations/:id ===');
        console.log('ID:', id);
        console.log('Config Data:', JSON.stringify(configData, null, 2));
        console.log('About to call updateAgentConfig...');
        const updatedConfig = yield (0, db_1.updateAgentConfig)(id, configData);
        console.log('Update successful! Result:', JSON.stringify(updatedConfig, null, 2));
        res.json(updatedConfig);
    }
    catch (error) {
        console.error('=== ERROR in PUT /api/configurations/:id ===');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Full error object:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
}));
app.delete('/api/configurations/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id);
        yield (0, db_1.deleteAgentConfig)(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting configuration:', error);
        res.status(500).json({ error: 'Failed to delete configuration' });
    }
}));
app.post('/api/configurations/:id/activate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id);
        yield (0, db_1.activateAgentConfig)(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error activating configuration:', error);
        res.status(500).json({ error: 'Failed to activate configuration' });
    }
}));
app.get('/api/personality-options', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const options = yield (0, db_1.getPersonalityOptions)();
        res.json(options);
    }
    catch (error) {
        console.error('Error fetching personality options:', error);
        res.status(500).json({ error: 'Failed to fetch personality options' });
    }
}));
app.post('/api/personality-options', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const optionData = req.body;
        const newOption = yield (0, db_1.createPersonalityOption)(optionData);
        res.json(newOption);
    }
    catch (error) {
        console.error('Error creating personality option:', error);
        res.status(500).json({ error: 'Failed to create personality option' });
    }
}));
app.put('/api/personality-options/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id);
        const optionData = req.body;
        const updatedOption = yield (0, db_1.updatePersonalityOption)(id, optionData);
        res.json(updatedOption);
    }
    catch (error) {
        console.error('Error updating personality option:', error);
        res.status(500).json({ error: 'Failed to update personality option' });
    }
}));
app.delete('/api/personality-options/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id);
        yield (0, db_1.deletePersonalityOption)(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting personality option:', error);
        res.status(500).json({ error: 'Failed to delete personality option' });
    }
}));
app.get('/api/languages', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const languages = yield (0, db_1.getLanguages)();
        res.json(languages);
    }
    catch (error) {
        console.error('Error fetching languages:', error);
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
}));
// Tool Configuration endpoints
app.put('/api/tool-configurations/:toolName/:configKey', ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { toolName, configKey } = req.params;
        const { configValue } = req.body;
        if (!configValue) {
            return res.status(400).json({ error: 'configValue is required' });
        }
        const result = yield (0, db_1.updateToolConfiguration)(toolName, configKey, configValue);
        res.json(result);
    }
    catch (error) {
        console.error('Error updating tool configuration:', error);
        res.status(500).json({ error: 'Failed to update tool configuration' });
    }
})));
app.get('/api/tool-configurations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { toolName } = req.query;
        const configurations = yield (0, db_1.getToolConfigurations)(toolName);
        res.json(configurations);
    }
    catch (error) {
        console.error('Error fetching tool configurations:', error);
        res.status(500).json({ error: 'Failed to fetch tool configurations' });
    }
}));
app.get('/api/tool-configurations/:toolName', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { toolName } = req.params;
        const configurations = yield (0, db_1.getToolConfigurationsAsObject)(toolName);
        res.json(configurations);
    }
    catch (error) {
        console.error('Error fetching tool configurations:', error);
        res.status(500).json({ error: 'Failed to fetch tool configurations' });
    }
}));
const twimlPath = (0, path_1.join)(__dirname, "twiml.xml");
const twimlTemplate = (0, fs_1.readFileSync)(twimlPath, "utf-8");
app.get("/public-url", (req, res) => {
    res.json({ publicUrl: PUBLIC_URL });
});
app.all("/twiml", (req, res) => {
    const wsUrl = new URL(PUBLIC_URL);
    wsUrl.protocol = "wss:";
    wsUrl.pathname = `/call`;
    const twimlContent = twimlTemplate.replace("{{WS_URL}}", wsUrl.toString());
    res.type("text/xml").send(twimlContent);
});
// New endpoint to list available tools (schemas)
app.get("/tools", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getAvailableToolNames, TOOL_REGISTRY } = yield Promise.resolve().then(() => __importStar(require('./agent-tools')));
        const toolNames = getAvailableToolNames();
        // Return simple tool info without loading the actual tools
        const tools = toolNames.map(name => {
            const tool = TOOL_REGISTRY[name];
            return {
                name: tool.schema.name,
                description: tool.schema.description,
                parameters: tool.schema.parameters
            };
        });
        res.json(tools);
    }
    catch (error) {
        console.error('Error fetching available tools:', error);
        res.status(500).json({ error: 'Failed to fetch available tools' });
    }
}));
// API endpoint for tools (same as /tools but under /api prefix)
app.get("/api/tools", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getAvailableToolNames, TOOL_REGISTRY } = yield Promise.resolve().then(() => __importStar(require('./agent-tools')));
        const toolNames = getAvailableToolNames();
        // Return simple tool info without loading the actual tools
        const tools = toolNames.map(name => {
            const tool = TOOL_REGISTRY[name];
            return {
                name: tool.schema.name,
                description: tool.schema.description,
                parameters: tool.schema.parameters
            };
        });
        res.json(tools);
    }
    catch (error) {
        console.error('Error fetching available tools:', error);
        res.status(500).json({ error: 'Failed to fetch available tools' });
    }
}));
// API endpoint for function call execution (for WebRTC)
app.post("/api/function-call", ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, arguments: args } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Function name is required' });
        }
        console.log(`🔧 WebRTC Function call: ${name}`, args);
        // Get the tool from our registry
        const { TOOL_REGISTRY } = yield Promise.resolve().then(() => __importStar(require('./agent-tools')));
        const tool = TOOL_REGISTRY[name];
        if (!tool) {
            return res.status(404).json({ error: `Function '${name}' not found` });
        }
        // Parse arguments if they're a string
        let parsedArgs;
        try {
            parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        }
        catch (e) {
            return res.status(400).json({ error: 'Invalid function arguments' });
        }
        // Execute the function
        const result = yield tool.handler(parsedArgs);
        console.log(`✅ WebRTC Function result:`, result);
        res.send(result);
    }
    catch (error) {
        console.error('Error executing function call:', error);
        res.status(500).json({ error: 'Function execution failed' });
    }
})));
// Note: reload configuration endpoint is disabled in baseline restore
let currentCall = null;
let currentLogs = null;
// Function to broadcast to logs WebSocket
function broadcastToLogs(message) {
    if (currentLogs && currentLogs.readyState === ws_1.WebSocket.OPEN) {
        currentLogs.send(JSON.stringify(message));
    }
}
// Make broadcastToLogs available globally
global.broadcastToLogs = broadcastToLogs;
wss.on("connection", (ws, req) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🔌 NEW WEBSOCKET CONNECTION:", req.url);
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 1) {
        ws.close();
        return;
    }
    const type = parts[0];
    try {
        if (type === "call") {
            if (currentCall)
                currentCall.close();
            currentCall = ws;
            yield (0, twilio_handler_1.handleCallConnection)(currentCall, OPENAI_API_KEY);
        }
        else if (type === "logs") {
            if (currentLogs)
                currentLogs.close();
            currentLogs = ws;
            (0, twilio_handler_1.handleFrontendConnection)(currentLogs);
        }
        else {
            ws.close();
        }
    }
    catch (error) {
        console.error(`Error handling ${type} connection:`, error);
        ws.close();
    }
}));
server.listen(PORT, () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`Server running on http://localhost:${PORT}`);
    // Test database connection
    yield (0, db_1.testConnection)();
}));
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
// Sessions endpoints
app.get('/api/sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessions = yield (0, db_1.getAllSessions)();
        res.json(sessions);
    }
    catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ error: 'Failed to get sessions' });
    }
}));
// Conversation Messages endpoints
app.get('/api/sessions/:id/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = parseInt(req.params.id);
        const messages = yield (0, db_1.getConversationMessages)(sessionId);
        res.json(messages);
    }
    catch (error) {
        console.error('Error getting conversation messages:', error);
        res.status(500).json({ error: 'Failed to get conversation messages' });
    }
}));
app.get('/api/sessions/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = parseInt(req.params.id);
        const sessionWithMessages = yield (0, db_1.getSessionWithMessages)(sessionId);
        res.json(sessionWithMessages);
    }
    catch (error) {
        console.error('Error getting session with messages:', error);
        res.status(500).json({ error: 'Failed to get session with messages' });
    }
}));
app.post('/api/sessions/:id/messages', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = parseInt(req.params.id);
        const { messageType, content, streamSid, metadata, audioDurationMs, isAudio } = req.body;
        const messageId = yield (0, db_1.saveConversationMessage)(sessionId, messageType, content, streamSid, metadata, audioDurationMs, isAudio || false);
        res.json({ id: messageId, success: true });
    }
    catch (error) {
        console.error('Error saving conversation message:', error);
        res.status(500).json({ error: 'Failed to save conversation message' });
    }
}));
process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
