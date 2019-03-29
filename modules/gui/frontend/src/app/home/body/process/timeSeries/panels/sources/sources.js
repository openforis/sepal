import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {Msg, msg} from 'translate'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals} from 'collections'
import {dateRange} from '../../timeSeriesRecipe'
import {imageSourceById, isDataSetInDateRange} from 'sources'
import {selectFrom} from 'stateUtils'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import React from 'react'
import styles from './sources.module.css'
import updateDataSets from './updateDataSets'

const fields = {
    dataSets: new Field()
        .notEmpty('process.timeSeries.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
    }

    renderDataSets() {
        const {dates, inputs: {dataSets}} = this.props
        const [from, to] = dateRange(dates)
        const dataSetNames = this.lookupDataSetNames('LANDSAT')
        const options = (dataSetNames || []).map(value =>
            ({
                value,
                label: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.timeSeries.panel.sources.form.dataSets.options', value, 'tooltip']),
                neverSelected: !isDataSetInDateRange(value, from, to)
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
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.sources.title')}/>

                <PanelContent>
                    <div>
                        {this.renderDataSets()}
                    </div>
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate() {
        const {dates, inputs: {dataSets}} = this.props
        const selectedDataSets = updateDataSets(dataSets.value, ...dateRange(dates))
        if (!arrayEquals(selectedDataSets, dataSets.value))
            dataSets.set(selectedDataSets)
    }
}

Sources.propTypes = {}

const valuesToModel = values => {
    return {LANDSAT: values.dataSets ? [...values.dataSets] : null}
}

const modelToValues = model => {
    return {
        dataSets: [...Object.values(model)[0]]
    }
}

export default recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})(Sources)
