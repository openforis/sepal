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

import {withItemProblems} from '../../../selectedSource'
import {ImageDescription} from '../../imageDescription'
import {OutputBand} from './outputBand'
import styles from './outputBands.module.css'
import {
    addOutputBand,
    addOutputImage,
    allOutputNames,
    createUniqueBandName,
    hasUniqueOutputNames,
    hasValidOutputNames,
    outputsBand
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
        images: selectFrom(recipe, 'model.inputImagery.images'),
        calculations: selectFrom(recipe, 'model.calculations.calculations'),
        outputImages: selectFrom(recipe, 'model.outputBands.outputImages') || []
    })
}

class _OutputBands extends React.Component {
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
        const {images, calculations, itemProblems = {}} = this.props
        const current = [...images, ...calculations].find(({imageId}) => imageId === outputImage.imageId)
        const image = current || outputImage
        const problem = itemProblems[outputImage.imageId]
        return (
            <ListItem
                key={outputImage.imageId}
                className={problem ? styles.error : null}
                expansionClickable
                expanded
                expansion={this.renderOutputBands(outputImage)}
            >
                <CrudItem
                    title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                    description={<ImageDescription image={image}/>}
                    metadata={image.name}
                    titleTooltip={problem}
                    inlineComponents={current ? this.renderAddBandButton(outputImage) : null}
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
                            allOutputBandNames={allOutputBandNames}
                            onChange={this.updateBand}
                            onRemove={this.removeBand}/>
                    }
                    )
                    : <NoData message={msg('process.bandMath.panel.outputBands.noBands')}/>}
            </Layout>
        )
    }

    renderAddBandButton(outputImage) {
        const outputBandIds = outputImage.outputBands.map(({id}) => id)
        const bandOptions = outputImage.includedBands
            .filter(band => !outputsBand(outputImage, band))
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

    componentDidMount() {
        const {outputImages, inputs} = this.props
        inputs.outputImages.set(outputImages)
    }

    addImage({image}) {
        const {inputs: {outputImages}} = this.props
        outputImages.set(addOutputImage(image, outputImages.value))
    }

    removeImage({image}) {
        const {inputs: {outputImages}} = this.props
        outputImages.set(outputImages.value.filter(({imageId}) => imageId !== image.imageId))
    }

    // A band its image already outputs is not added again, whatever the picker offered when it was chosen.
    addBand({value, image, band, bandOptions}) {
        const {inputs: {outputImages}} = this.props
        const chosen = value === ADD_ALL_BANDS ? bandOptions : [{image, band}]
        outputImages.set(chosen.reduce(
            (outputImages, {image, band}) => outputsBand(outputImages.find(({imageId}) => imageId === image.imageId), band)
                ? outputImages
                : addOutputBand(image, band, outputImages),
            outputImages.value
        ))
    }

    updateBand({image, band}) {
        const {inputs: {outputImages}} = this.props
        // When generating unique defaultBandNames, we need to include the updated band
        // This temporary array does that
        const tempOutputImages = [
            ...outputImages.value.filter(({imageId}) => imageId !== image.imageId),
            {
                ...image,
                outputBands: [
                    ...image.outputBands.filter(({id}) => id !== band.id),
                    band
                ]
            }
        ]
        const updatedOutputImages = outputImages.value.map(outputImage =>
            outputImage.imageId === image.imageId
                ? {
                    ...outputImage,
                    outputBands: outputImage.outputBands.map(b =>
                        b.id === band.id
                            ? band
                            : b
                    )
                }
                : {
                    ...outputImage,
                    outputBands: outputImage.outputBands.map(b =>
                        ({
                            ...b,
                            defaultOutputName: createUniqueBandName(outputImage, b, tempOutputImages)
                        })
                    )
                }
        )
        outputImages.set(updatedOutputImages)
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

export const OutputBands = compose(
    _OutputBands,
    withItemProblems('outputBands'),
    recipeFormPanel({id: 'outputBands', fields, mapRecipeToProps})
)

OutputBands.propTypes = {
    recipeId: PropTypes.string,
}
