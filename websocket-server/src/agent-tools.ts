import { FunctionHandler } from './types';
import { getToolConfigurationsAsObject } from './db';
import OpenAI from 'openai';

// ============================================================================
// UNIFIED TOOL SYSTEM - Works for both Twilio and WebRTC
// ============================================================================

// Knowledge Base Tool (FunctionHandler format)
const knowledgeBaseTool: FunctionHandler = {
  schema: {
    name: 'knowledge_base',
    type: 'function',
    description: 'Search the company knowledge base for information about products, services, policies, and procedures. Use this first before saying you don\'t have information.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find information in the knowledge base'
        }
      },
      required: ['query']
    }
  },
  handler: async ({ query }: { query: string }, sessionContext?: { streamSid?: string }) => {
    console.log(`🔍 Knowledge Base Tool Called with query: "${query}"`);
    
    try {
      // Initialize OpenAI client here to ensure environment variables are loaded
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      const r = await client.responses.create({
        model: "gpt-4o-mini",
        input: `Answer with citations: ${query}`,
        tools: [{ type: "file_search", vector_store_ids: ["vs_68c5858c715c8191b6833a03279a0623"]}],
        include: ["file_search_call.results"]
      });
      
      return JSON.stringify({ 
        text: r.output_text, 
        raw: r,
        message: "Knowledge base search completed successfully"
      });
    } catch (error) {
      console.error('❌ Knowledge Base Tool Error:', error);
      return JSON.stringify({ 
        error: `Knowledge base search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: "Failed to search knowledge base"
      });
    }
  }
};

// Weather Tool (FunctionHandler format)
const weatherTool: FunctionHandler = {
  schema: {
    name: 'weather',
    type: 'function',
    description: 'Get current weather information for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or location to get weather for'
        }
      },
      required: ['location']
    }
  },
  handler: async ({ location }: { location: string }, sessionContext?: { streamSid?: string }) => {
    console.log(`🌤️ Weather Tool Called for: ${location}`);
    return JSON.stringify({ 
      location, 
      temperature: "72°F", 
      condition: "Sunny",
      message: "This is a placeholder weather tool"
    });
  }
};

// Customer Lookup Tool (FunctionHandler format)
const customerLookupTool: FunctionHandler = {
  schema: {
    name: 'customer_lookup',
    type: 'function',
    description: 'Look up customer information by ID or phone number',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Customer ID or phone number to look up'
        }
      },
      required: ['identifier']
    }
  },
  handler: async ({ identifier }: { identifier: string }, sessionContext?: { streamSid?: string }) => {
    console.log(`👤 Customer Lookup Tool Called for: ${identifier}`);
    return JSON.stringify({ 
      identifier, 
      name: "John Doe",
      email: "john@example.com",
      message: "This is a placeholder customer lookup tool"
    });
  }
};

// Meeting Scheduling Tool (FunctionHandler format)
const meetingSchedulingTool: FunctionHandler = {
  schema: {
    name: 'schedule_meeting',
    type: 'function',
    description: `Use this tool to schedule a meeting with a customer. The tool is managed by another 
    AI agent who will ask you some questions to finalzie the booking. Follow those steps:
    1. First ask the user for the desired time and date and time zone or city , then consult the tool about availability
    2. After finding availability inform the user and get other details like name , email , any notes for the meeting 
    3. Call the tool again and provide all information needed to book the meeting  
    4. You need to understand the response provided by the tool and provide any missing infomation 
    to the tool , or confirm the correctiness of information.
    5. You should receive confirmation that meeting was booked, don't make your assumption about conformaiton 
    just wait for the tool agent to confirm to you. 
` ,
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Natural language message/request to send to the meeting scheduling agent. This should contain all available information about the meeting request, including desired time, date, time zone, customer details, and any other relevant information.'
        }
      }
    }
  },
  handler: async ({ query }: { 
    query: string;
  }, sessionContext?: { streamSid?: string }) => {
    console.log(`📅 Meeting Scheduling Tool Called with query: "${query}"`);
    
    try {
      const webhookUrl = 'https://n8n.hiqsense.com/webhook/868f0106-771a-48e1-8f89-387558424747';
      
      const webhookPayload = {
        sessionId: sessionContext?.streamSid || 'unknown',
        headers: {},
        body: {
          action: 'scheduleMeeting',
          chatInput: query
        },
        query: {}
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook request failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      return JSON.stringify({ 
        success: true,
        webhookPayload,
        webhookResponse: result,
        message: `Meeting scheduling request sent: "${query}"`
      });
    } catch (error) {
      console.error('❌ Meeting Scheduling Tool Error:', error);
      return JSON.stringify({ 
        success: false,
        error: `Meeting scheduling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        webhookPayload: { 
          sessionId: sessionContext?.streamSid || 'unknown', 
          headers: {}, 
          body: { action: 'scheduleMeeting', chatInput: query }, 
          query: {} 
        },
        message: "Failed to schedule meeting"
      });
    }
  }
};

// ============================================================================
// TOOL REGISTRY - Map tool names to their implementations
// ============================================================================
export const TOOL_REGISTRY: Record<string, FunctionHandler> = {
  knowledge_base: knowledgeBaseTool,
  weather: weatherTool,
  customer_lookup: customerLookupTool,
  schedule_meeting: meetingSchedulingTool,
};

// ============================================================================
// UNIFIED TOOL MANAGEMENT
// ============================================================================

/**
 * Get all available tool names
 */
export const getAvailableToolNames = (): string[] => {
  return Object.keys(TOOL_REGISTRY);
};

/**
 * Get enabled tools for Twilio (Realtime API format)
 */
export const getEnabledToolsForTwilio = (enabledToolNames: string[]) => {
  const tools = [];
  
  for (const toolName of enabledToolNames) {
    if (TOOL_REGISTRY[toolName]) {
      const tool = TOOL_REGISTRY[toolName];
      // Convert to Realtime API format
      tools.push({
        type: "function",
        name: tool.schema.name,
        description: tool.schema.description,
        parameters: tool.schema.parameters
      });
      console.log(`✅ Twilio Tool '${toolName}' loaded successfully`);
    } else {
      console.warn(`⚠️ Tool '${toolName}' not found in registry`);
    }
  }
  
  console.log(`🔧 Loaded ${tools.length} enabled tools for Twilio:`, enabledToolNames);
  return tools;
};

/**
 * Get enabled tools for WebRTC (converted to WebRTC format)
 */
export const getEnabledToolsForWebRTC = (enabledToolNames: string[]) => {
  const tools = [];
  
  for (const toolName of enabledToolNames) {
    if (TOOL_REGISTRY[toolName]) {
      const tool = TOOL_REGISTRY[toolName];
      // Convert FunctionHandler format to WebRTC format
      tools.push(tool.schema);
      console.log(`✅ WebRTC Tool '${toolName}' loaded successfully`);
    } else {
      console.warn(`⚠️ Tool '${toolName}' not found in registry`);
    }
  }
  
  console.log(`🔧 Loaded ${tools.length} enabled tools for WebRTC:`, enabledToolNames);
  return tools;
};

/**
 * Get all available tools (for testing/development)
 */
export const getAllTools = () => {
  const allToolNames = getAvailableToolNames();
  return {
    twilio: getEnabledToolsForTwilio(allToolNames),
    webrtc: getEnabledToolsForWebRTC(allToolNames)
  };
};