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
    var $this        = this
    this.initialized = false
    
    this.html = html.clone()
    this.html.data( 'layer-id', layer.id )
    
    this.options         = layer
    this.options.visible = false
    
    var name = layer.path
    if ( name.indexOf( '/' ) >= 0 ) {
        name = name.slice( name.lastIndexOf( '/' ) + 1 )
    }
    
    this.name = this.html.find( '.name' )
    this.name.html( name )
    
    
    this.html.insertAfter( container )
    
    
    // init UI components
    this.btnVisibility = this.html.find( '.btn-visibility' )
    this.btnVisibility.click( function () {
        if ( $this.btnVisibility.hasClass( 'active' ) ) {
            $this.hide()
        } else {
            $this.show()
        }
    } )
    
    this.btnSort = this.html.find( '.btn-sort' )
    
    // init ui properties
    this.layerOptions       = LayerOptions.newInstance( this.html.find( '.layer-options' ), this, function () {
        $this.show()
    } )
    this.layerOptionButtons = LayerOptionButtons.newInstance( this.html.find( '.layer-option-buttons' ), this.options, this.layerOptions )
    
    this.btnVisibility.hide()
    this.btnSort.hide()
}

LayerClass.prototype.init = function () {
    if ( !this.initialized ) {
        var $this = this
        
        this.btnVisibility.fadeIn()
        this.btnSort.fadeIn()
        
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
        
        this.html.find( '.layer-progress-loader' ).hide()
        
        this.initialized = true
    }
}

LayerClass.prototype.show = function () {
    this.init()
    
    var $this = this
    if ( !this.options.visible ) {
        this.options.visible = true
        
        this.btnVisibility.find( '.icon-hidden' ).stop().fadeOut( 250, function () {
            $this.btnVisibility.find( '.icon-visible' ).stop().fadeIn( 250 )
        } )
        this.btnVisibility.addClass( 'active' )
    }
    
    EventBus.dispatch( Events.APPS.DATA_VIS.ADD_MAP_LAYER, null, this.options )
}

LayerClass.prototype.hide = function () {
    var $this = this
    if ( this.options.visible ) {
        
        this.options.visible = false
        
        this.btnVisibility.find( '.icon-visible' ).stop().fadeOut( 250, function () {
            $this.btnVisibility.find( '.icon-hidden' ).fadeIn()
        } )
        this.btnVisibility.removeClass( 'active' )
    }
    
    EventBus.dispatch( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, null, this.options )
}

LayerClass.prototype.delete = function () {
    this.html.remove()
}

var newInstance = function ( container, layer ) {
    return new LayerClass( container, layer )
}

module.exports = {
    newInstance: newInstance
}