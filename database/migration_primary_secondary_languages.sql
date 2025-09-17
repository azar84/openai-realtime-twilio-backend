-- Migration to add primary_language and secondary_languages columns
-- and migrate existing languages data

-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Add primary_language column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_configs' 
        AND column_name = 'primary_language'
    ) THEN
        ALTER TABLE agent_configs ADD COLUMN primary_language VARCHAR(100) DEFAULT NULL;
        RAISE NOTICE 'Added primary_language column to agent_configs table';
    ELSE
        RAISE NOTICE 'primary_language column already exists in agent_configs table';
    END IF;

    -- Add secondary_languages column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_configs' 
        AND column_name = 'secondary_languages'
    ) THEN
        ALTER TABLE agent_configs ADD COLUMN secondary_languages JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added secondary_languages column to agent_configs table';
    ELSE
        RAISE NOTICE 'secondary_languages column already exists in agent_configs table';
    END IF;
END $$;

-- Migrate existing languages data
-- If languages array has items, use first as primary and rest as secondary
UPDATE agent_configs 
SET 
    primary_language = CASE 
        WHEN languages IS NOT NULL AND jsonb_array_length(languages) > 0 
        THEN languages->0
        ELSE NULL 
    END,
    secondary_languages = CASE 
        WHEN languages IS NOT NULL AND jsonb_array_length(languages) > 1 
        THEN (SELECT jsonb_agg(value) FROM jsonb_array_elements(languages) WITH ORDINALITY AS t(value, idx) WHERE idx > 1)
        ELSE '[]'::jsonb
    END
WHERE languages IS NOT NULL;

-- Drop the old languages column after migration
-- ALTER TABLE agent_configs DROP COLUMN IF EXISTS languages;
