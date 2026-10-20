import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {ButtonPopup} from '~/widget/buttonPopup'
import {ButtonSelect} from '~/widget/buttonSelect'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import {itemStatusesOf} from '../../../selectedSourceStatus'
import {readLocalRequirements} from '../../../sourceRequirements'
import {ImageDescription} from '../../imageDescription'
import {OutputBand} from './outputBand'
import styles from './outputBands.module.css'
import {
    addOutputBand,
    addOutputImage,
    allOutputNames,
    bandsToOutput,
    hasUniqueOutputNames,
    hasValidOutputNames,
    namedApart,
    withUniqueDefaultNames
} from './outputImages'

const ADD_ALL_BANDS = Symbol('addAllBands')

const fields = {
    outputImages: new Form.Field()
        .notEmpty()
        .predicate(value => !value.find(({outputBands}) => !outputBands.length),
            'process.bandMath.panel.outputBands.missingBands'
        )
        .predicate(hasValidOutputNames, 'process.bandMath.panel.outputBands.invalidFormat')
        .predicate(hasUniqueOutputNames, 'process.bandMath.panel.outputBands.duplicateBand')
}

const mapRecipeToProps = recipe => {
    return ({
        recipe,
        images: selectFrom(recipe, 'model.inputImagery.images'),
        calculations: selectFrom(recipe, 'model.calculations.calculations'),
        outputImages: selectFrom(recipe, 'model.outputBands.outputImages') || []
    })
}

class _OutputBands extends React.Component {
    // The bands given a default name while the panel is open - repaired as it opens, added, or reset - by output image
    // and band: their fields show it as a suggestion, not as a name already saved.
    allocated = new Set()

