/**
 * @author Mino Togna
 */
require( './raster-band.scss' )
var Chartist = require( 'chartist' )
var interact = require( 'interactjs' )
require( 'devbridge-autocomplete' )
//interactjs

var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )

var template = require( './raster-band.html' )
var html     = $( template( {} ) )

var RasterBand = function ( rasterOptions, container, band ) {
    var $this          = this
    $this._initialized = false
    
    //init html
    this.html = html.clone()
    container.append( this.html )
    
    // init properties
    this.rasterOptions = rasterOptions
    // this.band          = band
    // this.index         = this.band.index
    this.bandIndex = this.html.find( '[name=band-index]' )
    
    //band index
    var availableBands = []
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
    this.bandHistogram               = this.html.find( '.band-histogram' )
    this.bandHistogramOverlayElem    = this.html.find( '.band-minmax' ).hide()
    this.bandHistogramOverlay        = interact( this.bandHistogramOverlayElem.get( 0 ) )
    this.bandHistogramProgressLoader = this.html.find( '.band-histogram-progress-loader' )
    
    this.band = band
    
    this.setBandIndex( this.band.index )
}

RasterBand.prototype.setBandIndex = function ( bandIndex ) {
    var $this       = this
    this.band.index = bandIndex
    this.bandIndex.val( this.band.index )
    
    if ( this.band.index > 0 ) {
        
        var params = {
            url         : '/sandbox/geo-web-viz/raster/band/' + $this.band.index + '?path=' + this.rasterOptions.layer.path
            , beforeSend: function () {
                $this.bandHistogramProgressLoader.fadeIn( 100 )
                
                $this.html.find( '.color-picker' ).disable()
                $this.bandHistogramOverlayElem.hide()
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
                
                $this.bandHistogramProgressLoader.fadeOut( 100 )
                
                $this.initHistogram()
                $this.histogramData = {
                    series: [ $this.properties.histogram ]
                }
                $this.updateHistogram()
                
                $this.initColorPickers()
                $this.html.find( '.color-picker' ).enable()
                
                $this.initHistogramOverlay()
                $this.bandHistogramOverlayElem.show()
                $this.updateHistogramOverlay()
                
                $this._initialized = true
            }
        }
        
        EventBus.dispatch( Events.AJAX.GET, null, params )
    } else {
        $this.histogramData = { series: [ [] ] }
        $this.updateHistogram()
        
        $this.html.find( '.color-picker' ).disable()
        
        $this.bandHistogramOverlayElem.hide()
    }
}

RasterBand.prototype.initHistogram = function () {
    if ( !this._initialized ) {
        var options = {
            showPoint   : false,
            showLine    : false,
            showArea    : true,
            fullWidth   : true,
            showLabel   : false,
            axisX       : {
                showGrid : false,
                showLabel: false,
                offset   : 0
            },
            axisY       : {
                showGrid : false,
                showLabel: false,
                offset   : 0
            },
            chartPadding: 0
            
        }
        
        this.histogram = new Chartist.Line( this.bandHistogram.get( 0 ), { series: [ [] ] }, options )
    }
}

RasterBand.prototype.updateHistogram = function () {
    if ( this.histogram ) {
        this.histogram.update( this.histogramData )
        this.updateHistogramOverlay()
    }
}

RasterBand.prototype.initColorPickers = function () {
    if ( !this._initialized ) {
        var $this   = this
        // console.log( this )
        var palette = $this.band.palette
        
        // from color
        var from       = palette[ 0 ]
        this.fromColor = this.html.find( '.from-color' )
        this.fromColor.colorpicker()
        this.fromColor.on( 'changeColor', function ( e ) {
            var color = e.color.toString( 'rgba' )
            $this.fromColor.find( 'i' ).css( 'background-color', color )
            from[ 1 ] = color
        } )
        this.fromColor.colorpicker( 'setValue', from[ 1 ] )
        
        // to color
        var to       = palette[ 1 ]
        this.toColor = this.html.find( '.to-color' )
        this.toColor.colorpicker()
        this.toColor.on( 'changeColor', function ( e ) {
            var color = e.color.toString( 'rgba' )
            $this.toColor.find( 'i' ).css( 'background-color', color )
            to[ 1 ] = color
        } )
        this.toColor.colorpicker( 'setValue', to[ 1 ] )
    }
}

