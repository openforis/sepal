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
        
        $this.layer.fillColor = color
    } )
    
    if ( this.layer.fillColor ) {
        this.fillColorPicker.colorpicker( 'setValue', this.layer.fillColor )
    }
    
    // stroke color
    this.strokeColorPicker.colorpicker( {
        component: 'color-picker'
    } )
    this.strokeColorPicker.on( 'changeColor', function ( e ) {
        var color = e.color.toString( 'rgba' )
        $this.strokeColorPicker.find( 'i' ).css( 'background-color', color )
        
        $this.layer.strokeColor = color
    } )
    
    if ( this.layer.strokeColor ) {
        this.strokeColorPicker.colorpicker( 'setValue', this.layer.strokeColor )
    }
    
    // stroke width
    this.strokeWidthInput.change( function ( e ) {
        $this.layer.strokeWidth = $this.strokeWidthInput.val()
    } )
    if ( this.layer.strokeWidth ) {
        this.strokeWidthInput.val( this.layer.strokeWidth )
    }
    
    // submit
    this.btnSave.click( function () {
        $this.save()
    } )
}

ShapeOptions.prototype.save = function () {
    var $this  = this
    var params = {
        url         : '/sandbox/geo-web-viz/shape/save'
        , data      : { 'layer': JSON.stringify( this.layer ) }
        , beforeSend: function () {
            $this.btnSave.disable()
            Loader.show()
        }
        , success   : function ( response ) {
            Loader.hide( { delay: 300 } )
            // console.log( response )
            EventBus.dispatch( Events.ALERT.SHOW_INFO, null, "Layer settings successfully saved" )
            setTimeout( function () {
                $this.btnSave.enable()
            }, 1000 )
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