/**
 * @author Mino Togna
 */
require( './user.scss' )

var EditUserInfo      = require( './views/edit-user-info' )
var UserSandboxReport = require( './views/sandbox-report' )

var template = require( './user.html' )
var html     = $( template( {} ) )

var init = function () {
    var appSection = $( '#app-section' ).find( '.user' )
    
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        UserSandboxReport.init( html.find( '.resources' ), html.find( '.sessions' ) )
        EditUserInfo.init( html.find( '#user-detail-form' ), html.find( '#change-pwd-form' ) )
    }
    
}

var setUser = function ( user ) {
    EditUserInfo.setUser( user )
    
    UserSandboxReport.setSessions( user.getSessions() )
    UserSandboxReport.setSpending( user.getSpending() )
}

module.exports = {
    init                     : init
    , setUser                : setUser
    , showEditUserDetailsForm: EditUserInfo.showEditUserDetailsForm
}