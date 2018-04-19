import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import {RecipeState} from './mosaicRecipe'
import AoiSelection from './aoiSelection/aoiSelection'
import styles from './panels.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        selectedPanel: recipe('selectedPanel')
    }
}

class Panels extends React.Component {
    render() {
        const {selectedPanel} = this.props
        switch (selectedPanel) {
            case 'areaOfInterest':
                return <AoiSelection className={styles.panel}/>
            default:
                return null
        }
    }
}

Panels.propTypes = {
    id: PropTypes.string,
    selectedPanel: PropTypes.string
}

export default connect(mapStateToProps)(Panels)
