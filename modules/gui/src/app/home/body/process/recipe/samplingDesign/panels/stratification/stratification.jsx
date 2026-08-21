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
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import {deriveStratificationGrid, isValidGridScale, resolveStratificationGridState} from '../../samplingGridValidation'
import {CalculationErrorContent} from '../calculationErrorContent'
import {StrataTable} from './strataTable'
import styles from './stratification.module.css'
import {strataCalculationError as toStrataCalculationError} from './stratificationError'
import {modelToValues, syntheticUnstratifiedStratum, valuesToModel} from './stratificationModel'

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
    // Blank means "use what the placeholder shows", as Min distance already does. Nothing is required, so nothing
    // derived is ever written into a user-facing field and there is no value for a later read to race against.
    scale: new Form.Field()
        .skip((_value, {skip}) => skip.length)
        .number()
        .greaterThan(0),
    crs: new Form.Field(),
    // Panel-owned OUTPUTS: written by the sync, rendered by nothing, mapped into the model so the task boundary
    // always sees a concrete grid even when both user fields are blank.
    resolvedCrs: new Form.Field(),
    resolvedScale: new Form.Field(),
    crsTransform: new Form.Field(),
    eeStrategy: new Form.Field(),
    strata: new Form.Field()
        // Required even when skipped: unstratified mode still needs the single synthetic stratum (area is
        // filled at the export boundary), so an empty strata is invalid.
        .notEmpty('process.samplingDesign.panel.stratification.form.strata.required'),
}

class _Stratification extends React.Component {
    cancel$ = new Subject()
    // Separate from cancel$, which belongs to AREA_PER_STRATUM: cancelling an area calculation must not cancel a
    // grid fetch, or the reverse.
    cancelBandGrids$ = new Subject()
    state = {
        bands: undefined,
        bandGrids: undefined,
        prevStrata: [],
        entriesByBand: {},
        showHexColorCode: false,
        strataCalculationError: null,
        more: false
    }

    constructor(props) {
        super(props)
        this.onTypeChanged = this.onTypeChanged.bind(this)
        this.onImageChanged = this.onImageChanged.bind(this)
        this.onImageLoading = this.onImageLoading.bind(this)
        this.onAssetLoaded = this.onAssetLoaded.bind(this)
        this.onRecipeLoaded = this.onRecipeLoaded.bind(this)
        this.onBandChanged = this.onBandChanged.bind(this)
        this.onGridChanged = this.onGridChanged.bind(this)
        this.onEEStrategyChanged = this.onEEStrategyChanged.bind(this)
        this.onAreaPerStratumLoaded = this.onAreaPerStratumLoaded.bind(this)
        this.onSkipToggled = this.onSkipToggled.bind(this)
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
        // Resolved ONCE and handed to both fields, so a placeholder can never read a key the object does not have.
        const grid = this.gridState()
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
    
    // Both fields take the SAME resolved object, destructured once by the caller. Picking keys out of it
    // separately in each render is what has produced every placeholder defect in this panel.
    renderScale({mode, placeholderScale}) {
        const {inputs: {scale}} = this.props
        return (
            <Form.Input
                className={styles.compactField}
                label={msg('process.samplingDesign.panel.stratification.form.scale.label')}
                // Blank ALWAYS resolves, so the placeholder always names what it resolves to: the band's pixel
                // size when a grid was derived, the default otherwise. The tooltip still branches, because with
                // no derived grid there is genuinely no grid mode to name.
                placeholder={String(placeholderScale)}
                tooltip={mode === 'none'
                    ? msg('process.samplingDesign.panel.stratification.form.scale.tooltip')
                    : msg(`process.samplingDesign.panel.stratification.form.scale.mode.${mode}`)}
                input={scale}
                type='number'
                suffix={msg('process.samplingDesign.panel.stratification.form.scale.suffix')}
                onChange={this.onGridChanged}
            />
        )
    }

    // Derive ON DEMAND from the cached response, so changing the selected band needs no refetch. bands$ returns a
    // bare array while assetMetadata returns {bands}; the band entries themselves are identical, so this wraps
    // rather than branches.
    derivedGrid() {
        const {inputs: {band}} = this.props
        const {bandGrids} = this.state
        const grid = deriveStratificationGrid({bands: bandGrids}, band.value)
        const nominalScale = Number((bandGrids || []).find(({id}) => id === band.value)?.nominalScale)
        return grid && Number.isFinite(nominalScale) && nominalScale > 0
            ? {...grid, pixelSizeMetres: nominalScale}
            : null
    }

    gridState() {
        const {inputs: {crs, scale}} = this.props
        return resolveStratificationGridState({derived: this.derivedGrid(), crs: crs.value, scale: scale.value})
    }

    // ONE evaluation from the derived grid plus the USER fields; the three resolved fields are outputs that
    // nothing reads back. Several writes, no reads - the shape that does not race.
    syncResolvedGrid() {
        const {inputs: {resolvedCrs, resolvedScale, crsTransform}} = this.props
        const resolved = this.gridState()
        const serialized = resolved.crsTransform ? JSON.stringify(resolved.crsTransform) : null
        resolvedCrs.value === resolved.crs || resolvedCrs.set(resolved.crs)
        Number(resolvedScale.value) === resolved.scale || resolvedScale.set(resolved.scale)
        ;(crsTransform.value || null) === serialized || crsTransform.set(serialized)
    }

    // Runs for every source type: both onAssetLoaded and onRecipeLoaded funnel through onImageLoaded. The fetch
    // never gates the panel - while it is in flight there is no derived grid, so Scale is simply required, as
    // today. No loading state, no disabled fields.
    loadBandGrids() {
        const {stream, inputs: {type, assetId, recipeId}} = this.props
        if (stream('BAND_GRIDS').active) {
            this.cancelBandGrids$.next()
        }
        const source = type.value === 'RECIPE'
            ? {recipe: {type: 'RECIPE_REF', id: recipeId.value}}
            : {asset: assetId.value}
        stream('BAND_GRIDS',
            api.gee.bands$(source).pipe(
                takeUntil(this.cancelBandGrids$)
            ),
            bandGrids => this.setState({bandGrids}, () => this.syncResolvedGrid()),
            // No grid is not an error: nothing could be derived, so Scale stays required and the panel is
            // unchanged. Reported nowhere, because there is nothing for the user to act on.
            () => this.setState({bandGrids: []}, () => this.syncResolvedGrid())
        )
    }

    renderCrs({placeholderCrs}) {
        const {inputs: {crs}} = this.props
        // Free text, not the curated combo: Stratification names the projection the categorical source is
        // interpreted in, which is whatever the source was authored in - not one of the equal-area placement
        // options. onGridChanged still runs, so a grid change invalidates areas, proportions and allocation.
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.stratification.form.crs.label')}
                placeholder={placeholderCrs}
                tooltip={msg('process.samplingDesign.panel.stratification.form.crs.tooltip')}
                input={crs}
                onChange={this.onGridChanged}
            />
        )
    }

