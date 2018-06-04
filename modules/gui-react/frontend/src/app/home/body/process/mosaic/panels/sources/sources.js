import {arrayEquals} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {imageSourceById, sources} from 'sources'
import {msg, Msg} from 'translate'
import Buttons from 'widget/buttons'
import {Constraints, form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './sources.module.css'
import updateSource from './updateSource'

const inputs = {
    source: new Constraints()
        .notEmpty('process.mosaic.panel.sources.form.required'),
    dataSets: new Constraints()
        .notEmpty('process.mosaic.panel.sources.form.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.sources')
    }
}

class Sources extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipe = RecipeActions(recipeId)
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
        const {recipeId, form, className} = this.props
        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    onApply={(recipe, sources) => recipe.setSources(sources).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.sources.title')}>
                    <div className={styles.form}>
                        {this.renderSources()}
                        {this.renderDataSets()}
                    </div>
                </PanelForm>
            </form>
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
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Sources)

