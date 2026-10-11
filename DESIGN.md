---
name: ClientFinder
description: A calm geographic workbench for local business research.
colors:
  ink: "#253832"
  muted: "#6b746f"
  accent: "#204c46"
  accent-hover: "#153e38"
  accent-soft: "#edf3ed"
  line: "#e2e7e2"
  surface: "#ffffff"
  canvas: "#f4f6f4"
  quiet-ink: "#5f6e5d"
  map-label: "#5a6c55"
  priority-high: "#476a4e"
  priority-medium: "#805b26"
  priority-low: "#607267"
  score-high-surface: "#e8f0e0"
  score-high-ink: "#4e6d37"
  score-medium-surface: "#f7efde"
  warning: "#946720"
  row-selected: "#eef4eb"
  focus: "#689b81"
  scan: "#176c81"
  scan-fill: "#368da0"
  raised: "#ffffff"
  quiet-surface: "#f6f8f5"
  dark-ink: "#efefef"
  dark-muted: "#b5b5b5"
  dark-accent: "#e0e0e0"
  dark-accent-hover: "#ffffff"
  dark-accent-soft: "#333333"
  dark-line: "#3b3b3b"
  dark-surface: "#222222"
  dark-canvas: "#1a1a1a"
  dark-raised: "#2b2b2b"
  dark-quiet-surface: "#252525"
  dark-warning: "#e2bf7e"
  dark-scan: "#8ac9da"
  dark-scan-fill: "#6cb7c9"
  dark-action-ink: "#1a1a1a"
  dark-hover-surface: "#353535"
  dark-selected-ink: "#e2e2e2"
  dark-focus: "#c8d9e6"
  dark-score-high-surface: "#324632"
  dark-score-high-ink: "#c1ddab"
  dark-score-medium-surface: "#463b27"
  dark-score-medium-ink: "#ead09e"
  dark-score-low-surface: "#363636"
  dark-score-low-ink: "#d2d2d2"
typography:
  display:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "25px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-0.8px"
  headline:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.6px"
  title:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 750
    letterSpacing: "-0.3px"
  row-title:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 750
    lineHeight: "20px"
    letterSpacing: "-0.1px"
  body:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.8
  label:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
  score:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: "22px"
    fontFeature: "tnum"
rounded:
  tag: "4px"
  compact: "5px"
  field: "6px"
  button: "7px"
  surface: "8px"
  inspector: "10px"
  workspace: "12px"
  dialog: "14px"
  sheet: "18px"
  circle: "50%"
spacing:
  micro: "4px"
  tight: "6px"
  small: "8px"
  compact: "10px"
  control: "12px"
  regular: "16px"
  panel: "20px"
  roomy: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-action-ink}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  button-secondary-dark:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  search-input:
    textColor: "{colors.ink}"
    height: "36px"
    padding: "0 2px"
  notes-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px"
  score-high:
    backgroundColor: "{colors.score-high-surface}"
    textColor: "{colors.score-high-ink}"
    typography: "{typography.score}"
    rounded: "{rounded.compact}"
    padding: "0 5px"
  score-medium:
    backgroundColor: "{colors.score-medium-surface}"
    textColor: "{colors.warning}"
    typography: "{typography.score}"
    rounded: "{rounded.compact}"
    padding: "0 5px"
  score-high-dark:
    backgroundColor: "{colors.dark-score-high-surface}"
    textColor: "{colors.dark-score-high-ink}"
    typography: "{typography.score}"
    rounded: "{rounded.compact}"
    padding: "0 5px"
  score-medium-dark:
    backgroundColor: "{colors.dark-score-medium-surface}"
    textColor: "{colors.dark-score-medium-ink}"
    typography: "{typography.score}"
    rounded: "{rounded.compact}"
    padding: "0 5px"
  score-low-dark:
    backgroundColor: "{colors.dark-score-low-surface}"
    textColor: "{colors.dark-score-low-ink}"
    typography: "{typography.score}"
    rounded: "{rounded.compact}"
    padding: "0 5px"
  business-row-selected:
    backgroundColor: "{colors.row-selected}"
    textColor: "{colors.ink}"
  business-row-selected-dark:
    backgroundColor: "{colors.dark-accent-soft}"
    textColor: "{colors.dark-ink}"
  map-location:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "11px 13px"
  map-location-dark:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.surface}"
    padding: "11px 13px"
  theme-toggle:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    width: "34px"
    height: "34px"
  theme-toggle-dark:
    backgroundColor: "{colors.dark-accent-soft}"
    textColor: "{colors.dark-accent}"
    width: "34px"
    height: "34px"
  map-pin-high:
    backgroundColor: "{colors.priority-high}"
    textColor: "{colors.surface}"
    rounded: "{rounded.circle}"
    size: "32px"
