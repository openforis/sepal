import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {isNumericClassValue, toClassOptions} from '../../sampling/categoricalLegend'
import {maxAnticipatedTargetProportion, smartRound, toProportions} from '../../sampling/proportionMath'
import {AnticipationStrategy, ImageSelection, OverallProportionInput, ProportionsHeaderButtons, StrataProportion} from './proportionControls'
import styles from './proportions.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.skip'),
    stratificationType: selectFrom(recipe, 'model.stratification.type'),
    stratificationAssetId: selectFrom(recipe, 'model.stratification.assetId'),
    stratificationRecipeId: selectFrom(recipe, 'model.stratification.recipeId'),
    stratificationBand: selectFrom(recipe, 'model.stratification.band'),
    stratificationScale: selectFrom(recipe, 'model.stratification.scale'),
    strata: selectFrom(recipe, 'model.stratification.strata')
})

const fields = {
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
    scale: new Form.Field()
        .skip((_value, {skip, manual}) =>
            skip.length || manual.length)
        .notBlank('process.samplingDesign.panel.proportions.form.scale.required'),
    eeStrategy: new Form.Field(),
    anticipatedOverallProportion: new Form.Field(),
    probabilityPerStratum: new Form.Field(),
    anticipatedProportions: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .notBlank('process.samplingDesign.panel.proportions.form.anticipatedProportions.required'),
}

