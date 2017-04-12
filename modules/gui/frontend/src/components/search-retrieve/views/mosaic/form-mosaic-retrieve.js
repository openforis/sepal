/**
 * @author Mino Togna
 */
require( './form-mosaic-retrieve.scss' )

var EventBus      = require( '../../../event/event-bus' )
var Events        = require( '../../../event/events' )
var FormValidator = require( '../../../form/form-validator' )
var BudgetCheck   = require( '../../../budget-check/budget-check' )

var parentContainer = null
var template        = require( './form-mosaic-retrieve.html' )
var html            = $( template( {} ) )

var rowLandsat   = null
var rowSentinel2 = null
var form         = null
var formNotify   = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.mosaic-retrieve' )
    container.append( html )
    
    rowLandsat   = html.find( '.row-landsat' )
    rowSentinel2 = html.find( '.row-sentinel2' )
    form         = html.find( 'form' )
    formNotify   = html.find( '.form-notify' )
    
    container.find( '.btn-band' ).click( function ( e ) {
        e.preventDefault()
        $( this ).toggleClass( 'active' )
    } )
    
    rowLandsat.find( '.btn-submit' ).click( function ( e ) {
        e.preventDefault()
        submit( rowLandsat, Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_LANDSAT_MOSAIC )
    } )
    
    rowSentinel2.find( '.btn-submit' ).click( function ( e ) {
        e.preventDefault()
        submit( rowSentinel2, Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SENTINEL2_MOSAIC )
    } )
}

var submit = function ( section, evt ) {
    FormValidator.resetFormErrors( form )
    
    var valid = FormValidator.validateForm( form, section.find( '[name=name]' ) )
    
    if ( valid ) {
        var bands = getBands( section )
        
        if ( bands.length <= 0 ) {
            FormValidator.showError( formNotify, 'At least one band must be selected' )
        } else {
            var name = section.find( 'input[name=name]' ).val()
            EventBus.dispatch( evt, null, bands.join( ',' ), name )
        }
    }
    
}

var getBands = function ( section ) {
    var bands = []
    section.find( '.btn-band.active' ).each( function () {
        var value = $( this ).val()
        bands.push( value )
    } )
    return bands
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    options = $.extend( {}, {
        begin: function ( elements ) {
            BudgetCheck.check( html )
        }
    }, options )
    parentContainer.velocitySlideToggle( options )
}

var reset = function () {
    FormValidator.resetFormErrors( form )
    
    form.find( '.btn-band' ).removeClass( 'active' )
    form.find( 'input' ).val( '' )
}

var setSelectedScenesNumber = function ( landsatNoScenes, sentinel2NoScenes ) {
    if ( landsatNoScenes > 0 )
        rowLandsat.show()
    else
        rowLandsat.hide()
    
    if ( sentinel2NoScenes > 0 )
        rowSentinel2.show()
    else
        rowSentinel2.hide()
}

module.exports = {
    init                     : init
    , hide                   : hide
    , toggleVisibility       : toggleVisibility
    , reset                  : reset
    , setSelectedScenesNumber: setSelectedScenesNumber
}