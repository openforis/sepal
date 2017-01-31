/**
 * @author Mino Togna
 */
var EventBus   = require( '../../../../../event/event-bus' )
var Events     = require( '../../../../../event/events' )
var Loader     = require( '../../../../../loader/loader' )
var RasterBand = require( './raster-band' )

var RasterOptions = function ( layerOptions, onReady ) {
    var $this         = this
    this.layerOptions = layerOptions
    this.container    = this.layerOptions.rasterOptions
    this.inputNoData  = this.container.find( 'input[name=no-data]' )
    this.inputNoData.change( function () {
        $.each( $this.bandsUI, function ( i, bandUI ) {
            var val                       = $this.inputNoData.val()
            $this.layer.nodata            = $.isEmptyString( val ) ? '' : val
            bandUI.band.palette[ 0 ][ 0 ] = -1
            bandUI.band.palette[ 1 ][ 0 ] = -1
            bandUI.setBandIndex( bandUI.band.index )
        } )
    } )
    // var layer         = $.extend( true, {}, this.layerOptions.layer )
    this.layer   = $.extend( true, {}, this.layerOptions.layer )
    this.bandsUI = []
    
    var params = {
        url      : '/sandbox/geo-web-viz/raster/info?path=' + this.layer.path
        , success: function ( response ) {
            $this.bandCount    = response.bandCount
            $this.layer.nodata = response.nodata
            $this.inputNoData.val( $this.layer.nodata )
            
            if ( $this.layer.bounds ) {
                $this.initBands()
                onReady()
            } else {
                
                $this.btnSave.disable()
                // init default bands
                $this.layer.bands = []
                if ( $this.bandCount >= 3 ) {
                    $this.layer.bands[ 0 ] = { index: 3, palette: [ [ -1, '#000000' ], [ -1, '#FF0000' ] ] }
                    $this.layer.bands[ 1 ] = { index: 2, palette: [ [ -1, '#000000' ], [ -1, '#00FF00' ] ] }
                    $this.layer.bands[ 2 ] = { index: 1, palette: [ [ -1, '#000000' ], [ -1, '#0000FF' ] ] }
                } else {
                    $this.layer.bands[ 0 ] = { index: 1, palette: [ [ -1, '#000000' ], [ -1, '#CCCCCC' ] ] }
                }
                $this.initBands()
                
                // var bandsInitialzed       = false
                
                var checkBandsInitialized = function () {
                    var bandsInitialzied = function () {
                        var bandsInitialzed = true
                        $.each( $this.bandsUI, function ( i, bandUI ) {
                            if ( !bandUI._initialized ) {
                                bandsInitialzed = false
                                return false
                            }
                        } )
                        return bandsInitialzed
                    }
                    
                    if ( bandsInitialzied() ) {
                        clearInterval( interval )
                        
                        $this.save( function ( response ) {
                            $this.layer.bounds = response.bounds
                            onReady()
                        } )
                    }
                }
                var interval              = setInterval( checkBandsInitialized, 300 )
                // onReady()
            }
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
    var bandsContainer = this.layerOptions.rasterOptions.find( '.raster-bands' )
    
    this.bandsUI[ 0 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 0 ] )
    
    if ( this.bandCount >= 3 ) {
        this.bandsUI[ 1 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 1 ] )
        this.bandsUI[ 2 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 2 ] )
    }
}

RasterOptions.prototype.bandIndexChange = function ( target, newIndex ) {
    var $this                     = this
    target.band.palette[ 0 ][ 0 ] = -1
    target.band.palette[ 1 ][ 0 ] = -1
    target.setBandIndex( newIndex )
    
    $.each( $this.bandsUI, function ( i, bandUI ) {
        if ( target !== bandUI && bandUI.band.index === newIndex ) {
            bandUI.band.palette[ 0 ][ 0 ] = -1
            bandUI.band.palette[ 1 ][ 0 ] = -1
            bandUI.setBandIndex( -1 )
        }
    } )
}

RasterOptions.prototype.update = function () {
    this.formNotify.stop().hide()
    var $this   = this
    $this.layer = $.extend( true, {}, $this.layerOptions.layer )
    setTimeout( function () {
        $.each( $this.bandsUI, function ( i, bandUI ) {
            // $this.layer.bands[i] = $.extend( true, {}, $this.layerOptions.layer.bands[ i ] )
            bandUI.update( $this.layer.bands[ i ] )
        } )
    }, 510 )
}

RasterOptions.prototype.save = function ( callback ) {
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
                if ( !callback )
                    Loader.show()
            }
            , success   : function ( response ) {
                EventBus.dispatch( Events.APPS.DATA_VIS.FORCE_UPDATE_LAYER, null, $this.layer )
                
                if ( callback )
                    callback( response )
                else
                    Loader.hide( { delay: 300 } )
                
                $this.layerOptions.layer = $.extend( true, {}, $this.layer )
                
                setTimeout( function () {
                    $this.btnSave.enable()
                }, 1000 )
            }
        }
        
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
}

var newInstance = function ( layerOptions, onReady ) {
    return new RasterOptions( layerOptions, onReady )
}

module.exports = {
    newInstance: newInstance
}