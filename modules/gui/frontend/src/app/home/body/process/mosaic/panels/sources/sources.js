import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {Msg, msg} from 'translate'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {arrayEquals, selectFrom} from 'collections'
import {dateRange, RecipeActions} from '../../mosaicRecipe'
import {imageSourceById, isDataSetInDateRange, isSourceInDateRange, sources} from 'sources'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sources.module.css'
import updateSource from './updateSource'

const fields = {
    source: new Field()
        .notEmpty('process.mosaic.panel.sources.form.required'),
    dataSets: new Field()
        .notEmpty('process.mosaic.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
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
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
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
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }

    componentDidUpdate() {
        const {dates, inputs: {source, dataSets}} = this.props
        const [selectedSource, selectedDataSets] = updateSource(source.value, dataSets.value, ...dateRange(dates))
        if (selectedSource !== source.value)
            source.set(selectedSource)

        if (!arrayEquals(selectedDataSets, dataSets.value))
            dataSets.set(selectedDataSets)
    }

    componentWillUnmount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).showPreview().dispatch()
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

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {compatibleWith: {include: ['sceneSelection']}}
        : {
            compatibleWith: {exclude: []},
            deactivateWhen: {exclude: ['sceneSelection']}
        }
}

export default recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel, policy})(Sources)
