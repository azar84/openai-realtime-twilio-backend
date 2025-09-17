import express, { Request, Response, RequestHandler } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import dotenv from "dotenv";
import http from "http";
import { readFileSync } from "fs";
import { join } from "path";
import cors from "cors";
import {
  handleCallConnection,
  handleFrontendConnection,
} from "./twilio-handler";
// agentTools import removed - using dynamic tool loading instead
import { 
  testConnection, 
  getAllAgentConfigs, 
  getAgentConfigById,
  createAgentConfig, 
  updateAgentConfig, 
  deleteAgentConfig, 
  activateAgentConfig, 
  getPersonalityOptions,
  createPersonalityOption,
  updatePersonalityOption,
  deletePersonalityOption,
  getLanguages,
  getToolConfigurations,
  updateToolConfiguration,
  getToolConfigurationsAsObject,
  saveConversationMessage,
  getConversationMessages,
  getSessionWithMessages,
  getAllSessions,
  createSession,
  updateSessionStatus
} from "./db";
import { getEphemeralKey } from "./ephemeral";
import agentInstructions from "./agent-instructions";

dotenv.config();

const PORT = parseInt(process.env.PORT || "8081", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Add ephemeral key endpoint
app.get('/api/ephemeral', async (req, res) => {
  await getEphemeralKey(req, res);
});

// Add agent instructions endpoint
app.get('/api/agent-instructions', async (req, res) => {
  try {
    const instructions = await agentInstructions();
    res.json({ instructions });
  } catch (error) {
    console.error('Error getting agent instructions:', error);
    res.status(500).json({ error: 'Failed to get agent instructions' });
  }
});

// Add agent instructions for specific configuration endpoint
app.get('/api/agent-instructions/:configId', async (req, res) => {
  try {
    const configId = parseInt(req.params.configId);
    const instructions = await agentInstructions(configId);
    res.json({ instructions });
  } catch (error) {
    console.error('Error getting agent instructions for config:', error);
    res.status(500).json({ error: 'Failed to get agent instructions' });
  }
});

// Configuration management endpoints
app.get('/api/configurations', async (req, res) => {
  try {
    const configs = await getAllAgentConfigs();
    res.json(configs);
  } catch (error) {
    console.error('Error fetching configurations:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

app.post('/api/configurations', async (req, res) => {
  try {
    const configData = req.body;
    const newConfig = await createAgentConfig(configData);
    res.json(newConfig);
  } catch (error) {
    console.error('Error creating configuration:', error);
    res.status(500).json({ error: 'Failed to create configuration' });
  }
});

app.put('/api/configurations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const configData = req.body;
    
    console.log('=== PUT /api/configurations/:id ===');
    console.log('ID:', id);
    console.log('Config Data:', JSON.stringify(configData, null, 2));
    console.log('About to call updateAgentConfig...');
    
    const updatedConfig = await updateAgentConfig(id, configData);
    console.log('Update successful! Result:', JSON.stringify(updatedConfig, null, 2));
    
    res.json(updatedConfig);
  } catch (error) {
    console.error('=== ERROR in PUT /api/configurations/:id ===');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Full error object:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

app.delete('/api/configurations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteAgentConfig(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

app.post('/api/configurations/:id/activate', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await activateAgentConfig(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error activating configuration:', error);
    res.status(500).json({ error: 'Failed to activate configuration' });
  }
});

app.get('/api/personality-options', async (req, res) => {
  try {
    const options = await getPersonalityOptions();
    res.json(options);
  } catch (error) {
    console.error('Error fetching personality options:', error);
    res.status(500).json({ error: 'Failed to fetch personality options' });
  }
});

app.post('/api/personality-options', async (req, res) => {
  try {
    const optionData = req.body;
    const newOption = await createPersonalityOption(optionData);
    res.json(newOption);
  } catch (error) {
    console.error('Error creating personality option:', error);
    res.status(500).json({ error: 'Failed to create personality option' });
  }
});

app.put('/api/personality-options/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const optionData = req.body;
    const updatedOption = await updatePersonalityOption(id, optionData);
    res.json(updatedOption);
  } catch (error) {
    console.error('Error updating personality option:', error);
    res.status(500).json({ error: 'Failed to update personality option' });
  }
});

app.delete('/api/personality-options/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deletePersonalityOption(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting personality option:', error);
    res.status(500).json({ error: 'Failed to delete personality option' });
  }
});

app.get('/api/languages', async (req, res) => {
  try {
    const languages = await getLanguages();
    res.json(languages);
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

// Tool Configuration endpoints
app.put('/api/tool-configurations/:toolName/:configKey', (async (req, res) => {
  try {
    const { toolName, configKey } = req.params;
    const { configValue } = req.body;
    
    if (!configValue) {
      return res.status(400).json({ error: 'configValue is required' });
    }
    
    const result = await updateToolConfiguration(toolName, configKey, configValue);
    res.json(result);
  } catch (error) {
    console.error('Error updating tool configuration:', error);
    res.status(500).json({ error: 'Failed to update tool configuration' });
  }
}) as RequestHandler);

app.get('/api/tool-configurations', async (req, res) => {
  try {
    const { toolName } = req.query;
    const configurations = await getToolConfigurations(toolName as string);
    res.json(configurations);
  } catch (error) {
    console.error('Error fetching tool configurations:', error);
    res.status(500).json({ error: 'Failed to fetch tool configurations' });
  }
});

app.get('/api/tool-configurations/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const configurations = await getToolConfigurationsAsObject(toolName);
    res.json(configurations);
  } catch (error) {
    console.error('Error fetching tool configurations:', error);
    res.status(500).json({ error: 'Failed to fetch tool configurations' });
  }
});

const twimlPath = join(__dirname, "twiml.xml");
const twimlTemplate = readFileSync(twimlPath, "utf-8");

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
app.get("/tools", async (req, res) => {
  try {
    const { getAvailableToolNames, TOOL_REGISTRY } = await import('./agent-tools');
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
  } catch (error) {
    console.error('Error fetching available tools:', error);
    res.status(500).json({ error: 'Failed to fetch available tools' });
  }
});

// API endpoint for tools (same as /tools but under /api prefix)
app.get("/api/tools", async (req, res) => {
  try {
    const { getAvailableToolNames, TOOL_REGISTRY } = await import('./agent-tools');
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
  } catch (error) {
    console.error('Error fetching available tools:', error);
    res.status(500).json({ error: 'Failed to fetch available tools' });
  }
});

// API endpoint for function call execution (for WebRTC)
app.post("/api/function-call", (async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Function name is required' });
    }
    
    console.log(`🔧 WebRTC Function call: ${name}`, args);
    
    // Get the tool from our registry
    const { TOOL_REGISTRY } = await import('./agent-tools');
    const tool = TOOL_REGISTRY[name];
    
    if (!tool) {
      return res.status(404).json({ error: `Function '${name}' not found` });
    }
    
    // Parse arguments if they're a string
    let parsedArgs;
    try {
      parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid function arguments' });
    }
    
    // Execute the function
    const result = await tool.handler(parsedArgs);
    
    console.log(`✅ WebRTC Function result:`, result);
    res.send(result);
  } catch (error) {
    console.error('Error executing function call:', error);
    res.status(500).json({ error: 'Function execution failed' });
  }
}) as RequestHandler);

