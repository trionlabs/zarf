# Issue Fixer

## 1. Distribution Summary Sync
**Issue:** Inputs in Wizard Step 1 & 2 were not updating the "Distribution Summary" panel in real-time.
**Root Cause:** Store updates were only happening on `handleNext()` (navigation), not on input change.
**Fix:** Added `$effect()` blocks in `step-1/+page.svelte` and `step-2/+page.svelte` to sync local state to `wizardStore` immediately.
**Status:** Fixed.