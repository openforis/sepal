/**
 * @author Mino Togna
 */
var EventBus   = require( '../../../../../event/event-bus' )
var Events     = require( '../../../../../event/events' )
var Loader     = require( '../../../../../loader/loader' )
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
    
    this.formNotify = this.container.find( '.form-notify' )
    this.btnSave    = this.container.find( '.btn-save' )
    this.btnSave.click( function () {
        $this.save()
    } )
}

RasterOptions.prototype.initBands = function () {
    // var hasBands       = this.layer.bands && this.layer.bands.length > 0
    var bandsContainer = this.layerOptions.rasterOptions.find( '.raster-bands' )
    
    
    this.bandsUI[ 0 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 0 ] )
    
    if ( this.bandCount > 3 ) {
        this.bandsUI[ 1 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 1 ] )
        this.bandsUI[ 2 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 2 ] )
    }
}

RasterOptions.prototype.bandIndexChange = function ( target, newIndex ) {
    var $this = this
    target.setBandIndex( newIndex )
    
    $.each( $this.bandsUI, function ( i, bandUI ) {
        if ( target !== bandUI && bandUI.band.index === newIndex ) {
            bandUI.setBandIndex( -1 )
        }
    } )
}

RasterOptions.prototype.update = function () {
    this.formNotify.stop().hide()
    var $this = this
    setTimeout( function () {
        $.each( $this.bandsUI, function ( i, bandUI ) {
            bandUI.updateHistogram()
        } )
    }, 550 )
}

RasterOptions.prototype.save = function () {
    var valid = true
    this.formNotify.stop().fadeOut()
    
    $.each( this.bandsUI, function ( i, bandUI ) {
        if ( bandUI.band.index < 0 ) {
            valid = false
            return false
        }
    } )
    
    var $this = this
    if ( !valid ) {
        this.formNotify.html( 'All bands must be specified before saving' ).fadeIn()
    } else {
        // console.log( "=== Before save", this.layer )
        var params = {
            url         : '/sandbox/geo-web-viz/raster/save'
            , data      : { 'layer': JSON.stringify( this.layer ) }
            , beforeSend: function () {
                $this.btnSave.disable()
                Loader.show()
            }
            , success   : function ( response ) {
                Loader.hide( { delay: 300 } )
                EventBus.dispatch( Events.ALERT.SHOW_INFO, null, "Layer settings successfully saved" )
                setTimeout( function () {
                    $this.btnSave.enable()
                }, 1000 )
            }
        }
        
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
}

var newInstance = function ( layerOptions ) {
    return new RasterOptions( layerOptions )
}

module.exports = {
    newInstance: newInstance
}