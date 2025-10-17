import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {NestedForms} from '~/widget/form/nestedForms'

import {AllocationForm} from './allocationForm'
import styles from './allocationTable.module.css'

export const AllocationTable = ({allocation, sampleSize, marginOfError, relativeMarginOfError, manual, noProportions, onChange}) => {
    return (
        <div className={styles.allocation}>
            <NestedForms arrayInput={allocation} idPropName='stratum'>
                <Header relativeMarginOfError={relativeMarginOfError} noProportions={noProportions}/>
                {allocation.value.map(entry => manual
                    ? (
                        <AllocationForm
                            key={entry.stratum}
                            entry={entry}
                            relativeMarginOfError={relativeMarginOfError}
                            onChange={onChange}
                        />
                    )
                    : (
                        <Allocation
                            key={entry.stratum}
                            entry={entry}
                            relativeMarginOfError={relativeMarginOfError}
                        />
                    )
                )}
                <Footer
                    sampleSize={sampleSize}
                    marginOfError={parseFloat(marginOfError)}
                    noProportions={noProportions}
                    relativeMarginOfError={relativeMarginOfError}/>
            </NestedForms>
        </div>
    )
}

// TODO: Use msg for header
const Header = ({relativeMarginOfError, noProportions}) => (
    <div className={styles.header}>
        <div className={styles.stratum}/>
        <div className={styles.area}>{noProportions ? '' : relativeMarginOfError ? 'Relative margin of error' : 'Margin of error (ha)'}</div>
        <div className={styles.weight}>Samples</div>
    </div>
)

const Footer = ({sampleSize, marginOfError, relativeMarginOfError, noProportions}) => {
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>Overall</div>
            <div className={styles.number}>{noProportions ? '' : renderMaginOfError({marginOfError, relativeMarginOfError})}</div>
            <div className={styles.number}>{renderSampleSize(sampleSize)}</div>
        </div>
    )
}

const Allocation = ({entry: {label, color, sampleSize}}) => {
    return (
        <div className={styles.row}>
            <div className={styles.color}>
                <ColorElement color={color}/>
            </div>
            <div className={styles.label}>{label}</div>
            <div/>
            <div className={styles.number}>{renderSampleSize(sampleSize)}</div>
        </div>
    )
}

const renderSampleSize = sampleSize =>
    isNaN(sampleSize)
        ? <div className={styles.nan}>NaN</div>
        : format.integer(sampleSize)

const renderMaginOfError = ({marginOfError, relativeMarginOfError}) =>
    isNaN(marginOfError) || _.isNil(marginOfError)
        ? <div className={styles.nan}>NaN</div>
        : `${smartRound(marginOfError)}${relativeMarginOfError ? '%' : ''}`

function smartRound(num) {
    if (num === 0) return 0
    const abs = Math.abs(num)
    const basePrecision = 2
    const rounded = Number(num.toFixed(basePrecision))
    if (rounded !== 0) return rounded

    const extraPrecision = Math.ceil(-Math.log10(abs))
    const totalPrecision = Math.min(extraPrecision + 1, 15)

    return Number(num.toFixed(totalPrecision))
}
