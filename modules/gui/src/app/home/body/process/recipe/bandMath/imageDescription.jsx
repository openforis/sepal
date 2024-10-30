import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'

import {recipeAccess} from '../../recipeAccess'

class _ImageDescription extends React.Component {
    render() {
        const {image, loadedRecipes} = this.props
        if (image.type === 'RECIPE_REF') {
            const {title, placeholder} = loadedRecipes[image.id]
            return title || placeholder
        } else if (image.type === 'ASSET') {
            return image.id
        } else if (image.type === 'FUNCTION') {
            const usedBandExpressions = image.usedBands.map(({imageName, name}) => `${imageName}.${name}`)
            return (
                <>
                    <strong>{`${image.reducer}`}</strong>
                    {`(${usedBandExpressions.join(', ')})`}
                </>
            )
        } else if (image.type === 'EXPRESSION') {
            return image.expression
        } else {
            throw Error('Unsupported image type: ', image.type)
        }
    }
}

export const ImageDescription = compose(
    _ImageDescription,
    recipeAccess()
)

ImageDescription.propTypes = {
    image: PropTypes.object,
}
