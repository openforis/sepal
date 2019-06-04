import {BandSetSpec} from './bandSetSpec'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {getAvailableIndexes} from './opticalIndexes'
import {getProfileBandSetSpecs, isProfileDisabled} from './profiles'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import AssetSection from './assetSection'
import ButtonSelect from 'widget/buttonSelect'
import ImageForm from './imageForm'
import PanelSections from 'widget/panelSections'
import React from 'react'
import RecipeSection from './recipeSection'
import SectionSelection from './sectionSelection'
import guid from 'guid'
import styles from './inputImage.module.css'

const fields = {
    imageId: new Field(),
    section: new Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.classification.panel.inputImagery.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.classification.panel.inputImagery.form.asset.required'),
    bands: new Field()
        .notEmpty('process.classification.panel.inputImagery.form.bands.required'),
    bandSetSpecs: new Field()
        .predicate((bandSetSpecs, {bands}) =>
            bandSetSpecs.find(spec => !BandSetSpec.isEmpty(spec, bands)),
        'process.classification.panel.inputImagery.form.bandSetSpecs.required')
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class InputImage extends React.Component {
    render() {
        const {inputs} = this.props

        const sections = [{
            component: <SectionSelection section={inputs.section}/>
        }, {
            value: 'RECIPE_REF',
            label: msg('process.classification.panel.inputImagery.recipe.title'),
            title: msg('SEPAL RECIPE'),
            component: <ImageForm ${...this.props} inputComponent={RecipeSection} input={inputs.recipe}/>
        }, {
            value: 'ASSET',
            label: msg('process.classification.panel.inputImagery.asset.title'),
            title: msg('EARTH ENGINE ASSET'),
            component: <ImageForm ${...this.props} inputComponent={AssetSection} input={inputs.asset}/>
        }]

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections
                    inputs={inputs}
                    sections={sections}
                    selected={inputs.section}
                    icon='image'
                    label={msg('IMAGE TO CLASSIFY')}
                />
                <FormPanelButtons>
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
                </FormPanelButtons>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {inputs: {bandSetSpecs}} = this.props
        if (!bandSetSpecs.value)
            bandSetSpecs.set([{id: guid(), type: 'IMAGE_BANDS', class: 'IMAGE_BANDS'}])
    }

    componentDidUpdate() {
        const {inputs, activatable: {imageId}} = this.props
        inputs.imageId.set(imageId)
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
            throw Error('Unexpected image section: ' + section.value)
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
                    {id: guid(), type: 'PAIR_WISE_EXPRESSION', operation: option.value, included: []}
                )
            case 'INDEXES':
                return bandSetSpecs.value.concat(
                    {id: guid(), type: 'INDEXES', included: []}
                )
            default:
                throw Error('Unsupported type: ' + JSON.stringify(option))
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

const modelToValues = model => {
    const values = {
        imageId: model.imageId,
        section: model.type || 'SELECTION',
        bands: model.bands,
        bandSetSpecs: model.bandSetSpecs
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

export default compose(
    InputImage,
    recipeFormPanel(panelOptions)
)

InputImage.propTypes = {}
