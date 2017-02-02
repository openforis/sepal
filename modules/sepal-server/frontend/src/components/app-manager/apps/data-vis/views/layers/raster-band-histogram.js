/**
 * @author Mino Togna
 */
var Chartist = require( 'chartist' )
var interact = require( 'interactjs' )

var RasterBandHistogram = function ( rasterBand ) {
    this.rasterBand = rasterBand
    
    // model
    this.histogram     = null
    this.histogramData = null
    
    // ui elements
    this.bandHistogram               = this.rasterBand.html.find( '.band-histogram' )
    this.bandHistogramOverlayElem    = this.rasterBand.html.find( '.band-minmax' ).hide()
    this.bandHistogramOverlay        = interact( this.bandHistogramOverlayElem.get( 0 ) )
    this.bandHistogramProgressLoader = this.rasterBand.html.find( '.band-histogram-progress-loader' )
    
    // init
    this.initHistogram()
    this.initHistogramOverlay()
}

RasterBandHistogram.prototype.initHistogram = function () {
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

RasterBandHistogram.prototype.setHistogramData = function ( data ) {
    this.histogramData = data
    
    if ( this.histogram ) {
        this.histogram.update( this.histogramData )
        this.bandHistogramOverlayElem.show()
        this.updateHistogramOverlay()
        
        if ( this.histogramData.series[ 0 ].length > 0 ) {
            this.bandHistogramOverlayElem.show()
        } else {
            this.bandHistogramOverlayElem.hide()
        }
    }
}

RasterBandHistogram.prototype.initHistogramOverlay = function () {
    var $this = this
    
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
            target.style.width = width + 'px'
            
            // translate when resizing from top or left edges
            x += Math.floor( event.deltaRect.left );
            y += Math.floor( event.deltaRect.top );
            x = (x < 0) ? 0 : x
            
            target.style.webkitTransform = target.style.transform =
                // 'translate(' + x + 'px,' + y + 'px)';
                'translate(' + x + 'px)';
            
            target.setAttribute( 'data-x', x );
            target.setAttribute( 'data-y', y );
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
        
        // var x1           = x * parentWidth / (parentWidth - 3)
        // var scrollWidth1 = target.scrollWidth * parentWidth / (parentWidth - 3)
        
        var getValue = function ( x ) {
            var percentage = ( x / parentWidth * 100 )
            var value      = (percentage * ($this.rasterBand.properties.max - $this.rasterBand.properties.min) / 100) + $this.rasterBand.properties.min
            return value
        }
        var minValue = getValue( x )
        var maxValue = getValue( x + target.scrollWidth )
        
        $this.rasterBand.inputMinValue.val( minValue )
        $this.rasterBand.inputMaxValue.val( maxValue )
        
        $this.rasterBand.band.palette[ 0 ][ 0 ] = minValue
        $this.rasterBand.band.palette[ 1 ][ 0 ] = maxValue
    }
}

RasterBandHistogram.prototype.updateHistogramOverlay = function () {
    var minValue = this.rasterBand.band.palette[ 0 ][ 0 ]
    var maxValue = this.rasterBand.band.palette[ 1 ][ 0 ]
    
    minValue = ( minValue < this.rasterBand.properties.min) ? this.rasterBand.properties.min : minValue
    maxValue = ( maxValue > this.rasterBand.properties.max) ? this.rasterBand.properties.max : maxValue
    
    var pMin   = (minValue - this.rasterBand.properties.min) / (this.rasterBand.properties.max - this.rasterBand.properties.min ) * 100
    var pMax   = (maxValue - this.rasterBand.properties.min) / (this.rasterBand.properties.max - this.rasterBand.properties.min ) * 100
    var pWidth = pMax - pMin
    
    var parentWidth = this.bandHistogramOverlayElem.parent().width()
    var x           = parentWidth * pMin / 100
    var width       = parentWidth * pWidth / 100
    
    var target = this.bandHistogramOverlayElem.get( 0 )
    
    target.style.webkitTransform =
        target.style.transform =
            'translate(' + x + 'px)'
    target.setAttribute( 'data-x', x )
    target.style.width = width + 'px'
}


var newInstance = function ( rasterBand ) {
    return new RasterBandHistogram( rasterBand )
}

module.exports = {
    newInstance: newInstance
}