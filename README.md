# yc-elevenlabs-hackathon

See [development handoffs](docs/development-handoffs.md) for parallel assignments and acceptance checks.

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
- `src/server/`: operations, personas, Jev reply grading, Anthropic date reviews, user memory, and call providers.
- `src/pages/`: plaza, date, feedback, onboarding, and dashboard pages
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

`skillProfile` is the 0 to 1 average of the last 3 evaluated dates, and `trainingFocus` is the weakest skill. A completed date review updates both, and `getNextScenario` uses them to pick the next date.


### Configure voice, avatars, and Riley

Bantr resolves the character from the active session and the browser's user ID.
Configure `ELEVENLABS_API_KEY` and a persona agent ID for Maya, Theo, Priya, or Riley (`ELEVENLABS_AGENT_ID_COACH`).
A shared `ELEVENLABS_AGENT_ID` can serve every character with one voice.
An unconfigured persona uses the demo call path when the session is created.

In each hosted ElevenLabs agent, replace its system prompt with [the versioned session template](app/prompts/elevenlabs/session-v1.md) and set its **First message** to `{{opening_line}}`.
Use an Anthropic model for the agent and preserve its voice settings.
For a dashboard test, supply `character_direction` (e.g. "You are Maya, a warm designer learning ceramics"), `session_context` (e.g. `{"setting":"a coffee shop"}`), and `opening_line` (e.g. "How was your morning?").
An agent with the original fixed prompt and greeting keeps using its hosted character script until the template is published.
[ElevenLabs dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)

The server builds the same brief for ElevenLabs voice and HeyGen video.
Dates receive their stored scenario and the personal callback associated with that character.
Riley receives the selected reviewed practice date, or the latest eligible review for the same browser user, including the original exchange and a proposed rehearsal.
With no reviewed date Riley asks what to practice.
The inline LiveAvatar connector receives these values in `elevenlabs_agent_config.dynamic_variables`.
[LiveAvatar connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)

### Onboarding and generated characters

A browser that has not finished or skipped onboarding goes to a three-step first run: who to practice with, what to work on, and a first date.
The goals become the profile's focus skills, and the last step starts a date with a starter character or opens the character generator.
After that, `/onboarding` edits the profile.

On the Characters page a user describes someone, and Claude writes a fictional character like them, with its own invented name.
Choices the user makes (gender, age, background, voice, setting, difficulty) override the model, and the preview shows which traits came from the notes and which the model chose.
Characters are private to the browser user, limited to 12 at a time and 20 generations a day.
The four newest wait at the plaza's spare café tables, and any of them can be dated from the Characters page.
Deleting one keeps its name for date history and erases the user's notes and any follow-up detail.

Generated characters share one hosted agent, `ELEVENLABS_AGENT_ID_CUSTOM` (falling back to `ELEVENLABS_AGENT_ID`), set up with the same session template.
Each character gets a voice from the account's ElevenLabs voices, chosen by gender, accent, age and tone, and sent as a per-session override.
In that agent's **Security** tab, enable the **Voice** override, or calls with a generated character fail to start.
The same voice reaches HeyGen video through the LiveAvatar connector's `voice_id`.

With HeyGen out of sandbox mode and an Anthropic key, the hourly `refreshAvatarCatalog` job lists the account's and public LiveAvatar avatars and describes each preview image once with Claude.
A new character is matched to the closest described avatar of its gender; until the catalog is described, characters use the default avatar.
`ANTHROPIC_CHARACTER_MODEL` selects the model for both, and refusals fall back to another model server-side.

### Whole-date reviews

Set `ANTHROPIC_API_KEY` on the server to enable full-transcript reviews.
The optional `ANTHROPIC_REVIEW_MODEL` selects the model, and `ANTHROPIC_BASE_URL` points requests at a gateway or test double.
Apply the checked-in Prisma migrations before running the updated app.
Only evidenced live practice reviews contribute to skill progress.
Earlier evaluations remain available in date history.

Ending a live date freezes its transcript and creates a `ReviewJob` in the same transaction, then returns without waiting for the provider.
The job's identity is the session, the transcript hash, and the rubric version.
A PgBoss job (`runDateReview`) wakes a worker right away, and `sweepDateReviews` runs every minute to recover lost wake-ups and crashed workers.
A worker holds a two-minute lease on the job, and every write checks that lease.
A validated review is stored before it is projected into memory, so a crash after inference never repeats the provider call.
The memory projection replaces the session's earlier contribution, so a recovered review still leaves one memory entry.

Failed attempts retry after 30 seconds, 2, 8, and 32 minutes, with jitter, and honor the provider's `retry-after`.
A 4xx rejection other than 429 stops at once.
After 5 attempts the feedback page offers a retry, which grants another 5.
While the key is missing, jobs wait without using attempts and run once it is configured.
The feedback page and plaza recap poll until the review is ready and say when the next attempt runs.

Each attempt logs one `date_review_attempt` JSON line with the outcome, failure class, provider latency, and token usage, never dialogue.
The `ReviewJob` row keeps the attempt count, latest failure class and latency, and summed tokens.
History lists read `turnCount`, `replyCount`, and `reviewScores` columns instead of the transcript and full review.

The worker tests run against PostgreSQL.
Point `TEST_DATABASE_URL` at a migrated, disposable database to include them; otherwise they are skipped:

```bash
cd app
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/bantr_test npx vitest run
```

### Jev grading benchmark

Set `TYPESAFE_API_KEY` in `app/.env.server` and run this from the repo root with Node 24:

```bash
node --env-file-if-exists=app/.env.server app/scripts/jev-benchmark.mjs
```

The script runs both rubrics three times on 30 labeled synthetic replies using the same pinned Jev model. It reports badge agreement, badge flips, false harsh verdicts, and listening score error.

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
