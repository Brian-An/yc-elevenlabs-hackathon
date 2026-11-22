# yc-elevenlabs-hackathon

# Dating Sandbox — Hackathon Build Plan

**Concept:** An AI-powered dating simulator that helps users practice real-life dating conversations, receive personalized feedback, and improve over time.

**Core differentiator:** Rather than being a generic AI companion, the system remembers your strengths and weaknesses and adapts future dates to help you improve.

## 1. Final tech stack

| Technology       | Responsibility                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| **ElevenLabs**   | Real-time voice conversations, AI character voice and avatar presentation       |
| **Rowboat Labs** | Persistent memory of user preferences, strengths, weaknesses, and past sessions |
| **Wasp**         | Backend, authentication, database, and API orchestration                        |
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
- [ ] Save strengths and weaknesses through Rowboat memory
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
| **2. Backend & Memory**        | Wasp + Rowboat            | Profiles, sessions, saved memory          |
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
4. **2:15–3:00:** Show Rowboat remembering the user's weakness and generating a more targeted follow-up date.

**The most important outcome:** Judges should see an AI that remembers how you communicate and actively helps you get better, rather than simply having conversations with you.

Given the 3:00 PM submission deadline, prioritize getting the full voice → transcript → evaluation → memory → next scenario loop working before adding extra features.
