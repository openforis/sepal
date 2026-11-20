import PropTypes from 'prop-types'
import React from 'react'

import {RecipeInput} from '~/app/home/body/process/recipe/sources/recipeInput'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {SourceKind} from '~/app/home/body/process/sourceTypeButtons'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

const NEW_SOURCE_KIND = 'ASSET'

export class SourceSection extends React.Component {
    constructor(props) {
        super(props)
        this.clearSource = this.clearSource.bind(this)
    }

    render() {
        const {sourceType} = this.props
        return (
            <Layout>
                <SourceKind input={sourceType} recipe='RECIPE_REF' defaultKind={NEW_SOURCE_KIND} onChange={this.clearSource}>
                    {({recipe, labelButtons}) => recipe ? this.renderRecipe(labelButtons) : this.renderAsset(labelButtons)}
                </SourceKind>
            </Layout>
        )
    }

    renderAsset(labelButtons) {
        const {asset} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.dias.panel.options.form.forestMask.source.label')}
                tooltip={msg('process.dias.panel.options.form.forestMask.source.tooltip')}
                placeholder={msg('process.dias.panel.options.form.forestMask.asset.placeholder')}
                input={asset}
                allowedTypes={['Image', 'ImageCollection']}
                labelButtons={labelButtons}
                autoFocus
            />
        )
    }

    renderRecipe(labelButtons) {
        const {recipe} = this.props
        return (
            <RecipeInput
                label={msg('process.dias.panel.options.form.forestMask.source.label')}
                tooltip={msg('process.dias.panel.options.form.forestMask.source.tooltip')}
                placeholder={msg('process.dias.panel.options.form.forestMask.recipe.placeholder')}
                input={recipe}
                filter={isImageSource}
                labelButtons={labelButtons}
                errorMessage
                autoFocus
            />
        )
    }

    clearSource() {
        const {asset, recipe} = this.props
        asset.set('')
        recipe.set('')
    }
}

SourceSection.propTypes = {
    asset: PropTypes.object.isRequired,
    recipe: PropTypes.object.isRequired,
    sourceType: PropTypes.object.isRequired
}
