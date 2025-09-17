import { RawData, WebSocket } from "ws";
import functions from "./functionHandlers";
import { getActiveAgentConfig, saveConversationMessage, createSession, updateSessionStatus } from "./db";
import { normalizeConfig } from "./agent-config-mapper";
import agentInstructions from "./agent-instructions";

interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  modelConn?: WebSocket;
  streamSid?: string;
  saved_config?: any;
  lastAssistantItem?: string;
  lastUserItem?: any; // Track the last user item for transcription completion
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  openAIApiKey?: string;
  dbSessionId?: number; // Database session ID for saving messages
}

let session: Session = {};

export function handleCallConnection(ws: WebSocket, openAIApiKey: string) {
  // Clean up any existing connections and reset session
  closeAllConnections();
  
  // Initialize fresh session for new call
  session.twilioConn = ws;
  session.openAIApiKey = openAIApiKey;
  session.streamSid = undefined;
  session.lastAssistantItem = undefined;
  session.lastUserItem = undefined;
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
    if (!session.frontendConn) session = {};
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(session.frontendConn);
  session.frontendConn = ws;

  ws.on("message", handleFrontendMessage);
  ws.on("close", () => {
    cleanupConnection(session.frontendConn);
    session.frontendConn = undefined;
    if (!session.twilioConn && !session.modelConn) session = {};
  });
}

async function handleFunctionCall(item: { name: string; arguments: string }) {
  console.log("Handling function call:", item);
  
  try {
    // Get the tool from our registry
    const { TOOL_REGISTRY } = await import('./agent-tools');
    const tool = TOOL_REGISTRY[item.name];
    
    if (!tool) {
      throw new Error(`No handler found for function: ${item.name}`);
    }

    let args: unknown;
    try {
      args = JSON.parse(item.arguments);
    } catch {
      return JSON.stringify({
        error: "Invalid JSON arguments for function call.",
      });
    }

    console.log("Calling function:", tool.schema.name, args);
    const sessionContext = { streamSid: session.streamSid };
    const result = await tool.handler(args as any, sessionContext);
    return result;
  } catch (err: any) {
    console.error("Error running function:", err);
    return JSON.stringify({
      error: `Error running function ${item.name}: ${err.message}`,
    });
  }
}

function handleTwilioMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

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
        updateSessionStatus(session.dbSessionId, 'ended').catch(console.error);
      }
      closeAllConnections();
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, msg);
  }

  if (msg.type === "session.update") {
    session.saved_config = msg.session;
  }
}

async function tryConnectModel() {
  if (!session.twilioConn || !session.streamSid || !session.openAIApiKey)
    return;
  if (isOpen(session.modelConn)) return;

  // Get the model from database configuration
  const agentConfig = await getActiveAgentConfig();
  const model = agentConfig?.model || 'gpt-4o-realtime-preview-2024-12-17';
  
  console.log('🔗 Connecting Twilio to OpenAI with model:', model);

  session.modelConn = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${model}`,
    {
      headers: {
        Authorization: `Bearer ${session.openAIApiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  session.modelConn.on("open", async () => {
    const config = session.saved_config || {};
    
    // Get agent configuration from database
    console.log('🔍 Fetching agent configuration for Twilio...');
    const agentConfig = await getActiveAgentConfig();
    if (!agentConfig) {
      console.error('❌ No active agent configuration found for Twilio');
      return;
    }
    
    // Normalize config and get fresh template-based instructions (same as WebRTC)
    const normalizedConfig = await normalizeConfig(agentConfig);
    console.log('📝 Generating fresh instructions from template for Twilio...');
    const freshInstructions = await agentInstructions();
    
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
      session: {
        model: normalizedConfig.model,
        voice: normalizedConfig.voice,
        instructions: freshInstructions,
        temperature: validTemperature,
        max_response_output_tokens: normalizedConfig.max_output_tokens || undefined,
        turn_detection: normalizedConfig.turn_detection,
        modalities: normalizedConfig.modalities,
        input_audio_transcription: { 
          model: 'whisper-1'
        },
        input_audio_format: "g711_ulaw", // Twilio uses g711_ulaw
        output_audio_format: "g711_ulaw", // Twilio uses g711_ulaw
        tool_choice: "auto", // or "required" if you want to force tool calls or auto
        tools: normalizedConfig.toolsEnabled ? normalizedConfig.enabledToolsForTwilio : [],
        ...config,
      },
    });
    
    // Then send initial greeting after a short delay
    console.log('🎤 Scheduling initial greeting for Twilio caller...');
    setTimeout(async () => {
      if (isOpen(session.modelConn)) {
        const agentName = agentConfig?.name || 'Assistant';
        
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
    }, 2000); // Give session time to be fully configured
  });

  session.modelConn.on("message", handleModelMessage);
  session.modelConn.on("error", closeModel);
  session.modelConn.on("close", closeModel);
}

async function createDatabaseSession(streamSid: string) {
  try {
    // Get the active agent configuration
    const agentConfig = await getActiveAgentConfig();
    const configId = agentConfig?.id;
    
    // Create a unique session ID
    const sessionId = `twilio-${streamSid}-${Date.now()}`;
    
    // Create the database session
    const dbSessionId = await createSession(sessionId, configId, streamSid);
    session.dbSessionId = dbSessionId;
    
    console.log('📝 Created database session:', { sessionId, dbSessionId, configId });
  } catch (error) {
    console.error('❌ Error creating database session:', error);
  }
}

