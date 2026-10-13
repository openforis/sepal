import {availableSelections, bandSetLocation} from '#sepal/recipe/bandSets'
import {INSUFFICIENT_INPUT_BANDS} from '#sepal/recipe/output/diagnostic'
import {getAvailableIndexes} from '~/app/home/body/process/opticalIndexes'
import {msg} from '~/translate'

// The band sets of an input image as its editor shows them. Which selections a source provides is the shared rule's
// (lib/js/shared/src/recipe/bandSets.js), the one the recipe's output is described and refused by.
export const BandSetSpec = {
    filter(bandSetSpec, availableBands = []) {
        return availableSelections(bandSetSpec, availableBands || [])
    },

    isEmpty(bandSetSpec, availableBands = []) {
        return this.filter(bandSetSpec, availableBands).length < specClass(bandSetSpec).minimum
    },

    renderTitle(bandSetSpec) {
        return specClass(bandSetSpec).renderTitle(bandSetSpec)
    },

    options(bandSetSpec, availableBands = []) {
        return specClass(bandSetSpec).options(bandSetSpec, availableBands)
    },

    // What a band set says of its selections its source does not provide: those alone, each named.
    unavailableMessage(bandSetSpec, unavailable) {
        return specClass(bandSetSpec).unavailableMessage(unavailable.map(name => `“${name}”`).join(', '))
    },

    insufficientMessage() {
        return msg('process.classification.panel.inputImagery.bandSetSpec.insufficientBands')
    }
}

// What refusals of an input image's band sets, located in a model holding it, say of each of them: [{unavailable,
// insufficient}] in their order, `unavailable` the names of the selections its source does not provide.
export const bandSetProblems = (bandSetSpecs, diagnostics = []) =>
    (bandSetSpecs || []).map((bandSetSpec, set) => {
        const located = diagnostics
            .map(diagnostic => ({...diagnostic, location: bandSetLocation(diagnostic.path)}))
            .filter(({location}) => location?.set === set)
        return {
            unavailable: located
                .filter(({location}) => location.selection !== null)
                .map(({location}) => bandSetSpec.included?.[location.selection])
                .filter(name => name !== undefined),
            insufficient: located.some(({code}) => code === INSUFFICIENT_INPUT_BANDS)
        }
    })

const specClass = spec => {
    switch (spec.type) {
        case 'IMAGE_BANDS':
            return ImageBands
        case 'PAIR_WISE_EXPRESSION':
            return PairWiseExpression
        case 'INDEXES':
            return Indexes
        default :
            throw Error(`Unsupported band set spec class: ${JSON.stringify(spec)}`)
    }
}

const ImageBands = {
    minimum: 1,

    unavailableMessage(bands) {
        return msg('process.classification.panel.inputImagery.bandSetSpec.unavailableBands', {bands})
    },

    renderTitle() {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.imageBands.label'])
    },

    options(spec, availableBands) {
        return availableBands
            .map(value => ({value, label: value}))
    }
}

const PairWiseExpression = {
    // Nothing is combined from fewer than two.
    minimum: 2,

    unavailableMessage(bands) {
        return msg('process.classification.panel.inputImagery.bandSetSpec.unavailableBands', {bands})
    },

    renderTitle(spec) {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.pairWiseExpression', spec.operation, 'label'])
    },

    options(spec, availableBands) {
        return availableBands
            .map(value => ({value, label: value}))
    }
}

const Indexes = {
    minimum: 1,

    unavailableMessage(indexes) {
        return msg('process.classification.panel.inputImagery.bandSetSpec.underivableIndexes', {indexes})
    },

    renderTitle() {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.indexes.label'])
    },

    options(spec, availableBands) {
        const indexes = getAvailableIndexes(availableBands)
        return indexes
            .map(value => ({value, label: value}))
    }
}
