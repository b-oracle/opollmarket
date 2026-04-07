

## Plan: Update Space Share Text

### Problem
The current share text for upcoming spaces says *"is coming soon on OPoll Spaces"*, which isn't engaging enough. It should say *"Set your reminder for my upcoming space on OPollmarket"* instead.

### Changes

**`src/components/social/SpaceShareSheet.tsx`**
- Change the non-live share text from:
  `🗓️ "${spaceTitle}" is coming soon on OPoll Spaces — Let's discuss your OPinion, JOIN NOW 👇🏽`
- To:
  `🗓️ Set your reminder for my upcoming space "${spaceTitle}" on OPollmarket — Let's discuss your OPinion, JOIN NOW 👇🏽`

Single line change, no other files affected.

