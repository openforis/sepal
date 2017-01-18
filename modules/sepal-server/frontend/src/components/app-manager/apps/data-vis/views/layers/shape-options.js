/**
 * @author Mino Togna
 */

var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )
var Loader   = require( '../../../../../loader/loader' )

var ShapeOptions = function ( layerOptions ) {
    var $this = this
    
    this.layerOptions = layerOptions
    this.layer        = this.layerOptions.layer
    this.container    = this.layerOptions.shapeOptions
    
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
        $this.save()
    } )
}

ShapeOptions.prototype.save = function () {
    var params = {
        url         : '/sandbox/geo-web-viz/shape/save'
        , data      : { 'layer': JSON.stringify( this.layer ) }
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            Loader.hide()
            console.log( response )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var newInstance = function ( layerOptions ) {
    return new ShapeOptions( layerOptions )
}

module.exports = {
    newInstance: newInstance
}