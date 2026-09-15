import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {mayProvideSegments} from '#sepal/recipe/capability/ccdcSegments'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {compose} from '~/compose'
import {RecipeInput} from '~/widget/recipeInput'

class _RecipeSection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeChanged$ = new Subject()
    }

    render() {
        const {inputs: {recipe}} = this.props
        return (
            <RecipeInput
                filter={type => mayProvideSegments(type.id)}
                input={recipe}
                autoFocus
                errorMessage
            />
        )
    }
}

export const RecipeSection = compose(
    _RecipeSection,
    recipeAccess()
)

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
