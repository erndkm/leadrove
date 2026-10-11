# Leadrove prospect workflow

Mode: Operate. Established visual world, extended with task navigation.

User brief: implement all recommended competitor-informed features; make them visually appealing, hierarchical, intuitive and less text-heavy.

Audience and job: a solo website designer moves from a local business to a verified opportunity, a client proposal and a recorded project outcome.

Direction: preserve the existing Manrope workbench, current Leadrove mark, forest actions on light surfaces, neutral charcoal dark theme and thin dividers. Use five named destinations: Today, Discover, Pipeline, Proposals, Settings. Watchlists sit within Discover. Each business has Overview, Evidence, Proposal and Activity. Put an actionable summary first; expand technical detail and editing fields only when needed. Flat business rows are the main organizing unit; priority remains distinct from website quality and project value.

Palette inherited from existing tokens: forest #204c46, ink #27332e, muted #65716a, canvas #f4f6f4, surface #ffffff, line #e2e7e2. Inherit dark equivalents rather than adding a new palette. Use Manrope for headings, body and controls; tabular numerals for values and counts. New page titles 25–29px; section headings 17–18px; row labels 13–14px; supporting metadata 11–12px. Primary/secondary controls retain existing shapes and sizing.

Layout: keep geographic discovery as map plus list. Pipeline uses comparable rows and a separate Results view. Proposals uses a business list with one clear action per row. Settings groups offer/pricing, subscription connection and optional data integrations. The detail inspector has a fixed header, section navigation, scrolling body and save footer. On phones the header navigation becomes a labelled icon row and dense rows become paired fields.

Implemented responsive and keyboard behavior: at 520px and below, Results presents each industry or opportunity as a named group with labelled Leads, Contacted, Replied and Won values. At 360px and below, each Pipeline business identity and stage control occupies its own full-width row; next step and project value remain paired beneath them. Screenshot callouts can be added by keyboard at the image center, then positioned with labelled horizontal and vertical range inputs that expose percentage values. Pointer placement and keyboard editing update the same saved annotation.

Quality bar: every feature has an obvious destination; no browser-default button chrome; no invented verification, revenue or buying intent; desktop and phone navigation stays readable; empty, working, failed and disconnected states are actionable. Report output includes only escaped content, retained evidence screenshots and editable findings. Source language is preserved until the user edits it; document labels support English and German.

Verification scope: desktop 1440×1000; phone 390×844; additional narrow 320px and dark checks. Synthetic records are isolated in `.impeccable/review/workflow-test-data/` and never enter the user's workspace. Production assets live in src and server; review captures are not shipped.

Code-led extension: no approved image comp. Incumbent screenshot `.impeccable/review/before-workflow.png` is the reference for continuity. Parent PRODUCT.md and DESIGN.md retain pre-existing naming drift and are not renamed as a side effect.

Documentation handoff: checked `src/App.jsx`, `src/LeadDetails.jsx`, `src/LeadWorkspace.jsx`, `src/WorkflowPages.jsx`, `src/workflow.css`, inherited `src/styles.css` and `src/appearance.css`, and the feature destinations and integration limits in `README.md`. Compared the incumbent `../PRODUCT.md`, `../DESIGN.md` and `../.impeccable/design.json` with the before screenshot and `workflow-pipeline-desktop.png`, `workflow-pipeline-dark-desktop.png`, `workflow-pipeline-narrow-mobile.png`, `workflow-results-mobile.png` and `workflow-callouts-mobile.png` under `.impeccable/review/`. These show continuity in typography, semantic theme colors, thin dividers and flat business rows, with the three review fixes represented in source and captures. Existing ClientFinder naming, earlier navigation descriptions and stale literal color values in parent documentation remain documented drift; this ordinary surface extension does not replace or regenerate the global system.
