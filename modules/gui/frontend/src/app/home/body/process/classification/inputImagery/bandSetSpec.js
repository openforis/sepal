import {Buttons} from 'widget/buttons'
import {getAvailableIndexes} from './opticalIndexes'
import {msg} from 'translate'
import {mutate} from 'stateUtils'
import React from 'react'
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

    renderDescription(bandSetSpec, availableBands = []) {
        return specClass(bandSetSpec).renderDescription(bandSetSpec, availableBands)
    },

    renderEditor({bandSetSpec, availableBands = [], onChange}) {
        return specClass(bandSetSpec).renderEditor(bandSetSpec, availableBands, onChange)
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
        throw new Error('Unsupported band set spec class: ' + JSON.stringify(spec))
    }
}

const ImageBands = {
    filter(spec, bands) {
        const included = (spec.included || []).filter(band => bands.includes(band))
        return mutate(spec, 'included').set(included)
    },

    isEmpty(spec, bands) {
        return !this.filter(spec, bands).included.length
    },

    renderTitle() {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.imageBands.label'])
    },

    renderDescription(spec) {
        const value = (spec.included || []).length
            ? spec.included.join(', ')
            : <i>None</i>
        return (
            <div>{value}</div>
        )
    },

    renderEditor(spec, bands, onChange) {
        return (
            <Selector
                options={bands}
                selected={spec.included}
                onChange={included => {
                    onChange(mutate(spec, 'included').set(included))
                }}/>
        )
    }
}

const PairWiseExpression = {
    filter(spec, bands) {
        const included = (spec.included || []).filter(band => bands.includes(band))
        return mutate(spec, 'included').set(included)
    },

    isEmpty(spec, bands) {
        return this.filter(spec, bands).included.length < 2 // Need at least two to evaluate anything
    },

    renderTitle(spec) {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.pairWiseExpression', spec.operation, 'label'])
    },

    renderDescription(spec) {
        const value = (spec.included || []).length
            ? spec.included.join(', ')
            : <i>None</i>
        return (
            <div>{value}</div>
        )
    },

    renderEditor(spec, bands, onChange) {
        return (
            <Selector
                options={bands}
                selected={spec.included}
                onChange={included => {
                    onChange(mutate(spec, 'included').set(included))
                }}/>
        )
    }
}

const Indexes = {
    filter(spec, bands) {
        const availableIndexes = getAvailableIndexes(bands)
        const included = (spec.included || []).filter(index => availableIndexes.includes(index))
        return mutate(spec, 'included').set(included)
    },

    isEmpty(spec, bands) {
        return !this.filter(spec, bands).included.length
    },

    renderTitle() {
        return msg(['process.classification.panel.inputImagery.bandSetSpec.indexes.label'])
    },

    renderDescription(spec) {
        const value = (spec.included || []).length
            ? spec.included.join(', ')
            : <i>None</i>
        return (
            <div>{value}</div>
        )
    },

    renderEditor(spec, bands, onChange) {
        const indexes = getAvailableIndexes(bands)
        return (
            <Selector
                options={indexes}
                selected={spec.included}
                onChange={included => {
                    onChange(mutate(spec, 'included').set(included))
                }}/>
        )
    }
}

class Selector extends React.Component {
    render() {
        const {options, selected = [], onChange} = this.props
        return (
            <Buttons
                options={options}
                selected={selected}
                multiple={true}
                onChange={selected =>
                    onChange(
                        options.filter(item => selected
                            .map(item => _.isObjectLike(item) ? item.value : item)
                            .includes(item)) // Keep selected items sorted in original order
                    )
                }
            />
        )
    }
}
