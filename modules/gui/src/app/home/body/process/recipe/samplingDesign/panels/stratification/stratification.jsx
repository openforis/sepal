import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {recipeVisualizationsNaming} from '~/app/home/body/process/recipe/outputs/visualizations'
import {RecipeInput} from '~/app/home/body/process/recipe/sources/recipeInput'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {ButtonSelect} from '~/widget/buttonSelect'
import {downloadCsv} from '~/widget/download'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import {STRATUM_AREAS_CALCULATION} from '../../calculations'
import {awaitedResultFeedback, editedResultFeedback} from '../../freshnessRequirements'
import {getDefaultModel} from '../../sampling/defaultModel'
import {effectiveStratificationGrid, stratificationGridFromBand} from '../../samplingGridValidation'
import {CalculationErrorContent} from '../calculationErrorContent'
import {CalculationProgress} from '../calculationProgress'
import {StrataTable} from './strataTable'
import styles from './stratification.module.css'
import {strataCalculationError as toStrataCalculationError} from './stratificationError'
import {modelToValues, syntheticUnstratifiedStratum, valuesToModel} from './stratificationModel'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
    title: recipe.title || recipe.placeholder
})

const fields = {
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
    // Optional OVERRIDES: blank means "use what this selection provides", which the placeholders show. An
    // entered Scale still has to be a usable one - clearing the field asks for the default, typing 0 does not.
    scale: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .number()
        .greaterThan(0),
    crs: new Form.Field(),
    // Transient: what the current source and band provide, shown as the placeholders and consolidated into the
    // persisted grid by valuesToModel. Never part of the model.
    sourceCrs: new Form.Field(),
    sourceScale: new Form.Field(),
    eeStrategy: new Form.Field(),
    strata: new Form.Field()
        // Required even when skipped: unstratified mode still needs the single synthetic stratum (area is
        // filled at the export boundary), so an empty strata is invalid.
        .notEmpty('process.samplingDesign.panel.stratification.form.strata.required'),
    // What the strata were calculated from (#sepal/recipe/samplingDesign/stratumFrame), set with them and only
    // with them.
    strataCalculatedFrom: new Form.Field()
}

class _Stratification extends React.Component {
    // Not React state: nothing renders from it, and the band defaults are applied from the same callback that
    // receives it, where a queued setState would not have landed yet.
    bandMetadata = undefined
    state = {
        bands: undefined,
        prevStrata: [],
        entriesByBand: {},
        showHexColorCode: false,
        more: false
    }

    constructor(props) {
        super(props)
        this.onTypeChanged = this.onTypeChanged.bind(this)
        this.onImageChanged = this.onImageChanged.bind(this)
        this.onImageLoading = this.onImageLoading.bind(this)
        this.onAssetLoaded = this.onAssetLoaded.bind(this)
        this.onRecipeBandsLoaded = this.onRecipeBandsLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onSkipToggled = this.onSkipToggled.bind(this)
        // Stratified only - unstratified mode never calculates areas (its synthetic row is set directly).
        this.areas().onAnswer(({groups, calculatedFrom}) => this.onAreaPerStratumLoaded(groups, calculatedFrom))
    }

