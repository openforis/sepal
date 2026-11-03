import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {isProportionsSkipped} from '#sepal/recipe/samplingDesign/proportionsSkip'
import api from '~/apiRegistry'
import {recipeVisualizationsNaming} from '~/app/home/body/process/recipe/visualizations'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {inputFeedback} from '~/widget/form/inputFeedback'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {STRATUM_PROBABILITIES_CALCULATION} from '../../calculations'
import {awaitedResultFeedback, editedResultFeedback} from '../../freshnessRequirements'
import {isNumericClassValue, toClassOptions} from '../../sampling/categoricalLegend'
import {proportionsCoverStrata, reconcileManualProportions} from '../../sampling/designModel'
import {isValidOptionalProportionPercentage} from '../../sampling/numericRanges'
import {maxAnticipatedTargetProportion, smartRound, toProportions} from '../../sampling/proportionMath'
import {effectiveProportionsScale, proportionsScaleFromBand} from '../../samplingGridValidation'
import {AnticipationStrategy, ImageSelection, OverallProportionInput, ProportionsHeaderButtons, StrataProportion} from './proportionControls'
import styles from './proportions.module.css'
import {proportionsCalculationError as toProportionsCalculationError} from './proportionsError'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.skip'),
    stratificationScale: selectFrom(recipe, 'model.stratification.scale'),
    strata: selectFrom(recipe, 'model.stratification.strata')
})

const fields = {
    // Saved by an earlier version on manual answers whose strata changed: dropped from the draft as the panel reconciles
    // them, so applying them settles them.
    requiresUpdate: new Form.Field(),
    skip: new Form.Field(),
    manual: new Form.Field(),
    anticipationStrategy: new Form.Field(),
    type: new Form.Field(),
    assetId: new Form.Field()
        .skip((_value, {skip, manual, type}) =>
            skip.length || manual.length || type !== 'ASSET')
        .notBlank('process.samplingDesign.panel.proportions.form.asset.required'),
    recipeId: new Form.Field()
        .skip((_value, {skip, manual, type}) =>
            skip.length || manual.length || type !== 'RECIPE')
        .notBlank('process.samplingDesign.panel.proportions.form.recipe.required'),
    band: new Form.Field()
        .skip((_value, {skip, manual, type, assetId, recipeId}) =>
            skip.length
                || manual.length
                || (type === 'ASSET' && !assetId)
                || (type === 'RECIPE' && !recipeId))
        .notBlank('process.samplingDesign.panel.proportions.form.band.required'),
    targetClass: new Form.Field()
        .skip((_value, {skip, manual, anticipationStrategy}) =>
            skip.length || manual.length || anticipationStrategy !== 'CATEGORICAL')
        .notBlank('process.samplingDesign.panel.proportions.form.targetClass.required')
        .predicate(value => isNumericClassValue(value), 'process.samplingDesign.panel.proportions.form.targetClass.numeric'),
    percentage: new Form.Field(),
    // An optional OVERRIDE: blank means "use what this selection provides", which the placeholder shows. An
    // entered Scale still has to be a usable one - clearing the field asks for the default, typing 0 does not.
    scale: new Form.Field()
        .skip((_value, {skip, manual}) =>
            skip.length || manual.length)
        .number()
        .greaterThan(0),
    // Transient: the Scale this property-band selection defaults to, consolidated into the persisted Scale by
    // valuesToModel. Never part of the model.
    defaultScale: new Form.Field(),
    eeStrategy: new Form.Field(),
    anticipatedOverallProportion: new Form.Field()
        // Blank is valid (no override); a supplied value is a percentage.
        .predicate(isValidOptionalProportionPercentage,
            'process.samplingDesign.panel.proportions.form.proportion.range'),
    probabilityPerStratum: new Form.Field(),
    anticipatedProportions: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .notBlank('process.samplingDesign.panel.proportions.form.anticipatedProportions.required'),
    // What the probabilities were calculated from (#sepal/recipe/samplingDesign/stratumProbabilities), set with them and
    // only with them.
    probabilityPerStratumCalculatedFrom: new Form.Field(),
    // Saved by a client of the previous release, and so the probabilities beside it are not established by the evidence
    // saved with them: kept until probabilities are calculated or cleared here. A design without it reads '', as the
    // form gives any field its model lacks.
    stratumFrameEvidence: new Form.Field()
}

