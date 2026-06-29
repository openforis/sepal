import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import {allocate} from '../../sampling/allocate'
import {calculateBounds} from '../../sampling/confidenceInterval'
import {boundsToMarginOfError, calculateMarginOfError} from '../../sampling/marginOfError'
import {calculateSampleSize} from '../../sampling/sampleSize'
import {AllocationTable} from './allocationTable'
import styles from './sampleAllocation.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.skip'),
    strata: selectFrom(recipe, 'model.stratification.strata'),
    noProportions: selectFrom(recipe, 'model.proportions.skip'),
    anticipatedProportions: selectFrom(recipe, 'model.proportions.anticipatedProportions')
})

const fields = {
    requiresUpdate: new Form.Field(),
    manual: new Form.Field(),
    estimateSampleSize: new Form.Field(),
    confidenceLevel: new Form.Field()
        .skip((_confidenceLevel, {manual}) => manual.length)
        .notBlank()
        .max(100)
        .number(),
    sampleSize: new Form.Field()
        .skip((_sampleSize, {manual, estimateSampleSize}) => manual.length || estimateSampleSize)
        .notBlank()
        .min(1)
        .int(),
    marginOfError: new Form.Field()
        .skip((_marginOfError, {manual, estimateSampleSize}) => manual.length || !estimateSampleSize)
        .notBlank()
        .greaterThan(0)
        .number(),
    relativeMarginOfError: new Form.Field(),
    allocationStrategy: new Form.Field(),
    minSamplesPerStratum: new Form.Field()
        .skip((_minSamplesPerStratum, {manual, allocationStrategy}) => manual.length || allocationStrategy === 'EQUAL')
        .notBlank()
        .min(0),
    powerTuningConstant: new Form.Field()
        .skip((_powerTuningConstant, {manual, allocationStrategy}) => manual.length || allocationStrategy !== 'POWER')
        .notBlank()
        .number(),
    allocation: new Form.Field()
        .notBlank()
}

// EQUAL hides/disables the min-samples field, but the allocator still needs at least one sample per
// stratum - so EQUAL enforces a minimum of 1 regardless of the (hidden) field value. Other strategies
// honor the configured minimum.
const effectiveMinSamplesPerStratum = ({allocationStrategy, minSamplesPerStratum}) =>
    allocationStrategy === 'EQUAL'
        ? 1
        : (minSamplesPerStratum ? parseInt(minSamplesPerStratum) : 0)

const enoughSamplesToCoverMin = ({sampleSize, minSamplesPerStratum, allocationStrategy, allocation}) => {
    if (!sampleSize || !allocation) {
        return true
    }
    const min = effectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum})
    return !min || min * allocation.length <= sampleSize
}

// Mirrors the nested row validator (.notBlank().int().min(0)): a valid sample size is a non-empty,
// non-negative integer.
const isValidSampleSize = value =>
    value != null && value !== '' && /^\d+$/.test(String(value))

// Active in every mode (NestedForms only propagates a row's error after that row updates, so the parent
// needs its own guard): every allocation row must carry a valid integer sample size. Margin of error is
// optional - null/blank when proportions are skipped or it isn't displayed - but must be finite when
// present. The not-enough-samples case is reported by the dedicated `enoughSamples` constraint, so it's
// deferred here rather than double-flagged as "too big".
const allOutcomesFinite = ({allocation, sampleSize, minSamplesPerStratum, allocationStrategy, marginOfError}) => {
    const marginFinite = marginOfError == null || marginOfError === '' || Number.isFinite(Number(marginOfError))
    if (!marginFinite) {
        return false
    }
    if (sampleSize && !enoughSamplesToCoverMin({allocation, sampleSize, minSamplesPerStratum, allocationStrategy})) {
        return true
    }
    return !allocation || allocation.every(({sampleSize}) => isValidSampleSize(sampleSize))
}

const constraints = {
    noNaN: new Form.Constraint(['marginOfError', 'relativeMarginOfError', 'allocationStrategy', 'allocation'])
        .predicate(allOutcomesFinite,
            'process.samplingDesign.panel.sampleAllocation.form.allocation.tooBig'
        ),
    // The min-samples field is hidden in manual mode, so don't enforce it there. EQUAL allocation keeps
    // the guard: the allocator still requires at least one sample per stratum (sample size >= number of
    // strata), so a too-small total must be rejected rather than producing a non-finite allocation.
    enoughSamples: new Form.Constraint(['sampleSize', 'minSamplesPerStratum'])
        .skip(({manual}) => manual?.length)
        .predicate(enoughSamplesToCoverMin,
            'process.samplingDesign.panel.sampleAllocation.form.sampleSize.notEnough'
        ),
}

