import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals} from 'collections'
import {compose} from 'compose'
import {dateRange, RecipeActions} from '../../ccdcRecipe'
import {imageSourceById, isDataSetInDateRange} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'
import {filterOpticalBands, filterRadarBands, opticalBandOptions, radarBandOptions} from '../../bandOptions'
import {connect, select} from 'store'
import api from 'api'
import Notifications from 'widget/notifications'

const fields = {
    opticalDataSets: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .notEmpty('process.ccdc.panel.sources.form.required'),
    radarDataSets: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .notEmpty('process.ccdc.panel.sources.form.required'),
    classification: new Form.Field(),
    opticalBreakpointBands: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .predicate(bands => bands && bands.length, 'process.ccdc.panel.source.form.breakpointBands.atLeastOne'),
    radarBreakpointBands: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .predicate(bands => bands && bands.length, 'process.ccdc.panel.source.form.breakpointBands.atLeastOne')
}

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates'),
    legend: selectFrom(recipe, 'ui.classificationLegend')
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
        const {inputs: {radarDataSets}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdc.panel.sources.title')}/>
                <Panel.Content className={styles.content}>
                    <Layout>
                        {this.renderOpticalDataSets()}
                        {this.renderRadarDataSets()}
                        {this.renderClassification()}
                        {_.isEmpty(radarDataSets.value)
                            ? this.renderOpticalBreakpointBands()
                            : this.renderRadarBreakpointBands()
                        }

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
                label: msg(['process.ccdc.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.ccdc.panel.sources.form.dataSets.options', value, 'tooltip']),
                neverSelected: !isDataSetInDateRange(value, from, to)
            })
        )
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.dataSets.optical.label')}
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
            label: msg(['process.ccdc.panel.sources.form.dataSets.options', 'SENTINEL_1', 'label']),
            tooltip: msg(['process.ccdc.panel.sources.form.dataSets.options', 'SENTINEL_1', 'tooltip']),
            neverSelected: this.s1OutOfRange()
        }]
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.dataSets.radar.label')}
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

    renderOpticalBreakpointBands() {
        const {inputs: {opticalBreakpointBands, opticalDataSets}} = this.props
        const options = [
            ...opticalBandOptions({dataSets: opticalDataSets.value}),
            ...this.classificationOptions()
        ]
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={opticalBreakpointBands}
                options={options}
                multiple
            />
        )
    }

    renderRadarBreakpointBands() {
        const {inputs: {radarBreakpointBands}} = this.props
        const options = [
            ...radarBandOptions({}),
            ...this.classificationOptions()
        ]
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={radarBreakpointBands}
                options={options}
                multiple
            />
        )
    }

    loadClassification(recipeId) {
        const {stream} = this.props
        this.deselectClassification()
        if (recipeId) {
            stream('LOAD_CLASSIFICATION_RECIPE',
                api.recipe.load$(recipeId),
                classification => this.recipeActions.setClassificationLegend(classification.model.legend),
                error => Notifications.error({
                    message: msg('process.ccdc.panel.sources.classificationLoadError', {error}),
                    error
                })
            )
        }
    }

    deselectClassification() {
        this.recipeActions.setClassificationLegend(null)
    }

    classificationOptions() {
        const {legend} = this.props
        if (!legend) {
            return []
        } else {
            return legend
                ? [{
                    options: [
                        {value: 'regression', label: msg('process.ccdc.panel.sources.form.breakpointBands.regression')},
                        ...legend.entries.map(({value, label}) => ({
                            value: `probability_${value}`,
                            label: msg('process.ccdc.panel.sources.form.breakpointBands.probability', {label})
                        }))
                    ]
                }]
                : []
        }
    }

    componentDidMount() {
        const {inputs: {classification}} = this.props
        if (classification) {
            this.loadClassification(classification.value)
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        this.deselectOutOfRange()
        this.deselectNonAvailableBands()
    }

    deselectOutOfRange() {
        const {dates, inputs: {opticalDataSets, radarDataSets}} = this.props
        const selectedDataSets = updateDataSets(opticalDataSets.value, ...dateRange(dates))
        if (!arrayEquals(selectedDataSets, opticalDataSets.value))
            opticalDataSets.set(selectedDataSets)
        if (!_.isEmpty(radarDataSets.value) && this.s1OutOfRange())
            radarDataSets.set([])
    }

    deselectNonAvailableBands = () => {
        const {stream, inputs: {opticalDataSets, opticalBreakpointBands, radarBreakpointBands}} = this.props
        if (stream('LOAD_CLASSIFICATION_RECIPE').active) {
            return
        }
        const classificationOptions = this.classificationOptions()
        const classificationValues = classificationOptions.length
            ? classificationOptions[0].options.map(({value}) => value)
            : []
        opticalBreakpointBands.set([
            ...filterOpticalBands(opticalBreakpointBands.value, opticalDataSets.value),
            ...classificationValues.filter(value => opticalBreakpointBands.value.includes(value))
        ])
        radarBreakpointBands.set([
            ...filterRadarBands(radarBreakpointBands.value),
            ...classificationValues.filter(value => radarBreakpointBands.value.includes(value))
        ])
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
        classification: values.classification,
        breakpointBands: _.isEmpty(values.opticalDataSets) ? values.radarBreakpointBands : values.opticalBreakpointBands
    }
}

const modelToValues = ({dataSets, classification, breakpointBands}) => ({
    opticalDataSets: (dataSets['LANDSAT'] || []).concat(dataSets['SENTINEL_2'] || []),
    radarDataSets: dataSets['SENTINEL_1'] || [],
    classification,
    opticalBreakpointBands: _.isEmpty(dataSets['SENTINEL_1']) ? breakpointBands : [],
    radarBreakpointBands: _.isEmpty(dataSets['SENTINEL_1']) ? [] : breakpointBands
})

export default compose(
    Sources,
    connect(mapStateToProps),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
