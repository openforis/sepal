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
    state = {allOutputNames: [], invalidBandsById: {}}

    constructor(props) {
        super(props)
        this.renderImageBandNames = this.renderImageBandNames.bind(this)
        this.updateBandName = this.updateBandName.bind(this)
        this.onValidationStatusChanged = this.onValidationStatusChanged.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
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
        const {bandNames, images, recipeNameById} = this.props
        const {allOutputNames} = this.state
        const names = bandNames[imageIndex].bands
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        const key = `${image.type}-${image.id}-${imageIndex}`
        const foo = (
            <Layout type='horizontal'>
                {names.map(({originalName, outputName}, bandIndex) =>
                    <BandName
                        key={originalName}
                        images={images}
                        image={image}
                        originalName={originalName}
                        outputName={outputName}
                        allOutputNames={allOutputNames}
                        onInputCreated={this.updateBandName}
                        onChange={outputName => this.updateBandName({imageIndex, bandIndex, outputName})}
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

    updateBandName({imageIndex, bandIndex, outputName}) {
        const {inputs: {bandNames}} = this.props
        const prevBandNames = bandNames.value

        const beforeImages = prevBandNames.slice(0, imageIndex)
        const image = prevBandNames[imageIndex]
        const beforeBands = image.bands.slice(0, bandIndex)
        const band = image.bands[bandIndex]
        const afterBands = image.bands.slice(bandIndex + 1)
        const afterImages = prevBandNames.slice(imageIndex + 1)
        const updatedBandNames = [
            ...beforeImages,
            {
                ...image,
                bands: [
                    ...beforeBands,
                    {
                        ...band,
                        outputName
                    },
                    ...afterBands
                ]
            },
            ...afterImages
        ]
        bandNames.set(updatedBandNames)

        const allOutputNames = updatedBandNames.map(({bands}) =>
            bands.map(({outputName}) => outputName)
        ).flat()
        this.setState({allOutputNames})
    }

}

const additionalPolicy = () => ({
    _: 'disallow'
})

export const BandNames = compose(
    _BandNames,
    connect(mapStateToProps),
    recipeFormPanel({id: 'bandNames', fields, mapRecipeToProps, additionalPolicy}),
)

BandNames.propTypes = {
    recipeId: PropTypes.string,
}