class _Proportions extends React.Component {
    cancel$ = new Subject()
    cancelClassValues$ = new Subject()
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
        this.onRecipeLoaded = this.onRecipeLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onAnticipationStrategyChanged = this.onAnticipationStrategyChanged.bind(this)
        this.onPercentageChanged = this.onPercentageChanged.bind(this)
        this.onOverallProportionChanged = this.onOverallProportionChanged.bind(this)
        this.onProbabilitiyPerStratumCalculated = this.onProbabilitiyPerStratumCalculated.bind(this)
        this.onSkipToggled = this.onSkipToggled.bind(this)
        this.loadClassValues = this.loadClassValues.bind(this)
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
            onRecipeLoaded={this.onRecipeLoaded}
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
        const {inputs: {eeStrategy, anticipatedProportions}} = this.props
        return <StrataProportion
            eeStrategy={eeStrategy}
            anticipatedProportions={anticipatedProportions}
            manual={this.isManual()}
            streamActive={this.props.stream('PROBABILITY_PER_STRATUM').active}
        />
    }

    componentDidMount() {
        const {stratificationScale, inputs: {requiresUpdate, skip, manual, anticipationStrategy, scale, type, eeStrategy}} = this.props
        requiresUpdate.set(false)
        skip.value || skip.set([])
        manual.value || manual.set([])
        anticipationStrategy.value || anticipationStrategy.set('PROBABILITY')
        scale.value || scale.set(stratificationScale || '30')
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')
        
        if (requiresUpdate.value) {
            this.calculateAnticipatedProportions()
        }
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
        // here, BEFORE any recompute, so a stale class can't start a GEE request for the new band - and
        // cancel any request already in flight. The subsequent targetClass change re-triggers the normal
        // (now safely blank) recompute path.
        if (anticipationStrategy.value === 'CATEGORICAL' && prevProps.inputs.band.value !== band.value) {
            this.invalidateCalculatedProportions()
            targetClass.value == null || targetClass.set(null)
            // Discovered class options are band-specific; clear them here too (the band combo's onChange,
            // which also clears them, is deferred and would briefly show stale options for the new band).
            this.clearClassValues()
            return
        }
        if (!_.isEqual(proportionsDeps(prevProps), proportionsDeps(this.props))) {
            this.calculateAnticipatedProportions()
        }
    }

    onTypeChanged() {
        const {inputs: {assetId, recipeId, band, targetClass}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        targetClass.set(null)
        this.invalidateCalculatedProportions()
        this.clearClassValues()
    }

    onImageChanged() {
        const {inputs: {band, targetClass}} = this.props
        band.set(null)
        targetClass.set(null)
        this.invalidateCalculatedProportions()
        this.clearClassValues()
    }

    onAnticipationStrategyChanged(strategy) {
        const {inputs: {percentage, targetClass}} = this.props
        // Clear stale results; recompute is triggered by the dependency change in componentDidUpdate.
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

    onImageLoading() {
        this.setState({bands: undefined})
    }

    onAssetLoaded({metadata, visualizations}) {
        const {inputs: {assetId}} = this.props
        const bands = metadata.bands.map(({id}) => id) || []
        this.updateImageLayerSources({
            id: assetId.value,
            type: 'Asset',
            sourceConfig: {
                asset: assetId.value,
                metadata,
                visualizations
            },
        })
        this.onImageLoaded(bands, visualizations)
    }

    onRecipeLoaded({bandNames: bands, recipe}) {
        this.updateImageLayerSources({
            id: recipe.id,
            type: 'Recipe',
            sourceConfig: {
                recipeId: recipe.id
            },
        })
        this.onImageLoaded(bands, getAllVisualizations(recipe))
    }

    onImageLoaded(bands, visualizations) {
        const {inputs: {band}} = this.props
        this.setState({bands, visualizations})
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
        const {inputs: {band, targetClass}} = this.props
        const {visualizations = []} = this.state
        // Classes are band-specific, so a class chosen for a previous band must not silently carry over.
        this.invalidateCalculatedProportions()
        targetClass.set(null)
        this.clearClassValues()
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

    onManualToggled(manual) {
        const {strata, inputs: {anticipatedProportions}} = this.props
        // manual && this.cancel$.next()
        if (manual && !anticipatedProportions.value) {
            const initialProportions = strata.map(stratum => ({
                color: stratum.color,
                label: stratum.label,
                stratum: stratum.value,
                area: stratum.area,
                weight: stratum.weight,
                proportion: 0
            }))
            anticipatedProportions.set(initialProportions)
        } else if (!manual) {
            anticipatedProportions.set(null)
            this.calculateAnticipatedProportions()
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
                const errorMessage = error?.response?.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : error
                Notifications.error({
                    message: msg('process.samplingDesign.panel.proportions.form.targetClass.loadError'),
                    error: errorMessage,
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

    invalidateCalculatedProportions() {
        const {stream, inputs: {probabilityPerStratum, anticipatedProportions}} = this.props
        if (stream('PROBABILITY_PER_STRATUM').active) {
            this.cancel$.next()
        }
        probabilityPerStratum.set(null)
        anticipatedProportions.set(null)
    }

    calculateMaxAnticipatedTargetProportion() {
        const {strata, inputs: {probabilityPerStratum}} = this.props
        return maxAnticipatedTargetProportion({strata, probabilityPerStratum: probabilityPerStratum.value})
    }

    calculateAnticipatedProportions() {
        const {aoi, stream,
            unstratified, stratificationType, stratificationRecipeId, stratificationAssetId, stratificationBand,
            inputs: {manual, anticipationStrategy, scale, type, assetId, recipeId, band, targetClass, eeStrategy, anticipatedProportions}
        } = this.props
        if (manual.value?.length) {
            return
        }

        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        if (!scale.value || !id || !band.value) {
            return
        }
        const categorical = anticipationStrategy.value === 'CATEGORICAL'
        if (categorical && (targetClass.value == null || targetClass.value === '')) {
            return
        }

        anticipatedProportions.set(null)
        const stratification = unstratified
            ? null
            : {
                type: stratificationType === 'RECIPE' ? 'RECIPE_REF' : 'ASSET',
                id: stratificationType === 'RECIPE' ? stratificationRecipeId : stratificationAssetId,
            }
        const probability = {
            type: type.value === 'RECIPE' ? 'RECIPE_REF' : 'ASSET',
            id,
        }

        if (stream('PROBABILITY_PER_STRATUM').active) {
            this.cancel$.next()
        }
        stream('PROBABILITY_PER_STRATUM',
            api.gee.probabilityPerStratum$({
                aoi,
                stratification,
                stratificationBand: stratificationBand,
                probability,
                probabilityBand: band.value,
                mode: anticipationStrategy.value,
                targetClass: categorical ? Number(targetClass.value) : undefined,
                scale: parseInt(scale.value),
                batch: eeStrategy.value === 'BATCH'
            }).pipe(
                takeUntil(this.cancel$)
            ),
            this.onProbabilitiyPerStratumCalculated,
            error => {
                const errorMessage = error?.response?.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : error
                Notifications.error({
                    message: msg('process.samplingDesign.panel.proportions.loadError'),
                    error: errorMessage,
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    onProbabilitiyPerStratumCalculated(loadedProbabilityPerStratum) {
        const {strata, inputs: {anticipationStrategy, probabilityPerStratum, anticipatedOverallProportion, anticipatedProportions}} = this.props
        if (this.isManual()) {
            return // Ignore the result when manual
        }
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

    updateImageLayerSources(source) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_PROPORTIONS_IMAGE_LAYER_SOURCE', {source})
            .set(['layers.additionalImageLayerSources', {id: source.id}], source)
            .dispatch()
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

const proportionsDeps = props => {
    const {inputs: {manual, anticipationStrategy, type, assetId, recipeId, band, targetClass, scale, eeStrategy}} = props
    return [manual, anticipationStrategy, type, assetId, recipeId, band, targetClass, scale, eeStrategy]
        .map(input => input?.value)
}

const valuesToModel = values => {
    const isSkipped = !!values.skip?.length
    return {
        ...values,
        skip: isSkipped,
        percentage: !!values.percentage?.length,
        probabilityPerStratum: isSkipped
            ? null
            : values.probabilityPerStratum,
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

const modelToValues = model => {
    return {
        ...model,
        skip: model.skip ? [true] : [],
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

export const Proportions = compose(
    _Proportions,
    recipeFormPanel({id: 'proportions', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Proportions.propTypes = {
    recipeId: PropTypes.string
}
