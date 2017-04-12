/**
 * @author Mino Togna
 */

require( './users.scss' )

// var EventBus      = require( '../event/event-bus' )
// var Events        = require( '../event/events' )

var html = null

var ListSection               = require( './views/list-section' )
var InviteUserSection         = require( './views/invite-user-section' )
var EditUserSection           = require( './views/edit-user-section' )
var DeleteUserSection         = require( './views/delete-user-section' )
var SendInvitationUserSection = require( './views/send-invitation-user-section' )

var init = function () {
    var template = require( './users.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.users' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        ListSection.init( html.find( '.list-section' ) )
        InviteUserSection.init( html.find( '.invite-user-section' ) )
        EditUserSection.init( html.find( '.edit-user-section' ) )
        DeleteUserSection.init( html.find( '.delete-user-section' ) )
        SendInvitationUserSection.init( html.find( '.send-invitation-user-section' ) )
        
        showUsersListSection( { delay: 0, duration: 0 } )
    }
    
}

var selectUser = function ( user ) {
    ListSection.selectUser( user )
    EditUserSection.selectUser( user )
    DeleteUserSection.selectUser( user )
    SendInvitationUserSection.selectUser( user )
}

// ***********
//  Show Hide section methods
// ***********
var showSection = function ( elem, options ) {
    elem.velocitySlideDown( $.extend( {
        delay: 0, duration: 500, complete: function ( elements ) {
            $( elements ).css( 'height', '100%' )
        }
    }, options ) )
}

var hideSection = function ( elem, options ) {
    elem.velocitySlideUp( $.extend( {
        delay: 0, duration: 500, begin: function ( elements ) {
            $( elements ).css( 'height', '100%' )
        }
    }, options ) )
}

var showInviteUserSection = function () {
    InviteUserSection.reset()
    
    hideSection( ListSection.getContainer() )
    hideSection( EditUserSection.getContainer() )
    hideSection( DeleteUserSection.getContainer() )
    hideSection( SendInvitationUserSection.getContainer() )
    showSection( InviteUserSection.getContainer() )
}

var showUsersListSection = function ( options ) {
    hideSection( InviteUserSection.getContainer(), options )
    hideSection( EditUserSection.getContainer(), options )
    hideSection( DeleteUserSection.getContainer(), options )
    hideSection( SendInvitationUserSection.getContainer(), options )
    showSection( ListSection.getContainer(), options )
}

var showEditUserSection = function () {
    hideSection( InviteUserSection.getContainer() )
    hideSection( ListSection.getContainer() )
    hideSection( DeleteUserSection.getContainer() )
    hideSection( SendInvitationUserSection.getContainer() )
    showSection( EditUserSection.getContainer() )
}

var showDeleteUserSection = function () {
    hideSection( InviteUserSection.getContainer() )
    hideSection( ListSection.getContainer() )
    hideSection( EditUserSection.getContainer() )
    hideSection( SendInvitationUserSection.getContainer() )
    showSection( DeleteUserSection.getContainer() )
}

var showSendInvitationUserSection = function () {
    hideSection( InviteUserSection.getContainer() )
    hideSection( ListSection.getContainer() )
    hideSection( EditUserSection.getContainer() )
    hideSection( DeleteUserSection.getContainer() )
    showSection( SendInvitationUserSection.getContainer() )
}

module.exports = {
    init                           : init
    , setUsers                     : ListSection.setUsers
    , setAllUsers                  : ListSection.setAllUsers
    , selectUser                   : selectUser
    , showInviteUserSection        : showInviteUserSection
    , showUsersListSection         : showUsersListSection
    , showEditUserSection          : showEditUserSection
    , showDeleteUserSection        : showDeleteUserSection
    , showSendInvitationUserSection: showSendInvitationUserSection
}