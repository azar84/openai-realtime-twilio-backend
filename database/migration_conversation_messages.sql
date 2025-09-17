-- Migration to ensure conversation_messages table has all required fields
-- This table stores all conversation messages between users and agents

-- Create the conversation_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS conversation_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    stream_sid VARCHAR(255), -- Twilio stream SID for audio messages
    message_type VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'function_call', 'function_output', 'system'
    content TEXT NOT NULL, -- The actual message content
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata (timestamps, audio info, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_message_type CHECK (message_type IN ('user', 'assistant', 'function_call', 'function_output', 'system'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_id ON conversation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_stream_sid ON conversation_messages(stream_sid);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_type ON conversation_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);

-- Add any missing columns if they don't exist
DO $$
BEGIN
    -- Add audio_duration if it doesn't exist (for audio messages)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_messages' AND column_name='audio_duration_ms') THEN
        ALTER TABLE conversation_messages ADD COLUMN audio_duration_ms INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added audio_duration_ms column to conversation_messages table.';
    END IF;
    
    -- Add is_audio if it doesn't exist (to distinguish text vs audio messages)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_messages' AND column_name='is_audio') THEN
        ALTER TABLE conversation_messages ADD COLUMN is_audio BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_audio column to conversation_messages table.';
    END IF;
    
    -- Add sequence_number if it doesn't exist (for ordering messages within a session)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_messages' AND column_name='sequence_number') THEN
        ALTER TABLE conversation_messages ADD COLUMN sequence_number INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added sequence_number column to conversation_messages table.';
    END IF;
END $$;

-- Create a function to get the next sequence number for a session
CREATE OR REPLACE FUNCTION get_next_sequence_number(session_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(sequence_number), 0) + 1 
    INTO next_seq
    FROM conversation_messages 
    WHERE session_id = session_id_param;
    
    RETURN next_seq;
END;
$$ LANGUAGE plpgsql;

-- Create a function to save a conversation message
CREATE OR REPLACE FUNCTION save_conversation_message(
    p_session_id INTEGER,
    p_message_type VARCHAR(50),
    p_content TEXT,
    p_stream_sid VARCHAR(255) DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_audio_duration_ms INTEGER DEFAULT NULL,
    p_is_audio BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
    message_id INTEGER;
    seq_num INTEGER;
BEGIN
    -- Get the next sequence number for this session
    seq_num := get_next_sequence_number(p_session_id);
    
    -- Insert the message
    INSERT INTO conversation_messages (
        session_id,
        stream_sid,
        message_type,
        content,
        metadata,
        audio_duration_ms,
        is_audio,
        sequence_number
    ) VALUES (
        p_session_id,
        p_stream_sid,
        p_message_type,
        p_content,
        p_metadata,
        p_audio_duration_ms,
        p_is_audio,
        seq_num
    ) RETURNING id INTO message_id;
    
    RETURN message_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get conversation messages for a session
CREATE OR REPLACE FUNCTION get_conversation_messages(p_session_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    session_id INTEGER,
    stream_sid VARCHAR(255),
    message_type VARCHAR(50),
    content TEXT,
    metadata JSONB,
    audio_duration_ms INTEGER,
    is_audio BOOLEAN,
    sequence_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cm.id,
        cm.session_id,
        cm.stream_sid,
        cm.message_type,
        cm.content,
        cm.metadata,
        cm.audio_duration_ms,
        cm.is_audio,
        cm.sequence_number,
        cm.created_at
    FROM conversation_messages cm
    WHERE cm.session_id = p_session_id
    ORDER BY cm.sequence_number ASC, cm.created_at ASC;
END;
$$ LANGUAGE plpgsql;
