import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {Form} from '~/widget/form'
import {withNestedForm} from '~/widget/form/nestedForms'

import {isValidProportionPercentage} from '../../sampling/numericRanges'
import styles from './proportionTable.module.css'

const fields = {
    proportion: new Form.Field()
        .notBlank()
        .number()
        .predicate(isValidProportionPercentage,
            'process.samplingDesign.panel.proportions.form.proportion.range')
}

class _ProportionForm extends React.Component {
    render() {
        const {presentation: {label, color}, inputs: {proportion}} = this.props
        return (
            <div className={styles.row}>
                <ColorElement color={color}/>
                <div>{label}</div>
                <div>
                    <Form.Input
                        input={proportion}
                        type='number'
                        autoComplete={false}
                        suffix={msg('process.samplingDesign.panel.proportions.form.overallProportion.suffix')}
                        inputTooltip={proportion.error}
                    />
                </div>
            </div>
        )
    }
}

export const ProportionForm = compose(
    _ProportionForm,
    withNestedForm({fields, entityPropName: 'entry'})
)
