/**
 * @author Mino Togna
 */

var FormUserInfo       = require( './edit-user-info-form' )
var FormUserPwd        = require( './edit-user-pwd-form' )
//Buttons
var BtnChangePwd       = null
var BtnCancelChangePwd = null

// current user
var User = null

var init = function ( editUserInfoForm, editUserPwdForm ) {
    FormUserInfo.init( editUserInfoForm )
    FormUserPwd.init( editUserPwdForm )
    
    editUserPwdForm.velocitySlideUp( { delay: 0, duration: 0 } )
    
    BtnChangePwd       = editUserInfoForm.find( '.btn-change-pwd' )
    BtnCancelChangePwd = editUserPwdForm.find( '.btn-cancel-change-pwd' )
    
    BtnChangePwd.click( function ( e ) {
        e.preventDefault()
        
        editUserInfoForm.velocitySlideUp()
        editUserPwdForm.velocitySlideDown()
    } )
    
    BtnCancelChangePwd.click( function ( e ) {
        e.preventDefault()
        
        FormUserPwd.reset()
        
        editUserPwdForm.velocitySlideUp()
        editUserInfoForm.velocitySlideDown()
    } )
    
}

var setUser = function ( user ) {
    User = user
    FormUserInfo.setUser( User )
}

var showEditUserDetailsForm = function () {
    FormUserInfo.setUser( User )
    BtnCancelChangePwd.click()
}

module.exports = {
    init                     : init
    , setUser                : setUser
    , showEditUserDetailsForm: showEditUserDetailsForm
}