-- Migration: Add tool configurations table
-- This table stores configuration for individual tools like knowledge base URL, API keys, etc.

CREATE TABLE IF NOT EXISTS tool_configurations (
    id SERIAL PRIMARY KEY,
    tool_name VARCHAR(255) NOT NULL,
    config_key VARCHAR(255) NOT NULL,
    config_value TEXT,
    description TEXT,
    is_secret BOOLEAN DEFAULT false, -- For API keys, passwords, etc.
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_tool_config UNIQUE(tool_name, config_key)
);

-- Add trigger for updated_at
CREATE TRIGGER update_tool_configurations_updated_at 
    BEFORE UPDATE ON tool_configurations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default knowledge base configuration
INSERT INTO tool_configurations (tool_name, config_key, config_value, description, is_secret) VALUES
(
    'knowledge_base',
    'url',
    'https://n8n.hiqsense.com/webhook/868f0106-771a-48e1-8f89-387558424747',
    'Knowledge base webhook URL',
    false
),
(
    'knowledge_base',
    'description',
    'Answer questions about the company, contact information, products, services, etc. Use this first before saying you don''t have information.',
    'Tool description shown to the AI agent',
    false
),
(
    'knowledge_base',
    'api_secret',
    '',
    'API secret for knowledge base authentication',
    true
) ON CONFLICT (tool_name, config_key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tool_configurations_tool_name ON tool_configurations(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_configurations_enabled ON tool_configurations(enabled) WHERE enabled = true;
