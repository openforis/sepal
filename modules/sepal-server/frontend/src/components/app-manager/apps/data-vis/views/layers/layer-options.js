/**
 * @author Mino Togna
 */
require( './layer-options.scss' )
var EventBus      = require( '../../../../../event/event-bus' )
var Events        = require( '../../../../../event/events' )
var ShapeOptions  = require( './shape-options' )
var RasterOptions = require( './raster-options' )

var LayerOptions = function ( container, layer, onReady ) {
    var $this      = this
    this.container = container
    this.layer     = layer
    
    var btnClose = this.container.find( '.btn-close-options' )
    btnClose.click( function () {
        $this.hide()
    } )
    
    this.isShape      = false
    this.shapeOptions = this.container.find( '.row-shape' )
    
    this.isRaster      = false
    this.rasterOptions = this.container.find( '.row-raster' )
    
    this.deleteOptions = this.container.find( '.row-remove-layer' )
    this.initRemoveOptions()
    
    
    if ( this.layer.path.endsWith( 'shp' ) ) {
        this.isShape = true
        this.initShapeOptions( onReady )
    } else {
        this.isRaster = true
        this.initRasterOptions( onReady )
    }
}

LayerOptions.prototype._show = function () {
    if ( !this.isVisible() ) {
        var $this = this
        $( '#data-vis .layers-container' ).velocity( { width: '40%' }, { duration: 400 } )
        
        var visibleOptions = $( "#data-vis .layer-options:visible" )
        visibleOptions.velocitySlideUp()
        visibleOptions.closest( ".row-layer" ).removeClass( 'expanded' )
        
        this.container.velocitySlideDown( {
            height: 'auto', complete: function () {
                
            }
        } )
        $this.container.closest( '.row-layer' ).addClass( 'expanded' )
    }
}

LayerOptions.prototype.isVisible = function () {
    return this.container.is( ':visible' )
}

LayerOptions.prototype.show = function () {
    this.deleteOptions.hide( 0 )
    if ( this.isShape ) this.shapeOptions.show( 0 )
    if ( this.isRaster ) this.showRasterOptions()
    
    this._show()
}

LayerOptions.prototype.hide = function () {
    if ( this.container.is( ':visible' ) ) {
        $( '#data-vis .layers-container' ).velocity( { width: '25%' } )
        this.container.velocitySlideUp()
        this.container.closest( '.row-layer' ).removeClass( 'expanded' )
    }
}

LayerOptions.prototype.showRemove = function () {
    this.shapeOptions.hide()
    this.rasterOptions.hide()
    this.deleteOptions.show()
    
    this._show()
}

LayerOptions.prototype.initRemoveOptions = function () {
    var $this         = this
    this.btnRemoveYes = this.deleteOptions.find( '.btn-yes' )
    this.btnRemoveYes.click( function () {
        EventBus.dispatch( Events.APPS.DATA_VIS.LAYER_DELETE, null, $this.layer.id )
    } )
    
    this.btnRemoveNo = this.deleteOptions.find( '.btn-no' )
    this.btnRemoveNo.click( function () {
        $this.hide()
    } )
}

LayerOptions.prototype.initShapeOptions = function ( onReady ) {
    this.shapeOptions.data( 'ui', ShapeOptions.newInstance( this, onReady ) )
}

LayerOptions.prototype.showRasterOptions = function () {
    this.rasterOptions.show( 0 )
    var ui = this.rasterOptions.data( 'ui' )
    ui.update()
}
LayerOptions.prototype.initRasterOptions = function ( onReady ) {
    this.rasterOptions.data( 'ui', RasterOptions.newInstance( this, onReady ) )
}

var newInstance = function ( container, layer, onReady ) {
    return new LayerOptions( container, layer, onReady )
}

module.exports = {
    newInstance: newInstance
}