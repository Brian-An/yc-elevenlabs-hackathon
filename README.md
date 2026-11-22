# yc-elevenlabs-hackathon

## Running locally

The app lives in `app/` (Wasp 0.26, React 19, Tailwind v4, shadcn + [Arc](https://uiarc.dev), PostgreSQL).

```bash
npm i -g @wasp.sh/wasp-cli
cd app
wasp install
cp .env.server.example .env.server   # add ElevenLabs keys (and DATABASE_URL if not using Docker)
wasp start db                        # dev Postgres in Docker; skip if DATABASE_URL points at your own Postgres
wasp db migrate-dev                  # in a second terminal if `wasp start db` is running
wasp start                           # client :3000, server :3001
```

Where things are:

- `main.wasp.ts`: routes, operations, the ElevenLabs signed-URL API. There is no login: the browser keeps a user ID in localStorage (`src/client/userId.ts`) and every operation takes it as `userId`, e.g. `useQuery(getProfile, { userId: getUserId() })`
- `schema.prisma`: `User`, `DateSession`, `UserMemory` (PostgreSQL `Json` columns, typed in `src/server/dto.ts`)
- `src/server/`: operations, personas, `evaluator.ts` (rule-based stub, replace with the LLM evaluator), `memory.ts` (skill profile, training focus, strengths and weaknesses, stored in Postgres), `elevenlabs.ts`
- `src/pages/`: all pages, currently on mock data from `src/client/mockData.ts` (each page has a `useQuery` swap noted inline)
- `src/client/useDateConversation.ts`: where the ElevenLabs conversation plugs in
- `src/shared/types.ts`: shared contracts (Transcript, Evaluation, Persona, Scenario)

User memory lives in Postgres (`User.preferences` + `UserMemory`). `getProfile` returns it as:

```json
{
  "preferences": { "personality": ["outgoing", "funny"], "dateSetting": "coffee" },
  "memory": {
    "skillProfile": { "listening": 0.6, "engagement": 0.8, "confidence": 0.7, "flow": 0.5 },
    "trainingFocus": "flow",
    "strengths": [], "weaknesses": [], "skillHistory": [], "sessionsCount": 3
  }
}
```

`skillProfile` is the 0 to 1 average of the last 3 evaluated dates, and `trainingFocus` is the weakest skill. `endDateSession` updates both, and `getNextScenario` uses them to pick the next date.


### Voice calls and follow-ups

A date runs a real ElevenLabs call when the server knows an agent for that persona (`ELEVENLABS_AGENT_ID_MAYA`, `_THEO`, `_PRIYA`, or the default `ELEVENLABS_AGENT_ID`) and `ELEVENLABS_API_KEY` is set. Without them, `src/client/useDateConversation.ts` replays a sample date, so the rest of the app still works.

Follow-ups: when a date ends, `src/server/callbackExtract.ts` picks one thing the user explicitly shared (e.g. "I'm taking a pottery class on Saturday") and saves it for that user and persona (`PersonaCallback`). The next date with that persona passes it to the agent as the dynamic variable `{{user_context}}` (or `None`). Add this to each agent's system prompt in ElevenLabs:

```
What you remember from your last date with them: {{user_context}}
If that isn't "None", bring it up once, naturally, when it fits, as a question
(e.g. "Wait, how did that pottery class go?"). Don't quote it back word for word.
```

# bantr — Hackathon Build Plan

**Concept:** An AI-powered dating simulator that helps users practice real-life dating conversations, receive personalized feedback, and improve over time.

**Core differentiator:** Rather than being a generic AI companion, the system remembers your strengths and weaknesses and adapts future dates to help you improve.

## 1. Final tech stack

| Technology       | Responsibility                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| **ElevenLabs**   | Real-time voice conversations, AI character voice and avatar presentation       |
| **Wasp + PostgreSQL** | Backend, API orchestration, and persistent user memory (preferences, skill profile, strengths, weaknesses, past sessions) |
| **assistant-ui** | Chat interface, live transcripts, and coaching feedback                         |
| **TraceRoot**    | Agent tracing, evaluation, and monitoring                                       |

For avatars, use a visual avatar component alongside ElevenLabs audio. Confirm whether your chosen ElevenLabs integration supports the animated avatar experience you want.

## 2. Core features to build

### 1. Onboarding

- [ ] User chooses dating goals, preferences, and experience level
- [ ] Create a persistent user profile
- [ ] Allow users to select a date scenario and personality

### 2. AI Date Simulator

- [ ] Implement real-time ElevenLabs voice conversations
- [ ] Display an AI character/avatar and live chat transcript
- [ ] Support different personalities and conversational difficulty
- [ ] Make the AI react naturally to user responses

### 3. Personalized Evaluation

- [ ] Evaluate transcripts for listening, engagement, confidence, and conversational flow
- [ ] Provide specific feedback supported by transcript examples
- [ ] Save strengths and weaknesses to user memory in Postgres
- [ ] Track skill development across sessions

### 4. Adaptive Training

- [ ] Generate future scenarios targeting identified weaknesses
- [ ] Implement rewind-and-retry for difficult conversation moments
- [ ] Adjust difficulty based on previous performance

### 5. Demo and Submission

- [ ] Connect the frontend, backend, memory, and evaluation pipeline
- [ ] Test with real voice input and verify traces
- [ ] Record a publicly accessible 2-minute demo video
- [ ] Submit project link, demo video, and partner tools by 3:00 PM

## 3. Four-person team allocation

| Person                         | Focus                     | Deliverables                              |
| ------------------------------ | ------------------------- | ----------------------------------------- |
| **1. Voice & Avatar**          | ElevenLabs                | Working conversational AI character       |
| **2. Backend & Memory**        | Wasp + PostgreSQL         | Profiles, sessions, saved memory          |
| **3. Frontend**                | React + assistant-ui      | Date simulator, transcript, feedback UI   |
| **4. Evaluation & Adaptation** | TraceRoot + LLM evaluator | Skill assessments, personalized scenarios |

## 4. Minimum viable user flow

1. **Onboarding** — Tell the AI about yourself
2. **Choose a date** — Select persona and scenario
3. **Practice** — Have a realistic voice conversation
4. **Get feedback** — See specific strengths and weaknesses
5. **Improve** — Save memory and generate targeted practice

## 5. Priorities for today's deadline

**Must have:** A real-time voice date, transcript, post-date evaluation, and persistence of user-specific feedback.

**Strong additions:** Adaptive follow-up date, rewind-and-retry, multiple personas, and a progress dashboard.

**Out of scope:** Matchmaking, searching for real people, dating-app integration, training an actual RL model, and complex avatar animation.

## 6. Three-minute judging demo

1. **0:00–0:30:** Explain the problem and show a fictional dating persona.
2. **0:30–1:30:** Have a live conversation using ElevenLabs, deliberately demonstrating an awkward interaction.
3. **1:30–2:15:** End the session and generate actionable feedback using the evaluator.
4. **2:15–3:00:** Show the app remembering the user's weakness and generating a more targeted follow-up date.

**The most important outcome:** Judges should see an AI that remembers how you communicate and actively helps you get better, rather than simply having conversations with you.

Given the 3:00 PM submission deadline, prioritize getting the full voice → transcript → evaluation → memory → next scenario loop working before adding extra features.
