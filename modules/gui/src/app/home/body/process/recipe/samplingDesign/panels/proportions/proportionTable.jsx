import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {NestedForms} from '~/widget/form/nestedForms'

import {ProportionForm} from './proportionForm'
import styles from './proportionTable.module.css'

export const ProportionTable = ({manual, proportions, overallProportion}) => {
    return <div className={styles.proportions}>
        <NestedForms arrayInput={proportions} idPropName='stratum'>
            <Header/>
            {proportions.value.map(entry => manual
                ? <ProportionForm key={entry.stratum} entry={entry}/>
                : <Proportion key={entry.stratum} entry={entry}/>
            )}
            <Footer overallProportion={overallProportion}/>
        </NestedForms>
    </div>
}

const Header = () =>
    <div className={styles.header}>
        <div className={styles.proportionHeader}>{msg('process.samplingDesign.panel.proportions.form.anticipatedProportions.header')}</div>
    </div>

const Footer = ({overallProportion}) =>
    <div className={styles.footer}>
        <div className={styles.overall}>{msg('process.samplingDesign.panel.proportions.form.overallProportion.label')}</div>
        <div className={styles.number}>{format.units(overallProportion)}%</div>
    </div>

const Proportion = ({entry: {label, color, proportion}}) =>
    <div className={styles.row}>
        <div>
            <ColorElement color={color}/>
        </div>
        <div>{label}</div>
        <div className={styles.number}>{format.units(proportion)}%</div>
    </div>
