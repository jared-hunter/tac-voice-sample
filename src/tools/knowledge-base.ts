
import {
  TAC,
  createKnowledgeSearchTool
} from 'twilio-agent-connect';

// import { registerKnowledgeTool } from './agent.js';


export const createKnowledgeToolFromConfig = (tac: TAC) => {

    if(!process.env.TWILIO_KNOWLEDGE_BASE_ID || !process.env.TWILIO_KNOWLEDGE_BASE_PROMPT) return;

    try {
        const knowledgeClient = (tac as any).knowledgeClient;

        if (knowledgeClient) {
            const knowledgeTool = createKnowledgeSearchTool(
                knowledgeClient,
                process.env.TWILIO_KNOWLEDGE_BASE_ID,
                {
                    name: 'search_knowledge_base',
                    description: process.env.TWILIO_KNOWLEDGE_BASE_PROMPT,
                    topK: 3,
                }
            );

            // Pass to agent
            console.log(`[TAC] Created knowledge base tool: ${process.env.TWILIO_KNOWLEDGE_BASE_ID}`);
            return knowledgeTool;
        } 
        else {
            console.warn('[TAC] Knowledge client not available');
        }
    } catch (error) {
        console.error('[TAC] Failed to create knowledge tool:', error);
    }
}
