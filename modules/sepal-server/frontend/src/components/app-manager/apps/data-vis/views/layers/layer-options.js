/**
 * @author Mino Togna
 */
require( './layer-options.scss' )
var ShapeOptions  = require( './shape-options' )
var RasterOptions = require( './raster-options' )

var LayerOptions = function ( container, layer ) {
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
        this.initShapeOptions()
    } else {
        this.isRaster = true
        this.initRasterOptions()
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
        
    } )
    
    this.btnRemoveNo = this.deleteOptions.find( '.btn-no' )
    this.btnRemoveNo.click( function () {
        $this.hide()
    } )
}

LayerOptions.prototype.initShapeOptions = function () {
    this.shapeOptions.data( 'ui', ShapeOptions.newInstance( this ) )
}

LayerOptions.prototype.showRasterOptions = function () {
    this.rasterOptions.show( 0 )
    var ui = this.rasterOptions.data( 'ui' )
    ui.update()
}
LayerOptions.prototype.initRasterOptions = function () {
    this.rasterOptions.data( 'ui', RasterOptions.newInstance( this ) )
}

var newInstance = function ( container, layer ) {
    return new LayerOptions( container, layer )
}

module.exports = {
    newInstance: newInstance
}