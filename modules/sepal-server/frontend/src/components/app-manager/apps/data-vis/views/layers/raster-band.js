/**
 * @author Mino Togna
 */
require( './raster-band.scss' )

var EventBus            = require( '../../../../../event/event-bus' )
var Events              = require( '../../../../../event/events' )
var RasterBandHistogram = require( './raster-band-histogram' )

var template = require( './raster-band.html' )
var html     = $( template( {} ) )

var RasterBand = function ( rasterOptions, container, band ) {
    var $this = this
    
    //init html
    this.html = html.clone()
    container.append( this.html )
    
    // init properties
    this.rasterOptions = rasterOptions
    this.band          = band
    
    // ui properties
    this.bandIndex = this.html.find( '[name=band-index]' )
    
    //band index
    for ( var i = 1; i <= this.rasterOptions.bandCount; i++ ) {
        this.bandIndex.append( '<option value="' + i + '">' + i + '</option>' )
    }
    
    this.bandIndex.prop( 'disabled', this.rasterOptions.bandCount == 1 )
    this.bandIndex.change( function () {
        if ( $.isNotEmptyString( $this.bandIndex.val() ) ) {
            $this.rasterOptions.bandIndexChange( $this, parseInt( $this.bandIndex.val() ) )
        }
    } )
    // band histogram
    this.rasterBandHistogram = RasterBandHistogram.newInstance( this )
    
    //input values
    this.inputMinValue = this.html.find( '[name=min-value]' )
    this.inputMaxValue = this.html.find( '[name=max-value]' )
    
    this.inputMinValue.change( function () {
        var val                      = $this.inputMinValue.val()
        $this.band.palette[ 0 ][ 0 ] = $.isNotEmptyString( val ) ? parseFloat( val ) : ''
        $this.rasterBandHistogram.updateHistogramOverlay()
    } )
    
    this.inputMaxValue.change( function () {
        var val                      = $this.inputMaxValue.val()
        $this.band.palette[ 1 ][ 0 ] = $.isNotEmptyString( val ) ? parseFloat( val ) : ''
        $this.rasterBandHistogram.updateHistogramOverlay()
    } )
    
    this.initColorPickers()
    
    this.setBandIndex( this.band.index )
}

RasterBand.prototype.setBandIndex = function ( bandIndex ) {
    var $this       = this
    this.band.index = bandIndex
    this.bandIndex.val( this.band.index )
    
    if ( this.band.index > 0 ) {
        
        var params = {
            url         : '/sandbox/geo-web-viz/raster/band/' + $this.band.index //+ '?path=' + this.rasterOptions.layer.path
            , data      : { path: this.rasterOptions.layer.path, nodata: this.rasterOptions.layer.nodata }
            , beforeSend: function () {
                
                $this.rasterBandHistogram.bandHistogramProgressLoader.fadeIn( 100 )
                
                $this.html.find( '.color-picker' ).disable()
                $this.rasterBandHistogram.bandHistogramOverlayElem.hide()
            }
            , success   : function ( response ) {
                $this.properties = response
                
                //init default values for bands
                if ( $this.band.palette[ 0 ][ 0 ] < 0 && $this.band.palette[ 1 ][ 0 ] < 0 ) {
                    var total = 0
                    for ( var i = 0; i < $this.properties.histogram.length; i++ ) {
                        total += $this.properties.histogram[ i ]
                    }
                    var cutOff = 1
                    var left   = cutOff * total / 100
                    var right  = (100 - cutOff) * total / 100
                    
                    
                    var noPixPerBucket = ($this.properties.max - $this.properties.min) / $this.properties.histogram.length
                    
                    total   = 0
                    var min = 0
                    for ( var i = 0; i < $this.properties.histogram.length; i++ ) {
                        total += $this.properties.histogram[ i ]
                        if ( total >= left ) {
                            min = i * noPixPerBucket + $this.properties.min
                            break
                        }
                    }
                    
                    total   = 0
                    var max = 0
                    for ( var i = 0; i < $this.properties.histogram.length; i++ ) {
                        total += $this.properties.histogram[ i ]
                        if ( total >= right ) {
                            max = (i + 1) * noPixPerBucket + $this.properties.min
                            break
                        }
                    }
                    $this.band.palette[ 0 ][ 0 ] = min//$this.properties.min
                    $this.band.palette[ 1 ][ 0 ] = max//$this.properties.max
                }
                
                // update histogram
                $this.rasterBandHistogram.bandHistogramProgressLoader.fadeOut( 100 )
                $this.rasterBandHistogram.setHistogramData( { series: [ $this.properties.histogram ] } )
                
                // update color pickers
                $this.html.find( '.color-picker' ).enable()
                $this.updateColorPickers()
                
                // update input values
                $this.inputMinValue.val( $this.band.palette[ 0 ][ 0 ] ).enable()
                $this.inputMaxValue.val( $this.band.palette[ 1 ][ 0 ] ).enable()
                
                $this._initialized = true
            }
        }
        
        EventBus.dispatch( Events.AJAX.GET, null, params )
    } else {
        // update histogram
        $this.rasterBandHistogram.setHistogramData( { series: [ [] ] } )
        
        // update color pickers
        $this.html.find( '.color-picker' ).disable()
        
        // update input values
        $this.inputMaxValue.val( '' ).disable()
        $this.inputMinValue.val( '' ).disable()
    }
}

RasterBand.prototype.update = function ( band ) {
    this.band = band
    
    this.setBandIndex( this.band.index )
}

RasterBand.prototype.initColorPickers = function () {
    var $this = this
    
    // from color
    this.fromColor = this.html.find( '.from-color' )
    this.fromColor.colorpicker()
    this.fromColor.on( 'changeColor', function ( e ) {
        var color = e.color.toString( 'rgba' )
        $this.fromColor.find( 'i' ).css( 'background-color', color )
        $this.band.palette[ 0 ][ 1 ] = color
    } )
    
    // to color
    this.toColor = this.html.find( '.to-color' )
    this.toColor.colorpicker()
    this.toColor.on( 'changeColor', function ( e ) {
        var color = e.color.toString( 'rgba' )
        $this.toColor.find( 'i' ).css( 'background-color', color )
        $this.band.palette[ 1 ][ 1 ] = color
    } )
}

RasterBand.prototype.updateColorPickers = function () {
    var palette = this.band.palette
    this.fromColor.colorpicker( 'setValue', palette[ 0 ][ 1 ] )
    this.toColor.colorpicker( 'setValue', palette[ 1 ][ 1 ] )
}

var newInstance = function ( rasterOptions, container, band ) {
    return new RasterBand( rasterOptions, container, band )
}

module.exports = {
    newInstance: newInstance
}