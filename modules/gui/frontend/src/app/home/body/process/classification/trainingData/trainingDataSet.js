import {Form} from 'widget/form/form'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PanelSections from 'widget/panelSections'
import React from 'react'
import styles from './trainingDataSet.module.css'
import SectionSelection from './sectionSelection'
import TestForm from './testForm'

const fields = {
    dataSetId: new Form.Field(),
    type: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.section.required')
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class TrainingDataSet extends React.Component {
    render() {
        const {inputs} = this.props

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections
                    inputs={inputs}
                    sections={this.getSectionOptions()}
                    selected={inputs.type}
                    icon='table'
                    label={msg('TRAINING DATA SET')}
                />
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    getSectionOptions() {
        const {inputs} = this.props
        return [
            {
                component: <SectionSelection section={inputs.type}/>
            },
            {
                value: 'EE_TABLE',
                label: msg('process.classification.panel.trainingData.type.EE_TABLE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.EE_TABLE.tooltip'),
                title: msg('process.classification.panel.trainingData.type.EE_TABLE.title'),
                component: <TestForm ${...this.props}/>
            },
            {
                value: 'CSV_UPLOAD',
                label: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.label'),
                tooltip: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.tooltip'),
                title: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.title'),
                component: <TestForm ${...this.props}/>
            },
            {
                value: 'SAMPLE_CLASSIFICATION',
                label: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.label'),
                tooltip: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.tooltip'),
                title: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.title'),
                component: <TestForm ${...this.props}/>
            },
            {
                value: 'RECIPE',
                label: msg('process.classification.panel.trainingData.type.RECIPE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.RECIPE.tooltip'),
                title: msg('process.classification.panel.trainingData.type.RECIPE.title'),
                component: <TestForm ${...this.props}/>
            }
        ]
    }

    componentDidMount() {
        // const {inputs: {bandSetSpecs}} = this.props
        // if (!bandSetSpecs.value)
        //     bandSetSpecs.set([{id: guid(), type: 'IMAGE_BANDS', class: 'IMAGE_BANDS'}])
    }

    componentDidUpdate() {
        const {inputs, activatable: {dataSetId}} = this.props
        inputs.dataSetId.set(dataSetId)
    }

    addImage() {
        const {onAdd, activatable: {deactivate}} = this.props
        onAdd(this.getSelectedImage())
        deactivate()
    }

    getSelectedImage() {
        const {inputs: {section, recipe, asset}} = this.props
        switch (section.value) {
            case 'ASSET':
                return {
                    type: 'ASSET',
                    id: asset.value
                }
            case 'RECIPE_REF':
                return {
                    type: 'RECIPE_REF',
                    id: recipe.value
                }
            default:
                throw Error(`Unexpected image section: ${section.value}`)
        }
    }

}

const modelToValues = model => {
    return {...model}
    // const values = {
    //     imageId: model.imageId,
    //     section: model.type || 'SELECTION',
    //     bands: model.bands,
    //     bandSetSpecs: model.bandSetSpecs
    // }
    //
    // // TODO: Update...
    // switch (model.type) {
    //     case 'RECIPE_REF':
    //         return {...values, recipe: model.id}
    //     case 'ASSET':
    //         return {...values, asset: model.id}
    //     default:
    //         return values
    // }

}

const valuesToModel = values => {
    return {...values, name: values.dataSetId + '-the-name'}
    // const model = {
    //     imageId: values.imageId,
    //     type: values.section,
    //     bands: values.bands,
    //     bandSetSpecs: values.bandSetSpecs
    // }
    // // TODO: Update...
    // switch (values.section) {
    //     case 'RECIPE_REF':
    //         return {...model, id: values.recipe}
    //     case 'ASSET':
    //         return {...model, id: values.asset}
    //     default:
    //         return null
    // }
}

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'trainingDataSet',
    path: props => {
        const dataSetId = selectFrom(props, 'activatable.dataSetId')
        return dataSetId ? ['trainingData.dataSets', {dataSetId}] : null
    },
    fields,
    valuesToModel,
    modelToValues,
    mapRecipeToProps,
    policy
}

export default compose(
    TrainingDataSet,
    recipeFormPanel(panelOptions)
)

TrainingDataSet.propTypes = {}
