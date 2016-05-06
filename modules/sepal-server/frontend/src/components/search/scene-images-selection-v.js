/**
 * @author Mino Togna
 */
require( './scene-images-selection.css' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )

var template = require( './scene-images-selection.html' )
var html     = $( template( {} ) )

var section                       = null
// section for selecting images
var selectionSection              = null
var imagesSelectionSection        = null
var imageSelectionSection         = null
var expandedImageSelectionSection = null
// section of selected images
var selectedSection               = null
var selectedSectionHeader         = null
var selectedSectionTableHeader    = null
var selectedSectionTableContent   = null
var selectedSectionTableRow       = null

var init = function () {
    
    var appSection = $( '#app-section' ).find( '.scene-images-selection' )
    if ( appSection.children().length <= 0 ) {
        var appSection = $( '#app-section' ).find( '.scene-images-selection' )
        appSection.append( html )
        
        section                       = appSection.find( '#scene-images-selection' )
        selectionSection              = section.find( '.selection-section' )
        imagesSelectionSection        = selectionSection.find( '.images-section' )
        imageSelectionSection         = appSection.find( '.image-section' )
        expandedImageSelectionSection = appSection.find( '.expanded-image-section' )
        //
        selectedSection               = section.find( '.selected-section' )
        selectedSectionHeader         = selectedSection.find( '.section-header' )
        selectedSectionTableHeader    = selectedSection.find( '.table-header' )
        selectedSectionTableContent   = selectedSection.find( '.table-content' )
        selectedSectionTableRow       = selectedSection.find( '.table-row' )
    }
    
}

var reset = function () {
    imagesSelectionSection.empty()
    selectedSectionTableContent.empty()
}

// Functions for selection section
var addToSelection = function ( sceneImage ) {
    var imgSection = getImageSectionForSelection( sceneImage )
    imgSection.addClass( sceneImage.sceneId )
    imagesSelectionSection.append( imgSection )
    imgSection.show()
}

var hideFromSelection = function ( sceneImage ) {
    var imgSection = imagesSelectionSection.find( '.' + sceneImage.sceneId )
    
    Animation.animateOut( imgSection )
    
    setTimeout( function ( e ) {
        Animation.removeAnimation( imgSection )
        imgSection.hide()
    }, 500 )
}

var getImageSectionForSelection = function ( sceneImage ) {
    var imgSection = imageSelectionSection.clone()
    
    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )
    
    var imgHover = imgSection.find( '.img-hover' )
    img.mouseenter( function () {
        imgHover.fadeIn( 150 )
        img.velocity( { opacity: 0.5 }, { duration: 150 } )
    } )
    imgHover.mouseleave( function () {
        imgHover.fadeOut( 150 )
        img.velocity( { opacity: 1 }, { duration: 150 } )
    } )
    
    imgHover.click( function () {
        expandedImageSelectionSection.find( 'img' ).attr( 'src', sceneImage.browseUrl ).click( function () {
            expandedImageSelectionSection.velocity( "stop" ).velocity( 'fadeOut', {
                delay   : 20,
                duration: 500
            } )
        } )
        expandedImageSelectionSection.find( '.cloud-cover' ).empty().append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
        expandedImageSelectionSection.find( '.sensor' ).empty().append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )
        expandedImageSelectionSection.velocity( "stop" ).velocity( 'fadeIn', {
            delay   : 20,
            duration: 500
        } )
    } )

    //TODO : add daysFromTargetDay
    imgSection.find( '.cloud-cover' ).append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
    imgSection.find( '.sensor' ).append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )
    
    imgSection.find( '.btn-add' ).click( function () {
        EventBus.dispatch( Events.SECTION.SCENE_IMAGES_SELECTION.SELECT, null, sceneImage )
    } )
    
    return imgSection
}

var addToSelectedSection = function ( sceneImage ) {
    var imgSection = selectedSectionTableRow.clone()
    
    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )
    
    imgSection.find( '.cloud-cover' ).append( sceneImage.cloudCover )
    imgSection.find( '.sensor' ).append( sceneImage.sensor )
    
    selectedSectionTableContent.append( imgSection )
    
    Animation.animateIn( imgSection )
    imgSection.velocity( 'scroll', {
        container : selectedSectionTableContent
        , duration: 600
        , delay   : 100
    } )
}

module.exports = {
    init                  : init
    , reset               : reset
    , addToSelection      : addToSelection
    , hideFromSelection   : hideFromSelection
    , addToSelectedSection: addToSelectedSection
}