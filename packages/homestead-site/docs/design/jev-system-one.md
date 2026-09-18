# Jev (TypeSafe "System One") — Research & Opportunities

**Status:** Research only · nothing shipped · **Audience:** contributors ·
**Snapshot:** 18 September 2026 (Jev launched 15 September 2026; the model
version served as `jev-latest` was `jev-1.13.0`)

> This is a research and decision record, not a guide. It answers two
> questions: what Jev actually is (separating the verifiable surface from the
> launch claims), and what *new* things Homestead could do with a model that
> returns typed, calibrated decisions in well under a second for a fraction of
> a cent.

---

## 0. TL;DR

- **Jev is not a chat model.** You send it a *state* (a string or a JSON
  object) plus a map of typed *questions*, and it returns one typed answer per
  question with a probability distribution and a confidence. It cannot write
  prose, cannot call tools, and cannot read images. It evaluates every question
  in one parallel pass, which is where the speed comes from.
- **The verifiable surface:** three question primitives (Noul, Choice, Score),
  one HTTP endpoint, a ~32k-token request budget, 70–500 ms latency, $0.042 per
  million input tokens with output free, and an early-access waitlist.
- **The honest accuracy picture:** on TypeSafe's own four-workflow evals Jev
  scores roughly on par with a mid-tier frontier LLM and a few points below the
  best ones. Independent tests find it tied with a dedicated reranker and about
  25× faster / 500× cheaper than a frontier LLM on narrow judgment tasks.
  "Zero hallucinations" means *schema* safety, not semantic correctness.
- **What it means for Homestead:** it does not replace anything in our AI layer
  (chat, vision extraction, embeddings all stay). It adds a fifth primitive, a
  cheap `judge()` call, that can afford to run *on every write, every cron tick,
  every keystroke, and around every LLM action*, which today's model is too slow
  and too expensive to do. That opens a class of features we have not been able
  to build: always-on triage, instant autofill, a chat-free command bar,
  calibrated second opinions on our LLM outputs, and reranked search.
- **Recommended first slice:** a `judge` provider seam with an LLM-backed
  fallback, then declarative enum autofill on `FieldDef`, then a write guard on
  chat tool calls and a junk pre-screen on email ingest.

---

## 1. What Jev is

### 1.1 The category

TypeSafe AI (founded by Diogo Almeida, an OpenAI alumnus credited on RLHF and
InstructGPT, with Erik Gafni and Sasha Sheng) left stealth on 15 September 2026
with $40M led by DCVC and a model class it calls **System One**, after
Kahneman's fast/slow distinction. The pitch: most decisions software needs from
an AI are five-second expert judgments (classify, detect, score, route, rank,
verify), and building those on an autoregressive chat model pays for token
generation, parsing, and validation it never needed. A System One model
"evaluates a state and returns typed answers and probabilities" instead.

Architecturally, TypeSafe describes a **parallel sampler** that produces all
answers in a single query rather than token by token, plus a post-training
method they call **RLCD (Reinforcement Learning for Calibrated Decisions)**
that aligns the returned probabilities with observed accuracy. No paper or
weights have been released, so those are descriptions, not reproducible
results. Jev is named after the economist William Stanley Jevons.

### 1.2 The interface

One call: `POST https://api.typesafe.ai/v1/systemone` with a bearer key.

- **`state`** — a string, or a JSON object/array (records, a chat log, a
  policy, the current state of your app). Structured state is preferred for
  anything non-trivial so questions can refer to fields by name.
- **`questions`** — a named map. Each question has a `type`, `instructions`
  (the judgment, written as a question or a claim), and for Choice/Score a
  `criteria` block that defines the allowed answers. Answers come back under
  the same keys.
- **`model`** — `jev-latest` (stable; `jev-1.13.0` at snapshot), `jev-preview`
  (experimental), or a pinned version. `GET /v1/models` lists them. The
  response echoes the resolved version, which is worth logging.

The three primitives:

