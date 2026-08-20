import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {
    effectiveMinSamplesPerStratum as sharedEffectiveMinSamplesPerStratum,
    isValidStratumSampleSize,
    MIN_SAMPLES_PER_STRATUM,
    minimumTotalSampleSize,
    usesConfiguredMinSamplesPerStratum
} from '#sepal/recipe/samplingDesign/minSamples'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import {allocationOutcome, isPositiveIntegerSampleSize, marginOfErrorFor, reconcileManualAllocation} from '../../sampling/allocationOutcome'
import {allocationStrata, orderedStratumKeys, stratumKey} from '../../sampling/designModel'
import {isValidConfidenceLevel, isValidPowerTuningConstant} from '../../sampling/numericRanges'
import {AllocationTable} from './allocationTable'
import styles from './sampleAllocation.module.css'
import {shouldDeferFixedSampleSizeAllocation} from './sampleAllocationState'

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
        .number()
        .predicate(isValidConfidenceLevel,
            'process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.range'),
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
    allocationStrategy: new Form.Field(),
    minSamplesPerStratum: new Form.Field()
        .skip((_minSamplesPerStratum, {manual, allocationStrategy}) => !usesConfiguredMinSamplesPerStratum({allocationStrategy, manual}))
        .notBlank()
        .int()
        .min(MIN_SAMPLES_PER_STRATUM),
    powerTuningConstant: new Form.Field()
        .skip((_powerTuningConstant, {manual, allocationStrategy}) => manual.length || allocationStrategy !== 'POWER')
        .notBlank()
        .number()
        .predicate(isValidPowerTuningConstant,
            'process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.range'),
    allocation: new Form.Field()
        .notBlank()
}

// Strategies without a configurable minimum still floor at the statistical minimum; the rest raise it to the
// configured value. The policy itself lives in the shared contract.
const effectiveMinSamplesPerStratum = ({allocationStrategy, minSamplesPerStratum}) =>
    sharedEffectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum})

const enoughSamplesToCoverMin = ({sampleSize, minSamplesPerStratum, allocationStrategy, allocation}) => {
    if (!isPositiveIntegerSampleSize(sampleSize) || !allocation) {
        return true
    }
    const min = effectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum})
    return minimumTotalSampleSize({effectiveMinimum: min, strataCount: allocation.length}) <= sampleSize
}

// Active in every mode (NestedForms only propagates a row's error after that row updates, so the parent
// needs its own guard): every allocation row must carry a valid integer sample size. Margin of error is
// optional - null/blank when proportions are skipped or it isn't displayed - but must be finite when
// present. The not-enough-samples case is reported by the dedicated `enoughSamples` constraint, so it's
// deferred here rather than double-flagged as "too big".
const allOutcomesFinite = ({manual, estimateSampleSize, allocation, sampleSize, minSamplesPerStratum, allocationStrategy, marginOfError}) => {
    const marginFinite = marginOfError == null || marginOfError === '' || Number.isFinite(Number(marginOfError))
    if (!marginFinite) {
        return false
    }
    if (shouldDeferFixedSampleSizeAllocation({manual, estimateSampleSize, sampleSize})) {
        return true
    }
    if (!manual?.length && !estimateSampleSize && sampleSize && !enoughSamplesToCoverMin({allocation, sampleSize, minSamplesPerStratum, allocationStrategy})) {
        return true
    }
    return !allocation || allocation.every(({sampleSize}) => isValidStratumSampleSize(sampleSize))
}

const constraints = {
    noNaN: new Form.Constraint(['manual', 'estimateSampleSize', 'sampleSize', 'marginOfError', 'allocationStrategy', 'allocation'])
        .predicate(allOutcomesFinite,
            'process.samplingDesign.panel.sampleAllocation.form.allocation.tooBig'
        ),
    // The min-samples field is hidden in manual mode, so don't enforce it there. EQUAL allocation keeps the
    // guard: every stratum still needs the statistical minimum (total >= 2 * number of strata), so a
    // too-small total must be rejected rather than producing a non-finite allocation.
    enoughSamples: new Form.Constraint(['sampleSize', 'minSamplesPerStratum'])
        .skip(({manual}) => manual?.length)
        .predicate(enoughSamplesToCoverMin,
            'process.samplingDesign.panel.sampleAllocation.form.sampleSize.notEnough'
        ),
}

class _SampleAllocation extends React.Component {
    state = {
        sampleSizeBlurred: false
    }