class _SampleAllocation extends React.Component {
    constructor(props) {
        super(props)
        this.updateMarginOfError = this.updateMarginOfError.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='chart-column'
                    label={this.renderHeaderButtons()}
                    title={msg('process.samplingDesign.panel.sampleAllocation.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderHeaderButtons() {
        const {strata, inputs: {manual}} = this.props
        return (
            <Form.Buttons
                input={manual}
                disabled={strata.length <= 1}
                options={[
                    {
                        value: true,
                        icon: 'rectangle-list',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.manual.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.manual.tooltip'),
                    },
                ]}
                multiple
                onChange={manual => this.onManualToggled(manual.length)}
            />
        )
    }

    renderContent() {
        const {noProportions, inputs: {allocationStrategy}} = this.props
        const usingPowerAllocation = allocationStrategy.value === 'POWER'
        return (
            <Layout>
                {this.isManual() ? null : (
                    <Layout type='horizontal'>
                        <div className={styles.left}>
                            {this.renderTarget()}
                        </div>
                        <div className={styles.right}>
                            {noProportions ? null : this.renderConfidenceLevel()}
                        </div>
                    </Layout>
                )}
                
                {this.isManual() ? null : this.renderAllocationStrategy()}
                
                {this.isManual() ? null : (
                    <Layout type='horizontal'>
                        <div className={styles.left}>
                            {this.renderMinSamplesPerStratum()}
                        </div>
                        <div className={styles.right}>
                            {usingPowerAllocation ? this.renderPowerTuningConstant() : null}
                        </div>
                    </Layout>
                )}
                {this.renderAllocation()}
            </Layout>
        )
    }

    renderTarget() {
        const {noProportions, inputs: {estimateSampleSize, sampleSize, marginOfError}} = this.props
        // TODO: Update messages -> target

        const estimateSampleSizeButtons = (
            <Form.Buttons
                key='estimateSampleSize'
                spacing='none'
                groupSpacing='none'
                size='x-small'
                shape='pill'
                input={estimateSampleSize}
                options={[
                    {
                        value: true,
                        label: msg('Error'),
                        // label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.tooltip')
                    },
                    {
                        value: false,
                        label: msg('Samples'),
                        // label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.tooltip'),
                    }
                ]}
            />
        )
        return (
            <Form.Input
                label={msg('Target')}
                labelButtons={noProportions ? [] : [estimateSampleSizeButtons]}
                placeholder={msg(estimateSampleSize.value ? 'Margin of Error...' : 'Sample size...')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.marginOfError.tooltip')}
                input={estimateSampleSize.value ? marginOfError : sampleSize}
                autoFocus={!this.isManual()}
                errorMessage={estimateSampleSize.value
                    ? [marginOfError, 'noNaN']
                    : [sampleSize, 'enoughSamples', 'noNaN']}
                validate='onChange'
                type='number'
                suffix={estimateSampleSize.value ? '%' : undefined}
            />
        )
    }

    renderConfidenceLevel() {
        const {inputs: {confidenceLevel}} = this.props
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.tooltip')}
                input={confidenceLevel}
                type='number'
                errorMessage={[confidenceLevel, 'noNaN']}
                suffix={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.suffix')}
            />
        )
    }

    renderAllocationStrategy() {
        const {noProportions, inputs: {allocationStrategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.label')}
                input={allocationStrategy}
                options={[
                    {
                        value: 'PROPORTIONAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.PROPORTIONAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.PROPORTIONAL.tooltip'),
                    },
                    {
                        value: 'EQUAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.EQUAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.EQUAL.tooltip'),
                    },
                    {
                        value: 'BALANCED',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.BALANCED.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.BALANCED.tooltip'),
                    },
                    {
                        value: 'OPTIMAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.OPTIMAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.OPTIMAL.tooltip'),
                        disabled: noProportions
                    },
                    {
                        value: 'POWER',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.POWER.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.POWER.tooltip'),
                        disabled: noProportions
                    },
                ]}
            />
        )
    }

    renderMinSamplesPerStratum() {
        const {inputs: {minSamplesPerStratum, allocationStrategy}} = this.props
        const disabled = allocationStrategy.value === 'EQUAL'
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.tooltip')}
                input={minSamplesPerStratum}
                errorMessage={disabled ? undefined : [minSamplesPerStratum, 'enoughSamples']}
                type='number'
                disabled={disabled}
            />
        )
    }

