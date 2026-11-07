import _ from 'lodash'
import React from 'react'

import {collectionIndexes} from '#sepal/recipe/collectionBands'
import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {toSources, withChosenBands} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {indexLabel} from '../../sourcesRequirements'
import styles from './sources.module.css'

const fields = {
    dataSets: new Form.Field()
        .notEmpty('process.landTrendr.panel.sources.form.dataSets.required'),
    cloudPercentageThreshold: new Form.Field(),
    index: new Form.Field()
        .notBlank('process.landTrendr.panel.sources.form.index.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates'),
    corrections: selectFrom(recipe, 'model.options.corrections')
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

    // The dates stop a data set being chosen for years it cannot cover, but one chosen stays shown as chosen, and removable:
    // what is wrong with it, if anything, is said here.
    renderDataSets() {
        const {form, dates, inputs: {dataSets}} = this.props
        const chosen = chosenDataSets(dataSets.value)
        const options = opticalDataSetOptions({
            startDate: `${dates.startYear}-01-01`,
            endDate: `${dates.endYear + 1}-01-01`
        }).map(option => chosen.includes(option.value) ? {...option, neverSelected: false} : option)
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={options}
                multiple
                errorMessage={form.getErrorMessage(dataSets)}
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

    // The indexes the collection the draft's data sets configure, processed as PRC applies, can compute. The index chosen
    // stays shown as chosen, so the form has none to drop, whether or not it is among them; a blank one is none.
    renderIndex() {
        const {form, inputs: {index}} = this.props
        const options = withChosenBands([this.indexOptions()], index.value || null, indexLabel).flat()
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.sources.form.index.label')}
                tooltip={msg('process.landTrendr.panel.sources.form.index.tooltip')}
                input={index}
                options={options}
                multiple={false}
                disabled={!options.length}
                errorMessage={form.getErrorMessage(index)}
            />
        )
    }

    indexOptions() {
        const {corrections, inputs: {dataSets}} = this.props
        return collectionIndexes({sources: {dataSets: toSources(chosenDataSets(dataSets.value))}, options: {corrections}})
            .map(value => ({value, label: indexLabel(value)}))
    }
}

const chosenDataSets = dataSets => _.isArray(dataSets) ? dataSets : [dataSets].filter(Boolean)

const valuesToModel = ({dataSets, cloudPercentageThreshold, index}) => ({
    dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
    cloudPercentageThreshold,
    index
})

const modelToValues = ({dataSets, cloudPercentageThreshold, index}) => ({
    dataSets: _.uniq(Object.values(dataSets || {}).flat()),
    cloudPercentageThreshold,
    index
})

export const Sources = compose(
    _Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Sources.propTypes = {}
