/**
 * @author Mino Togna
 */
var EventBus   = require( '../../../../../event/event-bus' )
var Events     = require( '../../../../../event/events' )
var RasterBand = require( './raster-band' )

var RasterOptions = function ( layerOptions ) {
    var $this         = this
    this.layerOptions = layerOptions
    this.container    = this.layerOptions.rasterOptions
    this.layer        = this.layerOptions.layer
    this.bandsUI      = []
    
    var params = {
        url      : '/sandbox/geo-web-viz/raster/band/count?path=' + this.layer.path
        , success: function ( response ) {
            $this.bandCount = response.count
            $this.initBands()
        }
    }
    
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

RasterOptions.prototype.initBands = function () {
    var hasBands       = this.layer.bands && this.layer.bands.length > 0
    var bandsContainer = this.layerOptions.rasterOptions.find( '.raster-bands' )
    
    
    this.bandsUI[ 0 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 0 ] )
    
    // if ( this.bandCount == 1 ) {
    // this.bandsUI[ 0 ].bandIndex.prop('readonly', true)
    // } else
    if ( this.bandCount > 3 ) {
        this.bandsUI[ 1 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 1 ] )
        this.bandsUI[ 2 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 2 ] )
    }
}

RasterOptions.prototype.update = function () {
    var $this = this
    setTimeout( function () {
        $.each( $this.bandsUI, function ( i, bandUI ) {
            bandUI.updateHistogram()
        } )
    }, 550 )
}

var newInstance = function ( layerOptions ) {
    return new RasterOptions( layerOptions )
}

module.exports = {
    newInstance: newInstance
}