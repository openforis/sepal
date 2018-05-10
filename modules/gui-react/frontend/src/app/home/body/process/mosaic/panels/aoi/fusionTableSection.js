import actionBuilder from 'action-builder'
import FusionTable from 'app/home/map/fusionTable'
import {map} from 'app/home/map/map'
import React from 'react'
import Rx from 'rxjs'
import {connect} from 'store'
import {Msg, msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {ErrorMessage, Input} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelContent from '../panelContent'

const mapStateToProps = (state, ownProps) => {
    const recipe = new RecipeState(ownProps.id)
    return {
        columns: recipe('ui.fusionTable.columns'),
        rows: recipe('ui.fusionTable.rows')
    }
}

class FusionTableSection extends React.Component {
    constructor(params) {
        super(params)
        this.fusionTableChanged$ = new Rx.Subject()
        this.fusionTableColumnChanged$ = new Rx.Subject()
        this.fusionTableRowChanged$ = new Rx.Subject()
        this.recipe = new RecipeActions(params.id)
    }

    loadFusionTableColumns(fusionTableId) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_COLUMNS',
            FusionTable.columns$(fusionTableId)
                .map((columns) =>
                    columns
                        .filter((column) => column.type !== 'LOCATION')
                )
                .map((columns) =>
                    actionBuilder('LOADED_FUSION_TABLE_COLUMNS', {columns})
                        .build()
                )
                .takeUntil(this.fusionTableChanged$))
            .onComplete(([{columns}]) => columns && this.recipe.setFusionTableColumns(columns))
            .dispatch()
    }


    loadFusionTableRows(column) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_ROWS',
            FusionTable.get$(`
                    SELECT '${column}'
                    FROM ${this.props.inputs.fusionTable.value}
                    ORDER BY '${column}' ASC`)
                .map((e) =>
                    actionBuilder('LOADED_FUSION_TABLE_ROWS', {rows: e.response.rows})
                        .build()
                )
                .takeUntil(this.fusionTableColumnChanged$))
            .onComplete(([{rows}]) =>
                this.recipe.setFusionTableRows(
                    (rows || [])
                        .map((row) => row[0])
                        .filter((value) => value)
                ))
            .dispatch()
    }

    loadBounds(fusionTable) {
        this.props.asyncActionBuilder('LOAD_BOUNDS',
            fusionTable.loadBounds$()
                .map((bounds) => actionBuilder('LOADED_BOUNDS', {bounds}))
                .takeUntil(this.fusionTableRowChanged$))
            .onComplete(() => map.fitBounds('aoi'))
            .dispatch()
    }

    render() {
        const {action, columns, rows, className, inputs: {section, fusionTable, fusionTableColumn, fusionTableRow}} = this.props
        const columnState = action('LOAD_FUSION_TABLE_COLUMNS').dispatching
            ? 'loading'
            : columns
                ? 'loaded'
                : 'noFusionTable'
        const rowState = action('LOAD_FUSION_TABLE_ROWS').dispatching
            ? 'loading'
            : rows
                ? (rows.length === 0 ? 'noRows' : 'loaded')
                : fusionTable.value
                    ? 'noColumn'
                    : 'noFusionTable'

        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title')}
                className={className}
                onBack={() => {
                    section.set('')
                }}>
                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.label'/></label>
                    <Input
                        autoFocus
                        input={fusionTable}
                        placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.placeholder`)}
                        onChange={(e) => {
                            fusionTableColumn.set('')
                            fusionTableRow.set('')
                            this.fusionTableChanged$.next()
                            this.fusionTableColumnChanged$.next()
                            this.fusionTableRowChanged$.next()
                            const fusionTableMinLength = 30
                            if (e && e.target.value.length > fusionTableMinLength)
                                this.loadFusionTableColumns(e.target.value)
                            else
                                this.recipe.setFusionTableColumns(null)
                        }}
                    />
                    <ErrorMessage input={fusionTable}/>
                </div>

                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.fusionTable.column.label'/></label>
                    <ComboBox
                        input={fusionTableColumn}
                        isLoading={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                        disabled={!columns}
                        placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.column.placeholder.${columnState}`)}
                        options={(columns || []).map(({name}) => ({value: name, label: name}))}
                        onChange={(e) => {
                            fusionTableRow.set('')
                            this.fusionTableColumnChanged$.next()
                            this.fusionTableRowChanged$.next()
                            if (e && e.value)
                                this.loadFusionTableRows(e.value)
                        }}
                    />
                    <ErrorMessage input={fusionTableColumn}/>
                </div>

                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.fusionTable.row.label'/></label>
                    <ComboBox
                        input={fusionTableRow}
                        isLoading={action('LOAD_FUTION_TABLE_ROWS').dispatching}
                        disabled={!rows}
                        placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.row.placeholder.${rowState}`)}
                        options={(rows || []).map((value) => ({value, label: value}))}
                        onChange={(e) => this.fusionTableRowChanged$.next()}
                    />
                    <ErrorMessage input={fusionTableRow}/>
                </div>
            </PanelContent>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {inputs: {fusionTable, fusionTableColumn, fusionTableRow}} = this.props
        FusionTable.setLayer({
            id: 'aoi',
            table: fusionTable.value,
            keyColumn: fusionTableColumn.value,
            key: fusionTableRow.value
        }, this.loadBounds.bind(this))
    }
}

export default connect(mapStateToProps)(FusionTableSection)