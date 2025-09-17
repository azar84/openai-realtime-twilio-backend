"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbClient = getDbClient;
exports.query = query;
exports.getAllAgentConfigs = getAllAgentConfigs;
exports.getAgentConfigById = getAgentConfigById;
exports.getActiveAgentConfig = getActiveAgentConfig;
exports.getActiveAgentConfigLegacy = getActiveAgentConfigLegacy;
exports.getEnabledToolDefinitions = getEnabledToolDefinitions;
exports.testConnection = testConnection;
exports.closePool = closePool;
exports.getPersonalityOptions = getPersonalityOptions;
exports.getLanguages = getLanguages;
exports.createAgentConfig = createAgentConfig;
exports.updateAgentConfig = updateAgentConfig;
exports.deleteAgentConfig = deleteAgentConfig;
exports.activateAgentConfig = activateAgentConfig;
exports.createPersonalityOption = createPersonalityOption;
exports.updatePersonalityOption = updatePersonalityOption;
exports.deletePersonalityOption = deletePersonalityOption;
exports.saveConversationMessage = saveConversationMessage;
exports.getConversationMessages = getConversationMessages;
exports.createSession = createSession;
exports.updateSessionStatus = updateSessionStatus;
exports.getAllSessions = getAllSessions;
exports.getSessionWithMessages = getSessionWithMessages;
exports.getToolConfigurations = getToolConfigurations;
exports.updateToolConfiguration = updateToolConfiguration;
exports.getToolConfiguration = getToolConfiguration;
exports.getToolConfigurationsAsObject = getToolConfigurationsAsObject;
const pg_1 = require("pg");
// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'openai_realtime_db',
    user: process.env.DB_USER || process.env.USER,
    password: process.env.DB_PASSWORD || '',
    max: 10, // Smaller pool for websocket server
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};
// Create a connection pool
const pool = new pg_1.Pool(dbConfig);
console.log('Database config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password ? '***' : 'empty'
});
// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});
// Test database connection on startup
pool.connect()
    .then(client => {
    console.log('✅ Database connection successful');
    client.release();
})
    .catch(err => {
    console.error('❌ Database connection failed:', err);
});
// Database connection helper
function getDbClient() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const client = yield pool.connect();
            return client;
        }
        catch (error) {
            console.error('Error connecting to database:', error);
            throw error;
        }
    });
}
// Query helper function
function query(text, params) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield getDbClient();
        try {
            const result = yield client.query(text, params);
            return result;
        }
        catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
