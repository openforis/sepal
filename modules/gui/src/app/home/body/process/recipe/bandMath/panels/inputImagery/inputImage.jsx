import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'
import {PanelSections} from '~/widget/panelSections'

import {AssetSection} from './assetSection'
import {bandsAvailableToAdd, defaultBand} from './bands'
import {ImageForm} from './imageForm'
import styles from './inputImage.module.css'
import {RecipeSection} from './recipeSection'
import {SectionSelection} from './sectionSelection'

const fields = {
    otherNames: new Form.Field(),
    imageId: new Form.Field(),
    name: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.bandNames.invalidFormat')
        .predicate(
            (name, {otherNames}) => !otherNames.includes(name),
            'process.bandMath.duplicateName'
        ),
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
    visualizations: new Form.Field(),
    includedBands: new Form.Field()
        .notEmpty()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _InputImage extends React.Component {
    constructor(props) {
        super(props)
        this.updateImageLayerSources = this.updateImageLayerSources.bind(this)
    }

    render() {
        const {inputs} = this.props
        const sections = [
            {
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                label: msg('process.panels.inputImagery.recipe.title'),
                title: msg('SEPAL RECIPE'),
                component: <ImageForm ${...this.props} inputComponent={RecipeSection} input={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                label: msg('process.panels.inputImagery.asset.title'),
                title: msg('EARTH ENGINE ASSET'),
                component: <ImageForm ${...this.props} inputComponent={AssetSection} input={inputs.asset}/>
            }
        ]

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'
                onApply={this.updateImageLayerSources}>
                <PanelSections
                    inputs={inputs}
                    sections={sections}
                    selected={inputs.section}
                    icon='image'
                    label={msg('process.panels.inputImagery.sections.title')}
                    defaultButtons={
                        <Form.PanelButtons>
                            <Panel.Buttons.Add
                                disabled={!this.canAddBand()}
                                onClick={() => this.addBand()}/>
                        </Form.PanelButtons>
                    }
                />
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        this.setName()
        this.setOtherNames()
        this.setImageId()
    }

    componentDidUpdate() {
        this.setName()
        this.setOtherNames()
        this.setImageId()
    }

    setImageId() {
        const {inputs, activatable: {imageId}} = this.props
        if (!inputs.imageId.value) {
            inputs.imageId.set(imageId)
        }
    }

    setName() {
        const {images, inputs: {name}} = this.props
        if (!name.value) {
            name.set(`i${images.length + 1}`)
        }
    }

    setOtherNames() {
        const {images, calculations, inputs: {otherNames}, activatable: {imageId}} = this.props
        if (!otherNames.value) {
            const otherImageNames = images
                .filter(image => image.imageId !== imageId)
                .map(({name}) => name)
            const calculationNames = calculations
                .map(({name}) => name)
            otherNames.set([...otherImageNames, ...calculationNames])
        }
    }

    canAddBand() {
        const {inputs: {bands, includedBands}} = this.props
        return !!bandsAvailableToAdd(bands.value, includedBands.value).length
    }

    addBand() {
        const {inputs: {bands, includedBands}} = this.props
        const availableBands = bandsAvailableToAdd(bands.value, includedBands.value)
        if (availableBands.length) {
            includedBands.set([...(includedBands.value || []), defaultBand(availableBands[0], bands.value)])
        }
    }

    updateImageLayerSources({section, asset, recipe: recipeId, visualizations}) {
        const {recipeActionBuilder, onChange} = this.props

        const toImageLayerSource = () => {
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
                        visualizations
                    }
                }
            default:
                throw Error(`Unexpected section: ${section}`)
            }
        }

        const source = toImageLayerSource()

        recipeActionBuilder('UPDATE_INPUT_IMAGE_LAYER_SOURCE', {source})
            .set(['layers.additionalImageLayerSources', {id: source.id}], source)
            .dispatch()

        onChange && setTimeout(() => onChange())
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
    const values = {
        imageId: model.imageId,
        name: model.name,
        section: model.type || 'SELECTION',
        recipe: model.recipe,
        asset: model.asset,
        bands: model.bands,
        visualizations: model.visualizations,
        includedBands: model.includedBands
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

const valuesToModel = values => {
    const model = {
        imageId: values.imageId,
        name: values.name,
        type: values.section,
        recipe: values.recipe,
        asset: values.asset,
        bands: values.bands,
        visualizations: values.visualizations,
        includedBands: values.includedBands
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

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'inputImage',
    path: props => {
        const imageId = selectFrom(props, 'activatable.imageId')
        return imageId ? ['inputImagery.images', {imageId}] : null
    },
    fields,
    valuesToModel,
    modelToValues,
    mapRecipeToProps,
    policy
}

export const InputImage = compose(
    _InputImage,
    recipeFormPanel(panelOptions)
)

InputImage.propTypes = {
    onChange: PropTypes.func
}
