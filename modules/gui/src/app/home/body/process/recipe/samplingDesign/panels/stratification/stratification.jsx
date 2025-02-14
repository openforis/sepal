import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import {StrataTable} from './strataTable'
import styles from './stratification.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || []
})

const fields = {
    requiresUpdate: new Form.Field(),
    unstratified: new Form.Field(),
    type: new Form.Field(),
    assetId: new Form.Field()
        .skip((_value, {unstratified, type}) => unstratified.length || type !== 'ASSET')
        .notBlank('process.samplingDesign.panel.stratification.form.asset.required'),
    recipeId: new Form.Field()
        .skip((_value, {unstratified, type}) => unstratified.length || type !== 'RECIPE')
        .notBlank('process.samplingDesign.panel.stratification.form.recipe.required'),
    band: new Form.Field()
        .skip((_value, {unstratified, type, assetId, recipeId}) =>
            unstratified.length
                || (type === 'ASSET' && !assetId)
                || (type === 'RECIPE' && !recipeId))
        .notBlank('process.samplingDesign.panel.stratification.form.band.required'),
    scale: new Form.Field()
        .skip((_value, {unstratified}) => unstratified.length)
        .notBlank('process.samplingDesign.panel.stratification.form.scale.required'),
    eeStrategy: new Form.Field(),
    strata: new Form.Field()
        .skip((_value, {unstratified}) => unstratified.length)
        .notBlank('process.samplingDesign.panel.stratification.form.band.required'),
}

class _Stratification extends React.Component {
    cancel$ = new Subject()
    state = {
        bands: undefined,
        entriesByBand: {},
    }

