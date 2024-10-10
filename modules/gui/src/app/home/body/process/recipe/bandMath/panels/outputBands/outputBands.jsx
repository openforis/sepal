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
    // .predicate((outputImages, {invalidBandNames}) => !invalidBandNames && outputImages.length, 'invalid')
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

        const toOptions = (array, groupLabel) => ({
            label: groupLabel,
            options: array
                .filter(({imageId}) => !usedImageIds.includes(imageId))
                .map(image => ({
                    value: image.name,
                    label: <ImageDescription image={image}/>,
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
                // tooltip={msg('process.bandMath.panel.outputBands.addImage.tooltip')}
                look='add'
                icon='plus'
                placement='above'
                tooltipPlacement='bottom'
                // disabled={} // Disable if all images are added
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
            <Layout type='horizontal'>
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

    // renderImageBandNames(image, imageIndex) {
    //     const {bandNames, images, recipeNameById} = this.props
    //     const {allOutputNames} = this.state
    //     const names = bandNames[imageIndex].bands
    //     const description = image.type === 'RECIPE_REF'
    //         ? recipeNameById[image.id]
    //         : image.id
    //     const key = `${image.type}-${image.id}-${imageIndex}`
    //     const foo = (
    //         <Layout type='horizontal'>
    //             {names.map(({originalName, outputName}, bandIndex) =>
    //                 <BandName
    //                     key={originalName}
    //                     images={images}
    //                     image={image}
    //                     originalName={originalName}
    //                     outputName={outputName}
    //                     allOutputNames={allOutputNames}
    //                     onInputCreated={this.updateBandName}
    //                     onChange={outputName => this.updateBandName({imageIndex, bandIndex, outputName})}
    //                     onValidationStatusChanged={this.onValidationStatusChanged}
    //                 />
    //             )}
    //         </Layout>
    //     )
    //     console.log('render')
    //     return (
    //         <ListItem
    //             key={key}
    //             expansionClickable
    //             expanded
    //             expansion={foo}>
    //             <CrudItem
    //                 title={msg(`process.panels.inputImagery.form.type.${image.type}`)}
    //                 description={description}
    //                 metadata={image.name}
    //                 inlineComponents={this.renderAddButton(image)}
    //                 unsafeRemove
    //                 onRemove={() => this.removeImage({image})}
    //             />
    //         </ListItem>
    //     )
    // }

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

    // updateBandName({imageIndex, bandIndex, outputName}) {
    //     const {inputs: {bandNames}} = this.props
    //     const prevBandNames = bandNames.value

    //     const beforeImages = prevBandNames.slice(0, imageIndex)
    //     const image = prevBandNames[imageIndex]
    //     const beforeBands = image.bands.slice(0, bandIndex)
    //     const band = image.bands[bandIndex]
    //     const afterBands = image.bands.slice(bandIndex + 1)
    //     const afterImages = prevBandNames.slice(imageIndex + 1)
    //     const updatedBandNames = [
    //         ...beforeImages,
    //         {
    //             ...image,
    //             bands: [
    //                 ...beforeBands,
    //                 {
    //                     ...band,
    //                     outputName
    //                 },
    //                 ...afterBands
    //             ]
    //         },
    //         ...afterImages
    //     ]
    //     bandNames.set(updatedBandNames)

    //     const allOutputNames = updatedBandNames.map(({bands}) =>
    //         bands.map(({outputName}) => outputName)
    //     ).flat()
    //     this.setState({allOutputNames})
    // }

    addImage({image}) {
        const {inputs: {outputImages}} = this.props
        const updatedOutputImages = [
            ...(outputImages.value),
            {
                ...image,
                outputBands: image.includedBands.length === 1
                    ? [image.includedBands[0]]
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

        const outputName = recurseRename(band.name, 1)

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
