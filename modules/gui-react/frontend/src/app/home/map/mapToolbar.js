import Labels from 'app/home/map/labels'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import {Toolbar, ToolbarButton} from 'widget/toolbar'
import {sepalMap} from './map'
import styles from './mapToolbar.module.css'

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    zoomLevel: sepalMap.getZoom()
})

class MapToolbar extends React.Component {
    render() {
        const {statePath, mapContext, labelsShown, labelLayerIndex, children} = this.props
        return (
            <Toolbar className={styles.mapToolbar} horizontal>
                <ToolbarButton
                    disabled={sepalMap.isMaxZoom()}
                    onClick={sepalMap.zoomIn.bind(sepalMap)}
                    icon={'plus'}
                    tooltip={'process.mosaic.mapToolbar.zoomIn'}/>
                <ToolbarButton
                    disabled={sepalMap.isMinZoom()}
                    onClick={sepalMap.zoomOut.bind(sepalMap)}
                    icon={'minus'}
                    tooltip={'process.mosaic.mapToolbar.zoomOut'}/>
                <ToolbarButton
                    selected={labelsShown}
                    onClick={() => Labels.showLabelsAction({
                        shown: !labelsShown,
                        layerIndex: labelLayerIndex,
                        statePath,
                        mapContext
                    }).dispatch()}
                    icon={'map-marker-alt'}
                    tooltip={`process.mosaic.mapToolbar.labels.${labelsShown ? 'hide' : 'show'}`}/>
                {children}
                <ToolbarButton
                    onClick={() => sepalMap.getContext(mapContext).fitLayer('aoi')}
                    icon={'bullseye'}
                    tooltip={'process.mosaic.mapToolbar.centerMap'}/>
            </Toolbar>
        )
    }
}

MapToolbar.propTypes = {
    statePath: PropTypes.string.isRequired,
    mapContext: PropTypes.string.isRequired,
    labelLayerIndex: PropTypes.any.isRequired,
    children: PropTypes.any
}

export default connect(mapStateToProps)(MapToolbar)
