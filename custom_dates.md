# Custom Dates, Avatars, Streaks, and Rewards

## Product Direction

Alba should treat special dates as replayable experiences, not one-off hardcoded surprises. The Mandarino monthiversary is the first example: it has a trigger, copy, cats, recipe, audio, animations, and a manual way to reopen it.

Long-term, this can become a "relationship moments" system:

- special dates and custom prompts;
- avatar companions;
- streaks and rewards;
- accessories and collectibles;
- partner-authored surprises;
- optional AI-assisted builders.

## Current Implementation

The app has a small "Fechas especiales" section in Settings.

Current development:

- `mandarino-monthiversary`
- Trigger: every day 6.
- Experience: Mandarino story, recipe, note, cats, and audio interactions.
- Controls: reopen manually and toggle automatic activation.

The current activation flag is local-only through localStorage. It should move to Supabase once accounts and couples exist.

## Suggested Data Model

### `custom_date_experiences`

- `id uuid primary key`
- `couple_id uuid`
- `created_by uuid`
- `title text`
- `description text`
- `trigger_type text`: `specific_date`, `monthly_day`, `date_range`, `manual`
- `trigger_config jsonb`
- `status text`: `draft`, `active`, `archived`
- `visibility text`: `both`, `partner_only`, `subject_only`
- `created_at timestamptz`
- `updated_at timestamptz`

### `custom_date_assets`

- `id uuid primary key`
- `experience_id uuid`
- `kind text`: `cat`, `image`, `audio`, `text`, `animation`, `recipe`, `reward`
- `payload jsonb`
- `sort_order integer`

### `avatar_companions`

- `id uuid primary key`
- `couple_id uuid`
- `owner_profile_id uuid null`
- `name text`
- `species text`
- `base_avatar_key text`
- `palette jsonb`
- `traits jsonb`
- `created_at timestamptz`

### `avatar_accessories`

- `id uuid primary key`
- `companion_id uuid`
- `slot text`: `collar`, `hat`, `charm`, `background`, `toy`
- `asset_key text`
- `source text`: `streak`, `gift`, `purchase`, `special_date`
- `equipped boolean`
- `created_at timestamptz`

### `avatar_sound_assets`

- `id uuid primary key`
- `couple_id uuid`
- `companion_id uuid`
- `uploaded_by uuid`
- `kind text`: `meow`, `purr`, `tap`, `save`, `celebration`, `sleep`
- `storage_bucket text`
- `storage_path text`
- `duration_ms integer`
- `loudness_lufs numeric null`
- `mime_type text`
- `source text`: `recorded`, `uploaded`, `template`
- `status text`: `active`, `archived`, `needs_review`
- `created_at timestamptz`

### `streaks`

- `id uuid primary key`
- `couple_id uuid`
- `subject_id uuid`
- `metric text`: `temperature`, `period_note`, `daily_checkin`
- `current_count integer`
- `best_count integer`
- `last_completed_on date`
- `updated_at timestamptz`

### `reward_catalog`

- `id uuid primary key`
- `title text`
- `description text`
- `reward_type text`: `date`, `gift`, `recipe`, `avatar_accessory`, `message`, `experience`
- `payload jsonb`
- `price_cents integer null`
- `is_template boolean`
- `created_at timestamptz`

## Avatar Customization and Audio

Avatar customization should become one of the most expressive parts of Alba. The goal is not just choosing a cat; it should feel like building a tiny companion with memory, personality, and special-date roles.

Per-avatar customization ideas:

- name, nickname, pronouns, owner, and relationship role;
- species or base body: orange cat, tuxedo, black cat, lynx point, future companions;
- palette controls for body, muzzle, belly, paws, tail, ears, eyes, and outline;
- markings: stripes, masks, socks, blaze, nose spots, scars, freckles;
- body details: tail length, ear shape, eye style, fluff level, sitting or walking silhouette;
- accessories by slot: collar, charm, ribbon, hat, tiny bag, toy, blanket, background;
- animation style: shy peek, patrol, sleepy, excited, playful fight, loving couple, celebration;
- mood presets: calm, hungry, sleepy, affectionate, mischievous, proud;
- special-date overrides so Mandarino can look different on anniversaries without changing the everyday avatar.

