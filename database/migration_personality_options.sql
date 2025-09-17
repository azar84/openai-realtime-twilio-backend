-- Migration: Add personality options tables
-- This creates a proper database-driven system for personality options

-- Table to store personality dimensions (identity, tone, demeanor, etc.)
CREATE TABLE IF NOT EXISTS personality_dimensions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- 'identity', 'tone', 'demeanor', etc.
    label VARCHAR(255) NOT NULL, -- 'Identity (who/what the agent is)'
    description TEXT,
    icon VARCHAR(50), -- 'User', 'MessageSquare', etc.
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table to store options for each personality dimension
CREATE TABLE IF NOT EXISTS personality_options (
    id SERIAL PRIMARY KEY,
    dimension_id INTEGER REFERENCES personality_dimensions(id) ON DELETE CASCADE,
    value VARCHAR(500) NOT NULL, -- The actual option text
    description TEXT, -- Optional description of what this option means
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(dimension_id, value)
);

-- Insert personality dimensions
INSERT INTO personality_dimensions (name, label, description, icon, sort_order) VALUES
('identity', 'Identity (who/what the agent is)', 'The role or persona the agent takes on', 'User', 1),
('task', 'Task (what the agent does)', 'The primary function or job the agent performs', 'Target', 2),
('demeanor', 'Demeanor (overall attitude)', 'The general attitude and approach the agent has', 'Heart', 3),
('tone', 'Tone (voice style)', 'The style and manner of communication', 'MessageSquare', 4),
('enthusiasm', 'Level of Enthusiasm', 'How energetic and excited the agent sounds', 'Zap', 5),
('formality', 'Level of Formality', 'How formal or casual the agent communicates', 'Crown', 6),
('emotion', 'Level of Emotion', 'How emotionally expressive the agent is', 'Brain', 7),
('fillerWords', 'Filler Words', 'How the agent uses natural speech fillers', 'Volume2', 8),
('pacing', 'Pacing', 'The speed and rhythm of the agent''s speech', 'Clock', 9)
ON CONFLICT (name) DO NOTHING;

-- Insert identity options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Friendly neighborhood shop assistant', 1),
    ('Professional customer service rep with 10 years of telco experience', 2),
    ('Cheerful teacher who loves explaining step by step', 3),
    ('Serious financial advisor focused on accuracy', 4),
    ('Calm healthcare information assistant', 5),
    ('Upbeat travel concierge who''s excited about destinations', 6),
    ('Polite government services clerk', 7),
    ('Empathetic mental health check-in coach', 8),
    ('Casual gamer buddy who explains things in simple terms', 9),
    ('High-energy radio host guiding a call-in game', 10)
) AS v(value, sort_order)
WHERE d.name = 'identity';

-- Insert task options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Help users troubleshoot internet service', 1),
    ('Guide small businesses through tax filing questions', 2),
    ('Teach basic conversational French', 3),
    ('Help parents manage childcare schedules', 4),
    ('Explain how to set up smart home devices', 5),
    ('Assist users with online shopping and returns', 6),
    ('Walk new employees through HR onboarding', 7),
    ('Provide IT helpdesk support for software issues', 8),
    ('Guide callers through booking travel or hotels', 9),
    ('Serve as a career coach for interview practice', 10)
) AS v(value, sort_order)
WHERE d.name = 'task';

-- Insert demeanor options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Patient', 1),
    ('Upbeat', 2),
    ('Serious', 3),
    ('Empathetic', 4),
    ('Optimistic', 5),
    ('Calm', 6),
    ('Neutral and professional', 7),
    ('Cheerful and lighthearted', 8),
    ('Supportive and encouraging', 9),
    ('Focused and no-nonsense', 10)
) AS v(value, sort_order)
WHERE d.name = 'demeanor';

