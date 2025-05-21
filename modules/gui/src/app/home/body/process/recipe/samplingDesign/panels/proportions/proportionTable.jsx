import _ from 'lodash'

import format from '~/format'
import {ColorElement} from '~/widget/colorElement'
import {NestedForms} from '~/widget/form/nestedForms'

import {ProportionForm} from './proportionForm'
import styles from './proportionTable.module.css'

export const ProportionTable = ({manual, proportions, overallProportion}) =>
    <div className={styles.proportions}>
        <NestedForms arrayInput={proportions} idPropName='stratum'>
            <Header/>
            {proportions.value.map(entry => manual
                ? <ProportionForm key={entry.stratum} entry={entry}/>
                : <Proportion key={entry.stratum} entry={entry}/>
            )}
            <Footer proportions={proportions} overallProportion={overallProportion}/>
        </NestedForms>
    </div>

const Header = () =>
    <div className={styles.header}>
        <div className={styles.stratumHeader}/>
        <div className={styles.weight}>Proportion of reporting category in stratum</div>
    </div>

const Footer = ({overallProportion}) =>
    <div className={styles.footer}>
        <div className={styles.overall}>Anticipated overall proportion</div>
        <div className={styles.number}>{format.units(overallProportion)}%</div>
    </div>

const Proportion = ({entry: {label, color, proportion}}) =>
    <div className={styles.row}>
        <div className={styles.color}>
            <ColorElement color={color}/>
        </div>
        <div className={styles.label}>{label}</div>
        <div className={styles.number}>{format.units(proportion)}%</div>
    </div>
