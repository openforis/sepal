import React from 'react'

import {adoptOtherSources, DUPLICATE_SOURCE, inputSourceKey, isFreeSource} from '~/app/home/body/process/inputImages'
import {getAvailableIndexes} from '~/app/home/body/process/opticalIndexes'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceTypeButtons} from '~/app/home/body/process/sourceTypeButtons'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {ButtonSelect} from '~/widget/buttonSelect'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {BandSetSpec} from './bandSetSpec'
import {ImageForm} from './imageForm'
import styles from './inputImage.module.css'
import {getProfileBandSetSpecs, isProfileDisabled} from './profiles'
import {RecipeSection} from './recipeSection'

const fields = {
    imageId: new Form.Field(),
    otherSources: new Form.Field(),
    section: new Form.Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required'),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.classification.panel.inputImagery.form.recipe.required')
        .predicate(isFreeSource('RECIPE_REF'), DUPLICATE_SOURCE),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.classification.panel.inputImagery.form.asset.required')
        .predicate(isFreeSource('ASSET'), DUPLICATE_SOURCE),
    bands: new Form.Field()
        .notEmpty('process.classification.panel.inputImagery.form.bands.required'),
    bandSetSpecs: new Form.Field()
        .predicate((bandSetSpecs, {bands}) =>
            bandSetSpecs && bandSetSpecs.find(spec => !BandSetSpec.isEmpty(spec, bands)),
        'process.classification.panel.inputImagery.form.bandSetSpecs.required'),
    // The source the band sets were chosen against, never saved: the one the input was saved with, until another answers.
    bandsSource: new Form.Field(),
    metadata: new Form.Field(),
    visualizations: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    images: selectFrom(recipe, 'model.inputImagery.images') || []
})

