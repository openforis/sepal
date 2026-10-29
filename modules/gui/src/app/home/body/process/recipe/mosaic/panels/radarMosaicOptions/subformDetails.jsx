import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'

import styles from './subformDetails.module.css'

export const SubformDetails = ({fields, onClick}) => {
    return (
        <Layout
            className={onClick ? styles.details : undefined}
            type='horizontal'
            alignment='left'
            framed
            onClick={onClick}>
            {fields.map(renderField)}
        </Layout>
    )
}

const renderField = ({label, value, tooltip}) =>
    <Layout key={label} type='vertical' spacing='none'>
        <Label msg={label} tooltip={tooltip} size='small'/>
        <div className={styles.value}>
            {value || value !== '' ? value : <i>n/a</i>}
        </div>
    </Layout>