async function saveUserMessage(item: any) {
  try {
    console.log('🔍 saveUserMessage called with:', { 
      item_id: item.id, 
      transcript: item.transcript, 
      content: item.content,
      dbSessionId: session.dbSessionId 
    });
    
    if (!session.dbSessionId) {
      console.log('❌ No dbSessionId, cannot save user message');
      return;
    }
    
    // Extract text content from the message
    let content = '';
    
    // For input_audio_transcription.completed events, the transcript is directly available
    if (item.transcript) {
      content = item.transcript;
      console.log('📝 Using transcript as content:', content);
    } else {
      // Fallback to content extraction for other message types
      content = item.content?.find((c: any) => c.type === "input_text")?.text || 
                item.content?.find((c: any) => c.type === "text")?.text || 
                JSON.stringify(item.content);
      console.log('📝 Using fallback content:', content);
    }
    
    // Don't save if content is empty or just JSON with no meaningful content
    if (!content || content === 'null' || content === '""' || content === '[]') {
      console.log('⚠️ Skipping user message with no meaningful content:', { item_id: item.id, content });
      return;
    }
    
    await saveConversationMessage(
      session.dbSessionId,
      'user',
      content,
      session.streamSid,
      { 
        item_id: item.id,
        role: item.role,
        content_type: item.content?.map((c: any) => c.type).join(', ') || 'transcript',
        transcript: item.transcript || null
      },
      undefined,
      false
    );
    
    console.log('💾 Saved user message to database:', { content: content.substring(0, 50) + '...', transcript: !!item.transcript });
  } catch (error) {
    console.error('❌ Error saving user message:', error);
  }
}

async function saveAssistantMessage(item: any) {
  try {
    if (!session.dbSessionId) return;
    
    // Extract text content from the message
    const content = item.content?.find((c: any) => c.type === "text")?.text || 
                   item.content?.find((c: any) => c.type === "output_text")?.text || 
                   JSON.stringify(item.content);
    
    await saveConversationMessage(
      session.dbSessionId,
      'assistant',
      content,
      session.streamSid,
      { 
        item_id: item.id,
        role: item.role,
        content_type: item.content?.map((c: any) => c.type).join(', ')
      },
      undefined,
      false
    );
    
    console.log('💾 Saved assistant message to database:', { content: content.substring(0, 50) + '...' });
  } catch (error) {
    console.error('❌ Error saving assistant message:', error);
  }
}

function handleModelMessage(data: RawData) {
  const event = parseMessage(data);
  if (!event) return;

  jsonSend(session.frontendConn, event);

  // Log all conversation-related events for debugging
  if (event.type.includes('conversation.item') || event.type.includes('input_audio')) {
    const logData = {
      type: event.type,
      item_id: event.item?.id, 
      role: event.item?.role,
      transcript: event.item?.transcript,
      content: event.item?.content?.map((c: any) => c.type)
    };
    console.log('🔍 Event received:', JSON.stringify(logData, null, 2));
    
    // Also write to a log file for debugging
    const fs = require('fs');
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(logData)}\n`;
    fs.appendFileSync('debug-events.log', logEntry);
  }

  switch (event.type) {
    case "input_audio_buffer.speech_started":
      handleTruncation();
      break;

    case "response.audio.delta":
      if (session.twilioConn && session.streamSid) {
        if (session.responseStartTimestamp === undefined) {
          session.responseStartTimestamp = session.latestMediaTimestamp || 0;
        }
        if (event.item_id) session.lastAssistantItem = event.item_id;

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
      // Save user messages if they have text content (not just audio input)
      console.log('📝 Conversation item created:', { 
        item_id: event.item?.id, 
        role: event.item?.role, 
        content_types: event.item?.content?.map((c: any) => c.type) 
      });
      
      if (event.item && event.item.role === "user" && session.dbSessionId) {
        // Track the last user item for transcription completion
        session.lastUserItem = event.item;
        
        // Check if this has actual text content (not just input_audio)
        const hasTextContent = event.item.content?.some((c: any) => 
          c.type === "input_text" || c.type === "text"
        );
        
        if (hasTextContent) {
          console.log('💬 Saving user text message from item.created');
          saveUserMessage(event.item).catch(console.error);
        } else {
          console.log('🎤 User audio input - waiting for transcription completion');
        }
      }
      break;

    case "conversation.item.input_audio_transcription.completed":
      // Save user messages when transcription is completed
      console.log('🎤 Audio transcription completed - Full event:', JSON.stringify(event, null, 2));
      
      // The transcription completed event contains the transcript and item_id
      if (session.dbSessionId && event.transcript && event.item_id) {
        console.log('💾 Attempting to save user message to database...');
        
        // Create a message object with the transcript from the completed event
        const messageToSave = {
          id: event.item_id,
          role: 'user',
          transcript: event.transcript,
          content: [{ type: 'input_audio', transcript: event.transcript }]
        };
        
        console.log('📝 Saving user message with transcript:', messageToSave);
        saveUserMessage(messageToSave).catch((error) => {
          console.error('❌ Error saving user message:', error);
        });
      } else {
        console.log('⚠️ Missing required data for transcription completion:', {
          hasDbSession: !!session.dbSessionId,
          hasTranscript: !!event.transcript,
          hasItemId: !!event.item_id
        });
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
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  )
    return;

  const elapsedMs =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
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
  if (!session.twilioConn && !session.frontendConn) session = {};
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

function cleanupConnection(ws?: WebSocket) {
  if (isOpen(ws)) ws.close();
}

function parseMessage(data: RawData): any {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!isOpen(ws)) return;
  ws.send(JSON.stringify(obj));
}

function isOpen(ws?: WebSocket): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
