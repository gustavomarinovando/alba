# Alba Launch Roadmap

## Positioning

Alba should launch as a couple-aware cycle companion: local-first health tracking for the person recording their cycle, plus gentle partner education and relationship moments for both people.

Core promise:

- protect cycle data;
- make daily tracking easier;
- help partners understand and support each other;
- make the app feel personal through avatars and custom experiences.

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

### 3. Companion Avatars

Avatars are a permanent emotional layer.

Required:

- default Alba companion;
- couple/private companions;
- avatar setup;
- dark/light contrast checks;
- walking and sitting previews;
- reactions to saves and reminders;
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

All health content needs careful phrasing and should avoid medical certainty.

## MVP Before Public Launch

### Must Have

- account creation and login;
- couple invite flow;
- migration from `couple_id = 1` without losing local data;
- robust sync on load, focus, online, save, and delete;
- realtime entry updates;
- export and import;
- push notification setup that works in production;
- default Alba companion;
- current four cats as seed companion examples;
- May album and Mandarino as replayable built-ins;
- basic streak for daily temperature;
- partner trivia cards.

### Should Have

- avatar setup with front and side preview;
- accessory rewards for streak milestones;
- custom-date preview route;
- photo-album template;
- recipe/date-night template;
- basic reward templates;
- onboarding that explains privacy and partner permissions.

### Not Yet

- public AI builder that creates arbitrary visuals;
- marketplace of paid accessories;
- medical-grade interpretation;
- Facebook/Google login unless email/password is already stable;
- broad multi-couple social features.

## Launch Sequence

### Phase 0: Private Couple Hardening

Goal: make current usage durable.

- finish VAPID setup;
- verify push subscriptions;
- verify realtime sync on both phones;
- add account migration plan;
- add export backup before auth migration;
- keep local data as source of safety.

### Phase 1: Private Beta

Goal: test with a few trusted couples.

- email/password accounts;
- invite link;
- one or two cycle subjects per couple;
- basic partner tips;
- default companion;
- custom-date replay examples;
- feedback form or WhatsApp support channel.

### Phase 2: Bolivia Soft Launch

Goal: validate positioning and willingness to pay.

- Spanish-first copy;
- Bolivia timezone defaults;
- simple onboarding;
- clear privacy promise;
- educational content localized in tone;
- social content around partner support, not fear.

### Phase 3: Monetization Experiments

Safe monetization:

- cosmetic avatar packs;
- special-date templates;
- premium animations;
- partner reward packs;
- AI-assisted copy suggestions;
- cloud backup tier if needed.

Avoid paywalling:

- core cycle records;
- export;
- account recovery;
- safety/privacy controls;
- basic sync.

## Bolivia Go-To-Market Ideas

- TikTok/Reels showing partner-support scenarios.
- Content in Spanish with Bolivian everyday tone.
- "Cosas que tu pareja puede hacer en cada fase" series.
- "No es magia, es observar" educational series.
- Private beta through friends, couples, and university circles.
- Simple landing page focused on couple tracking and privacy.
- WhatsApp waitlist.
- Partnerships later with educators, doulas, nutritionists, or cycle-awareness teachers if content quality is strong.

## Metrics

Product:

- daily temperature completion;
- weekly active couples;
- successful sync events;
- entries recovered from local queue;
- custom-date replays;
- notification opt-in;
- partner trivia views.

Quality:

- data loss reports;
- failed sync reports;
- notification failures;
- user confusion during onboarding;
- support questions about privacy.

Business:

- waitlist conversion;
- beta activation;
- 7-day retention;
- 30-day retention;
- willingness to pay for cosmetic/experience features;
- template usage.

## Technical Dependencies

- Supabase Auth.
- UUID `couple_id`.
- `cycle_subjects`.
- realtime policies tied to couple membership.
- Supabase Storage for custom photos/audio.
- companion/avatar registry.
- custom-date block renderer.
- service worker notification reliability.

## Open Questions

- What should the public default Alba companion look like?
- Should Alba launch first as couple-only, or allow solo use with optional partner invite?
- How much partner education should be visible before account linking?
- Should custom dates be part of launch, or remain a beta delight feature?
- What exact pricing model feels acceptable in Bolivia?
