import _ from 'lodash'
import React from 'react'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Buttons} from '~/widget/buttons'
import {ButtonSelect} from '~/widget/buttonSelect'
import {ColorElement} from '~/widget/colorElement'
import {Combo} from '~/widget/combo'
import {downloadCsv} from '~/widget/download'
import {Constraint} from '~/widget/imageConstraints/constraint'
import {Input} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RemoveButton} from '~/widget/removeButton'
import {Slider} from '~/widget/slider'
import {Tooltip} from '~/widget/tooltip'
import {Widget} from '~/widget/widget'

import {buildCategoriesByProperty, categoricalLabelsByValue} from './featureLayerCategoricalOptions'
import {isFeatureLayerFilterValid, resolveFeatureLayerFilter} from './featureLayerFilter'
import styles from './featureLayerOptionsPanel.module.css'
import {COLOR_MODES, isBlankValue, isFeatureLayerStyleValid, normalizeValue, resolveFeatureLayerStyle, styleAfterColumnsLoaded} from './featureLayerStyle'
import {PalettePreSets, pickColors} from './visParams/palettePreSets'

// Seed palette for generated value colors; users can re-apply any preset via LegendBuilder.
const VALUE_COLOR_PALETTE = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf']
const COLOR_SECTION = 'COLOR'
const SIZE_SECTION = 'SIZE'
const FILTER_SECTION = 'FILTER'

const valueColorsToEntries = (valueColors = {}) =>
    Object.entries(valueColors).map(([value, color]) => ({id: uuid(), value, color}))

const entriesToValueColors = entries =>
    entries.reduce((acc, {value, color}) =>
        isBlankValue(value) ? acc : {...acc, [normalizeValue(value)]: color}, {})

const mapRecipeToProps = (recipe, {area, activatable: {source}}) => {
    const featureLayers = selectFrom(recipe, ['layers.areas', area, 'featureLayers']) || []
    const featureLayer = source && featureLayers.find(({sourceId}) => sourceId === source.id)
    return {
        recipeId: selectFrom(recipe, 'id'),
        layerConfig: featureLayer && featureLayer.layerConfig,
        importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries')
    }
}

class _FeatureLayerOptionsPanel extends React.Component {
    constructor(props) {
        super(props)
        const {layerConfig, activatable: {source}} = props
        const style = resolveFeatureLayerStyle({layerConfig, source})
        const filter = resolveFeatureLayerFilter({layerConfig})
        this.state = {
            activeSection: COLOR_SECTION,
            style,
            filter,
            filterInvalidById: {},
            selectedFilterId: null,
            entries: valueColorsToEntries(style.valueColors),
            columns: source.sourceConfig.columns || null,
            columnsLoading: false
        }
        this.apply = this.apply.bind(this)
    }

    componentDidMount() {
        // Older/saved sources may not have cached columns; discover them lazily when the panel opens.
        if (!this.state.columns) {
            this.loadColumns()
        }
    }

    // CSV import writes entries to a shared ui slot; consume and clear them here (mirrors VisParamsPanel).
    componentDidUpdate(prevProps) {
        const {importedLegendEntries, recipeId} = this.props
        if (importedLegendEntries && !_.isEqual(importedLegendEntries, prevProps.importedLegendEntries)) {
            recipeActionBuilder(recipeId)('CLEAR_IMPORTED_LEGEND_ENTRIES')
                .del('ui.importedLegendEntries')
                .dispatch()
            this.acceptEntries(importedLegendEntries)
        }
    }

    acceptEntries(entries) {
        if (!entries.every(({value}) => !isBlankValue(value))) {
            this.warnBlankValues()
            return
        }
        this.setState({entries: entries.map(({id, color, value}) => ({id, color, value: normalizeValue(value)}))})
    }

    warnBlankValues() {
        Notifications.warning({message: msg('map.featureLayerStyle.valueColors.blankValues'), group: true})
    }