// Note: reload configuration endpoint is disabled in baseline restore

let currentCall: WebSocket | null = null;
let currentLogs: WebSocket | null = null;
let currentWebRTC: WebSocket | null = null;

// Function to broadcast to logs WebSocket
function broadcastToLogs(message: any) {
  if (currentLogs && currentLogs.readyState === WebSocket.OPEN) {
    currentLogs.send(JSON.stringify(message));
  }
}

// Function to handle WebRTC connection
function handleWebRTCConnection(ws: WebSocket) {
  console.log("🔌 WebRTC WebSocket connected");
  
  ws.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("📨 WebRTC message received:", message.type);
      
      switch (message.type) {
        case "transcript":
          await handleWebRTCTranscript(message);
          break;
        case "session_start":
          await handleWebRTCSessionStart(message);
          break;
        case "session_end":
          await handleWebRTCSessionEnd(message);
          break;
        default:
          console.log("🔍 Unknown WebRTC message type:", message.type);
      }
    } catch (error) {
      console.error("❌ Error processing WebRTC message:", error);
    }
  });
  
  ws.on("close", () => {
    console.log("🔌 WebRTC WebSocket disconnected");
    if (currentWebRTC === ws) {
      currentWebRTC = null;
    }
  });
  
  ws.on("error", (error) => {
    console.error("❌ WebRTC WebSocket error:", error);
  });
}

