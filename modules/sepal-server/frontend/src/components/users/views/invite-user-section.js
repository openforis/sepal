/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )

var Container = null
var Form      = null

var init = function ( container ) {
    Container = $( container )
    Form      = Container.find( 'form' )
    
    initForm()
}

var initForm = function () {
    Form.submit( submitForm )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        FormUtils.resetForm( Form )
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
}

var submitForm = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    
    if ( valid ) {
        // submit
        var data = Form.serialize()
    }
}

var getContainer = function () {
    return Container
}

module.exports = {
    init          : init
    , getContainer: getContainer
}