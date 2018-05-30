import actionBuilder from 'action-builder'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {map as rxMap} from 'rxjs/operators/index'
import {connect} from 'store'
import MapToolbar from './mapToolbar'
import styles from './mosaic.module.css'
import {RecipeState} from './mosaicRecipe'
import Panels from './panels/panels'
import Toolbar from './panels/toolbar'
import {setPreviewLayer} from './previewLayer'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        recipe: recipe()
    }
}

class Mosaic extends React.Component {
    render() {
        const {id} = this.props
        return (
            <div className={styles.mosaic}>
                <MapToolbar id={id} className={[styles.toolbar, styles.map].join(' ')}/>
                <Toolbar id={id} className={[styles.toolbar, styles.mosaic].join(' ')}/>
                <Panels id={id} className={styles.panel}/>
            </div>
        )
    }

    componentDidMount() {
        const {id, recipe: {aoi}} = this.props
        setAoiLayer(id, aoi)
    }

    componentDidUpdate() {
        const {id, recipe, componentWillUnmount$} = this.props
        // setAoiLayer(id, aoi)
        setPreviewLayer({
            contextId: id,
            recipe,
            destroy$: componentWillUnmount$
        })
    }
}

Mosaic.propTypes = {
    id: PropTypes.string
}

export default connect(mapStateToProps)(Mosaic)
