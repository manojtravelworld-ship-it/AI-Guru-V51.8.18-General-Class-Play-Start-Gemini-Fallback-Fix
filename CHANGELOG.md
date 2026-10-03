## V51.8.18 — General Class Play/Start Hardening + Gemini Timeout Fallback

- Fixed the remaining physical-page jump: when the selected page has no extracted paragraph, Play now keeps the PDF/reference pane on the requested physical page instead of silently advancing page 7 → page 9 or back to page 1. The readable cursor is retained only as context.
- General Class synthetic Teacher-Reading sections now preserve the requested physical page in their source anchor and `TextbookPage.pageNumber`, so the planner/reader sees the same page the student selected.
- Prevented selected-material auto-positioning from overriding an explicit page selection while Play is starting.
- Reduced the Gemini 3B1B planner timeout from 20s to 12s and trimmed oversized teacher-reading prompt payloads to reduce latency.
- Added a deterministic `buildLocalTeacherLesson()` emergency path for General Class Teacher-Reading: if Gemini times out or temporarily fails, the API still returns a playable textbook-grounded lesson using the supplied page/cue manifest. It never invents a verified solution; mathematical verification remains authoritative.
- The local fallback keeps the whiteboard concise (labels/equations/visual objects) and keeps detailed reading/explanation in the teacher speech layer. Existing bilingual material translations are reused when available.
- Added explicit playback-anchor diagnostics to the classroom log.
- Added optional pre-generated bilingual source/explanation fields to the teaching request so the emergency fallback can reuse Material Studio translations.
- Problems & Formulae remains isolated from this General Class fallback; its dedicated visual/DNA playback path is unchanged.


## V51.8.17 — General Class Page-7 Playback Lock

- Fixed the remaining page-jump defect where the selected-material synchronization effect re-ran whenever `paragraphIndex` changed and snapped a manually selected page (such as page 7) back to the material's first section (often page 1).
- Selected-material auto-positioning now runs once per material and never re-runs on ordinary page/paragraph navigation.
- General Class Play no longer falls back to section 0 when the saved material does not contain the currently visible paragraph. It creates a one-paragraph Teacher-Reading run for the paragraph actually visible on the textbook.
- Preserved the textbook cursor as the authoritative start position: Play from page 7 stays on page 7 even when the saved study material begins on another page.
- Added clearer separation between the page-navigation fix and Gemini planning failures: a 3B1B/Gemini HTTP failure no longer causes the page-position logic to select page 1.


## V51.8.16 — General Class Start/Page Stability

- Fixed General Class Play always starting Teacher-Reading from material section 0; it now starts from the paragraph currently visible/selected, preventing page 7 → page 1 jumps.
- Prevented the selected-material synchronization effect from overwriting the user's current paragraph while a 3B1B Teacher-Reading run is active.
- Passed the inferred textbook grade (including Standard IX/X/XI/XII Roman numerals) to the 3B1B planner instead of silently defaulting to Grade 12.
- 3B1B planning now tries all usable saved Gemini keys before failing.
- The teaching API now returns actionable 400/502/504 errors and logs the actual planner failure server-side instead of masking it as a generic 500.
- Teacher-Reading startup errors now surface the server's exact error in the classroom pipeline log.


## V51.8.15 — Integrated Textbook Teacher-Reading + 3B1B Video-DNA

- Integrated V51.8.14 Teacher-Reading contracts, textbook cursor and classroom controller into the V51.8.13 General Class.
- General Class play now uses Teacher-Reading + Chapter → Lesson → Beat Video-DNA as the primary path; Problems & Formulae remains isolated.
- Added structured textbook page/cue manifests so the planner must cover every readable cue in order.
- Added QA coverage for missing/invalid textbook cues, bilingual read/explain fields and verbatim textbook reading.
- Added bilingual speech sequencing: English reading → Malayalam translation → English explanation → Malayalam explanation → optional check.
- Malayalam TTS explicitly protects English variable names (ex, why, zee, ay, bee) and English mathematical terminology.
- General Class advances section-by-section without a STOPPED state between sections; STOPPED remains user/navigation cancellation only.
- Prevented page override from carrying into automatic Teacher-Reading progression.
- Added one-section Teacher-Reading mode for direct paragraph Play as well as multi-section material playback.
- Added precise textbook cue IDs and retained paragraph-level visual spotlighting; the whiteboard remains concise visual mathematics, not extracted prose.


## V51.8.13 — General Class 3B1B Video-DNA First

