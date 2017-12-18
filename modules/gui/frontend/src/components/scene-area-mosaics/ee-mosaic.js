/**
 * @author Mino Togna
 */
var ee = require( 'earthengine-api' ).ee
// ee.MapTileManager.MAX_RETRIES = 3

var EEMosaic = function ( mapId, token ) {
  // >= IE8
  if ( document.documentMode ) {
    this.layer = new ee.MapLayerOverlay( 'https://earthengine.googleapis.com/map', mapId, token, {} )
  } else {
    this.layer = new ee.layers.ImageOverlay(
      new ee.layers.EarthEngineTileSource( 'https://earthengine.googleapis.com/map', mapId, token )
    )
  }
}

var newInstance = function ( mapId, token ) {
  return new EEMosaic( mapId, token )
}

module.exports = {
  newInstance: newInstance
}