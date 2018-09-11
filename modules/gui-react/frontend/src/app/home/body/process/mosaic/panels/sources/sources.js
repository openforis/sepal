import {Field, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {arrayEquals} from 'collections'
import {imageSourceById, sources} from 'sources'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import PanelButtons from 'widget/panelButtons'
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

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.sources')
    if (!values) {
        const model = recipeState('model.sources')
        values = modelToValues(model)
        RecipeActions(recipeId).setSources({values, model}).dispatch()
    }
    return {
        values: recipeState('ui.sources')
    }
}

class Sources extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        const {dateRange, isSourceInDateRange, isDataSetInDateRange} = RecipeState(recipeId)
        this.dateRange = dateRange
        this.isSourceInDateRange = isSourceInDateRange
        this.isDataSetInDateRange = isDataSetInDateRange
    }

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
        const {inputs: {source}} = this.props
        const options = sources.map((value) =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.source.options', value]),
                disabled: !this.isSourceInDateRange(value)
            })
        )
        return (
            <div>
                <label><Msg id='process.mosaic.panel.sources.form.source.label'/></label>
                <Buttons
                    className={styles.sources}
                    input={source}
                    options={options}
                    onChange={(sourceValue) => this.sourceChanged(sourceValue)}/>
            </div>
        )
    }

    renderDataSets() {
        const {inputs: {source, dataSets}} = this.props
        if (!source.value)
            return
        const dataSetNames = this.lookupDataSetNames(source.value)
        const options = (dataSetNames || []).map((value) =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: ['process.mosaic.panel.sources.form.dataSets.options', value],
                disabled: !this.isDataSetInDateRange(value)
            })
        )
        const content = options.length > 1
            ? <Buttons className={styles.dataSets} input={dataSets} options={options} multiple/>
            : <div className={styles.oneDataSet}><Msg id='process.mosaic.panel.sources.form.dataSets.oneDataSet'/></div>
        return (
            <div>
                <label><Msg id='process.mosaic.panel.sources.form.dataSets.label'/></label>
                {content}
            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.mosaic.panel.sources.title')}/>

                <PanelContent>
                    <div>
                        {this.renderSources()}
                        {this.renderDataSets()}
                    </div>
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setSources({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    componentDidUpdate() {
        const {inputs: {source, dataSets}} = this.props
        const [selectedSource, selectedDataSets] = updateSource(source.value, dataSets.value, ...this.dateRange())
        if (selectedSource !== source.value)
            source.set(selectedSource)

        if (!arrayEquals(selectedDataSets, dataSets.value))
            dataSets.set(selectedDataSets)
    }
}

Sources.propTypes = {
    action: PropTypes.func,
    fields: PropTypes.object,
    form: PropTypes.object,
    inputs: PropTypes.object,
    recipeId: PropTypes.string,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Sources)


const valuesToModel = (values) => {
    return {[values.source]: values.dataSets ? [...values.dataSets] : null}
}

const modelToValues = (model) => {
    return {
        source: Object.keys(model)[0],
        dataSets: [...Object.values(model)[0]]
    }
}
