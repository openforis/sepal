/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserMV   = require( '../../user/user-mv' )

var Container   = null
var SearchInput = null
var BtnInvite   = null
var BtnRemove   = null
var BtnEdit     = null

var selectedUser = null

var init = function ( container ) {
    Container = container
    
    SearchInput = Container.find( 'input[name=search]' )
    BtnInvite   = Container.find( '.btn-invite' )
    BtnRemove   = Container.find( '.btn-remove' )
    BtnEdit     = Container.find( '.btn-edit' )
    
    SearchInput.keyup( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.LIST_FILTER_CHANGE, null, SearchInput.val() )
    } )
    
    BtnInvite.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_INVITE_USER )
    } )
    
    BtnEdit.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_EDIT_USER )
    } )
    
    BtnRemove.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_DELETE_USER )
    } )
    
    updateActionButtons()
}

var updateActionButtons = function () {
    if ( selectedUser ) {
        BtnEdit.enable()
        if ( UserMV.getCurrentUser().id !== selectedUser.id ) {
            BtnRemove.enable()
        } else {
            BtnRemove.disable()
        }
    } else {
        BtnEdit.disable()
        BtnRemove.disable()
    }
}

var selectUser = function ( user ) {
    selectedUser = user
    updateActionButtons()
}

module.exports = {
    init        : init
    , selectUser: selectUser
}