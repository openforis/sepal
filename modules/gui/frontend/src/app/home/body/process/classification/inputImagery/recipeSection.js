import {ErrorMessage} from 'widget/form'
import {connect, select} from 'store'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Combo from 'widget/combo'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    render() {
        const {recipes, recipe} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <React.Fragment>
                <Combo
                    input={recipe}
                    label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                    placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                    options={options}
                    autoFocus={!isMobile()}/>
                <ErrorMessage for={recipe}/>
            </React.Fragment>
        )
    }
}

RecipeSection.propTypes = {
    recipe: PropTypes.object.isRequired,
    recipes: PropTypes.array
}

export default connect(mapStateToProps)(RecipeSection)
