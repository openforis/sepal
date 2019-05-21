import {Buttons} from 'widget/buttons'
import {getAvailableIndexes} from './opticalIndexes'
import {mutate} from 'stateUtils'
import React from 'react'
import _ from 'lodash'

export const filterBandSetSpec = (bandSetSpec, availableBands = []) =>
    specClass(bandSetSpec).filter(bandSetSpec, availableBands)

export const isBandSetSpecEmpty = (bandSetSpec, availableBands = []) =>
    specClass(bandSetSpec).isEmpty(bandSetSpec, availableBands)

export const renderBandSetSpec = (bandSetSpec, availableBands = []) =>
    specClass(bandSetSpec).render(bandSetSpec, availableBands)

export const renderBandSetSpecEditor = ({bandSetSpec, availableBands = [], onChange}) =>
    specClass(bandSetSpec).renderEditor(bandSetSpec, availableBands, onChange)

const specClass = spec => {
    switch (spec.class) {
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

    render(spec) {
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
        return !this.filter(spec, bands).included.length
    },

    render(spec) {
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

    render(spec) {
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
