import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {RecipeActions, RecipeState} from '../mosaicRecipe'
import Aoi from './aoi/aoi'
import Auto from './auto/auto'
import Composite from './composite/composite'
import Dates from './dates/dates'
import {PANELS} from './panelConstants'
import styles from './panels.module.css'
import ClearSelectedScenes from './clearSelectedScenes/clearSelectedScenes'
import Retrieve from './retrieve/retrieve'
import Scenes from './scenes/scenes'
import Sources from './sources/sources'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        selectedPanel: recipeState('ui.selectedPanel')
    }
}

class Panels extends React.Component {
    render() {
        const {recipeId, selectedPanel} = this.props
        switch (selectedPanel) {
            // case PANELS.AUTO:
            //     return <Auto
            //         recipeId={recipeId}
            //         className={[styles.panel, styles.top].join(' ')}/>
            // case PANELS.CLEAR_SELETED_SCENES:
            //     return <ClearSelectedScenes
            //         recipeId={recipeId}
            //         className={[styles.panel, styles.top].join(' ')}/>
            // case PANELS.RETRIEVE:
            //     return <Retrieve
            //         recipeId={recipeId}
            //         className={[styles.panel, styles.top].join(' ')}/>
            case PANELS.AREA_OF_INTEREST:
                return <Aoi
                    recipeId={recipeId}
                    className={[styles.panel, styles.bottom].join(' ')}/>
            case PANELS.DATES:
                return <Dates
                    recipeId={recipeId}
                    className={[styles.panel, styles.bottom].join(' ')}/>
            case PANELS.SOURCES:
                return <Sources
                    recipeId={recipeId}
                    className={[styles.panel, styles.bottom].join(' ')}/>
            case PANELS.SCENES:
                return <Scenes
                    recipeId={recipeId}
                    className={[styles.panel, styles.bottom].join(' ')}/>
            case PANELS.COMPOSITE:
                return <Composite
                    recipeId={recipeId}
                    className={[styles.panel, styles.bottom].join(' ')}/>
            default:
                return null
        }
    }

    componentDidMount() {
        const {recipeId, selectedPanel, initialized} = this.props
        if (!initialized && !selectedPanel)
            RecipeActions(recipeId).selectPanel(PANELS.AREA_OF_INTEREST)
                .dispatch()
    }
}

Panels.propTypes = {
    recipeId: PropTypes.string,
    selectedPanel: PropTypes.string,
    initialized: PropTypes.any
}

export default connect(mapStateToProps)(Panels)
