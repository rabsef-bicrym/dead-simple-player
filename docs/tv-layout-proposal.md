# Proposed TV layout follow-up

Status: proposal only; no layout change is included in the refactor. The user requested a separate UI fix for the large-TV spacing problem. The design below still needs approval before implementation.

## Observed problem

At 3840×2160 CSS pixels, the console's register, dial, and programme panel remain relatively small while the cabinet spans the screen. `Home.tsx` caps their widths at 286, 560, and 460 points. The center region absorbs the remaining width, and most text and controls retain their laptop sizes. The guide also retains fixed row heights. This produces isolated groups of controls, large gaps, and text that is difficult to read from a sofa.

Resolution alone is not enough to characterize a TV. A 4K display may expose a 1920×1080 CSS viewport because of OS scaling or browser zoom. The implementation should use logical viewport size, retain browser zoom, and be checked at realistic viewing distance.

## Preferred direction: scale one composed console

Keep the existing three-column composition, wood/brass treatment, labels, and input behavior. Treat the console as a coherent cabinet whose typography, controls, gaps, and guide rows scale together. Keep the video plane independent so it continues to fill the available picture area and preserve its existing aspect-ratio policy.

An initial sizing rule to review is:

```text
consoleScale = clamp(min(viewportWidth / 1440, viewportHeight / 900), 1, 2.4)
logicalWidth = viewportWidth / consoleScale
logicalHeight = viewportHeight / consoleScale
```

| Logical browser viewport | Proposed scale | Cabinet layout space before scaling |
| --- | --- | --- |
| 1440×900 | 1.0 | 1440×900 |
| 1920×1080 | 1.2 | 1600×900 |
| 3840×2160 | 2.4 | 1600×900 |

These values are a starting proposal, not a universal TV standard. Compare 1080p and 4K mockups before choosing the final reference dimensions and upper limit. An ultrawide display should keep the cabinet centered instead of stretching the gap between controls indefinitely.

Prefer one console layout boundary over independent multipliers scattered through every component. Establish that boundary at the receiver/guide layer, with logical dimensions supplied explicitly to calculations that currently call `useWindowDimensions`. Scaling just the outer view while children still calculate from the full physical viewport would apply some dimensions twice. Keep safe-area calculations, pointer hit testing, native text, and the player surface in their correct coordinate spaces.

The phone layout and its 500-point cabinet-selection threshold would stay unchanged. iPad/console behavior needs explicit review rather than assuming every non-phone screen is a television. No new settings screen, zoom control, or input vocabulary is proposed for the first pass.

## Approval and acceptance

Before implementation, review side-by-side 1080p and 4K receiver/guide mockups, including a channel with a long name and a programme with a long title. Approve the composition, relative text size, and treatment of very wide displays.

The follow-up should then verify:

- The register, dial, programme panel, guide, and service rail read as one composition, with consistent spacing and legible text at the intended viewing distance.
- Long names, long programme titles, missing art, empty guides, and varying channel counts fit without collisions or clipped controls.
- The picture's aspect ratio and player mounting behavior are unchanged; overlays align with it correctly.
- Mouse/touch hit targets, keyboard navigation, focus, and channel selection still correspond to the visible controls after scaling.
- 1440×900 remains acceptable; 1920×1080 and 3840×2160 are checked at both normal and increased browser/OS scaling; ultrawide layouts remain centered.
- Native iPhone portrait and landscape screenshots remain unchanged. Any iPad layout adjustment is reviewed explicitly.

The functional routing and guide helpers extracted in the refactor can be reused as-is. The TV follow-up should change only the approved layout boundary and sizing policy, without mixing in playback or gesture redesign.
