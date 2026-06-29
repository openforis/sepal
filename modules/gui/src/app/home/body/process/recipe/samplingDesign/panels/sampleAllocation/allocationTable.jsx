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
                {allocation.value.map((entry, index) => manual
                    ? (
                        <AllocationForm
                            key={entry.stratum}
                            // Ensure the row carries a `sampleSize` key before the nested form mounts:
                            // withNestedForm only propagates fields already present on the entity, so a
                            // strata-built row (unstratified/no-proportions) without it would never write
                            // the typed value back to the parent. Blank (not 1) keeps Apply disabled until
                            // the user enters a count; an existing value is preserved.
                            entry={{sampleSize: '', ...entry}}
                            relativeMarginOfError={relativeMarginOfError}
                            autoFocus={manual && index === 0}
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

const Header = ({relativeMarginOfError, noProportions}) => (
    <div className={styles.header}>
        <div className={styles.stratum}/>
        <div className={styles.area}>{noProportions ? '' : relativeMarginOfError ? msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.relativeMarginOfError') : msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.marginOfError')}</div>
        <div className={styles.weight}>{msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.samples')}</div>
    </div>
)

const Footer = ({sampleSize, marginOfError, relativeMarginOfError, noProportions}) => {
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>{msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.overall')}</div>
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
    !isFinite(sampleSize)
        ? <div className={styles.nan}>NaN</div>
        : format.integer(sampleSize)

const renderMaginOfError = ({marginOfError, relativeMarginOfError}) =>
    _.isNil(marginOfError) || !isFinite(marginOfError)
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
