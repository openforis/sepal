import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PreviewMap} from './previewMap'
import {RecipeActions} from '../../mosaicRecipe'
import {Subject, map, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const mapRecipeToProps = recipe => {
    return {
        columns: selectFrom(recipe, 'ui.eeTable.columns'),
        rows: selectFrom(recipe, 'ui.eeTable.rows'),
        overlay: selectFrom(recipe, 'layers.overlay'),
        featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
    }
}

class _EETableSection extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.eeTableChanged$ = new Subject()
        this.eeTableColumnChanged$ = new Subject()
        this.recipeActions = RecipeActions(recipeId)
    }

    reset() {
        const {inputs: {eeTableColumn, eeTableRow}} = this.props
        eeTableColumn.set('')
        eeTableRow.set('')
        this.recipeActions.setEETableColumns(null).dispatch()
        this.recipeActions.setEETableRows(null).dispatch()
        this.eeTableChanged$.next()
        this.eeTableColumnChanged$.next()
    }

    render() {
        const {inputs: {eeTable}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    label={msg('process.mosaic.panel.areaOfInterest.form.eeTable.eeTable.label')}
                    autoFocus
                    input={eeTable}
                    placeholder={msg('process.mosaic.panel.areaOfInterest.form.eeTable.eeTable.placeholder')}
                    allowedTypes={['Table']}
                    onChange={tableId => tableId && this.loadColumns(tableId)}
                    errorMessage
                    busyMessage={this.props.stream('LOAD_EE_TABLE_COLUMNS').active && msg('widget.loading')}
                />
                {this.renderFilterOptions()}
                {this.renderColumnValueRowInputs()}
                <PreviewMap/>
            </Layout>
        )
    }

    renderFilterOptions() {
        const {inputs: {eeTableRowSelection}} = this.props
        const options = [
            {
                value: 'FILTER',
                label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.eeTableRowSelection.FILTER')
            },
            {
                value: 'INCLUDE_ALL',
                label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.eeTableRowSelection.INCLUDE_ALL')
            }
        ]
        return (
            <Form.Buttons
                input={eeTableRowSelection}
                label={msg('process.mosaic.panel.areaOfInterest.form.eeTable.eeTableRowSelection.label')}
                options={options}
                disabled={!this.hasColumns()}
            />
        )
    }

    renderColumnValueRowInputs() {
        const {
            stream,
            columns,
            rows,
            inputs: {eeTable, eeTableRowSelection, eeTableColumn, eeTableRow, buffer}
        } = this.props
        const columnState = stream('LOAD_EE_TABLE_COLUMNS').active
            ? 'loading'
            : this.hasColumns()
                ? 'loaded'
                : 'noEETable'
        const rowState = stream('LOAD_EE_TABLE_ROWS').active
            ? 'loading'
            : rows
                ? (rows.length === 0 ? 'noRows' : 'loaded')
                : eeTable.value
                    ? 'noColumn'
                    : 'noEETable'

        const eeTableColumnDisabled = !this.hasColumns() || eeTableRowSelection.value === 'INCLUDE_ALL'
        const eeTableRowDisabled = !rows || eeTableColumnDisabled
        const loading = stream('LOAD_EE_TABLE_ROWS').active

        return (
            <React.Fragment>
                <Form.Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.eeTable.column.label')}
                    input={eeTableColumn}
                    busyMessage={loading && msg('widget.loading')}
                    disabled={eeTableColumnDisabled || loading}
                    placeholder={msg(`process.mosaic.panel.areaOfInterest.form.eeTable.column.placeholder.${columnState}`)}
                    options={(columns || []).map(column => ({value: column, label: column}))}
                    onChange={column => {
                        eeTableRow.set('')
                        this.recipeActions.setEETableRows(null).dispatch()
                        this.eeTableColumnChanged$.next()
                        this.loadDistinctColumnValues(column.value)
                    }}
                    errorMessage
                />
                <Form.Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.eeTable.row.label')}
                    input={eeTableRow}
                    disabled={eeTableRowDisabled}
                    placeholder={msg(`process.mosaic.panel.areaOfInterest.form.eeTable.row.placeholder.${rowState}`)}
                    options={(rows || []).map(value => ({value, label: value}))}
                    errorMessage
                />
                <Form.Slider
                    label={msg('process.mosaic.panel.areaOfInterest.form.buffer.label')}
                    tooltip={msg('process.mosaic.panel.areaOfInterest.form.buffer.tooltip')}
                    info={buffer => msg('process.mosaic.panel.areaOfInterest.form.buffer.info', {buffer})}
                    input={buffer}
                    minValue={0}
                    maxValue={100}
                    scale={'log'}
                    ticks={[0, 1, 2, 5, 10, 20, 50, 100]}
                    snap
                    range='none'
                />
            </React.Fragment>
        )
    }

    loadColumns(eeTableId) {
        this.props.stream('LOAD_EE_TABLE_COLUMNS',
            api.gee.loadEETableColumns$(eeTableId).pipe(
                takeUntil(this.eeTableChanged$)),
            columns => this.recipeActions.setEETableColumns(columns).dispatch(),
            error =>
                this.props.inputs.eeTable.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('eeTable.failedToLoad')
                )
        )
    }

    loadDistinctColumnValues(column) {
        this.props.stream('LOAD_EE_TABLE_ROWS',
            api.gee.loadEETableColumnValues$(this.props.inputs.eeTable.value, column).pipe(
                map(values =>
                    this.recipeActions.setEETableRows(values).dispatch()
                ),
                takeUntil(this.eeTableColumnChanged$),
                takeUntil(this.eeTableChanged$)
            )
        )
    }

    hasColumns() {
        const {columns} = this.props
        return columns && columns.length > 0
    }

    componentDidMount() {
        const {inputs: {eeTable, eeTableColumn}} = this.props
        if (eeTable.value) {
            this.loadColumns(eeTable.value)
        }
        if (eeTableColumn.value) {
            this.loadDistinctColumnValues(eeTableColumn.value)
        }
        this.update()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {eeTableRowSelection}} = this.props
        if (!prevProps || prevProps.inputs !== this.props.inputs) {
            this.update()
        }
        if (!eeTableRowSelection.value) {
            eeTableRowSelection.set('FILTER')
        }
    }

    update() {
        const {inputs: {buffer}} = this.props
        this.setOverlay()
        if (!_.isFinite(buffer.value)) {
            buffer.set(0)
        }
    }

    setOverlay() {
        const {stream, inputs: {eeTable, eeTableColumn, eeTableRow, buffer}} = this.props
        if (!eeTableRow.value) {
            return
        }

        const aoi = {
            type: 'EE_TABLE',
            id: eeTable.value,
            keyColumn: eeTableColumn.value,
            key: eeTableRow.value,
            buffer: buffer.value
        }
        const {overlay: prevOverlay, featureLayerSources, recipeActionBuilder} = this.props
        const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
        const overlay = {
            featureLayers: [
                {
                    sourceId: aoiLayerSource.id,
                    layerConfig: {aoi}
                }
            ]
        }
        if (!_.isEqual(overlay, prevOverlay) && !stream('LOAD_BOUNDS').active) {
            recipeActionBuilder('DELETE_MAP_OVERLAY_BOUNDS')
                .del('ui.overlay.bounds')
                .dispatch()
            stream('LOAD_BOUNDS',
                api.gee.aoiBounds$(aoi),
                bounds => {
                    recipeActionBuilder('SET_MAP_OVERLAY_BOUNDS')
                        .set('ui.overlay.bounds', bounds)
                        .dispatch()
                }
            )
            recipeActionBuilder('SET_MAP_OVERLAY')
                .set('layers.overlay', overlay)
                .dispatch()
        }
    }

    componentWillUnmount() {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_MAP_OVERLAY')
            .del('layers.overlay')
            .dispatch()
    }
}

export const EETableSection = compose(
    _EETableSection,
    withRecipe(mapRecipeToProps)
)

EETableSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    layerIndex: PropTypes.number
}
