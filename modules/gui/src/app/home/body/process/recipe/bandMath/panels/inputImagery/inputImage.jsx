import PropTypes from 'prop-types'
import React from 'react'

import {adoptOtherSources, DUPLICATE_SOURCE, inputSourceKey, isFreeSource} from '~/app/home/body/process/inputImages'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceKind} from '~/app/home/body/process/sourceTypeButtons'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {mathOptions} from '~/widget/codeEditor/mathOptions'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {newVariableName} from '../../variableName'
import {AssetSection} from './assetSection'
import {isMissingBand} from './bands'
import {ImageForm} from './imageForm'
import styles from './inputImage.module.css'
import {RecipeSection} from './recipeSection'

// A new input starts as an asset.
const NEW_INPUT_KIND = 'ASSET'

const fields = {
    otherNames: new Form.Field(),
    otherSources: new Form.Field(),
    imageId: new Form.Field(),
    name: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.bandNames.invalidFormat')
        .predicate(
            (name, {otherNames}) => !otherNames.includes(name),
            'process.bandMath.duplicateName'
        )
        .predicate(
            name => !mathOptions(msg).map(({name}) => name).includes(name),
            'process.bandMath.invalidName'
        ),
    section: new Form.Field()
        .notBlank(),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank()
        .predicate(isFreeSource('RECIPE_REF'), DUPLICATE_SOURCE),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank()
        .predicate(isFreeSource('ASSET'), DUPLICATE_SOURCE),
    bands: new Form.Field()
        .notEmpty(),
    // What a read of the selected source in this panel answered, never saved: until one does, nothing is known missing.
    currentBands: new Form.Field(),
    // The source the selected bands belong to, never saved: the one the input was saved with, until another answers.
    bandsSource: new Form.Field(),
    // The legends of bands switched to continuous while the form is open, by band id, restored if switched back. Never
    // saved.
    setAsideLegends: new Form.Field(),
    visualizations: new Form.Field(),
    includedBands: new Form.Field()
        .notEmpty()
        .predicate(
            (includedBands, {currentBands}) => !missingBands(includedBands, currentBands).length,
            'process.bandMath.requirement.missingInputBands',
            ({includedBands, currentBands}) => ({bands: missingBands(includedBands, currentBands).join(', ')})
        )
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _InputImage extends React.Component {
    constructor(props) {
        super(props)
        this.notifyChange = this.notifyChange.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'
                onApply={this.notifyChange}>
                <Panel.Header icon='image' title={msg('process.panels.inputImagery.sections.title')}/>
                <Panel.Content>
                    {this.renderImageForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    // The kind of source is chosen beside its picker, each kind showing its own draft.
    renderImageForm() {
        const {inputs} = this.props
        return (
            <SourceKind
                input={inputs.section}
                recipe='RECIPE_REF'
                defaultKind={NEW_INPUT_KIND}
                onChange={kind => this.switchKind(kind)}>
                {({recipe, labelButtons}) =>
                    <ImageForm
                        key={inputs.section.value}
                        {...this.props}
                        inputComponent={recipe ? RecipeSection : AssetSection}
                        input={recipe ? inputs.recipe : inputs.asset}
                        labelButtons={labelButtons}
                    />
                }
            </SourceKind>
        )
    }

    componentDidMount() {
        this.setSection()
        this.setName()
        this.setOtherNames()
        this.setOtherSources()
        this.setImageId()
    }

    // Each kind of source keeps a draft of its own while the form is open - the bands selected for its source, and what that
    // source was read to have - so switching back restores what was selected for that kind, and no band crosses from one
    // kind to the other. A kind not yet shown starts with nothing selected. The pickers keep their sources themselves.
    switchKind(kind) {
        const {inputs} = this.props
        this.drafts = {...this.drafts, [this.shownKind]: draftOf(inputs)}
        const {includedBands, bands, visualizations, currentBands, bandsSource, setAsideLegends} = this.drafts[kind] || EMPTY_DRAFT
        inputs.includedBands.set(includedBands)
        inputs.bands.set(bands)
        inputs.visualizations.set(visualizations)
        inputs.currentBands.setInitialValue(currentBands)
        inputs.bandsSource.setInitialValue(bandsSource)
        inputs.setAsideLegends.setInitialValue(setAsideLegends)
        this.shownKind = kind
    }

    // The kind shown first: the one saved, or the one a new input starts as (SourceKind).
    setSection() {
        const {inputs: {section}} = this.props
        this.shownKind = section.value || NEW_INPUT_KIND
    }

    // The sources of the recipe's other inputs, which this one may not take.
    setOtherSources() {
        const {images, activatable: {imageId}, inputs: {otherSources}} = this.props
        adoptOtherSources(otherSources, images, imageId)
    }

    setImageId() {
        const {inputs, activatable: {imageId}} = this.props
        if (!inputs.imageId.value) {
            inputs.imageId.set(imageId)
        }
    }

    setName() {
        const {images, calculations, inputs: {name}} = this.props
        if (!name.value) {
            name.set(newVariableName('i', {images, calculations}))
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
            otherNames.setInitialValue([...otherImageNames, ...calculationNames])
        }
    }

    // The list follows an applied input; the layout's sources follow the recipe's inputs (dependencyLayerSources.js).
    notifyChange() {
        const {onChange} = this.props
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

const missingBands = (includedBands, bands) =>
    (includedBands || [])
        .filter(bandSpec => isMissingBand(bandSpec, bands))
        .map(({name}) => name)

const draftOf = ({includedBands, bands, visualizations, currentBands, bandsSource, setAsideLegends}) => ({
    includedBands: includedBands.value,
    bands: bands.value,
    visualizations: visualizations.value,
    currentBands: currentBands.value,
    bandsSource: bandsSource.value,
    setAsideLegends: setAsideLegends.value
})

const EMPTY_DRAFT = {includedBands: [], bands: {}, visualizations: undefined, currentBands: null, bandsSource: null, setAsideLegends: {}}

const modelToValues = model => {
    const values = {
        imageId: model.imageId,
        name: model.name,
        section: model.type,
        asset: model.asset,
        bands: model.bands,
        visualizations: model.visualizations,
        includedBands: model.includedBands,
        bandsSource: inputSourceKey(model)
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