class _InputImage extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {inputs} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <Panel.Header icon='image' title={msg('process.classification.panel.inputImagery.sections.title')}/>
                <Panel.Content>
                    {this.renderImageForm()}
                </Panel.Content>
                <Form.PanelButtons>
                    <ButtonSelect
                        label={msg('process.classification.panel.inputImagery.derivedBands.label')}
                        tooltip={msg('process.classification.panel.inputImagery.derivedBands.tooltip')}
                        look='add'
                        icon='plus'
                        placement='above'
                        tooltipPlacement='bottom'
                        disabled={!inputs.section.value || !inputs.bands.value || !inputs.bands.value.length}
                        options={this.derivedBandsOptions()}
                        onSelect={option => this.updateBandSetSpecs(option)}
                    />
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    // The kind of source is chosen beside its picker, each kind showing its own draft.
    renderImageForm() {
        const {inputs} = this.props
        const recipe = inputs.section.value === 'RECIPE_REF'
        return (
            <ImageForm
                key={inputs.section.value}
                {...this.props}
                inputComponent={recipe ? RecipeSection : AssetSection}
                input={recipe ? inputs.recipe : inputs.asset}
                labelButtons={[
                    <SourceTypeButtons
                        key='section'
                        input={inputs.section}
                        recipe='RECIPE_REF'
                        onChange={kind => this.switchKind(kind)}
                    />
                ]}
            />
        )
    }

    componentDidMount() {
        this.setSection()
        this.initBandSetSpecs()
        this.setOtherSources()
    }

    componentDidUpdate() {
        const {inputs, activatable: {imageId}} = this.props
        inputs.imageId.set(imageId)
        this.initBandSetSpecs()
        this.setOtherSources()
    }

    // Each kind of source keeps a draft of its own while the form is open - its band sets, derived ones included, and what
    // its source was read to have - so switching back restores what was selected for that kind, and nothing crosses from
    // one kind to the other. A kind not yet shown starts with nothing selected. The pickers keep their sources themselves.
    switchKind(kind) {
        const {inputs} = this.props
        this.drafts = {...this.drafts, [this.shownKind]: draftOf(inputs)}
        const {bands, bandSetSpecs, metadata, visualizations, bandsSource} = this.drafts[kind] || emptyDraft()
        inputs.bands.set(bands)
        inputs.bandSetSpecs.set(bandSetSpecs)
        inputs.metadata.set(metadata)
        inputs.visualizations.set(visualizations)
        inputs.bandsSource.setInitialValue(bandsSource)
        this.shownKind = kind
    }

    // A new input starts as an asset: where its form starts, not an edit.
    setSection() {
        const {inputs: {section}} = this.props
        if (!section.value) {
            section.setInitialValue('ASSET')
        }
        this.shownKind = section.value || 'ASSET'
    }

    // The sources of the recipe's other inputs, which this one may not take.
    setOtherSources() {
        const {images, activatable: {imageId}, inputs: {otherSources}} = this.props
        adoptOtherSources(otherSources, images, imageId)
    }

    // A new input starts with an empty set of image bands: where its form starts, not an edit.
    initBandSetSpecs() {
        const {inputs: {bandSetSpecs}} = this.props
        if (!bandSetSpecs.value) {
            bandSetSpecs.setInitialValue(emptyBandSetSpecs())
        }
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

    updateBandSetSpecs(option) {
        const {inputs: {bandSetSpecs, bands}} = this.props

        const getSpecs = () => {
            switch (option.type) {
                case 'PROFILE':
                    return getProfileBandSetSpecs(option.value, bands.value)
                case 'PAIR_WISE_EXPRESSION':
                    return bandSetSpecs.value.concat(
                        {id: uuid(), type: 'PAIR_WISE_EXPRESSION', operation: option.value, included: []}
                    )
                case 'INDEXES':
                    return bandSetSpecs.value.concat(
                        {id: uuid(), type: 'INDEXES', included: []}
                    )
                default:
                    throw Error(`Unsupported type: ${JSON.stringify(option)}`)
            }
        }
        return bandSetSpecs.set(getSpecs())
    }

    derivedBandsOptions() {
        const {inputs: {bands, bandSetSpecs}} = this.props
        const indexAlreadyAdded = (bandSetSpecs.value || []).find(spec => spec.type === 'INDEXES')
        const bandCombination = ({value, type, disabled}) => ({
            value,
            type,
            label: msg(`process.classification.panel.inputImagery.derivedBands.bandCombinations.options.${value}.label`),
            tooltip: msg(`process.classification.panel.inputImagery.derivedBands.bandCombinations.options.${value}.tooltip`),
            disabled
        })
        const profile = value => ({
            value,
            type: 'PROFILE',
            label: msg(`process.classification.panel.inputImagery.derivedBands.profiles.options.${value}.label`),
            tooltip: msg(`process.classification.panel.inputImagery.derivedBands.profiles.options.${value}.tooltip`),
            disabled: isProfileDisabled(value, bands.value)
        })
        return [{
            label: msg('process.classification.panel.inputImagery.derivedBands.bandCombinations.label'),
            options: [
                bandCombination({value: 'RATIO', type: 'PAIR_WISE_EXPRESSION'}),
                bandCombination({value: 'NORMALIZED_DIFFERENCE', type: 'PAIR_WISE_EXPRESSION'}),
                bandCombination({value: 'DIFFERENCE', type: 'PAIR_WISE_EXPRESSION'}),
                bandCombination({value: 'DISTANCE', type: 'PAIR_WISE_EXPRESSION'}),
                bandCombination({value: 'ANGLE', type: 'PAIR_WISE_EXPRESSION'}),
                bandCombination({
                    value: 'INDEXES',
                    type: 'INDEXES',
                    disabled: !getAvailableIndexes(bands.value).length || !!indexAlreadyAdded
                })
            ]
        }, {
            label: msg('process.classification.panel.inputImagery.derivedBands.profiles.label'),
            options: [
                profile('SIMPLE'),
                profile('RLCMS')
            ]
        }

        ]
    }
}

const draftOf = ({bands, bandSetSpecs, metadata, visualizations, bandsSource}) => ({
    bands: bands.value,
    bandSetSpecs: bandSetSpecs.value,
    metadata: metadata.value,
    visualizations: visualizations.value,
    bandsSource: bandsSource.value
})

const emptyDraft = () => ({
    bands: null,
    bandSetSpecs: emptyBandSetSpecs(),
    metadata: undefined,
    visualizations: undefined,
    bandsSource: null
})

const emptyBandSetSpecs = () => [{id: uuid(), type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: []}]

const modelToValues = model => {
    const values = {
        imageId: model.imageId,
        section: model.type || 'ASSET',
        bands: model.bands,
        bandSetSpecs: model.bandSetSpecs,
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
        type: values.section,
        bands: values.bands,
        bandSetSpecs: values.bandSetSpecs
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

InputImage.propTypes = {}
