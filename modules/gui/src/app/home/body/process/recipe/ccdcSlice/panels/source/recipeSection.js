import {RecipeInput} from 'widget/recipeInput'
import {Subject} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

export default class RecipeSection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeChanged$ = new Subject()
    }

    render() {
        const {inputs: {recipe}, onLoading} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={type => type.id === 'CCDC'}
                autoFocus
                onLoading={onLoading}
                onLoaded={value => this.onRecipeLoaded(value)}
                errorMessage
            />
        )
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