| Primitive  | Question shape                                   | Returns                                                                 |
| ---------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| **Noul**   | A single yes/no claim ("no" + "null")            | `noul`: probability 0–1 that the claim is true. No separate confidence. |
| **Choice** | Pick one of up to 255 named options              | `choice`, `probabilities` per option, `confidence`                      |
| **Score**  | Position on 2–10 ordered, described levels       | `score` (probability-weighted, may fall between levels), `probabilities`, `legend`, `confidence` |

Properties that shape how you design around it:

- **Questions are independent and evaluated in parallel** against the same
  state. Answer A is not context for question B. Adding questions adds almost
  no latency (their text still costs input tokens; output is free), so the
  idiom is *speculative fan-out*: ask everything you might need in one request
  and compose the answers in code.
- **Confidence is separate from the answer.** For Choice/Score it summarises
  how concentrated the distribution is. Near 0.5 on a Noul means "genuinely
  unsure", not "medium". The documented pattern is three bands in *your* code:
  act automatically at the top, confirm or flag in the middle, hand to a human
  at the bottom, with thresholds set per action by its consequences.
- **No explanations.** You get numbers, never a rationale. That is a real
  limitation for auditability and for UI copy.

SDK shape (TypeScript; Python mirrors it with `Choice`/`Score`/`Noul`
classes and `client.system_one(...)`):

```ts
import { choice, noul, score, TypeSafeClient } from '@typesafe-ai/sdk';

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY
const result = await client.systemOne({
  state: { ticket: 'I was charged twice and need the duplicate refunded today.' },
  questions: {
    intent: choice('What is the customer\'s main request?', {
      refund: 'The customer wants money returned.',
      technical_help: 'The customer needs a bug fixed.',
      other: 'None of the above clearly fits.',
    }),
    isUrgent: noul('Does the ticket explicitly communicate time pressure?'),
    frustration: score('How frustrated does the customer appear?', [
      'Calm and neutral',
      'Concerned but civil',
      'Very angry or using strong language',
    ]),
  },
});
result.answers.intent.choice;       // 'refund'
result.answers.intent.confidence;   // 0.93
result.answers.isUrgent.noul;       // 0.88
result.answers.frustration.score;   // 1.4
```

### 1.3 Specs, limits, availability