---

# Design System: ClientFinder

## Overview

**Creative North Star: "The Municipal Research Workbench"**

ClientFinder borrows the orderly character of municipal mapping software and reduces it to one person's daily research workspace. Light mode places white work surfaces on a cool gray canvas; dark mode uses neutral charcoal surfaces, pale ink and near-white actions. Green and ochre retain their research-priority roles, while a separate teal or cyan boundary identifies the search area.

The built identity is compact and deliberate: Manrope carries both labels and headings, thin dividers separate evidence, and tabular numerals connect ranked rows to circular map pins. Flat work areas make room for lifted controls and the focused business inspector. The source is the final cascade in `web/src/styles.css` and `web/src/appearance.css`, with behavior in `web/src/App.jsx` and `web/src/BusinessMap.jsx` and initial theme selection in `web/index.html`.

**Key Characteristics:**

- Compact, readable rows with explicit names, categories and evidence.
- Forest actions in light mode and neutral light-gray actions on charcoal in dark mode.
- A teal or cyan search-area boundary distinct from research priority.
- Corresponding rank numbers in the list and on the map.
- Soft corners and thin rules, with depth reserved for overlays.
- Explicit mobile views and a focused detail sheet.

## Colors

The palette combines paper or neutral charcoal surfaces, theme-specific actions and a small ochre priority family. Dark mode reserves color for geography and semantic priority signals. Frontmatter values describe the shipped colors; unprefixed tokens describe light mode and `dark-` tokens describe dark mode. In the application, core semantic CSS properties retain their names and change under the root dark-theme attribute. The sidecar's tonal ramps are preview aids, not additional application tokens.

### Primary

- **Forest action:** `accent` and `accent-hover` identify the primary button and active navigation; `accent-soft` supports quiet hover states.
- **Selected meadow:** `row-selected` marks the current business without removing its row divider or rank.
- **Night neutral action:** `dark-accent` and `dark-accent-hover` provide primary action and active navigation on dark surfaces. Filled primary controls use `dark-action-ink`; selected rows and filters use `dark-accent-soft`, with `dark-selected-ink` on selected filter and save states. Hover surfaces use `dark-hover-surface`.

### Secondary

- **Research priority:** `priority-high`, `priority-medium` and `priority-low` color pins and their matching legend. Score badges use softer surfaces with their own darker foregrounds. High means 70–100, medium 45–69 and low 0–44.
- **Ochre warning:** `warning` supports intermediate scores. It does not imply a verified business problem.
- **Search boundary:** `scan` and `scan-fill` provide the teal outline and faint fill in light mode; `dark-scan` and `dark-scan-fill` provide cyan in dark mode. This pair describes geography, not business priority.
- **Night evidence:** `dark-warning` carries pending-search and caution text. The `dark-score-high-*`, `dark-score-medium-*` and `dark-score-low-*` pairs preserve the existing score thresholds with contrasting foregrounds and surfaces.

### Neutral

- **Forest ink:** `ink` carries business identity and main headings; `quiet-ink` carries addresses, evidence descriptions and provenance.
- **Muted ink:** `muted` supports explanatory prose. `map-label` keeps small map captions distinct from the cartography.
- **White surface and cool canvas:** `surface` and `canvas` establish work areas; `line` separates controls and rows.
- **Surface layers:** `raised` and `quiet-surface` support floating controls and quiet groupings. In dark mode, `dark-canvas`, `dark-surface`, `dark-raised` and `dark-quiet-surface` establish neutral charcoal layers, with `dark-line` dividers, `dark-ink` primary text and `dark-muted` supporting text.
- **Keyboard focus:** `focus` in light mode and `dark-focus` in dark mode keep keyboard boundaries visible.

**The Evidence Color Rule.** Pair priority color with a number and a written explanation; color alone never states the business's opportunity.

## Typography

**Display and body font:** Manrope, with Segoe UI and sans-serif fallbacks. Manrope is the implemented identity; Segoe UI remains a fallback, despite its provisional role in the surface brief.

The hierarchy is compressed for research. The workspace heading uses the display token; inspector names use headline; results headings use title. Business names use row-title. Supporting prose uses body, while controls and evidence generally use 10–12px. Rank, score and cluster counts use tabular figures.

On mobile, the workspace heading becomes 22px and inspector names grow to 26px. The results heading grows to 17px on wide screens. Final desktop rules keep business names at 13px; the earlier 14px wide-screen declaration is superseded. Compact tablet rows use 12px names.