    render() {
        const {more} = this.state
        const {inputs: {skip}} = this.props
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
                    {!skip.value?.length ? (
                        <Button
                            label={more ? msg('button.less') : msg('button.more')}
                            onClick={() => this.setState(({more}) => ({more: !more}))}
                        />
                    ) : null}
                    {this.renderImportButton()}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {type, skip}} = this.props
        // Resolved once and handed to both fields, so a placeholder can never disagree with what Apply stores.
        const grid = this.effectiveGrid()
        return !skip.value?.length
            ? (
                <Layout>
                    {type.value === 'ASSET' ? this.renderAsset() : null}
                    {type.value === 'RECIPE' ? this.renderRecipe() : null}
                    <Layout type='horizontal'>
                        {this.renderBand()}
                        {this.renderScale(grid)}
                    </Layout>
                    {this.state.more ? this.renderCrs(grid) : null}
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
                input={skip}
                options={[
                    {
                        value: true,
                        icon: 'minus-circle',
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
        const {inputs: {skip, strata}} = this.props
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
                label={msg('process.samplingDesign.panel.stratification.form.csv.label')}
                placement='above'
                tooltipPlacement='bottom'
                disabled={skip.value?.length}
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
                includeNominalScale
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
                filter={isImageSource}
                labelButtons={[this.renderType()]}
                autoFocus
                onChange={this.onImageChanged}
                onLoading={this.onImageLoading}
                onBandsLoaded={this.onRecipeBandsLoaded}
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
                className={styles.wideField}
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
    
    renderScale({scale: effectiveScale}) {
        const {inputs: {scale}} = this.props
        return (
            <Form.Input
                className={styles.compactField}
                label={msg('process.samplingDesign.panel.stratification.form.scale.label')}
                placeholder={effectiveScale === null ? '' : String(effectiveScale)}
                tooltip={msg('process.samplingDesign.panel.stratification.form.scale.tooltip')}
                input={scale}
                type='number'
                suffix={msg('process.samplingDesign.panel.stratification.form.scale.suffix')}
            />
        )
    }

    renderCrs({crs: effectiveCrs}) {
        const {inputs: {crs}} = this.props
        // Free text, not the curated combo: Stratification names the projection the categorical source is
        // interpreted in, which is whatever the source was authored in - not one of the equal-area placement
        // options. A grid change asks the areas again, and the planner invalidates proportions and allocation.
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.stratification.form.crs.label')}
                placeholder={effectiveCrs}
                tooltip={msg('process.samplingDesign.panel.stratification.form.crs.tooltip')}
                input={crs}
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
                disabled={this.areas().calculating() || !strata.value?.length}
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
                labelButtons={[hexCodeButton, eeStrategyButtons]}
                {...editedResultFeedback('stratification', this.areas())}>
                {this.renderStrataContent()}
            </Widget>
        )
    }

    renderStrataContent() {
        const {inputs: {band, eeStrategy, strata}} = this.props
        const {showHexColorCode} = this.state
        const failure = this.areas().failure()
        const awaited = awaitedResultFeedback('stratification', this.areas())
        if (this.areas().calculating() || awaited?.checking) {
            return (
                <NoData
                    className={styles.noData}
                    alignment='left'
                    message={this.renderProgress(awaited)}
                />
            )
        }
        if (failure?.superseded) {
            return this.renderStrataError({
                strategy: eeStrategy.value,
                message: msg('process.samplingDesign.panel.stratification.form.result.superseded')
            })
        }
        if (failure?.error) {
            return this.renderStrataError(toStrataCalculationError({error: failure.error, strategy: eeStrategy.value}))
        }
        if (strata.value?.length && band.value) {
            return (
                <StrataTable
                    strata={strata}
                    showHexColorCode={showHexColorCode}
                />
            )
        }
        return (
            <NoData
                className={styles.noData}
                alignment='left'
                message={awaited?.message || msg(
                    band.value
                        ? 'process.samplingDesign.panel.stratification.form.strata.noData'
                        : 'process.samplingDesign.panel.stratification.form.strata.select'
                )}
            />
        )
    }

    // A short calculation status, with a separate explanation only for legacy results.
    renderProgress(awaited) {
        const updating = this.areas().updating()
        return (
            <CalculationProgress
                status={awaited?.message || msg(updating
                    ? `process.samplingDesign.panel.stratification.form.strata.updating.${updating}`
                    : 'process.samplingDesign.panel.stratification.form.strata.loading')}
                explanation={updating === 'UNKNOWN' ? msg('process.samplingDesign.panel.stratification.form.strata.updatingReason.UNKNOWN') : null}
            />
        )
    }

    renderStrataError(error) {
        return (
            <NoData
                className={styles.noData}
                alignment='left'
                message={
                    <CalculationErrorContent
                        error={error}
                        onRetry={() => this.areas().retry()}
                        onUseBatch={() => this.useBatch()}
                    />
                }
            />
        )
    }

    // Asked again as a batch task: the binding asks once in each mode.
    useBatch() {
        const {inputs: {eeStrategy}} = this.props
        eeStrategy.set('BATCH')
    }

    // What opening the panel calculates is its binding's (calculatedResult.js): areas this design does not hold yet, or
    // holds stale or without evidence, in the mode chosen beside them.
    componentDidMount() {
        const {inputs: {skip, crs, type, eeStrategy, strata}} = this.props
        skip.value || skip.set([])
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')
        // Reveal the advanced options when the design is on something other than the default CRS, so a saved
        // choice is never hidden behind a button.
        if (crs.value) {
            this.revealNonDefaultCrs(this.effectiveGrid().crs)
        }

        if (skip.value?.length && !strata.value?.length) {
            strata.set([this.unstratifiedStratum()])
        }
    }

    unstratifiedStratum() {
        return syntheticUnstratifiedStratum(msg('process.samplingDesign.panel.stratification.unstratified'))
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
        const {inputs: {assetId, recipeId, band}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        this.clearSelectionGrid()
        this.invalidateStrata(true)
    }

    onImageChanged() {
        const {inputs: {band}} = this.props
        band.set(null)
        this.clearSelectionGrid()
        this.invalidateStrata(true)
    }

    // Loading also happens when a saved recipe opens, so this must not touch the grid: the saved CRS and Scale
    // stay exactly as saved. Only an actual source, type or band replacement re-derives them.
    onImageLoading() {
        this.bandMetadata = undefined
        this.setState({bands: undefined})
    }

    // The grid belongs to the band it was calculated for, so replacing the source drops both the override and
    // the source values it resolved against. The next band selection installs the new defaults.
    clearSelectionGrid() {
        const {inputs: {crs, scale, sourceCrs, sourceScale}} = this.props
        sourceCrs.setInitialValue(null)
        sourceScale.setInitialValue(null)
        crs.set(null)
        scale.set(null)
    }

    effectiveGrid() {
        const {inputs: {crs, scale, sourceCrs, sourceScale}} = this.props
        return effectiveStratificationGrid({
            crs: crs.value, scale: scale.value, sourceCrs: sourceCrs.value, sourceScale: sourceScale.value
        })
    }

    // What the current source and band provide. Applied when a band is selected, and again when metadata
    // arrives for the band already selected - it only ever writes the transient fields, so a saved or entered
    // override is never touched.
    //
    // setInitialValue, not set: these are the panel's reading of the source rather than anything the user
    // changed, so learning them must not mark a reopened recipe as edited.
    //
    // Returns what it installed: setInitialValue lands through setState, so the caller cannot read it back
    // from the input in the same tick.
    installSourceGrid() {
        const {inputs: {band, sourceCrs, sourceScale}} = this.props
        const grid = stratificationGridFromBand(this.bandMetadata, band.value)
        sourceCrs.setInitialValue(grid.crs)
        sourceScale.setInitialValue(grid.scale)
        return grid
    }

    onAssetLoaded({metadata, visualizations}) {
        const bands = metadata.bands.map(({id}) => id) || []
        // Carries each band's own CRS and nominal scale, which is what a band selection defaults the grid to.
        this.bandMetadata = metadata.bands
        this.onImageLoaded(bands, visualizations)
    }

    onRecipeBandsLoaded({bandNames: bands, recipe}) {
        // A recipe is a computed image: it reports Earth Engine's degree-scale default rather than a grid, so
        // there is nothing to derive and a band selection takes the plain default.
        this.bandMetadata = undefined
        this.onImageLoaded(bands, recipeVisualizationsNaming(recipe, bands))
    }

    onImageLoaded(bands, visualizations) {
        const {inputs: {band}} = this.props
        this.setState({bands})
        // Reopening a saved recipe arrives here with its band already selected: the placeholders need the
        // source values, while the saved CRS and Scale stay exactly as saved.
        if (band.value) {
            const {crs} = this.props.inputs
            const grid = this.installSourceGrid()
            this.revealNonDefaultCrs(crs.value || grid.crs)
        }
        const categoricalVisualizations = visualizations
            .filter(({type}) => type === 'categorical')
        const defaultBand = bands.length === 1
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

    // A band selection IS a grid selection: the two visible fields are set from that band's own CRS and its
    // nominal scale in metres, and the user may then overrule either. Reopening a saved recipe does not come
    // through here - the saved band is already selected - so a saved grid is never overwritten.
    // A band selection IS a grid selection: any override belonged to the previous band, so it is cleared and
    // the new band's own CRS and metre scale become what the blank fields resolve to.
    // A band selection is a grid selection: any override belonged to the previous band, so it is cleared, and
    // what this band provides becomes what the now-blank fields resolve to and show as placeholders.
    onBandChanged() {
        const {inputs: {crs, scale}} = this.props
        const grid = this.installSourceGrid()
        crs.set(null)
        scale.set(null)
        // The override was just cleared, so the new source CRS is the effective one.
        this.revealNonDefaultCrs(grid.crs)
        this.invalidateStrata(true)
    }

    // A projected CRS is persisted and drives every area, so it must not sit hidden behind the More button
    // just because the user never opened it.
    revealNonDefaultCrs(crs) {
        if (crs !== getDefaultModel().stratification.crs && !this.state.more) {
            this.setState({more: true})
        }
    }

    // Recalculated strata keep their own labels and colors. Strata replacing another selection's take the source's
    // legend, and those of the strata they replace only where it has none.
    onAreaPerStratumLoaded(areaPerStratum, calculatedFrom) {
        const {inputs: {band, strata, strataCalculatedFrom}} = this.props
        const {prevStrata, entriesByBand} = this.state
        const recalculated = strata.value?.length ? strata.value : null
        const totalArea = areaPerStratum.reduce((acc, {area}) => acc + area, 0)
        const entries = entriesByBand[band.value] || []
        const labeledStrata = areaPerStratum.map(({stratum, area}) => {
            const entry = entries.find(({value}) => value === stratum)
            const prevEntry = (recalculated || prevStrata)?.find(({value}) => value == stratum)
            const weight = area / totalArea
            return {
                ...((recalculated ? prevEntry || entry : entry || prevEntry) || {value: stratum, label: '' + stratum, color: '#000000'}),
                area,
                weight
            }
        })
        strata.set(labeledStrata)
        strataCalculatedFrom.set(calculatedFrom)
    }

    // Form.Buttons calls onChange(nextSkip) AFTER input.set(nextSkip); skip.value can still be stale here, so
    // we branch on the passed nextSkip, never on skip.value.
    onSkipToggled(nextSkip) {
        const {inputs: {strata}} = this.props
        const unstratified = !!nextSkip?.length
        // nextSkip is the only reliable mode signal during the toggle callback.
        this.invalidateStrata(unstratified)
        if (unstratified) {
            strata.set([this.unstratifiedStratum()])
        }
    }

    // Strata of a selection replaced: kept for their labels and colors, never the synthetic unstratified row's. What a
    // calculation still running answers is not these strata's once what it was asked changes; the binding cancels it then.
    invalidateStrata(preserveStrata) {
        const {inputs: {skip, strata, strataCalculatedFrom}} = this.props
        const preserve = preserveStrata === undefined ? !skip.value?.length : preserveStrata
        if (strata.value && preserve) {
            this.setState({prevStrata: strata.value})
        }
        strata.set(null)
        strataCalculatedFrom.set(null)
    }

    // Stratified area per stratum, through the binding the panel is given for it (calculatedResult.js). Unstratified
    // mode calculates none: it sets the synthetic row directly and the AOI area is computed at the export boundary.
    areas() {
        return this.props.calculatedResults[STRATUM_AREAS_CALCULATION]
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

// Only add the Legend Import exception; let recipeFormPanel's default `_` flow through, so a clean panel
// allows switching directly to other panels (allow-then-deactivate) while a dirty panel stays blocked.
const additionalPolicy = () => ({
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
