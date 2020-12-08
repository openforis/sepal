import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals} from 'collections'
import {compose} from 'compose'
import {dateRange} from '../../timeSeriesRecipe'
import {imageSourceById, isDataSetInDateRange} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'
import {RecipeActions} from '../../timeSeriesRecipe'
import {connect, select} from 'store'
import api from 'api'
import Notifications from 'widget/notifications'

const fields = {
    opticalDataSets: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .notEmpty('process.timeSeries.panel.sources.form.required'),
    radarDataSets: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .notEmpty('process.timeSeries.panel.sources.form.required'),
    classification: new Form.Field()
}

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.timeSeries.panel.sources.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderOpticalDataSets()}
                        {this.renderRadarDataSets()}
                        {this.renderClassification()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderOpticalDataSets() {
        const {dates, inputs: {opticalDataSets, radarDataSets}} = this.props
        const [from, to] = dateRange(dates)
        const dataSetNames = this.lookupDataSetNames('LANDSAT')
            .concat(this.lookupDataSetNames('SENTINEL_2'))
        const options = (dataSetNames || []).map(value =>
            ({
                value,
                label: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'tooltip']),
                neverSelected: !isDataSetInDateRange(value, from, to)
            })
        )
        return (
            <Form.Buttons
                className={styles.dataSets}
                label={msg('process.timeSeries.panel.sources.form.dataSets.optical.label')}
                input={opticalDataSets}
                options={options}
                multiple
                disabled={!_.isEmpty(radarDataSets.value)}
            />
        )
    }

    renderRadarDataSets() {
        const {inputs: {opticalDataSets, radarDataSets}} = this.props
        const options = [{
            value: 'SENTINEL_1',
            label: msg(['process.timeSeries.panel.sources.form.dataSets.options', 'SENTINEL_1', 'label']),
            tooltip: msg(['process.timeSeries.panel.sources.form.dataSets.options', 'SENTINEL_1', 'tooltip']),
            neverSelected: this.s1OutOfRange()
        }]
        return (
            <Form.Buttons
                className={styles.dataSets}
                label={msg('process.timeSeries.panel.sources.form.dataSets.radar.label')}
                input={radarDataSets}
                options={options}
                multiple
                disabled={!_.isEmpty(opticalDataSets.value)}
            />
        )
    }

    renderClassification() {
        const {recipes, inputs: {classification}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CLASSIFICATION')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))
        return (
            <Form.Combo
                label={msg('process.ccdc.panel.sources.form.classification.label')}
                tooltip={msg('process.ccdc.panel.sources.form.classification.tooltip')}
                placeholder={msg('process.ccdc.panel.sources.form.classification.placeholder')}
                input={classification}
                options={options}
                busyMessage={this.props.stream('LOAD_CLASSIFICATION_RECIPE').active && msg('widget.loading')}
                onChange={selected => selected
                    ? this.loadClassification(selected.value)
                    : this.deselectClassification()}
                allowClear
                autoFocus
                errorMessage
            />
        )
    }

    loadClassification(recipeId) {
        const {stream} = this.props
        this.deselectClassification()
        stream('LOAD_CLASSIFICATION_RECIPE',
            api.recipe.load$(recipeId),
            classification => this.recipeActions.setClassificationLegend(classification.model.legend),
            error => Notifications.error({message: msg('process.ccdc.panel.sources.classificationLoadError', {error}), error})
        )
    }

    deselectClassification() {
        this.recipeActions.setClassificationLegend(null)
    }


    componentDidUpdate() {
        this.deselectOutOfRange()
    }

    deselectOutOfRange() {
        const {dates, inputs: {opticalDataSets, radarDataSets}} = this.props
        const selectedDataSets = updateDataSets(opticalDataSets.value, ...dateRange(dates))
        if (!arrayEquals(selectedDataSets, opticalDataSets.value))
            opticalDataSets.set(selectedDataSets)
        if (!_.isEmpty(radarDataSets.value) && this.s1OutOfRange())
            radarDataSets.set([])
    }

    s1OutOfRange() {
        const {dates} = this.props
        const [from] = dateRange(dates)
        return from.isBefore(moment('2014-10-03'))
    }
}

Sources.propTypes = {}

const valuesToModel = values => {
    return {
        dataSets: {
            LANDSAT: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('LANDSAT')) : null,
            SENTINEL_2: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_2')) : null,
            SENTINEL_1: values.radarDataSets ? values.radarDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_1')) : null
        },
        classification: values.classification
    }
}

const modelToValues = model => {
    return {
        opticalDataSets: (model.dataSets['LANDSAT'] || []).concat(model.dataSets['SENTINEL_2'] || []),
        radarDataSets: model.dataSets['SENTINEL_1'] || [],
        classification: model.classification
    }
}

export default compose(
    Sources,
    connect(mapStateToProps),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
