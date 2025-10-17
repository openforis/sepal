import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {ColorElement} from '~/widget/colorElement'
import {Form} from '~/widget/form'
import {withNestedForm} from '~/widget/form/nestedForms'

import styles from './allocationTable.module.css'

const fields = {
    sampleSize: new Form.Field()
        .notBlank()
        .int()
        .min(0)
}

class _AllocationForm extends React.Component {
    render() {
        const {entry: {label, color}, inputs: {sampleSize}, onChange} = this.props
        return (
            <div className={styles.row}>
                <div className={styles.color}>
                    <ColorElement color={color}/>
                </div>
                <div className={styles.label}>{label}</div>
                <div/>
                <div className={styles.number}>
                    <Form.Input
                        input={sampleSize}
                        type='number'
                        autoComplete={false}
                        inputTooltip={sampleSize.error}
                        onChange={onChange}
                    />
                </div>
            </div>
        )
    }
}

export const AllocationForm = compose(
    _AllocationForm,
    withNestedForm({fields, entityPropName: 'entry'})
)
