// Whether an operation over a configured recipe can run, beside which bands it provides (readImageOutput.js). See
// "Execution readiness" in docs/design/recipes/source-resolution.md.
//
// A type declares, per operation, the requirements its own configuration must meet and what the operation needs from
// each role its edges carry. Both are pure declarations: a requirement reads the recipe's own model alone - no input,
// record or evidence - and returns located findings; a need names what of a source the operation builds:
//
//   configurationRequirements  [{code, operations: [operation], findings: model => [{path, ...details}]}]
//   executionNeeds             {[operation]: {[role]: IMAGE_OUTPUT | REFERENCE}}
//
// IMAGE_OUTPUT: the operation builds the source's image, so the source's description and readiness count, whether or
// not its provider reads it. REFERENCE: only that the source resolves, which the closure's validity already answers -
// a limited check, saying nothing of what is read from it. A role an operation does not classify is a definitive
// finding where an edge carrying it is evaluated. An operation a type declares nothing for is not judged here.
//
// Readiness is {status, findings, needs}: READY; NEEDS_EVIDENCE while something it needs is not held, `needs` naming it;
// NOT_READY once anything is found, every finding kept beside what it still waits for. A settled read adds UNAVAILABLE:
// what it needed could not be had (observeImageOutput.js). Nothing here is stored: it is read again from the current
// records and evidence.

import {IMAGE_OUTPUT} from './product.js'

export {IMAGE_OUTPUT}

export const REFERENCE = 'REFERENCE'

export const NOT_READY = 'NOT_READY'

// An edge whose role the operation evaluating it does not classify: the type's declaration is incomplete.
export const UNCLASSIFIED_ROLE = 'UNCLASSIFIED_ROLE'

const NEEDS = [IMAGE_OUTPUT, REFERENCE]

// The located findings of a recipe's own configuration for an operation. Preserve the rule's problem details so
// presentation can explain the originating reference without evaluating the rule or parsing expressions again.
export const configurationFindings = (definition, recipe, operation) =>
    (definition?.configurationRequirements || [])
        .filter(({operations}) => operations.includes(operation))
        .flatMap(({code, findings}) => findings(recipe.model || {}).map(finding => ({...finding, code})))

// What an operation needs from the source in a role: IMAGE_OUTPUT, REFERENCE, or undefined where it does not say.
export const executionNeed = (definition, operation, role) =>
    definition?.executionNeeds?.[operation]?.[role]

export const validateReadinessDeclarations = (type, {configurationRequirements, executionNeeds}) => {
    if (configurationRequirements !== undefined) {
        if (!Array.isArray(configurationRequirements)) {
            throw new Error(`Recipe type ${type} declares configurationRequirements that is not a list`)
        }
        configurationRequirements.forEach(({code, operations, findings} = {}) => {
            if (typeof code !== 'string' || !code.trim().length || !Array.isArray(operations) || !operations.length
                || typeof findings !== 'function') {
                throw new Error(`Recipe type ${type} declares a configuration requirement without a code, operations and findings`)
            }
        })
    }
    if (executionNeeds !== undefined) {
        Object.entries(executionNeeds).forEach(([operation, needs]) => {
            if (!needs || typeof needs !== 'object' || Array.isArray(needs)
                || !Object.values(needs).every(need => NEEDS.includes(need))) {
                throw new Error(`Recipe type ${type} declares execution needs for ${operation} other than ${NEEDS.join(' or ')} by role`)
            }
        })
    }
}
