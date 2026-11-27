import clickShowsProgress from "./rules/click-shows-progress.js";
import effectReturnsCleanupOnly from "./rules/effect-returns-cleanup-only.js";
import noImportCycle from "./rules/no-import-cycle.js";
import noRenderWaitTimer from "./rules/no-render-wait-timer.js";
import noSleepInTests from "./rules/no-sleep-in-tests.js";
import preferKindDiscriminant from "./rules/prefer-kind-discriminant.js";

export default {
  meta: { name: "kir-lint" },
  rules: {
    "click-shows-progress": clickShowsProgress,
    "effect-returns-cleanup-only": effectReturnsCleanupOnly,
    "no-import-cycle": noImportCycle,
    "no-render-wait-timer": noRenderWaitTimer,
    "no-sleep-in-tests": noSleepInTests,
    "prefer-kind-discriminant": preferKindDiscriminant,
  },
};
