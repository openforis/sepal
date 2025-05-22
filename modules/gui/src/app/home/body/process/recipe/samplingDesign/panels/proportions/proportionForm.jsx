import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {Form} from '~/widget/form'
import {withNestedForm} from '~/widget/form/nestedForms'

import styles from './proportionTable.module.css'

const fields = {
    proportions: new Form.Field(),
    proportion: new Form.Field()
        .notBlank()
        .number()
        .max(100)
}

class _ProportionForm extends React.Component {
    render() {
        const {entry: {label, color}, inputs: {proportion}} = this.props
        return (
            <div className={styles.row}>
                <ColorElement color={color}/>
                <div>{label}</div>
                <div>
                    <Form.Input
                        input={proportion}
                        type='number'
                        placeholder={msg('Proportion...')}
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
