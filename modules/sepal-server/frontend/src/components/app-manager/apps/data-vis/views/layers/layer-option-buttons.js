/**
 * @author Mino Togna
 */
var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )

require( './layer-option-buttons.scss' )
var noUiSlider = require( 'nouislider' )
require( '../../../../../nouislider/nouislider.css' )

var LayerOptionButtons = function ( container, layer, layerOptions ) {
    var $this         = this
    this.layer        = layer
    this.layerOptions = layerOptions
    
    this.container      = container
    this.hover          = false
    this.layerNameHover = false
    
    // mouse enter and leave events
    this.container.mouseenter( function () {
        $this.hover = true
    } )
    this.container.mouseleave( function () {
        $this.hover = false
        setTimeout( function () {
            $this.hide()
        } )
    } )
    
    // opacity slider
    this.opacitySlider = this.container.find( '.opacity-slider' ).get( 0 )
    if ( !this.opacitySlider.hasOwnProperty( 'noUiSlider' ) ) {
        
        noUiSlider.create( this.opacitySlider, {
            start: [ 1 ],
            step : 0.05,
            range: {
                'min': [ 0 ],
                'max': [ 1 ]
            }
        }, true )
        
        this.opacitySlider.noUiSlider.on( 'change', function () {
            var opacity = $this.opacitySlider.noUiSlider.get()
            EventBus.dispatch( Events.APPS.DATA_VIS.MAP_LAYER_CHANGE_OPACITY, null, $this.layer.id, opacity )
        } )
        
    }
    
    // zoom button
    this.btnZoomTo = this.container.find( '.btn-zoom-to' )
    this.btnZoomTo.click( function () {
        EventBus.dispatch( Events.APPS.DATA_VIS.MAP_LAYER_ZOOM_TO, null, $this.layer.id )
    } )
    
    this.btnSettings = this.container.find( '.btn-settings' )
    this.btnSettings.click( function () {
        layerOptions.show()
    } )
    
    this.btnRemove = this.container.find( '.btn-remove' )
}

LayerOptionButtons.prototype.show = function () {
    this.container.stop().fadeIn( 100 )
}

LayerOptionButtons.prototype.hide = function () {
    if ( !(this.hover || this.layerNameHover ) ) {
        this.container.stop().fadeOut( 100 )
    }
}

var newInstance = function ( container, layer, layerOptions ) {
    return new LayerOptionButtons( container, layer, layerOptions )
}

module.exports = {
    newInstance: newInstance
}
