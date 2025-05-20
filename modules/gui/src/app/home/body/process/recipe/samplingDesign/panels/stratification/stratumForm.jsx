// import Color from 'color'
import Color from 'color'
import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {ColorInput} from '~/widget/form/colorInput'
import {withForm} from '~/widget/form/form'

import styles from './stratumForm.module.css'

const isUnique = (key, value, strata) => !strata || strata.filter(stratum => stratum[key] === value).length <= 1

const fields = {
    strata: new Form.Field(),
    color: new Form.Field()
        .notBlank()
        .predicate(color => {
            try {
                return !!Color(color).hex()
            } catch (_error) {
                return false
            }
        }, 'map.legendBuilder.entry.error.invalidColor'), // TODO: Message key?
    label: new Form.Field()
        .notBlank(),
}

const constraints = {
    colorUnique: new Form.Constraint(['color', 'strata'])
        .predicate(({
            color,
            strata
        }) => isUnique('color', color, strata), 'map.legendBuilder.entry.error.duplicateColor'), // TODO: Message key?
    labelUnique: new Form.Constraint(['label', 'strata'])
        .predicate(({
            label,
            strata
        }) => isUnique('label', label, strata), 'map.legendBuilder.entry.error.duplicateLabel') // TODO: Message key?
}

class _StratumForm extends React.Component {
    state = {invalid: true}

    render() {
        const {showHexColorCode} = this.props
        return (
            <>
                {this.renderColorPicker()}
                {showHexColorCode ? this.renderHexColor() : null}
                {this.renderLabelInput()}
            </>
        )
    }

    renderColorPicker() {
        const {form, stratum, strata, locked, inputs: {color}, onSwap} = this.props
        const otherColors = strata
            .filter(({id}) => stratum.id !== id)
            .map(({color}) => color)
        return (
            <ColorInput
                input={color}
                otherColors={otherColors}
                onSwap={color => onSwap(color)}
                invalid={!!form.errors.colorUnique}
                disabled={locked}
                onChange={color => this.updateStrata({color})}
            />
        )
    }

    renderHexColor() {
        const {inputs: {color}} = this.props
        return (
            <Form.Input
                className={styles.colorText}
                input={color}
                errorMessage={[color, 'colorUnique']}
                autoComplete={false}
                onChange={color => this.updateStrata({color})}
            />
        )
    }

    renderLabelInput() {
        const {stratum, inputs: {label}} = this.props
        return (
            <Form.Input
                className={styles.label}
                input={label}
                placeholder={msg('map.legendBuilder.entry.classLabel.placeholder')} // TODO: Message key?
                autoFocus={!stratum.label}
                errorMessage={[label, 'labelUnique']}
                autoComplete={false}
                onChange={label => this.updateStrata({label})}
            />
        )
    }

    componentDidMount() {
        this.updateInputs()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {color: prevColor, label: prevLabel}} = prevProps
        const {form, stratum, inputs: {strata, color, label}, onChange} = this.props

        if (!_.isEqual(prevProps.stratum, stratum)) {
            this.updateInputs()
        }

        if (prevColor.value !== color.value || prevLabel.value !== label.value) {
            const updatedStratum = {
                ...stratum,
                color: color.value,
                label: label.value
            }
            const invalid = form.isInvalid()
            onChange(updatedStratum, strata.value, invalid)
        }
    }

    updateInputs() {
        const {strata, stratum, inputs} = this.props
        inputs.strata.set(strata)
        inputs.color.set(stratum.color)
        inputs.label.set(stratum.label)
    }

    updateStrata({color, label}) {
        const {strata, stratum, inputs} = this.props
        const updatedStratum = {
            ...stratum,
            color: color === undefined ? stratum.color : color,
            label: label === undefined ? stratum.label : label
        }
        const updatedStrata = strata.map(prevStratum =>
            prevStratum.id === updatedStratum.id
                ? updatedStratum
                : prevStratum
        )
        inputs.strata.set(updatedStrata)
    }
}

export const StratumForm = compose(
    _StratumForm,
    withForm({fields, constraints})
)

