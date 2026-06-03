import Anthropic from '@anthropic-ai/sdk';

import {
  TAC,
  type TACTool,
} from 'twilio-agent-connect';

import { createKnowledgeToolFromConfig } from './knowledge-base.js'
import {
  getProfile,
  formatTraitsForPrompt,
  updateProfileTraits,
} from './memory-client.js';


let tacKnowledgeTool: TACTool<any, any> | undefined;

export { extractCustomerProfileId, getProfileTraitsForPrompt } from './memory-client.js';

// Tool definitions for Claude so claude knows how to use them
export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_contact_info',
    description:
      'Update customer contact information (first name, last name, email) in their profile. Use when customer provides missing contact details.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: {
          type: 'string',
          description: 'Customer first name',
        },
        last_name: {
          type: 'string',
          description: 'Customer last name',
        },
        email: {
          type: 'string',
          description: 'Customer email address',
        },
      },
      required: [],
    },
  },
  {
    name: 'place_outbound_call',
    description:
      'Place an outbound voice call to the customer using the phone number on their profile. Use when the customer requests a callback or when a voice follow-up is needed.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];


/**
 * Execute a tool call and return the result
 */
export const executeTool = async (
  toolName: string,
  toolInput: Record<string, unknown>,
  context?: { profileId?: string; memorySid?: string }
): Promise<string>  => {
  switch (toolName) {

    case 'update_contact_info': {
      if (!context?.profileId || !context?.memorySid) {
        return 'Error: Cannot update contact info - no profile found.';
      }

      const { first_name, last_name, email } = toolInput as {
        first_name?: string;
        last_name?: string;
        email?: string;
      };

      const traits: Record<string, any> = { Contact: {} };

      if (first_name) traits.Contact.firstName = first_name;
      if (last_name) traits.Contact.lastName = last_name;
      if (email) traits.Contact.email = email;

      const success = await updateProfileTraits(context.memorySid, context.profileId, traits);

      if (success) {
        const updated = [];
        if (first_name) updated.push('first name');
        if (last_name) updated.push('last name');
        if (email) updated.push('email');
        return `Successfully updated your ${updated.join(', ')}.`;
      }

      return 'Failed to update contact information. Please try again.';
    }

    case 'place_outbound_call': {
      if (!context?.profileId || !context?.memorySid) {
        return 'Error: Cannot place call - no customer profile found.';
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      const publicDomain = process.env.TWILIO_VOICE_PUBLIC_DOMAIN;

      if (!accountSid || !authToken || !fromNumber || !publicDomain) {
        return 'Error: Missing required environment variables for outbound calls (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_VOICE_PUBLIC_DOMAIN).';
      }

      const profile = await getProfile(context.memorySid, context.profileId);
      const toNumber = profile?.traits?.Contact?.phone as string | undefined;

      if (!toNumber) {
        return 'Error: No phone number found on customer profile. Cannot place call.';
      }

      const twimlUrl = `https://${publicDomain}/twiml`;
      const callsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const body = new URLSearchParams({
        Url: twimlUrl,
        To: toNumber,
        From: fromNumber,
      });

      console.log(`[OUTBOUND_CALL] Calling ${toNumber} from ${fromNumber} via ${twimlUrl}`);

      const response = await fetch(callsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[OUTBOUND_CALL] Failed: ${response.status} ${errorBody}`);
        return `Failed to place call: ${response.status}`;
      }

      const result = await response.json() as { sid: string };
      console.log(`[OUTBOUND_CALL] Initiated call SID: ${result.sid}`);
      return `Outbound call initiated to ${toNumber}. Call SID: ${result.sid}`;
    }

    default:
      if (tacKnowledgeTool && toolName === tacKnowledgeTool.name) {
        const result = await tacKnowledgeTool.implementation(toolInput as any);

        if (Array.isArray(result) && result.length > 0) {
          return result
            .map((chunk: any, idx: number) =>
              `[Document ${idx + 1}]\n${chunk.content}${chunk.score ? `\n(Relevance: ${Math.round(chunk.score * 100)}%)` : ''}`
            )
            .join('\n\n---\n\n');
        }
        return 'No relevant information found in knowledge base.';
      }

      return `Unknown tool: ${toolName}`;
  }
}

export const tacToolToAnthropicTool = (tacTool: TACTool<any, any>): Anthropic.Tool => {
  return {
    name: tacTool.name,
    description: tacTool.description,
    input_schema: tacTool.parameters as any,
  };
}

export const getAllTools = (tac: TAC): Anthropic.Tool[] => {
  const tools = [...TOOLS];
  tacKnowledgeTool = createKnowledgeToolFromConfig(tac)
  if (tacKnowledgeTool) {
    tools.push(tacToolToAnthropicTool(tacKnowledgeTool));
  }
  return tools;
}