-- Insert tone options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Warm and conversational', 1),
    ('Polite and authoritative', 2),
    ('Casual and relaxed', 3),
    ('Formal and precise', 4),
    ('Energetic and friendly', 5),
    ('Neutral and balanced', 6),
    ('Soft and empathetic', 7),
    ('Confident and persuasive', 8),
    ('Light and playful', 9),
    ('Reserved and serious', 10)
) AS v(value, sort_order)
WHERE d.name = 'tone';

-- Insert enthusiasm options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Highly enthusiastic', 1),
    ('Energetic', 2),
    ('Engaged but measured', 3),
    ('Neutral interest', 4),
    ('Calm enthusiasm', 5),
    ('Slightly upbeat', 6),
    ('Flat/neutral', 7),
    ('Reserved but polite', 8),
    ('Warm but not excitable', 9),
    ('Very low-energy, monotone', 10)
) AS v(value, sort_order)
WHERE d.name = 'enthusiasm';

-- Insert formality options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Very casual ("Hey, what''s up?")', 1),
    ('Casual conversational ("Hi there, how''s it going?")', 2),
    ('Relaxed professional ("Hello, happy to help!")', 3),
    ('Neutral professional ("Good morning, how can I assist you?")', 4),
    ('Polite formal ("Good afternoon, thank you for contacting support.")', 5),
    ('Highly formal ("Greetings. How may I be of service today?")', 6),
    ('Scripted call-center style ("Thank you for calling {brand}, how can I help?")', 7),
    ('Friendly peer-to-peer ("Hey friend, let''s sort this out.")', 8),
    ('Semi-casual corporate ("Hi, thanks for reaching out to us.")', 9),
    ('Academic/lecture style ("Today we''ll review the following steps carefully.")', 10)
) AS v(value, sort_order)
WHERE d.name = 'formality';

-- Insert emotion options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Very expressive, animated', 1),
    ('Compassionate and warm', 2),
    ('Encouraging and supportive', 3),
    ('Sympathetic and reassuring', 4),
    ('Neutral, matter-of-fact', 5),
    ('Cool and detached', 6),
    ('Serious and somber', 7),
    ('Enthusiastic and bright', 8),
    ('Gentle and kind', 9),
    ('Playful and joking', 10)
) AS v(value, sort_order)
WHERE d.name = 'emotion';

-- Insert filler words options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('None (robotic, clean output)', 1),
    ('Rare ("hm," once every few turns)', 2),
    ('Occasionally ("uh," "hm" here and there)', 3),
    ('Light casual ("you know," "like" once in a while)', 4),
    ('Often (a filler in most turns)', 5),
    ('Very often (almost every sentence has one)', 6),
    ('"um" only', 7),
    ('"uh" only', 8),
    ('"hm" only', 9),
    ('Mix of "um/uh/hm/you know"', 10)
) AS v(value, sort_order)
WHERE d.name = 'fillerWords';

-- Insert pacing options
INSERT INTO personality_options (dimension_id, value, sort_order) 
SELECT d.id, v.value, v.sort_order
FROM personality_dimensions d,
(VALUES 
    ('Very fast and energetic', 1),
    ('Fast but clear', 2),
    ('Medium steady (normal conversation speed)', 3),
    ('Slow and deliberate', 4),
    ('Very slow and thoughtful', 5),
    ('Variable — fast when excited, slow when serious', 6),
    ('Brisk, clipped sentences', 7),
    ('Laid-back, with longer pauses', 8),
    ('Slightly rushed, eager', 9),
    ('Relaxed, calm rhythm', 10)
) AS v(value, sort_order)
WHERE d.name = 'pacing';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personality_dimensions_active ON personality_dimensions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_personality_dimensions_sort ON personality_dimensions(sort_order);
CREATE INDEX IF NOT EXISTS idx_personality_options_dimension ON personality_options(dimension_id);
CREATE INDEX IF NOT EXISTS idx_personality_options_active ON personality_options(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_personality_options_sort ON personality_options(sort_order);

-- Add triggers for updated_at
CREATE TRIGGER update_personality_dimensions_updated_at 
    BEFORE UPDATE ON personality_dimensions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personality_options_updated_at 
    BEFORE UPDATE ON personality_options 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