**The Identity First Rule.** Present the business name before its category and address; keep the score separate from the name so it can be compared vertically.

## Layout

The desktop header is 72px tall. Main content has 32px horizontal padding and a 1920px maximum width. The search surface groups location, radius, category and the primary action in a four-column row. A feedback row underneath shows the draft area's diameter and approximate square kilometers alongside Preview area; a separate lower band holds filters.

The results workspace places a 370px list beside the flexible map. List width becomes 410px above 1550px, 335px at 1150px and 310px at 900px. Both regions share one outer border and rounded frame. The list scrolls internally. Standard rows have a 132px minimum height, with room for signals and the save control.

At 900px and below, search uses two columns. At 680px and below, location and the search action each span the full width; list and map become mutually exclusive views. Their switch occupies normal document flow above results. It must not obscure rows or map controls. Mobile main padding is 15px horizontally and 24px at the bottom.

Results use a viewport-relative height with a minimum height: 460px on desktop, 440px on tablet, 360px on mobile. The final offsets are 390px on desktop, 402px above 1550px, 425px on tablet and 518px on mobile. These are the current workspace composition, not universal page templates.

The desktop inspector floats inside the map at 340px wide, becoming 365px on large screens. Mobile selection opens a full-width sheet 65px below the top edge, with a fixed action footer and independently scrolling content. Map fitting waits until its container has measurable dimensions when the mobile map was hidden.

The theme toggle remains in the mobile header; the separate help icon is hidden there. The area feedback becomes 10px on mobile, removes decorative icons and retains the Preview area label. The map caption hides the location-name suffix at 1150px and below to preserve the area measurements and preview status.

## Elevation & Depth

The system combines flat, bordered work surfaces with modest ambient shadows for overlays. Rows, filters and the search frame do not need shadow to establish hierarchy. Location suggestions, map controls, the inspector, dialog and toast are lifted so they remain legible over changing content.

- **Floating surface:** `0 8px 28px #203f3814` for suggestions, tooltips and map loading feedback.
- **Night floating surface:** `0 8px 28px #0000004d` replaces the shared floating-surface shadow in dark mode. Dark surfaces also use tonal separation; existing map-caption, control, inspector and dialog shadows remain in place.
- **Map control:** `0 2px 9px #233d3320` for zoom and fit controls.
- **Map caption:** `0 3px 14px #2e483215` for location and legend surfaces.
- **Inspector:** `0 8px 36px #253e3829` for the active business panel.
- **Dialog:** `0 20px 90px #102a3440`, with a translucent forest backdrop in light mode and a neutral black backdrop in dark mode.

**The Work Surface Rule.** Keep working rows flat; use elevation when a control or detail surface sits over other content.

## Shapes

Compact tags use the tag and compact radii; ordinary fields and buttons use field and button. Search/results frames use workspace on desktop and inspector on mobile. The inspector uses inspector on desktop and sheet on its mobile top corners. The help dialog uses dialog.

Pins are circles, not teardrops. A white or light-gray border separates them from the map; the selected pin enlarges from 32px to 38px and receives a translucent white outline in light mode or a neutral light-gray outline in dark mode. Clusters use a 44px circle with a broad border; dark-mode cluster surfaces, borders and text are neutral grays. Thin dividers remain the dominant organizing geometry.

## Components

### Buttons

Primary and secondary buttons are compact, solid controls with a 40px minimum height, 12px bold labels and a 9px icon gap. Primary hover deepens forest green in light mode and lightens gray to white in dark mode. Secondary uses a white surface in light mode or the raised charcoal surface in dark mode, with an inset divider-colored stroke and a tinted hover surface. Disabled buttons dim to 55% opacity. Icon buttons use a quiet green foreground in light mode or a neutral foreground in dark mode, with a tinted hover surface.

Global keyboard focus is a 3px focus-color outline with a 3px offset. Button color and shadow changes take 160ms. Reduced-motion preference removes CSS animation and transition, and disables cluster animation.

### Theme control

The header's sun or moon icon switches between light and dark mode. Its accessible name and tooltip name the destination mode. The control is 34px square on desktop and 30px wide by 34px high on mobile. The explicit choice persists in browser storage under `cf:theme`. Before the app renders, the page uses a valid stored choice or defaults to the system color preference. There is no separate system-mode option; later switches are explicit user choices.

### Inputs / Fields

Search inputs and selects are visually open within grouped search controls; separators establish the grouping. Notes and progress fields use a thin border, field radius and full width. Labels stay visible above or beside the control. Location results open as a theme-matched floating list with full-width text rows. Choosing a location updates and previews the draft area; the user then chooses Search area to fetch businesses there.

