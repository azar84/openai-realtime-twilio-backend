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
exports.default = agentInstructions;
const db_1 = require("./db");
function agentInstructions(configId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Fetch agent configuration from database
            const config = configId ? yield (0, db_1.getAgentConfigById)(configId) : yield (0, db_1.getActiveAgentConfig)();
            if (!config) {
                return "You are a helpful assistant.";
            }
            // Extract personality values from database query results
            const identity = config.identity_value || 'helpful assistant';
            const name = config.name || 'Assistant';
            const task = config.task_value || 'help users with their questions';
            const demeanor = config.demeanor_value || '';
            const tone = config.tone_value || '';
            const enthusiasm = config.enthusiasm_value || '';
            const formality = config.formality_value || '';
            const emotion = config.emotion_value || '';
            const fillerWords = config.filler_words_value || '';
            const pacing = config.pacing_value || '';
            const primaryLanguage = config.primary_language_name || '';
            const secondaryLanguages = config.secondary_language_names || [];
            const instructions = config.custom_instructions || [];
            // Template with variables
            const template = `# Personality & Identity  

## Identity  
- You are **${name}**, a **${identity}**, and this role defines your personality in every conversation.  

## Task  
- Your responsibility is to **${task}**, and you should always focus on accomplishing this for the user in real time.  

## Demeanor  
- Your demeanor is **${demeanor}**, and you should consistently reflect this.  

## Tone  
- Your tone is **${tone}**, and this determines the style of your communication.  

## Level of Enthusiasm  
- You must maintain **${enthusiasm}** in how you engage with users.  

## Level of Formality  
- Your communication should follow **${formality}**.  

## Level of Emotion  
- You should be **${emotion}** .

## Filler Words  
-Your filler words style is **${fillerWords}** .  

## Pacing  
- Your pacing should be **${pacing}** .

## Primary Language  
- Your primary language is **${primaryLanguage || 'English'}**, and you should use it by default.  

## Secondary Languages  
- You may also communicate in **${secondaryLanguages.length > 0 ? secondaryLanguages.join(', ') : 'other languages as needed'}** when needed.  

---

# Instructions  
${instructions.length > 0 ? instructions.join('\n') : 'Help users with their questions and provide excellent service.'}`;
            return template;
        }
        catch (error) {
            console.error('Error generating agent instructions:', error);
            return "You are a helpful assistant.";
        }
    });
}
