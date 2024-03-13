import {getAvailableIndexes} from './opticalIndexes'
import {msg} from '~/translate'
import _ from 'lodash'

export const BandSetSpec = {
    filter(bandSetSpec, availableBands = []) {
        return specClass(bandSetSpec).filter(bandSetSpec, availableBands)
    },

    isEmpty(bandSetSpec, availableBands = []) {
        return specClass(bandSetSpec).isEmpty(bandSetSpec, availableBands)
    },

    renderTitle(bandSetSpec) {
        return specClass(bandSetSpec).renderTitle(bandSetSpec)
    },

    options(bandSetSpec, availableBands = []) {
        return specClass(bandSetSpec).options(bandSetSpec, availableBands)
    }
}
 
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
    filter(spec, bands) {
        return (spec.included || []).filter(band => bands && bands.includes(band))
    },

    isEmpty(spec, bands) {
        return !this.filter(spec, bands).length
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
    filter(spec, bands) {
        return (spec.included || []).filter(band => bands.includes(band))
    },

    isEmpty(spec, bands) {
        return this.filter(spec, bands).length < 2 // Need at least two to evaluate anything
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
    filter(spec, bands) {
        const availableIndexes = getAvailableIndexes(bands)
        return (spec.included || [])
            .filter(index => availableIndexes.includes(index))
    },

    isEmpty(spec, bands) {
        return !this.filter(spec, bands).length
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
