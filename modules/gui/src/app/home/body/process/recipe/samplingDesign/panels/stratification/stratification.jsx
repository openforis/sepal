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
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {ButtonSelect} from '~/widget/buttonSelect'
import {downloadCsv} from '~/widget/download'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import {StrataTable} from './strataTable'
import styles from './stratification.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
    title: recipe.title || recipe.placeholder,
    stratificationRequiresUpdate: selectFrom(recipe, 'model.stratification.requiresUpdate'),
})

const fields = {
    requiresUpdate: new Form.Field(),
    skip: new Form.Field(),
    type: new Form.Field(),
    assetId: new Form.Field()
        .skip((_value, {skip, type}) => skip.length || type !== 'ASSET')
        .notBlank('process.samplingDesign.panel.stratification.form.asset.required'),
    recipeId: new Form.Field()
        .skip((_value, {skip, type}) => skip.length || type !== 'RECIPE')
        .notBlank('process.samplingDesign.panel.stratification.form.recipe.required'),
    band: new Form.Field()
        .skip((_value, {skip, type, assetId, recipeId}) =>
            skip.length
                || (type === 'ASSET' && !assetId)
                || (type === 'RECIPE' && !recipeId))
        .notBlank('process.samplingDesign.panel.stratification.form.band.required'),
    scale: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .notBlank('process.samplingDesign.panel.stratification.form.scale.required'),
    eeStrategy: new Form.Field(),
    strata: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .notBlank('process.samplingDesign.panel.stratification.form.band.required'),
}

class _Stratification extends React.Component {
    cancel$ = new Subject()
    state = {
        bands: undefined,
        entriesByBand: {},
        showHexColorCode: false
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
        this.onSkipToggled = this.onSkipToggled.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='map'
                    label={this.renderHeaderButtons()}
                    title={msg('process.samplingDesign.panel.stratification.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons>
                    {this.renderImportButton()}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {type, skip}} = this.props
        return !skip.value?.length
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
                    alignment='center'
                    message={msg('process.samplingDesign.panel.stratification.form.skip.message')}
                />
            )
    }

    renderHeaderButtons() {
        const {inputs: {skip}} = this.props
        return (
            <Form.Buttons
                spacing='tight'
                groupSpacing='none'
                size='small'
                shape='pill'
                input={skip}
                options={[
                    {
                        value: true,
                        label: msg('process.samplingDesign.panel.stratification.form.skip.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.skip.tooltip')
                    },
                ]}
                multiple
                onChange={this.onSkipToggled}
            />
        )
    }

