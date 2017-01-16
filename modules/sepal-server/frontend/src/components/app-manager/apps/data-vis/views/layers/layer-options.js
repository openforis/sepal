/**
 * @author Mino Togna
 */
require( './layer-options.scss' )
// require( 'bootstrap-colorpicker' )

var LayerOptions = function ( container, layer ) {
    var $this      = this
    this.container = container
    this.layer     = layer
    
    var btnClose = this.container.find( '.btn-close-options' )
    btnClose.click( function () {
        $this.hide()
    } )
    
    if ( this.layer.path.endsWith( 'shp' ) ) {
        this.initShapeOptions()
    }
}

LayerOptions.prototype.show = function () {
    if ( !this.container.is( ':visible' ) ) {
        $( "#data-vis .layer-options:visible" ).velocitySlideUp()
        this.container.velocitySlideDown()
    }
}

LayerOptions.prototype.hide = function () {
    if ( this.container.is( ':visible' ) )
        this.container.velocitySlideUp()
}


LayerOptions.prototype.initShapeOptions = function () {
    this.shapeOptions = this.container.find( '.row-shape' )
    this.shapeOptions.show()
    
    // this.fillColorPicker = this.container.find( '.row-fill-color' )
    // this.fillColorPicker.colorpicker( {
    //     component: 'color-picker'
    // } )
    // this.fillColorPicker.on( 'changeColor', function () {
    //     console.log( arguments )
    // } )
}

var newInstance = function ( container, layer ) {
    return new LayerOptions( container, layer )
}

module.exports = {
    newInstance: newInstance
}