import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceTypeButtons} from '~/app/home/body/process/sourceTypeButtons'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {ImageForm} from './imageForm'
import styles from './inputImage.module.css'
import {RecipeSection} from './recipeSection'

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
        this.updateImageLayerSources = this.updateImageLayerSources.bind(this)
        this.clearSource = this.clearSource.bind(this)
    }

    render() {
        const {title} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement="bottom-right"
                onApply={this.updateImageLayerSources}>
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
        const recipe = inputs.section.value === 'RECIPE_REF'
        return (
            <ImageForm
                {...this.props}
                inputComponent={recipe ? RecipeSection : AssetSection}
                input={recipe ? inputs.recipe : inputs.asset}
                labelButtons={[
                    <SourceTypeButtons key='section' input={inputs.section} recipe='RECIPE_REF' onChange={this.clearSource}/>
                ]}
            />
        )
    }

    // A source of the other type starts over: nothing selected or read for the previous one carries across.
    clearSource() {
        const {inputs} = this.props
        inputs.bands.set(undefined)
        inputs.recipe.set(undefined)
        inputs.asset.set(undefined)
        inputs.metadata.set(undefined)
        inputs.visualizations.set(undefined)
    }

    updateImageLayerSources({section, asset, recipe: recipeId, metadata, visualizations}) {
        const {recipeActionBuilder} = this.props

        const imageMaskLayerSource = () => {
            switch (section) {
                case 'RECIPE_REF':
                    return {
                        id: recipeId,
                        type: 'Recipe',
                        sourceConfig: {
                            recipeId
                        }
                    }
                case 'ASSET':
                    return {
                        id: asset,
                        type: 'Asset',
                        sourceConfig: {
                            description: asset,
                            asset,
                            metadata,
                            visualizations
                        }
                    }
                default:
                    return
            }
        }

        const source = imageMaskLayerSource()
        // A layer entry is keyed by the id of what it shows. Applying a section with nothing selected once
        // wrote an entry with no id and no recipe, which every later open tried to load.
        if (source?.id) {
            recipeActionBuilder('UPDATE_INPUT_IMAGE_LAYER_SOURCE', {source})
                .set(['layers.additionalImageLayerSources', {id: source.id}], source)
                .dispatch()
        }
    }
}

export const modelToValues = model => {
    const values = {
        section: model.type || 'ASSET',
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
    recipeActionBuilder: PropTypes.any.isRequired,
    title: PropTypes.string.isRequired
}
