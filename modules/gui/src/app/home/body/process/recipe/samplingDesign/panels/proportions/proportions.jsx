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
import {ButtonGroup} from '~/widget/buttonGroup'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import styles from './proportions.module.css'
import {ProportionTable} from './proportionTable'

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
        .skip((_value, {skip, manual, anticipationStrategy, type}) =>
            skip.length
                || manual.length
                || ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy) || type !== 'ASSET')
        .notBlank('process.samplingDesign.panel.proportions.form.asset.required'),
    recipeId: new Form.Field()
        .skip((_value, {skip, manual, anticipationStrategy, type}) =>
            skip.length
                || manual.length
                || ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy) || type !== 'RECIPE')
        .notBlank('process.samplingDesign.panel.proportions.form.recipe.required'),
    band: new Form.Field()
        .skip((_value, {skip, anticipationStrategy, type, assetId, recipeId}) =>
            skip.length
                || ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy)
                || (type === 'ASSET' && !assetId)
                || (type === 'RECIPE' && !recipeId))
        .notBlank('process.samplingDesign.panel.proportions.form.band.required'),
    percentage: new Form.Field(),
    scale: new Form.Field()
        .skip((_value, {skip, manual, anticipationStrategy}) =>
            skip.length
                || manual.length
                || ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy))
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
    state = {
        bands: undefined
    }

    constructor(props) {
        super(props)
        this.onTypeChanged = this.onTypeChanged.bind(this)
        this.onImageChanged = this.onImageChanged.bind(this)
        this.onImageLoading = this.onImageLoading.bind(this)
        this.onAssetLoaded = this.onAssetLoaded.bind(this)
        this.onRecipeLoaded = this.onRecipeLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onPercentageChanged = this.onPercentageChanged.bind(this)
        this.onOverallProportionChanged = this.onOverallProportionChanged.bind(this)
        this.onProbabilitiyPerStratumCalculated = this.onProbabilitiyPerStratumCalculated.bind(this)
        this.onManualToggled = this.onManualToggled.bind(this)
        this.onSkipToggled = this.onSkipToggled.bind(this)
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
        return (
            <ButtonGroup>
                <Form.Buttons
                    input={manual}
                    disabled={skip.value?.length}
                    options={[
                        {
                            value: true,
                            icon: 'rectangle-list',
                            label: msg('process.samplingDesign.panel.proportions.form.manual.label'),
                            tooltip: msg('process.samplingDesign.panel.proportions.form.manual.tooltip')
                        },
                    ]}
                    multiple
                    onChange={this.onManualToggled}
                />
                <Form.Buttons
                    input={skip}
                    options={[
                        {
                            value: true,
                            icon: 'ban',
                            label: msg('process.samplingDesign.panel.proportions.form.skip.label'),
                            tooltip: msg('process.samplingDesign.panel.proportions.form.skip.tooltip')
                        },
                    ]}
                    multiple
                    onChange={this.onSkipToggled}
                />
            </ButtonGroup>
        )
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
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.label')}
                input={anticipationStrategy}
                options={[
                    {
                        value: 'PROBABILITY',
                        label: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.PROBABILITY.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.PROBABILITY.tooltip')
                    },
                    {
                        value: 'CATEGORICAL',
                        label: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.CATEGORICAL.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.CATEGORICAL.tooltip')
                    },
                ]}
                onChange={this.onAnticipationStrategyChanged}
            />
        )
    }

    renderImageSelection() {
        const {inputs: {type}} = this.props
        return (
            <>
                {type.value === 'ASSET' ? this.renderAsset() : null}
                {type.value === 'RECIPE' ? this.renderRecipe() : null}
                <Layout type='horizontal'>
                    {this.renderBand()}
                    {this.renderScale()}
                </Layout>
            </>
        )
    }

    renderAsset() {
        const {inputs: {assetId}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.samplingDesign.panel.proportions.form.image.label')}
                autoFocus
                input={assetId}
                placeholder={msg('process.samplingDesign.panel.proportions.form.image.placeholder')}
                allowedTypes={['Image', 'ImageCollection']}
                labelButtons={[this.renderType()]}
                onChange={this.onImageChanged}
                onLoading={this.onImageLoading}
                onLoaded={this.onAssetLoaded}
            />
        )
    }

    renderRecipe() {
        const {inputs: {recipeId}} = this.props
        return (
            <RecipeInput
                label={msg('process.samplingDesign.panel.proportions.form.image.label')}
                input={recipeId}
                filter={type => !type.noImageOutput}
                labelButtons={[this.renderType()]}
                autoFocus
                onChange={this.onImageChanged}
                onLoading={this.onImageLoading}
                onLoaded={this.onRecipeLoaded}
            />
        )
    }
    
    renderType() {
        const {inputs: {type}} = this.props
        return (
            <Form.Buttons
                key='type'
                spacing='none'
                groupSpacing='none'
                size='x-small'
                shape='pill'
                input={type}
                options={[
                    {
                        value: 'ASSET',
                        label: msg('process.samplingDesign.panel.proportions.form.type.ASSET.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.type.ASSET.tooltip'),
                    },
                    {
                        value: 'RECIPE',
                        label: msg('process.samplingDesign.panel.proportions.form.type.RECIPE.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.type.RECIPE.tooltip')
                    },
                ]}
                onChange={this.onTypeChanged}
            />
        )
    }
    
    renderBand() {
        const {inputs: {band, percentage, probabilityPerStratum}} = this.props
        const {bands = []} = this.state

        const options = bands
            .map(band => ({value: band, label: band}))

        const forcePercentage = _.maxBy(probabilityPerStratum.value, 'probability')?.probability > 1

        const percentageButton = (
            <Form.Buttons
                key={'percentage'}
                input={percentage}
                look='transparent'
                shape={'pill'}
                air={'less'}
                size={'x-small'}
                options={[
                    {value: true, label: '%', tooltip: 'Specify if band specify fraction or percentage'}
                ]}
                multiple
                tabIndex={-1}
                disabled={forcePercentage}
                onChange={this.onPercentageChanged}
            />
        )
        return (
            <FormCombo
                className={styles.band}
                input={band}
                disabled={!bands.length}
                options={options}
                label={msg('process.samplingDesign.panel.proportions.form.band.label')}
                placeholder={msg('process.samplingDesign.panel.proportions.form.band.placeholder')}
                tooltip={msg('process.samplingDesign.panel.proportions.form.band.tooltip')}
                buttons={[percentageButton]}
                onChange={this.onBandChanged}
            />
        )
    }
    
    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Form.Input
                className={styles.scale}
                label={msg('process.samplingDesign.panel.proportions.form.scale.label')}
                placeholder={msg('process.samplingDesign.panel.proportions.form.scale.placeholder')}
                tooltip={msg('process.samplingDesign.panel.proportions.form.scale.tooltip')}
                input={scale}
                type='number'
                suffix={msg('process.samplingDesign.panel.proportions.form.scale.suffix')}
            />
        )
    }
    
    renderOverallProportion() {
        const {inputs: {anticipatedOverallProportion}} = this.props
        return (
            <Form.Input
                className={styles.overallProportion}
                label={msg('process.samplingDesign.panel.proportions.form.overallProportion.label')}
                placeholder={msg('process.samplingDesign.panel.proportions.form.overallProportion.placeholder')}
                tooltip={msg('process.samplingDesign.panel.proportions.form.overallProportion.tooltip')}
                input={anticipatedOverallProportion}
                type='number'
                suffix={msg('process.samplingDesign.panel.proportions.form.overallProportion.suffix')}
                onChange={this.onOverallProportionChanged}
            />
        )
    }

    renderStrataProportion() {
        const {inputs: {eeStrategy, anticipatedProportions}} = this.props
        const eeStrategyButtons = (
            <Form.Buttons
                key='eeStrategy'
                spacing='none'
                groupSpacing='none'
                size='x-small'
                shape='pill'
                input={eeStrategy}
                options={[
                    {
                        value: 'ONLINE',
                        label: msg('process.samplingDesign.panel.proportions.form.eeStrategy.online.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.online.tooltip')
                    },
                    {
                        value: 'BATCH',
                        label: msg('process.samplingDesign.panel.proportions.form.eeStrategy.batch.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.batch.tooltip')
                    },
                ]}
            />
        )
        const overallProportion = _.sum(
            anticipatedProportions.value?.map(({weight, proportion}) => {
                return weight * proportion
            })
        )
        return (
            <Widget
                label={msg('process.samplingDesign.panel.proportions.form.strataProportion.label')}
                labelButtons={this.isManual() ? [] : [eeStrategyButtons]}>
                {anticipatedProportions.value
                    ? <ProportionTable
                        proportions={anticipatedProportions}
                        overallProportion={overallProportion}
                        manual={this.isManual()}
                    />
                    : this.props.stream('PROBABILITY_PER_STRATUM').active
                        ? <NoData
                            alignment='left'
                            message={(
                                <div>
                                    <Icon name='spinner'/>
                                    {' ' + msg('Loading...')}
                                </div>
                            )}
                        />
                        : <NoData
                            alignment='left'
                            message={msg('Select image and band.')}
                        />}
                
            </Widget>
        )
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
        if (!_.isEqual(proportionsDeps(prevProps), proportionsDeps(this.props))) {
            this.calculateAnticipatedProportions()
        }
    }

    onTypeChanged() {
        const {inputs: {assetId, recipeId, band, anticipatedProportions}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        anticipatedProportions.set(null)
    }

    onImageChanged() {
        const {inputs: {band}} = this.props
        band.set(null)
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
        const defaultBand = bands.lenght === 1
            ? bands[0]
            : null
        const updateBand = defaultBand && defaultBand !== band.value
        if (updateBand) {
            band.set(defaultBand)
            this.onBandChanged({value: defaultBand})
        }
    }

    onBandChanged() {
        const {inputs: {band}} = this.props
        const {visualizations = []} = this.state
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
        const isManual = !!manual?.length
        if (isManual && !anticipatedProportions.value) {
            const initialProportions = strata.map(stratum => ({
                color: stratum.color,
                label: stratum.label,
                stratum: stratum.value,
                area: stratum.area,
                weight: stratum.weight,
                proportion: 0
            }))
            anticipatedProportions.set(initialProportions)
        } else if (!isManual) {
            anticipatedProportions.set(null)
            this.calculateAnticipatedProportions()
        }
    }

    onSkipToggled(skip) {
        const isSkipped = !!skip?.length
        if (!isSkipped) {
            this.calculateAnticipatedProportions()
        }
    }

    calculateMaxAnticipatedTargetProportion() {
        const {strata, inputs: {probabilityPerStratum}} = this.props
        
        if (!probabilityPerStratum.value) {
            return 100
        } else {
            const maxStratumProportion = _.max(
                probabilityPerStratum.value.map(({probability}) => probability)
            )
            const overallProportion = _.sum(
                probabilityPerStratum.value.map(({stratum, probability}) => {
                    const weight = strata.find(({value}) => value === stratum).weight
                    return weight * probability
                })
            )
            return _.ceil(100 * overallProportion / maxStratumProportion, 2)
        }
    }

    calculateAnticipatedProportions() {
        const {aoi, stream,
            unstratified, stratificationType, stratificationRecipeId, stratificationAssetId, stratificationBand,
            inputs: {manual, scale, type, assetId, recipeId, band, eeStrategy, anticipatedProportions}
        } = this.props
        if (manual.value?.length) {
            return
        }

        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        if (!scale.value || !id || !band.value) {
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
        const {strata, inputs: {probabilityPerStratum, anticipatedOverallProportion, anticipatedProportions}} = this.props
        if (this.isManual()) {
            return // Ignore the result when manual
        }
        const adjustedPercentage = this.isPercentage()
            || _.maxBy(loadedProbabilityPerStratum, 'probability').probability > 1
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
            || _.maxBy(probabilityPerStratum, 'probability').probability > 1
        if (adjustedPercentage && !percentage) {
            setImmediate(() => this.setPercentage(true))
        }
        const weightedProbabilities = probabilityPerStratum.map(({stratum, probability}) => {
            const weight = strata.find(({value}) => value === stratum).weight
            return weight * probability
        })
        const overallProbability = _.sum(weightedProbabilities)
        const probabilityFactor = targetOverallProportion >= 0
            ? targetOverallProportion / overallProbability
            : adjustedPercentage ? 1 : 100
        return probabilityPerStratum.map(({stratum, probability}) => {
            const {label, color, area, weight} = strata.find(({value}) => value === stratum)
            const proportion = probability * probabilityFactor
            return ({
                stratum,
                label,
                color,
                weight,
                area,
                proportion,
            })
        })
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
    const {inputs: {manual, anticipationStrategy, type, assetId, recipeId, band, scale, eeStrategy}} = props
    return [manual, anticipationStrategy, type, assetId, recipeId, band, scale, eeStrategy]
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
                proportion: entry.proportion && entry.proportion * 100
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
