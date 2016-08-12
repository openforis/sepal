/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container = null
var Form      = null

var init = function ( container ) {
    Container = $( container )
    Form      = Container.find( 'form' )
    
    initForm()
}

var initForm = function () {
    Form.submit( function ( e ) {
        e.preventDefault()
    } )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
}

var getContainer = function () {
    return Container
}

module.exports = {
    init          : init
    , getContainer: getContainer
}