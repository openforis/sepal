/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container = null
var Form      = null

var selectedUser = null

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

var selectUser = function ( user ) {
    selectedUser = user
    
    updateForm()
}

var updateForm = function () {
    var id           = ''
    var name         = ''
    var username     = ''
    var email        = ''
    var organization = ''
    
    if ( selectedUser ) {
        id           = selectedUser.id
        name         = selectedUser.name
        username     = selectedUser.username
        email        = selectedUser.email
        organization = selectedUser.organization
    }
    
    Form.find( '[name=id]' ).val( id )
    Form.find( '[name=name]' ).val( name )
    Form.find( '[name=username]' ).val( username )
    // Form.find( '[name=password]' ).val( userDetails.password )
    Form.find( '[name=email]' ).val( email )
    Form.find( '[name=organization]' ).val( organization )
    
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}