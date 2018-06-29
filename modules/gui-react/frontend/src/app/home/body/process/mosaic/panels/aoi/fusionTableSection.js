import {setAoiLayer} from 'app/home/map/aoiLayer'
import {loadFusionTableColumns$, queryFusionTable$} from 'app/home/map/fusionTable'
import {sepalMap} from 'app/home/map/map'
import React from 'react'
import {Subject} from 'rxjs'
import {map, takeUntil} from 'rxjs/operators'
import {connect} from 'store'
import {Msg, msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {ErrorMessage, Input} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelContent from '../panelContent'

const mapStateToProps = (state, ownProps) => {
    const recipe = new RecipeState(ownProps.recipeId)
    return {
        columns: recipe('ui.fusionTable.columns'),
        rows: recipe('ui.fusionTable.rows')
    }
}

class FusionTableSection extends React.Component {
    constructor(props) {
        super(props)
        this.fusionTableChanged$ = new Subject()
        this.fusionTableColumnChanged$ = new Subject()
        this.fusionTableRowChanged$ = new Subject()
        this.recipe = new RecipeActions(props.recipeId)
    }

    loadFusionTableColumns(fusionTableId) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_COLUMNS',
            loadFusionTableColumns$(fusionTableId, {retries: 1, validStatuses: [200, 404]}).pipe(
                map((columns) => {
                        if (!columns)
                            this.props.inputs.fusionTable.setInvalid(
                                msg('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.invalid')
                            )
                        return (columns || [])
                            .filter((column) => column.type !== 'LOCATION')
                    }
                ),
                map(this.recipe.setFusionTableColumns),
                takeUntil(this.fusionTableChanged$))
        )
            .dispatch()
    }


    loadFusionTableRows(column) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_ROWS',
            queryFusionTable$(`
                    SELECT '${column}'
                    FROM ${this.props.inputs.fusionTable.value}
                    ORDER BY '${column}' ASC
            `).pipe(
                map((e) =>
                    (e.response.rows || [])
                        .map((row) => row[0])
                        .filter((value) => value)
                ),
                map(this.recipe.setFusionTableRows),
                takeUntil(this.fusionTableColumnChanged$),
                takeUntil(this.fusionTableChanged$)
            )
        ).dispatch()
    }


    updateBounds(updatedBounds) {
        const {recipeId, inputs: {bounds}} = this.props
        bounds.set(updatedBounds)
        sepalMap.getContext(recipeId).fitLayer('aoi')
    }

    render() {
        const {action, columns, rows, className, inputs: {section, fusionTable, fusionTableColumn, fusionTableRow}} = this.props
        const columnState = action('LOAD_FUSION_TABLE_COLUMNS').dispatching
            ? 'loading'
            : columns && columns.length > 0
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
                        spellCheck={false}
                        onChange={(e) => {
                            fusionTableColumn.set('')
                            fusionTableRow.set('')
                            this.recipe.setFusionTableColumns(null).dispatch()
                            this.recipe.setFusionTableRows(null).dispatch()
                            this.fusionTableChanged$.next()
                            this.fusionTableColumnChanged$.next()
                            this.fusionTableRowChanged$.next()
                            const fusionTableMinLength = 30
                            if (e && e.target.value.length > fusionTableMinLength)
                                this.loadFusionTableColumns(e.target.value)
                        }}
                    />
                    <ErrorMessage for={fusionTable}/>
                </div>

                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.fusionTable.column.label'/></label>
                    <ComboBox
                        input={fusionTableColumn}
                        isLoading={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                        disabled={!columns || columns.length === 0}
                        placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.column.placeholder.${columnState}`)}
                        options={(columns || []).map(({name}) => ({value: name, label: name}))}
                        onChange={(e) => {
                            fusionTableRow.set('')
                            this.recipe.setFusionTableRows(null).dispatch()
                            this.fusionTableColumnChanged$.next()
                            this.fusionTableRowChanged$.next()
                            if (e && e.value)
                                this.loadFusionTableRows(e.value)
                        }}
                    />
                    <ErrorMessage for={fusionTableColumn}/>
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
                    <ErrorMessage for={fusionTableRow}/>
                </div>
            </PanelContent>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {recipeId, inputs: {fusionTable, fusionTableColumn, fusionTableRow, bounds}, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'fusionTable',
                id: fusionTable.value,
                keyColumn: fusionTableColumn.value,
                key: fusionTableRow.value,
                bounds: bounds.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: (layer) => this.updateBounds(layer.bounds)
        })
    }
}

export default connect(mapStateToProps)(FusionTableSection)