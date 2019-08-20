import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals} from 'collections'
import {compose} from 'compose'
import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {imageSourceById, isDataSetInDateRange} from 'sources'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {dateRange} from '../../timeSeriesRecipe'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'

const fields = {
    opticalDataSets: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .notEmpty('process.timeSeries.panel.sources.form.required'),
    radarDataSets: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .notEmpty('process.timeSeries.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
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
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
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
        LANDSAT: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('LANDSAT')) : null,
        SENTINEL_2: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_2')) : null,
        SENTINEL_1: values.radarDataSets ? values.radarDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_1')) : null
    }
}

const modelToValues = model => {
    return {
        opticalDataSets: (model['LANDSAT'] || []).concat(model['SENTINEL_2'] || []),
        radarDataSets: model['SENTINEL_1'] || []
    }
}

export default compose(
    Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
