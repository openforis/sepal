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
import {FormCombo} from '~/widget/form/combo'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import styles from './proportions.module.css'
import {ProportionTable} from './proportionTable'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.unstratified'),
    stratificationType: selectFrom(recipe, 'model.stratification.type'),
    stratificationAssetId: selectFrom(recipe, 'model.stratification.assetId'),
    stratificationRecipeId: selectFrom(recipe, 'model.stratification.recipeId'),
    stratificationBand: selectFrom(recipe, 'model.stratification.band'),
    stratificationScale: selectFrom(recipe, 'model.stratification.scale'),
    strata: selectFrom(recipe, 'model.stratification.strata')
})

const fields = {
    requiresUpdate: new Form.Field(),
    anticipationStrategy: new Form.Field(),
    type: new Form.Field(),
    assetId: new Form.Field()
        .skip((_value, {anticipationStrategy, type}) => ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy) || type !== 'ASSET')
        .notBlank('process.samplingDesign.panel.proportions.form.asset.required'),
    recipeId: new Form.Field()
        .skip((_value, {anticipationStrategy, type}) => ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy) || type !== 'RECIPE')
        .notBlank('process.samplingDesign.panel.proportions.form.recipe.required'),
    band: new Form.Field()
        .skip((_value, {anticipationStrategy, type, assetId, recipeId}) =>
            ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy)
                || (type === 'ASSET' && !assetId)
                || (type === 'RECIPE' && !recipeId))
        .notBlank('process.samplingDesign.panel.proportions.form.band.required'),
    percentage: new Form.Field(),
    scale: new Form.Field()
        .skip((_value, {anticipationStrategy}) => ['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy))
        .notBlank('process.samplingDesign.panel.proportions.form.scale.required'),
    eeStrategy: new Form.Field(),
    anticipatedOverallProportion: new Form.Field(),
    probabilityPerStratum: new Form.Field(),
    anticipatedProportions: new Form.Field()
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
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='chart-pie'
                    title={msg('process.samplingDesign.panel.proportions.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {anticipationStrategy, anticipatedProportions}} = this.props
        return (
            <Layout>
                {this.renderAnticipationStrategy()}
                {['PROBABILITY', 'CATEGORICAL'].includes(anticipationStrategy.value) ? this.renderImageSelection() : null}
                {this.renderStrataProportion()}
                {anticipatedProportions.value ? this.renderOverallProportion() : null}
                
            </Layout>
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
                        value: 'MANUAL',
                        label: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.MANUAL.label'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.MANUAL.tooltip'),
                    },
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
                    {value: true, label: '%'}
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
                onChange={this.onScaleChanged}
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
        const {strata, inputs: {eeStrategy, anticipatedProportions}} = this.props
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
                        label: msg('online'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.online.tooltip')
                    },
                    {
                        value: 'BATCH',
                        label: msg('batch'),
                        tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.batc.tooltip')
                    },
                ]}
            />
        )
        const totalArea = _.sum(strata.map(({area}) => area))
        const overallArea = anticipatedProportions.value && _.sum(anticipatedProportions.value.map(({area}) => area))
        const overallProportion = overallArea / totalArea
        return (
            <Widget
                label={msg('process.samplingDesign.panel.proportions.form.strataProportion.label')}
                labelButtons={[eeStrategyButtons]}>
                {anticipatedProportions.value
                    ? <ProportionTable
                        proportions={anticipatedProportions}
                        overallProportion={overallProportion}
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
        const {stratificationScale, inputs: {requiresUpdate, anticipationStrategy, scale, type, eeStrategy}} = this.props
        requiresUpdate.set(false)
        anticipationStrategy.value || anticipationStrategy.set('MANUAL')
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
        const bands = metadata.bands.map(({id}) => id) || []
        this.onImageLoaded(bands, visualizations)
    }

    onRecipeLoaded({bandNames: bands, recipe}) {
        this.onImageLoaded(bands, getAllVisualizations(recipe))
    }

    onImageLoaded(bands, visualizations) {
        const {inputs: {band}} = this.props
        this.setState({bands, visualizations})
        const defaultBand = bands.lenght === 1
            ? bands[0]
            : null
        const updateBand = defaultBand && defaultBand !== band.value
        updateBand && band.set(defaultBand)
        updateBand && this.onBandChanged({value: defaultBand})
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
            stratificationType, stratificationRecipeId, stratificationAssetId, stratificationBand,
            inputs: {scale, type, assetId, recipeId, band, eeStrategy, anticipatedProportions}
        } = this.props

        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        if (!scale.value || !id || !band.value) {
            return
        }
        
        anticipatedProportions.set(null)
        const stratification = {
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
            error => console.error('Something went wrong', error) // TODO: Implement
        )
    }

    onProbabilitiyPerStratumCalculated(loadedProbabilityPerStratum) {
        const {strata, inputs: {probabilityPerStratum, anticipatedOverallProportion, anticipatedProportions}} = this.props
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
            ? targetOverallProportion / 100 / overallProbability
            : adjustedPercentage ? 1 / 100 : 1
        return probabilityPerStratum.map(({stratum, probability}) => {
            const {label, color, area, weight} = strata.find(({value}) => value === stratum)
            const proportion = probability * probabilityFactor
            return ({
                stratum,
                label,
                color,
                weight,
                proportion,
                area: area * proportion,
            })
        })
    }

    isPercentage() {
        const {inputs: {percentage}} = this.props
        return !!percentage.value.length
    }

    setPercentage(isPercentage) {
        const {inputs: {percentage}} = this.props
        percentage.set(isPercentage ? [true] : [])
    }
}

const proportionsDeps = props => {
    const {inputs: {anticipationStrategy, type, assetId, recipeId, band, scale, eeStrategy}} = props
    return [anticipationStrategy, type, assetId, recipeId, band, scale, eeStrategy]
        .map(input => input?.value)
}

const valuesToModel = values => {
    return values
}

const modelToValues = model => {
    return model
}

export const Proportions = compose(
    _Proportions,
    recipeFormPanel({id: 'proportions', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Proportions.propTypes = {
    recipeId: PropTypes.string
}
