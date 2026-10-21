// Whether an operation over a configured recipe can run, beside which bands it provides (readImageOutput.js). See
// "Execution readiness" in docs/design/recipes/source-resolution.md.
//
// A type declares, per operation, the requirements its own configuration must meet and what the operation needs from
// each role its edges carry. A requirement reads the model and may ask, of the same resolution pass, for successfully
// described inputs (`describedInputs(role)`) - of the recipe itself or of a record it holds (`describedInputs(role,
// record)`), resolved under the chain that record was reached through - for the records a role selects (`recordsOf(role)`, null while any is not
// held) - of the recipe itself or of a record it already holds (`recordsOf(role, record)`) - whether such a record's type
// declares an operation (`declares(record, operation)`), and for the described inputs of those records in a role of theirs (`describedSourceInputs(role, innerRole)`):
// an input it needs observed is asked for as any is. It returns located findings; a need names what of a source the
// operation builds:
//
//   configurationRequirements  [{code, operations: [operation], findings: model => [{path, ...details}]}]
//   executionNeeds             {[operation]: {[role]: need | conditionalNeed({when, then, otherwise})}}
//                              need: IMAGE_OUTPUT | TRAINING_DATA | CLASSIFIER | REFERENCE
//
// IMAGE_OUTPUT: the operation builds the source's image, so the source's description and readiness count, whether or
// not its provider reads it. TRAINING_DATA: the operation trains on the samples the source produces, so the source is
// judged as its TRAINING_DATA - never as its image, which producing them does not build, and is not described for it -
// and a source whose type does not declare that operation cannot supply them. CLASSIFIER: the operation applies the
// classifier the source trains to other imagery, so the source is judged as its CLASSIFIER - its training data produced
// and trained on, never its image. REFERENCE: only that the source
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

// A recipe's collection classified by the Classification its Sources select, wherever its images are read - observed
// at a pixel, fitted into segments: the classifier that Classification trains applied to each of them. A stage beside
// the operation reading them, judged where the bands that operation builds include an output the Classification
// computes (requestStages, classifiedOutputs.js) - bands a request names, which no recipe saves. Training reads no AOI
// of the recipe classifying, so the stage is judged without one; the Classification's own imagery keeps its own.
export const CLASSIFIED_COLLECTION = 'CLASSIFIED_COLLECTION'

// Reading the segments at a pixel, as a segment chart does (/ccdc/loadSegments). For a recipe computing them itself,
// that is its segmentation at the clicked point rather than over its AOI. For one reading another's - CCDC Slice,
// Change Alerts - it is that source's image, built over its own AOI: the selected recipe as its IMAGE_OUTPUT.
export const PIXEL_SEGMENTS = 'PIXEL_SEGMENTS'

// Producing a recipe's training data for another to train on (a Classification's getSamples$, a Regression's
// getTrainingData$, lib/js/ee/src): its input images built and its points sampled over them, with the training data its
// own data sets reuse. Not its image: its classifier is neither trained nor applied for it, nor are its samples scaled
// as its classifier would scale them - the recipe training on them does that.
export const TRAINING_DATA = 'TRAINING_DATA'

// Training a recipe's classifier to apply it to other imagery, as a time-series collection classifies its images with a
// Classification (classifyImage, lib/js/ee/src/classification): its training data produced - its input images built,
// its points and those it reuses sampled - and trained on, which, unlike TRAINING_DATA, needs samples to train on. Not
// its image: it is neither built nor described.
export const CLASSIFIER = 'CLASSIFIER'

export const NOT_READY = 'NOT_READY'

// An edge whose role the operation evaluating it does not classify: the type's declaration is incomplete.
export const UNCLASSIFIED_ROLE = 'UNCLASSIFIED_ROLE'

// An operation asked of a recipe whose type declares nothing for it: what it would need is unknown, so it is not ready.
export const UNDECLARED_OPERATION = 'UNDECLARED_OPERATION'

const NEEDS = [IMAGE_OUTPUT, TRAINING_DATA, CLASSIFIER, REFERENCE]

// A role's need that follows the recipe's saved configuration: `then` where `when(model)` holds, `otherwise` where it
// does not. Flat: each branch is a need, never another condition.
export const conditionalNeed = ({when, then, otherwise}) => ({when, then, otherwise})

// The located findings of a recipe's own configuration for an operation. Preserve the rule's problem details so
// presentation can explain the originating reference without evaluating the rule or parsing expressions again.
export const configurationFindings = (definition, recipe, operation, context = {}) =>
    (definition?.configurationRequirements || [])
        .filter(({operations}) => operations.includes(operation))
        .flatMap(({code, findings}) => findings(recipe.model || {}, context).map(finding => ({...finding, code})))

// Whether a type declares what an operation needs: one declaring nothing for it cannot run it.
export const declaresOperation = (definition, operation) =>
    Boolean(definition?.executionNeeds?.[operation])

// What an operation needs from the source in a role, for a recipe configured as `model`: a need, or undefined where it
// does not say.
export const executionNeed = (definition, operation, role, model) => {
    const need = definition?.executionNeeds?.[operation]?.[role]
    return isConditional(need)
        ? need.when(model) ? need.then : need.otherwise
        : need
}

const isConditional = need => Boolean(need) && typeof need === 'object'

const isValidNeed = need => isConditional(need)
    ? typeof need.when === 'function' && NEEDS.includes(need.then) && NEEDS.includes(need.otherwise)
    : NEEDS.includes(need)

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
                || !Object.values(needs).every(isValidNeed)) {
                throw new Error(`Recipe type ${type} declares execution needs for ${operation} other than ${NEEDS.join(' or ')} by role, or a condition choosing between two of them`)
            }
        })
    }
}
