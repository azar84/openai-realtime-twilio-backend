import { Request, Response } from 'express';
import { getActiveAgentConfig } from './db';
import { normalizeConfig } from './agent-config-mapper';
import agentInstructions from './agent-instructions';

export const getEphemeralKey = async (_req: Request, res: Response) => {
  try {
    // Get OpenAI API key from environment
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    console.log('🔑 Creating ephemeral client key...');
    
    // Get agent configuration from database
    console.log('🔍 Fetching agent configuration from database...');
    const agentConfig = await getActiveAgentConfig();
    if (!agentConfig) {
      console.error('❌ No active agent configuration found in database');
      throw new Error('No active agent configuration found');
    }
    console.log('✅ Agent configuration found:', agentConfig.name);
    
    // Normalize the configuration to get proper settings
    const normalizedConfig = await normalizeConfig(agentConfig);
    
    // Get fresh template-based instructions instead of old database field
    console.log('📝 Generating fresh instructions from template...');
    const freshInstructions = await agentInstructions();
    
    // Ensure temperature is within valid range (0.6 <= temperature <= 1.0)
    const validTemperature = Math.max(0.6, Math.min(1.0, normalizedConfig.temperature));
    
    console.log('🔧 Using agent configuration:');
    console.log('  - Model:', normalizedConfig.model);
    console.log('  - Voice:', normalizedConfig.voice);
    console.log('  - Temperature:', validTemperature, '(original:', normalizedConfig.temperature, ')');
    console.log('  - Max Tokens:', normalizedConfig.max_output_tokens);
    console.log('  - VAD:', normalizedConfig.turn_detection);
    console.log('  - Modalities:', normalizedConfig.modalities);
    console.log('  - Tools Enabled:', normalizedConfig.toolsEnabled);
    console.log('  - Available Tools:', normalizedConfig.enabledToolsForWebRTC.length);
    console.log('  - Audio Format: PCM16 (WebRTC optimized)');
    
    // Debug: Log the tools being sent
    if (normalizedConfig.enabledToolsForWebRTC.length > 0) {
      console.log('🔧 Tools being sent:', JSON.stringify(normalizedConfig.enabledToolsForWebRTC, null, 2));
    }
    
    // Create a session configuration that the client can use
    const sessionConfig = {
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
      input_audio_format: "pcm16", // WebRTC uses PCM16 for optimal quality
      output_audio_format: "pcm16", // WebRTC uses PCM16 for optimal quality
      tools: normalizedConfig.toolsEnabled ? normalizedConfig.enabledToolsForWebRTC : []
    };

    // Create ephemeral key response (this is what the WebRTC client expects)
    const ephemeralResponse = {
      object: "realtime.session",
      id: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      model: normalizedConfig.model,
      modalities: normalizedConfig.modalities,
      instructions: freshInstructions,
      voice: normalizedConfig.voice,
      output_audio_format: "pcm16",
      tools: normalizedConfig.toolsEnabled ? normalizedConfig.enabledToolsForWebRTC : [],
      tool_choice: "auto",
      temperature: validTemperature,
      max_response_output_tokens: normalizedConfig.max_output_tokens || 4096,
      turn_detection: normalizedConfig.turn_detection,
      speed: 1,
      tracing: null,
      truncation: "auto",
      prompt: null,
      expires_at: 0,
      input_audio_noise_reduction: null,
      input_audio_format: "pcm16",
      input_audio_transcription: { 
        model: 'whisper-1'
      },
      client_secret: {
        value: OPENAI_API_KEY, // Use the actual API key for now
        expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      },
      include: null
    };

    console.log('✅ Ephemeral key created successfully');
    
    res.json(ephemeralResponse);
  } catch (error) {
    console.error('❌ Error creating ephemeral key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
