import _ from 'lodash'
import React from 'react'

import {getIndexes} from '~/app/home/body/process/recipe/opticalMosaic/indexes'
import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {toSources} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './sources.module.css'

const fields = {
    dataSets: new Form.Field()
        .notEmpty(),
    cloudPercentageThreshold: new Form.Field(),
    index: new Form.Field()
        .notBlank()
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class _Sources extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.landTrendr.panel.sources.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderDataSets()}
                        {this.renderCloudPercentageThreshold()}
                        {this.renderIndex()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderDataSets() {
        const {dates, inputs: {dataSets}} = this.props
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={opticalDataSetOptions({
                    startDate: `${dates.startYear}-01-01`,
                    endDate: `${dates.endYear + 1}-01-01`
                })}
                multiple
            />
        )
    }

    renderCloudPercentageThreshold() {
        const {inputs: {cloudPercentageThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.landTrendr.panel.sources.form.cloudPercentageThreshold.label')}
                tooltip={msg('process.landTrendr.panel.sources.form.cloudPercentageThreshold.tooltip')}
                input={cloudPercentageThreshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                range='low'
                info={value =>
                    msg('process.landTrendr.panel.sources.form.cloudPercentageThreshold.value', {value})
                }
            />
        )
    }

    renderIndex() {
        const {inputs: {dataSets, index}} = this.props
        const options = this.indexOptions(dataSets.value)
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.sources.form.index.label')}
                tooltip={msg('process.landTrendr.panel.sources.form.index.tooltip')}
                input={index}
                options={options}
                multiple={false}
                disabled={!options.length}
            />
        )
    }

    indexOptions(dataSets) {
        const dataSetIds = _.isArray(dataSets) ? dataSets : [dataSets].filter(Boolean)
        const indexes = getIndexes({model: {sources: {dataSets: toSources(dataSetIds)}}})
        return indexes.map(value => ({value, label: value.toUpperCase()}))
    }

    componentDidMount() {
        const {inputs: {dataSets, index}} = this.props
        this.ensureValidIndex(dataSets.value, index)
    }

    componentDidUpdate(prevProps) {
        const {inputs: {dataSets, index}} = this.props
        if (!_.isEqual(prevProps.inputs.dataSets.value, dataSets.value)) {
            this.ensureValidIndex(dataSets.value, index)
        }
    }

    ensureValidIndex(dataSets, index) {
        const options = this.indexOptions(dataSets)
        if (!options.find(({value}) => value === index.value)) {
            const preferred = options.find(({value}) => value === 'nbr')
            index.set(preferred ? preferred.value : (options.length ? options[0].value : null))
        }
    }
}

const valuesToModel = ({dataSets, cloudPercentageThreshold, index}) => ({
    dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
    cloudPercentageThreshold,
    index
})

const modelToValues = ({dataSets, cloudPercentageThreshold, index}) => ({
    dataSets: _.uniq(Object.values(dataSets).flat()),
    cloudPercentageThreshold,
    index
})

export const Sources = compose(
    _Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Sources.propTypes = {}
