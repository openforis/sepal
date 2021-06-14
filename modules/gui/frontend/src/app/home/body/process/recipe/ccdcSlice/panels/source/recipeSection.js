import {Form} from 'widget/form/form'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {recipeAccess} from 'app/home/body/process/recipeAccess'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeChanged$ = new Subject()
    }

    render() {
        const {recipes, inputs: {recipe}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CCDC')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))
        return (
            <Form.Combo
                label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                input={recipe}
                placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                options={options}
                autoFocus
                errorMessage
            />
        )
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}

export default compose(
    RecipeSection,
    connect(mapStateToProps),
    recipeAccess()
)