    constructor(props) {
        super(props)
        this.addImage = this.addImage.bind(this)
        this.removeImage = this.removeImage.bind(this)
        this.addBand = this.addBand.bind(this)
        this.updateBand = this.updateBand.bind(this)
        this.removeBand = this.removeBand.bind(this)
        this.renderOutputImage = this.renderOutputImage.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='list'
                    title={msg('process.bandMath.panel.outputBands.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderAddImageButton()}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderAddImageButton() {
        const {calculations, images, inputs: {outputImages}} = this.props
        const usedImageIds = (outputImages.value || []).map(({imageId}) => imageId)

        const renderImageLabel = image =>
            <CrudItem
                key={image.imageId}
                title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                description={<ImageDescription image={image}/>}
                metadata={image.name}/>

        const toOptions = (array, groupLabel) => ({
            label: groupLabel,
            options: array
                .filter(({imageId}) => !usedImageIds.includes(imageId))
                .map(image => ({
                    value: image.name,
                    label: renderImageLabel(image),
                    image
                }))
        })

        const options = [
            toOptions(calculations, msg('process.bandMath.panel.outputBands.addImage.calculations')),
            toOptions(images, msg('process.bandMath.panel.outputBands.addImage.images'))
        ].filter(({options}) => options.length)
        return (
            <ButtonSelect
                label={msg('process.bandMath.panel.outputBands.addImage.label')}
                look='add'
                icon='plus'
                placement='above'
                tooltipPlacement='bottom'
                disabled={!options.length}
                options={options}
                onSelect={this.addImage}
            />
        )
    }

    renderContent() {
        const {inputs: {outputImages}} = this.props
        return (
            <Layout>
                {outputImages.value?.length
                    ? outputImages.value.map(this.renderOutputImage)
                    : <NoData message={msg('process.bandMath.panel.outputBands.noImages')}/>}
            </Layout>
        )
    }

    // An output whose image no longer exists is shown as it was saved, to be removed: it offers no bands to add.
    renderOutputImage(outputImage) {
        const current = this.currentImage(outputImage.imageId)
        const image = current || outputImage
        const problem = this.draftProblems()[outputImage.imageId]
        return (
            <ListItem
                key={outputImage.imageId}
                expansionClickable
                expanded
                expansion={this.renderOutputBands(outputImage)}
            >
                <CrudItem
                    title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                    description={<ImageDescription image={image}/>}
                    metadata={image.name}
                    error={problem}
                    inlineComponents={current ? this.renderAddBandButton(outputImage, current) : null}
                    unsafeRemove
                    onRemove={() => this.removeImage({image})}
                />
            </ListItem>

        )
    }

    renderOutputBands(outputImage) {
        const {inputs: {outputImages}} = this.props
        const allOutputBandNames = allOutputNames(outputImages.value)
        return (
            <Layout type='horizontal' alignment='fill'>
                {outputImage.outputBands.length
                    ? outputImage.outputBands.map(band => {
                        return <OutputBand
                            key={band.id}
                            image={outputImage}
                            band={band}
                            allocated={this.allocated.has(keyOf(outputImage, band))}
                            allOutputBandNames={allOutputBandNames}
                            onChange={this.updateBand}
                            onRemove={this.removeBand}/>
                    }
                    )
                    : <NoData message={msg('process.bandMath.panel.outputBands.noBands')}/>}
            </Layout>
        )
    }

    renderAddBandButton(outputImage, current) {
        const outputBandIds = outputImage.outputBands.map(({id}) => id)
        const bandOptions = bandsToOutput(outputImage, current)
            .map(band => ({value: band.name, label: band.name, band, image: outputImage}))
        const options = bandOptions.length > 1
            ? [
                {
                    key: 'add-all-bands',
                    value: ADD_ALL_BANDS,
                    label: msg('process.bandMath.panel.outputBands.addBands.all.label'),
                    bandOptions
                },
                ...bandOptions
            ]
            : bandOptions
        return (
            <ButtonPopup
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                showPopupOnMount={options.length && !outputBandIds.length}
                vPlacement='below'
                hPlacement='over-left'
                tooltip={msg('process.bandMath.panel.outputBands.addBands.tooltip')}
                disabled={!options.length}>
                {onBlur => (
                    <Combo
                        alignment='left'
                        placeholder={msg('process.bandMath.panel.outputBands.addBands.placeholder')}
                        options={options}
                        stayOpenOnSelect
                        autoOpen
                        autoFocus
                        allowClear
                        onCancel={onBlur}
                        onChange={this.addBand}
                    />
                )}
            </ButtonPopup>
        )
    }

    // A saved recipe can output bands under defaults another takes: the draft names them apart, which Apply saves and
    // Cancel discards. What was applied is judged as saved until then.
    componentDidMount() {
        const {outputImages} = this.props
        this.setDraft(withUniqueDefaultNames(outputImages), outputImages)
    }

    addImage({image}) {
        const {inputs: {outputImages}} = this.props
        this.setDraft(addOutputImage(image, outputImages.value))
    }

    removeImage({image}) {
        const {inputs: {outputImages}} = this.props
        outputImages.set(outputImages.value.filter(({imageId}) => imageId !== image.imageId))
    }

    // Only a band its image includes now and does not already output is added, whatever the picker offered when it was
    // chosen, and as the image includes it now: a choice offered before a rename carries the band's former name.
    addBand({value, image, band, bandOptions}) {
        const {inputs: {outputImages}} = this.props
        const chosen = value === ADD_ALL_BANDS ? bandOptions : [{image, band}]
        this.setDraft(chosen.reduce(
            (outputImages, {image, band}) => {
                const current = this.currentImage(image.imageId)
                const currentBand = bandsToOutput(outputImages.find(({imageId}) => imageId === image.imageId), current)
                    .find(({id}) => id === band.id)
                return currentBand
                    ? addOutputBand(current, currentBand, outputImages)
                    : outputImages
            },
            outputImages.value
        ))
    }

    // A name typed changes this band alone: one another band is output under is refused, never taken from it. A band
    // reset adopts the default now available to it, by the rule a band added is named by; no other band is renamed.
    updateBand({image, band, reset}) {
        const {inputs: {outputImages}} = this.props
        const imageIndex = outputImages.value.findIndex(({imageId}) => imageId === image.imageId)
        const bandIndex = outputImages.value[imageIndex].outputBands.findIndex(({id}) => id === band.id)
        const updated = outputImages.value.map((outputImage, index) => index === imageIndex
            ? {
                ...outputImage,
                outputBands: outputImage.outputBands.map(outputBand => outputBand.id !== band.id
                    ? outputBand
                    : reset ? {...band, defaultOutputName: undefined} : band
                )
            }
            : outputImage
        )
        if (reset) {
            this.allocated.add(keyOf(image, band))
        }
        this.setDraft(reset
            ? namedApart(updated, at => at.imageIndex === imageIndex && at.bandIndex === bandIndex)
            : updated
        )
    }

    // The draft, each band given a default it did not have before noted as allocated.
    setDraft(draft, previous = this.props.inputs.outputImages.value || NO_OUTPUT_IMAGES) {
        const {inputs: {outputImages}} = this.props
        const previousDefaults = new Map(previous.flatMap(outputImage =>
            outputImage.outputBands.map(band => [keyOf(outputImage, band), band.defaultOutputName])
        ))
        draft.forEach(outputImage => outputImage.outputBands.forEach(band => {
            const key = keyOf(outputImage, band)
            if (!previousDefaults.has(key) || previousDefaults.get(key) !== band.defaultOutputName) {
                this.allocated.add(key)
            }
        }))
        outputImages.set(draft)
    }

    // What Band Math's own requirements (bandMathRequirements.js) find wrong with each output image as the draft
    // configures it, the rest of the recipe as applied: its rows follow the draft, while the toolbar and the operations
    // judge what is applied until Apply.
    draftProblems() {
        const {recipe, inputs: {outputImages}} = this.props
        const draft = outputImages.value || NO_OUTPUT_IMAGES
        if (this.judged?.model !== recipe.model || this.judged?.draft !== draft) {
            const candidate = {
                ...recipe,
                model: {...recipe.model, outputBands: {...recipe.model.outputBands, outputImages: draft}}
            }
            const statuses = itemStatusesOf(readLocalRequirements(candidate), 'outputBands')
            this.judged = {
                model: recipe.model,
                draft,
                problems: Object.fromEntries(Object.entries(statuses).map(([id, {message}]) => [id, message]))
            }
        }
        return this.judged.problems
    }

    // The input or calculation an output image is taken from, as configured now.
    currentImage(imageId) {
        const {images = [], calculations = []} = this.props
        return [...images, ...calculations].find(image => image.imageId === imageId)
    }

    removeBand({image, band}) {
        const {inputs: {outputImages}} = this.props
        outputImages.set(
            outputImages.value.map(outputImage =>
                outputImage.imageId === image.imageId
                    ? {
                        ...outputImage,
                        outputBands: outputImage.outputBands.filter(({id}) => id !== band.id)
                    }
                    : outputImage
            )
        )
    }
}

const NO_OUTPUT_IMAGES = Object.freeze([])

const keyOf = ({imageId}, {id}) => `${imageId}|${id}`

export const OutputBands = compose(
    _OutputBands,
    recipeFormPanel({id: 'outputBands', fields, mapRecipeToProps})
)

OutputBands.propTypes = {
    recipeId: PropTypes.string,
}
