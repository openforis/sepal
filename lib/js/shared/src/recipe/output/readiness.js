// Whether an operation over a configured recipe can run, beside which bands it provides (readImageOutput.js). See
// "Execution readiness" in docs/design/recipes/source-resolution.md.
//
// A type declares, per operation, the requirements its own configuration must meet and what the operation needs from
// each role its edges carry. A requirement reads the model and may ask, of the same resolution pass, for successfully
// described inputs (`describedInputs(role)`), for the records a role selects (`recordsOf(role)`, null while any is not
// held), and for the described inputs of those records in a role of theirs (`describedSourceInputs(role, innerRole)`):
// an input it needs observed is asked for as any is. It returns located findings; a need names what of a source the
// operation builds:
//
//   configurationRequirements  [{code, operations: [operation], findings: model => [{path, ...details}]}]
//   executionNeeds             {[operation]: {[role]: IMAGE_OUTPUT | TRAINING_DATA | REFERENCE}}
//
// IMAGE_OUTPUT: the operation builds the source's image, so the source's description and readiness count, whether or
// not its provider reads it. TRAINING_DATA: the operation trains on the samples the source produces, so the source is
// judged as its TRAINING_DATA - never as its image, which producing them does not build, and is not described for it -
// and a source whose type does not declare that operation cannot supply them. REFERENCE: only that the source
// resolves, which the closure's validity already answers - a limited check, saying nothing of what is read from it. A role an operation does not classify is a definitive
// finding where an edge carrying it is evaluated. An operation a type declares nothing for is not judged here - except
// by a read of that operation alone (resolveReadiness), which refuses a root that does not declare it.
//
// Readiness is {status, findings, needs}: READY; NEEDS_EVIDENCE while something it needs is not held, `needs` naming it;
// NOT_READY once anything is found, every finding kept beside what it still waits for. A settled read adds UNAVAILABLE:
// what it needed could not be had (observeImageOutput.js). Nothing here is stored: it is read again from the current
// records and evidence.

import {IMAGE_OUTPUT} from './product.js'

export {IMAGE_OUTPUT}

export const REFERENCE = 'REFERENCE'

// Reading the observations of a recipe's collection at a pixel, as a pixel chart does (/timeSeries/loadObservations).
// Not its image: the collection the image would be built from, at the clicked point rather than the recipe's AOI.
export const PIXEL_OBSERVATIONS = 'PIXEL_OBSERVATIONS'

// Reading the segments at a pixel, as a segment chart does (/ccdc/loadSegments). For a recipe computing them itself,
// that is its segmentation at the clicked point rather than over its AOI. For one reading another's - CCDC Slice,
// Change Alerts - it is that source's image, built over its own AOI: the selected recipe as its IMAGE_OUTPUT.
export const PIXEL_SEGMENTS = 'PIXEL_SEGMENTS'

// Producing a recipe's training data for another to train on (getTrainingData$, lib/js/ee/src/classification): its
// input images built and its points sampled over them, with the training data its own data sets reuse. Not its image:
// its classifier is neither trained nor applied for it.
export const TRAINING_DATA = 'TRAINING_DATA'

export const NOT_READY = 'NOT_READY'

// An edge whose role the operation evaluating it does not classify: the type's declaration is incomplete.
export const UNCLASSIFIED_ROLE = 'UNCLASSIFIED_ROLE'

// An operation asked of a recipe whose type declares nothing for it: what it would need is unknown, so it is not ready.
export const UNDECLARED_OPERATION = 'UNDECLARED_OPERATION'

const NEEDS = [IMAGE_OUTPUT, TRAINING_DATA, REFERENCE]

// The located findings of a recipe's own configuration for an operation. Preserve the rule's problem details so
// presentation can explain the originating reference without evaluating the rule or parsing expressions again.
export const configurationFindings = (definition, recipe, operation, context = {}) =>
    (definition?.configurationRequirements || [])
        .filter(({operations}) => operations.includes(operation))
        .flatMap(({code, findings}) => findings(recipe.model || {}, context).map(finding => ({...finding, code})))

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
