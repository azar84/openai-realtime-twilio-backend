-- Migration to fix eagerness column name mismatch
-- The code expects turn_detection_eagerness but the column was created as just 'eagerness'

-- First, add the correct column if it doesn't exist
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS turn_detection_eagerness VARCHAR(20) DEFAULT NULL;

-- Copy data from old column to new column if the old column exists and has data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'agent_configs' AND column_name = 'eagerness') THEN
        UPDATE agent_configs 
        SET turn_detection_eagerness = eagerness 
        WHERE eagerness IS NOT NULL AND turn_detection_eagerness IS NULL;
    END IF;
END $$;

-- Also add the other missing columns that the code expects
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS turn_detection_create_response BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS turn_detection_interrupt_response BOOLEAN DEFAULT false;

-- Copy data from old columns to new columns if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'agent_configs' AND column_name = 'create_response') THEN
        UPDATE agent_configs 
        SET turn_detection_create_response = create_response 
        WHERE create_response IS NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'agent_configs' AND column_name = 'interrupt_response') THEN
        UPDATE agent_configs 
        SET turn_detection_interrupt_response = interrupt_response 
        WHERE interrupt_response IS NOT NULL;
    END IF;
END $$;

-- Add constraints for turn_detection_eagerness values
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_turn_detection_eagerness') THEN
        ALTER TABLE agent_configs 
        ADD CONSTRAINT valid_turn_detection_eagerness CHECK (
            turn_detection_eagerness IN ('low', 'medium', 'high', 'auto') OR 
            turn_detection_eagerness IS NULL
        );
    END IF;
END $$;

-- Optional: Drop old columns after confirming the migration worked
-- Uncomment these lines after verifying the data was copied correctly:
-- ALTER TABLE agent_configs DROP COLUMN IF EXISTS eagerness;
-- ALTER TABLE agent_configs DROP COLUMN IF EXISTS create_response;
-- ALTER TABLE agent_configs DROP COLUMN IF EXISTS interrupt_response;
