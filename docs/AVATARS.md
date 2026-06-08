# Alba Avatars

## Product Direction

Avatars are now an integral part of Alba, not a custom-date feature. They should make the app feel warmer, more personal, and easier to return to every day.

They can appear in custom dates, streak rewards, educational tips, onboarding, and daily updates, but they should have their own data model, customization flow, and long-term identity.

## Default App Companion

Alba should eventually choose one default companion as the face of the app.

Recommended direction:

- Use a neutral Alba companion by default, separate from a couple's private avatars.
- The default companion can deliver updates, cycle trivia, care tips, and gentle reminders to both users.
- Couple-specific companions can be added later and customized deeply.

This avoids making Mandarino the public default by accident. Mandarino is emotionally meaningful for the current couple, but a market-ready app needs a default mascot that feels available to everyone.

Candidate default companion traits:

- warm and calm;
- slightly playful;
- medically careful, never overconfident;
- able to speak to either partner;
- visually simple enough to work as an icon, sticker, and in-app character.

## Roles

### Alba Companion

Default mascot and guide.

Uses:

- daily update;
- temperature reminder;
- cycle trivia;
- phase explanation;
- partner education;
- onboarding;
- empty states.

### Couple Companions

Private avatars owned by a couple or user.

Uses:

- patrol and wandering animations;
- custom date cameos;
- streak rewards;
- accessories;
- personal sounds;
- future collectibles.

### Subject Companion

Optional avatar associated with the person whose cycle is being tracked.

Uses:

- self-care suggestions;
- symptom logging encouragement;
- private notes;
- approval flows for partner-entered data.

### Partner Companion

Optional avatar associated with the partner.

Uses:

- partner tips;
- trivia;
- reminders to support without pressuring;
- date/reward suggestions.

## Avatar Setup

The setup should include both static identity and animated previews.

Required preview modes:

- front/sitting view;
- side-view walking silhouette;
- tiny icon or sticker view;
- dark-mode and light-mode contrast check;
- accessory preview.

Core controls:

- name;
- species or base avatar;
- palette;
- markings;
- eyes;
- muzzle;
- paws and legs;
- tail;
- outline/glow strength;
- voice/sounds;
- favorite animation.

Audio controls:

- record a custom sound in the browser;
- upload existing `.m4a`, `.mp3`, `.wav`, `.ogg`, or `.webm`;
- trim silence;
- normalize loudness;
- assign sounds to actions such as tap, double tap, save, sleep, reward unlock, and celebration.

## Data Model

### `avatar_companions`

- `id uuid primary key`
- `couple_id uuid null`
- `owner_profile_id uuid null`
- `name text`
- `species text`
- `role text`: `default_app`, `couple`, `subject`, `partner`
- `base_avatar_key text`
- `palette jsonb`
- `traits jsonb`
- `is_default boolean`
- `created_at timestamptz`
- `updated_at timestamptz`

### `avatar_accessories`

- `id uuid primary key`
- `companion_id uuid`
- `slot text`: `collar`, `hat`, `charm`, `background`, `toy`, `blanket`
- `asset_key text`
- `source text`: `streak`, `gift`, `purchase`, `special_date`, `default`
- `equipped boolean`
- `created_at timestamptz`

### `avatar_sound_assets`

- `id uuid primary key`
- `couple_id uuid null`
- `companion_id uuid`
- `uploaded_by uuid null`
- `kind text`: `meow`, `purr`, `tap`, `save`, `celebration`, `sleep`, `tip`
- `storage_bucket text`
- `storage_path text`
- `duration_ms integer`
- `loudness_lufs numeric null`
- `mime_type text`
- `source text`: `recorded`, `uploaded`, `template`
- `status text`: `active`, `archived`, `needs_review`
- `created_at timestamptz`

## Storage Strategy

- Store audio and image files in Supabase Storage, not directly in Postgres.
- Store metadata and ownership in tables.
- Use private buckets for couple-specific assets.
- Use public/cacheable buckets only for default Alba assets.
- Use signed URLs or RLS-backed storage policies for private companion sounds.
- Enforce file size and duration limits before upload when possible.

Recommended audio preprocessing:

- trim leading and trailing silence;
- reject clips that are too long, silent, clipped, or distorted;
- normalize perceived loudness around `-16 LUFS` for interaction sounds;
- add tiny fade-in/fade-out;
- convert to AAC/M4A or Opus/WebM;
- generate waveform preview metadata.

## Product Ideas

- Daily companion patrol.
- Sleeping companion easter egg.
- Companion reacts when data is saved.
- Companion explains today's phase.
- Partner companion gives care tips.
- Streaks unlock collars, charms, toys, backgrounds, and animations.
- Premium cosmetic packs can be monetized later.
- Custom sounds can become a premium or relationship-depth feature, but basic avatar identity should remain free.

## Implementation Roadmap

1. Keep the four current cats as seed companions.
2. Choose or design the default Alba companion.
3. Move hardcoded cat metadata into an avatar registry.
4. Add avatar setup preview in Settings.
5. Persist avatar choices locally.
6. Sync avatar choices through Supabase accounts.
7. Add accessories and streak rewards.
8. Add custom audio recording/upload.
9. Add companion-led tips and trivia.

## Open Questions

- Which avatar should be Alba's public default companion?
- Should the default app companion be a cat, or a more abstract mascot?
- Should Mandarino remain private to the current couple or become an optional orange-cat template?
- Should both partners have separate avatars by default?
