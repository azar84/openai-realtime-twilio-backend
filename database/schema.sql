-- OpenAI Realtime Agent Configuration Database Schema

-- Create database (run manually if needed)
-- CREATE DATABASE openai_realtime_db;

-- Agent configurations table
CREATE TABLE IF NOT EXISTS agent_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL DEFAULT 'Default Agent',
    instructions TEXT NOT NULL DEFAULT 'You are a helpful AI assistant.',
    voice VARCHAR(50) NOT NULL DEFAULT 'ash',
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-realtime-preview-2024-12-17',
    temperature DECIMAL(3,2) DEFAULT 0.8,
    max_tokens INTEGER DEFAULT NULL,
    
    -- Audio settings
    input_audio_format VARCHAR(50) DEFAULT 'g711_ulaw',
    output_audio_format VARCHAR(50) DEFAULT 'g711_ulaw',
    
    -- Turn detection settings
    turn_detection_type VARCHAR(50) DEFAULT 'server_vad',
    turn_detection_threshold DECIMAL(3,2) DEFAULT 0.5,
    turn_detection_prefix_padding_ms INTEGER DEFAULT 300,
    turn_detection_silence_duration_ms INTEGER DEFAULT 200,
    
    -- Modalities
    modalities JSONB DEFAULT '["text", "audio"]'::jsonb,
    
    -- Tools configuration
    tools_enabled BOOLEAN DEFAULT true,
    enabled_tools JSONB DEFAULT '[]'::jsonb, -- Array of tool names
    
    -- Language configuration
    primary_language VARCHAR(100) DEFAULT NULL, -- Primary language
    secondary_languages JSONB DEFAULT '[]'::jsonb, -- Array of secondary languages
    
    -- Personality configuration
    personality_config JSONB DEFAULT '{}'::jsonb, -- Full personality configuration object
    personality_instructions TEXT DEFAULT NULL, -- Generated personality instructions
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_voice CHECK (voice IN ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse')),
    CONSTRAINT valid_audio_format CHECK (input_audio_format IN ('pcm16', 'g711_ulaw', 'g711_alaw') AND output_audio_format IN ('pcm16', 'g711_ulaw', 'g711_alaw')),
    CONSTRAINT valid_turn_detection CHECK (turn_detection_type IN ('server_vad', 'none')),
    CONSTRAINT valid_temperature CHECK (temperature >= 0.0 AND temperature <= 1.0)
);

-- Tool definitions table
CREATE TABLE IF NOT EXISTS tool_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) DEFAULT 'function',
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    config_id INTEGER REFERENCES agent_configs(id),
    twilio_stream_sid VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'ended', 'failed'))
);

-- Session logs table (for debugging and analytics)
CREATE TABLE IF NOT EXISTS session_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_agent_configs_updated_at 
    BEFORE UPDATE ON agent_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tool_definitions_updated_at 
    BEFORE UPDATE ON tool_definitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO agent_configs (name, instructions, voice, tools_enabled, enabled_tools) 
VALUES (
    'Default Assistant',
    'You are a helpful AI assistant. Be concise and friendly in your responses. When users ask about weather, use the weather tool. When users ask about customers or phone numbers, use the customer lookup tool.',
    'ash',
    true,
    '["get_weather_from_coords", "lookup_customer"]'::jsonb
) ON CONFLICT DO NOTHING;

-- Insert available tools
INSERT INTO tool_definitions (name, description, parameters) VALUES
(
    'get_weather_from_coords',
    'Get current weather for given coordinates',
    '{
        "type": "object",
        "properties": {
            "latitude": {"type": "number", "description": "Latitude coordinate"},
            "longitude": {"type": "number", "description": "Longitude coordinate"}
        },
        "required": ["latitude", "longitude"]
    }'::jsonb
),
(
    'lookup_customer',
    'Find a customer and recent info by phone number via n8n workflow',
    '{
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "E.164 phone number"}
        },
        "required": ["phone"]
    }'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_configs_active ON agent_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_config_id ON sessions(config_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_timestamp ON session_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_session_logs_event_type ON session_logs(event_type);
