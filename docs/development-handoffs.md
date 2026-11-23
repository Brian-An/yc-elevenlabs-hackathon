# Bantr development handoffs

The first milestone connects a practice date to a whole-conversation review and a rehearsal with Riley.
Each section below is a separate assignment that another contributor can pick up.
Paths are relative to the repository root.
Use the current working tree as the baseline, including migrations and prompt templates.

## Starting point

Run `wasp compile` and `npx vitest run` from `app/` after installing the project.
The November 23 implementation passed 64 tests and a browser-to-PostgreSQL exercise using synthetic provider responses.
That exercise covered review retry, Riley's selected source date, demo and coaching exclusion, and duplicate finalization.
A separate database check interrupted memory writes, then recovered the stored review with inference unavailable.
A live Anthropic review and a spoken rehearsal through the hosted agents are the first open integration checks.

The last live Jev benchmark before this milestone matched 29 of 30 distinct synthetic exchanges with the current rubric.
Its listening mean absolute error was 0.79 on the 1-10 scale, compared with 0.69 for the earlier rubric.
Use those as historical reference points and rerun before tuning.

## Parallel work and dependencies

| Assignment | Start when | Deliverable |
| --- | --- | --- |
| Human evaluation dataset | Immediately | Versioned cases, rater guide, baseline report |
| Live Jev calibration | Start instrumentation immediately, tune after labels exist | Calibrated badge policy and latency report |
| Character scripts | Immediately | Tested scenario packs for Maya, Theo, and Priya |
| Hosted agent integration | Start in a test environment with provider access | Verified voice and avatar rehearsal |
| Durable review processing | Immediately | Recoverable background job and outage tests |
| Identity and memory controls | Immediately, before a wider rollout | Verified user identity and deletion controls |
| Adaptive practice | After reviewed sessions and scenario packs are available | Personalized next scenario and transfer evaluation |

### 1. Build the human evaluation set

**Objective.** Measure whether users receive accurate and actionable feedback on spoken dates.
Start with [the existing synthetic benchmark](../app/scripts/jev-benchmark.mjs) and the [whole-date contract](../app/src/shared/dateReview.ts).

- Create a versioned corpus of multi-turn conversations with turn IDs and a separate held-out split by conversation.
- Include brief but appropriate answers, invitations to joke, explicit boundaries, repairs, speech recognition errors, interruptions, and topic changes.
- Have two people independently label acceptable badges, per-skill applicability, cited moments, and the most useful next action before seeing model outputs.
- Record disagreements and adjudicate them before tuning prompts.
- Run Jev and the Anthropic evaluator on the same frozen inputs and publish per-class results, listening error, abstention coverage, evidence accuracy, and reviewer agreement.

**Acceptance.** A contributor can reproduce the baseline from a named dataset, model, and rubric version.
Show examples where the systems disagree and distinguish repeated trials from distinct cases.
Use synthetic or consented, de-identified transcripts.

### 2. Calibrate live Jev feedback

**Objective.** Give a useful signal while conversation continues.
Start in [jev.ts](../app/src/server/jev.ts), [moves.ts](../app/src/server/moves.ts), and [the live call component](../app/src/components/DateCall.tsx).

- Use stored raw labels and probabilities to measure confidence separately for each badge.
- Compare the current display threshold against thresholds learned on the calibration split.
- Track false harsh judgments, missed explicit boundaries, abstention rate, and end-of-utterance to visible-badge latency at the median and 95th percentile.
- Replay a corrected turn, two identical spoken replies, and a long-range callback to check which evidence the grader actually sees.
- For each proposed change, report the accuracy and coverage trade-off on the untouched holdout.

**Acceptance.** Publish before-and-after results and a rollback setting for the display policy.
Preserve older grades without probability metadata.
Keep live inference off the audio playback path.

### 3. Expand character and question scripts

**Objective.** Give each character believable ways to follow the user's lead.
Start with [persona definitions](../app/src/server/personas.ts), [session directions](../app/src/server/sessionBrief.ts), and the [hosted template](../app/prompts/elevenlabs/session-v1.md).

