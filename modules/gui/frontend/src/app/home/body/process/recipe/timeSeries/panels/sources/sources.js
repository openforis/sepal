import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {connect, select} from 'store'
import {groupedDataSetOptions, toSources} from 'sources'
import {msg} from 'translate'
import {recipeAccess} from '../../../../recipeAccess'
import {selectFrom} from 'stateUtils'
import Notifications from 'widget/notifications'
import React from 'react'
import styles from './sources.module.css'

const fields = {
    dataSets: new Form.Field()
        .notEmpty(),
    classification: new Form.Field()
}

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
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
                        {this.renderDataSets()}
                        {this.renderClassification()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderDataSets() {
        const {dates, inputs: {dataSets}} = this.props
        const options = groupedDataSetOptions({dataSetIds: dataSets.value, ...dates})
        return (
            <Form.Buttons
                input={dataSets}
                options={options}
                multiple
            />
        )
    }

    renderClassification() {
        const {recipes, inputs: {classification}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CLASSIFICATION')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))
        return (
            <Form.Combo
                label={msg('process.timeSeries.panel.sources.form.classification.label')}
                tooltip={msg('process.timeSeries.panel.sources.form.classification.tooltip')}
                placeholder={msg('process.timeSeries.panel.sources.form.classification.placeholder')}
                input={classification}
                options={options}
                busyMessage={this.props.stream('LOAD_CLASSIFICATION_RECIPE').active && msg('widget.loading')}
                onChange={selected => selected
                    ? this.loadClassification(selected.value)
                    : this.deselectClassification()}
                allowClear
                autoFocus
                errorMessage
            />
        )
    }

    loadClassification(recipeId) {
        const {stream, loadRecipe$} = this.props
        this.deselectClassification()
        stream('LOAD_CLASSIFICATION_RECIPE',
            loadRecipe$(recipeId),
            classification => this.setState({
                classificationLegend: classification.model.legend,
                classifierType: classification.model.classifier.type
            }),
            error => Notifications.error({
                message: msg('process.timeSeries.panel.sources.classificationLoadError', {error}),
                error
            })
        )
    }

    deselectClassification() {
        this.setState({
            classificationLegend: null,
            classifierType: null
        })
    }
}

Sources.propTypes = {}

const valuesToModel = ({dataSets, classification}) => {
    return {
        dataSets: toSources(dataSets),
        classification
    }
}

const modelToValues = ({dataSets, classification}) => ({
    dataSets: Object.values(dataSets).flat(),
    classification
})

export default compose(
    Sources,
    connect(mapStateToProps),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel}),
    recipeAccess()
)
