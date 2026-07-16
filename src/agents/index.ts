import Anthropic from '@anthropic-ai/sdk';

import {
  TAC,
  MemoryPromptBuilder,
  type TACMemoryResponse,
  type ConversationSession,
  type ConversationId,
} from 'twilio-agent-connect';

import { TOOLS, getAllTools, executeTool, extractCustomerProfileId, getProfileTraitsForPrompt } from '../tools/index.js';
import { AGENTS, AGENT_NAMES } from './prompts.js';

let claude: Anthropic | undefined;


// Per-conversation message history keyed by conversationId
const histories = new Map<string, Anthropic.MessageParam[]>();
const intents = new Map<string, string>();

const preparePrompt = async (
  
  profileId: string | undefined,
  memorySid: string | undefined,
  memory: TACMemoryResponse | undefined,
  session: ConversationSession,
  prompt: string | undefined) => {


  // Fetch profile traits if we have a profile ID
  const traitsContext = process.env.TWILIO_MEMORY_LOAD_TRAITS ? await getProfileTraitsForPrompt(profileId, memorySid) : '';

  // Get current date and time for temporal context
  const now = new Date();
  const dateTimeContext = `\n\nCurrent date and time: ${now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York', // Adjust to your stadium's timezone
  })}`;

  // Inject Twilio Conversation Memory + session context + profile traits into the system prompt
  const memoryContext = MemoryPromptBuilder.build(memory, session);
  
  const systemPrompt =
    prompt +
    dateTimeContext +
    (traitsContext ? traitsContext : '') +
    (memoryContext ? `\n\n${memoryContext}` : '');

  return systemPrompt;
}


export async function handleMessage(tac: TAC, params: {
  conversationId: ConversationId;
  message: string;
  memory: TACMemoryResponse | undefined;
  session: ConversationSession;
}): Promise<string> {

  const { conversationId, message, memory, session } = params;
  const convId = String(conversationId);

   // initilaize conversation history in local array if it doesnt already exist
  if (!histories.has(convId)) histories.set(convId, []);
  if (!intents.has(convId)) intents.set(convId, "INTENT_DETECTION");

  // fetch the converstion
  const history = histories.get(convId)!;
  const intent = intents.get(convId)! as string;

  console.log("INTENT IS:", intent);

  // store customers message
  history.push({ role: 'user', content: message });

  // initialize claude if it hasnt already
  claude ??= new Anthropic();

  // Extract customer profile ID from TAC memory response
  const profileId = extractCustomerProfileId(memory);
  const memorySid = process.env.TWILIO_MEMORY_STORE_ID;

  // generate the prompt for the relevant agent
  const systemPrompt = await preparePrompt(profileId, memorySid, memory, session, AGENTS[intent].prompt)
  
  
  let response = await claude.messages.create({
    model: AGENTS[intent].model,
    max_tokens: AGENTS[intent].max_tokens || 512,
    system: systemPrompt,
    messages: history,
    tools: AGENTS[intent].tools,
  });

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (intent === "INTENT_DETECTION"){
    
    if(Object.values(AGENT_NAMES).includes(reply as AGENT_NAMES)) {
      intents.set(convId, reply);
      return handleMessage(tac, { conversationId, message, memory, session })
    } else {
      history.push({ role: 'assistant', content: reply });
      return reply;
    }

  } else if (reply === "CHANGE_INTENT"){
    intents.set(convId, "INTENT_DETECTION");
    return handleMessage(tac, { conversationId, message, memory, session })
  } else {

    console.log("Claude Response: " + JSON.stringify(response, null, 4));
    
    // Handle tool calls (agentic loop)
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Add assistant's response (including tool_use blocks) to history
      history.push({
        role: 'assistant',
        content: response.content,
      });

      // Execute all tool calls and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          console.log(`[TOOL_CALL] ${toolUse.name} with input:`, toolUse.input);
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            { profileId, memorySid }
          );
          console.log(`[TOOL_RESULT] ${toolUse.name}:`, result.substring(0, 200) + '...');

          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          };
        })
      );

      // Add tool results to history
      history.push({
        role: 'user',
        content: toolResults,
      });

      // Continue the conversation with tool results
      response = await claude.messages.create({
        model: AGENTS[intent].model,
        max_tokens: AGENTS[intent].max_tokens || 512,
        system: systemPrompt,
        messages: history,
        tools: AGENTS[intent].tools,
      });
    }

    // Extract final text response
    const final_reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    history.push({ role: 'assistant', content: final_reply });

    return reply;
}
}

export function clearConversation(conversationId: string): void {
  histories.delete(conversationId);
  intents.delete(conversationId);
}
