import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {dateRange, RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {getDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
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
    cloudPercentageThreshold: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class _Sources extends React.Component {
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
                    <Layout>
                        {this.renderDataSets()}
                        {this.renderCloudPercentageThreshold()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderDataSets() {
        const {dates, inputs: {dataSets}} = this.props
        const [startDate, endDate] = dateRange(dates)
        return (
            <Form.Buttons
                label={msg('process.changeAlerts.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={getDataSetOptions({startDate, endDate})}
                multiple
            />
        )
    }
    
    renderCloudPercentageThreshold() {
        const {inputs: {cloudPercentageThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.changeAlerts.panel.sources.form.cloudPercentageThreshold.label')}
                tooltip={msg('process.changeAlerts.panel.sources.form.cloudPercentageThreshold.tooltip')}
                input={cloudPercentageThreshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                range='low'
                info={value =>
                    msg('process.changeAlerts.panel.sources.form.cloudPercentageThreshold.value', {value})
                }
            />
        )
    }
}

const valuesToModel = ({dataSets, cloudPercentageThreshold}) => {
    return ({
        dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
        cloudPercentageThreshold
    })
}

const modelToValues = ({dataSets, cloudPercentageThreshold}) => {
    const dataSetIds = _.uniq(Object.values(dataSets).flat())
    return ({
        dataSets: dataSetIds,
        cloudPercentageThreshold
    })
}

const additionalPolicy = () => ({sceneSelection: 'allow'})

export const Sources = compose(
    _Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel, additionalPolicy})
)

Sources.propTypes = {
    recipeId: PropTypes.string
}