- General Class now starts directly from the current textbook paragraph and uses Chapter → Lesson → Beat Video-DNA as its primary visual teaching mechanism.
- Interactive Mathlet/template referrals are isolated from General Class.
- Added human-teacher topic introduction, ordinary-life purpose, variable definitions, solving plan and mistake-avoidance requirements.
- Removed long narrative text nodes from the mathematical SVG scene; detailed explanation remains in narration/captions.
- Added 20s Gemini planner timeout, 23s browser lesson timeout and one QA repair pass.
- Changed 3B1B TTS to lazy first-beat synthesis with next-beat prefetch and 8s provider timeouts.
- General Class now ends as COMPLETED instead of STOPPED; navigation/close remains an explicit stop.
- General Class stays on the current textbook page while the lesson is being taught.
- Malayalam narration preserves English mathematical terminology and English variable-name pronunciation.

## V51.8.8 — Deterministic Classroom Start + Equation Recovery
- Skip `/api/ai-guru/math/plan` when a verified deterministic solution can be built locally.
- Recover explicit textbook equations when generated `mathSteps` are missing.
- Render recovered equations as real vertical teaching rows instead of captions-only playback.
- Suppress empty generic rectangle placeholders in legacy visual fallback.
- Keep Gemini visual planning as optional enrichment for non-deterministic lessons.
# V51.8.6 — Teaching Board Flow Layout

- General-teaching planner text/LaTeX nodes now render as vertical FLOW rows instead of absolute canvas labels.
- Spatial shapes, lines, arrows, highlights and graphs remain on the visual figure.
- This prevents bilingual Malayalam/English text and equations from overlapping because of model-estimated canvas coordinates.
- Preserves the existing classroom, math verification, TTS, Video-DNA and Problems & Formulae paths.


## V51.8.4 — Classroom Playback Resilience

- Prevented a transient `/api/ai-guru/math/plan` HTTP/provider/visual-QA failure from aborting an otherwise teachable classroom section.
- General Classroom now falls back to its existing authored/verified `mathSteps` and visual actions when the optional visual planner is unavailable.
- Problems & Formulae remains isolated from this fallback path.
- Improved client API diagnostics to include HTTP status and server error details in the Teaching Pipeline Log.
- Removed the stale demo `/demo/page-27.png` fixture reference that caused 500 resource errors after the production-slim asset cleanup.
## V51.8.2 — Production Slim / Feature-Preserving Cleanup
- Removed optional Video-DNA reference MP4/WebM binaries from the production package; retained all style/registry metadata under `data/ai-guru/reference-styles/`.
- Moved the demo textbook PDF to `data/demo/` and updated `book:prepare:current`; removed the byte-identical duplicate PDF.
- Consolidated the duplicate math fallback corpus to `general-classroom-curated.json` and updated its two runtime/build references.
- Removed confirmed development artifacts and the excluded legacy application.
- Moved versioned AI Guru sprint notes into `docs/sprints/`.
- Preserved the 3B1B planner, math verification, Video-DNA selection, browser animation, Multi-TTS, cue synchronization, LTX/HyperFrames adapters, classroom, teacher, parent, material, and server-agent functionality.


## V51.7.8 — 3B1B Audit Defect Cure
- Added authoritative 3B1B math verification + QA/repair loop.
- Implemented real move animation events and transform retention.
- Materialized opening/why/prerequisite/running-example/intuition/mathematics/final-insight narration into the compiled scene.
- Added grade-based difficulty enforcement, beat-mix QA, camera/pacing execution, geometry/safe-frame QA and temporal object-ID validation.
- Wired chapter/textbook context from RAG Classroom into the 3B1B planner.

## V51.1 — Whiteboard text-wall cure
- Hard-separated narration/captions from whiteboard rows.
- Removed section-content prose fallback write action.
- Suppressed legacy prose write/latex actions while preserving math and short positioned diagram labels.
- Step bars no longer use full narration as board labels.
## V50
- Visual Pattern RAG + Visual Developer agent (lib/ai-guru/patterns), dry-run of every generated visual, timing contract, figure container for diagrams, absolute diagram labels, /api/ai-guru/patterns, pattern gallery. Includes V46-V48.

## V49 — Universal Math Branch Expansion

- Added explicit TypeScript domain registry for 25 school-mathematics branches plus `general`.
- Added deterministic routing and visual constructions for number systems, inequalities, sets and combinatorics.
- Added explicit Math branch selector and V49 coverage panel to Universal Math Studio.
- Added `/api/ai-guru/math/domains` coverage endpoint.
- Kept Math.js/Mathsteps verification, existing visual QA, reference-style system and native whiteboard renderer unchanged as canonical boundaries.
- No Python runtime was introduced.