    renderImportButton() {
        const {inputs: {strata}} = this.props
        const options = [
            {
                value: 'import',
                label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                onSelect: () => this.importLegend()
            },
            {
                value: 'export',
                label: msg('map.legendBuilder.load.options.exportToCsv.label'),
                disabled: !strata.value || !strata.value.length,
                onSelect: () => this.exportStratification()
            }
        ]
        return (
            <ButtonSelect
                icon={'file'}
                label={msg('CSV')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
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
        const {showHexColorCode} = this.state
        const hexCodeButton = (
            <Button
                key={'showHexColorCode'}
                look={showHexColorCode ? 'selected' : 'default'}
                size='x-small'
                shape='pill'
                label={msg('process.samplingDesign.panel.stratification.form.hexButton.label')}
                tooltip={msg('process.samplingDesign.panel.stratification.form.hexButton.tooltip')}
                onClick={() => this.toggleshowHexColorCode()}
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
                        label: msg('process.samplingDesign.panel.stratification.form.eeStrategy.online.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.eeStrategy.online.tooltip')
                    },
                    {
                        value: 'BATCH',
                        label: msg('process.samplingDesign.panel.stratification.form.eeStrategy.batch.label'),
                        tooltip: msg('process.samplingDesign.panel.stratification.form.eeStrategy.batch.tooltip')
                    },
                ]}
            />
        )
        return (
            <Widget
                label={msg('process.samplingDesign.panel.stratification.form.strata.label')}
                labelButtons={[hexCodeButton, eeStrategyButtons]}>
                {strata.value
                    ? <StrataTable
                        strata={strata}
                        showHexColorCode={showHexColorCode}
                    />
                    : this.props.stream('AREA_PER_STRATUM').active
                        ? <NoData
                            className={styles.noData}
                            alignment='left'
                            message={(
                                <div>
                                    <Icon name='spinner'/>
                                    {' ' + msg('process.samplingDesign.panel.stratification.form.strata.loading')}
                                </div>
                            )}
                        />
                        : <NoData
                            className={styles.noData}
                            alignment='left'
                            message={msg('process.samplingDesign.panel.stratification.form.strata.select')}
                        />}
            </Widget>
        )
    }

    componentDidMount() {
        const {stratificationRequiresUpdate, inputs: {requiresUpdate, skip, scale, type, eeStrategy}} = this.props
        requiresUpdate.set(false)
        skip.value || skip.set([])
        scale.value || scale.set('30')
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')

        stratificationRequiresUpdate && this.calculateAreaPerStratum()
    }

    componentDidUpdate(prevProps) {
        const {inputs, importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries && !_.isEqual(importedLegendEntries, prevProps.importedLegendEntries)) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            const updatedStrata = inputs.strata.value.map(stratum => {
                const updatedStratum = importedLegendEntries.find(({value}) => value === stratum.value) || {}
                return ({
                    ...stratum,
                    ..._.pick(updatedStratum, ['color', 'label'])
                })
            })
            inputs.strata.set(updatedStrata)
        }
    }

    toggleshowHexColorCode() {
        this.setState(({showHexColorCode}) => ({showHexColorCode: !showHexColorCode}))
    }

    onTypeChanged() {
        const {inputs: {assetId, recipeId, band, strata}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        strata.set(null)
    }

    onImageChanged() {
        const {inputs: {band}} = this.props
        band.set(null)
        this.calculateAreaPerStratum()
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
        setImmediate(() => this.calculateAreaPerStratum())
    }

    onScaleChanged() {
        setImmediate(() => this.calculateAreaPerStratum())
    }

    onEEStrategyChanged() {
        setImmediate(() => this.calculateAreaPerStratum())
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

    onSkipToggled(skip) {
        const isSkipped = !!skip?.length
        if (!isSkipped) {
            this.calculateAreaPerStratum()
        }

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
            error => {
                const errorMessage = error?.response?.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : error
                Notifications.error({
                    message: msg('process.samplingDesign.panel.stratification.loadError'),
                    error: errorMessage,
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    updateImageLayerSources(source) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_STRATIFICATION_IMAGE_LAYER_SOURCE', {source})
            .set(['layers.additionalImageLayerSources', {id: source.id}], source)
            .dispatch()
    }
    
    exportStratification() {
        const {title, inputs: {strata}} = this.props
        const csv = [
            ['color,value,label,area,weight'],
            strata.value.map(({color, value, label, area, weight}) => `${color},${value},"${label.replaceAll('"', '\\"')}",${area},${weight}`)
        ].flat().join('\n')
        const filename = `${title}_stratification.csv`
        downloadCsv(csv, filename)
    }
    
    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate()
    }

}

const valuesToModel = values => {
    const isSkipped = !!values.skip?.length
    return {
        skip: isSkipped,
        scale: parseFloat(values.scale),
        type: values.type,
        assetId: values.assetId,
        recipeId: values.recipeId,
        band: values.band,
        strata: isSkipped
            ? [{
                color: '#000000',
                label: msg('process.samplingDesign.panel.stratification.unstratified'),
                value: 1,
                weight: 1
            }]
            : values.strata,
        eeStrategy: values.eeStrategy
    }
}

const modelToValues = model => {
    return {
        skip: model.skip ? [true] : [],
        scale: model.scale,
        type: model.type,
        assetId: model.assetId,
        recipeId: model.recipeId,
        band: model.band,
        strata: model.strata,
        eeStrategy: model.eeStrategy
    }
}

const additionalPolicy = () => ({
    _: 'disallow',
    legendImport: 'allow'
})

export const Stratification = compose(
    _Stratification,
    recipeFormPanel({id: 'stratification', fields, mapRecipeToProps, additionalPolicy, modelToValues, valuesToModel}),
    withActivators('legendImport')
)

Stratification.propTypes = {
    recipeId: PropTypes.string
}