    constructor(props) {
        super(props)
        this.onTypeChanged = this.onTypeChanged.bind(this)
        this.onImageChanged = this.onImageChanged.bind(this)
        this.onImageLoading = this.onImageLoading.bind(this)
        this.onAssetLoaded = this.onAssetLoaded.bind(this)
        this.onRecipeLoaded = this.onRecipeLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onScaleChanged = this.onScaleChanged.bind(this)
        this.onEEStrategyChanged = this.onEEStrategyChanged.bind(this)
        this.onAreaPerStratumLoaded = this.onAreaPerStratumLoaded.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='map'
                    label={this.renderUntratified()}
                    title={msg('process.samplingDesign.panel.stratification.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {type}} = this.props
        return this.isStratified()
            ? (
                <Layout>
                    {type.value === 'ASSET' ? this.renderAsset() : null}
                    {type.value === 'RECIPE' ? this.renderRecipe() : null}
                    <Layout type='horizontal'>
                        {this.renderBand()}
                        {this.renderScale()}
                    </Layout>
                    {this.renderStrata()}
                </Layout>
            )
            : (
                <NoData
                    alignment='left'
                    message={msg('process.samplingDesign.panel.stratification.form.unstratified.message')}
                />
            )
    }

    renderUntratified() {
        const {inputs: {unstratified}} = this.props
        return (
            <Form.Buttons
                spacing='none'
                groupSpacing='none'
                size='small'
                shape='pill'
                input={unstratified}
                options={[
                    {
                        value: true,
                        label: msg('process.samplingDesign.panel.stratification.form.unstratified.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.unstratified.tooltip')
                    },
                ]}
                multiple
            />
        )
    }

    renderAsset() {
        const {inputs: {assetId}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.samplingDesign.panel.stratification.form.stratification.label')}
                autoFocus
                input={assetId}
                placeholder={msg('process.samplingDesign.panel.stratification.form.stratification.placeholder')}
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
                label={msg('process.samplingDesign.panel.stratification.form.stratification.label')}
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
                        label: msg('process.samplingDesign.panel.stratification.form.type.ASSET.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.type.ASSET.tooltip'),
                    },
                    {
                        value: 'RECIPE',
                        label: msg('process.samplingDesign.panel.stratification.form.type.RECIPE.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.type.RECIPE.tooltip')
                    },
                ]}
                onChange={this.onTypeChanged}
            />
        )
    }

    renderBand() {
        const {inputs: {band}} = this.props
        const {bands = []} = this.state
        const options = bands
            .map(band => ({value: band, label: band}))
        return (
            <FormCombo
                className={styles.band}
                input={band}
                disabled={!bands.length}
                options={options}
                label={msg('process.samplingDesign.panel.stratification.form.band.label')}
                placeholder={msg('process.samplingDesign.panel.stratification.form.band.placeholder')}
                tooltip={msg('process.samplingDesign.panel.stratification.form.band.tooltip')}
                onChange={this.onBandChanged}
            />
        )
    }
    
    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Form.Input
                className={styles.scale}
                label={msg('process.samplingDesign.panel.stratification.form.scale.label')}
                placeholder={msg('process.samplingDesign.panel.stratification.form.scale.placeholder')}
                tooltip={msg('process.samplingDesign.panel.stratification.form.scale.tooltip')}
                input={scale}
                type='number'
                suffix={msg('process.samplingDesign.panel.stratification.form.scale.suffix')}
                onChange={this.onScaleChanged}
            />
        )
    }

    renderStrata() {
        const {inputs: {eeStrategy, strata}} = this.props
        const editButton = (
            <Button
                key='edit'
                chromeless
                shape='circle'
                icon='edit'
                size='small'
                disabled={!strata.value}
                onClick={() => console.log('edit')}
            />
        )
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
                        tooltip: msg('process.samplingDesign.panel.stratification.form.unstratified.tooltip')
                    },
                    {
                        value: 'BATCH',
                        label: msg('batch'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.unstratified.tooltip')
                    },
                ]}
            />
        )
        return (
            <Widget
                label={msg('process.samplingDesign.panel.stratification.form.strata.label')}
                labelButtons={[editButton, eeStrategyButtons]}>
                {strata.value
                    ? <StrataTable strata={strata}/>
                    : this.props.stream('AREA_PER_STRATUM').active
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
                            message={msg('Select stratification and band.')}
                        />}
                
            </Widget>
        )
    }

    // TODO: Make sure stratification image is added to the recipe layers

    componentDidMount() {
        const {inputs: {requiresUpdate, unstratified, scale, type, eeStrategy}} = this.props
        requiresUpdate.set(false)
        unstratified.value || unstratified.set([])
        scale.value || scale.set('30')
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')
    }

    onTypeChanged() {
        const {inputs: {assetId, recipeId, band, strata}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        strata.set(null)
    }

    onImageChanged() {
        const {inputs: {band, strata}} = this.props
        console.log('onImageChanged')
        band.set(null)
        // strata.set(null)
        this.calculateAreaPerStratum()
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
        this.setState({bands})
        const categoricalVisualizations = visualizations
            .filter(({type}) => type === 'categorical')
        const defaultBand = bands.lenght === 1
            ? bands[0]
            : categoricalVisualizations.length === 1
                ? categoricalVisualizations[0].bands[0]
                : null
        const updateBand = defaultBand && defaultBand !== band.value
        updateBand && band.set(defaultBand)
        const entriesByBand = categoricalVisualizations.reduce(
            (acc, visualization) => {
                const entries = visualization.values.map((value, i) => ({
                    value,
                    label: visualization.labels[i],
                    color: visualization.palette[i]
                }))
                acc[visualization.bands[0]] = entries
                return acc
            },
            {}
        )
        
        this.setState({entriesByBand})
        updateBand && this.onBandChanged({value: defaultBand})
    }

    onBandChanged() {
        console.log('onBandChanged')
        this.calculateAreaPerStratum()
    }

    onScaleChanged() {
        console.log('onScaleChanged')
        this.calculateAreaPerStratum()
    }

    onEEStrategyChanged() {
        console.log('onBandChanged')
        this.calculateAreaPerStratum()
    }

    onAreaPerStratumLoaded(areaPerStratum) {
        const {inputs: {band, strata}} = this.props
        const {entriesByBand} = this.state
        // TODO: If we only changed the scale, any user-overriden labels should be kept
        //      That means labels should be reset when we change band
        const totalArea = areaPerStratum.reduce((acc, {area}) => acc + area, 0)
        const labeledStrata = areaPerStratum.map(({stratum, area}) => {
            const entries = entriesByBand[band.value] || []
            const entry = entries.find(({value}) => value === stratum)
            const weight = area / totalArea
            return {
                ...(entry || {value: stratum, label: '' + stratum, color: '#000000'}),
                area,
                weight
            }
        })
        strata.set(labeledStrata)
    }

    calculateAreaPerStratum() {
        const {aoi, stream, inputs: {scale, type, assetId, recipeId, band, eeStrategy, strata}} = this.props

        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        if (!scale.value || !id || !band.value) {
            return
        }
        
        strata.set(null)
        const stratification = {
            type: type.value === 'RECIPE' ? 'RECIPE_REF' : 'ASSET',
            id,
        }

        if (stream('AREA_PER_STRATUM').active) {
            this.cancel$.next()
        }

        stream('AREA_PER_STRATUM',
            api.gee.areaPerStratum$({
                aoi,
                stratification,
                band: band.value,
                scale: parseInt(scale.value),
                batch: eeStrategy.value === 'BATCH'
            }).pipe(
                takeUntil(this.cancel$)
            ),
            this.onAreaPerStratumLoaded,
            error => console.error('Something went wrong', error) // TODO:
        )
    }

    isStratified() {
        const {inputs: {unstratified}} = this.props
        return !unstratified.value?.length
    }
    // TODO: Trigger area calculation on any change. As long as all properties are specified. Cancel if not stratified
    // Not on mount, as we expect to already have areas persisted

}

const valuesToModel = values => {
    return {
        unstratified: values.unstratified?.length,
        scale: parseFloat(values.scale),
        type: values.type,
        assetId: values.assetId,
        recipeId: values.recipeId,
        band: values.band,
        strata: values.strata,
        eeStrategy: values.eeStrategy
    }
}

const modelToValues = model => {
    return {
        unstratified: model.unstratified ? [true] : [],
        scale: model.scale,
        type: model.type,
        assetId: model.assetId,
        recipeId: model.recipeId,
        band: model.band,
        strata: model.strata,
        eeStrategy: model.eeStrategy
    }
}

export const Stratification = compose(
    _Stratification,
    recipeFormPanel({id: 'stratification', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Stratification.propTypes = {
    recipeId: PropTypes.string
}