- Give Maya a second personal story, Theo a route from playful banter into sincerity, and Priya a choice she is happy to let the user decline.
- For each scene, write an opening, the character's motivation, an optional disclosure, a response to a related story, and a graceful exit from the topic.
- Let a user demonstrate listening through reflection, shared experience, or a question.
- Keep difficulty independent from the character's willingness to respect a preference or boundary.
- Store scenario IDs and script versions so the team can reproduce the conversation conditions.

**Acceptance.** Run each character against three scripted user styles and review the actual transcripts for repeated questions, topic persistence, and continuity.
Prove that a new opening reaches both call transports.
Coordinate template variable changes with assignment 4.

### 4. Verify the hosted date-to-Riley loop

**Objective.** Prove that users hear the correct scene and that Riley can rehearse the correct exchange on real calls.
Start with the [provider setup](../README.md#configure-voice-avatars-and-riley), [brief builder](../app/src/server/sessionBrief.ts), and [review engine](../app/src/server/dateReview.ts).

- Configure an isolated Anthropic key and test agents with the versioned prompt and first message.
- Record the prior agent version and the voice/model settings before publishing to a test environment.
- Complete a Maya date, open the recap, select Riley, and confirm Riley quotes the selected exchange.
- Repeat via ElevenLabs voice and HeyGen avatar, then open Riley from the plaza with a new user and with two prior dates.
- Verify a selected older date takes precedence over the latest date and a coach conversation does not change practice scores.

**Acceptance.** Supply the test matrix, observed openings, context source, provider version and measured latencies.
Keep transcript excerpts synthetic and credentials out of logs.
Promote tested prompt versions through the project's release process.

### 5. Move post-date reviews to a durable background job

**Objective.** Let users leave the call immediately after their transcript is saved and recover reviews after outages.
The current [finalization operation](../app/src/server/sessions.ts) freezes the transcript, claims inference, and supports retrying from feedback.
The first caller still waits for the provider when a key is configured.

- Enqueue a job in the transaction that ends a live date and reuse the existing claim, frozen transcript, and idempotent memory write.
- Make the job identity include the session, transcript revision or hash, and rubric version.
- Add bounded retries with backoff and expose the next retry or terminal status on the feedback page.
- Record provider latency, attempt count, failure class, and token usage without recording dialogue.
- Page or aggregate history from [session serialization](../app/src/server/serialize.ts) so dashboard loads do not read every transcript and full review.

**Acceptance.** Kill the worker before inference, after inference, and during memory projection.
Verify a later worker completes each review with one durable result and one memory entry.
Cover simultaneous retries, a missing key, rate limits, and eventual recovery.

### 6. Bind private history to a verified identity

**Objective.** Protect stored transcripts and cross-date coaching as the product moves beyond the hackathon.
Start with [current user lookup](../app/src/server/user.ts), [browser identity](../app/src/client/userId.ts), and [session-scoped call resolution](../app/src/server/sessionBrief.ts).

- Choose an account or server-issued anonymous session design and document how existing browser data can be claimed.
- Derive ownership on the server for profile, transcript, review, callback, export, deletion, and provider-token operations.
- Give users a way to delete a date and its derived memories, then recompute progress and remove dangling coach references.
- Define transcript retention and what is shared with each provider when a user starts a date.

**Acceptance.** Exercise two independent identities through the normal application routes.
Verify one identity cannot read or select the other's review and deletion also removes its contribution to Riley's context and training focus.

### 7. Make next practice respond to learning

**Objective.** Test whether users apply a practiced behavior in a different conversation.
Start in [scenario generation](../app/src/server/evaluator.ts), [reviewed progress](../app/src/server/memory.ts), and [the plaza](../app/src/pages/WorldPage.tsx).

- Use the user's goal and latest evidenced practice recommendation to select among the scenario packs from assignment 3.
- Offer the recommendation at date selection and keep free character choice available.
- Record which opportunity the persona actually offered and whether the user demonstrated the target behavior.
- Compare the next eligible opportunity to the prior one, accounting for missing evidence and rubric changes.

**Acceptance.** Demonstrate a new user receiving their chosen focus, a returning user practicing an evidenced skill with a different character, and a date too short to support a progress claim.
Report observed transfer with example exchanges and the number of assessable opportunities.
