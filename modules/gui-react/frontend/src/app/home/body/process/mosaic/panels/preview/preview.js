import PropTypes from 'prop-types'
import React from 'react'
import {Msg} from 'translate'
import {form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import styles from './preview.module.css'

const fields = {}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.preview')
    }
}

class Preview extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {className} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div>
                        <Msg id={'process.mosaic.panel.preview.title'}/>
                    </div>
                </div>
            </div>
        )
    }
}

Preview.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Preview)