| Item                | Value (as of 18 Sep 2026)                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Modality            | **Text only.** No images, audio, or video ("yet", per the docs).                                              |
| Request budget      | State + longest question ≈ 32k tokens (~150k English characters); state + all questions ≈ 64k tokens.        |
| Latency             | Vendor: 70–500 ms end to end. A Home Assistant integrator measured higher from Europe (fine for a doorbell, too slow for a tight loop). |
| Pricing             | $0.042 per 1M input tokens; output free. ~$0.0004 per typical decision.                                       |
| Rate limits         | 250k tokens/s and 1,200 requests/min on `jev-1.13`, explicitly "moving without notice" while GPU capacity lands. Higher on enterprise. |
| Streaming           | None. One response.                                                                                            |
| Errors              | 401, 422, 429, 529; back off on 429 and 529 (the official SDKs retry by default).                             |
| Availability        | Early access behind a waitlist. Also listed on OpenRouter (`typesafe/jev-1.13`), Vercel AI Gateway, Cloudflare Workers AI, Netlify. Hosted only; no self-host, no open weights. |
| Data                | Privacy policy: no training on customer input, no disclosure beyond service providers, US hosting, retention "as long as reasonably necessary". **Zero data retention is enterprise-tier only** on the direct API (Vercel's gateway exposes ZDR per request). |
| Official SDKs       | `@typesafe-ai/sdk` 0.6.0 (Node ≥ 20, zero deps); `typesafe-sdk` on PyPI (Python ≥ 3.10); `@ai-sdk/typesafe-ai` 3.0.3, the Vercel AI SDK provider (Node ≥ 22, needs `ai` ≥ 7.0.105 for `experimental_evaluate`). |
| Other               | An undocumented `bounding_box` question type appeared in early schemas and was dropped from the live one. A "System One Adapter" (Python) runs the same typed questions against OpenAI/Anthropic chat models for benchmarking. |

### 1.4 Documented weaknesses ("model jaggedness")

TypeSafe publishes a jaggedness page for `jev-1.13`; the community summary is
consistent with it:

- **Counting is unreliable** (characters, occurrences, list items).
- **Arithmetic and dates are the weakest axis.** Jev reads dates as text, so
  "which comes first", "how far apart", "inside this window" are unreliable,
  worse with mixed formats and relative references. Do the arithmetic in code
  and pass in the result or a named bucket.
- **Score interpolation is not a measurement.** Do not reconstruct a number
  from where a score lands between two levels.
- **Long documents** need a chunking pattern: give it a chunk plus
  `next_chunk`/`previous_chunk`/`open_file` as Choice options and let code
  fetch what it asks for.
- **No multimodal input**, so anything visual has to be OCR'd or described
  first.

### 1.5 Evals: what is measured vs what is claimed

**TypeSafe's own evals** (`evals.typesafe.ai`) cover four workflows: security
incident response, agent-trace observability, invoice processing, and
multi-action customer service. The reference labels are the *averaged
judgments of GPT-6 Astra and Claude Fable 5.1*, not human ground truth, so a
score is agreement with those two models.

| Workflow                   | Jev   | Best comparator (Opus 5 unless noted) |
| -------------------------- | ----- | ------------------------------------- |
| Security incidents         | 61.7% | 66.2%                                 |
| Agent-trace observability  | 71.6% | 76.6%                                 |
| Invoice processing         | 61.8% | 79.1%                                 |
| Customer service           | 76.0% | 78.3%                                 |
| **Aggregate**              | 67.8% | 74.1% (GPT-5.6 Sol); 73.1% (Opus 5); 67.9% (GPT-5.6 Terra) |

The headline "193.6× faster and 444.6× cheaper" is the peak in-house ratio
against frontier models on those workflows. The launch demo shows Jev playing
Doom at ~10 decisions per second from a JSON game state (not pixels), at about
$7 per hour, versus an 8.5 s round trip for a frontier LLM.

**Independent evidence** (all small and recent, but real):

- **Every** (publisher) ran 21 questions over 37 articles in one request: 777
  judgments in under 0.7 s for about a quarter of a cent. A second test on 12
  passages with planted defects caught 6 of 7 at a median 0.35 s per passage
  versus 8.83 s for Fable 5.1 at high effort: ~25× faster, ~1/580 the cost.
- **jev-rerank-bench** (14 datasets, 1,617 queries, bootstrap CIs): Jev with a
  rubric scored nDCG@10 0.692 vs Cohere Rerank 4 Pro 0.691, a statistical tie;
  clearly better on negation (NevIR 71% vs 67%); 422 ms vs 844 ms per query;
  $0.45 vs $2.51 per 1,000 queries; and far less order-sensitive than a small
  open model (reversing passage order changed the top hit on 25% of queries vs
  93%).
- **Janus** (calibration on Banking77 and Web of Science): on Banking77,
  routing by Jev confidence at a 0.67 threshold reached 80.2% and beat the
  best single model by 1.4 points at 53% lower cost; on Web of Science *no
  threshold beat the better single model*, and the tool's verdict was "do not
  route". Calibration is real but not uniform across tasks.
- **jevcal** exists precisely because thresholds must be fitted on your own
  labelled data; its author declines to publish Jev numbers under TypeSafe's
  customer agreement.

**Fair reading of the skeptics** (pearpages, Kingy, The Register, Flowtivity):
"cannot hallucinate" is true of the *format* only; a well-formed wrong answer
is still wrong. Calling it a "frontier model" borrows credibility from models
that can do things it cannot. What the evidence does support is that TypeSafe
has pushed the speed-and-cost frontier for bounded decisions out by one to
two orders of magnitude at accuracy comparable to a mid-tier LLM.

### 1.6 The suitability test

Community guidance (drawn from TypeSafe's docs) reduces to: *can the task be
written as "given state X, tell me Y" where Y is a Choice, a Score, or a
probability?* Six signals, five or six of which should hold: the AI is
**judging, not creating**; the answer space is **bounded**; the judgment is
**atomic**; all needed context is **in the state**; a **fast human** expert
would answer without research; and **software consumes the result** directly.
Code calculates, Jev judges, LLMs reason and create.

---

## 2. Where it fits in Homestead's AI layer

### 2.1 What we have today

Everything AI in Homestead goes through the Vercel AI SDK with one configured
provider (`ai` block in `homestead.config.ts`: OpenAI, Anthropic, or Google)
and one optional embedding provider. `packages/homestead-core/server/ai/generate.ts`
exposes exactly four primitives, and every feature is built from them:

| Primitive          | Used by                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `aiGenerateText`   | `groceries:process-image` (photo → list lines)                                                            |
| `aiGenerateObject` | `documents/{id}:classify` and `:split` (two-pass type + field extraction, self-reported confidence gated at 0.5), vision text extraction for `ai.embed` fields |
| `aiRunAgent`       | `POST /api/chat`, a tool loop with four CRUD tools per resource plus `search_documents`, up to 10 rounds  |
| `aiEmbed`          | The vector index behind `search_documents`                                                                |

Plus a cron (`documents-ingest-email`) that files Gmail attachments and kicks
off classify, an MCP server that exposes resources to external agents, and an
e2e AI stub (`tests/e2e/config/ai-stub.ts`) that fakes the OpenAI Responses API.

### 2.2 What Jev does and does not change

Jev **replaces none of that**. It cannot read the grocery photo, cannot write
the chat reply, cannot run a tool loop, and cannot embed. What it adds is a
fifth primitive:

```ts
aiJudge({ state, questions }) → { answers, model, usage }
```

whose defining property is that it is cheap and fast enough to call in places
we would never put an LLM: inside a 60-second dispatcher tick, on every
ingested email, on every field blur in a form, on every candidate pair in a
dedupe pass, and *around* every LLM action as a check.

Two things make Homestead unusually well-suited to it:

1. **We already have text for everything.** The document pipeline OCRs every
   uploaded file into `full_text` and a `<field>_text` companion per embedded
   file field. Jev's text-only limit is therefore not a blocker: the vision
   model produces the text once, and Jev can judge it as many times as we
   like.
2. **Our schema is declarative.** Every `enum` field, every `reference`, every
   `required` boolean is already machine-readable in `resources.ts`. Choice
   criteria and Noul claims can be *generated* from field definitions, the
   same way the chat tool builder generates Zod schemas today.

### 2.3 Integration options

**Option A (recommended): the Vercel AI SDK provider.** `@ai-sdk/typesafe-ai`
plugs into `experimental_evaluate` from `ai`. That keeps our "no call site
talks to a provider SDK" rule, gives us `baseURL` overrides for free (so an
operator can route through Vercel's gateway for per-request zero data
retention, or OpenRouter), and reuses the existing config plumbing pattern.
Costs: bump `ai` from the pinned 7.0.2 to ≥ 7.0.105 (a minor-line update, but
the changelog between them needs reading), and the provider wants Node ≥ 22,
which we already require. Confidence lives at
`result.providerMetadata.typesafe.confidence[questionId]` rather than on the
answer, a small wrinkle for the wrapper.

**Option B: the official `@typesafe-ai/sdk` directly.** Zero dependencies,
Node ≥ 20, answer types inferred from the question helpers, built-in retry.
Simpler today, but a second provider surface to maintain and no gateway
routing without extra code.

Either way, the shape we should add:

```ts
// homestead.config.ts
judge: {
  provider: 'typesafe',          // the only System One vendor today
  model: 'jev-latest',           // or pin 'jev-1.13.0'
  auth: { apiKey: process.env.JUDGE_API_KEY ?? '' },
  baseURL?: string,              // gateway / proxy
}
```

with `isJudgeConfigured()` alongside `isAiConfigured()`, and, crucially, an
**LLM-backed fallback**: when no `judge` block is set but `ai` is, `aiJudge`
emulates the same questions through `aiGenerateObject` with a Zod schema of
enums and 0–1 numbers (the pattern TypeSafe's own System One Adapter uses).
Features built on `aiJudge` then work on every instance; a TypeSafe key makes
them fast and cheap rather than possible. The e2e stub grows a
`/v1/systemone` route so specs can run against a fake judge.

### 2.4 House rules for building on it

- **Code owns thresholds and side effects.** A Jev answer never writes a
  record by itself; it fills a suggestion, gates a branch, or ranks a list.
  Per-action thresholds: low for reversible autofill, high for anything
  destructive or financial.
- **Always include `other` / `none` / `unsure`** in a Choice, and treat a Noul
  near 0.5 as "ask", not "no".
- **Numbers and dates are computed in code** and passed in as buckets
  ("expires in 3 days", "same calendar month"), never asked of the model.
- **Log the resolved model version and the full distribution**, not just the
  winner, so thresholds can be re-fitted later (jevcal-style) on the
  household's own corrections.
- **Household data is sensitive** (tax forms, medical receipts, Wi-Fi
  passwords). The judge must be opt-in, ZDR must be documented as
  enterprise-only, and the gateway `baseURL` path must be first-class.
- **Suggested, never asserted.** Because there is no rationale, UI copy must
  present results as suggestions with a visible confidence, not as facts.

---

## 3. New things Homestead could do

Grouped by the *capability* Jev unlocks rather than by app. Each item names the
questions, where it plugs in, and why an LLM could not do it well today.

### A. Always-on judgment (runs on every write or cron tick)

**A1. Junk and routing pre-screen on email ingest.** The
`documents-ingest-email` cron currently sends every attachment to a full
vision classify pass. A Jev fan-out over the email header, body, and OCR text
first: Noul "is this a document the household would file?", Choice over the
person it concerns (criteria generated from `people`), Noul "is this a
marketing message?", Score "how urgent is any action in it?". Skip the
expensive classify on junk, pre-fill `people`, and surface urgency. Today
this would double the LLM spend per email; with Jev it is a rounding error.

**A2. A calibrated "needs you today" feed.** A daily cron scores every open
todo, home task, event, expiring credit-card perk, unpaid HSA receipt, and
delayed garbage pickup on the same rubric (Score: "how much does this need
attention today?", Noul: "is this blocked on someone else?"), with dates
pre-bucketed in code. Hundreds of records fit in one request. The dashboard
gets a genuinely ranked list instead of per-app widgets, and the confidence
band decides what becomes a push notification versus a quiet line.

**A3. Notification worthiness and de-duplication.** The dispatcher runs every
minute and sends whatever rows are due. Before sending, ask Jev: "is this
redundant with a notification sent to this person in the last day?", "is
this important enough to interrupt during quiet hours?", "does this belong
in the morning digest instead?" Sub-second latency fits inside the tick; a
`missed`/`digested` outcome writes back to the same row ledger.

**A4. Entity resolution on write.** Candidate generation stays in code
(same normalised name, same amount ± tolerance, same date window); Jev
answers the semantic pair question in bulk. Targets: `person` aliases
("Sam" vs "Samantha"), grocery items ("tomatos" vs "cherry tomatoes", which
are *not* the same), `store` matching, `garbage-pickup` rows re-imported by
the external sync, and receipts that arrive both by email ingest and hand
upload. A `duplicate_of` suggestion with a confidence, merged only on
confirmation.

### B. Instant UI (fast enough for a keystroke or a blur)

**B5. Autofill of enum and reference fields while typing.** A small server
route takes a partial record and returns suggestions for its closed fields:
grocery `category` and `store`, todo `category`/project, HSA `category`,
charitable `gift_type`, recipe `tags`, home-task `interval_unit`. High
confidence fills the field; medium shows a chip; low stays blank. This is
what a 300 ms budget buys that a 3 s one does not.

**B6. A chat-free quick-add / command bar.** One text box, one Jev request
following the official smart-home demo pattern: Choice(which app), Choice
(which action), Noul(is this a question rather than a command), plus one
Choice per closed argument (person, category, store, list). High confidence
becomes a deterministic create with a one-line confirmation; anything else
falls through to the existing chat agent. Captures "milk and eggs",
"dentist Tuesday 3pm for Sam", or "done with the gutters" in under a second,
which also suits the offline/PWA queue far better than an agent round trip.

**B7. Reranking and abstention in `search_documents`.** The search tool
already over-fetches four times its limit and re-checks permissions per hit.
Add a Noul relevance pass per candidate against the query, sort by
probability, and use a "nothing here is relevant" gate so the chat assistant
can honestly say so instead of citing the least-bad passage. The reranking
benchmark puts Jev at parity with a dedicated reranker at half the latency.

**B8. Natural-language filters on list views.** "Unpaid HSA receipts for Sam
from last spring" becomes Choice(status), Choice(person), Choice(date
bucket), with the bucket-to-range mapping in code. No LLM, no tool loop,
instant.

### C. Verification around the existing LLM

**C9. A write guard on chat tool calls.** Before the agent's
`create_*`/`update_*`/`delete_*` executes, ask Jev with the user's last
messages and the proposed call as state: "does this call do what the user
asked?", "is it destructive?", "did the user explicitly confirm?" The current
"confirm before deleting" instruction lives only in the system prompt; this
enforces it in code with a hard floor (Composio's Jev provider uses 0.9 for
destructive tools). It also stops the classic hallucinated-argument write.

**C10. Prompt-injection screening on ingested text.** Email bodies, OCR'd
documents, and retrieved passages all flow into the agent's context. A Noul
"does this text try to instruct an AI or override its task?" on ingest and
on each retrieved passage is the guardrail we do not have, at negligible
cost per record.

**C11. A calibrated second opinion on document classification.** Classify
gates on the LLM's *self-reported* confidence, which is known to be poorly
calibrated. Run a Jev Choice over the doc-type catalogue with `full_text` as
state; agreement raises trust, disagreement routes to a "needs review" tab.
Then verify extracted fields with Nouls ("is the amount 1,234.56 supported by
the text?") before they become authoritative metadata.

**C12. Answer verification (agent-trace observability).** After a chat turn,
judge the reply against the tool results: "does the reply claim something
not present in the results?", "did the agent complete the request?" Flag or
annotate rather than block. This is exactly one of TypeSafe's four published
workflows.

### D. Household-specific features

**D13. Recipe intelligence.** "Can I make this from what's on the list?"
(Noul per parsed ingredient against grocery items), dietary tags inferred
across all recipes in one fan-out (vegetarian, nut-free, under 30 minutes),
and "which of these 40 recipes fits tonight?" (Score against the household's
constraints) as a daily suggestion widget or notification. Cheap enough to
recompute nightly.

**D14. Credit-card perk matching.** Given a receipt's or document's text,
Choice over the household's active perks ("which perk does this redeem, if
any?") and Noul "is this redeemable in the current period?" (period computed
in code) to suggest `redemption` rows; and the inverse "which card should I
use for this purchase?" as a quick tool.

**D15. HSA and charitable receipt triage.** Noul "is this an HSA-eligible
expense?", Choice(category), Choice(patient from `people`), Noul "is this a
duplicate of an existing receipt?" with candidates from code. Tax-year
assignment and totals stay in code.

**D16. Garbage-pickup sync robustness.** The hauler feed's
`service_description` free text maps to `stream` and `status` today by
brittle string matching. Choice(stream) and Noul "does this describe a
delay?" absorb wording changes without a code change.

**D17. Event and people nudges.** Choice over event kind (birthday,
anniversary, appointment, deadline) from the name, Noul "should this
recur?", and a suggested reminder lead bucket. Gift ideas and message
drafting stay with the LLM.

**D18. Game judging.** A Pictionary guess judge (Noul "does guess X mean the
same thing as answer Y?") and a bridge bidding advisor over the hand state,
where per-turn latency and cost matter and a chat model is unusable.

### E. Platform-level primitives (features for app authors)

**E19. Declarative `ai.judge` on `FieldDef`.** The highest-leverage idea and
the most Homestead-shaped. Mirroring today's `ai: { embed: true }`, a field
declares how it can be inferred from its siblings:

```ts
category: {
  type: 'string',
  enum: ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'other'],
  ai: { judge: { from: ['name', 'notes'], autofill: 0.85, suggest: 0.5 } },
},
```

Enum fields become Choice questions (criteria from the enum, `other` added if
missing), booleans become Nouls, and `reference` fields become Choices over
the target collection's display names. The engine or a gateway hook fills the
field on create when confidence clears `autofill` and records a suggestion
otherwise. Every app gets B5 for free, with zero per-app code, the same way
every resource already gets four chat tools.

**E20. Tool-surface selection for the chat agent.** Twelve apps times four
tools plus custom methods is a large tool list on every turn. A Jev Choice
over apps (and Noul "does this turn need document search?") before
`aiRunAgent` trims the tool set to the relevant app, which cuts prompt cost
and improves tool selection on smaller models.

**E21. A calibration workflow.** `homestead ai calibrate` (jevcal-style):
take the household's own human corrections (documents re-typed by hand,
receipts re-categorised, duplicates rejected), fit per-question thresholds on
half and verify on the other half, and store the results as app flags. This
turns E19's `autofill`/`suggest` numbers from guesses into measured values.

---

## 4. Prioritised recommendation

| # | Idea                                          | Value | Effort | Needs Jev, or works with LLM fallback? |
| - | --------------------------------------------- | ----- | ------ | -------------------------------------- |
| 0 | `judge` provider seam + LLM fallback + e2e stub | Foundation | S | Both                                    |
| 1 | E19 declarative enum/reference autofill        | High  | M      | Fallback works; Jev makes it instant   |
| 2 | C9 write guard on chat tool calls              | High  | S      | Fallback works; Jev keeps chat snappy  |
| 3 | A1 email ingest pre-screen                     | High  | S      | Fallback would *add* LLM cost; Jev only |
| 4 | B6 quick-add command bar                       | High  | M      | Jev (latency-defined feature)          |
| 5 | A2 "needs you today" feed                      | High  | M      | Jev (volume-defined feature)           |
| 6 | B7 search reranking + abstention               | Med   | S      | Jev (per-hit calls)                    |
| 7 | C11 classify second opinion + field checks     | Med   | S      | Both                                   |
| 8 | A4 entity resolution                           | Med   | M      | Jev (pairwise volume)                  |
| 9 | C10 injection screening                        | Med   | S      | Both                                   |

Suggested first slice: 0, then 1 with groceries `category`/`store` and HSA
`category` as the first consumers, then 2 and 3. Items 4 and 5 are the ones
that would feel genuinely new to a household user and are worth a design doc
each.

---

## 5. Risks and open questions

- **Early access and a moving target.** Waitlist-gated, rate limits that
  change without notice, a single vendor, hosted only in the US, no self-host.
  The LLM fallback in §2.3 is what keeps Homestead from taking a hard
  dependency on any of that.
- **Privacy.** Zero data retention is enterprise-only on the direct API. For
  a product whose documents include tax and medical records, the `judge` block
  must be opt-in, documented plainly, and routable through a gateway that
  offers per-request ZDR.
- **Accuracy is task-dependent and unexplained.** ~68% on TypeSafe's own hard
  workflows, parity with specialised rerankers on retrieval, and a calibration
  study that says "route" on one dataset and "do not route" on another. Every
  feature above needs its own small labelled set and its own thresholds (E21),
  and the UI must never present a judgment as a fact.
- **Text only.** Our vision extraction must run first; Jev never sees a photo.
  If TypeSafe ships image input, several of the pre-screen ideas get cheaper
  still.
- **Version drift.** Pin `jev-1.13.0` or log the resolved version on every
  call; a `jev-latest` bump can shift every threshold.
- **SDK bump.** `ai` 7.0.2 → ≥ 7.0.105 for `experimental_evaluate`; the API is
  marked experimental and could change under us. Option B sidesteps that at
  the cost of a second client.

---

## 6. Sources

Official (typesafe.ai and docs.typesafe.ai were not reachable from the research
environment; their content is quoted via the community references below):

- Launch post: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Workflow evals: https://evals.typesafe.ai/
- Docs: https://docs.typesafe.ai/ (API reference `/api`, primitives
  `/primitives`, confidence `/confidence`, jaggedness
  `/model-jaggedness/jev-1.13`, smart-home demo `/demos/smart-home`)
- SDKs: https://github.com/typesafe-ai/typesafe-sdk-js ·
  https://github.com/typesafe-ai/typesafe-sdk-python ·
  https://github.com/typesafe-ai/system-one-adapter-python ·
  https://github.com/typesafe-ai/skills ·
  npm `@typesafe-ai/sdk` 0.6.0 and `@ai-sdk/typesafe-ai` 3.0.3 (registry metadata)
- Vercel: https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway ·
  https://vercel.com/docs/ai-gateway/modalities/evaluation

Coverage and analysis:

- The Register: https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711
- DataCamp: https://www.datacamp.com/blog/system-one-models-jev
- LangChain: https://www.langchain.com/blog/building-a-harness-with-jev
- Developers Digest: https://www.developersdigest.tech/blog/typesafe-jev-system-one-models-release-guide-2026
- Kingy AI review: https://kingy.ai/blog/typesafe-jev-review-the-ai-model-that-doesnt-generate-text/
- pearpages, "Jev, Sorted": https://pearpages.com/blog/2026/09/16/jev-sorted-what-typesafes-system-one-model-actually-is-and-what-is-still-just-a-claim
- ActionBox review: https://actionbox.cloud/blog/typesafe-ai-jev-review/
- Flavio Copes deep dive: https://flaviocopes.com/jev/
- GIGAZINE: https://gigazine.net/gsc_news/en/20260916-system-one-jev/
- Yahoo Finance (funding): https://finance.yahoo.com/technology/ai/articles/typesafe-ai-emerges-stealth-40m-190000776.html
- Privacy/ZDR investigation (Japanese): https://zenn.dev/dyoshikawa/scraps/75fee39cc95c1c

Community references and independent evals:

- Comprehensive reference gist: https://gist.github.com/pjburnhill/adf8d28efcad9df037bfdece178ef965
- awesome-jev-by-typesafe (31 use cases, starter code): https://github.com/Anil-matcha/awesome-jev-by-typesafe
- awesome-typesafe (index of SDKs, tools, evals): https://github.com/AbdelStark/awesome-typesafe
- awesome-jev: https://github.com/AnotiaWang/awesome-jev
- jev-usecases (27 harnesses): https://github.com/kenhuangus/jev-usecases
- Reranking benchmark: https://github.com/anessbelbati/jev-rerank-bench
- Janus calibration study: https://github.com/FirasSX914/Janus
- jevcal threshold fitting: https://github.com/abhixhek/jevcal
- HA-Jev (Home Assistant): https://github.com/AboveColin/HA-Jev
- Composio Jev provider (tool-call gating): https://github.com/ComposioHQ/composio/pull/4513
- llm-rosetta and req_llm API-shape discussions: https://github.com/Oaklight/llm-rosetta/issues/704 · https://github.com/agentjido/req_llm/issues/1021
