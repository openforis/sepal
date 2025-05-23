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
        }, 'map.legendBuilder.entry.error.invalidColor'),
    label: new Form.Field()
        .notBlank(),
}

const constraints = {
    colorUnique: new Form.Constraint(['color', 'strata'])
        .predicate(({
            color,
            strata
        }) => isUnique('color', color, strata), 'map.legendBuilder.entry.error.duplicateColor'),
    labelUnique: new Form.Constraint(['label', 'strata'])
        .predicate(({
            label,
            strata
        }) => isUnique('label', label, strata), 'map.legendBuilder.entry.error.duplicateLabel')
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
        const validationFields = [color, 'colorUnique']
        return (
            <ColorInput
                input={color}
                otherColors={otherColors}
                onSwap={color => onSwap(color)}
                invalid={!!form.errors.colorUnique}
                disabled={locked}
                tooltip={form.getErrorMessage(validationFields)}
            />
        )
    }

    renderHexColor() {
        const {form, inputs: {color}} = this.props
        const validationFields = [color, 'colorUnique']
        return (
            <Form.Input
                className={styles.colorText}
                input={color}
                errorMessage={validationFields}
                autoComplete={false}
                inputTooltip={form.getErrorMessage(validationFields)}
            />
        )
    }

    renderLabelInput() {
        const {form, stratum, inputs: {label}} = this.props
        const validationFields = [label, 'labelUnique']
        return (
            <Form.Input
                className={styles.label}
                input={label}
                placeholder={msg('map.legendBuilder.entry.classLabel.placeholder')}
                autoFocus={!stratum.label}
                errorMessage={validationFields}
                autoComplete={false}
                inputTooltip={form.getErrorMessage(validationFields)}
            />
        )
    }

}

export const StratumForm = compose(
    _StratumForm,
    withNestedForm({fields, constraints, entityPropName: 'stratum', arrayFieldName: 'strata'})
)

