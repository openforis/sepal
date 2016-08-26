/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = $( form )
    FormNotify = Form.find( '.form-notify' )
    
    Form.submit( submit )
}

var submit = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    
    if ( valid ) {
        var data = Form.serialize()
        EventBus.dispatch( Events.SECTION.USER.SAVE_USER_DETAILS, null, data )
    }
    
}


var setUser = function ( user ) {
    FormValidator.resetFormErrors( Form, FormNotify )
    FormUtils.populateForm( Form, user )
}

module.exports = {
    init     : init
    , setUser: setUser
}