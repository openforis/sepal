/**
 * @author Mino Togna
 */
require( './raster-options.scss' )
var EventBus   = require( '../../../../../event/event-bus' )
var Events     = require( '../../../../../event/events' )
var Loader     = require( '../../../../../loader/loader' )
var RasterBand = require( './raster-band' )

var RasterOptions = function ( layerOptions, onReady ) {
    var $this = this
    
    //instance variables
    this.layerOptions = layerOptions
    this.layer        = $.extend( true, {}, this.layerOptions.layer )
    
    // ui elements
    this.container = this.layerOptions.rasterOptions
    
    this.containerNoBandSelector = this.container.find( '.row-no-band-selector' )
    this.btn1Band                = this.containerNoBandSelector.find( '.btn-1-band' )
    this.btn3Bands               = this.containerNoBandSelector.find( '.btn-3-bands' )
    
    this.inputNoData = this.container.find( 'input[name=no-data]' )
    this.inputNoData.change( function () {
        $.each( $this.bandsUI, function ( i, bandUI ) {
            var val                       = $this.inputNoData.val()
            $this.layer.nodata            = $.isEmptyString( val ) ? '' : val
            bandUI.band.palette[ 0 ][ 0 ] = -1
            bandUI.band.palette[ 1 ][ 0 ] = -1
            bandUI.setBandIndex( bandUI.band.index )
        } )
    } )
    
    this.bandsUI          = []
    this.persistedBandsUI = []
    
    this.formNotify = this.container.find( '.form-notify' )
    this.btnSave    = this.container.find( '.btn-save' )
    this.btnSave.click( function () {
        $this.save()
    } )
    
    this.init( onReady )
}

RasterOptions.prototype.init = function ( onReady ) {
    var $this = this
    
    var params = {
        url      : '/sandbox/geo-web-viz/raster/info?path=' + this.layer.path
        , success: function ( response ) {
            $this.bandCount    = response.bandCount
            $this.layer.nodata = response.nodata
            $this.inputNoData.val( $this.layer.nodata )
            
            if ( $this.bandCount >= 3 ) {
                // enable number of band selection
                $this.containerNoBandSelector.show()
                
                $this.btn1Band.click( function ( e ) {
                    if ( !$this.btn1Band.hasClass( 'active' ) )
                        $this.setDefaultBands( 1 )
                } )
                $this.btn3Bands.click( function ( e ) {
                    if ( !$this.btn3Bands.hasClass( 'active' ) )
                        $this.setDefaultBands( 3 )
                } )
            }
            
            if ( $this.layer.bounds ) {
                $this.initBandsUI()
                $this.persistedBandsUI = $this.bandsUI.slice()
                onReady()
            } else {
                // init default bands
                $this.btnSave.disable()
                
                var onSave = function () {
                    $this.persistedBandsUI = $this.bandsUI.slice()
                    if ( onReady )
                        onReady()
                }
                
                $this.layer.bands = []
                if ( $this.bandCount >= 3 ) {
                    $this.setDefaultBands( 3, true, onSave )
                } else {
                    $this.setDefaultBands( 1, true, onSave )
                }
                
            }
        }
    }
    
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

RasterOptions.prototype.setDefaultBands = function ( noBands, save, onSave ) {
    var $this = this
    if ( this.bandsUI.length > 0 ) {
        $.each( this.bandsUI, function ( i, bandUI ) {
            bandUI.delete()
        } )
    }
    
    this.layer.bands = []
    this.containerNoBandSelector.find( '.btn' ).removeClass( 'active' )
    
    if ( noBands >= 3 ) {
        this.layer.bands[ 0 ] = { index: 3, palette: [ [ -1, '#000000' ], [ -1, '#FF0000' ] ] }
        this.layer.bands[ 1 ] = { index: 2, palette: [ [ -1, '#000000' ], [ -1, '#00FF00' ] ] }
        this.layer.bands[ 2 ] = { index: 1, palette: [ [ -1, '#000000' ], [ -1, '#0000FF' ] ] }
        this.btn3Bands.addClass( 'active' )
    } else {
        this.layer.bands[ 0 ] = { index: 1, palette: [ [ -1, '#000000' ], [ -1, '#CCCCCC' ] ] }
        this.btn1Band.addClass( 'active' )
    }
    
    this.initBandsUI()
    
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
            if ( save ) {
                $this.save( function ( response ) {
                    $this.layer.bounds = response.bounds
                    if ( onSave )
                        onSave()
                } )
                
            }
        }
    }
    var interval              = setInterval( checkBandsInitialized, 300 )
}

RasterOptions.prototype.initBandsUI = function () {
    var bandsContainer = this.layerOptions.rasterOptions.find( '.raster-bands' )
    
    this.bandsUI[ 0 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 0 ] )
    if ( this.layer.bands.length >= 3 ) {
        this.bandsUI[ 1 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 1 ] )
        this.bandsUI[ 2 ] = RasterBand.newInstance( this, bandsContainer, this.layer.bands[ 2 ] )
    }
    
    this.updateBtnBandsStatus()
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

RasterOptions.prototype.updateBtnBandsStatus = function () {
    this.containerNoBandSelector.find( '.btn' ).removeClass( 'active' )
    
    if ( this.layer.bands.length >= 3 ) {
        this.btn3Bands.addClass( 'active' )
    } else {
        this.btn1Band.addClass( 'active' )
    }
}

RasterOptions.prototype.update = function () {
    this.formNotify.stop().hide()
    
    var $this       = this
    var reloadBands = $this.layer.nodata !== $this.layerOptions.layer.nodata
    
    // if ( this.layer.bands.length !== this.layerOptions.layer.bands.length && this.bandsUI.length > 0 ) {
    $.each( this.bandsUI, function ( i, bandUI ) {
        bandUI.delete()
    } )
    $this.layer   = $.extend( true, {}, $this.layerOptions.layer )
    $this.bandsUI = $this.persistedBandsUI.slice()
    // this.initBandsUI()
    // } else {
    // just reset layer
    // $this.layer = $.extend( true, {}, $this.layerOptions.layer )
    // }
    
    this.updateBtnBandsStatus()
    this.inputNoData.val( $this.layer.nodata )
    
    if ( $this.layer.bands ) {
        
        setTimeout( function () {
            $.each( $this.bandsUI, function ( i, bandUI ) {
                bandUI.updateBand( $this.layer.bands[ i ], reloadBands )
            } )
        }, 510 )
    }
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
                $this.persistedBandsUI   = $this.bandsUI.slice()
                
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