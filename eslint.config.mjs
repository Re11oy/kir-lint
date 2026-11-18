import mikecannLint from "./index.js";

export default [...(await mikecannLint({ root: import.meta.dirname })), { ignores: ["test/fixture/**"] }];
