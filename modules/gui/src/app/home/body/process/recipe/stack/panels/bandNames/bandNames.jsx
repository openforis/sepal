import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Panel} from '~/widget/panel/panel'

import {BandName} from './bandName'
import styles from './bandNames.module.css'

const fields = {
    bandNames: new Form.Field()
        .predicate((bandNames, {invalidBandNames}) => !invalidBandNames && bandNames.length, 'invalid')
}

const mapRecipeToProps = recipe => {
    return ({
        images: selectFrom(recipe, 'model.inputImagery.images'),
        bandNames: selectFrom(recipe, 'model.bandNames.bandNames')
    })
}

const mapStateToProps = (state, ownProps) => {
    const {images} = ownProps
    const recipeNameById = {}
    images
        .filter(image => image.type === 'RECIPE_REF')
        .map(image => selectFrom(state, ['process.recipes', {id: image.id}]))
        .filter(recipe => recipe)
        .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
    return {recipeNameById}
}

class _BandNames extends React.Component {
    state = {invalidBandsById: {}}

    constructor(props) {
        super(props)
        this.renderImageBandNames = this.renderImageBandNames.bind(this)
        this.updateBandName = this.updateBandName.bind(this)
        this.onValidationStatusChanged = this.onValidationStatusChanged.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='list'
                    title={msg('process.stack.panel.bandNames.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {images} = this.props
        return (
            <Layout>
                {images.map(this.renderImageBandNames)}
            </Layout>
        )
    }

    renderImageBandNames(image, imageIndex) {
        const {images, recipeNameById} = this.props
        const allOutputNames = this.allOutputNames()
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        const key = `${image.type}-${image.id}-${imageIndex}`
        const foo = (
            <Layout type='horizontal'>
                {this.namesOf(image).map(({originalName, outputName}, bandIndex) =>
                    <BandName
                        key={originalName}
                        images={images}
                        image={image}
                        originalName={originalName}
                        outputName={outputName}
                        allOutputNames={allOutputNames}
                        onChange={outputName => this.updateBandName({image, bandIndex, outputName})}
                        onValidationStatusChanged={this.onValidationStatusChanged}
                    />
                )}
            </Layout>
        )
        return (
            <ListItem
                key={key}
                expansionClickable
                expanded
                expansion={foo}>
                <CrudItem
                    title={msg(`process.panels.inputImagery.form.type.${image.type}`)}
                    description={name}
                />
            </ListItem>
        )
    }

    onValidationStatusChanged(componentId, valid) {
        const updateValidation = () => {
            const {inputs: {bandNames}} = this.props
            const {invalidBandsById} = this.state
            const valid = !Object.keys(invalidBandsById).length
            bandNames.setInvalid(valid ? '' : 'not valid')
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

    componentDidMount() {
        const {bandNames, inputs} = this.props
        inputs.bandNames.set(bandNames)
    }

    // An input its mapping does not name gets an entry once one of its bands is named, the others left blank.
    updateBandName({image, bandIndex, outputName}) {
        const {inputs: {bandNames}} = this.props
        const prevBandNames = this.currentBandNames()
        const entry = {imageId: image.imageId, bands: this.namesOf(image)}
        const updatedEntry = {
            ...entry,
            bands: entry.bands.map((band, index) => index === bandIndex ? {...band, outputName} : band)
        }
        bandNames.set(this.entryOf(image)
            ? prevBandNames.map(other => other.imageId === image.imageId ? {...other, ...updatedEntry} : other)
            : [...prevBandNames, updatedEntry])
    }

    currentBandNames() {
        const {bandNames, inputs} = this.props
        return inputs.bandNames.value || bandNames
    }

    // An input's entry is found by its imageId, as Stack's output finds it.
    entryOf({imageId}) {
        return this.currentBandNames().find(entry => entry.imageId === imageId)
    }

    namesOf(image) {
        return this.entryOf(image)?.bands
            || (image.includedBands || []).map(({id, band}) => ({id, originalName: band, outputName: ''}))
    }

    allOutputNames() {
        const {images} = this.props
        return images.flatMap(image => this.entryOf(image)?.bands || []).map(({outputName}) => outputName)
    }

}

export const BandNames = compose(
    _BandNames,
    connect(mapStateToProps),
    recipeFormPanel({id: 'bandNames', fields, mapRecipeToProps}),
)

BandNames.propTypes = {
    recipeId: PropTypes.string,
}
