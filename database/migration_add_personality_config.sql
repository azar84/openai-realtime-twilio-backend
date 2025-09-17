-- Migration: Add personality configuration fields to agent_configs table
-- Run this script to add personality configuration support to existing databases

-- Add personality configuration columns
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS personality_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS personality_instructions TEXT DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN agent_configs.personality_config IS 'Full personality configuration object with all dimensions and custom items';
COMMENT ON COLUMN agent_configs.personality_instructions IS 'Generated personality instructions from the configuration';
