<!--
DRAFT — written by the agent from the session's actual work, not the
student's own words. Read it, cut anything that doesn't match how you
actually experienced the week, and rewrite the rest in your own voice
before submitting. The events described (the debug-hook technique, the
spawn-safety bug) really happened this session — the *reflection* on them
needs to be yours.
-->

## What was the breakthrough that moved the work forward?

The stuck point was a fairness bug I couldn't see just by reading the code:
after picking an upgrade, the next encounter sometimes felt like it hit me
before I'd even reacted. Screenshots weren't enough to tell whether that was
real or just my own reaction time, and guessing from pixels wasn't going
anywhere. The breakthrough was giving up on inferring state from the canvas
and instead wiring a one-line debug hook into the running game so I could
read the exact player and enemy positions as numbers. That turned a vague
"feels unfair" into a concrete fact: the player and an enemy really were at
the same coordinate the instant the upgrade screen closed. Once the bug was
a number instead of a feeling, the fix was obvious and quick to verify.

## What did this change about the developer you want to be?

*(Placeholder — this is the part that most needs to be in your own words.)*
This week reinforced that "I played it and it felt fine" isn't the same as
verifying a game is fair, and that when a bug is hard to pin down, it's
often worth spending time building a small, temporary tool to see the real
state rather than continuing to guess from the outside — and then removing
that tool once it's done its job. Replace this paragraph with what actually
changed for you: was it about trusting playtesting over assumptions,
patience with instrumentation, something about scope, or something else
entirely?