## 2026-09-20 · Question papers taught in order + worked-solution template board

- **Question papers are indexed one question per unit** (`material-studio/question-paper.ts`). The 20-question paper used to be cut into 9 arbitrary chunks (several questions per "paragraph", Q19 split in half). It is now 22 units: instructions, Q1 ... Q20 exactly as printed, closing note. Existing uploads must be **re-uploaded** to be re-indexed.
- **Fixed "answers up to Q4 then repeats from the top"** (`lesson/paragraph-flow.ts`): when one paragraph was taught on its own, the classroom recorded the wrong paragraph number (global index read as page-local), so "continue to the next paragraph" resolved to the same paragraph and replayed it. Paragraphs now map by id, and the next paragraph is always strictly after everything already taught in the run. Sections are also re-ordered by their cited source (`section-order.ts`) whatever order the model emitted them.
- **Board follows the worked-solution template** (studied frame by frame from the supplied reference video; grammar only, nothing copied): every transformation on its own line in its own colour, an arc over the part just operated on / a circle around the isolated term, a coloured label to the right ("Subtract 5 from both sides"), the answer boxed, then a **Check** (substitute back, both sides agree) and "The solution is ...". Renderer: `components/ai-guru/template-row-dom.ts`; rows: `math/template-types.ts`, `math/template-focus.ts`.
- **Deterministic solver** (`math/template-solver.ts`, exact fractions, no AI): linear equations (brackets, unknown on both sides, fractions/decimals), quadratic by the formula (a,b,c -> formula -> substitute -> discriminant -> both roots -> check both), pair of linear equations by elimination, (a+b)^2 and (a+b)(a-b) identities, expand/simplify, surds, integer arithmetic. Every answer is substituted back before it is used; anything it is not certain about returns null and the lesson's own steps are drawn in the same template look. On the 20-question paper it covers Q1, 3, 4, 5, 15, 16, 17, 20; the rest (word problems, calculus, geometry) use the model's steps.
- Bilingual: each solver row has an English and a Malayalam caption (fixed vocabulary; please have a Malayalam-speaking teacher review the wording).
- Prompt rule 9b: one section per numbered question, in order, complete worked solution ending with a check.
- Tests +35 this round (question-paper indexing on the real paper text, repeat-bug reproduction, section order, solver on every algebra question, template rows). The 8 older failing tests in `lib/ai-guru` are unchanged.


## 2026-09-20 · Classroom layout: half textbook, half single whiteboard

- **Workspace is now two equal halves**: textbook page (left) and ONE whiteboard (right), side by side from tablet width up (`md:grid-cols-2`); on phones they stack. The old 3-column strip (Solution lines / Transformation steps / Explanation & voice) and the separate "Problem from textbook" card are removed - the textbook is already on the left and the problem is pinned on the board.
- The previous layout class was assembled at runtime (`xl:grid-cols-[...${...}]`), which Tailwind cannot generate, and only applied from 1280px anyway - which is why the textbook sat full-width above the board on narrower windows.
- **The template decides how the board is drawn** (`lib/ai-guru/teaching/board-mode.ts`): symbolic/numeric templates use the ordered derivation column; geometry/graph/statistics templates play the lesson's authored visuals in full. The board header shows the mode and the selected template.
- One-line caption bar under the board (English or Malayalam per the teaching language) replaces the caption column.
- The lesson index is a slide-over drawer opened from the whiteboard header ("Index"), so the two halves stay exactly 50/50.


## 2026-09-20 · Ordered derivation board, template selection, page-image 500

