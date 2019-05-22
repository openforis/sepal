import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {getAvailableIndexes} from 'app/home/body/process/classification/inputImagery/opticalIndexes'
import {getProfileBandSetSpecs, isProfileDisabled} from './profiles'
import {isBandSetSpecEmpty} from 'app/home/body/process/classification/inputImagery/bandSetSpec'
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
            bandSetSpecs.find(spec => !isBandSetSpecEmpty(spec, bands)),
        'process.classification.panel.inputImagery.form.bandSetSpecs.required'),
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class InputImage extends React.Component {
    render() {
        const {inputs} = this.props

        const sections = [
            {
                icon: 'image',
                title: msg('process.classification.panel.inputImagery.sections.title'),
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                title: msg('process.classification.panel.inputImagery.recipe.title'),
                component: <ImageForm ${...this.props} inputComponent={RecipeSection} input={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                title: msg('process.classification.panel.inputImagery.asset.title'),
                component: <ImageForm ${...this.props} inputComponent={AssetSection} input={inputs.asset}/>
            }
        ]

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>
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
            throw new Error('Unexpected image section: ' + section.value)
        }
    }

    updateBandSetSpecs(option) {
        const {inputs: {bandSetSpecs, bands}} = this.props
        if (option.type === 'PROFILE') {
            bandSetSpecs.set(
                getProfileBandSetSpecs(option.value, bands.value)
            )
        } else {
            const bandSetSpec = {id: guid(), type: option.value, class: option.type, included: []}
            bandSetSpecs.set(
                bandSetSpecs.value.concat(bandSetSpec)
            )
        }
    }

    derivedBandsOptions() {
        const {inputs: {bands, bandSetSpecs}} = this.props
        const indexAlreadyAdded = (bandSetSpecs.value || []).find(spec => spec.type === 'INDEXES')
        return [{
            label: 'Band combinations',
            options: [{
                value: 'RATIO',
                label: 'Ratio',
                tooltip: 'a tooltip',
                type: 'PAIR_WISE_EXPRESSION'
            }, {
                value: 'NORMALIZED_DIFFERENCE',
                label: 'Normalized difference',
                tooltip: 'a tooltip',
                type: 'PAIR_WISE_EXPRESSION'
            }, {
                value: 'DIFFERENCE',
                label: 'Difference',
                tooltip: 'a tooltip',
                type: 'PAIR_WISE_EXPRESSION'
            }, {
                value: 'DISTANCE',
                label: 'Distance',
                tooltip: 'a tooltip',
                type: 'PAIR_WISE_EXPRESSION'
            }, {
                value: 'ANGLE',
                label: 'Angle',
                tooltip: 'a tooltip',
                type: 'PAIR_WISE_EXPRESSION'
            }, {
                value: 'INDEXES',
                label: 'Indexes',
                tooltip: 'select calculated indexes to include',
                type: 'INDEXES',
                disabled: !getAvailableIndexes(bands.value).length || !!indexAlreadyAdded
            }]
        }, {
            label: 'Profiles'
            ,
            options:
                    [{
                        value: 'SIMPLE',
                        label: 'Simple',
                        type: 'PROFILE',
                        disabled: isProfileDisabled('SIMPLE', bands.value)
                    }, {
                        value: 'RLCMS',
                        label: 'RLCMS',
                        type: 'PROFILE',
                        disabled: isProfileDisabled('RLCMS', bands.value)
                    }]
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

export default recipeFormPanel(panelOptions)(
    InputImage
)

InputImage.propTypes = {}
