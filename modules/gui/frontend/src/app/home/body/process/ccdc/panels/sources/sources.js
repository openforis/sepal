import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals} from 'collections'
import {compose} from 'compose'
import {dateRange} from '../../ccdcRecipe'
import {imageSourceById, isDataSetInDateRange} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'
import {filterOpticalBands, filterRadarBands, opticalBandOptions, radarBandOptions} from '../../bandOptions'

const fields = {
    opticalDataSets: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .notEmpty('process.ccdc.panel.sources.form.required'),
    radarDataSets: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .notEmpty('process.ccdc.panel.sources.form.required'),
    opticalBreakpointBands: new Form.Field()
        .skip((value, {radarDataSets}) => !_.isEmpty(radarDataSets))
        .predicate(bands => bands && bands.length, 'process.ccdc.panel.source.form.breakpointBands.atLeastOne'),
    radarBreakpointBands: new Form.Field()
        .skip((value, {opticalDataSets}) => !_.isEmpty(opticalDataSets))
        .predicate(bands => bands && bands.length, 'process.ccdc.panel.source.form.breakpointBands.atLeastOne')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
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
                <Panel.Content  className={styles.content}>
                    <Layout>
                        {this.renderOpticalDataSets()}
                        {this.renderRadarDataSets()}
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

    renderOpticalBreakpointBands() {
        const {inputs: {opticalBreakpointBands, opticalDataSets}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={opticalBreakpointBands}
                options={opticalBandOptions({dataSets: opticalDataSets.value})}
                multiple
            />
        )
    }

    renderRadarBreakpointBands() {
        const {inputs: {radarBreakpointBands}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={radarBreakpointBands}
                options={radarBandOptions({})}
                multiple
            />
        )
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
        const {inputs: {opticalDataSets, opticalBreakpointBands, radarBreakpointBands}} = this.props
        opticalBreakpointBands.set(
            filterOpticalBands(opticalBreakpointBands.value, opticalDataSets.value)
        )
        radarBreakpointBands.set(
            filterRadarBands(radarBreakpointBands.value)
        )
    }

    s1OutOfRange() {
        const {dates} = this.props
        const [from] = dateRange(dates)
        return from.isBefore(moment('2014-10-03'))
    }
}


Sources.propTypes = {}

const valuesToModel = values => {
    console.log({values})
    return {
        dataSets: {
            LANDSAT: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('LANDSAT')) : null,
            SENTINEL_2: values.opticalDataSets ? values.opticalDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_2')) : null,
            SENTINEL_1: values.radarDataSets ? values.radarDataSets.filter(dataSetId => dataSetId.startsWith('SENTINEL_1')) : null
        },
        breakpointBands: _.isEmpty(values.opticalDataSets) ? values.radarBreakpointBands : values.opticalBreakpointBands
    }
}

const modelToValues = ({dataSets, breakpointBands}) => ({
    opticalDataSets: (dataSets['LANDSAT'] || []).concat(dataSets['SENTINEL_2'] || []),
    radarDataSets: dataSets['SENTINEL_1'] || [],
    opticalBreakpointBands: _.isEmpty(dataSets['SENTINEL_1']) ? breakpointBands : [],
    radarBreakpointBands: _.isEmpty(dataSets['SENTINEL_1']) ? [] : breakpointBands
})

export default compose(
    Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