Audio customization should support both recording inside the app and uploading existing files:

- record a custom meow or purr through the browser microphone after explicit permission;
- upload existing audio clips such as `.m4a`, `.mp3`, `.wav`, `.ogg`, or `.webm`;
- assign sounds per avatar and action: one tap, double tap, save, reward unlock, sleeping, streak celebration;
- preview the waveform, trim start/end, and choose the best short segment;
- keep multiple variants so each cat can have a few meows instead of one repetitive sound.

Recommended pre-normalization pipeline:

- trim leading and trailing silence;
- reject clips that are too long, too loud, silent, or distorted;
- normalize perceived loudness around `-16 LUFS` for interaction sounds;
- add a tiny fade-in and fade-out to avoid clicks;
- convert to a web-friendly format such as AAC/M4A or Opus/WebM;
- generate metadata: duration, peak, loudness, waveform preview, original filename;
- optionally keep the original file only for a short retention window, then store the normalized derivative.

Future storage strategy:

- store binary files in Supabase Storage, not directly in Postgres;
- keep only paths and metadata in `avatar_sound_assets`;
- use a private bucket such as `avatar-audio` with RLS or signed URLs;
- scope every asset by `couple_id` and `companion_id`;
- cache normalized audio through the browser cache or service worker after first playback;
- enforce file size and duration limits, for example 2 MB and 10 seconds before trimming;
- require clear consent if the recording contains a human voice or identifiable private audio.

## Streak and Reward Ideas

- Temperature streaks unlock collar charms, ribbons, little toys, nap spots, or avatar backgrounds.
- Period notes unlock educational trivia cards and care tips.
- Couple check-ins unlock date ideas, recipes, playlists, or tiny animations.
- Partner-created rewards can be homemade dinner, dessert night, cinema date, massage coupon, or surprise note.
- Accessories can be monetized later as optional cosmetic packs.

Rewards should motivate gently. Do not make health tracking feel punitive.

## Monetization Notes

The safest path is cosmetic and experiential monetization:

- avatar accessory packs;
- special date templates;
- premium animations;
- AI-assisted surprise builder;
- partner date/reward template bundles.

Avoid paywalling core health records, export, sync, account recovery, or safety features.

## Builder Roadmap

### Phase 1: Templates

Give users polished templates:

- monthiversary note;
- birthday surprise;
- period-care day;
- recipe night;
- "open when you wake up" message;
- streak reward unlock.

Users edit text, date, avatar selection, and colors.

### Phase 2: Visual Controls

Add a structured editor:

- choose companions;
- choose placement;
- choose animation style;
- choose audio;
- choose reward;
- preview on mobile and desktop.

### Phase 3: AI Assistance

AI should not directly run arbitrary code. It can produce a safe structured plan:

```json
{
  "title": "Tangerine date night",
  "tone": "romantic playful",
  "sections": [],
  "avatar_actions": [],
  "copy": [],
  "reward": {}
}
```

The app renders from allowed blocks. This keeps surprises expressive without making the frontend unsafe.

## Implementation Principles

- Experiences must be replayable.
- Users must be able to disable automatic prompts.
- Every special date needs a manual preview mode.
- Assets should be reusable across dates.
- Streak rewards should motivate without guilt.
- Never delete local health data when enabling accounts or custom dates.

## Next Technical Steps

1. Move Mandarino metadata fully into a `CUSTOM_DATE_DEVELOPMENTS` registry.
2. Sync activation flags through Supabase once accounts exist.
3. Add `avatar_companions` with the four current cats as seed companions.
4. Add streak counters for temperature records.
5. Add reward templates tied to streak milestones.
6. Add a preview route for special-date experiences.
7. Add a safe block-based builder.
