/**
 * @author Mino Togna
 */
var EventBus = require('../event/event-bus')
var Events   = require('../event/events')

var Mosaic          = require('./ee-mosaic')
var LandsatMosaic   = null
var Sentinel2Mosaic = null
var ActiveMosaic    = null

var LAYER_INDEX = 100

var visible = false

var reset = function () {
  hideActiveMosaic()
  ActiveMosaic = null
}

var hideActiveMosaic = function () {
  if (ActiveMosaic) {
    EventBus.dispatch(Events.MAP.REMOVE_EE_MOSAIC, null, LAYER_INDEX)
    visible = false
  }
}

var showActiveMosaic = function () {
  if (ActiveMosaic) {
    EventBus.dispatch(Events.MAP.ADD_EE_MOSAIC, null, LAYER_INDEX, ActiveMosaic.layer)
    visible = true
  }
}

var addMosaic = function (mapId, token) {
  reset()
  setTimeout(function () {
    ActiveMosaic = Mosaic.newInstance(mapId, token)
    showActiveMosaic()
  }, 500)
}

// var addLandsatMosaic = function ( mapId, token ) {
//     LandsatMosaic = Mosaic.newInstance( mapId, token )
//     addMosaic( LandsatMosaic )
// }
//
// var addSentinel2Mosaic = function ( mapId, token ) {
//     Sentinel2Mosaic = Mosaic.newInstance( mapId, token )
//     addMosaic( Sentinel2Mosaic )
// }
//
// var addMosaic = function ( mosaic ) {
//     reset()
//     ActiveMosaic = mosaic
//     showActiveMosaic()
// }

var toggleMosaicVisibility = function (e) {
  if (visible) {
    hideActiveMosaic()
  } else {
    showActiveMosaic()
  }
}
// var toggleLandsatMosaic = function ( e ) {
//     if ( ActiveMosaic === LandsatMosaic ) {
//         reset()
//     } else {
//         addMosaic( LandsatMosaic )
//     }
// }
//
// var toggleSentinel2Mosaic = function ( e ) {
//     if ( ActiveMosaic === Sentinel2Mosaic ) {
//         reset()
//     } else {
//         addMosaic( Sentinel2Mosaic )
//     }
// }

module.exports = {
  reset                   : reset
  , addMosaic             : addMosaic
  , toggleMosaicVisibility: toggleMosaicVisibility
  // , addLandsatMosaic     : addLandsatMosaic
  // , addSentinel2Mosaic   : addSentinel2Mosaic
  // , toggleLandsatMosaic  : toggleLandsatMosaic
  // , toggleSentinel2Mosaic: toggleSentinel2Mosaic
  , hideMosaic            : hideActiveMosaic
  , showMosaic            : showActiveMosaic
}