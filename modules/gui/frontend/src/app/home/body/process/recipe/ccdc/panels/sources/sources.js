import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../ccdcRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {connect, select} from 'store'
import {groupedBandOptions, groupedDataSetOptions, toSources} from 'sources'
import {msg} from 'translate'
import {recipeAccess} from '../../../../recipeAccess'
import {selectFrom} from 'stateUtils'
import Notifications from 'widget/notifications'
import React from 'react'
import styles from './sources.module.css'

const fields = {
    dataSets: new Form.Field()
        .notEmpty(),
    classification: new Form.Field(),
    breakpointBands: new Form.Field()
        .notEmpty()
}

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates'),
    corrections: selectFrom(recipe, 'model.opticalPreprocess.corrections')
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
                    title={msg('process.ccdc.panel.sources.title')}/>
                <Panel.Content className={styles.content}>
                    <Layout>
                        {this.renderDataSets()}
                        {this.renderClassification()}
                        {this.renderBreakpointBands()}

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
                label={msg('process.ccdc.panel.sources.form.classification.label')}
                tooltip={msg('process.ccdc.panel.sources.form.classification.tooltip')}
                placeholder={msg('process.ccdc.panel.sources.form.classification.placeholder')}
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

    renderBreakpointBands() {
        const {corrections, inputs: {breakpointBands, dataSets}} = this.props
        const {classificationLegend, classifierType} = this.state
        const options = groupedBandOptions({
            sources: toSources(dataSets.value),
            corrections,
            timeScan: false,
            classification: {classificationLegend, classifierType, include: ['regression', 'probabilities']},
            order: ['indexes', 'dataSets', 'classification']
        })
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={breakpointBands}
                options={options}
                multiple
                disabled={!options.length}
            />
        )
    }

    loadClassification(recipeId) {
        const {stream, loadRecipe$} = this.props
        this.deselectClassification()
        if (recipeId) {
            stream('LOAD_CLASSIFICATION_RECIPE',
                loadRecipe$(recipeId),
                classification => this.setState({
                    classificationLegend: classification.model.legend,
                    classifierType: classification.model.classifier.type
                }),
                error => Notifications.error({
                    message: msg('process.ccdc.panel.sources.classificationLoadError', {error}),
                    error
                })
            )
        }
    }

    deselectClassification() {
        this.setState({
            classificationLegend: null,
            classifierType: null
        })
    }

    componentDidMount() {
        const {inputs: {classification}} = this.props
        if (classification) {
            this.loadClassification(classification.value)
        }
    }
}

Sources.propTypes = {}

const valuesToModel = ({dataSets, classification, breakpointBands}) => ({
    dataSets: toSources(dataSets),
    classification,
    breakpointBands
})

const modelToValues = ({dataSets, classification, breakpointBands}) => ({
    dataSets: Object.values(dataSets).flat(),
    classification,
    breakpointBands
})

export default compose(
    Sources,
    connect(mapStateToProps),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel}),
    recipeAccess()
)