    constructor(props) {
        super(props)
        this.updateMarginOfError = this.updateMarginOfError.bind(this)
        this.onSampleSizeBlur = this.onSampleSizeBlur.bind(this)
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
        const sampleSizeErrorMessage = this.state.sampleSizeBlurred
            ? [sampleSize, 'enoughSamples', 'noNaN']
            : undefined

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
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.tooltip')
                    },
                    {
                        value: false,
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.tooltip'),
                    }
                ]}
            />
        )
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.sampleAllocation.form.target.label')}
                labelButtons={noProportions ? [] : [estimateSampleSizeButtons]}
                placeholder={msg(estimateSampleSize.value
                    ? 'process.samplingDesign.panel.sampleAllocation.form.marginOfError.placeholder'
                    : 'process.samplingDesign.panel.sampleAllocation.form.sampleSize.placeholder')}
                tooltip={msg(estimateSampleSize.value
                    ? 'process.samplingDesign.panel.sampleAllocation.form.marginOfError.tooltip'
                    : 'process.samplingDesign.panel.sampleAllocation.form.sampleSize.tooltip')}
                input={estimateSampleSize.value ? marginOfError : sampleSize}
                autoFocus={!this.isManual()}
                errorMessage={estimateSampleSize.value
                    ? [marginOfError, 'noNaN']
                    : sampleSizeErrorMessage}
                onBlur={estimateSampleSize.value ? undefined : this.onSampleSizeBlur}
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
                errorMessage={confidenceLevel}
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
        const {inputs: {manual, minSamplesPerStratum, allocationStrategy}} = this.props
        const disabled = !usesConfiguredMinSamplesPerStratum({allocationStrategy: allocationStrategy.value, manual: manual.value})
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
        const {noProportions, inputs: {allocation, marginOfError}} = this.props
        const sampleSize = allocation.value
            ? _.sum(allocation.value.map(({sampleSize}) => parseInt(sampleSize)))
            : 0
        return (
            <Widget
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocation.label')}>
                {allocation.value
                    ? <AllocationTable
                        allocation={allocation}
                        strata={this.joinedStrata()}
                        sampleSize={sampleSize}
                        marginOfError={marginOfError.value}
                        manual={this.isManual()}
                        noProportions={noProportions}
                        onChange={() => setImmediate(this.updateMarginOfError)}
                    />
                    : <NoData
                        alignment='left'
                        message={msg('process.samplingDesign.panel.sampleAllocation.form.noData')}
                    />}
                
            </Widget>
        )
    }

    componentDidMount() {
        const {strata, noProportions, inputs: {requiresUpdate, manual, estimateSampleSize, confidenceLevel, marginOfError, minSamplesPerStratum, allocationStrategy, powerTuningConstant, allocation}} = this.props
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
        // With proportions, variance-aware OPTIMAL is the sensible default; without, only the
        // proportion-free strategies are valid.
        if (this.hasProportions()) {
            allocationStrategy.value || allocationStrategy.set('OPTIMAL')
        } else {
            ['EQUAL', 'PROPORTIONAL', 'BALANCED'].includes(allocationStrategy.value) || allocationStrategy.set('BALANCED')
        }
        minSamplesPerStratum.value || minSamplesPerStratum.set(String(MIN_SAMPLES_PER_STRATUM))
        allocationStrategy.value || allocationStrategy.set('EQUAL')
        powerTuningConstant.value || powerTuningConstant.set('0.5')

        // Reconciled rather than rebuilt: a manual count the user already entered survives reopening the
        // panel after the strata changed underneath it.
        const stratumKeys = orderedStratumKeys(this.designModel())
        if (!_.isEqual(stratumKeys, allocation.value?.map(stratumKey) || null)) {
            allocation.set(reconcileManualAllocation({allocation: allocation.value, stratumKeys}))
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
            const updatedAllocation = allocation.value.map(entry =>
                ({stratum: stratumKey(entry), sampleSize: entry.sampleSize || MIN_SAMPLES_PER_STRATUM}))
            allocation.set(updatedAllocation)
            setImmediate(() => this.updateMarginOfError())
        } else {
            setImmediate(() => this.allocate())
        }
    }

    onSampleSizeBlur() {
        this.setState({sampleSizeBlurred: true})
    }

    // Null without proportions: there is no overall proportion for the margin to be relative to, so it
    // neither displays nor affects validity.
    updateMarginOfError() {
        const {inputs: {marginOfError}} = this.props
        marginOfError.set(marginOfErrorFor(this.designModel()))
    }
        
    // The arithmetic itself is shared with the semantic planner, so an allocation recomputed with this panel
    // closed is the same allocation the panel would have produced with it open.
    allocate() {
        if (this.isManual()) {
            return
        }
        const {inputs: {allocation, sampleSize, marginOfError}} = this.props
        const outcome = allocationOutcome(this.designModel())
        allocation.set(outcome.allocation)
        if ('sampleSize' in outcome) {
            sampleSize.set(outcome.sampleSize)
        }
        if ('marginOfError' in outcome) {
            marginOfError.set(outcome.marginOfError)
        }
    }

    // The panel edits form values while the recipe model still holds the applied ones, so every shared pure
    // function is given the design as it would be if these values were applied.
    designModel() {
        const {strata, noProportions, anticipatedProportions, inputs} = this.props
        return {
            stratification: {strata},
            proportions: {skip: noProportions, anticipatedProportions},
            sampleAllocation: _.mapValues(_.pick(inputs, [
                'manual', 'estimateSampleSize', 'sampleSize', 'marginOfError', 'confidenceLevel',
                'allocationStrategy', 'minSamplesPerStratum', 'powerTuningConstant', 'allocation'
            ]), input => input.value)
        }
    }

    // Authoritative on the proportions panel's skip flag - never infer mode from anticipatedProportions
    // truthiness alone (it can be stale/empty across mode switches).
    hasProportions() {
        const {noProportions, anticipatedProportions} = this.props
        return !noProportions && !!anticipatedProportions?.length
    }

    // Stratification order, stratification presentation and weights, current proportion. Joined here rather
    // than read off the proportion rows, whose strata snapshot can predate the current stratification.
    joinedStrata() {
        return allocationStrata(this.designModel())
    }

    isManual() {
        const {inputs: {manual}} = this.props
        return manual.value?.length
    }
}

const allocateDeps = props => {
    const {inputs: {estimateSampleSize, sampleSize, marginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant}} = props
    return [estimateSampleSize?.value ? marginOfError : sampleSize, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant]
        .map(input => input?.value)
}

// Drop any stale relativeMarginOfError (an unreleased absolute/relative toggle) so the panel writes the
// canonical model; margins are always relative.
const valuesToModel = ({relativeMarginOfError: _relativeMarginOfError, ...values}) => values

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
