/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var Form       = null
var FormNotify = null

var init       = function ( form ) {
    Form       = $( form )
    FormNotify = Form.find( '.form-notify' )
    initForm()
}


var initForm = function () {
    
    var showError = function ( message ) {
        // formNotify.html( message )
        FormNotify.velocitySlideDown( {
            delay: 0, duration: 500, begin: function () {
                FormNotify.html( message )
            }
        } )
    }
    
    var validString = function ( field, message ) {
        if ( $.isEmptyString( field.val() ) ) {
            field.closest( '.form-group' ).addClass( 'error' )
            showError( message )
            return false
        }
        return true
    }
    var validEmail  = function ( field ) {
        var re = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i
        
        if ( !re.test( field.val() ) ) {
            field.closest( '.form-group' ).addClass( 'error' )
            showError( "Email is not valid" )
            return false
        }
        return true
    }
    
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        resetFormErrors()
        
        var name         = Form.find( '[name=name]' )
        var username     = Form.find( '[name=username]' )
        var password     = Form.find( '[name=password]' )
        var email        = Form.find( '[name=email]' )
        var organization = Form.find( '[name=organization]' )
        
        var valid = false
        if ( validString( name, 'Name cannot be empty' ) ) {
            if ( validString( username, 'Username cannot be empty' ) ) {
                if ( validString( password, 'Password cannot be empty' ) ) {
                    if ( validString( email, 'Email cannot be empty' ) ) {
                        if ( validEmail( email ) ) {
                            if ( validString( organization, 'Organization cannot be empty' ) ) {
                                valid = true
                            }
                        }
                    }
                }
            }
        }
        
        if ( valid ) {
            // submit
            var data = Form.serialize()
            EventBus.dispatch( Events.SECTION.USER.SAVE_USER_DETAILS, null, data )
        }
        
    } )
}


var setUserDetails = function ( userDetails ) {
    resetFormErrors()
    
    Form.find( '[name=name]' ).val( userDetails.name )
    Form.find( '[name=username]' ).val( userDetails.username )
    Form.find( '[name=password]' ).val( userDetails.password )
    Form.find( '[name=email]' ).val( userDetails.email )
    Form.find( '[name=organization]' ).val( userDetails.organization )
}

var resetFormErrors = function () {
    FormNotify.velocitySlideUp( { delay: 0, duration: 100 } )
    Form.find( '.form-group' ).removeClass( 'error' )
}

module.exports = {
    init            : init
    , setUserDetails: setUserDetails
}