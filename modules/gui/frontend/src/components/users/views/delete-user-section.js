/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var Loader        = require( '../../loader/loader' )
var FormValidator = require( '../../form/form-validator' )

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
    
    Form.submit( submit )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
}

var submit = function ( e ) {
    e.preventDefault()
    
    var params = {
        url         : '/user/delete'
        , data      : { username: selectedUser.username }
        , beforeSend: function () {
            Loader.show()
        }
        , success   : function ( response ) {
            Loader.hide( { delay: 200 } )
            
            FormValidator.showSuccess( Form.find( '.form-notify' ), "User deleted" )
            
            setTimeout( function () {
                EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
            }, 1600 )
        }
        
    }
    
    EventBus.dispatch( Events.AJAX.POST, this, params )
    
}

var getContainer = function () {
    return Container
}

var selectUser = function ( user ) {
    selectedUser = user
    FormValidator.resetFormErrors( Form )
    
    var userLabel = ''
    if ( user ) {
        userLabel = user.name + ' ( ' + user.username + ' ) ?'
    }
    UserLabel.html( userLabel )
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}