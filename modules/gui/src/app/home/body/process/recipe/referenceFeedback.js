import _ from 'lodash'

import {INSUFFICIENT_INPUT_BANDS, UNDERIVABLE_INPUT_INDEX} from '#sepal/recipe/bandSets'
import {MISSING_INPUT_BAND, NON_IMAGE_OUTPUT} from '#sepal/recipe/output/diagnostic'
import {CLASSIFIER, TRAINING_DATA, UNDECLARED_OPERATION} from '#sepal/recipe/output/readiness'
import {MULTIPLE_CLASSIFIER_INPUTS} from '#sepal/recipe/type/classification'

import {describeFeedback, feedbackMessage, feedbackText, joinFeedback, recipeReference} from './feedbackMessage'

// Presentation of confirmed upstream readiness findings at the selections that declare those dependencies.
// No operations: the existing output read still decides gates. A caller binding the selected reference's editor uses
// the same finding to block committing an unusable selection. A recipe not established unsound by itself (establishesOwnDefect) is not
// said to need attention: what the recipe using it cannot do with it is, as that recipe's requirement, whether it is the
// one selected or one further up.
export const referenceFeedback = ({section, roles, itemOf}) => ({
    id: `${section.id}.referencedRecipes`,
    section,
    requirement: {
        id: `${section.id}.referencedRecipes`,
        describe: ({item: {referenceFeedback}}) => ({...describeFeedback(message(referenceFeedback)), details: [], referenceFeedback})
    },
    summary: reads => feedbackText(summary(reads)),
    summaryContent: summary,
    outputDiagnostics: {
        codes: [],
        upstreamReferences: roles,
        itemOf: (diagnostic, recipe, context) => {
            const item = itemOf(diagnostic, recipe, context)
            const named = id => ({id, name: context.recipeNames[id] || id})
            const findings = diagnostic.findings || []
            const unsound = findings.filter(establishesOwnDefect).map(({recipePath}) => recipePath.at(-1))
            return item && {
                ...item,
                referenceFeedback: {
                    reference: named(diagnostic.reference.id),
                    origins: diagnostic.origins.map(named),
                    causes: diagnostic.origins.filter(id => !findings.length || unsound.includes(id)).map(named),
                    unsuitable: _.uniqBy(findings.filter(finding => !establishesOwnDefect(finding)), ({code, recipePath}) => JSON.stringify([code, recipePath]))
                        .map(finding => ({finding, consumer: named(finding.recipePath.at(-2)), recipe: named(finding.recipePath.at(-1))}))
                }
            }
        }
    },
    operations: []
})

// Whether a finding establishes that the recipe it is found in is unsound by itself: found judging its image, or for a
// rule its image is refused by too - one naming no `operation` (configurationFindings), or a band set. A use it cannot
// serve - one an operation alone refuses, or a known restriction - establishes only that the recipe referencing it
// cannot use it so (recipePath.at(-2)), what is to review being that recipe's selection.
export const establishesOwnDefect = finding =>
    !restrictionOf(finding) && (!finding.operation || IMAGE_BAND_SET_REFUSALS.includes(finding.code))

// Each use found through a reference that cannot be made, said with its repair - selecting another recipe, for opening
// the one used shows nothing to repair: where this recipe selects it, or else naming the recipe further up that does.
// A reason it does not know it says without claiming either recipe is broken. Null where there is none.
export const unsuitabilityOf = feedback => feedbackText(unsuitabilityMessage(feedback))

export const unsuitabilityMessage = ({unsuitable = []}) => unsuitable.length
    ? joinFeedback(_.uniqBy(_.sortBy(unsuitable, ({finding}) => finding.recipePath.length)
        .map(({finding, consumer, recipe}) => {
            const key = restrictionOf(finding) || 'recipeUnusable'
            return finding.recipePath.length === 2
                ? feedbackMessage(`process.source.status.${key}`, {recipe: recipeReference(recipe.id, recipe.name), count: finding.count})
                : feedbackMessage(`process.source.status.${key}Upstream`, {consumer: recipeReference(consumer.id, consumer.name), recipe: recipeReference(recipe.id, recipe.name), count: finding.count})
        }), value => JSON.stringify(value)))
    : null

// The recipes through a reference that need attention by themselves, rather than for the use another makes of them.
export const causesOf = ({origins, causes = origins}) => causes

// What a use restriction is explained as, by its finding: a Classification of several input images applied to each image
// of a collection, a recipe asked for an operation its type does not provide, or one read as an image that makes none.
const restrictionOf = finding => {
    switch (finding.code) {
        case MULTIPLE_CLASSIFIER_INPUTS:
            return 'multipleClassifierInputs'
        case UNDECLARED_OPERATION:
            return UNDECLARED[finding.operation]
        case NON_IMAGE_OUTPUT:
            return 'providesNoImage'
        default:
            return null
    }
}

const UNDECLARED = {
    [TRAINING_DATA]: 'providesNoTrainingData',
    [CLASSIFIER]: 'providesNoClassifier'
}

// Refused by its image's description, and judged for CLASSIFIER as configuration (inputBandSetRequirements).
const IMAGE_BAND_SET_REFUSALS = [MISSING_INPUT_BAND, UNDERIVABLE_INPUT_INDEX, INSUFFICIENT_INPUT_BANDS]

// Keep identity separate from prose: same-named recipes remain distinct, and future navigation needs no text parsing.
const summary = reads => joinFeedback(reads.map(({ownVerdict}) => message(ownVerdict.diagnostic.item.referenceFeedback)))

const message = referenceFeedback => {
    const unsuitability = unsuitabilityMessage(referenceFeedback)
    const causes = causesOf(referenceFeedback)
    return joinFeedback([unsuitability, (causes.length || !unsuitability) && unsoundMessage(referenceFeedback.reference, causes)])
}

const unsoundMessage = (reference, origins) => {
    // Origins are already deduplicated by ID by the bridge. Partition only the wording, keeping metadata intact.
    const upstream = origins.filter(({id}) => id !== reference.id)
    const ownProblem = origins.some(({id}) => id === reference.id)
    if (!upstream.length) {
        return feedbackMessage('process.source.status.recipeNeedsAttention', {recipe: recipeReference(reference.id, reference.name)})
    }
    const template = ownProblem
        ? upstream.length === 1 ? 'recipeAlsoDependsOn' : 'recipeAlsoDependsOnOrigins'
        : upstream.length === 1 ? 'recipeBlockedBy' : 'recipeBlockedByOrigins'
    return feedbackMessage(`process.source.status.${template}`, {
        recipe: recipeReference(reference.id, reference.name),
        origins: joinFeedback(upstream.map(({id, name}) => recipeReference(id, name)), ', ')
    })
}
