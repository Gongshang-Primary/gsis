/* Pure Operations includes a Node-only fallback for its native recovery API.
   Native recovery is not part of the rehearsal command schema. Fail closed if
   a future change accidentally reaches it; do not import any Node runtime API. */
export function createHash(){throw new Error('Native recovery is unsupported in the isolated rehearsal.');}
