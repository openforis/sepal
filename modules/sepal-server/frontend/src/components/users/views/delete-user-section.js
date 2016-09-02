/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container = null
var Form      = null
var UserLabel = null

var selectedUser = null

var init = function ( container ) {
    Container = $( container )
    initForm()
}

var initForm = function () {
    Form      = Container.find( 'form' )
    UserLabel = Form.find( '.user-label' )
    
    Form.submit( function ( e ) {
        e.preventDefault()
        console.log( selectedUser )
    } )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
}

var getContainer = function () {
    return Container
}

var selectUser = function ( user ) {
    selectedUser = user
    
    var userLabel = ''
    if ( user ) {
        userLabel = user.name + ' ( ' + user.username + ' )'
    }
    UserLabel.html( userLabel )
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}