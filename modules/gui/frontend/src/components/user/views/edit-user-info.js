/**
 * @author Mino Togna
 */

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var FormUserInfo             = require( './edit-user-info-form' )
var FormUserPwd              = require( './edit-user-pwd-form' )
//Buttons
var BtnChangePwd             = null
var BtnCancelChangePwd       = null
var BtnUseMyGoogleAccount    = null
var BtnUseSepalGoogleAccount = null

// current user
var User = null

var init = function ( editUserInfoForm, editUserPwdForm ) {
    FormUserInfo.init( editUserInfoForm )
    FormUserPwd.init( editUserPwdForm )
    
    editUserPwdForm.velocitySlideUp( { delay: 0, duration: 0 } )
    
    BtnChangePwd              = editUserInfoForm.find( '.btn-change-pwd' )
    BtnCancelChangePwd        = editUserPwdForm.find( '.btn-cancel-change-pwd' )
    BtnUseMyGoogleAccount     = editUserInfoForm.find( '.btn-use-my-google-account' )
    BtnUseSepalGoogleAccount  = editUserInfoForm.find( '.btn-use-sepal-google-account' )
    
    
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
    
    BtnUseMyGoogleAccount.click( function ( e ) {
        var params = {
            url      : '/user/google/access-request-url?destinationUrl=https://' + window.location.hostname
            , success: function ( response ) {
                window.location = response.url
            }
        }
        EventBus.dispatch( Events.AJAX.GET, null, params )
    } )
    
    BtnUseSepalGoogleAccount.click( function ( e ) {
        var params = {
            url      : '/user/google/revoke-access'
            , success: function ( response ) {
                BtnUseSepalGoogleAccount.hide()
                BtnUseMyGoogleAccount.show()
            }
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
    } )
}

var setUser = function ( user ) {
    User = user
    FormUserInfo.setUser( User )
    if ( user.googleTokens ) {
        BtnUseMyGoogleAccount.hide()
        BtnUseSepalGoogleAccount.show()
    } else {
        BtnUseSepalGoogleAccount.hide()
        BtnUseMyGoogleAccount.show()
    }
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