-- Migration: Add languages table and update agent_configs to use foreign keys for languages
-- This creates a proper relational structure for language management

-- Create languages table
CREATE TABLE IF NOT EXISTS languages (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    native_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_languages_code ON languages(code);
CREATE INDEX IF NOT EXISTS idx_languages_active ON languages(is_active);

-- Insert common languages
INSERT INTO languages (code, name, native_name, sort_order) VALUES
('en', 'English', 'English', 1),
('es', 'Spanish', 'Español', 2),
('fr', 'French', 'Français', 3),
('de', 'German', 'Deutsch', 4),
('it', 'Italian', 'Italiano', 5),
('pt', 'Portuguese', 'Português', 6),
('ru', 'Russian', 'Русский', 7),
('ja', 'Japanese', '日本語', 8),
('ko', 'Korean', '한국어', 9),
('zh', 'Chinese', '中文', 10),
('ar', 'Arabic', 'العربية', 11),
('hi', 'Hindi', 'हिन्दी', 12),
('nl', 'Dutch', 'Nederlands', 13),
('sv', 'Swedish', 'Svenska', 14),
('no', 'Norwegian', 'Norsk', 15),
('da', 'Danish', 'Dansk', 16),
('fi', 'Finnish', 'Suomi', 17),
('pl', 'Polish', 'Polski', 18),
('tr', 'Turkish', 'Türkçe', 19),
('th', 'Thai', 'ไทย', 20)
ON CONFLICT (code) DO NOTHING;

-- Add foreign key columns to agent_configs for languages
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS primary_language_id INTEGER REFERENCES languages(id),
ADD COLUMN IF NOT EXISTS secondary_language_ids INTEGER[] DEFAULT '{}';

-- Create indexes for the new foreign key columns
CREATE INDEX IF NOT EXISTS idx_agent_configs_primary_language ON agent_configs(primary_language_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_secondary_languages ON agent_configs USING GIN(secondary_language_ids);

-- Update existing configurations to use the new language structure
-- Set default primary language to English for existing configs
UPDATE agent_configs 
SET primary_language_id = (SELECT id FROM languages WHERE code = 'en' LIMIT 1)
WHERE primary_language_id IS NULL AND primary_language IS NOT NULL;

-- Convert secondary_languages text array to language IDs
UPDATE agent_configs 
SET secondary_language_ids = (
    SELECT ARRAY_AGG(l.id)
    FROM unnest(secondary_languages::text[]) AS lang_code
    JOIN languages l ON l.code = lang_code
    WHERE lang_code IS NOT NULL AND lang_code != ''
)
WHERE secondary_language_ids = '{}' AND secondary_languages IS NOT NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_languages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_languages_updated_at
    BEFORE UPDATE ON languages
    FOR EACH ROW
    EXECUTE FUNCTION update_languages_updated_at();
