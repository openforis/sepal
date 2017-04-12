/**
 * @author Mino Togna
 */

var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )
var Loader   = require( '../../../../../loader/loader' )

var ShapeOptions = function ( layerOptions, onReady ) {
    var $this = this
    
    this.layerOptions = layerOptions
    this.layer        = $.extend( true, {}, this.layerOptions.layer )
    // $this.layerOptions.layer = $.extend( true, {}, $this.layer )
    this.container    = this.layerOptions.shapeOptions
    
    //ui elements
    this.fillColorPicker   = this.container.find( '.row-fill-color .color-picker' )
    this.strokeColorPicker = this.container.find( '.row-stroke-color .color-picker' )
    this.strokeWidthInput  = this.container.find( '[name=stroke-width]' )
    this.btnSave           = this.container.find( '.btn-save' )
    
    if ( this.layer.bounds ) {
        this.init()
        onReady()
    } else {
        // new layer to be added - set default values
        this.layer.fillColor   = "#709cff"
        this.layer.strokeColor = "#FFFFFF"
        this.layer.strokeWidth = 0.5
        
        this.btnSave.disable()
        this.save( function ( response ) {
            $this.layer.bounds = response.bounds
            $this.init()
            onReady()
        } )
    }
}

ShapeOptions.prototype.init = function () {
    var $this = this
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

ShapeOptions.prototype.update = function () {
    this.layer = $.extend( true, {}, this.layerOptions.layer )
    
    if ( this.layer.fillColor ) {
        this.fillColorPicker.colorpicker( 'setValue', this.layer.fillColor )
    }
    if ( this.layer.strokeColor ) {
        this.strokeColorPicker.colorpicker( 'setValue', this.layer.strokeColor )
    }
    if ( this.layer.strokeWidth ) {
        this.strokeWidthInput.val( this.layer.strokeWidth )
    }
}

ShapeOptions.prototype.save = function ( callback ) {
    var $this  = this
    var params = {
        url         : '/sandbox/geo-web-viz/shape/save'
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
            
            setTimeout( function () {
                $this.btnSave.enable()
            }, 1000 )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, null, params )
}

var newInstance = function ( layerOptions, onReady ) {
    return new ShapeOptions( layerOptions, onReady )
}

module.exports = {
    newInstance: newInstance
}