# tac-voice-sample

A TypeScript sample app using [Twilio Agent Connect (TAC)](https://www.twilio.com/docs/platform/tac/overview) to handle inbound **Voice** and **SMS** conversations, routing each message to a **Claude** AI agent.

## Architecture

```
Twilio (Voice / SMS)
        │
        ▼
   TACServer (Express)
        │
     TAC SDK
   ┌────┴─────┐
   │          │
VoiceChannel  SMSChannel
   └────┬─────┘
        │  onMessageReady
        ▼
   src/agent.ts   ← Claude claude-sonnet-4-6 via Anthropic SDK
        │
   Per-conversation history + optional Twilio Memory context
```

- **`src/index.ts`** — wires TAC channels and starts the server
- **`src/agent.ts`** — self-contained Claude agent with per-conversation history

## Prerequisites

- Node.js ≥ 22.13
- A Twilio account with:
  - A phone number capable of Voice + SMS
  - TAC services provisioned (run the [TAC setup wizard](https://github.com/twilio/twilio-agent-connect-typescript))
- An [Anthropic API key](https://console.anthropic.com/)
- [ngrok](https://ngrok.com/) (for local development)

## Setup

### 1. Install the TAC TypeScript SDK

TAC is not yet published to npm. Clone and build it alongside this project:

```bash
git clone https://github.com/twilio/twilio-agent-connect-typescript.git
cd twilio-agent-connect-typescript
npm install && npm run build
cd ..
```

Then, in `package.json`, update the `twilio-agent-connect` dependency path if you cloned it locally:

```json
"twilio-agent-connect": "file:../twilio-agent-connect-typescript"
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_API_KEY` | Twilio API Key SID |
| `TWILIO_API_SECRET` | Twilio API Key Secret |
| `TWILIO_CONVERSATION_CONFIGURATION_ID` | From the TAC setup wizard |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number |
| `TWILIO_VOICE_PUBLIC_DOMAIN` | Public domain for ConversationRelay WebSocket |
| `TWILIO_MEMORY_STORE_ID` | (Optional) Conversation Memory store ID |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### 4. Expose your local server

```bash
ngrok http 3000
```

Set `TWILIO_VOICE_PUBLIC_DOMAIN` to the ngrok hostname (e.g. `abc123.ngrok.io`, no `https://`).

### 5. Configure Twilio webhooks

In the [Twilio Console](https://console.twilio.com/), set your phone number's:

- **Voice webhook** → `https://<your-domain>/voice`
- **SMS webhook** → `https://<your-domain>/sms`

### 6. Run

```bash
# Development (tsx, no compile step)
npm run dev

# Production
npm run build && npm start
```

## How it works

1. An inbound call or SMS arrives at your Twilio number.
2. TAC's `VoiceChannel` or `SMSChannel` handles the Twilio protocol (TwiML, ConversationRelay WebSocket for voice; webhook for SMS).
3. TAC invokes `onMessageReady` with the user's message plus any Twilio Conversation Memory context.
4. `src/agent.ts` appends the message to the per-conversation history, calls Claude with the full history, and returns the reply.
5. TAC sends the reply back to the caller or SMS sender.
6. When the conversation ends, history is cleared to free memory.

## Customising the agent

Edit `src/agent.ts`:

- Change `SYSTEM_PROMPT` to give the agent a different persona or instructions.
- Change `model` to another Claude model (e.g. `claude-opus-4-8` for higher capability).
- Add tool use via `anthropic.messages.create({ tools: [...] })` for function calling.

## License

MIT