// Get active agent configuration with personality options (returns proper DBAgentConfig type)
function getAllAgentConfigs() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            // First get the main configuration data
            const mainQuery = `
      SELECT
        ac.*,
        identity_opt.value as identity_value,
        task_opt.value as task_value,
        demeanor_opt.value as demeanor_value,
        tone_opt.value as tone_value,
        enthusiasm_opt.value as enthusiasm_value,
        formality_opt.value as formality_value,
        emotion_opt.value as emotion_value,
        filler_words_opt.value as filler_words_value,
        pacing_opt.value as pacing_value,
        primary_lang.code as primary_language_code,
        primary_lang.name as primary_language_name,
        primary_lang.native_name as primary_language_native_name
      FROM agent_configs ac
      LEFT JOIN personality_options identity_opt ON ac.identity_option_id = identity_opt.id
      LEFT JOIN personality_options task_opt ON ac.task_option_id = task_opt.id
      LEFT JOIN personality_options demeanor_opt ON ac.demeanor_option_id = demeanor_opt.id
      LEFT JOIN personality_options tone_opt ON ac.tone_option_id = tone_opt.id
      LEFT JOIN personality_options enthusiasm_opt ON ac.enthusiasm_option_id = enthusiasm_opt.id
      LEFT JOIN personality_options formality_opt ON ac.formality_option_id = formality_opt.id
      LEFT JOIN personality_options emotion_opt ON ac.emotion_option_id = emotion_opt.id
      LEFT JOIN personality_options filler_words_opt ON ac.filler_words_option_id = filler_words_opt.id
      LEFT JOIN personality_options pacing_opt ON ac.pacing_option_id = pacing_opt.id
      LEFT JOIN languages primary_lang ON ac.primary_language_id = primary_lang.id
      ORDER BY ac.updated_at DESC
    `;
            const mainResult = yield client.query(mainQuery);
            // For each configuration, get the secondary languages
            const configsWithSecondaryLanguages = yield Promise.all(mainResult.rows.map((row) => __awaiter(this, void 0, void 0, function* () {
                let secondaryLanguages = [];
                let secondaryLanguageNames = [];
                if (row.secondary_language_ids && row.secondary_language_ids.length > 0) {
                    const secondaryQuery = `
            SELECT code, name, native_name
            FROM languages
            WHERE id = ANY($1)
            ORDER BY name
          `;
                    const secondaryResult = yield client.query(secondaryQuery, [row.secondary_language_ids]);
                    secondaryLanguages = secondaryResult.rows.map(lang => lang.code);
                    secondaryLanguageNames = secondaryResult.rows.map(lang => lang.name);
                }
                return Object.assign(Object.assign({}, row), { secondary_language_codes: secondaryLanguages, secondary_language_names: secondaryLanguageNames });
            })));
            return configsWithSecondaryLanguages;
        }
        finally {
            client.release();
        }
    });
}
function getAgentConfigById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const result = yield client.query(`
      SELECT 
        ac.*,
        pl.code as primary_language_code,
        pl.name as primary_language_name,
        pl.native_name as primary_language_native_name,
        COALESCE(
          ARRAY_AGG(DISTINCT sl.code) FILTER (WHERE sl.code IS NOT NULL), 
          ARRAY[]::text[]
        ) as secondary_language_codes,
        COALESCE(
          ARRAY_AGG(DISTINCT sl.name) FILTER (WHERE sl.name IS NOT NULL), 
          ARRAY[]::text[]
        ) as secondary_language_names,
        po_identity.value as identity_value,
        po_task.value as task_value,
        po_demeanor.value as demeanor_value,
        po_tone.value as tone_value,
        po_enthusiasm.value as enthusiasm_value,
        po_formality.value as formality_value,
        po_emotion.value as emotion_value,
        po_filler_words.value as filler_words_value,
        po_pacing.value as pacing_value
      FROM agent_configs ac
      LEFT JOIN languages pl ON ac.primary_language_id = pl.id
      LEFT JOIN LATERAL unnest(ac.secondary_language_ids) AS sl_id ON true
      LEFT JOIN languages sl ON sl_id = sl.id
      LEFT JOIN personality_options po_identity ON ac.identity_option_id = po_identity.id
      LEFT JOIN personality_options po_task ON ac.task_option_id = po_task.id
      LEFT JOIN personality_options po_demeanor ON ac.demeanor_option_id = po_demeanor.id
      LEFT JOIN personality_options po_tone ON ac.tone_option_id = po_tone.id
      LEFT JOIN personality_options po_enthusiasm ON ac.enthusiasm_option_id = po_enthusiasm.id
      LEFT JOIN personality_options po_formality ON ac.formality_option_id = po_formality.id
      LEFT JOIN personality_options po_emotion ON ac.emotion_option_id = po_emotion.id
      LEFT JOIN personality_options po_filler_words ON ac.filler_words_option_id = po_filler_words.id
      LEFT JOIN personality_options po_pacing ON ac.pacing_option_id = po_pacing.id
      WHERE ac.id = $1
      GROUP BY 
        ac.id, ac.name, ac.instructions, ac.voice, ac.model, ac.temperature, ac.max_tokens,
        ac.input_audio_format, ac.output_audio_format, ac.turn_detection_type, ac.turn_detection_threshold,
        ac.turn_detection_prefix_padding_ms, ac.turn_detection_silence_duration_ms, ac.modalities,
        ac.tools_enabled, ac.enabled_tools, ac.is_active, ac.created_at, ac.updated_at,
        ac.turn_detection_eagerness, ac.turn_detection_create_response, ac.turn_detection_interrupt_response,
        ac.max_output_tokens, ac.config_title, ac.config_description, ac.identity_option_id, ac.task_option_id,
        ac.demeanor_option_id, ac.tone_option_id, ac.enthusiasm_option_id, ac.formality_option_id,
        ac.emotion_option_id, ac.filler_words_option_id, ac.pacing_option_id, ac.custom_instructions,
        ac.primary_language_id, ac.secondary_language_ids, pl.code, pl.name, pl.native_name,
        po_identity.value, po_task.value, po_demeanor.value, po_tone.value, po_enthusiasm.value,
        po_formality.value, po_emotion.value, po_filler_words.value, po_pacing.value
    `, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            const row = result.rows[0];
            return {
                id: row.id,
                name: row.name,
                instructions: row.instructions,
                voice: row.voice,
                model: row.model,
                temperature: row.temperature,
                max_tokens: row.max_tokens,
                input_audio_format: row.input_audio_format,
                output_audio_format: row.output_audio_format,
                turn_detection_type: row.turn_detection_type,
                turn_detection_threshold: row.turn_detection_threshold,
                turn_detection_prefix_padding_ms: row.turn_detection_prefix_padding_ms,
                turn_detection_silence_duration_ms: row.turn_detection_silence_duration_ms,
                modalities: row.modalities,
                tools_enabled: row.tools_enabled,
                enabled_tools: row.enabled_tools,
                is_active: row.is_active,
                created_at: row.created_at,
                updated_at: row.updated_at,
                turn_detection_eagerness: row.turn_detection_eagerness,
                turn_detection_create_response: row.turn_detection_create_response,
                turn_detection_interrupt_response: row.turn_detection_interrupt_response,
                max_output_tokens: row.max_output_tokens,
                config_title: row.config_title,
                config_description: row.config_description,
                identity_option_id: row.identity_option_id,
                task_option_id: row.task_option_id,
                demeanor_option_id: row.demeanor_option_id,
                tone_option_id: row.tone_option_id,
                enthusiasm_option_id: row.enthusiasm_option_id,
                formality_option_id: row.formality_option_id,
                emotion_option_id: row.emotion_option_id,
                filler_words_option_id: row.filler_words_option_id,
                pacing_option_id: row.pacing_option_id,
                custom_instructions: row.custom_instructions,
                primary_language_id: row.primary_language_id,
                secondary_language_ids: row.secondary_language_ids,
                primary_language: row.primary_language || null,
                secondary_languages: row.secondary_languages || [],
                primary_language_code: row.primary_language_code,
                primary_language_name: row.primary_language_name,
                primary_language_native_name: row.primary_language_native_name,
                secondary_language_codes: row.secondary_language_codes,
                secondary_language_names: row.secondary_language_names,
                identity_value: row.identity_value,
                task_value: row.task_value,
                demeanor_value: row.demeanor_value,
                tone_value: row.tone_value,
                enthusiasm_value: row.enthusiasm_value,
                formality_value: row.formality_value,
                emotion_value: row.emotion_value,
                filler_words_value: row.filler_words_value,
                pacing_value: row.pacing_value
            };
        }
        catch (error) {
            console.error('Error fetching agent config by ID:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getActiveAgentConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield query(`
      SELECT 
        ac.*,
        identity_opt.value as identity_value,
        task_opt.value as task_value,
        demeanor_opt.value as demeanor_value,
        tone_opt.value as tone_value,
        enthusiasm_opt.value as enthusiasm_value,
        formality_opt.value as formality_value,
        emotion_opt.value as emotion_value,
        filler_words_opt.value as filler_words_value,
        pacing_opt.value as pacing_value,
        primary_lang.code as primary_language_code,
        primary_lang.name as primary_language_name,
        primary_lang.native_name as primary_language_native_name
      FROM agent_configs ac
      LEFT JOIN personality_options identity_opt ON ac.identity_option_id = identity_opt.id
      LEFT JOIN personality_options task_opt ON ac.task_option_id = task_opt.id
      LEFT JOIN personality_options demeanor_opt ON ac.demeanor_option_id = demeanor_opt.id
      LEFT JOIN personality_options tone_opt ON ac.tone_option_id = tone_opt.id
      LEFT JOIN personality_options enthusiasm_opt ON ac.enthusiasm_option_id = enthusiasm_opt.id
      LEFT JOIN personality_options formality_opt ON ac.formality_option_id = formality_opt.id
      LEFT JOIN personality_options emotion_opt ON ac.emotion_option_id = emotion_opt.id
      LEFT JOIN personality_options filler_words_opt ON ac.filler_words_option_id = filler_words_opt.id
      LEFT JOIN personality_options pacing_opt ON ac.pacing_option_id = pacing_opt.id
      LEFT JOIN languages primary_lang ON ac.primary_language_id = primary_lang.id
      WHERE ac.is_active = true 
      ORDER BY ac.updated_at DESC 
      LIMIT 1
    `);
            if (result.rows.length === 0) {
                console.log('No active agent configuration found in database');
                return null;
            }
            const row = result.rows[0];
            const config = {
                id: row.id,
                name: row.name,
                instructions: row.instructions,
                voice: row.voice,
                model: row.model,
                temperature: row.temperature ? parseFloat(row.temperature) : null,
                max_tokens: row.max_tokens ? parseInt(row.max_tokens) : null,
                input_audio_format: row.input_audio_format,
                output_audio_format: row.output_audio_format,
                turn_detection_type: row.turn_detection_type,
                turn_detection_threshold: row.turn_detection_threshold ? parseFloat(row.turn_detection_threshold) : null,
                turn_detection_prefix_padding_ms: row.turn_detection_prefix_padding_ms ? parseInt(row.turn_detection_prefix_padding_ms) : null,
                turn_detection_silence_duration_ms: row.turn_detection_silence_duration_ms ? parseInt(row.turn_detection_silence_duration_ms) : null,
                modalities: typeof row.modalities === 'string' ? JSON.parse(row.modalities) : row.modalities,
                tools_enabled: row.tools_enabled,
                enabled_tools: typeof row.enabled_tools === 'string' ? JSON.parse(row.enabled_tools) : row.enabled_tools,
                is_active: row.is_active,
                created_at: row.created_at,
                updated_at: row.updated_at,
                turn_detection_eagerness: row.turn_detection_eagerness || null,
                turn_detection_create_response: row.turn_detection_create_response || false,
                turn_detection_interrupt_response: row.turn_detection_interrupt_response || false,
                max_output_tokens: row.max_output_tokens ? parseInt(row.max_output_tokens) : null,
                // Language configuration
                primary_language: row.primary_language,
                secondary_languages: typeof row.secondary_languages === 'string' ? JSON.parse(row.secondary_languages) : row.secondary_languages,
                primary_language_id: row.primary_language_id,
                secondary_language_ids: row.secondary_language_ids,
                // Personality configuration fields
                config_title: row.config_title,
                config_description: row.config_description,
                identity_option_id: row.identity_option_id,
                task_option_id: row.task_option_id,
                demeanor_option_id: row.demeanor_option_id,
                tone_option_id: row.tone_option_id,
                enthusiasm_option_id: row.enthusiasm_option_id,
                formality_option_id: row.formality_option_id,
                emotion_option_id: row.emotion_option_id,
                filler_words_option_id: row.filler_words_option_id,
                pacing_option_id: row.pacing_option_id,
                custom_instructions: row.custom_instructions || [],
                // Personality values (from JOIN query)
                identity_value: row.identity_value,
                task_value: row.task_value,
                demeanor_value: row.demeanor_value,
                tone_value: row.tone_value,
                enthusiasm_value: row.enthusiasm_value,
                formality_value: row.formality_value,
                emotion_value: row.emotion_value,
                filler_words_value: row.filler_words_value,
                pacing_value: row.pacing_value,
                // Language values (from JOIN query)
                primary_language_code: row.primary_language_code,
                primary_language_name: row.primary_language_name,
                primary_language_native_name: row.primary_language_native_name,
                secondary_language_codes: [],
                secondary_language_names: []
            };
            console.log('✅ Loaded active agent configuration from database:', config.name);
            return config;
        }
        catch (error) {
            console.error('❌ Error fetching active agent configuration:', error);
            return null;
        }
    });
}
// Legacy function for backward compatibility (deprecated)
function getActiveAgentConfigLegacy() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield query('SELECT * FROM agent_configs WHERE is_active = true ORDER BY updated_at DESC LIMIT 1');
            if (result.rows.length === 0) {
                console.log('No active agent configuration found in database');
                return null;
            }
            const row = result.rows[0];
            const config = {
                id: row.id,
                name: row.name,
                instructions: row.instructions,
                voice: row.voice,
                model: row.model,
                temperature: row.temperature ? parseFloat(row.temperature) : undefined,
                max_tokens: row.max_tokens ? parseInt(row.max_tokens) : undefined,
                input_audio_format: row.input_audio_format,
                output_audio_format: row.output_audio_format,
                turn_detection_type: row.turn_detection_type,
                turn_detection_threshold: row.turn_detection_threshold ? parseFloat(row.turn_detection_threshold) : undefined,
                turn_detection_prefix_padding_ms: row.turn_detection_prefix_padding_ms ? parseInt(row.turn_detection_prefix_padding_ms) : undefined,
                turn_detection_silence_duration_ms: row.turn_detection_silence_duration_ms ? parseInt(row.turn_detection_silence_duration_ms) : undefined,
                modalities: typeof row.modalities === 'string' ? JSON.parse(row.modalities) : row.modalities,
                tools_enabled: row.tools_enabled,
                enabled_tools: typeof row.enabled_tools === 'string' ? JSON.parse(row.enabled_tools) : row.enabled_tools,
                is_active: row.is_active
            };
            console.log('✅ Loaded active agent configuration from database (legacy):', config.name);
            return config;
        }
        catch (error) {
            console.error('❌ Error fetching active agent configuration:', error);
            return null;
        }
    });
}
// Get tool definitions for enabled tools
function getEnabledToolDefinitions(enabledTools) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!enabledTools || enabledTools.length === 0) {
            return [];
        }
        try {
            const placeholders = enabledTools.map((_, i) => `$${i + 1}`).join(', ');
            const result = yield query(`SELECT name, description, parameters FROM tool_definitions WHERE name = ANY($1) AND enabled = true`, [enabledTools]);
            return result.rows.map((row) => ({
                type: "function",
                name: row.name,
                description: row.description,
                parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters
            }));
        }
        catch (error) {
            console.error('❌ Error fetching tool definitions:', error);
            return [];
        }
    });
}
// Test database connection
function testConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield query('SELECT 1');
            console.log('✅ WebSocket server database connection successful');
            return true;
        }
        catch (error) {
            console.error('❌ WebSocket server database connection failed:', error);
            return false;
        }
    });
}
// Close pool (for cleanup)
function closePool() {
    return __awaiter(this, void 0, void 0, function* () {
        yield pool.end();
    });
}
// Personality options management
function getPersonalityOptions() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      SELECT id, category, value, description, is_active, sort_order
      FROM personality_options
      WHERE is_active = true
      ORDER BY category, sort_order, value
    `;
            const result = yield client.query(query);
            return result.rows;
        }
        finally {
            client.release();
        }
    });
}
// Languages management
function getLanguages() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      SELECT id, code, name, native_name, is_active, sort_order
      FROM languages
      WHERE is_active = true
      ORDER BY sort_order, name
    `;
            const result = yield client.query(query);
            return result.rows;
        }
        finally {
            client.release();
        }
    });
}
// Configuration CRUD operations
function createAgentConfig(configData) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      INSERT INTO agent_configs (
        config_title, config_description, name,
        identity_option_id, task_option_id, demeanor_option_id,
        tone_option_id, enthusiasm_option_id, formality_option_id,
        emotion_option_id, filler_words_option_id, pacing_option_id,
        primary_language_id, secondary_language_ids, custom_instructions,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
            const values = [
                configData.config_title,
                configData.config_description || null,
                configData.name,
                configData.identity_option_id || null,
                configData.task_option_id || null,
                configData.demeanor_option_id || null,
                configData.tone_option_id || null,
                configData.enthusiasm_option_id || null,
                configData.formality_option_id || null,
                configData.emotion_option_id || null,
                configData.filler_words_option_id || null,
                configData.pacing_option_id || null,
                configData.primary_language_id || null,
                configData.secondary_language_ids || [],
                configData.custom_instructions || [],
                false // New configs are not active by default
            ];
            const result = yield client.query(query, values);
            return result.rows[0];
        }
        finally {
            client.release();
        }
    });
}
function updateAgentConfig(id, configData) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('updateAgentConfig - ID:', id);
            console.log('updateAgentConfig - Config Data:', configData);
            console.log('updateAgentConfig - Config Data keys:', Object.keys(configData));
            // Simple update query - only update fields that are provided
            const updateFields = [];
            const values = [];
            let paramCount = 1;
            if (configData.config_title !== undefined) {
                updateFields.push(`config_title = $${paramCount}`);
                values.push(configData.config_title);
                paramCount++;
            }
            if (configData.config_description !== undefined) {
                updateFields.push(`config_description = $${paramCount}`);
                values.push(configData.config_description);
                paramCount++;
            }
            if (configData.name !== undefined) {
                updateFields.push(`name = $${paramCount}`);
                values.push(configData.name);
                paramCount++;
            }
            if (configData.identity_option_id !== undefined) {
                updateFields.push(`identity_option_id = $${paramCount}`);
                values.push(configData.identity_option_id);
                paramCount++;
            }
            if (configData.task_option_id !== undefined) {
                updateFields.push(`task_option_id = $${paramCount}`);
                values.push(configData.task_option_id);
                paramCount++;
            }
            if (configData.demeanor_option_id !== undefined) {
                updateFields.push(`demeanor_option_id = $${paramCount}`);
                values.push(configData.demeanor_option_id);
                paramCount++;
            }
            if (configData.tone_option_id !== undefined) {
                updateFields.push(`tone_option_id = $${paramCount}`);
                values.push(configData.tone_option_id);
                paramCount++;
            }
            if (configData.enthusiasm_option_id !== undefined) {
                updateFields.push(`enthusiasm_option_id = $${paramCount}`);
                values.push(configData.enthusiasm_option_id);
                paramCount++;
            }
            if (configData.formality_option_id !== undefined) {
                updateFields.push(`formality_option_id = $${paramCount}`);
                values.push(configData.formality_option_id);
                paramCount++;
            }
            if (configData.emotion_option_id !== undefined) {
                updateFields.push(`emotion_option_id = $${paramCount}`);
                values.push(configData.emotion_option_id);
                paramCount++;
            }
            if (configData.filler_words_option_id !== undefined) {
                updateFields.push(`filler_words_option_id = $${paramCount}`);
                values.push(configData.filler_words_option_id);
                paramCount++;
            }
            if (configData.pacing_option_id !== undefined) {
                updateFields.push(`pacing_option_id = $${paramCount}`);
                values.push(configData.pacing_option_id);
                paramCount++;
            }
            if (configData.primary_language_id !== undefined) {
                updateFields.push(`primary_language_id = $${paramCount}`);
                values.push(configData.primary_language_id);
                paramCount++;
            }
            if (configData.secondary_language_ids !== undefined) {
                updateFields.push(`secondary_language_ids = $${paramCount}`);
                values.push(configData.secondary_language_ids);
                paramCount++;
            }
            if (configData.custom_instructions !== undefined) {
                updateFields.push(`custom_instructions = $${paramCount}`);
                values.push(configData.custom_instructions);
                paramCount++;
            }
            // Technical fields
            if (configData.voice !== undefined) {
                updateFields.push(`voice = $${paramCount}`);
                values.push(configData.voice);
                paramCount++;
            }
            if (configData.model !== undefined) {
                updateFields.push(`model = $${paramCount}`);
                values.push(configData.model);
                paramCount++;
            }
            if (configData.temperature !== undefined) {
                updateFields.push(`temperature = $${paramCount}`);
                values.push(configData.temperature);
                paramCount++;
            }
            if (configData.max_tokens !== undefined) {
                updateFields.push(`max_tokens = $${paramCount}`);
                values.push(configData.max_tokens);
                paramCount++;
            }
            if (configData.input_audio_format !== undefined) {
                updateFields.push(`input_audio_format = $${paramCount}`);
                values.push(configData.input_audio_format);
                paramCount++;
            }
            if (configData.output_audio_format !== undefined) {
                updateFields.push(`output_audio_format = $${paramCount}`);
                values.push(configData.output_audio_format);
                paramCount++;
            }
            if (configData.turn_detection_type !== undefined) {
                updateFields.push(`turn_detection_type = $${paramCount}`);
                values.push(configData.turn_detection_type);
                paramCount++;
            }
            if (configData.turn_detection_threshold !== undefined) {
                updateFields.push(`turn_detection_threshold = $${paramCount}`);
                values.push(configData.turn_detection_threshold);
                paramCount++;
            }
            if (configData.turn_detection_prefix_padding_ms !== undefined) {
                updateFields.push(`turn_detection_prefix_padding_ms = $${paramCount}`);
                values.push(configData.turn_detection_prefix_padding_ms);
                paramCount++;
            }
            if (configData.turn_detection_silence_duration_ms !== undefined) {
                updateFields.push(`turn_detection_silence_duration_ms = $${paramCount}`);
                values.push(configData.turn_detection_silence_duration_ms);
                paramCount++;
            }
            if (configData.turn_detection_create_response !== undefined) {
                updateFields.push(`turn_detection_create_response = $${paramCount}`);
                values.push(configData.turn_detection_create_response);
                paramCount++;
            }
            if (configData.turn_detection_interrupt_response !== undefined) {
                updateFields.push(`turn_detection_interrupt_response = $${paramCount}`);
                values.push(configData.turn_detection_interrupt_response);
                paramCount++;
            }
            if (configData.turn_detection_eagerness !== undefined) {
                updateFields.push(`turn_detection_eagerness = $${paramCount}`);
                values.push(configData.turn_detection_eagerness);
                paramCount++;
            }
            if (configData.modalities !== undefined) {
                updateFields.push(`modalities = $${paramCount}`);
                values.push(JSON.stringify(configData.modalities));
                paramCount++;
            }
            if (configData.tools_enabled !== undefined) {
                updateFields.push(`tools_enabled = $${paramCount}`);
                values.push(configData.tools_enabled);
                paramCount++;
            }
            if (configData.enabled_tools !== undefined) {
                updateFields.push(`enabled_tools = $${paramCount}`);
                values.push(JSON.stringify(configData.enabled_tools));
                paramCount++;
            }
            if (updateFields.length === 0) {
                console.log('updateAgentConfig - No fields to update, received data:', configData);
                console.log('updateAgentConfig - Available fields in configData:', Object.keys(configData));
                // Instead of throwing an error, just update the timestamp
                console.log('updateAgentConfig - No valid fields to update, only updating timestamp');
            }
            // Add updated_at and id
            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);
            const query = `
      UPDATE agent_configs SET
        ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
            console.log('updateAgentConfig - Final updateFields:', updateFields);
            console.log('updateAgentConfig - Final values:', values);
            console.log('updateAgentConfig - Query:', query);
            console.log('updateAgentConfig - Values:', values);
            const result = yield client.query(query, values);
            console.log('updateAgentConfig - Query result:', result.rows);
            if (result.rows.length === 0) {
                throw new Error(`Configuration with id ${id} not found`);
            }
            return result.rows[0];
        }
        catch (error) {
            console.error('updateAgentConfig - Error:', error);
            console.error('updateAgentConfig - Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function deleteAgentConfig(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('deleteAgentConfig - Attempting to delete config with ID:', id);
            // First check if there are any sessions using this config
            const sessionCheckQuery = 'SELECT COUNT(*) as session_count FROM sessions WHERE config_id = $1';
            const sessionResult = yield client.query(sessionCheckQuery, [id]);
            const sessionCount = parseInt(sessionResult.rows[0].session_count);
            console.log('deleteAgentConfig - Found', sessionCount, 'sessions using this config');
            if (sessionCount > 0) {
                console.log('deleteAgentConfig - Deleting', sessionCount, 'sessions that reference this config');
                // Delete all sessions that reference this config
                const deleteSessionsQuery = 'DELETE FROM sessions WHERE config_id = $1';
                yield client.query(deleteSessionsQuery, [id]);
                console.log('deleteAgentConfig - Successfully deleted', sessionCount, 'sessions');
            }
            const query = 'DELETE FROM agent_configs WHERE id = $1';
            const result = yield client.query(query, [id]);
            console.log('deleteAgentConfig - Delete result rowCount:', result.rowCount);
            if (result.rowCount === 0) {
                throw new Error(`Configuration with id ${id} not found`);
            }
            console.log('deleteAgentConfig - Successfully deleted config with ID:', id);
        }
        catch (error) {
            console.error('deleteAgentConfig - Error deleting config:', error);
            console.error('deleteAgentConfig - Error message:', error instanceof Error ? error.message : 'Unknown error');
            console.error('deleteAgentConfig - Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function activateAgentConfig(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            yield client.query('BEGIN');
            // First, deactivate all configurations
            yield client.query('UPDATE agent_configs SET is_active = false');
            // Then activate the selected one
            const result = yield client.query('UPDATE agent_configs SET is_active = true WHERE id = $1', [id]);
            if (result.rowCount === 0) {
                throw new Error(`Configuration with id ${id} not found`);
            }
            yield client.query('COMMIT');
        }
        catch (error) {
            yield client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function createPersonalityOption(optionData) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const { category, value, sort_order } = optionData;
            const result = yield client.query(`INSERT INTO personality_options (category, value, description, sort_order, is_active, created_at, updated_at) 
       VALUES ($1, $2, null, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING *`, [category, value, sort_order || 1]);
            return result.rows[0];
        }
        catch (error) {
            console.error('Error creating personality option:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function updatePersonalityOption(id, optionData) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const { category, value, sort_order } = optionData;
            const result = yield client.query(`UPDATE personality_options 
       SET category = $1, value = $2, description = null, sort_order = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 
       RETURNING *`, [category, value, sort_order || 1, id]);
            if (result.rows.length === 0) {
                throw new Error(`Personality option with id ${id} not found`);
            }
            return result.rows[0];
        }
        catch (error) {
            console.error('Error updating personality option:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function deletePersonalityOption(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const result = yield client.query('DELETE FROM personality_options WHERE id = $1', [id]);
            if (result.rowCount === 0) {
                throw new Error(`Personality option with id ${id} not found`);
            }
        }
        catch (error) {
            console.error('Error deleting personality option:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
// Conversation Messages Functions
function saveConversationMessage(sessionId_1, messageType_1, content_1, streamSid_1, metadata_1, audioDurationMs_1) {
    return __awaiter(this, arguments, void 0, function* (sessionId, messageType, content, streamSid, metadata, audioDurationMs, isAudio = false) {
        const client = yield pool.connect();
        try {
            console.log('saveConversationMessage - Saving message:', {
                sessionId,
                messageType,
                content: content.substring(0, 100) + '...',
                streamSid,
                isAudio,
                audioDurationMs
            });
            const query = `
      SELECT save_conversation_message($1, $2, $3, $4, $5, $6, $7)
    `;
            const result = yield client.query(query, [
                sessionId,
                messageType,
                content,
                streamSid || null,
                JSON.stringify(metadata || {}),
                audioDurationMs || null,
                isAudio
            ]);
            const messageId = result.rows[0].save_conversation_message;
            console.log('saveConversationMessage - Saved message with ID:', messageId);
            return messageId;
        }
        catch (error) {
            console.error('Error saving conversation message:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getConversationMessages(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('getConversationMessages - Getting messages for session:', sessionId);
            const query = 'SELECT * FROM get_conversation_messages($1)';
            const result = yield client.query(query, [sessionId]);
            console.log('getConversationMessages - Found', result.rows.length, 'messages');
            return result.rows;
        }
        catch (error) {
            console.error('Error getting conversation messages:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function createSession(sessionId, configId, twilioStreamSid) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('createSession - Creating session:', { sessionId, configId, twilioStreamSid });
            const query = `
      INSERT INTO sessions (session_id, config_id, twilio_stream_sid, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id
    `;
            const result = yield client.query(query, [sessionId, configId || null, twilioStreamSid || null]);
            const dbSessionId = result.rows[0].id;
            console.log('createSession - Created session with ID:', dbSessionId);
            return dbSessionId;
        }
        catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function updateSessionStatus(sessionId, status) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('updateSessionStatus - Updating session:', { sessionId, status });
            const query = `
      UPDATE sessions 
      SET status = $1, ended_at = CASE WHEN $1 = 'ended' THEN CURRENT_TIMESTAMP ELSE ended_at END
      WHERE id = $2
    `;
            yield client.query(query, [status, sessionId]);
            console.log('updateSessionStatus - Updated session status:', { sessionId, status });
        }
        catch (error) {
            console.error('Error updating session status:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getAllSessions() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('getAllSessions - Getting all sessions');
            const query = `
      SELECT 
        s.*,
        ac.name as agent_name,
        ac.config_title,
        COUNT(cm.id) as message_count
      FROM sessions s
      LEFT JOIN agent_configs ac ON s.config_id = ac.id
      LEFT JOIN conversation_messages cm ON s.id = cm.session_id
      GROUP BY s.id, s.session_id, s.config_id, s.twilio_stream_sid, s.status, s.started_at, s.ended_at, ac.name, ac.config_title
      ORDER BY s.started_at DESC
    `;
            const result = yield client.query(query);
            console.log('getAllSessions - Found', result.rows.length, 'sessions');
            return result.rows;
        }
        catch (error) {
            console.error('Error getting all sessions:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getSessionWithMessages(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            console.log('getSessionWithMessages - Getting session with messages:', sessionId);
            // Get session info
            const sessionQuery = 'SELECT * FROM sessions WHERE id = $1';
            const sessionResult = yield client.query(sessionQuery, [sessionId]);
            if (sessionResult.rows.length === 0) {
                throw new Error(`Session with id ${sessionId} not found`);
            }
            const session = sessionResult.rows[0];
            // Get messages
            const messages = yield getConversationMessages(sessionId);
            return Object.assign(Object.assign({}, session), { messages: messages });
        }
        catch (error) {
            console.error('Error getting session with messages:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
// Tool Configuration Functions
function getToolConfigurations(toolName) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            let query = `
      SELECT tool_name, config_key, config_value, description, is_secret, enabled, created_at, updated_at
      FROM tool_configurations
    `;
            const params = [];
            if (toolName) {
                query += ' WHERE tool_name = $1';
                params.push(toolName);
            }
            query += ' ORDER BY tool_name, config_key';
            const result = yield client.query(query, params);
            return result.rows;
        }
        catch (error) {
            console.error('Error fetching tool configurations:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function updateToolConfiguration(toolName, configKey, configValue) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      INSERT INTO tool_configurations (tool_name, config_key, config_value, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (tool_name, config_key)
      DO UPDATE SET 
        config_value = EXCLUDED.config_value,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
            const result = yield client.query(query, [toolName, configKey, configValue]);
            return result.rows[0];
        }
        catch (error) {
            console.error('Error updating tool configuration:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getToolConfiguration(toolName, configKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      SELECT tool_name, config_key, config_value, description, is_secret, enabled, created_at, updated_at
      FROM tool_configurations
      WHERE tool_name = $1 AND config_key = $2
    `;
            const result = yield client.query(query, [toolName, configKey]);
            return result.rows[0] || null;
        }
        catch (error) {
            console.error('Error fetching tool configuration:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
function getToolConfigurationsAsObject(toolName) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield pool.connect();
        try {
            const query = `
      SELECT config_key, config_value, description, is_secret, enabled
      FROM tool_configurations
      WHERE tool_name = $1 AND enabled = true
      ORDER BY config_key
    `;
            const result = yield client.query(query, [toolName]);
            const config = {};
            result.rows.forEach(row => {
                config[row.config_key] = row.config_value;
            });
            return config;
        }
        catch (error) {
            console.error('Error fetching tool configurations as object:', error);
            throw error;
        }
        finally {
            client.release();
        }
    });
}
