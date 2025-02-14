import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'

import styles from './allocationTable.module.css'

// TODO: Calculate marginOfError per stratum. Also, we cannot trust sample size, should calculate it here
// This can maybe be included in the allocation?
export const AllocationTable = ({allocation, sampleSize, marginOfError, relativeMarginOfError}) => {
    return (
        <div className={styles.allocation}>
            <Header
                relativeMarginOfError={relativeMarginOfError}
            />
            {allocation.map(entry => <Allocation key={entry.stratum} entry={entry}/>
            )}
            <Footer
                sampleSize={sampleSize}
                marginOfError={marginOfError}
                relativeMarginOfError={relativeMarginOfError}/>
        </div>
    )
}

// TODO: Use msg for header
const Header = ({relativeMarginOfError}) => (
    <div className={styles.header}>
        <div className={styles.stratum}>Stratum</div>
        <div className={styles.area}>{relativeMarginOfError ? 'Relative margin of error (%)' : 'Margin of error (ha)'}</div>
        {/* <div className={styles.area}>Anticipated error ({relativeMarginOfError ? '%' : 'ha'})</div> */}
        <div className={styles.weight}>Samples</div>
    </div>
)

const Footer = ({sampleSize, marginOfError}) => {
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>Overall</div>
            <div className={styles.number}>{format.units(marginOfError)}</div>
            <div className={styles.number}>{renderInteger(sampleSize)}</div>
        </div>
    )
}

const Allocation = ({entry: {label, color, sampleSize, marginOfError}}) => {
    return (
        <div key={label} className={styles.row}>
            <div className={styles.color}>
                <ColorElement color={color}/>
            </div>
            <div className={styles.label}>{label}</div>
            <div className={styles.number}></div>
            {/* <div className={styles.number}>{format.units(marginOfError)}</div> */}
            <div className={styles.number}>{renderInteger(sampleSize)}</div>
        </div>
    )
}

const renderInteger = value =>
    isNaN(value)
        ? <div className={styles.nan}>NaN</div>
        : format.integer(value)
