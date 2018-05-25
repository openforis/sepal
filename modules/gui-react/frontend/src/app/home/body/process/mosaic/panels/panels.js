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
import Preview from './preview/preview'
import Retrieve from './retrieve/retrieve'
import Scenes from './scenes/scenes'
import Sources from './sources/sources'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        initialized: recipe('initialized'),
        selectedPanel: recipe('ui.selectedPanel')
    }
}

class Panels extends React.Component {
    render() {
        const {selectedPanel} = this.props
        switch (selectedPanel) {
        case PANELS.AUTO:
            return <Auto id={this.props.id} className={[styles.panel, styles.auto, styles.top].join(' ')}/>
        case PANELS.PREVIEW:
            return <Preview id={this.props.id} className={[styles.panel, styles.preview, styles.top].join(' ')}/>
        case PANELS.RETRIEVE:
            return <Retrieve id={this.props.id} className={[styles.panel, styles.retrieve, styles.top].join(' ')}/>
        case PANELS.AREA_OF_INTEREST:
            return <Aoi id={this.props.id} className={[styles.panel, styles.aoi, styles.bottom].join(' ')}/>
        case PANELS.DATES:
            return <Dates id={this.props.id} className={[styles.panel, styles.bottom].join(' ')}/>
        case PANELS.SOURCES:
            return <Sources id={this.props.id} className={[styles.panel, styles.sources, styles.bottom].join(' ')}/>
        case PANELS.SCENES:
            return <Scenes id={this.props.id} className={[styles.panel, styles.scenes, styles.bottom].join(' ')}/>
        case PANELS.COMPOSITE:
            return <Composite id={this.props.id}
                className={[styles.panel, styles.composite, styles.bottom].join(' ')}/>
        default:
            return null
        }
    }

    componentDidMount() {
        const {id, selectedPanel, initialized} = this.props
        if (!initialized && !selectedPanel)
            RecipeActions(id).selectPanel(PANELS.AREA_OF_INTEREST)
                .dispatch()
    }
}

Panels.propTypes = {
    id: PropTypes.string,
    selectedPanel: PropTypes.string,
    initialized: PropTypes.any
}

export default connect(mapStateToProps)(Panels)
