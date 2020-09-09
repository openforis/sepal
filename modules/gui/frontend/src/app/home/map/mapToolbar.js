import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {sepalMap} from './map'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'
import {LayersMenu} from './layersMenu'

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    zoomLevel: sepalMap.getZoom(),
    hasBounds: sepalMap.getContext(ownProps.mapContext).isLayerInitialized('aoi'),
    isZooming: sepalMap.getContext(ownProps.mapContext).isZooming(),
    metersPerPixel: sepalMap.getMetersPerPixel()
})

class MapToolbar extends React.Component {
    render() {
        const {statePath, mapContext, isZooming, labelLayerIndex, hasBounds, metersPerPixel, children} = this.props
        const context = sepalMap.getContext(mapContext)
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
                        onClick={() => isZooming ? context.cancelZoomArea() : context.zoomArea()}
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!hasBounds}
                        onClick={() => sepalMap.getContext(mapContext).fitLayer('aoi')}
                        icon={'bullseye'}
                        tooltip={msg('process.mosaic.mapToolbar.centerMap.tooltip')}/>

                    <Toolbar.ActivationButton
                        id='layersMenu'
                        icon='layer-group'
                        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
                    {children}
                </Toolbar>
                <div className={styles.metersPerPixel}>
                    {metersPerPixel}m/px
                </div>
                <Keybinding disabled={!isZooming} keymap={{Escape: () => context.cancelZoomArea()}}/>
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
    mapContext: PropTypes.string.isRequired,
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}

export default compose(
    MapToolbar,
    connect(mapStateToProps)
)
