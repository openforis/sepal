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
import {Panel} from '~/widget/panel/panel'

import {ImageDescription} from '../../imageDescription'
import {OutputBand} from './outputBand'
import styles from './outputBands.module.css'

const fields = {
    outputImages: new Form.Field()
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

        const renderImageLabel = image => (
            <ListItem key={image.imageId}>
                <CrudItem
                    title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                    description={<ImageDescription image={image}/>}
                    metadata={image.name}/>
            </ListItem>
        )

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
                {(outputImages.value || []).map(this.renderOutputImage)}
            </Layout>
        )
    }

    renderOutputImage(image) {
        return (
            <ListItem
                key={image.imageId}
                expansionClickable
                expanded
                expansion={this.renderOutputBands(image)}
            >
                <CrudItem
                    title={msg(`process.bandMath.panel.outputBands.type.${image.type}`)}
                    description={<ImageDescription image={image}/>}
                    metadata={image.name}
                    inlineComponents={this.renderAddBandButton(image)}
                    unsafeRemove
                    onRemove={() => this.removeImage({image})}
                />
            </ListItem>

        )
    }

    renderOutputBands(image) {
        const {allOutputBandNames} = this.state
        return (
            <Layout type='horizontal' alignment='fill'>
                {image.outputBands.map(band =>
                    <OutputBand
                        key={band.name}
                        image={image}
                        band={band}
                        allOutputBandNames={allOutputBandNames}
                        onChange={this.updateBand}
                        onRemove={this.removeBand}
                        onValidationStatusChanged={this.onValidationStatusChanged}
                    />
                )}
            </Layout>
        )
    }

    renderAddBandButton(image) {
        const outputBandIds = image.outputBands.map(({id}) => id)
        const options = image.includedBands
            .filter(({id}) => !outputBandIds.includes(id))
            .map(band => ({value: band.name, label: band.name, band, image}))
        return (
            <ButtonPopup
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                showPopupOnMount={options.length && !outputBandIds.length}
                vPlacement='below'
                hPlacement='over-left'
                tooltip={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.tooltip')}
                disabled={!options.length}>
                {onBlur => (
                    <Combo
                        alignment='left'
                        placeholder={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.placeholder')}
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
        // if (image.includedBands.length === 1) {
        //     this.addBand({image, band: image.includedBands[0]})
        // }

        const firstBand = () => {
            const band = image.includedBands[0]
            return {...band, outputName: this.createUniqueBandName(band)}
        }

        const {inputs: {outputImages}} = this.props
        const updatedOutputImages = [
            ...(outputImages.value),
            {
                ...image,
                outputBands: image.includedBands.length === 1
                    ? [firstBand()]
                    : []
            }
        ]
        outputImages.set(updatedOutputImages)
    }

    removeImage({image}) {
        const {inputs: {outputImages}} = this.props
        outputImages.set(outputImages.value.filter(({imageId}) => imageId !== image.imageId))
    }

    addBand({image, band}) {
        const {inputs: {outputImages}} = this.props

        const outputName = this.createUniqueBandName(band)
        const updatedOutputImages = outputImages.value.map(outputImage =>
            outputImage.imageId === image.imageId
                ? {
                    ...outputImage,
                    outputBands: [...outputImage.outputBands, {...band, outputName}]
                }
                : outputImage
        )
        outputImages.set(updatedOutputImages)
    }

    createUniqueBandName(band) {
        const {inputs: {outputImages}} = this.props
        const otherOutputNames = outputImages.value
            .map(({outputBands}) =>
                outputBands
                    .filter(({id}) => id !== band.id)
                    .map(({outputName}) => outputName)
            )
            .flat()

        const recurseRename = (potentialName, i) =>
            otherOutputNames.includes(potentialName)
                ? recurseRename(`${band.name}_${i}`, ++i)
                : potentialName

        return recurseRename(band.name, 1)

    }

    updateBand({image, band}) {
        const {inputs: {outputImages}} = this.props
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
                : outputImage
        )
        outputImages.set(updatedOutputImages)

        const allOutputBandNames = updatedOutputImages
            .map(({outputBands}) =>
                outputBands.map(({outputName}) => outputName)
            )
            .flat()
        this.setState({allOutputBandNames})
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

const additionalPolicy = () => ({
    _: 'disallow'
})

export const OutputBands = compose(
    _OutputBands,
    recipeFormPanel({id: 'outputBands', fields, mapRecipeToProps, additionalPolicy})
)

OutputBands.propTypes = {
    recipeId: PropTypes.string,
}