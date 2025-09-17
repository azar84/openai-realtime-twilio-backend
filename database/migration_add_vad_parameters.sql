-- Migration to add new VAD parameters
-- Add new VAD parameters to agent_configs table

ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS create_response BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS interrupt_response BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS eagerness VARCHAR(20) DEFAULT NULL;

-- Add constraints for eagerness values (PostgreSQL doesn't support IF NOT EXISTS for constraints)
-- This will only work if the constraint doesn't already exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_eagerness') THEN
        ALTER TABLE agent_configs 
        ADD CONSTRAINT valid_eagerness CHECK (eagerness IN ('low', 'medium', 'high', 'auto') OR eagerness IS NULL);
    END IF;
END $$;
