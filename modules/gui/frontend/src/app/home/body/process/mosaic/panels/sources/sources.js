import {Constraint, Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, dateRange} from '../../mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {imageSourceById, isDataSetInDateRange, sources} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './sources.module.css'

const fields = _.transform(sources,
    (fields, source) => fields[source] = new Field(),
    {})

const constraints = {
    dataSetSelected: new Constraint(sources)
        .predicate(values =>
            Object.values(values).find(value =>
                _.isArray(value) && value.length), 'process.mosaic.panel.sources.form.required')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    lookupDataSetNames(sourceValue) {
        return sourceValue ? imageSourceById[sourceValue].dataSets : null
    }

    renderSources() {
        return sources.map(source =>
            this.renderSource(source, imageSourceById[source].dataSets)
        )
    }

    renderSource(source, dataSets) {
        const {dates, inputs} = this.props
        const [from, to] = dateRange(dates)
        const options = (dataSets || []).map(value =>
            ({
                value,
                label: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'label']),
                tooltip: msg(['process.mosaic.panel.sources.form.dataSets.options', value, 'tooltip']),
                disabled: !isDataSetInDateRange(value, from, to)
            })
        )
        return (
            <div key={source}>
                <Label msg={msg(['process.mosaic.panel.sources.form.source.options', source])}/>
                <Buttons
                    className={styles.dataSets}
                    input={inputs[source]}
                    options={options}
                    multiple
                />
            </div>
        )

    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onApply={(values, model) => {
                    if (Object.keys(model).length > 1) {
                        RecipeActions(recipeId).enableBandCalibration().dispatch()
                        RecipeActions(recipeId).useAllScenes().dispatch()
                    }
                }}
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelHeader
                    icon='satellite-dish'
                    title={msg('process.mosaic.panel.sources.title')}/>

                <PanelContent>
                    {this.renderSources()}
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

Sources.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => {
    const model = {}
    Object.keys(values)
        .filter(source => _.isArray(values[source]) && values[source].length)
        .forEach(source => model[source] = values[source])
    return model
}

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {
            _: 'disallow',
            sceneSelection: 'allow'
        }
        : {
            _: 'allow-then-deactivate',
            sceneSelection: 'allow'
        }
}

export default recipeFormPanel({id: 'sources', fields, constraints, mapRecipeToProps, valuesToModel, policy})(Sources)
