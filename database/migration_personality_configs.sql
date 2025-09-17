-- Migration: Create proper personality configuration system
-- Each config has individual fields with foreign keys to options

-- Drop existing personality_config JSONB column (we'll replace it with proper fields)
ALTER TABLE agent_configs DROP COLUMN IF EXISTS personality_config;
ALTER TABLE agent_configs DROP COLUMN IF EXISTS personality_instructions;

-- Create personality options tables
CREATE TABLE IF NOT EXISTS personality_options (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL, -- 'identity', 'tone', 'task', 'demeanor', etc.
    value VARCHAR(500) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(category, value)
);

-- Add personality fields to agent_configs table
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS config_title VARCHAR(255) DEFAULT 'Default Configuration',
ADD COLUMN IF NOT EXISTS config_description TEXT,
ADD COLUMN IF NOT EXISTS identity_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS task_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS demeanor_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS tone_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS enthusiasm_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS formality_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS emotion_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS filler_words_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS pacing_option_id INTEGER REFERENCES personality_options(id),
ADD COLUMN IF NOT EXISTS custom_instructions TEXT[] DEFAULT '{}';

-- Insert personality options
INSERT INTO personality_options (category, value, sort_order) VALUES
-- Identity options
('identity', 'Friendly neighborhood shop assistant', 1),
('identity', 'Professional customer service rep with 10 years of telco experience', 2),
('identity', 'Cheerful teacher who loves explaining step by step', 3),
('identity', 'Serious financial advisor focused on accuracy', 4),
('identity', 'Calm healthcare information assistant', 5),
('identity', 'Upbeat travel concierge who''s excited about destinations', 6),
('identity', 'Polite government services clerk', 7),
('identity', 'Empathetic mental health check-in coach', 8),
('identity', 'Casual gamer buddy who explains things in simple terms', 9),
('identity', 'High-energy radio host guiding a call-in game', 10),

-- Task options
('task', 'Help users troubleshoot internet service', 1),
('task', 'Guide small businesses through tax filing questions', 2),
('task', 'Teach basic conversational French', 3),
('task', 'Help parents manage childcare schedules', 4),
('task', 'Explain how to set up smart home devices', 5),
('task', 'Assist users with online shopping and returns', 6),
('task', 'Walk new employees through HR onboarding', 7),
('task', 'Provide IT helpdesk support for software issues', 8),
('task', 'Guide callers through booking travel or hotels', 9),
('task', 'Serve as a career coach for interview practice', 10),

-- Demeanor options
('demeanor', 'Patient', 1),
('demeanor', 'Upbeat', 2),
('demeanor', 'Serious', 3),
('demeanor', 'Empathetic', 4),
('demeanor', 'Optimistic', 5),
('demeanor', 'Calm', 6),
('demeanor', 'Neutral and professional', 7),
('demeanor', 'Cheerful and lighthearted', 8),
('demeanor', 'Supportive and encouraging', 9),
('demeanor', 'Focused and no-nonsense', 10),

-- Tone options
('tone', 'Warm and conversational', 1),
('tone', 'Polite and authoritative', 2),
('tone', 'Casual and relaxed', 3),
('tone', 'Formal and precise', 4),
('tone', 'Energetic and friendly', 5),
('tone', 'Neutral and balanced', 6),
('tone', 'Soft and empathetic', 7),
('tone', 'Confident and persuasive', 8),
('tone', 'Light and playful', 9),
('tone', 'Reserved and serious', 10),

-- Enthusiasm options
('enthusiasm', 'Highly enthusiastic', 1),
('enthusiasm', 'Energetic', 2),
('enthusiasm', 'Engaged but measured', 3),
('enthusiasm', 'Neutral interest', 4),
('enthusiasm', 'Calm enthusiasm', 5),
('enthusiasm', 'Slightly upbeat', 6),
('enthusiasm', 'Flat/neutral', 7),
('enthusiasm', 'Reserved but polite', 8),
('enthusiasm', 'Warm but not excitable', 9),
('enthusiasm', 'Very low-energy, monotone', 10),

-- Formality options
('formality', 'Very casual ("Hey, what''s up?")', 1),
('formality', 'Casual conversational ("Hi there, how''s it going?")', 2),
('formality', 'Relaxed professional ("Hello, happy to help!")', 3),
('formality', 'Neutral professional ("Good morning, how can I assist you?")', 4),
('formality', 'Polite formal ("Good afternoon, thank you for contacting support.")', 5),
('formality', 'Highly formal ("Greetings. How may I be of service today?")', 6),
('formality', 'Scripted call-center style ("Thank you for calling {brand}, how can I help?")', 7),
('formality', 'Friendly peer-to-peer ("Hey friend, let''s sort this out.")', 8),
('formality', 'Semi-casual corporate ("Hi, thanks for reaching out to us.")', 9),
('formality', 'Academic/lecture style ("Today we''ll review the following steps carefully.")', 10),

-- Emotion options
('emotion', 'Very expressive, animated', 1),
('emotion', 'Compassionate and warm', 2),
('emotion', 'Encouraging and supportive', 3),
('emotion', 'Sympathetic and reassuring', 4),
('emotion', 'Neutral, matter-of-fact', 5),
('emotion', 'Cool and detached', 6),
('emotion', 'Serious and somber', 7),
('emotion', 'Enthusiastic and bright', 8),
('emotion', 'Gentle and kind', 9),
('emotion', 'Playful and joking', 10),

-- Filler words options
('filler_words', 'None (robotic, clean output)', 1),
('filler_words', 'Rare ("hm," once every few turns)', 2),
('filler_words', 'Occasionally ("uh," "hm" here and there)', 3),
('filler_words', 'Light casual ("you know," "like" once in a while)', 4),
('filler_words', 'Often (a filler in most turns)', 5),
('filler_words', 'Very often (almost every sentence has one)', 6),
('filler_words', '"um" only', 7),
('filler_words', '"uh" only', 8),
('filler_words', '"hm" only', 9),
('filler_words', 'Mix of "um/uh/hm/you know"', 10),

-- Pacing options
('pacing', 'Very fast and energetic', 1),
('pacing', 'Fast but clear', 2),
('pacing', 'Medium steady (normal conversation speed)', 3),
('pacing', 'Slow and deliberate', 4),
('pacing', 'Very slow and thoughtful', 5),
('pacing', 'Variable — fast when excited, slow when serious', 6),
('pacing', 'Brisk, clipped sentences', 7),
('pacing', 'Laid-back, with longer pauses', 8),
('pacing', 'Slightly rushed, eager', 9),
('pacing', 'Relaxed, calm rhythm', 10);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personality_options_category ON personality_options(category);
CREATE INDEX IF NOT EXISTS idx_personality_options_active ON personality_options(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_personality_options_sort ON personality_options(sort_order);

-- Add triggers for updated_at
CREATE TRIGGER update_personality_options_updated_at 
    BEFORE UPDATE ON personality_options 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing agent configs to have default values
UPDATE agent_configs SET 
    config_title = 'Default Configuration',
    config_description = 'Default personality configuration',
    identity_option_id = (SELECT id FROM personality_options WHERE category = 'identity' AND value = 'Friendly neighborhood shop assistant' LIMIT 1),
    task_option_id = (SELECT id FROM personality_options WHERE category = 'task' AND value = 'Help users troubleshoot internet service' LIMIT 1),
    demeanor_option_id = (SELECT id FROM personality_options WHERE category = 'demeanor' AND value = 'Patient' LIMIT 1),
    tone_option_id = (SELECT id FROM personality_options WHERE category = 'tone' AND value = 'Warm and conversational' LIMIT 1),
    enthusiasm_option_id = (SELECT id FROM personality_options WHERE category = 'enthusiasm' AND value = 'Engaged but measured' LIMIT 1),
    formality_option_id = (SELECT id FROM personality_options WHERE category = 'formality' AND value = 'Relaxed professional ("Hello, happy to help!")' LIMIT 1),
    emotion_option_id = (SELECT id FROM personality_options WHERE category = 'emotion' AND value = 'Compassionate and warm' LIMIT 1),
    filler_words_option_id = (SELECT id FROM personality_options WHERE category = 'filler_words' AND value = 'Occasionally ("uh," "hm" here and there)' LIMIT 1),
    pacing_option_id = (SELECT id FROM personality_options WHERE category = 'pacing' AND value = 'Medium steady (normal conversation speed)' LIMIT 1)
WHERE identity_option_id IS NULL;
