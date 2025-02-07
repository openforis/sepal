import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'

import styles from './strataTable.module.css'

export const StrataTable = ({strata}) => (
    <div className={styles.strata}>
        <Header/>
        {strata.value.map(stratum =>
            <Stratum key={stratum.value} stratum={stratum}/>
        )}
    </div>
)

// TODO: Use msg for header
const Header = () => (
    <div className={styles.header}>
        <div className={styles.label}/>
        <div className={styles.label}/>
        {/* <div className={styles.label}>Name</div> */}
        <div className={styles.value}>Value</div>
        <div className={styles.area}>Area (ha)</div>
        <div className={styles.weight}>Weight (%)</div>
    </div>
)

const Stratum = ({stratum: {value, label, color, area, weight}}) => (
    <div className={styles.stratum}>
        <div className={styles.color}>
            <ColorElement color={color}/>
        </div>
        <div className={styles.label}>{label}</div>
        <div className={styles.value}>{value}</div>
        <div className={styles.area}>{format.units(area / 1e4, 3)}</div>
        <div className={styles.weight}>{format.units(weight * 100)}</div>
    </div>
)
