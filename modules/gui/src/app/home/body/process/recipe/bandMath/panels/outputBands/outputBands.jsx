import _ from 'lodash'
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

import {ImageDescription} from '../../imageDescription'
import {OutputBand} from './outputBand'
import styles from './outputBands.module.css'
import {addOutputBand, addOutputImage, createUniqueBandName} from './outputImages'

const fields = {
    outputImages: new Form.Field()
        .notEmpty()
        .predicate(value => !value.find(({outputBands}) => !outputBands.length),
            'process.bandMath.panel.outputBands.missingBands'
        )
}

const mapRecipeToProps = recipe => {
    return ({
        images: selectFrom(recipe, 'model.inputImagery.images'),
        calculations: selectFrom(recipe, 'model.calculations.calculations'),
        outputImages: selectFrom(recipe, 'model.outputBands.outputImages') || []
    })
}

class _OutputBands extends React.Component {
    state = {allOutputBandNames: [], invalidBandsById: {}}

    constructor(props) {
        super(props)
        this.addImage = this.addImage.bind(this)
        this.removeImage = this.removeImage.bind(this)
        this.addBand = this.addBand.bind(this)
        this.updateBand = this.updateBand.bind(this)
        this.removeBand = this.removeBand.bind(this)
        this.renderOutputImage = this.renderOutputImage.bind(this)
        this.onValidationStatusChanged = this.onValidationStatusChanged.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
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

    renderOutputImage(outputImage) {
        const {images, calculations} = this.props
        const image = [...images, ...calculations].find(({imageId}) => imageId === outputImage.imageId)
        return (
            <ListItem
                key={image.imageId}
                expansionClickable
                expanded
                expansion={this.renderOutputBands(outputImage)}
            >
                <CrudItem
                    title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                    description={<ImageDescription image={image}/>}
                    metadata={image.name}
                    inlineComponents={this.renderAddBandButton(outputImage)}
                    unsafeRemove
                    onRemove={() => this.removeImage({image})}
                />
            </ListItem>

        )
    }

    renderOutputBands(outputImage) {
        const {allOutputBandNames} = this.state
        return (
            <Layout type='horizontal' alignment='fill'>
                {outputImage.outputBands.length
                    ? outputImage.outputBands.map(band => {
                        return <OutputBand
                            key={band.name}
                            image={outputImage}
                            band={band}
                            allOutputBandNames={allOutputBandNames}
                            onChange={this.updateBand}
                            onRemove={this.removeBand}
                            onValidationStatusChanged={this.onValidationStatusChanged}/>
                    }
                    )
                    : <NoData message={msg('process.bandMath.panel.outputBands.noBands')}/>}
            </Layout>
        )
    }

    renderAddBandButton(outputImage) {
        const outputBandIds = outputImage.outputBands.map(({id}) => id)
        const bandOptions = outputImage.includedBands
            .filter(({id}) => !outputBandIds.includes(id))
            .map(band => ({value: band.name, label: band.name, band, image: outputImage}))
        const options = bandOptions.length > 1
            ? [
                {value: 'all', label: msg('process.bandMath.panel.outputBands.addBands.all.label'), bandOptions},
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
        const updatedOutputImages = addOutputImage(image, outputImages.value)
        outputImages.set(updatedOutputImages)
        this.updateAllOutputBandNames(updatedOutputImages)
    }

    removeImage({image}) {
        const {inputs: {outputImages}} = this.props
        const updatedOutputImages = outputImages.value.filter(({imageId}) => imageId !== image.imageId)
        outputImages.set(updatedOutputImages)
        this.updateAllOutputBandNames(updatedOutputImages)
    }

    addBand({value, image, band, bandOptions}) {
        const {inputs: {outputImages}} = this.props
        const updatedOutputImages = value === 'all'
            ? bandOptions.reduce(
                (outputImages, {image, band}) => addOutputBand(image, band, outputImages),
                outputImages.value
            )
            : addOutputBand(image, band, outputImages.value)

        outputImages.set(updatedOutputImages)
        this.updateAllOutputBandNames(updatedOutputImages)
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

        this.updateAllOutputBandNames(updatedOutputImages)
    }

    removeBand({image, band}) {
        const {inputs: {outputImages}} = this.props
        const updatedOutputImages = outputImages.value.map(outputImage =>
            outputImage.imageId === image.imageId
                ? {
                    ...outputImage,
                    outputBands: outputImage.outputBands.filter(({id}) => id !== band.id)
                }
                : outputImage
        )
        outputImages.set(updatedOutputImages)
        this.updateAllOutputBandNames(updatedOutputImages)
    }

    updateAllOutputBandNames(updatedOutputImages) {
        const allOutputBandNames = updatedOutputImages
            .map(({outputBands}) =>
                outputBands.map(({defaultOutputName, outputName}) => outputName || defaultOutputName)
            )
            .flat()
        this.setState({allOutputBandNames})
    }

    onValidationStatusChanged(componentId, valid) {
        const updateValidation = () => {
            const {inputs: {outputImages}} = this.props
            const {invalidBandsById} = this.state
            const valid = !Object.keys(invalidBandsById).length
            outputImages.setInvalid(valid ? '' : 'not valid')
        }

        if (valid) {
            this.setState(
                ({invalidBandsById}) => ({invalidBandsById: _.omit(invalidBandsById, [componentId])}),
                updateValidation
            )
        } else {
            this.setState(
                ({invalidBandsById}) => ({invalidBandsById: {...invalidBandsById, [componentId]: false}}),
                updateValidation
            )
        }
    }
}

export const OutputBands = compose(
    _OutputBands,
    recipeFormPanel({id: 'outputBands', fields, mapRecipeToProps})
)

OutputBands.propTypes = {
    recipeId: PropTypes.string,
}
