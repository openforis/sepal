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
    
    initForm()
}

var initForm = function () {
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        FormValidator.resetFormErrors( Form, FormNotify )
        
        var name         = Form.find( '[name=name]' )
        var username     = Form.find( '[name=username]' )
        var password     = Form.find( '[name=password]' )
        var email        = Form.find( '[name=email]' )
        var organization = Form.find( '[name=organization]' )
        
        var valid = false
        if ( FormValidator.validateString( name, 'Name cannot be empty', FormNotify ) ) {
            if ( FormValidator.validateString( username, 'Username cannot be empty', FormNotify ) ) {
                if ( FormValidator.validateEmail( email, 'Email is not valid', FormNotify ) ) {
                    if ( FormValidator.validateString( organization, 'Organization cannot be empty', FormNotify ) ) {
                        valid = true
                    }
                }
            }
        }
        
        if ( valid ) {
            var data = Form.serialize()
            EventBus.dispatch( Events.SECTION.USER.SAVE_USER_DETAILS, null, data )
        }
        
    } )
}


var setUserDetails = function ( userDetails ) {
    FormValidator.resetFormErrors( Form, FormNotify )
    
    Form.find( '[name=name]' ).val( userDetails.name )
    Form.find( '[name=username]' ).val( userDetails.username )
    Form.find( '[name=password]' ).val( userDetails.password )
    Form.find( '[name=email]' ).val( userDetails.email )
    Form.find( '[name=organization]' ).val( userDetails.organization )
}

module.exports = {
    init            : init
    , setUserDetails: setUserDetails
}