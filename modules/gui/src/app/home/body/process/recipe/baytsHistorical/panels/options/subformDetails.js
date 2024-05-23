import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'

import styles from './subformDetails.module.css'

export const SubformDetails = ({fields, onClick}) => {
    return (
        <Layout
            className={styles.details}
            type='horizontal'
            alignment='left'
            framed
            onClick={onClick}>
            {fields.map(renderField)}
        </Layout>
    )
}

const renderField = ({label, value}) =>
    <Layout key={label} type='vertical' spacing='none'>
        <Label msg={label} size='small'/>
        <div className={styles.value}>
            {value || value !== '' ? value : <i>n/a</i>}
        </div>
    </Layout>