- **Board = ordered derivation column** (`lib/ai-guru/math/derivation-beat.ts`, follows the approved `visual-derivation-explanation-v1` grammar): problem pinned, starting equation written first, then per step: highlight the working line, one operation tag (`↓ subtract 10 from both sides`), new line pulses pink then settles cyan, final line green. Earlier lines stay, dimmed, so the whole solution reads top-to-bottom. Captions and Malayalam prose are no longer painted on the board (the previous integration did this by mistake; the board is maths-only per AI-GURU-V45-MATH-TEACHING-SEPARATED-CAPTIONS.md).
- **Narrative "steps" stay off the board** (e.g. a preface step "Dynamic GeoGebra Model"): only steps that contain real mathematics are drawn or listed as solution lines.
- **Side panels grouped per paragraph** (`§2 · heading`, Start line, Step 1, 2, 3 … restarting for each paragraph) instead of one global Step 1…8 across unrelated paragraphs.
- **Material prompt rule 8** (`pipeline.ts`): mathSteps only for real problems; strict solving order; one variable naming; never solve the same problem twice in a section (separate "Method 1/2" sections instead). Applies to newly generated materials - regenerate old ones.
- **Template selection**: worded problems containing a real equation are now classed `linear_equations` (were `general`, so no template); the section's solution steps take part in selection; a multi-step equation chain (3+ equation lines) counts as a concept match. A single bare equation still does NOT trigger a referral (existing rule kept).
- **page-image 500 fixed and reproduced under `next dev`**: pdfjs was being bundled by Turbopack (worker not found) - `serverExternalPackages: ['pdfjs-dist','@napi-rs/canvas']` in `next.config.ts`; pdfjs's own optional `canvas` (node-canvas) is usually not built, so the route now polyfills DOMMatrix/Path2D/ImageData and supplies a CanvasFactory from `@napi-rs/canvas` (one canvas library end to end; mixing two segfaults the server); `standardFontDataUrl` so non-embedded Times body text renders; any failure returns a visible SVG placeholder (HTTP 200, reason in `x-page-image-error`) instead of a 500.
- Types: `VisualAction` `write` gains optional `role` (incl. `op`); `highlight` gains optional `durationMs`.
- Tests: +9 (derivation beat, grouping, template selection). 8 older tests in `lib/ai-guru` were already failing before this change and are unchanged.

## 2026-09-16 · Material Studio reliability + creation tabs

- Fixed Gemini structured-output parsing so separate JSON objects or trailing model commentary no longer get concatenated with `lastIndexOf('}')`, eliminating the `Unexpected non-whitespace character after JSON` failure seen during material creation.
- Moved Gemini BYOK and Replace/Choose PDF controls into a dedicated, always-visible action bar directly below the horizontal workspace navigation.
- Reworked material creation controls into horizontal creation tabs with persistent visual states: green for created, violet for selected/running, red for failed, and dark for remaining.
- Restored persisted created-material states when Material Studio loads an indexed textbook and added a created/total counter.
## V45 — Reference video library expansion
- Added three user-supplied reference videos to `public/reference-styles/`.
- Added style profiles, generation prompts, reference metadata and dedicated QA profiles.
- Added automatic style selection cues for first-principles calculus, slope-to-derivative, and quadratic-formula lessons.
- Added regression tests for the three reference styles.

# Changelog

## Sprint 8.5.2 — Trigonometry + Riemann Reference Styles
- Added approved trigonometry unit-circle/identity reference video to `public/reference-styles/`.
- Added approved calculus Riemann-sum/area-under-curve reference video to `public/reference-styles/`.
- Registered both styles in the canonical Visual Reference Style Library.
- Updated the Visual Style Selector to prefer the unit-circle reference for trig identities/unit-circle concepts and the Riemann reference for definite-integral/Riemann-sum/rectangle-area concepts.
- Added selector regression tests for both routes.
- Extended the style audit to verify reference assets, library registration and selector integration.
- Fixed an existing extra closing brace in `lib/ai-guru/math/planner/gemini.ts` that caused `TS1128` during global TypeScript checking.

## Sprint 8.5.3 QA
- Added five-case reference-style QA matrix.
- Added dedicated geometry-area, unit-circle, and Riemann visual compiler primitives.
- Added semantic planning checks for decomposition, trig identity connection, and sum-to-integral progression.
- Fixed reference manifest so all five approved reference videos are registered.

## Sprint 8.5.4 — Reference-quality animation repair
- Added style-specific pacing and action-duration propagation.
- Added deliberate visual pause gaps.
- Made AI plan domain detection authoritative for automatic style selection.
- Added style-aware renderer palettes and improved geometry/Riemann visual grammar.
- Added bilingual universal narration cues.
- Added reference quality audit.


## Sprint 8.5.5 — Single-Language Two-Pass Teaching
- English is the first visual/narration pass.
- Malayalam is the following translation-class pass.
- Universal Math scenes now declare `teachingLanguage`.
- Narration cues carry exactly one active language and no bilingual payload.
- Gemini visual planner is instructed to emit natural-language labels/captions only in the active language.
- Deterministic fallback localizes common teaching labels for Malayalam.
- Universal Math Studio adds an explicit English-first / Malayalam-translation pass selector.
- Added regression coverage for one-language-at-a-time rendering.
- Added language two-pass documentation.