    render() {
        const {activatable: {source, deactivate}} = this.props
        const {style, filter, filterInvalidById, entries} = this.state
        const colorValid = isFeatureLayerStyleValid({style, entries})
        const filterValid = isFeatureLayerFilterValid({filter, invalidById: filterInvalidById})
        const valid = colorValid && filterValid
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={deactivate}>
                <Panel.Header
                    icon='palette'
                    title={source.sourceConfig?.label || msg('map.featureLayerStyle.title')}
                />
                {this.renderSectionSelector({colorValid, filterValid})}
                <Panel.Content>
                    <Layout type='vertical'>
                        {this.renderActiveSection()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    {this.renderSectionActions({filterValid})}
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel keybinding='Escape' onClick={deactivate}/>
                        <Panel.Buttons.Apply disabled={!valid} keybinding='Enter' onClick={this.apply}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderSectionSelector({colorValid, filterValid}) {
        const {activeSection} = this.state
        const activeSectionValid = activeSection === COLOR_SECTION
            ? colorValid
            : activeSection === FILTER_SECTION ? filterValid : true
        const sections = [
            {value: COLOR_SECTION, label: msg('map.featureLayerStyle.sections.color')},
            {value: SIZE_SECTION, label: msg('map.featureLayerStyle.sections.sizeAndOpacity')},
            {value: FILTER_SECTION, label: msg('map.featureLayerStyle.sections.filter')}
        ]
        return (
            <ButtonGroup
                className={styles.sectionSelector}
                contentClassName={styles.sectionSelectorContent}
                layout='horizontal-nowrap'
                alignment='distribute'
                spacing='none'>
                {sections.map(({value, label}) => {
                    const disabled = value !== activeSection && !activeSectionValid
                    return (
                        <Button
                            key={value}
                            additionalClassName={styles.sectionButton}
                            look={value === activeSection ? 'selected' : 'default'}
                            air='more'
                            width='max'
                            label={label}
                            labelStyle='smallcaps'
                            disabled={disabled}
                            tooltip={disabled ? msg('map.featureLayerStyle.sections.completeCurrent') : null}
                            tooltipAllowedWhenDisabled
                            tooltipPlacement='bottom'
                            onClick={() => this.setState({activeSection: value})}
                        />
                    )
                })}
            </ButtonGroup>
        )
    }

    renderActiveSection() {
        const {activeSection} = this.state
        switch (activeSection) {
            case COLOR_SECTION: return this.renderColorControls()
            case SIZE_SECTION: return this.renderSizeControls()
            default: return this.renderFilterControls()
        }
    }

    renderSectionActions({filterValid}) {
        const {activeSection, style, columns, columnsLoading} = this.state
        if (activeSection === COLOR_SECTION && style.colorMode === 'COLORS_BY_VALUE') {
            return this.renderValueColorButtons()
        }
        if (activeSection === FILTER_SECTION) {
            return (
                <Panel.Buttons.Add
                    label={msg('map.featureLayerStyle.filter.add.label')}
                    disabled={!filterValid || columnsLoading || !columns?.length}
                    onClick={() => this.addFilter()}
                />
            )
        }
        return null
    }

    renderFilterControls() {
        const {filter: {booleanOperator, constraints}, columns, columnsLoading} = this.state
        return (
            <React.Fragment>
                <Buttons
                    label={msg('map.featureLayerStyle.filter.match.label')}
                    alignment='fill'
                    selected={booleanOperator}
                    options={[
                        {
                            value: 'and',
                            label: msg('map.featureLayerStyle.filter.match.all.label'),
                            tooltip: msg('map.featureLayerStyle.filter.match.all.tooltip')
                        },
                        {
                            value: 'or',
                            label: msg('map.featureLayerStyle.filter.match.any.label'),
                            tooltip: msg('map.featureLayerStyle.filter.match.any.tooltip')
                        }
                    ]}
                    onChange={booleanOperator => this.setState(({filter}) => ({filter: {...filter, booleanOperator}}))}
                />
                {columnsLoading
                    ? <NoData message={msg('widget.loading')}/>
                    : !columns?.length
                        ? <NoData message={msg('map.featureLayerStyle.filter.noProperties')}/>
                        : constraints.length
                            ? this.renderFilterConstraints()
                            : <NoData message={msg('map.featureLayerStyle.filter.noFilters')}/>
                }
            </React.Fragment>
        )
    }

    addFilter() {
        const {columns = []} = this.state
        if (!columns.length) {
            return
        }
        const id = uuid()
        const constraint = {
            id,
            image: 'feature-layer',
            property: columns.length === 1 ? columns[0] : null,
            operator: '='
        }
        this.setState(({filter, filterInvalidById}) => ({
            filter: {...filter, constraints: [...filter.constraints, constraint]},
            filterInvalidById: {...filterInvalidById, [id]: true},
            selectedFilterId: id
        }))
    }

    selectFilter(id) {
        this.setState(({selectedFilterId}) => ({selectedFilterId: selectedFilterId === id ? null : id}))
    }

    updateFilter(updated) {
        this.setState(({filter}) => ({
            filter: {
                ...filter,
                constraints: filter.constraints.map(constraint => constraint.id === updated.id ? updated : constraint)
            }
        }))
    }

    removeFilter(id) {
        this.setState(({filter, filterInvalidById, selectedFilterId}) => {
            const nextInvalidById = {...filterInvalidById}
            delete nextInvalidById[id]
            return {
                filter: {...filter, constraints: filter.constraints.filter(constraint => constraint.id !== id)},
                filterInvalidById: nextInvalidById,
                selectedFilterId: selectedFilterId === id ? null : selectedFilterId
            }
        })
    }

    setFilterInvalid(id, invalid) {
        this.setState(({filterInvalidById}) => filterInvalidById[id] === invalid
            ? null
            : {filterInvalidById: {...filterInvalidById, [id]: invalid}})
    }

    renderFilterConstraints() {
        const {filter: {constraints}} = this.state
        return (
            <Layout type='vertical' spacing='tight'>
                {constraints.map(constraint => this.renderFilterConstraint(constraint))}
            </Layout>
        )
    }

    categoriesByProperty() {
        const {activatable: {source}} = this.props
        const {style, entries} = this.state
        return buildCategoriesByProperty({
            categoricalProperties: source.sourceConfig.categoricalProperties,
            defaultStyle: source.sourceConfig.defaultStyle,
            entries,
            valueProperty: style.valueProperty
        })
    }

    renderFilterConstraint(constraint) {
        const {filter, selectedFilterId, columns = []} = this.state
        const filterValid = isFeatureLayerFilterValid({filter, invalidById: this.state.filterInvalidById})
        const images = [{
            id: 'feature-layer',
            description: msg('map.featureLayerStyle.filter.source'),
            properties: columns.map(name => ({name, type: 'unknown'}))
        }]
        return (
            <Constraint
                key={constraint.id}
                constraint={constraint}
                images={images}
                selected={selectedFilterId === constraint.id}
                applyOn='properties'
                inlineValue
                categoriesByProperty={this.categoriesByProperty()}
                onClick={() => filterValid && this.selectFilter(constraint.id)}
                onRemove={() => this.removeFilter(constraint.id)}
                onValidate={invalid => this.setFilterInvalid(constraint.id, invalid)}
                onChange={updated => this.updateFilter(updated)}
            />
        )
    }

    renderColorControls() {
        const {style} = this.state
        return (
            <React.Fragment>
                {this.renderColorMode()}
                {style.colorMode === 'ONE_COLOR' ? this.renderColor() : null}
                {style.colorMode === 'COLORS_FROM_PROPERTY' ? this.renderColorProperty() : null}
                {style.colorMode === 'COLORS_BY_VALUE' ? this.renderByValue() : null}
            </React.Fragment>
        )
    }

    renderSizeControls() {
        return (
            <React.Fragment>
                {this.renderSlider('width', 1, 10, 0, [1, 3, 5, 7, 10])}
                {this.renderSlider('pointSize', 1, 20, 0, [1, 5, 10, 15, 20])}
                {this.renderPercentSlider('fillOpacity')}
            </React.Fragment>
        )
    }

    renderColorMode() {
        const {style} = this.state
        return (
            <Buttons
                label={msg('map.featureLayerStyle.colorMode.label')}
                alignment='fill'
                selected={style.colorMode}
                options={COLOR_MODES.map(mode => ({value: mode, label: msg(`map.featureLayerStyle.colorMode.${mode}`)}))}
                onChange={colorMode => this.setStyle('colorMode', colorMode)}
            />
        )
    }

    renderColor() {
        const {style} = this.state
        return (
            <Widget label={msg('map.featureLayerStyle.color')}>
                <ColorElement color={style.color} onChange={color => this.setStyle('color', color)}/>
            </Widget>
        )
    }

    renderColorProperty() {
        const {style} = this.state
        return (
            <Widget label={msg('map.featureLayerStyle.colorProperty.label')}>
                {this.renderPropertyCombo(style.colorProperty, colorProperty => this.setStyle('colorProperty', colorProperty))}
            </Widget>
        )
    }

    renderByValue() {
        const {activatable: {source}} = this.props
        const {style, entries} = this.state
        return (
            <React.Fragment>
                <Widget label={msg('map.featureLayerStyle.valueProperty.label')}>
                    {this.renderPropertyCombo(style.valueProperty, valueProperty => this.setStyle('valueProperty', valueProperty))}
                </Widget>
                <ValueColorEntries
                    entries={entries}
                    labelByValue={categoricalLabelsByValue(source.sourceConfig.categoricalProperties, style.valueProperty)}
                    onChange={updatedEntries => this.setState({entries: updatedEntries})}
                />
            </React.Fragment>
        )
    }

    renderPropertyCombo(value, onChange) {
        const {columns, columnsLoading} = this.state
        const options = (columns || []).map(column => ({value: column, label: column}))
        return (
            <Combo
                value={value}
                options={options}
                placeholder={msg('map.featureLayerStyle.property.placeholder')}
                busyMessage={columnsLoading && msg('widget.loading')}
                disabled={columnsLoading || !options.length}
                onChange={({value}) => onChange(value)}
            />
        )
    }

    renderSlider(key, minValue, maxValue, decimals, ticks) {
        const {style} = this.state
        return (
            <Slider
                label={msg(`map.featureLayerStyle.${key}`)}
                value={style[key]}
                minValue={minValue}
                maxValue={maxValue}
                decimals={decimals}
                ticks={ticks}
                info={value => msg('map.featureLayerStyle.pixelValue', {value})}
                onChange={value => this.setStyle(key, value)}
            />
        )
    }

    // Percent-facing control over a 0..1 style value.
    renderPercentSlider(key) {
        const {style} = this.state
        return (
            <Slider
                label={msg(`map.featureLayerStyle.${key}`)}
                value={Math.round(style[key] * 100)}
                minValue={0}
                maxValue={100}
                ticks={[0, 25, 50, 75, 100]}
                info={value => msg('map.featureLayerStyle.percentValue', {value})}
                onChange={value => this.setStyle(key, value / 100)}
            />
        )
    }

    renderValueColorButtons() {
        const {style, entries} = this.state
        const options = [
            {options: [
                {
                    value: 'import',
                    label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                    onSelect: () => this.importLegend()
                },
                {
                    value: 'distinct',
                    label: msg('map.featureLayerStyle.valueColors.loadDistinctValues'),
                    disabled: !style.valueProperty,
                    onSelect: () => this.loadDistinctValues()
                }
            ]},
            {options: [
                {
                    value: 'export',
                    label: msg('map.legendBuilder.load.options.exportToCsv.label'),
                    disabled: !entries.length,
                    onSelect: () => this.exportLegend()
                }
            ]}
        ]
        return (
            <ButtonSelect
                look='add'
                icon='plus'
                label={msg('button.add')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
                onClick={() => this.addValueColor()}
            />
        )
    }

    setStyle(key, value) {
        this.setState(({style}) => ({style: {...style, [key]: value}}))
    }

    addValueColor() {
        this.setState(({entries}) => {
            return {entries: [...entries, {id: uuid(), value: `${entries.length + 1}`, color: VALUE_COLOR_PALETTE[entries.length % VALUE_COLOR_PALETTE.length]}]}
        })
    }

    loadColumns() {
        const {activatable: {source}, addSubscription} = this.props
        const asset = source.sourceConfig.asset
        // Guard against a stale schema response from a different asset.
        this.requestedColumnsAsset = asset
        this.setState({columnsLoading: true})
        addSubscription(
            api.gee.loadEETableColumns$(asset).subscribe({
                next: columns => asset === this.requestedColumnsAsset && this.onColumnsLoaded(columns),
                error: () => asset === this.requestedColumnsAsset && this.setState({columns: [], columnsLoading: false})
            })
        )
    }

    onColumnsLoaded(columns) {
        const {layerConfig, activatable: {source}} = this.props
        // Re-resolve with the freshly loaded schema so older sources also default to color-property mode
        // when a 'color' property exists - but only if the style is still untouched.
        this.setState(({style}) => ({
            columns,
            columnsLoading: false,
            style: styleAfterColumnsLoaded({style, layerConfig, source, columns})
        }))
    }

    loadDistinctValues() {
        const {activatable: {source}, addSubscription} = this.props
        const {style: {valueProperty}} = this.state
        const asset = source.sourceConfig.asset
        // Guard against a stale response if the asset/property changes before it resolves.
        const key = `${asset}:${valueProperty}`
        this.requestedValuesKey = key
        addSubscription(
            api.gee.loadEETableColumnValues$(asset, valueProperty).subscribe({
                next: values => key === this.requestedValuesKey && this.onDistinctValues(values),
                error: error => this.notifyLoadError(error)
            })
        )
    }

    onDistinctValues(values) {
        if (!values.every(value => !isBlankValue(value))) {
            this.warnBlankValues()
            return
        }
        this.setState({entries: this.valuesToEntries(values)})
    }

    valuesToEntries(values) {
        const colors = pickColors(values.length, VALUE_COLOR_PALETTE)
        return values.map((value, i) => ({id: uuid(), value: normalizeValue(value), color: colors[i]}))
    }

    notifyLoadError(error) {
        const detail = error?.response?.messageKey
            ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
            : error
        Notifications.error({
            message: msg('map.featureLayerStyle.valueColors.loadError'),
            error: detail,
            group: true
        })
    }

    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate({mode: 'featureLayerValueColors'})
    }

    exportLegend() {
        const {activatable: {source}} = this.props
        const {entries} = this.state
        const csv = [
            ['color,value'],
            entries.map(({color, value}) => `${color},"${String(value).replaceAll('"', '\\"')}"`)
        ].flat().join('\n')
        downloadCsv(csv, `${source.sourceConfig?.label || 'values'}.csv`)
    }

    apply() {
        const {recipeId, area, activatable: {source, deactivate}} = this.props
        const {style, filter, entries} = this.state
        // `style` still carries the resolved layer opacity (now edited row-level in the map-area popup, not
        // here), so writing it back preserves the current opacity rather than resetting it.
        const nextStyle = {...style, valueColors: entriesToValueColors(entries)}
        const action = recipeActionBuilder(recipeId)('SET_FEATURE_LAYER_OPTIONS', {area, sourceId: source.id})
            .set(['layers.areas', area, 'featureLayers', {sourceId: source.id}, 'layerConfig.style'], nextStyle)
        filter.constraints.length
            ? action.set(['layers.areas', area, 'featureLayers', {sourceId: source.id}, 'layerConfig.filter'], filter)
            : action.del(['layers.areas', area, 'featureLayers', {sourceId: source.id}, 'layerConfig.filter'])
        action.dispatch()
        deactivate()
    }
}

class ValueColorEntries extends React.Component {
    state = {showHexColorCode: false}

    render() {
        const {entries} = this.props
        return entries.length
            ? this.renderEntries()
            : <NoData message={msg('map.featureLayerStyle.valueColors.noEntries')}/>
    }

    renderEntries() {
        const {entries} = this.props
        return (
            <Layout type='vertical-fill'>
                <Widget
                    layout='vertical-scrollable'
                    spacing='compact'
                    label={msg('map.featureLayerStyle.valueColors.label')}
                    labelButtons={this.renderLabelButtons()}
                    framed>
                    {entries.map(entry => this.renderEntry(entry))}
                </Widget>
                <PalettePreSets
                    onSelect={colors => this.applyPreset(colors)}
                    count={entries.length}
                    className={styles.palettePreSets}
                    autoFocus={false}
                />
            </Layout>
        )
    }

    renderEntry(entry) {
        const {showHexColorCode} = this.state
        return (
            <Layout key={entry.id} type='horizontal-nowrap' className={styles.entry}>
                <ColorElement
                    color={entry.color}
                    tooltip={msg('map.legendBuilder.colors.edit.tooltip')}
                    onChange={color => this.updateEntry(entry, {color})}
                />
                {showHexColorCode ? (
                    <Input
                        className={styles.colorText}
                        value={entry.color}
                        autoComplete='off'
                        onChange={color => this.updateEntry(entry, {color})}
                    />
                ) : null}
                <Input
                    className={styles.value}
                    value={entry.value}
                    placeholder={msg('map.featureLayerStyle.valueColors.value.placeholder')}
                    autoComplete='off'
                    autoFocus={!entry.value}
                    onChange={value => this.updateEntry(entry, {value})}
                />
                {this.renderEntryLabel(entry)}
                <RemoveButton
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.legendBuilder.entry.remove.tooltip')}
                    tooltipPlacement='left'
                    onRemove={() => this.removeEntry(entry)}
                />
            </Layout>
        )
    }

    // Read-only class label for the entry's current value, when the source's categorical metadata has one.
    // Looked up fresh on each value change; hidden entirely when there is no match, so no empty placeholder is
    // left behind. Long labels truncate (CSS) with the full text in a tooltip. Labels are not editable here.
    renderEntryLabel(entry) {
        const {labelByValue = {}} = this.props
        const label = labelByValue[normalizeValue(entry.value)]
        if (label == null || `${label}`.trim() === '') {
            return null
        }
        return (
            <Tooltip msg={label} placement='top'>
                <span className={styles.entryLabel}>{label}</span>
            </Tooltip>
        )
    }

    renderLabelButtons() {
        const {showHexColorCode} = this.state
        return [
            <Button
                key={'showHexColorCode'}
                look={showHexColorCode ? 'selected' : 'default'}
                size='small'
                shape='pill'
                air='less'
                label={'HEX'}
                onClick={() => this.setState({showHexColorCode: !showHexColorCode})}
            />
        ]
    }

    updateEntry(entry, updates) {
        const {entries, onChange} = this.props
        onChange(entries.map(candidate => candidate.id === entry.id ? {...candidate, ...updates} : candidate))
    }

    removeEntry(entry) {
        const {entries, onChange} = this.props
        onChange(entries.filter(({id}) => id !== entry.id))
    }

    applyPreset(colors) {
        const {entries, onChange} = this.props
        const mappedColors = pickColors(entries.length, colors)
        onChange(entries.map((entry, i) => ({...entry, color: mappedColors[i]})))
    }
}

const policy = () => ({_: 'allow'})

export const FeatureLayerOptionsPanel = compose(
    _FeatureLayerOptionsPanel,
    withRecipe(mapRecipeToProps),
    withSubscriptions(),
    withActivators('legendImport'),
    withActivatable({
        id: ({area}) => `featureLayerOptions-${area}`,
        policy,
        alwaysAllow: true
    })
)
