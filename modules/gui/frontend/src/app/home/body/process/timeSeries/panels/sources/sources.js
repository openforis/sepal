import {Field, Label, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {RecipeActions, RecipeState} from '../../timeSeriesRecipe'
import {arrayEquals} from 'collections'
import {imageSourceById} from 'sources'
import {recipePath} from 'app/home/body/process/timeSeries/timeSeriesRecipe'
import Buttons from 'widget/buttons'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'

const fields = {
    dataSets: new Field()
        .notEmpty('process.timeSeries.panel.sources.form.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.sources')
    if (!values) {
        const model = recipeState('model.sources')
        values = modelToValues(model)
        RecipeActions(recipeId).setSources({values, model}).dispatch()
    }
    return {
        values: recipeState('ui.sources')
    }
}

class Sources extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        const {dateRange, isDataSetInDateRange} = RecipeState(recipeId)
        this.dateRange = dateRange
        this.isDataSetInDateRange = isDataSetInDateRange
    }

    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
    }

    renderDataSets() {
        const {inputs: {dataSets}} = this.props
        const dataSetNames = this.lookupDataSetNames('LANDSAT')
        const options = (dataSetNames || []).map(value =>
            ({
                value,
                label: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'tooltip']),
                neverSelected: !this.isDataSetInDateRange(value)
            })
        )
        const content = options.length > 1
            ? <Buttons className={styles.dataSets} input={dataSets} options={options} multiple/>
            : <div className={styles.oneDataSet}><Msg id='process.timeSeries.panel.sources.form.dataSets.oneDataSet'/>
            </div>
        return (
            <div>
                <Label msg={msg('process.timeSeries.panel.sources.form.dataSets.label')}/>
                {content}
            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                onApply={values => this.recipeActions.setSources({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.sources.title')}/>

                <PanelContent>
                    <div>
                        {this.renderDataSets()}
                    </div>
                </PanelContent>

                <PanelButtons/>
            </Panel>
        )
    }

    componentDidUpdate() {
        const {inputs: {dataSets}} = this.props
        const selectedDataSets = updateDataSets(dataSets.value, ...this.dateRange())
        if (!arrayEquals(selectedDataSets, dataSets.value))
            dataSets.set(selectedDataSets)
    }
}

Sources.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, mapStateToProps})(Sources)

const valuesToModel = values => {
    return {LANDSAT: values.dataSets ? [...values.dataSets] : null}
}

const modelToValues = model => {
    return {
        dataSets: [...Object.values(model)[0]]
    }
}
