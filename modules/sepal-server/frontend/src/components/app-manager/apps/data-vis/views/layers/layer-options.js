/**
 * @author Mino Togna
 */
require( './layer-options.scss' )
var RasterOptions = require( './raster-options' )

var LayerOptions = function ( container, layer ) {
    var $this      = this
    this.container = container
    this.layer     = layer
    
    var btnClose = this.container.find( '.btn-close-options' )
    btnClose.click( function () {
        $this.hide()
    } )
    
    this.isShape       = false
    this.shapeOptions  = this.container.find( '.row-shape' )
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
        $( '#data-vis .layers-container' ).velocity( { width: '40%' } ,{duration : 400})
        
        $( "#data-vis .layer-options:visible" ).velocitySlideUp()
        this.container.velocitySlideDown({complete:function (  ) {
            console.log('complete')
            setTimeout(function (  ) {
                $(window).trigger('resize')
            } , 100)
        }})
    }
}

LayerOptions.prototype.isVisible = function () {
    return this.container.is( ':visible' )
}

LayerOptions.prototype.show = function () {
    this.deleteOptions.hide()
    if ( this.isShape ) this.shapeOptions.show()
    if ( this.isRaster ) this.showRasterOptions()
    
    this._show()
}

LayerOptions.prototype.hide = function () {
    if ( this.container.is( ':visible' ) ) {
        $( '#data-vis .layers-container' ).velocity( { width: '25%' } )
        this.container.velocitySlideUp()
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
    var $this = this
    
    //ui elements
    this.fillColorPicker   = this.container.find( '.row-fill-color .color-picker' )
    this.strokeColorPicker = this.container.find( '.row-stroke-color .color-picker' )
    this.strokeWidthInput  = this.container.find( '[name=stroke-width]' )
    this.btnSave           = this.container.find( '.btn-save' )
    
    // fill color
    this.fillColorPicker.colorpicker( {
        component: 'color-picker'
    } )
    this.fillColorPicker.on( 'changeColor', function ( e ) {
        var color = e.color.toString( 'rgba' )
        $this.fillColorPicker.find( 'i' ).css( 'background-color', color )
        
        $this.layer.fill_color = color
    } )
    
    if ( this.layer.fill_color ) {
        this.fillColorPicker.colorpicker( 'setValue', this.layer.fill_color )
    }
    
    // stroke color
    this.strokeColorPicker.colorpicker( {
        component: 'color-picker'
    } )
    this.strokeColorPicker.on( 'changeColor', function ( e ) {
        var color = e.color.toString( 'rgba' )
        $this.strokeColorPicker.find( 'i' ).css( 'background-color', color )
        
        $this.layer.stroke_color = color
    } )
    
    if ( this.layer.stroke_color ) {
        this.strokeColorPicker.colorpicker( 'setValue', this.layer.stroke_color )
    }
    
    // stroke width
    this.strokeWidthInput.change( function ( e ) {
        $this.layer.stroke_width = $this.strokeWidthInput.val()
    } )
    if ( this.layer.stroke_width ) {
        this.strokeWidthInput.val( this.layer.stroke_width )
    }
    
    // submit
    this.btnSave.click( function () {
        console.log( $this.layer )
    } )
}

LayerOptions.prototype.showRasterOptions = function () {
    this.rasterOptions.show()
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