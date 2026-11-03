import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {readsProportions} from '#sepal/recipe/samplingDesign/allocationStrategy'
import {
    effectiveMinSamplesPerStratum as sharedEffectiveMinSamplesPerStratum,
    isManualAllocation,
    isValidStratumSampleSize,
    MIN_SAMPLES_PER_STRATUM,
    minimumTotalSampleSize,
    usesConfiguredMinSamplesPerStratum
} from '#sepal/recipe/samplingDesign/minSamples'
import {isProportionsSkipped} from '#sepal/recipe/samplingDesign/proportionsSkip'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import {effectiveAllocationStrategy, isPositiveIntegerSampleSize} from '../../sampling/allocationOutcome'
import {getDefaultSampleAllocation} from '../../sampling/defaultModel'
import {allocationStrata, stratumKey} from '../../sampling/designModel'
import {isValidConfidenceLevel, isValidMarginOfError, isValidPowerTuningConstant} from '../../sampling/numericRanges'
import {AllocationTable} from './allocationTable'
import styles from './sampleAllocation.module.css'
import {shouldDeferFixedSampleSizeAllocation} from './sampleAllocationState'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.skip'),
    strata: selectFrom(recipe, 'model.stratification.strata'),
    noProportions: isProportionsSkipped(selectFrom(recipe, 'model.proportions')),
    anticipatedProportions: selectFrom(recipe, 'model.proportions.anticipatedProportions')
})

const fields = {
    // Saved by a client of the previous release, false included, beside counts it may have replaced: kept until the
    // allocation is derived again here (derivations.js). An allocation without it reads '', as the form gives any field
    // its model lacks.
    requiresUpdate: new Form.Field(),
    // What the counts and the uncertainty shown were derived from, captured as they are derived and applied with them
    // (#sepal/recipe/samplingDesign/allocationReview).
    reviewedInputs: new Form.Field(),
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
        // The first failing predicate supplies the message, so notBlank and number stay to name those two
        // cases; what the field will actually accept is the same rule that decides the target is missing.
        .notBlank()
        .number()
        .predicate(isValidMarginOfError, 'fieldValidation.greaterThan', () => ({minValue: 0})),
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

        // Shown with or without proportions, as the Target's label reads by it. Without them there is no margin of error
        // to solve a total from: the mode is fixed at Samples (modelToValues) and Error cannot be chosen.
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
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.tooltip'),
                        disabled: noProportions
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
                labelButtons={[estimateSampleSizeButtons]}
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
        // Order and wording are this panel's; whether an option can run is not. A strategy that reads
        // anticipated proportions has nothing to read in a design without them.
        const options = ['PROPORTIONAL', 'EQUAL', 'BALANCED', 'OPTIMAL', 'POWER'].map(value => ({
            value,
            label: msg(`process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.${value}.label`),
            tooltip: msg(`process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.${value}.tooltip`),
            disabled: noProportions && readsProportions(value)
        }))
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.label')}
                input={allocationStrategy}
                options={options}
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
                    />
                    : <NoData
                        alignment='left'
                        message={msg('process.samplingDesign.panel.sampleAllocation.form.noData')}
                    />}
                
            </Widget>
        )
    }

    // Counts entered by hand start from those shown, every stratum at least at the floor.
    onManualToggled(manual) {
        const {inputs: {allocation}} = this.props
        if (manual) {
            allocation.set(allocation.value.map(entry =>
                ({stratum: stratumKey(entry), sampleSize: entry.sampleSize || MIN_SAMPLES_PER_STRATUM})))
        }
    }

    onSampleSizeBlur() {
        this.setState({sampleSizeBlurred: true})
    }

    // Stratification order, stratification presentation and weights, current proportion. Joined here rather
    // than read off the proportion rows, whose strata snapshot can predate the current stratification.
    joinedStrata() {
        const {strata, noProportions, anticipatedProportions} = this.props
        return allocationStrata({stratification: {strata}, proportions: {skip: noProportions, anticipatedProportions}})
    }

    isManual() {
        const {inputs: {manual}} = this.props
        return manual.value?.length
    }
}

// Drop any stale relativeMarginOfError (an unreleased absolute/relative toggle) so the panel writes the
// canonical model; margins are always relative. The flag of an older client stays only while the draft has it.
const valuesToModel = ({relativeMarginOfError: _relativeMarginOfError, requiresUpdate, ...values}) => ({
    ...values,
    ...requiresUpdate !== undefined && requiresUpdate !== '' && {requiresUpdate}
})

// What the panel edits, resolved before anything is derived from it (derivations.js). A recipe saved before a setting
// existed opens on the defaults a new one starts with, taken from their single owner (defaultModel.js); a saved 0 is a
// value, not a blank. Manual is the form's toggle, however it was saved, and a single stratum is allocated by hand.
// Without proportions there is no margin of error to estimate a total from, display or validate, so the total is fixed
// and the margin cleared. One strategy decision, not a second opinion: what the recipe saved is kept, falling back to the
// default, and a strategy reading proportions is replaced where the design uses none - by applicability, not whether
// rows exist yet, which rows still being calculated must not change. No rows arrive as an empty list: the panel reads
// the allocation as rows from its first render on, while withForm gives a declared field the model lacks as ''.
const modelToValues = (model, {strata = [], noProportions} = {}) => {
    const defaults = getDefaultSampleAllocation()
    const saved = name => model?.[name] == null || model[name] === '' ? defaults[name] : model[name]
    return {
        ...model,
        manual: strata.length === 1 || isManualAllocation(model?.manual) ? [true] : [],
        estimateSampleSize: noProportions ? false : saved('estimateSampleSize'),
        confidenceLevel: saved('confidenceLevel'),
        marginOfError: noProportions ? null : saved('marginOfError'),
        allocationStrategy: effectiveAllocationStrategy({
            allocationStrategy: model?.allocationStrategy,
            proportionsApplicable: !noProportions,
            defaultStrategy: defaults.allocationStrategy
        }),
        minSamplesPerStratum: saved('minSamplesPerStratum'),
        powerTuningConstant: saved('powerTuningConstant'),
        allocation: Array.isArray(model?.allocation) ? model.allocation : []
    }
}

export const SampleAllocation = compose(
    _SampleAllocation,
    recipeFormPanel({id: 'sampleAllocation', fields, constraints, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleAllocation.propTypes = {
    recipeId: PropTypes.string
}
