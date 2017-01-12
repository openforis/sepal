/**
 * @author Mino Togna
 */
var EventBus = require( '../../../../event/event-bus' )
var Events   = require( '../../../../event/events' )
var template = require( './layer.html' )
var html     = $( template( {} ) )


var LayerClass = function ( container, layer ) {
    this.html    = html.clone()
    this.options = layer
    
    var path = layer.path
    if ( path.indexOf( '/' ) > 0 ) {
        path = path.slice( path.lastIndexOf( '/' ) + 1 )
    }
    this.html.find( '.name' ).html( path )
    
    container.append( this.html )
    
    var $this = this
    
    // init UI components
    this.btnSort = this.html.find( '.btn-sort' )
    
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
    this.btnVisibility.addClass( 'active' )
    EventBus.dispatch( Events.APPS.DATA_VIS.ADD_MAP_LAYER, null, this.options )
}

LayerClass.prototype.hide = function () {
    this.btnVisibility.removeClass( 'active' )
    EventBus.dispatch( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, null, this.options )
}

var newInstance = function ( container, layer ) {
    return new LayerClass( container, layer )
}

module.exports = {
    newInstance: newInstance
}