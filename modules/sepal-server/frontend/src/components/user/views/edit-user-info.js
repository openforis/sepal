/**
 * @author Mino Togna
 */

var UserDetailsForm    = require( './user-details-form' )
var ChangePwdForm      = require( './change-pwd-form' )
//Buttons
var BtnChangePwd       = null
var BtnCancelChangePwd = null

// current user
var User = null

var init = function ( userDetailsForm, changePwdForm ) {
    UserDetailsForm.init( userDetailsForm )
    ChangePwdForm.init( changePwdForm )
    
    changePwdForm.velocitySlideUp( { delay: 0, duration: 0 } )
    
    BtnChangePwd       = userDetailsForm.find( '.btn-change-pwd' )
    BtnCancelChangePwd = changePwdForm.find( '.btn-cancel-change-pwd' )
    
    BtnChangePwd.click( function ( e ) {
        e.preventDefault()
        userDetailsForm.velocitySlideUp()
        changePwdForm.velocitySlideDown()
    } )
    
    BtnCancelChangePwd.click( function ( e ) {
        e.preventDefault()
        changePwdForm.velocitySlideUp()
        userDetailsForm.velocitySlideDown()
    } )
}

var setUser = function ( user ) {
    User = user
    UserDetailsForm.setUserDetails( User )
}

var showEditUserDetailsForm = function () {
    UserDetailsForm.setUserDetails( User )
    ChangePwdForm.reset()
    BtnCancelChangePwd.click()
}

module.exports = {
    init                     : init
    , setUser                : setUser
    , showEditUserDetailsForm: showEditUserDetailsForm
}