### Chips / Scores

Filter chips keep real checkbox inputs, a compact square indicator, and a lightly tinted selected background. Keyboard focus outlines the whole chip. Website signals pair an icon with literal source status, such as “No website listed.” Scores keep tabular numbers inside small rounded tonal badges.

### Navigation

Discover and Saved leads use text-led navigation with a narrow active-accent underline. Mobile removes navigation icons to preserve labels. The List/Map switch is a separate, statically placed segmented control with an accent-filled selected segment; it changes the view without changing results.

### Ranked business rows

Each flat row presents rank, business name, score, category and distance, address, website/contact signals, then saved status when relevant. A separate bookmark action stays reachable at the lower right. Hover is a subtle surface tint; selection uses selected meadow and a darker rank in light mode or neutral selected surfaces and pale rank text in dark mode. Selecting a row or pin opens the same inspector without changing the ranking.

### Map surfaces and inspector

Desaturated map tiles keep numbered pins prominent. Dark mode makes the same map tiles grayscale, then inverts and tones them down while preserving readable controls, attribution and scale. Priority legend values match the marker thresholds. The search radius uses a dashed teal boundary in light mode and cyan in dark mode, with a matching faint fill and a center dot. The outline is 2.5px with a 7px/5px dash pattern; fill opacity is 0.08. This overlay remains geographically anchored to the active search center or explicit proposed center, independently of the map viewport and the existing result set. Cluster counts expand to reveal businesses; the map never drops matching businesses merely because the list loads them in batches.

Changing the radius slider updates the boundary, diameter and approximate area immediately and closes the inspector. The radius spans 0.5–10 km in 0.5 km steps. Resizing keeps the map scale stable; expansion fits the circle only when it needs more room. Map movement updates a separate viewport position and never moves the circle. Fitting the area or inspecting a business likewise does not change the search center.

Preview area fits the complete circle with space for overlays. On mobile it also switches to Map and scrolls that view into place, respecting reduced motion. Selecting a location uses the same preview behavior. When the draft differs from the last search, the map caption reads “Next search area” and explains “Pins are from your last search.” The results heading retains the completed search radius, and the footer prompts the user to search to update the area. A radius change remains a preview until the user chooses Search area or the radius-specific search action.

After exploring elsewhere on the map, Search this area explicitly stages a proposed circle at the viewport center. It does not scan. The caption asks “Scan this circle?” and states “Preview only. Your results have not changed.” Inline Confirm search and Cancel actions make the next step explicit; the main search button also becomes Confirm search. Focus moves to the inline confirmation action. Panning during this proposal still leaves the circle anchored; Move preview here explicitly restages it at the new viewport center. Cancel or Escape restores the previous area and the radius captured before the proposal. Only Confirm search starts the proposed scan.

Confirmation fitting reserves 135px above the circle for its controls, compared with 85px for the ordinary caption, plus 30px horizontal and 60px bottom padding and a 15% bounds margin. This keeps the full circle clear below the confirmation controls on desktop and mobile. The viewport search action sits above the scale and legend.

Inspector content follows identity, category, address, score explanation, evidence, verification note, contact actions, notes and source. Category sits below the business name. Save remains available in the inspector footer. Unavailable contact details are omitted rather than fabricated.

## Do's and Don'ts

### Do:

- **Do** preserve the correspondence between row rank, map number and selected business.
- **Do** retain visible labels, keyboard focus and contrasted secondary text.
- **Do** use flat rows, thin dividers and restrained selection surfaces: green in light mode, neutral charcoal in dark mode.
- **Do** keep source limitations adjacent to priority evidence.
- **Do** reserve normal layout space for the mobile List/Map control.
- **Do** use the corresponding semantic palette for light and dark work surfaces, text, actions and focus.
- **Do** keep the draft search boundary and its measurements distinct from the last completed results.
- **Do** show radius changes immediately and preserve map scale unless expansion needs more room.
- **Do** keep the circle geographically anchored during map exploration and require explicit confirmation of a proposed map area.

### Don't:

- **Don't** present research priority as a probability or verified website audit.
- **Don't** rely on color alone to communicate score or state.
- **Don't** replace the shared workspace with nested decorative cards.
- **Don't** let mobile navigation obscure the working content.
- **Don't** promote the sidecar's synthesized tonal ramps into shipped tokens without implementation evidence.
- **Don't** imply that moving or resizing the preview has refreshed the business results.
- **Don't** make the circle follow map movement or scan a proposed map area before confirmation.
