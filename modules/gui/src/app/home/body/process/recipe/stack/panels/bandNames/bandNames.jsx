import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {isBlank} from '#sepal/recipe/source/extract'
import {inputSourceKey} from '#sepal/recipe/source/inputImagery'
import {committedBandNames, isAutomatic, nameOwners, ownedElsewhere, unresolvedBands} from '#sepal/recipe/type/stack'
import {recipePath} from '~/app/home/body/process/recipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {inputFeedback} from '~/widget/form/inputFeedback'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Panel} from '~/widget/panel/panel'

import {bandNameItemId} from '../../bandNamesRequirements'
import {BandName} from './bandName'
import styles from './bandNames.module.css'

// The draft is the mapping as the user names it: a name the user gives is held as given, and a band left empty is
// named automatically. Each row shows the name Apply gives it, by the rule every commit applies (committedBandNames),
// what Band names' requirement finds of it (bandNamesRequirements.js), and where its name would read another band than
// it read. A submission is held where the names, or what they would read, differ as the recipe now stands from those
// shown: the panel then shows them as they are.
const fields = {
    bandNames: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeModel: selectFrom(recipe, 'model'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    bandNames: selectFrom(recipe, 'model.bandNames.bandNames')
})

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
    render() {
        const {images, recipeModel} = this.props
        const rows = this.rows(recipeModel, this.draft())
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                accepts={values => this.isShown(values)}>
                <Panel.Header
                    icon='list'
                    title={msg('process.stack.panel.bandNames.title')}
                />
                <Panel.Content>
                    <Layout>
                        {images.map(image => this.renderImageBandNames(image, rows))}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderImageBandNames(image, rows) {
        const {recipeNameById} = this.props
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        const bands = (
            <div className={styles.bands}>
                {rows.filter(row => row.image === image).map(({band, value, placeholder, warning}) =>
                    <BandName
                        key={band.id}
                        className={styles.band}
                        originalName={band.originalName}
                        value={value}
                        placeholder={placeholder}
                        error={this.errorOf(image, band)}
                        warning={warning}
                        onChange={outputName => this.updateBandName(image, band, outputName)}
                    />
                )}
            </div>
        )
        return (
            <ListItem
                key={image.imageId}
                expansionClickable
                expanded
                expansion={bands}>
                <CrudItem
                    title={msg(`process.panels.inputImagery.form.type.${image.type}`)}
                    description={name}
                />
            </ListItem>
        )
    }

    // A band saved blank, and the bands of an input the mapping does not name, are drafted unnamed: Apply names them.
    componentDidMount() {
        const {images, bandNames, inputs} = this.props
        inputs.bandNames.set([
            ...bandNames.map(entry => ({...entry, bands: entry.bands.map(band => isBlank(band.outputName) ? unnamed(band) : band)})),
            ...images
                .filter(({imageId}) => !bandNames.some(entry => entry.imageId === imageId))
                .map(({imageId, includedBands = []}) => ({imageId, bands: includedBands.map(({id, band}) => unnamed({id, originalName: band}))}))
        ])
    }

    // A name given is the user's; an empty one leaves the band to be named automatically.
    updateBandName({imageId, includedBands = []}, {id, originalName}, outputName) {
        const {inputs: {bandNames}} = this.props
        const draft = this.draft()
        const named = outputName ? {id, originalName, outputName} : {id, originalName}
        const entry = draft.find(entry => entry.imageId === imageId)
            || {imageId, bands: includedBands.map(({id, band}) => unnamed({id, originalName: band}))}
        const bands = entry.bands.some(band => band.id === id)
            ? entry.bands.map(band => band.id === id ? named : band)
            : [...entry.bands, named]
        bandNames.set(draft.some(entry => entry.imageId === imageId)
            ? draft.map(other => other.imageId === imageId ? {...other, bands} : other)
            : [...draft, {...entry, bands}])
    }

    // Whether the names, and what they would read, are those shown, as the recipe stands now.
    isShown({bandNames}) {
        const {recipeId, recipeModel} = this.props
        return _.isEqual(
            this.rows(select(recipePath(recipeId, 'model')), bandNames).map(shownOf),
            this.rows(recipeModel, this.draft()).map(shownOf)
        )
    }

    // Every band, in Stack order, as its row shows it, from the applied model and the draft. The bands of an input whose
    // saved names cannot be told apart are offered as the input includes them, for the user to name.
    rows(model, draft) {
        const drafted = {...model, bandNames: {...model.bandNames, bandNames: draft}}
        const named = committedBandNames(model, drafted).bandNames
        const unresolved = unresolvedBands(drafted)
        const owners = nameOwners(model)
        return (model.inputImagery?.images || []).flatMap(image => unresolved.some(({imageId}) => imageId === image.imageId)
            ? (image.includedBands || []).map(({id, band}) => ({
                image,
                band: {id, originalName: band},
                value: valueOf(bandOf(draft, image, {id})),
                placeholder: band,
                warning: null
            }))
            : (named.find(({imageId}) => imageId === image.imageId)?.bands || []).map(band => ({
                image,
                band,
                value: valueOf(band),
                placeholder: isAutomatic(band) ? band.outputName : band.originalName,
                warning: warningOf({image, band, applied: bandOf(model.bandNames?.bandNames, image, band), owners})
            })))
    }

    errorOf(image, band) {
        const {form, inputs} = this.props
        return inputFeedback(form, inputs.bandNames).items?.[bandNameItemId(image.imageId, band.id)]?.message || null
    }

    draft() {
        const {bandNames, inputs} = this.props
        return inputs.bandNames.value || bandNames
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

const unnamed = ({id, originalName}) => ({id, originalName})

const bandOf = (entries, {imageId}, {id}) =>
    entries?.find(entry => entry.imageId === imageId)?.bands?.find(band => band.id === id)

const valueOf = band => band && !isAutomatic(band) ? band.outputName || '' : ''

// What a row shows that a submission must agree with: the name Apply gives it, and what its name would read.
const shownOf = ({image, band, placeholder, warning}) => [image.imageId, band.id, band.outputName, placeholder, warning]

// An automatic name another band's takes, and a name the user gives that named another band: other recipes reading it
// will read this band.
const warningOf = ({image, band, applied, owners}) => {
    if (isAutomatic(applied) && isAutomatic(band) && applied.outputName !== band.outputName) {
        return msg('process.stack.panel.bandNames.displaced', {name: band.outputName, previousName: applied.outputName})
    }
    const takesName = !isAutomatic(band) && !isBlank(band.outputName) && applied?.outputName !== band.outputName
        && ownedElsewhere(owners, band.outputName, {source: inputSourceKey(image), band: band.originalName})
    return takesName
        ? msg('process.stack.panel.bandNames.takesName', {name: band.outputName})
        : null
}
