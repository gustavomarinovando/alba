# Alba Launch Roadmap

## Positioning

Alba should launch as a couple-aware cycle companion: local-first health tracking for the person
recording their cycle, plus gentle partner education and relationship moments for both people.

Core promise:

- protect cycle data;
- make daily tracking easier;
- help partners understand and support each other;
- make the app feel personal through avatars, an AI companion, and custom experiences.

## Where things actually stand right now

A snapshot so this doc doesn't drift from reality — update this section whenever a pillar moves
status.

| Pillar | Status |
|---|---|
| Local-first storage + Supabase sync | Built, actively hardened (a draft-clobber race and a merge tie-break inconsistency were fixed recently) |
| Accounts + couple invite | Built |
| Companion avatars (4 cats) | Built; walking + sitting art, tap-to-react (meow/purr) |
| **AI companion chat** | Built this cycle: streaming, tool-calling grounded in real cycle/streak/coupon data, multi-provider (Gemini/NVIDIA/OpenAI), per-mascot personality/tone, proactive greeting, follow-up chips |
| Streak + reward coupons | Built; recently moved from an always-visible shelf into a modal opened from the streak card, with "Disponibles"/"Mis cupones" tabs |
| Custom-date experiences (May album, Mandarino monthiversary) | Built as replayable built-ins |
| Guest mode | Built — "Probar sin cuenta" on the login screen loads demo data with no account, also unblocks automated testing |
| Automated E2E testing | Foundation built (Playwright, `e2e/`): boots via guest mode, covers all 6 tabs, the rewards modal, and the AI send/tool-call round trip |
| Partner education / trivia | Not yet — still open per original roadmap |
| Public-facing pricing/paywall | Not yet — nothing is gated today |

The rest of this doc is still forward-looking; treat the table above as the only "already true"
claims.

## Immediate Next Steps

Ordered by "do this before that" dependency, not just importance. Pulled from `TAB_UX_REVIEW.md`'s
findings and this doc's own launch blockers — see those docs for the full detail behind each item.

1. **Audit unconditional `backdrop-filter` usage.** The base (non-Líquida) theme still blurs the
   shared `Panel`, all ~42 calendar day-cells, and every Today-tab input-card/saved-reading-row —
   likely the actual, still-unfixed source of "still laggy" feedback. Highest perceived-quality
   fix available, and it's isolated (CSS-only, no logic risk).
2. **Fix the two real bugs found in the tab review**: Calendar's light/medium/heavy flow colors are
   literally identical CSS (real bug, not a design choice), and Today's "Reposo" checkbox is
   permanently checked and does nothing when tapped. Both are small, both erode trust once noticed.
3. **Add per-user rate limiting / cost budgets to `/api/chat`.** Today's caps (60 messages, 200KB
   body) are placeholders sized for one private couple. This is a hard launch blocker, not a
   nice-to-have — a single scripted client on the free tier could otherwise run up an unbounded
   provider bill. Do this before any public/beta traffic, not after.
4. **Standardize destructive-action confirmation.** Settings' "Borrar" uses a native
   `window.confirm()`; Today's "delete day" uses a custom `confirm-box`. Pick one (the custom one)
   before more destructive actions get added elsewhere.
5. **Decide the currency/store economy question** (Pillar 6) before building more on top of the
   current streak-gated reward model — it changes the data model either way, and the modal/tabs
   work just shipped is a natural pause point to make that call rather than after more UI is built
   around the current shape.
6. **Restructure Settings into weighted groups** (account/security/destructive vs.
   personalization/cosmetics) rather than one flat list — currently "Borrar everything" sits at the
   same visual weight as "Exportar."
7. **Grow the Playwright suite alongside real fixes**, not separately — every bug fixed above should
   get a regression test in the same PR, the same way the send/tool-call flow got covered this round.
8. **Mascot art**: pug + tuxedo French bulldog need their own front-facing head/ear/muzzle shapes
   (not a reskin of the cat silhouette — the anatomy differs too much) to slot into the existing
   `AnniversaryCat`-style system for streak mascots.
9. **Partner trivia cards** — the one MVP "Must Have" item from the original roadmap that's still
   fully unbuilt; the AI chat's partner-mode tone covers some of this conversationally already, but
   a dedicated card surface was always the plan.

## Product Pillars

### 1. Trustworthy Cycle Tracking

