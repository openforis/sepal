import {MISSING_SOURCE} from './diagnostic.js'

// Whether every reference in a closure resolves and none closes a cycle - nothing about assets, configuration or
// Earth Engine. Asked of the closure operation's outcome, so one that did not complete is never VALID: INVALID when
// it had already found a definitive diagnosis, otherwise UNAVAILABLE. Independent of whether a recipe can be
// described; see "Dependency-scoped descriptions" in docs/design/recipes/gui-source-runtime.md.

export const VALID = 'VALID'
export const UNAVAILABLE = 'UNAVAILABLE'
export const INVALID = 'INVALID'

const isMissing = ({code}) => code === MISSING_SOURCE

export const dependencyValidity = ({status, graph}) => {
    const {diagnostics} = graph
    if (status === 'COMPLETE' && diagnostics.length === 0) {
        return {status: VALID, diagnostics: []}
    }
    return {
        status: diagnostics.every(isMissing) ? UNAVAILABLE : INVALID,
        diagnostics: [...diagnostics]
    }
}
