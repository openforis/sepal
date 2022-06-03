import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions, dateRange} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {getDataSets, isDataSetInDateRange, sources} from 'app/home/body/process/recipe/opticalMosaic/sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './sources.module.css'

const fields = _.transform(sources,
    (fields, source) => fields[source] = new Form.Field(),
    {})

const constraints = {
    dataSetSelected: new Form.Constraint(sources)
        .predicate(values =>
            Object.values(values).find(value =>
                _.isArray(value) && value.length), 'process.mosaic.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onApply={(values, model) => {
                    if (Object.keys(model).length > 1) {
                        this.recipeActions.enableBandCalibration().dispatch()
                        this.recipeActions.useAllScenes().dispatch()
                    }
                }}>
                <Panel.Header
                    icon='satellite-dish'
                    title={msg('process.mosaic.panel.sources.title')}/>
                <Panel.Content>
                    {this.renderSources()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderSources() {
        return (
            <Layout>
                {sources.map(source => this.renderSource(source, getDataSets(source)))}
            </Layout>
        )
    }

    renderSource(source, dataSets) {
        const {dates, inputs} = this.props
        const [from, to] = dateRange(dates)
        const options = (dataSets || []).map(value =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'tooltip']),
                disabled: !isDataSetInDateRange(value, from, to)
            })
        )
        return (
            <Form.Buttons
                key={source}
                label={msg(['process.mosaic.panel.sources.form.source.options', source])}
                className={styles.dataSets}
                input={inputs[source]}
                options={options}
                multiple
            />
        )

    }

    componentDidUpdate() {
        this.removeOutOfDateRangeSelection()
    }

    removeOutOfDateRangeSelection() {
        const {dates, inputs} = this.props
        const [from, to] = dateRange(dates)
        Object.values(inputs)
            .filter(({value}) => value)
            .forEach(input =>
                input.set(
                    input.value.filter(dataSet => isDataSetInDateRange(dataSet, from, to))
                ))
    }
}

Sources.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => {
    const model = {}
    Object.keys(values)
        .filter(source => _.isArray(values[source]) && values[source].length)
        .forEach(source => model[source] = values[source])
    return model
}

const additionalPolicy = () => ({sceneSelection: 'allow'})

export default compose(
    Sources,
    recipeFormPanel({id: 'sources', fields, constraints, mapRecipeToProps, valuesToModel, additionalPolicy})
)
