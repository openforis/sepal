import {RecipeInput} from 'widget/recipeInput'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {recipeAccess} from 'app/home/body/process/recipeAccess'
import PropTypes from 'prop-types'
import React from 'react'

class _RecipeSection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeChanged$ = new Subject()
    }

    render() {
        const {inputs: {recipe}} = this.props
        return (
            <RecipeInput
                filter={type => {
                    return type.id === 'BAYTS_HISTORICAL' || type.sourceRecipe // TODO: Include optional sourceType on recipes (store as column in db). Default to type
                }}
                input={recipe}
                autoFocus
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
