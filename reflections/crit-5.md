## What was the breakthrough that moved the work forward?

The main breakthrough was learning to turn a problem that only "felt wrong"
into something I could observe and test. After choosing an upgrade, the next
encounter sometimes damaged the player immediately. A screenshot could show
the result, but it could not tell me whether the game was unfair or whether I
had simply reacted too slowly. I temporarily exposed the live player and enemy
positions and found that they could spawn at almost the same coordinate. Once
I could see the exact state, the solution became clear: reposition the player
at a safe distance whenever the next encounter begins, then verify that
distance directly.

The same approach helped during the final refinement. Instead of treating
comments such as "the last level is a dead end" or "enemies do not follow me"
as purely visual issues, I converted them into checkable rules. The final-level
vine now connects the ground to a real landing surface, enemies can move toward
the player's height after becoming aggressive, and tests verify both
behaviours. This made the work move faster because I was no longer repeatedly
guessing at values and replaying the same section without knowing what had
changed.

## What did this change about the developer you want to be?

This project changed my idea of what useful testing looks like for an
interactive game. I used to think that if a game built successfully and felt
acceptable during one playthrough, it was probably finished. Crit 5 showed me
that a playable result can still hide unfair transitions, unreachable routes,
stacked damage, or layouts that only fail at one viewport. I want to become a
developer who treats those details as part of the design rather than as polish
to add at the end.

I also want to keep using small, temporary pieces of instrumentation when the
screen does not reveal enough information. They should support playtesting,
not replace it: the browser shows whether the experience communicates clearly,
while state inspection and automated tests explain why it behaves that way.
For this project, combining both methods was more reliable than trusting either
one alone. In future work I want to define important gameplay promises early
— such as one damage event per frame, a recoverable route through every level,
and complete visual assets for every item — and make those promises testable as
the game grows.
