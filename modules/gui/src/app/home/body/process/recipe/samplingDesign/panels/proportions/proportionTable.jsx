import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'

import styles from './proportionTable.module.css'

export const ProportionTable = ({proportions, overallProportion}) => (
    <div className={styles.proportions}>
        <HeaderGroups/>
        <Header/>
        {proportions.value.map(entry =>
            <Proportion key={entry.stratum} entry={entry}/>
        )}
        <Footer proportions={proportions} overallProportion={overallProportion}/>
    </div>
)

// TODO: Use msg for header
const HeaderGroups = () => (
    <div className={styles.headerGroups}>
        <div className={styles.stratum}></div>
        <div className={styles.reportingCategory}>Reporting category</div>
    </div>
)

const Header = () => (
    <div className={styles.header}>
        <div className={styles.stratumHeader}>Stratum</div>
        <div className={styles.area}>Area (ha)</div>
        <div className={styles.weight}>Proportion (%)</div>
    </div>
)

const Footer = ({proportions, overallProportion}) => {
    const totalArea = _.sum(proportions.value.map(({area}) => area))
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>Overall</div>
            <div className={styles.number}>{format.units(totalArea / 1e4, 3)}</div>
            <div className={styles.number}>{format.units(overallProportion * 100)}</div>
        </div>
    )
}

const Proportion = ({entry: {label, color, proportion, area}}) => {
    return (
        <div className={styles.row}>
            <div className={styles.color}>
                <ColorElement color={color}/>
            </div>
            <div className={styles.label}>{label}</div>
            <div className={styles.number}>{format.units(area / 1e4, 3)}</div>
            <div className={styles.number}>{format.units(proportion * 100)}</div>
        </div>
    )
}