Must be reliable before growth:

- local-first storage;
- safe sync;
- accounts and couple membership;
- clear ownership of records;
- export and backup;
- no accidental deletion during migration;
- cycle insights framed as educational, not diagnostic.

### 2. Couple Sync

Both people benefit from Alba.

Required:

- user accounts;
- couple invitation;
- subject profiles for one or both people with cycles;
- recorded-by metadata;
- optional approval for partner-entered data;
- realtime sync for saved entries;
- clear audit trail.

### 3. Companion Avatars & AI Chat

Avatars are a permanent emotional layer, and the chat is now how they "speak."

Required:

- default Alba companion;
- couple/private companions with per-mascot personality (tone: alegre/suave/directo/técnico);
- avatar setup;
- dark/light contrast checks;
- walking and sitting previews;
- reactions to saves and reminders;
- grounded AI answers (tool-calling against real cycle/streak/coupon data, not hallucinated);
- future accessories.

### 4. Custom Relationship Experiences

Custom dates are replayable experiences and future templates.

Initial templates:

- May photo album;
- Mandarino recipe/date-night;
- message/note;
- reward unlock.

### 5. Partner Education

Alba should help the partner support without pressure.

Examples:

- phase trivia;
- foods that may help in each phase;
- activities that may feel better or worse;
- what not to say;
- care suggestions;
- reminders to ask instead of assume.

The AI chat's partner-mode tone (support-oriented, no raw note access) already covers part of this
conversationally; dedicated trivia cards are still a separate, not-yet-built surface.

All health content needs careful phrasing and should avoid medical certainty.

### 6. Streaks, Coupons & Rewards (gamification)

The retention engine. Already built; the roadmap below is about scaling it.

- daily-observation streak (owner) and companionship streak (partner, "opened the app" based);
- reward coupons with thresholds, categories, and templates;
- future: a shared currency/points economy so redemption isn't purely streak-gated (flagged as a
  separate, larger design effort — needs its own Supabase schema).

## MVP Before Public Launch

### Must Have

- account creation and login — **built**;
- couple invite flow — **built**;
- migration from `couple_id = 1` without losing local data;
- robust sync on load, focus, online, save, and delete — **built, recently hardened**;
- realtime entry updates — **built**;
- export and import — **built**;
- push notification setup that works in production;
- default Alba companion — **built**;
- current four cats as seed companion examples — **built**;
- May album and Mandarino as replayable built-ins — **built**;
- basic streak for daily temperature — **built**;
- AI chat with a sane default provider and graceful degradation if a key is missing — **built**;
- partner trivia cards — not yet.

### Should Have

- avatar setup with front and side preview;
- accessory rewards for streak milestones;
- custom-date preview route;
- photo-album template;
- recipe/date-night template;
- basic reward templates — **built**;
- onboarding that explains privacy and partner permissions;
- rate limiting / per-user cost caps on the AI chat endpoint before it's public (today's caps are
  placeholder-sized for private use — see Technical Dependencies).

### Not Yet

- public AI builder that creates arbitrary visuals;
- marketplace of paid accessories;
- medical-grade interpretation;
- Facebook/Google login unless email/password is already stable;
- broad multi-couple social features;
- shared currency/points economy for rewards (see Pillar 6).

## Launch Sequence

### Phase 0: Private Couple Hardening

Goal: make current usage durable.

- finish VAPID setup;
- verify push subscriptions;
- verify realtime sync on both phones;
- add account migration plan;
- add export backup before auth migration;
- keep local data as source of safety;
- add real per-user rate limiting to `/api/chat` (currently sized for one private couple, not the
  public).

### Phase 1: Private Beta

Goal: test with a few trusted couples.

- email/password accounts;
- invite link;
- one or two cycle subjects per couple;
- basic partner tips;
- default companion;
- custom-date replay examples;
- AI chat available to both roles, tone/mascot picker discoverable;
- feedback form or WhatsApp support channel.

### Phase 2: Bolivia Soft Launch

Goal: validate positioning and willingness to pay.

