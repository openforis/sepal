import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {RecipeState} from '../mosaicRecipe'
import Auto from './auto/auto'
import Preview from './preview/preview'
import Retrieve from './retrieve/retrieve'
import Aoi from './aoi/aoi'
import Dates from './dates/dates'
import Sources from './sources/sources'
import Scenes from './scenes/scenes'
import Composite from './composite/composite'
import styles from './panels.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        selectedPanel: recipe('ui.selectedPanel')
    }
}

class Panels extends React.Component {
    render() {
        const {selectedPanel} = this.props
        switch (selectedPanel) {
        case 'auto':
            return <Auto id={this.props.id} className={[styles.panel, styles.auto, styles.top].join(' ')}/>
        case 'preview':
            return <Preview id={this.props.id} className={[styles.panel, styles.preview, styles.top].join(' ')}/>
        case 'retrieve':
            return <Retrieve id={this.props.id} className={[styles.panel, styles.retrieve, styles.top].join(' ')}/>
        case 'areaOfInterest':
            return <Aoi id={this.props.id} className={[styles.panel, styles.aoi, styles.bottom].join(' ')}/>
        case 'dates':
            return <Dates id={this.props.id} className={[styles.panel, styles.dates, styles.bottom].join(' ')}/>
        case 'sources':
            return <Sources id={this.props.id} className={[styles.panel, styles.sources, styles.bottom].join(' ')}/>
        case 'scenes':
            return <Scenes id={this.props.id} className={[styles.panel, styles.scenes, styles.bottom].join(' ')}/>
        case 'composite':
            return <Composite id={this.props.id} className={[styles.panel, styles.composite, styles.bottom].join(' ')}/>
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
