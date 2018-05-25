import PropTypes from 'prop-types'
import React from 'react'
import {Msg} from 'translate'
import {form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import styles from './composite.module.css'

const inputs = {}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('ui.composite')
    }
}

class Composite extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }

    render() {
        const {className} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div>
                        <Msg id={'process.mosaic.panel.composite.title'}/>
                    </div>
                </div>
            </div>
        )
    }
}

Composite.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Composite)
