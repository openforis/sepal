import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {NestedForms} from '~/widget/form/nestedForms'

import {byStratumKey, stratumView} from '../../sampling/designModel'
import {ProportionForm} from './proportionForm'
import styles from './proportionTable.module.css'

// Presentation is passed BESIDE the row for the same reason as in the allocation table: a nested form writes
// its entity straight back into the persisted array, so a label merged in here would be persisted onto a row
// that does not own it - and would then be the stale copy shown next time.
export const ProportionTable = ({manual, proportions, strata, overallProportion}) => {
    const owners = byStratumKey(strata)
    const presentationOf = entry => stratumView(owners, entry)
    return <div className={styles.proportions}>
        <NestedForms arrayInput={proportions} idPropName='stratum'>
            <Header/>
            {proportions.value.map(entry => manual
                // Ensure the row carries a `proportion` key before the nested form mounts: withNestedForm only
                // propagates fields already present on the entity, so a stratum added after these rows were
                // written would never write the typed value back. Blank keeps Apply disabled until answered.
                ? <ProportionForm key={entry.stratum} entry={{proportion: '', ...entry}} presentation={presentationOf(entry)}/>
                : <Proportion key={entry.stratum} entry={entry} presentation={presentationOf(entry)}/>
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

const Proportion = ({entry: {proportion}, presentation: {label, color}}) =>
    <div className={styles.row}>
        <div>
            <ColorElement color={color}/>
        </div>
        <div>{label}</div>
        <div className={styles.number}>{format.units(proportion)}%</div>
    </div>
