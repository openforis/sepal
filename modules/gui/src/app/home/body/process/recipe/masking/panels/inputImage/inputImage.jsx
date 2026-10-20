import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceKind} from '~/app/home/body/process/sourceTypeButtons'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {ImageForm} from './imageForm'
import styles from './inputImage.module.css'
import {RecipeSection} from './recipeSection'

// A new input starts as an asset.
const NEW_INPUT_KIND = 'ASSET'

export const fields = {
    section: new Form.Field()
        .notBlank(),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank(),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank(),
    bands: new Form.Field()
        .notEmpty(),
    metadata: new Form.Field(),
    visualizations: new Form.Field()
}

export class InputImage extends React.Component {

    constructor(props) {
        super(props)
        this.clearSource = this.clearSource.bind(this)
    }

    render() {
        const {title} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement="bottom-right">
                <Panel.Header icon='image' title={title}/>
                <Panel.Content>
                    {this.renderImageForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderImageForm() {
        const {inputs} = this.props
        return (
            <SourceKind input={inputs.section} recipe='RECIPE_REF' defaultKind={NEW_INPUT_KIND} onChange={this.clearSource}>
                {({recipe, labelButtons}) =>
                    <ImageForm
                        {...this.props}
                        inputComponent={recipe ? RecipeSection : AssetSection}
                        input={recipe ? inputs.recipe : inputs.asset}
                        labelButtons={labelButtons}
                    />
                }
            </SourceKind>
        )
    }

    // A source of the other type starts over: nothing selected or read for the previous one carries across, and the
    // selector now shown starts neutral, as a new one does.
    clearSource() {
        const {inputs} = this.props
        const reset = {validate: false}
        inputs.bands.set(undefined, reset)
        inputs.recipe.set(undefined, reset)
        inputs.asset.set(undefined, reset)
        inputs.metadata.set(undefined, reset)
        inputs.visualizations.set(undefined, reset)
    }

}

export const modelToValues = model => {
    const values = {
        section: model.type,
        bands: model.bands,
        visualizations: model.visualizations
    }
    switch (model.type) {
        case 'RECIPE_REF':
            return {...values, recipe: model.id}
        case 'ASSET':
            return {...values, asset: model.id}
        default:
            return values
    }
}

export const valuesToModel = values => {
    const model = {
        type: values.section,
        bands: values.bands,
        visualizations: values.visualizations
    }
    switch (values.section) {
        case 'RECIPE_REF':
            return {...model, id: values.recipe}
        case 'ASSET':
            return {...model, id: values.asset}
        default:
            return null
    }
}

InputImage.propTypes = {
    filter: PropTypes.func,
    form: PropTypes.object.isRequired,
    inputs: PropTypes.object.isRequired,
    title: PropTypes.string.isRequired
}
