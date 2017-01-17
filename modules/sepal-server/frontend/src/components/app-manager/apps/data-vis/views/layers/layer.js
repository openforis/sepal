/**
 * @author Mino Togna
 */
var EventBus           = require( '../../../../../event/event-bus' )
var Events             = require( '../../../../../event/events' )
var LayerOptionButtons = require( './layer-option-buttons' )
var LayerOptions       = require( './layer-options' )

var template = require( './layer.html' )
var html     = $( template( {} ) )

var LayerClass = function ( container, layer ) {
    var $this = this
    
    this.html = html.clone()
    this.html.data( 'id', layer.id )
    
    this.options = layer
    
    this.layerOptions       = LayerOptions.newInstance( this.html.find( '.layer-options' ), layer )
    this.layerOptionButtons = LayerOptionButtons.newInstance( this.html.find( '.layer-option-buttons' ), layer, this.layerOptions )
    
    var path = layer.path
    if ( path.indexOf( '/' ) > 0 ) {
        path = path.slice( path.lastIndexOf( '/' ) + 1 )
    }
    this.name = this.html.find( '.name' )
    this.name.html( path )
    this.name.mouseenter( function () {
        $this.layerOptionButtons.layerNameHover = true
        setTimeout( function () {
            $this.layerOptionButtons.show()
        }, 100 )
    } )
    this.name.mouseleave( function () {
        $this.layerOptionButtons.layerNameHover = false
        setTimeout( function () {
            $this.layerOptionButtons.hide()
        }, 100 )
    } )
    
    container.append( this.html )
    
    
    // init UI components
    // this.btnSort = this.html.find( '.btn-sort' )
    
    this.btnVisibility = this.html.find( '.btn-visibility' )
    this.btnVisibility.click( function () {
        if ( $this.btnVisibility.hasClass( 'active' ) ) {
            $this.hide()
        } else {
            $this.show()
        }
    } )
    
    
}

LayerClass.prototype.show = function () {
    var $this = this
    this.btnVisibility.find( '.icon-hidden' ).stop().fadeOut( 250, function () {
        $this.btnVisibility.find( '.icon-visible' ).fadeIn( 250 )
    } )
    this.btnVisibility.addClass( 'active' )
    EventBus.dispatch( Events.APPS.DATA_VIS.ADD_MAP_LAYER, null, this.options )
}

LayerClass.prototype.hide = function () {
    var $this = this
    this.btnVisibility.find( '.icon-visible' ).stop().fadeOut( 250, function () {
        $this.btnVisibility.find( '.icon-hidden' ).fadeIn()
    } )
    this.btnVisibility.removeClass( 'active' )
    EventBus.dispatch( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, null, this.options )
}

var newInstance = function ( container, layer ) {
    return new LayerClass( container, layer )
}

module.exports = {
    newInstance: newInstance
}