RasterBand.prototype.initHistogramOverlay = function () {
    var $this = this
    if ( !this._initialized ) {
        this.bandHistogramOverlay
            .draggable( {
                inertia : true,
                // keep the element within the area of it's parent
                restrict: {
                    restriction: "parent",
                    // endOnly: true,
                    elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
                },
                // onmove: window.dragMoveListener
                onmove  : function ( event ) {
                    var target = event.target,
                        // keep the dragged position in the data-x/data-y attributes
                        x      = (parseFloat( target.getAttribute( 'data-x' ) ) || 0) + event.dx,
                        y      = (parseFloat( target.getAttribute( 'data-y' ) ) || 0) + event.dy;
                    
                    // translate the element
                    target.style.webkitTransform =
                        target.style.transform =
                            // 'translate(' + x + 'px, ' + y + 'px)';
                            'translate(' + x + 'px)';
                    
                    // update the posiion attributes
                    target.setAttribute( 'data-x', x );
                    target.setAttribute( 'data-y', y );
                }
            } )
            .resizable( {
                preserveAspectRatio: true,
                edges              : { left: true, right: true, bottom: false, top: false },
                axis               : 'x',
                restrict           : {
                    restriction: "parent"
                }
            } )
            .on( 'resizemove', function ( event ) {
                var target = event.target,
                    x      = (parseFloat( target.getAttribute( 'data-x' ) ) || 0),
                    y      = (parseFloat( target.getAttribute( 'data-y' ) ) || 0);
                
                var parentWidth    = $( event.target ).parent().width()
                var width          = Math.min( event.rect.width, parentWidth )
                target.style.width = width + 'px';
                
                // translate when resizing from top or left edges
                x += Math.floor( event.deltaRect.left );
                y += Math.floor( event.deltaRect.top );
                x = (x < 0) ? 0 : x
                
                target.style.webkitTransform = target.style.transform =
                    // 'translate(' + x + 'px,' + y + 'px)';
                    'translate(' + x + 'px)';
                
                target.setAttribute( 'data-x', x );
                target.setAttribute( 'data-y', y );
                // target.textContent = Math.round( event.rect.width ) + '×' + Math.round( event.rect.height );
            } )
            .on( 'resizeend', function ( event ) {
                updateBand( event )
            } )
            .on( 'dragend', function ( event ) {
                updateBand( event )
            } )
        
        var updateBand = function ( event ) {
            var target      = event.target
            var parentWidth = $( event.target ).parent().width()
            var x           = (parseFloat( target.getAttribute( 'data-x' ) ) || 0)
            var y           = (parseFloat( target.getAttribute( 'data-y' ) ) || 0)
            // console.log( "parent width" + parentWidth )
            // console.log( $this.properties.min, $this.properties.max )
            // console.log( "scrollLeft: ", target.scrollLeft, "scrollWidth: ", target.scrollWidth )
            // console.log( "x: ", x, "y: ", y )
            // console.log( "event.dxx: ", event.dx, "event.dy: ", event.dy )
            var x1           = x * parentWidth / (parentWidth - 6)
            var scrollWidth1 = target.scrollWidth * parentWidth / (parentWidth - 6)
            // console.log( "x1: ", x1, "scrollWidth1: ", scrollWidth1 )
            var getValue     = function ( x ) {
                var percentage = ( x / parentWidth * 100 )
                var value      = (percentage * ($this.properties.max - $this.properties.min) / 100) + $this.properties.min
                return value
            }
            var minValue     = getValue( x1 )
            var maxValue     = getValue( x1 + scrollWidth1 )
            // console.log( "====== Min : " + minValue, " ==== Max : ", maxValue )
            
            var palette = $this.band.palette
            var from    = palette[ 0 ]
            from[ 0 ]   = minValue
            
            var to  = palette[ 1 ]
            to[ 0 ] = maxValue
            // console.log( $this.rasterOptions.layerOptions.layer )
        }
    }
}

RasterBand.prototype.updateHistogramOverlay = function () {
    var minValue = this.band.palette[ 0 ][ 0 ]
    var maxValue = this.band.palette[ 1 ][ 0 ]
    // console.log( minValue, maxValue )
    // console.log( this.properties.max, this.properties.min )
    // var pMin   = (minValue - this.properties.min) / this.properties.max * 100
    // var pMin   = minValue / this.properties.max * 100
    var pMin = (minValue - this.properties.min) / (this.properties.max - this.properties.min ) * 100
    // var pMax   = ( maxValue - this.properties.min ) / this.properties.max * 100
    // var pMax   = maxValue / this.properties.max * 100
    var pMax   = (maxValue - this.properties.min) / (this.properties.max - this.properties.min ) * 100
    var pWidth = pMax - pMin
    // console.log( pMin, pMax, pWidth )
    
    // var parentWidth = this.bandHistogramOverlayElem.parent().width() - 6
    var parentWidth = this.bandHistogramOverlayElem.parent().width()
    // console.log( parentWidth )
    
    // var x     = pMin * 100 / parentWidth
    var x     = parentWidth * pMin / 100
    // var width = pWidth * 100 / parentWidth
    var width = parentWidth * pWidth / 100
    
    var target = this.bandHistogramOverlayElem.get( 0 )
    
    target.style.webkitTransform =
        target.style.transform =
            'translate(' + x + 'px)'
    target.setAttribute( 'data-x', x )
    target.style.width = width + 'px'
}

var newInstance = function ( rasterOptions, container, band ) {
    return new RasterBand( rasterOptions, container, band )
}

module.exports = {
    newInstance: newInstance
}