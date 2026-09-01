import React from 'react'

import {getGroupedBandOptions} from '~/app/home/body/process/recipe/masking/bands'
import {submitMaskingRetrieve} from '~/app/home/body/process/recipe/masking/maskingRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        const {recipe, sourceRuntime} = this.props
        return (
            <MosaicRetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                toSepal
                toEE
                toDrive
                imageOutputResolution={{
                    key: recipe,
                    state$: sourceRuntime.resolveImageOutput$({recipe})
                }}
                onRetrieve={(retrieveOptions, resolutionContext) =>
                    this.retrieve(retrieveOptions, resolutionContext)}
            />
        )
    }

    bandOptions() {
        const {recipe} = this.props
        return getGroupedBandOptions(recipe)
    }

    retrieve(retrieveOptions, {resolveImageOutput$} = {}) {
        const {recipe, sourceRuntime} = this.props
        return submitMaskingRetrieve({
            recipe,
            retrieveOptions,
            resolveImageOutput$: resolveImageOutput$ || sourceRuntime.resolveImageOutput$
        })
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps),
    withSourceRuntime()
)

Retrieve.propTypes = {}
