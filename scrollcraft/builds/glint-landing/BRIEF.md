# Glint landing: brief

**Self-authored under explicit creative delegation.** The owner asked for a product-manager / UX pass
("think deeply… improve the website… a good USP") and then "use that skill and update". No interview
was run; every answer below is an authored decision, not a quotation.

Target: `web/src/routes/+page.svelte` (SvelteKit, live site). Constraint from the owner: keep the
existing content, pricing, FAQ and components.

## The eight topics

1. **Vibe:** calm under pressure, private, fast, quietly confident. References: a pilot's head-up
   display; the hush of a waiting room just before an interview; a teleprompter.
2. **Journey:** see Glint working on a real-looking call → see that nobody else can see it →
   where it helps you → why it holds up → what it costs → doubts answered → try the detector yourself
   and download.
3. **Energy curve:** quiet open, rising during the demo, a sharp lift at the invisibility reveal,
   calm and factual through features / pricing / FAQ, a small personal spark at the close.
4. **Feeling, and the one moment:** see curve below. The moment: *"I scrolled and the interviewer's
   question lit up yellow and got answered, then half the screen showed what the interviewer sees and
   Glint just wasn't there."*
5. **What no other site does:** the scroll is the interviewer. Scrolling speaks their sentence word
   by word, and Glint's real question detector (the same code the app ships) highlights the question
   as it forms. At the end, the visitor types their own interview line into the same detector.
6. **Range:** dense-leaning premium dark (it is a HUD, information-forward), one amber accent plus the
   product's own question-yellow as a role colour (detected questions only). No gradient text, no
   violet AI glow.
7. **One world or scenes:** distinct scenes. The demo is one held surface; everything after it is
   ordinary reading.
8. **Assets:** none photographic, and no generation key. The real asset is the product UI, rebuilt in
   markup running real logic on clearly labelled sample data.

## Grammar

**Live surface** for the opening (the demo is the argument; the page behaves like the product). The
owner's constraint keeps pricing, FAQ and the use-case tabs as conventional sections below it, which
is a deliberate deviation from the grammar's "no marketing chrome" rule, recorded here rather than
hidden. Why not the others: filmic one-shot and continuous world need footage we don't have and
would fake the product; typographic poster and editorial undersell a demo-able tool; gallery has no
range of objects; split stage is used *inside* the peak (what you see / what they see), not as the
page spine; rhythmic cutlist is the wrong energy for a nervous candidate.

## Feeling curve (written before the acts)

| Act | Feeling | What causes it |
|---|---|---|
| 1 Hero, at rest | Curiosity, calm | A real call on screen, Glint's bar already sitting on top of it, the headline readable at once |
| 2 Demo scrub | Leaning in, then relief | Their sentence arrives under the visitor's own scroll; the question turns yellow; the answer streams |
| 3 Invisibility wipe (**peak**) | Surprise, then safety | A divider sweeps across: right half is the shared screen, and Glint is simply absent there |
| 4 Use cases | Recognition | "That's my sales call / my standup" via tabs with real exchanges |
| 5 Features + comparison | Trust | Facts, plainly, no hype |
| 6 Pricing | Relief about money | Rupees, per hour, no subscription |
| 7 FAQ | Reassurance | The doubts they already had |
| 8 Close: detector | Ownership, a small spark | Their own words get highlighted by the same detector; then the download |

Adjacent acts never share a feeling. The peak (act 3) gets the longest held scroll and the biggest
visual change; act 2 before it is busier but smaller in frame.

**The peak:** "Half the screen showed what the interviewer sees, and Glint just wasn't there." Act 3.

**Tell someone:** *It's the site where scrolling makes the interviewer ask a question, Glint answers
it, and then it shows you the interviewer's screen where Glint is invisible.*

**Authored silence:** a short hold after the answer finishes and before the wipe begins, so the
visitor reads the answer before the reveal. Not dead scroll.

## Score

| Beat | Device | Why |
|---|---|---|
| Hero | layered stage (call window / overlay / foreground chips / glow at different rates) | Depth from the real UI, no imagery needed |
| Demo | `pin` + scroll-driven state (signature) | The surface holds while its state advances |
| Peak | `reveal` (clip-path divider) inside the same pin | A change of state: what they see |
| Use cases | tabs (existing) | Range |
| Features / compare | `flow` + `in` | Reading |
| Pricing / FAQ | `flow` | Reading |
| Close | real input running the detector | Live-surface ending is an input, not a button island |

## Signature move

**The scroll is the interviewer.** Scroll position speaks a sample interviewer line word by word into
Glint's captions; the shipped `extractQuestion()` runs on every word and paints the question yellow
the instant it becomes one; the auto-answer then streams. The close reuses the same function on the
visitor's own typing.