    renderPowerTuningConstant() {
        const {inputs: {powerTuningConstant}} = this.props
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.tooltip')}
                input={powerTuningConstant}
                type='number'
            />
        )
    }

    renderAllocation() {
        const {noProportions, inputs: {allocation, marginOfError, relativeMarginOfError}} = this.props
        const sampleSize = allocation.value
            ? _.sum(allocation.value.map(({sampleSize}) => parseInt(sampleSize)))
            : 0
        return (
            <Widget
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocation.label')}>
                {allocation.value
                    ? <AllocationTable
                        allocation={allocation}
                        sampleSize={sampleSize}
                        marginOfError={marginOfError.value}
                        relativeMarginOfError={relativeMarginOfError.value}
                        manual={this.isManual()}
                        noProportions={noProportions}
                        onChange={() => setImmediate(this.updateMarginOfError)}
                    />
                    : <NoData
                        alignment='left'
                        message={msg('Select ... something')}
                    />}
                
            </Widget>
        )
    }

    componentDidMount() {
        const {strata, noProportions, inputs: {requiresUpdate, manual, estimateSampleSize, confidenceLevel, marginOfError, relativeMarginOfError, minSamplesPerStratum, allocationStrategy, powerTuningConstant, allocation}} = this.props
        requiresUpdate.set(false)
        if (strata.length === 1) {
            manual.set([true])
        } else {
            manual.value || manual.set([])
        }
        // Without proportions there is no margin-of-error target to estimate a sample size from, so force
        // the fixed-sample-size mode (and don't leave a stale `true` that would require a blank margin).
        if (noProportions) {
            estimateSampleSize.set(false)
        } else {
            estimateSampleSize.value || estimateSampleSize.set(false)
        }
        confidenceLevel.value || confidenceLevel.set(95)
        // Clear any stale margin of error up front when proportions are skipped (not only after a row
        // edit); there is no margin of error to display or validate without proportions.
        if (noProportions) {
            marginOfError.set(null)
        } else {
            marginOfError.value || marginOfError.set(50)
        }
        // Default to relative only when unset; a saved explicit `false` (absolute) must be preserved.
        if (relativeMarginOfError.value === '' || relativeMarginOfError.value == null) {
            relativeMarginOfError.set(true)
        }
        // With proportions, variance-aware OPTIMAL is the sensible default; without, only the
        // proportion-free strategies are valid.
        if (this.hasProportions()) {
            allocationStrategy.value || allocationStrategy.set('OPTIMAL')
        } else {
            ['EQUAL', 'PROPORTIONAL', 'BALANCED'].includes(allocationStrategy.value) || allocationStrategy.set('BALANCED')
        }
        minSamplesPerStratum.value || minSamplesPerStratum.set('1')
        allocationStrategy.value || allocationStrategy.set('EQUAL')
        powerTuningConstant.value || powerTuningConstant.set('0.5')

        const expectedStrata = strata.map(({value}) => value)
        const actualStrata = allocation.value
            ? allocation.value?.map(({stratum}) => stratum)
            : null
        if (!_.isEqual(expectedStrata, actualStrata)) {
            allocation.set(this.allocationStrata())
        }
        setImmediate(() => this.allocate())
    }
    
    componentDidUpdate(prevProps) {
        if (!_.isEqual(allocateDeps(prevProps), allocateDeps(this.props))) {
            this.allocate()
        }
    }

    onManualToggled(manual) {
        const {inputs: {allocation}} = this.props
        if (manual) {
            const updatedAllocation = allocation.value.map(entry => ({...entry, sampleSize: entry.sampleSize || 1}))
            allocation.set(updatedAllocation)
            setImmediate(() => this.updateMarginOfError())
        } else {
            setImmediate(() => this.allocate())
        }
    }

    updateMarginOfError() {
        const {inputs: {allocation, marginOfError, relativeMarginOfError, confidenceLevel}} = this.props
        if (!this.hasProportions()) {
            // No proportions: there is no margin of error to derive (rows carry no `proportion`). Clear it
            // so it neither displays nor affects validity, and never call calculateBounds here.
            marginOfError.set(null)
            return
        }
        const bounds = calculateBounds({
            confidenceLevel: confidenceLevel.value / 100,
            allocation: allocation.value.map(entry => ({...entry, sampleSize: parseInt(entry.sampleSize)}))
        })
        const calculatedMarginOfError = boundsToMarginOfError({bounds, relative: relativeMarginOfError.value})
        const updatedMarginOfError = relativeMarginOfError.value ? calculatedMarginOfError * 100 : calculatedMarginOfError
        marginOfError.set(updatedMarginOfError)
    }
        
    allocate() {
        const {inputs: {estimateSampleSize, sampleSize, marginOfError, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant, allocation}} = this.props
        if (this.isManual()) {
            return
        }
        const hasProportions = this.hasProportions()
        const strata = this.allocationStrata()
        // EQUAL ignores the hidden min-samples field and uses a floor of one sample per stratum.
        const minSamples = effectiveMinSamplesPerStratum({
            allocationStrategy: allocationStrategy.value,
            minSamplesPerStratum: minSamplesPerStratum.value
        })
        const updateAllocation = sampleSize => {
            const calculatedAllocation = allocate({
                sampleSize: parseInt(sampleSize),
                strategy: allocationStrategy.value,
                minSamplesPerStratum: minSamples,
                strata,
                tuningConstant: parseFloat(powerTuningConstant.value)
            })
            allocation.set(calculatedAllocation)
        }
        if (estimateSampleSize.value && hasProportions) {
            const calculatedSampleSize = calculateSampleSize({
                marginOfError: relativeMarginOfError.value ? parseFloat(marginOfError.value) / 100 : parseFloat(marginOfError.value),
                relativeMarginOfError: relativeMarginOfError.value,
                strategy: allocationStrategy.value,
                minSamplesPerStratum: minSamples,
                strata,
                tuningConstant: parseFloat(powerTuningConstant.value),
                confidenceLevel: parseFloat(confidenceLevel.value) / 100
            })
            sampleSize.set(calculatedSampleSize)
            updateAllocation(calculatedSampleSize)
        } else {
            if (sampleSize.value < minSamples * allocation.value.length) {
                const undefinedAllocation = allocation.value.map(stratum => ({
                    ...stratum,
                    sampleSize: NaN
                }))
                allocation.set(undefinedAllocation)
                marginOfError.set(null)
            } else if (hasProportions) {
                const calculatedMarginOfError = calculateMarginOfError({
                    sampleSize: parseInt(sampleSize.value),
                    relativeMarginOfError: relativeMarginOfError.value,
                    confidenceLevel: parseFloat(confidenceLevel.value) / 100,
                    strategy: allocationStrategy.value,
                    minSamplesPerStratum: minSamples,
                    strata,
                    tuningConstant: parseFloat(powerTuningConstant.value)
                })
                const updatedMarginOfError = relativeMarginOfError.value ? calculatedMarginOfError * 100 : calculatedMarginOfError
                marginOfError.set(updatedMarginOfError)
                updateAllocation(sampleSize.value)
            } else {
                marginOfError.set(null)
                updateAllocation(sampleSize.value)
            }
        }
    }

    // Authoritative on the proportions panel's skip flag - never infer mode from anticipatedProportions
    // truthiness alone (it can be stale/empty across mode switches).
    hasProportions() {
        const {noProportions, anticipatedProportions} = this.props
        return !noProportions && !!anticipatedProportions?.length
    }

    // Rows to allocate over: the proportion view when proportions exist, otherwise the bare strata.
    allocationStrata() {
        const {strata, anticipatedProportions} = this.props
        return this.hasProportions()
            ? anticipatedProportions
            : strata.map(stratum => ({...stratum, stratum: stratum.value}))
    }

    isManual() {
        const {inputs: {manual}} = this.props
        return manual.value?.length
    }
}

const allocateDeps = props => {
    const {inputs: {estimateSampleSize, sampleSize, marginOfError, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant}} = props
    return [estimateSampleSize?.value ? marginOfError : sampleSize, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant]
        .map(input => input?.value)
}

const valuesToModel = values => {
    return values
}

const modelToValues = model => {
    return model
}

export const SampleAllocation = compose(
    _SampleAllocation,
    recipeFormPanel({id: 'sampleAllocation', fields, constraints, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleAllocation.propTypes = {
    recipeId: PropTypes.string
}