## Sprint 8.5.6 — Common Teaching Grammar + Reference-Specific QA
- Added `area-formula-visual-derivation-reference` from the newly uploaded 112-second area-formula teaching video.
- Added shared `visual-derivation-explanation-v1` teaching grammar: one idea per beat, visual reasoning before symbolic compression, continuity, concise annotations, insight pauses, and formula-after-reasoning.
- Added versioned reference-specific QA profiles and paragraph-scoped enforcement.
- Visual Step Agent now stamps `qaProfileId` and `commonTeachingStyleId` onto canonical visual steps.
- Gemini Visual Planner receives the common teaching grammar and selected QA profile.
- Recovery remains scoped to the failed paragraph/problem/visual step and must re-pass the same reference QA profile.
- Existing AI Guru graphics/math engine remains the renderer; reference videos provide style grammar only.

## V49 — Mathematical Token Motion

- Added executable `token-move` VisualAction for digit/operator/term-level animation.
- Token motion supports independent X/Y movement, configurable duration, font size, and fade-out.
- MathLikeAnimBoard fallback renderer now animates the actual token rather than a placeholder marker.
- Universal math scene/compiler carries token-move actions through to the renderer.
- Gemini visual planner is instructed to emit token-move actions for physical digit/sign/term transformations instead of describing movement only in narration.
- Material Studio visual normalization accepts token-move actions.

## V51.2 — 2026-09-21
- Fixed stale previous Material Studio material leaking into a newly uploaded classroom PDF.
- Wired selected referral videos through the actual Gemini video-grounded `/api/ai-guru/math/plan` pipeline and classroom renderer; temporal grounding evidence is required before using the grounded plan.
- Fixed physical PDF page jump so requested pages display even when no extracted paragraph begins on that page.

## V51.4 — K-12 reference library / quota protection
- Separated 20 physical problem-solving reference assets by curriculum branch.
- Added local problem-solving Visual DNA cache and made repeated Gemini video upload opt-in.
- Replaced oversized MathVizAI fallback corpus with 69 unique K-12 visual-pattern entries.
- Removed old FAISS stores containing 1,911 broad chunks so they cannot be selected at runtime.
- Added organised per-branch general-classroom RAG files and a master catalogue.

## V51.6 — Classroom / Problems & Formulae separation
- Removed the 20 physical problem-solving references from normal classroom strategy selection.
- Normal classroom now uses only general-teaching K-12 Visual DNA/templates, while retaining verified problem solving as part of teaching.
- Added Material Studio type **Problems and Formulae**.
- Problems and Formulae retrieves only the most relevant patterns from the 20-reference problem-solving DNA library during material creation; no MP4 is watched/uploaded.
- Problems and Formulae playback bypasses classroom template selection so the two visual styles cannot be mixed at runtime.

## V51.8.1 — Sprint I Integrated Video Pipeline
- Merged Sprint I renderer-neutral video subsystem into the V51.7.8 application.
- Unified Sprint I Multi-TTS manager with the existing AI Guru Edge, Google Cloud, Sarvam and Piper providers; no duplicate provider stack is required.
- Added word-level scene cue generation and speech-to-scene synchronization.
- Wired 3B1B TeachingLesson → Video-DNA → renderer-neutral GuruLesson → Multi-TTS → production QA.
- Added `POST /api/ai-guru/video/lesson` integration endpoint.
- Preserved existing math verification as the mathematical authority.

## V51.8.5 — Teaching Board Overlap Fix
- fixed overlapping General Classroom planner labels on the responsive teaching board
- normalized text/LaTeX node geometry for Malayalam/English readability
- added browser-side text collision avoidance
- prevented hidden WASM SVG from creating a duplicate visual layer under the DOM renderer

## V51.8.9 — Template Grammar / Equation-Flow Fix
- General Class detects textbook equation chains before invoking the generic visual planner.
- Equation chains render through the deterministic template-row grammar.
- Removed broad `algebra` referral trigger from Fundamental Algebra template selection.
- Generic algebra visual plans without symbolic/derivation content are rejected.

## V51.8.10 — Concept-First Classroom + Completion State
- Added deterministic concept bridge before algebra derivation: variable meaning, quantity relationships, and equation formation are explained before symbolic operations.
- Added `COMPLETED` classroom state so normal end-of-lesson is no longer displayed as `STOPPED`.
- Starting another material now cancels the previous run without emitting a false user STOP state.
- Preserved explicit STOPPED state for user/navigation cancellation.

## V51.8.10 — Concept-First Classroom + Completion State
- Added deterministic concept bridge before algebra derivation: variable meaning, quantity relationships, and equation formation are explained before symbolic operations.
- Added `COMPLETED` classroom state so normal end-of-lesson is no longer displayed as `STOPPED`.
- Starting another material now cancels the previous run without emitting a false user STOP state.
- Preserved explicit STOPPED state for user/navigation cancellation.
