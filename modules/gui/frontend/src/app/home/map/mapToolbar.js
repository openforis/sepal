import {LayersMenu} from './layersMenu'
// import {MapLayout, MapLayoutButton} from 'app/home/body/process/mapLayout/mapLayout'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {withMapContext} from './mapContext'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const {mapContext: {sepalMap}} = ownProps
    return {
        labelsShown: select([ownProps.statePath, 'labelsShown']),
        zoomLevel: sepalMap.getZoom(),
        hasBounds: sepalMap.isLayerInitialized('aoi'),
        isZooming: sepalMap.isZooming(),
        metersPerPixel: sepalMap.getMetersPerPixel()
    }
}

class MapToolbar extends React.Component {
    render() {
        const {statePath, mapContext, isZooming, labelLayerIndex, hasBounds, metersPerPixel, children} = this.props
        const {sepalMap} = mapContext
        return (
            <React.Fragment>
                <LayersMenu statePath={statePath} labelLayerIndex={labelLayerIndex} mapContext={mapContext}/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    <Toolbar.ToolbarButton
                        disabled={sepalMap.isMaxZoom()}
                        onClick={() => sepalMap.zoomIn()}
                        icon={'plus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomIn.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={sepalMap.isMinZoom()}
                        onClick={() => sepalMap.zoomOut()}
                        icon={'minus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomOut.tooltip')}/>
                    <Toolbar.ToolbarButton
                        selected={isZooming}
                        disabled={sepalMap.isMaxZoom()}
                        onClick={() => isZooming ? sepalMap.cancelZoomArea() : sepalMap.zoomArea()}
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!hasBounds}
                        onClick={() => sepalMap.fitLayer('aoi')}
                        icon={'bullseye'}
                        tooltip={msg('process.mosaic.mapToolbar.centerMap.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='layersMenu'
                        icon='layer-group'
                        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
                    {/* <MapLayout/>
                    <MapLayoutButton/> */}
                    {children}
                </Toolbar>
                <div className={styles.metersPerPixel}>
                    {metersPerPixel}m/px
                </div>
                <Keybinding disabled={!isZooming} keymap={{Escape: () => sepalMap.cancelZoomArea()}}/>
            </React.Fragment>
        )
    }
}

// const LayersMenu = () => {
//     return (
//         <Menu>
//             <MenuItem onSelect={() => console.log('first')}>
//                 {<Msg id='First'/>}
//             </MenuItem>
//             <MenuItem onSelect={() => console.log('second')}>
//                 {<Msg id='Second'/>}
//             </MenuItem>
//         </Menu>
//     )
// }

MapToolbar.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.object.isRequired,
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}

export default compose(
    MapToolbar,
    connect(mapStateToProps),
    withMapContext()
)
