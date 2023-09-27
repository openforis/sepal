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
        const {inputs: {recipe}} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={type => ['CCDC', 'ASSET_MOSAIC'].includes(type.id)}
                autoFocus
                errorMessage
            />
        )
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