// Handle WebRTC transcript messages
async function handleWebRTCTranscript(message: any) {
  try {
    const { sessionId, text, isUser, metadata } = message;
    
    if (!sessionId) {
      console.error("❌ No session ID provided for WebRTC transcript");
      return;
    }
    
    console.log("📝 Saving WebRTC transcript:", { 
      sessionId, 
      text: text.substring(0, 50) + '...', 
      isUser 
    });
    
    const messageId = await saveConversationMessage(
      sessionId,
      isUser ? 'user' : 'assistant',
      text,
      undefined, // streamSid
      { ...metadata, source: 'webrtc' },
      undefined, // audioDurationMs
      false  // isAudio
    );
    
    console.log("✅ Saved WebRTC message:", messageId);
  } catch (error) {
    console.error("❌ Error saving WebRTC transcript:", error);
  }
}

// Handle WebRTC session start
async function handleWebRTCSessionStart(message: any) {
  try {
    const { sessionId, configId } = message;
    
    console.log("🚀 WebRTC session started:", { sessionId, configId });
    
    // Session should already be created by frontend, just log it
    console.log("✅ WebRTC session active:", sessionId);
  } catch (error) {
    console.error("❌ Error handling WebRTC session start:", error);
  }
}

// Handle WebRTC session end
async function handleWebRTCSessionEnd(message: any) {
  try {
    const { sessionId } = message;
    
    console.log("🏁 WebRTC session ended:", sessionId);
    
    if (sessionId) {
      await updateSessionStatus(sessionId, 'ended');
      console.log("✅ Updated WebRTC session status to ended");
    }
  } catch (error) {
    console.error("❌ Error handling WebRTC session end:", error);
  }
}

// Make broadcastToLogs available globally
(global as any).broadcastToLogs = broadcastToLogs;

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
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
      if (currentCall) currentCall.close();
      currentCall = ws;
      await handleCallConnection(currentCall, OPENAI_API_KEY);
    } else if (type === "logs") {
      if (currentLogs) currentLogs.close();
      currentLogs = ws;
      handleFrontendConnection(currentLogs);
    } else if (type === "webrtc") {
      if (currentWebRTC) currentWebRTC.close();
      currentWebRTC = ws;
      handleWebRTCConnection(currentWebRTC);
    } else {
      ws.close();
    }
  } catch (error) {
    console.error(`Error handling ${type} connection:`, error);
    ws.close();
  }
});

server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Test database connection
  await testConnection();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Sessions endpoints
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { session_id, config_id, twilio_stream_sid } = req.body;
    const dbSessionId = await createSession(session_id, config_id, twilio_stream_sid);
    res.json({ id: dbSessionId, success: true });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Conversation Messages endpoints
app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const messages = await getConversationMessages(sessionId);
    res.json(messages);
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    res.status(500).json({ error: 'Failed to get conversation messages' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const sessionWithMessages = await getSessionWithMessages(sessionId);
    res.json(sessionWithMessages);
  } catch (error) {
    console.error('Error getting session with messages:', error);
    res.status(500).json({ error: 'Failed to get session with messages' });
  }
});

app.post('/api/sessions/:id/messages', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { messageType, content, streamSid, metadata, audioDurationMs, isAudio } = req.body;
    
    const messageId = await saveConversationMessage(
      sessionId,
      messageType,
      content,
      streamSid,
      metadata,
      audioDurationMs,
      isAudio || false
    );
    
    res.json({ id: messageId, success: true });
  } catch (error) {
    console.error('Error saving conversation message:', error);
    res.status(500).json({ error: 'Failed to save conversation message' });
  }
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