class _Proportions extends React.Component {
    cancelClassValues$ = new Subject()
    // Not React state: nothing renders from it, and the Scale default is written from the same callback that
    // receives it, where a queued setState would not have landed yet.
    bandMetadata = undefined
    state = {
        bands: undefined,
        distinctClassOptions: undefined
    }

    constructor(props) {
        super(props)
        this.onTypeChanged = this.onTypeChanged.bind(this)
        this.onImageChanged = this.onImageChanged.bind(this)
        this.onImageLoading = this.onImageLoading.bind(this)
        this.onAssetLoaded = this.onAssetLoaded.bind(this)
        this.onRecipeBandsLoaded = this.onRecipeBandsLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onAnticipationStrategyChanged = this.onAnticipationStrategyChanged.bind(this)
        this.onPercentageChanged = this.onPercentageChanged.bind(this)
        this.onOverallProportionChanged = this.onOverallProportionChanged.bind(this)
        this.onSkipToggled = this.onSkipToggled.bind(this)
        this.loadClassValues = this.loadClassValues.bind(this)
        this.probabilities().onAnswer(({probabilityPerStratum, calculatedFrom}) =>
            this.onProbabilitiyPerStratumCalculated(probabilityPerStratum, calculatedFrom))
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='chart-pie'
                    label={this.renderHeaderButtons()}
                    title={msg('process.samplingDesign.panel.proportions.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderHeaderButtons() {
        const {inputs: {skip, manual}} = this.props
        return <ProportionsHeaderButtons
            skip={skip}
            manual={manual}
            onManualToggled={manual => this.onManualToggled(manual)}
            onSkipToggled={this.onSkipToggled}
        />
    }

    renderContent() {
        const {inputs: {anticipationStrategy, anticipatedProportions, skip}} = this.props
        return skip.value?.length
            ? this.renderSkippedMessage()
            : (
                <Layout>
                    <div className={styles.info}>
                        {msg('process.samplingDesign.panel.proportions.info')}
                    </div>
                    {this.isManual() ? null : this.renderAnticipationStrategy()}
                    {this.isManual() ? null : ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy.value) ? this.renderImageSelection() : null}
                    {this.renderStrataProportion()}
                    {this.isManual() ? null : anticipatedProportions.value ? this.renderOverallProportion() : null}
                </Layout>
            )
    }

    renderSkippedMessage() {
        return (

            <NoData
                alignment='center'
                message={msg('process.samplingDesign.panel.proportions.form.skip.message')}
            />
        )
    }

    renderAnticipationStrategy() {
        const {inputs: {anticipationStrategy}} = this.props
        return <AnticipationStrategy
            anticipationStrategy={anticipationStrategy}
            onChange={this.onAnticipationStrategyChanged}
        />
    }

    renderImageSelection() {
        const {bands = [], visualizations = [], distinctClassOptions} = this.state
        const {stream, inputs: {type, assetId, recipeId, band}} = this.props
        const sourceReady = type.value === 'RECIPE' ? !!recipeId.value : !!assetId.value
        return <ImageSelection
            inputs={this.props.inputs}
            effectiveScale={this.effectiveScale()}
            bands={bands}
            visualizations={visualizations}
            distinctClassOptions={distinctClassOptions}
            loadingClassValues={stream('DISTINCT_CLASS_VALUES').active}
            canLoadClassValues={sourceReady && !!band.value}
            onLoadClassValues={this.loadClassValues}
            onTypeChanged={this.onTypeChanged}
            onImageChanged={this.onImageChanged}
            onImageLoading={this.onImageLoading}
            onAssetLoaded={this.onAssetLoaded}
            onRecipeBandsLoaded={this.onRecipeBandsLoaded}
            onBandChanged={this.onBandChanged}
            onPercentageChanged={this.onPercentageChanged}
        />
    }
    
    renderOverallProportion() {
        const {inputs: {anticipatedOverallProportion}} = this.props
        return <OverallProportionInput
            anticipatedOverallProportion={anticipatedOverallProportion}
            onChange={this.onOverallProportionChanged}
        />
    }

    renderStrataProportion() {
        const {form, strata, inputs: {eeStrategy, anticipatedProportions}} = this.props
        const awaited = awaitedResultFeedback('proportions', this.probabilities())
        const answers = inputFeedback(form, anticipatedProportions).error
        return <StrataProportion
            eeStrategy={eeStrategy}
            anticipatedProportions={anticipatedProportions}
            strata={strata}
            manual={this.isManual()}
            streamActive={this.probabilities().calculating() || Boolean(awaited?.checking)}
            loading={this.progress(awaited)}
            emptyMessage={awaited?.message}
            calculationError={this.calculationError()}
            feedback={answers ? {errorMessage: answers} : editedResultFeedback('proportions', this.probabilities())}
            onRetryCalculation={() => this.probabilities().retry()}
            onUseBatch={() => this.useBatch()}
        />
    }

    // A short calculation status, with a separate explanation only for legacy results.
    progress(awaited) {
        const updating = this.probabilities().updating()
        return {
            status: awaited?.message || msg(updating
                ? `process.samplingDesign.panel.proportions.form.updating.${updating}`
                : 'process.samplingDesign.panel.proportions.form.calculating'),
            explanation: updating === 'UNKNOWN' ? msg('process.samplingDesign.panel.proportions.form.updatingReason.UNKNOWN') : null
        }
    }

    // An Earth Engine failure, or an answer about inputs that changed while it ran, as the table explains one.
    calculationError() {
        const {inputs: {eeStrategy}} = this.props
        const failure = this.probabilities().failure()
        if (failure?.superseded) {
            return {strategy: eeStrategy.value, message: msg('process.samplingDesign.panel.proportions.form.result.superseded')}
        }
        return failure?.error ? toProportionsCalculationError({error: failure.error, strategy: eeStrategy.value}) : null
    }

    // What opening the panel calculates is its binding's (calculatedResult.js): automatic proportions this design does not
    // hold yet, or holds for other strata, stale or without evidence, in the mode chosen beside them.
    componentDidMount() {
        const {strata, inputs: {requiresUpdate, skip, anticipationStrategy, type, eeStrategy, anticipatedProportions}} = this.props
        skip.value || skip.set([])
        anticipationStrategy.value || anticipationStrategy.set('PROBABILITY')
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')

        // Manual rows are settled by reconciling them against the strata as they are now - an answered proportion follows
        // its stratum, a vanished one goes, and a new stratum arrives unanswered for the user to fill in - and those an
        // earlier version flagged by applying them. Nothing is asked of Earth Engine for that.
        if (this.isManual() && anticipatedProportions.value) {
            const flagged = requiresUpdate.value === true
            const rows = {stratification: {strata}, proportions: {anticipatedProportions: anticipatedProportions.value}}
            if (flagged || !proportionsCoverStrata(rows)) {
                this.reconcileManualRows()
            }
            flagged && requiresUpdate.set(undefined)
        }
    }

    reconcileManualRows() {
        const {strata, inputs: {anticipatedProportions}} = this.props
        anticipatedProportions.set(reconcileManualProportions({
            stratification: {strata},
            proportions: {anticipatedProportions: anticipatedProportions.value}
        }))
    }

    componentDidUpdate(prevProps) {
        const {inputs: {anticipationStrategy, band, percentage, targetClass}} = this.props
        if (prevProps.inputs.anticipationStrategy.value !== anticipationStrategy.value) {
            this.invalidateCalculatedProportions()
            if (anticipationStrategy.value === 'CATEGORICAL') {
                // Entering categorical mode needs an explicit class selection; never reuse a probability result.
                percentage.set([])
                targetClass.value == null || targetClass.set(null)
                return
            }
            if (targetClass.value != null) {
                targetClass.set(null)
                this.clearClassValues()
                return
            }
            this.clearClassValues()
        }
        // FormCombo sets the band synchronously but fires its onChange in setImmediate, so this update
        // can see the new band while the (band-specific) target class is still the old one. Invalidate
        // here, before the binding asks again, so a stale class can't start a GEE request for the new band;
        // the question it asks changes, which cancels any request in flight.
        if (anticipationStrategy.value === 'CATEGORICAL' && prevProps.inputs.band.value !== band.value) {
            this.invalidateCalculatedProportions()
            targetClass.value == null || targetClass.set(null)
            // Discovered class options are band-specific; clear them here too (the band combo's onChange,
            // which also clears them, is deferred and would briefly show stale options for the new band).
            this.clearClassValues()
        }
    }

    onTypeChanged() {
        const {inputs: {assetId, recipeId, band, targetClass}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        targetClass.set(null)
        this.clearSelectionScale()
        this.invalidateCalculatedProportions()
        this.clearClassValues()
    }

    onImageChanged() {
        const {inputs: {band, targetClass}} = this.props
        band.set(null)
        targetClass.set(null)
        this.clearSelectionScale()
        this.invalidateCalculatedProportions()
        this.clearClassValues()
    }

    onAnticipationStrategyChanged(strategy) {
        const {inputs: {percentage, targetClass}} = this.props
        // Clear stale results; the binding asks again once the strategy can be calculated.
        this.invalidateCalculatedProportions()
        if (strategy === 'CATEGORICAL') {
            // Categorical proportions are fractions, so the percentage interpretation must not carry over.
            percentage.set([])
            targetClass.set(null)
        } else {
            // Don't let a stale target class (or discovered class options) linger into the probability path.
            targetClass.set(null)
            this.clearClassValues()
        }
    }

    effectiveScale() {
        const {inputs: {scale, defaultScale}} = this.props
        return effectiveProportionsScale({scale: scale.value, defaultScale: defaultScale.value})
    }

    // What the current property band defaults to: the coarsest grid the estimate can carry. Applied when a
    // band is selected, and again when metadata arrives for the band already selected - it only ever writes
    // the transient field, so a saved or entered override is never touched.
    //
    // setInitialValue, not set: this is the panel's reading of the selection rather than anything the user
    // changed, so learning it must not mark a reopened recipe as edited.
    installDefaultScale() {
        const {unstratified, stratificationScale, inputs: {band, defaultScale}} = this.props
        defaultScale.setInitialValue(proportionsScaleFromBand(this.bandMetadata, band.value, {unstratified, stratificationScale}))
    }

    // Asked again as a batch task: the binding asks once in each mode.
    useBatch() {
        const {inputs: {eeStrategy}} = this.props
        eeStrategy.set('BATCH')
    }

    // Loading also happens when a saved recipe opens, so this discards the metadata the Scale default is
    // calculated from but never the Scale itself: a saved value is configuration, not a derived one.
    // The Scale belongs to the band it was calculated for, so replacing the source drops both the override and
    // the default it resolved against. The next band selection installs the new one.
    clearSelectionScale() {
        const {inputs: {scale, defaultScale}} = this.props
        defaultScale.setInitialValue(null)
        scale.set(null)
    }

    onImageLoading() {
        this.bandMetadata = undefined
        this.setState({bands: undefined})
    }

    onAssetLoaded({metadata, visualizations}) {
        const bands = metadata.bands.map(({id}) => id) || []
        // Carries the property band's own resolution, which the Scale default is calculated from.
        this.bandMetadata = metadata.bands
        this.onImageLoaded(bands, visualizations)
    }

    onRecipeBandsLoaded({bandNames: bands, recipe}) {
        this.onImageLoaded(bands, recipeVisualizationsNaming(recipe, bands))
    }

    onImageLoaded(bands, visualizations) {
        const {inputs: {band}} = this.props
        this.setState({bands, visualizations})
        // Reopening a saved recipe arrives here with its band already selected: the placeholder needs the
        // default, while the saved Scale stays exactly as saved.
        if (band.value) {
            this.installDefaultScale()
        }
        const defaultBand = bands.length === 1
            ? bands[0]
            : null
        const updateBand = defaultBand && defaultBand !== band.value
        if (updateBand) {
            band.set(defaultBand)
            this.onBandChanged({value: defaultBand})
        }
    }

    onBandChanged() {
        const {inputs: {band, targetClass, scale}} = this.props
        const {visualizations = []} = this.state
        // Classes are band-specific, so a class chosen for a previous band must not silently carry over.
        targetClass.set(null)
        this.clearClassValues()
        // A band selection is a Scale selection: any override belonged to the previous band, so it is cleared,
        // and this band's own default becomes what the now-blank field resolves to and shows as a placeholder.
        this.installDefaultScale()
        scale.set(null)
        const minMax = visualizations.map(({bands, min, max}) => {
            const index = bands.indexOf(band.value)
            if (index >= 0) {
                return {min: min[index], max: max[index]}
            } else {
                return undefined
            }
        })
        const min = _.minBy(minMax, 'min')?.min
        const max = _.maxBy(minMax, 'max')?.max
        if (min >= 0) {
            this.setPercentage(max > 1)
        }
        // Probabilities belong to the band they were calculated for. Categorical mode is asked once a target class is
        // selected, probability mode at once.
        this.invalidateCalculatedProportions()
    }

    onPercentageChanged(percentageValue) {
        const percentage = !!percentageValue.length
        const {strata, inputs: {probabilityPerStratum, anticipatedProportions, anticipatedOverallProportion}} = this.props
        const proportions = this.probabilitiesToProportions({
            targetOverallProportion: parseFloat(anticipatedOverallProportion.value),
            probabilityPerStratum: probabilityPerStratum.value,
            strata,
            percentage
        })
        anticipatedProportions.set(proportions)
    }

    onOverallProportionChanged(changedOverallProportion) {
        const {strata, inputs: {anticipatedOverallProportion, probabilityPerStratum, anticipatedProportions}} = this.props
        const maxOverallProportion = this.calculateMaxAnticipatedTargetProportion()
        if (parseFloat(changedOverallProportion) > maxOverallProportion) {
            changedOverallProportion = '' + maxOverallProportion
            anticipatedOverallProportion.set(changedOverallProportion)
        }
        const proportions = this.probabilitiesToProportions({
            targetOverallProportion: parseFloat(changedOverallProportion),
            probabilityPerStratum: probabilityPerStratum.value,
            strata,
            percentage: this.isPercentage()
        })
        anticipatedProportions.set(proportions)
    }

    // Either way the rows are those of the strata as they are now.
    onManualToggled(manual) {
        const {strata, inputs: {anticipatedProportions}} = this.props
        if (!manual) {
            anticipatedProportions.set(null)
            return
        }
        if (anticipatedProportions.value) {
            // Anticipated rows kept as answers follow the strata as they are, as manual rows do.
            this.reconcileManualRows()
        } else {
            // Rows own the stratum and its proportion, nothing else: presentation and weight are joined from
            // the stratification when the table renders, so they cannot go stale here.
            anticipatedProportions.set(strata.map(stratum => ({stratum: stratum.value, proportion: 0})))
        }
    }

    onSkipToggled(skip) {
        const isSkipped = !!skip?.length
        if (isSkipped) {
            // this.cancel$.next()
        } else {
            this.onManualToggled(this.isManual())
        }
    }

    // User-triggered discovery of class values for categorical bands without legend metadata. Not started
    // automatically (it's expensive EE work). Stale loads are cancelled when the image/band/strategy
    // changes via clearClassValues().
    loadClassValues() {
        const {aoi, stream, inputs: {type, assetId, recipeId, band}} = this.props
        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        if (!id || !band.value) {
            return
        }
        const recipe = type.value === 'RECIPE'
            ? {type: 'RECIPE_REF', id}
            : {type: 'ASSET', id}
        this.cancelClassValues$.next()
        stream('DISTINCT_CLASS_VALUES',
            api.gee.distinctBandValues$({
                recipe,
                band: band.value,
                aoi: aoi?.type ? aoi : undefined
            }).pipe(
                takeUntil(this.cancelClassValues$)
            ),
            values => this.setState({distinctClassOptions: toClassOptions(values)}),
            error => {
                Notifications.error({
                    message: msg('process.samplingDesign.panel.proportions.form.targetClass.loadError'),
                    error: toUserErrorMessage(error),
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    clearClassValues() {
        this.cancelClassValues$.next()
        if (this.state.distinctClassOptions !== undefined) {
            this.setState({distinctClassOptions: undefined})
        }
    }

    // What a calculation still running answers is not these proportions' once what it was asked changes; the binding
    // cancels it then.
    invalidateCalculatedProportions() {
        const {inputs: {probabilityPerStratum, anticipatedProportions, probabilityPerStratumCalculatedFrom, stratumFrameEvidence}} = this.props
        probabilityPerStratum.set(null)
        anticipatedProportions.set(null)
        probabilityPerStratumCalculatedFrom.set(null)
        stratumFrameEvidence.set(undefined)
    }

    calculateMaxAnticipatedTargetProportion() {
        const {strata, inputs: {probabilityPerStratum}} = this.props
        return maxAnticipatedTargetProportion({strata, probabilityPerStratum: probabilityPerStratum.value})
    }

    // Through the binding the panel is given for it (calculatedResult.js), held while the design's requirements hold the
    // probabilities (STRATUM_PROBABILITIES): a stratified design's are calculated over current areas only.
    probabilities() {
        return this.props.calculatedResults[STRATUM_PROBABILITIES_CALCULATION]
    }

    onProbabilitiyPerStratumCalculated(loadedProbabilityPerStratum, calculatedFrom) {
        const {strata, inputs: {probabilityPerStratumCalculatedFrom, stratumFrameEvidence, anticipationStrategy, probabilityPerStratum, anticipatedOverallProportion, anticipatedProportions}} = this.props
        if (this.isManual()) {
            return // Ignore the result when manual
        }
        probabilityPerStratumCalculatedFrom.set(calculatedFrom)
        stratumFrameEvidence.set(undefined)
        // Categorical proportions are fractions [0,1] - never interpret them as percentages.
        const adjustedPercentage = anticipationStrategy.value !== 'CATEGORICAL'
            && (this.isPercentage()
                || _.maxBy(loadedProbabilityPerStratum, 'probability')?.probability > 1)
        if (adjustedPercentage && !this.isPercentage()) {
            this.setPercentage(true)
        }
        const proportions = this.probabilitiesToProportions({
            targetOverallProportion: parseFloat(anticipatedOverallProportion.value),
            probabilityPerStratum: loadedProbabilityPerStratum,
            strata,
            percentage: adjustedPercentage
        })
        probabilityPerStratum.set(loadedProbabilityPerStratum)
        anticipatedProportions.set(proportions)
    }

    probabilitiesToProportions({percentage, targetOverallProportion, strata, probabilityPerStratum}) {
        const adjustedPercentage = percentage
            || _.maxBy(probabilityPerStratum, 'probability')?.probability > 1
        if (adjustedPercentage && !percentage) {
            setImmediate(() => this.setPercentage(true))
        }
        return toProportions({percentage: adjustedPercentage, targetOverallProportion, strata, probabilityPerStratum})
    }
    
    isPercentage() {
        const {inputs: {percentage}} = this.props
        return !!percentage.value.length
    }

    setPercentage(isPercentage) {
        const {inputs: {percentage}} = this.props
        percentage.set(isPercentage ? [true] : [])
    }

    isManual() {
        const {inputs: {manual}} = this.props
        return manual.value?.length
    }
}

const valuesToModel = values => {
    const isSkipped = isProportionsSkipped(values)
    // The recipe stores a concrete Scale. `scale` is an override and `defaultScale` is what a blank one
    // resolves to, so both are consolidated here and the transient field never reaches the model.
    // An earlier version's flag is settled by what is applied here.
    const {defaultScale: _defaultScale, requiresUpdate: _requiresUpdate, stratumFrameEvidence, ...persisted} = values
    return {
        ...persisted,
        scale: effectiveProportionsScale(values),
        skip: isSkipped,
        percentage: !!values.percentage?.length,
        probabilityPerStratum: isSkipped
            ? null
            : values.probabilityPerStratum,
        probabilityPerStratumCalculatedFrom: isSkipped || values.manual?.length
            ? null
            : values.probabilityPerStratumCalculatedFrom || null,
        ...stratumFrameEvidence !== undefined && stratumFrameEvidence !== '' && {stratumFrameEvidence},
        anticipatedOverallProportion: isSkipped
            ? null
            : values.anticipatedOverallProportion
                && values.anticipatedOverallProportion / 100,
        anticipatedProportions: isSkipped
            ? null
            : values.anticipatedProportions
                ?.map(entry => ({
                    ...entry,
                    proportion: entry.proportion && entry.proportion / 100
                }))
    }
}

// Skip and Manual are the form's toggles, however they were saved.
const modelToValues = model => {
    return {
        ...model,
        skip: isProportionsSkipped(model) ? [true] : [],
        manual: isSet(model.manual) ? [true] : [],
        percentage: model.percentage ? [true] : [],
        anticipatedOverallProportion: model.anticipatedOverallProportion
            && model.anticipatedOverallProportion * 100,
        anticipatedProportions: model.anticipatedProportions
            ?.map(entry => ({
                ...entry,
                proportion: entry.proportion && smartRound(entry.proportion * 100)
            }))
    }
}

const isSet = value => Array.isArray(value) ? value.length > 0 : Boolean(value)

export const Proportions = compose(
    _Proportions,
    recipeFormPanel({id: 'proportions', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Proportions.propTypes = {
    recipeId: PropTypes.string
}
