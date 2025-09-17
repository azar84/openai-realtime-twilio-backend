-- Migration to add languages column to agent_configs table
-- Run this if you have an existing database without the languages column

-- Add languages column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_configs' 
        AND column_name = 'languages'
    ) THEN
        ALTER TABLE agent_configs ADD COLUMN languages JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added languages column to agent_configs table';
    ELSE
        RAISE NOTICE 'languages column already exists in agent_configs table';
    END IF;
END $$;
