/**
 * @author Mino Togna
 */
require( './form-mosaic-preview.scss' )
var EventBus      = require( '../../../event/event-bus' )
var Events        = require( '../../../event/events' )
var FormValidator = require( '../../../form/form-validator' )

require( 'devbridge-autocomplete' )

var parentContainer = null
var template        = require( './form-mosaic-preview.html' )
var html            = $( template( {} ) )

var formNotify = null

var rowLandsat           = null
var btnSubmitLandsat     = null
var landsatBands         = require( './bands-landsat.js' )
var landsatSelectedBands = null

var rowSentinel2           = null
var btnSubmitSentinel2     = null
var sentinel2Bands         = require( './bands-sentinel2.js' )
var sentinel2SelectedBands = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.mosaic-preview' )
    container.append( html )
    
    formNotify         = html.find( '.form-notify' )
    rowLandsat         = html.find( '.row-landsat' )
    rowSentinel2       = html.find( '.row-sentinel2' )
    btnSubmitLandsat   = html.find( '.btn-submit-landsat' )
    btnSubmitSentinel2 = html.find( '.btn-submit-sentinel2' )
    
    var landsatBandsInput = html.find( 'input[name=bands-landsat]' )
    landsatBandsInput.sepalAutocomplete( {
        lookup    : landsatBands
        , onChange: function ( selection ) {
            landsatSelectedBands = (selection) ? selection.data : null
        }
    } )
    
    //landsat
    btnSubmitLandsat.click( function ( e ) {
        e.preventDefault()
        FormValidator.resetFormErrors( html )
        
        if ( landsatSelectedBands ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_LANDSAT_MOSAIC, null, landsatSelectedBands )
        } else {
            FormValidator.addError( landsatBandsInput )
            formNotify.html( 'A valid band must be selected' ).velocitySlideDown( { delay: 20, duration: 400 } )
        }
    } )
    
    //sentinel2
    var sentinel2BandsInput = html.find( 'input[name=bands-sentinel2]' )
    sentinel2BandsInput.sepalAutocomplete( {
        lookup    : sentinel2Bands
        , onChange: function ( selection ) {
            sentinel2SelectedBands = (selection) ? selection.data : null
        }
    } )
    
    btnSubmitSentinel2.click( function ( e ) {
        e.preventDefault()
        FormValidator.resetFormErrors( html )
        
        if ( sentinel2SelectedBands ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_SENTINEL2_MOSAIC, null, sentinel2SelectedBands )
        } else {
            FormValidator.addError( sentinel2BandsInput )
            formNotify.html( 'A valid band must be selected' ).velocitySlideDown( { delay: 20, duration: 400 } )
        }
    } )
    
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    parentContainer.velocitySlideToggle( options )
}

var reset = function () {
    FormValidator.resetFormErrors( html )
    
    landsatSelectedBands = null
    html.find( 'input[name=bands-landsat]' ).val( '' )
    
    sentinel2SelectedBands = null
    html.find( '.btn-submit-sentinel2' ).val( '' )
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