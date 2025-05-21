// import Color from 'color'
import Color from 'color'
import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import format from '~/format'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {ColorInput} from '~/widget/form/colorInput'
import {withNestedForm} from '~/widget/form/nestedForms'

import styles from './strataTable.module.css'

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
        const {stratum, showHexColorCode} = this.props
        return (
            <div className={styles.stratum}>
                {this.renderColorPicker()}
                {showHexColorCode ? this.renderHexColor() : null}
                {this.renderLabelInput()}
                <div className={styles.number}>{stratum.value}</div>
                <div className={styles.number}>{format.units(stratum.area / 1e4, 3)}</div>
                <div className={styles.number}>{format.units(stratum.weight * 100)}%</div>
            </div>
        )
    }

    renderColorPicker() {
        const {form, stratum, strata, locked, inputs: {color}, onSwap} = this.props
        const otherColors = strata
            .filter(({value}) => stratum.value !== value)
            .map(({color}) => color)
        return (
            <ColorInput
                input={color}
                otherColors={otherColors}
                onSwap={color => onSwap(color)}
                invalid={!!form.errors.colorUnique}
                disabled={locked}
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
            />
        )
    }

}

export const StratumForm = compose(
    _StratumForm,
    withNestedForm({fields, constraints, entityPropName: 'stratum', arrayFieldName: 'strata'})
)

