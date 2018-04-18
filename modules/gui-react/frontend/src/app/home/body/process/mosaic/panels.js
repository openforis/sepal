import React from 'react'
import styles from './panels.module.css'
import PropTypes from 'prop-types'
import {connect} from 'store'
import {RecipeState} from './mosaicRecipe'
import {Msg} from 'translate'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        selectedPanel: recipe('selectedPanel')
    }
}

class Panels extends React.Component {
    constructor(props) {
        super(props)
    }
    render() {
        const {selectedPanel} = this.props
        return selectedPanel ? (
            <div className={[styles.panels, styles.selectedPanel].join(' ')}>
                <Msg id={`process.mosaic.panel.${selectedPanel}.title`}/>
            </div>
        ) : null
    }
}

Panels.propTypes = {
    id: PropTypes.string,
    selectedPanel: PropTypes.string
}

export default connect(mapStateToProps)(Panels)
