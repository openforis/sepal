import {withRecipe} from 'app/home/body/process/recipeContext'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {loadFusionTableColumns$, queryFusionTable$} from 'app/home/map/fusionTable'
import {sepalMap} from 'app/home/map/map'
import {compose} from 'compose'
import React from 'react'
import {Subject} from 'rxjs'
import {map, takeUntil} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import {FormButtons} from 'widget/buttons'
import Combo from 'widget/combo'
import {Input} from 'widget/form'
import {isMobile} from 'widget/userAgent'
import {RecipeActions} from '../../mosaicRecipe'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        columns: selectFrom(recipe, 'ui.fusionTable.columns'),
        rows: selectFrom(recipe, 'ui.fusionTable.rows')
    }
}

class FusionTableSection extends React.Component {
    constructor(props) {
        super(props)
        this.fusionTableChanged$ = new Subject()
        this.fusionTableColumnChanged$ = new Subject()
        this.fusionTableRowChanged$ = new Subject()
        this.recipe = RecipeActions(props.recipeId)
    }

    loadFusionTableColumns(fusionTableId) {
        this.props.stream('LOAD_FUSION_TABLE_COLUMNS',
            loadFusionTableColumns$(fusionTableId, {excludedTypes: ['LOCATION']}).pipe(
                map(response => {
                    if (response.error)
                        this.props.inputs.fusionTable.setInvalid(
                            msg(response.error.key)
                        )
                    this.recipe.setFusionTableColumns(response.columns || [])
                        .dispatch()
                }),
                takeUntil(this.fusionTableChanged$))
        )
    }

    loadFusionTableRows(column) {
        this.props.stream('LOAD_FUSION_TABLE_ROWS',
            queryFusionTable$(`
                    SELECT '${column}'
                    FROM ${this.props.inputs.fusionTable.value}
                    ORDER BY '${column}' ASC
            `).pipe(
                map(e => {
                        this.recipe.setFusionTableRows(
                            (e.response.rows || [])
                                .map(row => row[0])
                                .filter(value => value))
                            .dispatch()
                    }
                ),
                takeUntil(this.fusionTableColumnChanged$),
                takeUntil(this.fusionTableChanged$)
            )
        )
    }

    render() {
        const {allowWholeFusionTable, inputs: {fusionTable}} = this.props
        return (
            <React.Fragment>
                <Input
                    label={msg('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.label')}
                    autoFocus={!isMobile()}
                    input={fusionTable}
                    placeholder={msg('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.placeholder')}
                    spellCheck={false}
                    onChange={e => this.onFusionTableChange(e)}
                    errorMessage
                />
                {allowWholeFusionTable ? this.renderFilterOptions() : null}
                {this.renderColumnValueRowInputs()}
            </React.Fragment>
        )
    }

    renderFilterOptions() {
        const {inputs: {fusionTableRowSelection}} = this.props
        const options = [
            {value: 'FILTER', label: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTableRowSelection.FILTER')},
            {value: 'INCLUDE_ALL', label: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTableRowSelection.INCLUDE_ALL')}
        ]
        return (
            <FormButtons
                input={fusionTableRowSelection}
                label={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTableRowSelection.label`)}
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
            inputs: {fusionTable, fusionTableRowSelection, fusionTableColumn, fusionTableRow}
        } = this.props
        const columnState = stream('LOAD_FUSION_TABLE_COLUMNS').active
            ? 'loading'
            : this.hasColumns()
                ? 'loaded'
                : 'noFusionTable'
        const rowState = stream('LOAD_FUSION_TABLE_ROWS').active
            ? 'loading'
            : rows
                ? (rows.length === 0 ? 'noRows' : 'loaded')
                : fusionTable.value
                    ? 'noColumn'
                    : 'noFusionTable'

        return (
            <React.Fragment>
                <Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.fusionTable.column.label')}
                    input={fusionTableColumn}
                    busy={stream('LOAD_FUSION_TABLE_COLUMNS').active}
                    disabled={!this.hasColumns() || fusionTableRowSelection.value === 'INCLUDE_ALL'}
                    placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.column.placeholder.${columnState}`)}
                    options={(columns || []).map(({name}) => ({value: name, label: name}))}
                    onChange={option => {
                        fusionTableRow.set('')
                        this.recipe.setFusionTableRows(null).dispatch()
                        this.fusionTableColumnChanged$.next()
                        this.fusionTableRowChanged$.next()
                        this.loadFusionTableRows(option.value)
                    }}
                    errorMessage
                />
                <Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.fusionTable.row.label')}
                    input={fusionTableRow}
                    busy={stream('LOAD_FUSION_TABLE_ROWS').active}
                    disabled={!rows || fusionTableRowSelection.value === 'INCLUDE_ALL'}
                    placeholder={msg(`process.mosaic.panel.areaOfInterest.form.fusionTable.row.placeholder.${rowState}`)}
                    options={(rows || []).map(value => ({value, label: value}))}
                    onChange={() => this.fusionTableRowChanged$.next()}
                    errorMessage
                />
            </React.Fragment>
        )
    }

    hasColumns() {
        const {columns} = this.props
        return columns && columns.length > 0
    }

    onFusionTableChange(e) {
        const {inputs: {fusionTableColumn, fusionTableRow}} = this.props
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
    }

    componentDidMount() {
        const {inputs: {fusionTable, fusionTableColumn}} = this.props
        if (fusionTable.value)
            this.loadFusionTableColumns(fusionTable.value)
        if (fusionTableColumn.value)
            this.loadFusionTableRows(fusionTableColumn.value)
        this.update()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {fusionTableRowSelection}} = this.props
        if (!prevProps || prevProps.inputs !== this.props.inputs)
            this.update()
        if (!fusionTableRowSelection.value) {
            fusionTableRowSelection.set('FILTER')
        }
    }

    update() {
        const {recipeId, inputs: {fusionTable, fusionTableColumn, fusionTableRow}, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'FUSION_TABLE',
                id: fusionTable.value,
                keyColumn: fusionTableColumn.value,
                key: fusionTableRow.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: () => sepalMap.getContext(recipeId).fitLayer('aoi')
        })
    }
}

export default compose(
    FusionTableSection,
    withRecipe(mapRecipeToProps)
)
