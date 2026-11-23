# Bantr

Bantr is an AI dating simulator for practicing real conversations.
You go on live voice (and optional video) dates with AI characters, get a review of the whole conversation, and the app remembers your strengths and weaknesses to pick a next date that targets what you need to work on.

## Features

- **Live voice dates** with ElevenLabs agents, plus optional HeyGen LiveAvatar video.
- **Characters** - built-in personas, or describe someone and Claude generates a fictional character with a matching voice and avatar.
- **Whole-date reviews** - Claude scores listening, engagement, confidence, and flow, with examples from your transcript.
- **Adaptive practice** - your skill profile picks the next scenario, and Riley, a coach character, rehearses moments from past dates with you.
- **Progress dashboard** - track how each skill changes across dates.

## Tech stack

Wasp (React 19, Node, Prisma), PostgreSQL, Tailwind v4, ElevenLabs Agents, HeyGen LiveAvatar, and Claude.

## Running locally

```bash
npm i -g @wasp.sh/wasp-cli
cd app
wasp install
cp .env.server.example .env.server   # add ElevenLabs, Anthropic, and optional HeyGen keys
wasp start db                        # dev Postgres in Docker
wasp db migrate-dev                  # in a second terminal
wasp start                           # client :3000, server :3001
```

Each hosted ElevenLabs agent uses [the session prompt template](app/prompts/elevenlabs/session-v1.md) as its system prompt, with `{{opening_line}}` as its first message.
