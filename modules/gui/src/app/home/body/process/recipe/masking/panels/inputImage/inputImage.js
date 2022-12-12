import {Form} from 'widget/form/form'
import {RecipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {SectionSelection} from './sectionSelection'
import {msg} from 'translate'
import AssetSection from './assetSection'
import ImageForm from './imageForm'
import PanelSections from 'widget/panelSections'
import PropTypes from 'prop-types'
import React from 'react'
import RecipeSection from './recipeSection'
import styles from './inputImage.module.css'

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
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement="bottom-right"
                onApply={this.updateImageLayerSources}>
                {this.renderSections()}
            </RecipeFormPanel>
        )
    }

    renderSections() {
        const {title, inputs} = this.props
        const sections = [
            {
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                label: msg('process.masking.panel.inputImage.recipe.title'),
                title: msg('process.masking.panel.inputImage.recipe.title'),
                component: <ImageForm ${...this.props} inputComponent={RecipeSection} input={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                label: msg('process.masking.panel.inputImage.asset.title'),
                title: msg('process.masking.panel.inputImage.asset.title'),
                component: <ImageForm ${...this.props} inputComponent={AssetSection} input={inputs.asset}/>
            }
        ]
        return (
            <PanelSections
                inputs={inputs}
                sections={sections}
                selected={inputs.section}
                icon="image"
                label={title}
                onChange={() => {
                    inputs.bands.set(undefined)
                    inputs.recipe.set(undefined)
                    inputs.asset.set(undefined)
                    inputs.metadata.set(undefined)
                    inputs.visualizations.set(undefined)
                }}
            />
        )
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
        if (source) {
            recipeActionBuilder('UPDATE_INPUT_IMAGE_LAYER_SOURCE', {source})
                .set(['layers.additionalImageLayerSources', {id: source.id}], source)
                .dispatch()
        }
    }
}

export const modelToValues = model => {
    const values = {
        section: model.type || 'SELECTION',
        bands: model.bands,
        visualiations: model.visualizations
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
    form: PropTypes.object.isRequired,
    inputs: PropTypes.object.isRequired,
    recipeActionBuilder: PropTypes.any.isRequired,
    title: PropTypes.string.isRequired
}
