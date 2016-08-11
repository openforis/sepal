/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

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
    
    updateActionButtons()
}

var updateActionButtons = function () {
    if ( selectedUser ) {
        BtnEdit.enable()
        BtnRemove.enable()
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