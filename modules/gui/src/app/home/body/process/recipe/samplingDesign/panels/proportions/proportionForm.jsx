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
                <div className={styles.color}>
                    <ColorElement color={color}/>
                </div>
                <div className={styles.label}>{label}</div>
                <div className={styles.proportionInput}>
                    <div className={styles.proportionInputSpacer}/>
                    <Form.Input
                        input={proportion}
                        type='number'
                        placeholder={msg('Proportion...')}
                        autoComplete={false}
                        suffix={msg('process.samplingDesign.panel.proportions.form.overallProportion.suffix')}
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
