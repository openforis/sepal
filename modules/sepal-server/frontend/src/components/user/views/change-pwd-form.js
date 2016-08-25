/**
 * @author Mino Togna
 */

var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form-validator/form-validator' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = $( form )
    FormNotify = Form.find( '.form-notify' )
    
    Form.submit( submit )
}

var submit = function ( e ) {
    e.preventDefault()
    
    var valid = validate()
    
    if ( valid ) {
        // submit
        var data = Form.serialize()
        EventBus.dispatch( Events.SECTION.USER.CHANGE_PASSWORD, null, data )
    }
}

var validate = function () {
    FormValidator.resetFormErrors( Form, FormNotify )
    
    var oldPassword = Form.find( '[name=old-password]' )
    var password    = Form.find( '[name=password]' )
    var password2   = Form.find( '[name=password2]' )
    
    var valid = false
    if ( FormValidator.validatePassword( oldPassword, 'Invalid old password', FormNotify ) ) {
        if ( FormValidator.validatePassword( password, 'Invalid new password', FormNotify ) ) {
            if ( FormValidator.validatePassword( password2, 'Invalid new password', FormNotify ) ) {
                if ( password.val() === password2.val() ) {
                    valid = true
                } else {
                    FormValidator.addError( password )
                    FormValidator.addError( password2 )
                    FormValidator.showError( FormNotify, 'New passwords must be the same' )
                }
            }
        }
    }
    return valid
}

var reset = function () {
    Form.trigger( 'reset' )
    FormValidator.resetFormErrors( Form, FormNotify )
}

module.exports = {
    init   : init
    , reset: reset
}