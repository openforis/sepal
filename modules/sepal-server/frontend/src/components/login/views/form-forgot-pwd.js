/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form-validator/form-validator' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = form
    FormNotify = form.find( '.form-notify' )
    
    bindEvents()
}

var bindEvents = function () {
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        FormValidator.resetFormErrors( Form, FormNotify )
        
        var email = Form.find( '[name=email]' )
        var valid = FormValidator.validateEmail( email, 'Invalid email', FormNotify )
        
        if ( valid ) {
            
            var params = {
                url      : '/api/user/forgot-password'
                , method : 'POST'
                , data   : Form.serialize()
                , success: function ( response ) {
                    console.log( response )
                }
                
            }
            
            EventBus.dispatch( Events.AJAX.REQUEST, this, params )
        }
    } )
    
}

var show = function ( opts ) {
    Form.velocitySlideDown( opts )
}

var hide = function ( opts ) {
    Form.velocitySlideUp( opts )
}

module.exports = {
    init  : init
    , show: show
    , hide: hide
}