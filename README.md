# AI Guru V49 — Native RAG Classroom

AI Guru is the student-facing mathematics teaching runtime in this distribution.


## V49 — Universal mathematics branch expansion

V49 makes the Universal Math layer explicitly branch-aware rather than relying on a single generic fallback. The domain registry now covers:

- Arithmetic
- Number Systems
- Fractions
- Decimals & Percentages
- Ratio & Proportion
- Algebra
- Linear Equations
- Inequalities
- Polynomials
- Sequences & Series
- Coordinate Geometry
- Functions
- Trigonometry
- Geometry
- Mensuration
- Calculus
- Statistics
- Probability
- Matrices
- Vectors
- Complex Numbers
- Financial Mathematics
- 3D Geometry
- Sets & Logic
- Combinatorics

Each branch has its own TypeScript domain profile with keywords, visual objects, default visual mode and teaching grammar. The deterministic compiler and visual-language layer route those branches into construction/transformation/hybrid visual plans while retaining the existing Math.js/Mathsteps verification boundary.

The classroom also exposes an explicit **Math branch** selector with auto-detection, and `GET /api/ai-guru/math/domains` returns the V49 coverage registry.

## Sprint 8.2 architecture

```text
RAG / Textbook
  -> Lesson JSON
  -> Paragraph State Machine
  -> Math Agent
  -> Math Verification (mathjs + Mathsteps)
  -> Universal Math Visual Compiler
  -> Visual Step Agent
  -> Paragraph-scoped Visual Step QA
  -> Targeted Visual Recovery
  -> Native MathLikeAnim Whiteboard
  -> Malayalam/English Voice + Word/Cue Sync
  -> Learning / Assessment / Teacher / Parent / Analytics agents
```

## Runtime boundary

The active Next.js application contains only AI Guru routes. Legacy OpenMAIC/PBL/editor/workbench routes are outside `app/` under `legacy-app/` and are not part of the build.

The OpenMAIC workspace packages are not dependencies of AI Guru and are not required to run the classroom.

## Run

```powershell
pnpm install
pnpm run dev
```

Open `http://localhost:3000`. The root route redirects to `/ai-guru`.

## Malayalam classroom

Malayalam teaching text uses **Chilanka**, the handwriting-style Malayalam font from Swathanthra Malayalam Computing, with Noto Sans Malayalam/Nirmala UI fallbacks. The classroom loads the Google Fonts webfont at runtime and remains readable with the fallback stack when offline.

Malayalam voice uses the configured Sarvam TTS provider, then Piper, then device speech as the final fallback.

## Visual QA rule

A visual QA failure is scoped to the smallest target: visual step → problem → paragraph. Recovery must not rewrite unrelated paragraphs.

The classroom's rendered-board QA additionally checks that drawable SVG objects actually reach the whiteboard; generated JSON alone is not considered a visual pass.

## Sprint 8.3 Visual Engine Rule

The AI Guru Universal Visual Compiler, Visual Action Engine, and native whiteboard remain the canonical graphics system.
The Two-Pass Visual Construction contribution is limited to semantic graph planning and deterministic construction validation. It does not replace or duplicate the renderer.


### Visual reference library (Sprint 8.5.2)
The Visual Style Selector can route trigonometric unit-circle/identity lessons and Riemann-sum/definite-integral concept lessons to approved reference styles while preserving the existing graphics engine and paragraph-level Visual Step QA.

### Sprint 8.5.3 — Geometry Area Derivation Reference
- Added approved `geometry-area-derivation` visual reference and asset.
- Added automatic selector rules and regression test for area derivation.
- Kept rendering on the existing AI Guru graphics/math pipeline; the video is a style reference only.