    renderStrata() {
        const {stream, inputs: {eeStrategy, strata}} = this.props
        const {showHexColorCode} = this.state
        const hexCodeButton = (
            <Button
                key={'showHexColorCode'}
                look={showHexColorCode ? 'selected' : 'default'}
                size='x-small'
                shape='pill'
                label={msg('process.samplingDesign.panel.stratification.form.hexButton.label')}
                tooltip={msg('process.samplingDesign.panel.stratification.form.hexButton.tooltip')}
                disabled={stream('AREA_PER_STRATUM').active || !strata.value?.length}
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
                onChange={this.onEEStrategyChanged}
            />
        )

        return (
            <Widget
                label={msg('process.samplingDesign.panel.stratification.form.strata.label')}
                labelButtons={[hexCodeButton, eeStrategyButtons]}>
                {this.renderStrataContent()}
            </Widget>
        )
    }

    renderStrataContent() {
        const {stream, inputs: {band, strata}} = this.props
        const {showHexColorCode, strataCalculationError} = this.state
        if (stream('AREA_PER_STRATUM').active) {
            return (
                <NoData
                    className={styles.noData}
                    alignment='left'
                    message={(
                        <div>
                            <Icon name='spinner'/>
                            {' ' + msg('process.samplingDesign.panel.stratification.form.strata.loading')}
                        </div>
                    )}
                />
            )
        }
        if (strataCalculationError) {
            return this.renderStrataError(strataCalculationError)
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
                message={msg(
                    band.value
                        ? 'process.samplingDesign.panel.stratification.form.strata.noData'
                        : 'process.samplingDesign.panel.stratification.form.strata.select'
                )}
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
                        onRetry={() => this.scheduleAreaPerStratum()}
                        onUseBatch={() => this.useBatch()}
                    />
                }
            />
        )
    }

    useBatch() {
        const {inputs: {eeStrategy}} = this.props
        eeStrategy.set('BATCH')
        // set() doesn't fire the eeStrategy onChange (that's a UI-only callback), so schedule explicitly.
        // scheduleAreaPerStratum defers via setImmediate, by which point eeStrategy.value has settled to BATCH.
        this.scheduleAreaPerStratum()
    }

    componentDidMount() {
        const {stratificationRequiresUpdate, inputs: {requiresUpdate, skip, crs, type, eeStrategy, strata}} = this.props
        requiresUpdate.set(false)
        skip.value || skip.set([])
        // Both user fields start blank: the placeholders show what blank resolves to.
        type.value || type.set('ASSET')
        eeStrategy.value || eeStrategy.set('ONLINE')
        // Reveal the advanced options when a CRS was explicitly entered, so the setting is discoverable.
        if (crs.value) {
            this.setState({more: true})
        }

        if (stratificationRequiresUpdate) {
            if (skip.value?.length) {
                strata.set([this.unstratifiedStratum()])
            } else {
                if (strata.value) {
                    this.setState({prevStrata: strata.value})
                }
                strata.set(null)
                this.calculateAreaPerStratum()
            }
        } else if (skip.value?.length && !strata.value?.length) {
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
        const {inputs: {assetId, recipeId, band, strata}} = this.props
        recipeId.set(null)
        assetId.set(null)
        band.set(null)
        if (strata.value) {
            this.setState({prevStrata: strata.value})
        }
        this.clearStrataCalculationError()
        strata.set(null)
    }

    onImageChanged() {
        const {inputs: {band, strata}} = this.props
        band.set(null)
        if (strata.value) {
            this.setState({prevStrata: strata.value})
        }
        this.clearStrataCalculationError()
        strata.set(null)
    }

    onImageLoading() {
        const {inputs: {crs, scale}} = this.props
        // Clear, never set: the placeholder re-derives on its own, and asset-to-recipe needs no special case.
        crs.set(null)
        scale.set(null)
        this.setState({bands: undefined, bandGrids: undefined})
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
        this.loadBandGrids()
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

    onBandChanged() {
        this.syncResolvedGrid()
        this.scheduleAreaPerStratum()
    }

    onGridChanged() {
        this.syncResolvedGrid()
        this.scheduleAreaPerStratum()
    }

    onEEStrategyChanged() {
        this.scheduleAreaPerStratum()
    }

    // Stratified only - unstratified mode never runs areaPerStratum$ (its synthetic row is set directly).
    onAreaPerStratumLoaded(areaPerStratum) {
        const {inputs: {band, strata}} = this.props
        const {prevStrata, entriesByBand} = this.state
        this.clearStrataCalculationError()
        const totalArea = areaPerStratum.reduce((acc, {area}) => acc + area, 0)
        const entries = entriesByBand[band.value] || []
        const labeledStrata = areaPerStratum.map(({stratum, area}) => {
            const entry = entries.find(({value}) => value === stratum)
            const prevEntry = prevStrata?.find(({value}) => value == stratum)
            const weight = area / totalArea
            return {
                ...(entry || prevEntry || {value: stratum, label: '' + stratum, color: '#000000'}),
                area,
                weight
            }
        })
        strata.set(labeledStrata)
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
        } else {
            setImmediate(() => this.calculateAreaPerStratum())
        }
    }

    // Clear first so stale strata cannot be applied while the replacement calculation is pending.
    scheduleAreaPerStratum() {
        this.invalidateStrata()
        setImmediate(() => this.calculateAreaPerStratum())
    }

    // Preserve label/color for real strata, never for the synthetic unstratified row.
    invalidateStrata(preserveStrata) {
        const {inputs: {skip, strata}} = this.props
        const preserve = preserveStrata === undefined ? !skip.value?.length : preserveStrata
        if (strata.value && preserve) {
            this.setState({prevStrata: strata.value})
        }
        this.clearStrataCalculationError()
        strata.set(null)
    }

    // The EE calculation error is kept in component state rather than the `strata` form field, so it never
    // collides with the field's `.notEmpty` required message: the required message keeps gating Apply while
    // the friendly select/no-data body copy still shows for ordinary empty state.
    clearStrataCalculationError() {
        if (this.state.strataCalculationError) {
            this.setState({strataCalculationError: null})
        }
    }

    // Stratified area per stratum. Unstratified mode never calls this - it sets the synthetic row directly
    // and the AOI area is computed at the export boundary.
    calculateAreaPerStratum() {
        const {aoi, areaCache, stream, inputs: {type, assetId, recipeId, band, eeStrategy}} = this.props
        const id = type.value === 'RECIPE' ? recipeId.value : assetId.value
        // onChange fires while typing; the resolved scale is only invalid mid-keystroke, since blank resolves.
        if (!isValidGridScale(this.gridState().scale) || !id || !band.value) {
            return
        }
        const stratification = {
            type: type.value === 'RECIPE' ? 'RECIPE_REF' : 'ASSET',
            id,
        }
        const resolved = this.gridState()
        // The resolved grid, so areas are computed on the grid the design actually uses. Scale XOR transform,
        // built once so the cache key and the request body cannot describe different grids.
        const grid = resolved.crsTransform
            ? {crsTransform: resolved.crsTransform}
            : {scale: resolved.scale}
        // What the areas actually depend on. The processing strategy is absent because Online and Batch
        // compute the same thing, and presentation is absent because the loader applies the CURRENT labels
        // and colors to whatever raw response it is handed.
        const key = {stratification, band: band.value, crs: resolved.crs, ...grid}

        if (stream('AREA_PER_STRATUM').active) {
            this.cancel$.next()
        }

        const cached = areaCache?.get({aoi, key})
        if (cached) {
            this.onAreaPerStratumLoaded(cached)
            return
        }

        stream('AREA_PER_STRATUM',
            api.gee.areaPerStratum$({
                aoi,
                stratification,
                band: band.value,
                ...grid,
                crs: resolved.crs,
                batch: eeStrategy.value === 'BATCH'
            }).pipe(
                takeUntil(this.cancel$)
            ),
            // Cached BEFORE the join, so a hit is the raw response and picks up current presentation. A
            // failure never reaches here, so it can never displace an older successful entry.
            areaPerStratum => {
                areaCache?.set({aoi, key, result: areaPerStratum})
                this.onAreaPerStratumLoaded(areaPerStratum)
            },
            error => this.setState({
                strataCalculationError: toStrataCalculationError({error, strategy: eeStrategy.value})
            })
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
