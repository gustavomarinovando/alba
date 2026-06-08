# Custom Dates and Relationship Experiences

## Product Direction

Custom dates in Alba should be replayable relationship experiences, not one-off surprises hidden in code. They are moments one person prepares for someone they love, but the feature should work both ways: either person in a relationship can create, receive, replay, and adapt an experience.

Important distinction:

- custom dates are event experiences such as an album, recipe, note, countdown, or surprise scene;
- avatars are now a permanent Alba system, not a subfeature of custom dates;
- streaks and rewards may use custom dates and avatars, but they should stay as their own product layer.

The first two real Alba experiences should become templates:

1. `may-photo-album`
   - First special event.
   - A simpler photo-album experience prepared in May.
   - It should be replayable because she may want to reenact it.
   - Exact date, copy, and image sequence still need to be reconstructed.
2. `mandarino-monthiversary`
   - Second special event.
   - Monthiversary recipe experience with cats, note, audio, and animated narrative.
   - Useful as a richer template for recipe/date-night surprises.

## Current Implementation

The app has a small `Fechas especiales` section in Settings.

Current registry:

- `may-photo-album`
  - Status: needs build.
  - Trigger: May, exact date pending.
  - Experience: photo album / memory replay.
- `mandarino-monthiversary`
  - Status: built.
  - Trigger: every day 6.
  - Experience: Mandarino story, recipe, note, cats, and audio interactions.
  - Controls: reopen manually and toggle automatic activation.

The current activation flag is local-only through localStorage. It should move to Supabase once accounts and couples exist.

## Template Families

### Photo Album Template

Based on the May event.

Expected blocks:

- opening message;
- photo stack, carousel, or timeline;
- optional captions per photo;
- final note;
- replay button;
- optional avatar companion reactions.

Useful future presets:

- "Our month in photos";
- "Open when you miss us";
- "A day I want to remember";
- "Before our date";
- "This was us".

### Recipe or Date-Night Template

Based on the Mandarino recipe event.

Expected blocks:

- intro scene;
- preparation plan;
- shared steps;
- serving or date-night finale;
- note;
- optional checklist;
- optional avatar animation.

Useful future presets:

- dessert together;
- breakfast surprise;
- picnic plan;
- movie-night snack;
- homemade dinner coupon.

### Message or Note Template

Expected blocks:

- scheduled greeting;
- private note;
- reveal animation;
- replay setting;
- optional partner response.

Useful future presets:

- birthday note;
- anniversary note;
- apology and repair note;
- "good morning" note;
- "open after work" note.

## Suggested Data Model

### `custom_date_experiences`

- `id uuid primary key`
- `couple_id uuid`
- `created_by uuid`
- `recipient_profile_id uuid null`
- `title text`
- `description text`
- `template_key text null`
- `trigger_type text`: `specific_date`, `monthly_day`, `date_range`, `manual`
- `trigger_config jsonb`
- `status text`: `draft`, `active`, `archived`
- `visibility text`: `both`, `creator_only`, `recipient_only`
- `created_at timestamptz`
- `updated_at timestamptz`

### `custom_date_blocks`

- `id uuid primary key`
- `experience_id uuid`
- `kind text`: `message`, `image_album`, `recipe_step`, `note`, `checklist`, `avatar_scene`, `audio`, `reward`
- `payload jsonb`
- `sort_order integer`

### `custom_date_assets`

- `id uuid primary key`
- `experience_id uuid`
- `kind text`: `image`, `audio`, `video`, `text`, `animation`, `recipe`, `reward`
- `storage_bucket text null`
- `storage_path text null`
- `payload jsonb`
- `sort_order integer`

### `custom_date_templates`

- `key text primary key`
- `title text`
- `description text`
- `category text`: `album`, `recipe`, `message`, `date_plan`, `reward`
- `default_blocks jsonb`
- `is_premium boolean`
- `created_at timestamptz`

## Builder Roadmap

### Phase 1: Replayable Built-Ins

- Move May album metadata into the registry.
- Reconstruct the May photo-album experience with accurate copy and photos.
- Keep Mandarino as the richer recipe/date-night reference.
- Add a manual preview or replay route for each experience.

### Phase 2: Templates

Give users polished templates:

- photo album;
- monthiversary note;
- birthday surprise;
- period-care day;
- recipe night;
- "open when you wake up" message;
- streak reward unlock.

Users edit recipient, date, copy, photos, sections, and optional avatar scenes.

### Phase 3: Visual Controls

Add a structured editor:

- choose template;
- choose recipient;
- choose trigger date;
- edit text blocks;
- upload or choose photos;
- choose avatar cameo, if desired;
- choose reveal animation;
- choose audio;
- preview on mobile and desktop.

### Phase 4: AI Assistance

AI should not directly run arbitrary code. It can produce a safe structured plan:

```json
{
  "title": "Tangerine date night",
  "tone": "romantic playful",
  "sections": [],
  "copy": [],
  "assets_needed": [],
  "avatar_cameos": [],
  "reward": {}
}
```

The app renders from allowed blocks. This keeps surprises expressive without making the frontend unsafe.

## Implementation Principles

- Experiences must be replayable.
- Both partners can create and receive experiences.
- Users must be able to disable automatic prompts.
- Every special date needs a manual preview mode.
- Assets should be reusable across dates.
- Avatars can appear in custom dates, but avatars are not owned by custom dates.
- Never delete local health data when enabling accounts or custom dates.

## Open Questions

- What was the exact date of the May photo-album event?
- Which photos and copy belonged to that experience?
- Should the May album replay exactly as originally shown, or should it become a polished "template version" inspired by the original?
- Should custom experiences be private drafts until explicitly shared with the partner?

## Next Technical Steps

1. Add a real `may-photo-album` replay experience.
2. Add `status` and `template_key` to the local custom date registry.
3. Move activation/replay state from localStorage to Supabase once accounts exist.
4. Create `custom_date_experiences`, `custom_date_blocks`, and `custom_date_assets`.
5. Add a preview route for special-date experiences.
6. Add the safe block-based builder.
