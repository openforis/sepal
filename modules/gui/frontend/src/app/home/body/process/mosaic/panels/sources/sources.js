import {initValues} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {arrayEquals, selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {imageSourceById, isDataSetInDateRange, isSourceInDateRange, sources} from 'sources'
import {Msg, msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form} from 'widget/form'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, dateRange} from '../../mosaicRecipe'
import styles from './sources.module.css'
import updateSource from './updateSource'

const fields = {
    source: new Field()
        .notEmpty('process.mosaic.panel.sources.form.required'),
    dataSets: new Field()
        .notEmpty('process.mosaic.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    model: selectFrom(recipe, 'model.sources'),
    values: selectFrom(recipe, 'ui.sources'),
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
    }

    sourceChanged(sourceValue) {
        const {inputs: {dataSets}} = this.props
        const dataSetNames = this.lookupDataSetNames(sourceValue)
        const dataSetsValue = dataSetNames.length === 1 ? [dataSetNames[0]] : null
        dataSets.set(dataSetsValue)
    }

    renderSources() {
        const {dates, inputs: {source}} = this.props
        const [from, to] = dateRange(dates)
        const options = sources.map(value =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.source.options', value]),
                neverSelected: !isSourceInDateRange(value, from, to)
            })
        )
        return (
            <div>
                <Label msg={msg('process.mosaic.panel.sources.form.source.label')}/>
                <Buttons
                    className={styles.sources}
                    input={source}
                    options={options}
                    onChange={sourceValue => this.sourceChanged(sourceValue)}/>
            </div>
        )
    }

    renderDataSets() {
        const {dates, inputs: {source, dataSets}} = this.props
        if (!source.value)
            return
        const dataSetNames = this.lookupDataSetNames(source.value)
        const [from, to] = dateRange(dates)
        const options = (dataSetNames || []).map(value =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'tooltip']),
                disabled: !isDataSetInDateRange(value, from, to)
            })
        )
        const content = options.length > 1
            ? <Buttons className={styles.dataSets} input={dataSets} options={options} multiple/>
            : <div className={styles.oneDataSet}><Msg id='process.mosaic.panel.sources.form.dataSets.oneDataSet'/></div>
        return (
            <div>
                <Label msg={msg('process.mosaic.panel.sources.form.dataSets.label')}/>
                {content}
            </div>
        )
    }

    render() {
        const {form} = this.props
        return (
            <FormPanel
                id='sources'
                className={styles.panel}
                form={form}
                placement='bottom-right'
                onApply={values => this.recipeActions.setSources({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='satellite-dish'
                    title={msg('process.mosaic.panel.sources.title')}/>

                <PanelContent>
                    <div>
                        {this.renderSources()}
                        {this.renderDataSets()}
                    </div>
                </PanelContent>

                <FormPanelButtons/>
            </FormPanel>
        )
    }

    componentDidUpdate() {
        const {dates, inputs: {source, dataSets}} = this.props
        const [selectedSource, selectedDataSets] = updateSource(source.value, dataSets.value, ...dateRange(dates))
        if (selectedSource !== source.value)
            source.set(selectedSource)

        if (!arrayEquals(selectedDataSets, dataSets.value))
            dataSets.set(selectedDataSets)
    }
}

Sources.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => {
    return {[values.source]: values.dataSets ? [...values.dataSets] : null}
}

const modelToValues = model => {
    return {
        source: Object.keys(model)[0],
        dataSets: [...Object.values(model)[0]]
    }
}

export default withRecipe(mapRecipeToProps)(
    initValues({
        getModel: props => props.model,
        getValues: props => props.values,
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setSources({values, model})
                .dispatch()
    })(
        form({fields})(Sources)
    )
)
