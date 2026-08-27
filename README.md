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

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

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

### 3. Expose your local server

```bash
ngrok http 3000
```

Set `TWILIO_VOICE_PUBLIC_DOMAIN` to the ngrok hostname (e.g. `abc123.ngrok.io`, no `https://`).

### 4. Configure Twilio webhooks

In the [Twilio Console](https://console.twilio.com/), set your phone number's:

- **Voice webhook** → `https://<your-domain>/twiml`

### 5. Run

```bash
# Development (tsx, no compile step)
npm run dev

# Production
npm run build && npm start
```

## How it works

1. An inbound call or SMS arrives at your Twilio number.
2. TAC's `VoiceChannel` handles the Twilio protocol (TwiML, ConversationRelay WebSocket for voice).
3. TAC invokes `onMessageReady` with the user's message plus any Twilio Conversation Memory context.
4. `src/agent.ts` appends the message to the per-conversation history, calls Claude with the full history, and returns the reply.
5. TAC sends the reply back to the caller.
6. When the conversation ends, history is cleared to free memory.

## License

MIT
