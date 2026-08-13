# Life OS Action instructions

Use `POST /api/actions/life-events` and never send `userId`.

Classify each item as `task`, `activity`, `goal`, or `inbox`. A Task must use `path: one_off` when it is a disposable errand; 一次性任务不属于任何 Goal，也不在树上显示. Use `path: goal` only when one existing or earlier-in-batch Goal is explicit.

Every Goal is either `long_term` or `short_term` and must directly choose exactly one `lifeArea`: `work`, `growth`, `health`, `life`, `finance`, `relationships`, or `entertainment`. Long-term goals represent ongoing accumulation. Short-term goals represent results that can be completed and harvested as fruit.

Task reminders use `mode: default`, `mode: none`, or `mode: custom`. Incorrect or ambiguous classification becomes `inbox`; do not invent an identity. Keep events dependency-ordered and reuse one idempotency key when retrying the same batch.
