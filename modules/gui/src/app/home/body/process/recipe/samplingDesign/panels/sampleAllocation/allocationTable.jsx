import _ from 'lodash'

import format from '~/format'
import {msg} from '~/translate'
import {ColorElement} from '~/widget/colorElement'
import {NestedForms} from '~/widget/form/nestedForms'
import {Tooltip} from '~/widget/tooltip'

import {byStratumKey, stratumView} from '../../sampling/designModel'
import {AllocationForm} from './allocationForm'
import styles from './allocationTable.module.css'

// Presentation is passed BESIDE the row, never merged into it. A nested form writes its entity straight back
// into the persisted array, so anything merged in here would be persisted as part of the allocation - which
// is exactly the joined row this recipe stopped writing. The join is the shared owner-first one, keyed on
// `stratum ?? value` from both sides: a lookup that missed would silently fall through to the row's cached
// copy and show a label the stratification has already replaced.
export const AllocationTable = ({allocation, strata, sampleSize, marginOfError, manual, noProportions, onChange}) => {
    const owners = byStratumKey(strata)
    const presentationOf = entry => stratumView(owners, entry)
    return (
        <div className={styles.allocation}>
            <NestedForms arrayInput={allocation} idPropName='stratum'>
                <Header noProportions={noProportions}/>
                {allocation.value.map((entry, index) => manual
                    ? (
                        <AllocationForm
                            key={entry.stratum}
                            // Ensure the row carries a `sampleSize` key before the nested form mounts:
                            // withNestedForm only propagates fields already present on the entity, so a
                            // strata-built row (unstratified/no-proportions) without it would never write
                            // the typed value back to the parent. Blank keeps Apply disabled until the user
                            // enters a count; an existing value is preserved.
                            entry={{sampleSize: '', ...entry}}
                            presentation={presentationOf(entry)}
                            autoFocus={manual && index === 0}
                            onChange={onChange}
                        />
                    )
                    : (
                        <Allocation
                            key={entry.stratum}
                            entry={entry}
                            presentation={presentationOf(entry)}
                        />
                    )
                )}
                <Footer
                    sampleSize={sampleSize}
                    marginOfError={parseFloat(marginOfError)}
                    noProportions={noProportions}/>
            </NestedForms>
        </div>
    )
}

const Header = ({noProportions}) => (
    <div className={styles.header}>
        <div className={styles.stratum}/>
        <div className={styles.area}>{noProportions ? '' : msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.relativeMarginOfError')}</div>
        <Tooltip msg={msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.samplesTooltip')}>
            <div className={styles.weight}>{msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.samples')}</div>
        </Tooltip>
    </div>
)

const Footer = ({sampleSize, marginOfError, noProportions}) => {
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>{msg('process.samplingDesign.panel.sampleAllocation.form.allocation.table.overall')}</div>
            <div className={styles.number}>{noProportions ? '' : renderMaginOfError(marginOfError)}</div>
            <div className={styles.number}>{renderSampleSize(sampleSize)}</div>
        </div>
    )
}

const Allocation = ({entry: {sampleSize}, presentation: {label, color}}) => {
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
    sampleSize == null || sampleSize === ''
        ? ''
        : !isFinite(sampleSize)
            ? <div className={styles.nan}>NaN</div>
            : format.integer(sampleSize)

const renderMaginOfError = marginOfError =>
    _.isNil(marginOfError) || !isFinite(marginOfError)
        ? <div className={styles.nan}>NaN</div>
        : `${smartRound(marginOfError)}%`

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
