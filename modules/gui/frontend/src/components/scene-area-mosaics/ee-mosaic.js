/**
 * @author Mino Togna
 */

var EEMosaic = function ( mapId, token ) {
    var eeMapOptions = {
        getTileUrl: function ( tile, zoom ) {
            var baseUrl = 'https://earthengine.googleapis.com/map'
            var url     = [ baseUrl, mapId, zoom, tile.x, tile.y ].join( '/' )
            url += '?token=' + token
            return url
        },
        tileSize  : new google.maps.Size( 256, 256 )
    }
    
    // Create the map type.
    this.layer = new google.maps.ImageMapType( eeMapOptions )
}

var newInstance = function ( mapId, token ) {
    return new EEMosaic( mapId, token )
}

module.exports = {
    newInstance: newInstance
}