// Runtime unavailability, as distinct from a source diagnostic.
//
// A source diagnostic says something about a recipe. These say something about the environment the operation was
// running in: the linked Earth Engine credentials were replaced, or the scope that owned the runtime ended.
// Carrying them as errors rather than diagnostics keeps them outside a consumer's diagnostic-based migration
// fallback, which reads diagnostics and would otherwise have to recognise and exclude them.
//
// The code is the whole contract. The message is developer-facing and must never be shown to a user.

export const SOURCE_IDENTITY_CHANGED = 'SOURCE_IDENTITY_CHANGED'
export const SOURCE_RUNTIME_UNAVAILABLE = 'SOURCE_RUNTIME_UNAVAILABLE'

export const sourceRuntimeError = code =>
    Object.assign(new Error(`Source runtime: ${code}`), {code})