- Spanish-first copy;
- Bolivia timezone defaults;
- simple onboarding;
- clear privacy promise (spell out explicitly: "Alba only reads your data when you send a chat
  message" — already the framing used inside the chat UI, extend it to the marketing site);
- educational content localized in tone;
- social content around partner support, not fear.

### Phase 3: Monetization Experiments

See the dedicated Monetization section below for the full menu; this phase is about running small,
reversible experiments, not committing to a final pricing model.

## Monetization

### Guiding rule

**Never paywall trust or safety.** If tracking cycle data ever feels transactional or held hostage,
churn spikes and word-of-mouth turns negative — the opposite of what a couples app needs to grow.
Concretely, never paywall:

- core cycle records or the ability to add/edit them;
- export/backup;
- account recovery;
- privacy/safety controls;
- basic couple sync;
- the AI chat entirely (a capped free tier is fine — see below — but don't make "ask Alba anything"
  a pure paywall from day one, it's the product's emotional hook).

### Tier structure (recommended starting point)

**Free (forever):**
- full local-first tracking, one couple, unlimited manual entries;
- basic sync, basic streak, the 4 default mascots;
- AI chat capped (e.g. N messages/day, one provider tier — likely the cheapest, e.g. NVIDIA/GLM);
- default coupon templates, no currency/store.

**Alba Plus (subscription, monthly or annual, annual discounted):**
- unlimited AI chat, access to the stronger provider/model tier;
- extra mascots / mascot personalities beyond the default 4;
- premium custom-date templates and animations;
- priority push notification reliability (if infra differentiation is real, don't fake this);
- couple-shared currency/points store (once built) with bigger reward catalogs.

**One-time cosmetic purchases (works even for free-tier users, low-friction impulse buys):**
- mascot skins/accessories;
- custom-date template packs (a "date night generator" pack, a "long distance" pack, etc.);
- premium animation packs (the pixel-loading-mascot idea, special celebration effects).

### Why this shape

- Subscription funds the recurring AI API cost (the actual marginal cost driver — unlike storage,
  every chat message costs real money per-provider, so metering by AI usage rather than by "cycle
  tracking features" ties price to actual cost).
- Cosmetics monetize the emotional/identity layer (mascots, custom dates) that people are already
  demonstrably attached to, without touching the health-data trust boundary at all.
- Free tier stays generous on the part of the product (accurate tracking) that drives trust and
  referrals; it's stingy only on the part (AI usage) that costs money per-call.

### Cost control is a launch blocker, not a nice-to-have

Before charging anyone: per-user daily/monthly token or message budgets enforced server-side (not
just client-side caps, which are trivially bypassed), and provider cost monitoring/alerting. A single
free-tier user with a scripted client could otherwise generate an unbounded provider bill.

## Incentives & Growth Loops

The couple-invite mechanic is already a natural viral loop — lean into it rather than bolting on a
generic referral program:

- **Invite-to-unlock:** connecting with a partner already unlocks couple sync; consider also
  unlocking a small AI-chat/coupon bonus for *both* people the first time a couple connects, so the
  inviter has a concrete reason to send the link today instead of "eventually."
- **Streak-driven re-engagement:** the existing streak/coupon system already does this — the
  moment a coupon becomes redeemable is a natural push-notification trigger ("¡Tienes un premio
  listo!") that isn't purely a nagging reminder.
- **Shareable moments, not shareable data:** never make raw cycle data shareable (privacy risk,
  also just not what people want to post). Do make *emotionally shareable, data-free* artifacts
  easy to export/share: a monthiversary card, a "we've tracked together for 90 days" milestone
  graphic, a redeemed-coupon celebration screenshot. These double as organic marketing since they
  travel through the partner's own social graph, not yours.
- **Waitlist scarcity for the soft launch:** a simple "invite N friends to skip the waitlist"
  mechanic works well for a couples app specifically because the natural unit is already a pair —
  ask people to bring their partner, not a generic friend count.

## Go-To-Market Plan

### Positioning line

"Alba no es solo para ti — es para los dos." (Differentiate from every solo-tracking app by leading
with the couple angle in every piece of marketing copy.)

### Channels, roughly in priority order for a Bolivia-first, low-budget launch

1. **TikTok/Reels/Shorts, partner-support-scenario content.** Short, funny-then-sweet skits: "cosas
   que tu pareja puede hacer en cada fase," "no es magia, es observar." This content format is cheap
   to produce, matches the app's warm/playful tone (the mascot personalities are good on-brand
   material here), and Bolivia + broader LatAm audiences are heavily short-video native.
2. **Micro-influencer seeding, not big-name ads.** Bolivian/LatAm couple or relationship-content
   creators with 5k-50k followers get better trust-per-dollar than a large generic ad buy for a
   product this personal/private. Offer free Plus accounts + a small flat fee, not just affiliate
   %, since the honest "we actually use this" endorsement matters more than reach here.
3. **WhatsApp waitlist + referral.** WhatsApp is the dominant channel in Bolivia for this kind of
   organic, trust-based sharing — a waitlist that lives there (not just email) will convert better
   than a typical SaaS email waitlist.
4. **University/young-couple circles for private beta.** Cheap, high-signal qualitative feedback,
   and this cohort is disproportionately likely to actually use a couple-tracking app and talk about
   it.
5. **Landing page**, simple, privacy-forward, couple-framed — not a generic "period tracker" page.
   Lead with the partner-support angle and a screenshot of the AI chat mid-conversation (the
   product's most novel, differentiated surface) rather than a calendar screenshot everyone's seen.
6. **Later, once content quality/traction is proven:** partnerships with educators, doulas,
   nutritionists, or cycle-awareness teachers for credibility content — don't lead with this, it's
   a phase-2+ credibility layer once you have real users to point to.

### Content cadence suggestion for the soft launch window

- 3-4 short videos/week (skits + one educational "did you know" per week);
- 1 longer-form piece every 2 weeks (a couple's real story, anonymized, with permission) once you
  have beta users willing to share;
- Reuse app-generated shareable moments (see Growth Loops) as low-effort content seeds.

### App-store presence (once beyond PWA-only)

If/when a native wrapper or listed PWA happens: ASO around "period tracker for couples," "seguimiento
de ciclo en pareja" — this is a much less contested keyword space than generic "period tracker," and
matches actual positioning instead of competing head-on with Flo/Clue on their own terms.

## Metrics

Product:

- daily temperature completion;
- weekly active couples;
- successful sync events;
- entries recovered from local queue;
- custom-date replays;
- notification opt-in;
- AI chat messages per active user, per role (owner vs. partner) — watch for partner-side
  engagement specifically, since that's the differentiated audience;
- coupon creation rate and redemption rate;
- partner trivia views (once built).

Quality:

- data loss reports;
- failed sync reports;
- notification failures;
- user confusion during onboarding;
- support questions about privacy;
- AI chat error rate by provider (surfacing real upstream errors, not swallowing them, makes this
  measurable — already true in the current implementation);
- AI chat latency (time-to-first-token) — this is a felt-quality metric, not just a technical one.

Business:

- waitlist conversion;
- beta activation;
- 7-day retention;
- 30-day retention;
- willingness to pay for cosmetic/experience features;
- template usage;
- AI provider cost per active user (track from day one, even pre-monetization — this is the number
  that determines whether the free tier is sustainable);
- Plus conversion rate, and specifically which trigger converts (AI cap hit vs. cosmetic desire vs.
  currency/store).

## Technical Dependencies

- Supabase Auth.
- UUID `couple_id`.
- `cycle_subjects`.
- realtime policies tied to couple membership.
- Supabase Storage for custom photos/audio.
- companion/avatar registry.
- custom-date block renderer.
- service worker notification reliability.
- `GEMINI_API_KEY` / `NVIDIA_API_KEY` / `OPENAI_API_KEY` + `AI_PROVIDER` default, set on the
  hosting platform (Vercel) — see `docs/AI_CHATBOT_ARCHITECTURE.md` for the full contract.
- per-user rate limiting / cost budgeting on the AI chat endpoint (not yet built — required before
  public launch, see Phase 0).
- provider cost monitoring/alerting (not yet built — required before charging anyone).

## Open Questions

- What should the public default Alba companion look like?
- Should Alba launch first as couple-only, or allow solo use with optional partner invite?
- How much partner education should be visible before account linking?
- Should custom dates be part of launch, or remain a beta delight feature?
- What exact pricing model feels acceptable in Bolivia specifically vs. a broader LatAm rollout —
  is regional pricing needed from day one?
- Which provider becomes the *paid-tier* model, and is the cost gap (vs. the free-tier provider)
  wide enough to justify gating on it specifically, or should Plus instead gate on *volume* with the
  same model?
- Does the shared currency/points economy (Pillar 6) ship before or after monetization — it changes
  the reward system's data model either way, better to decide before building either.
