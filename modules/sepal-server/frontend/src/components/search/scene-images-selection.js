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

var show = function ( e, type ) {

    if ( type == 'scene-images-selection' ) {

        var appSection = $( '#app-section' ).find( '.scene-images-selection' )
        if ( appSection.children().length <= 0 ) {
            appSection.append( html )

            section                       = appSection.find( '#scene-images-selection' )
            selectionSection              = section.find( '.selection-section' )
            imagesSelectionSection        = selectionSection.find( '.images-section' )
            imageSelectionSection         = appSection.find( '.image-section' )
            expandedImageSelectionSection = appSection.find( '.expanded-image-section' )
            //
            selectedSection               = section.find( '.selected-section' )
        }

    }

}

// Functions for selecting the images
var resetSelection = function () {
    imagesSelectionSection.empty()
    expandedImageSelectionSection.velocity( 'slideUp', { delay: 0, duration: 0 } )
}

var update = function ( e, sceneImages ) {
    resetSelection()

    $.each( sceneImages, function ( i, sceneImage ) {
        var imgSection = getImageSectionForSelection( sceneImage )
        imgSection.addClass( 'image-section-' + i )
        imagesSelectionSection.append( imgSection )
        imgSection.show()
    } )

}

var getImageSectionForSelection = function ( sceneImage ) {
    var imgSection = imageSelectionSection.clone()

    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )

    var imgHover = imgSection.find( '.img-hover' )
    img.mouseenter( function () {
        imgHover.fadeIn( 150 )
    } )
    imgHover.mouseleave( function () {
        imgHover.fadeOut( 150 )
    } )

    imgHover.click( function () {
        expandedImageSelectionSection.find( 'img' ).attr( 'src', sceneImage.browseUrl ).click( function () {
            expandedImageSelectionSection.velocity( "stop" ).velocity( 'fadeOut', { delay: 20, duration: 500 } )
        } )
        expandedImageSelectionSection.find( '.cloud-cover' ).empty().append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
        expandedImageSelectionSection.find( '.sensor' ).empty().append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )
        expandedImageSelectionSection.velocity( "stop" ).velocity( 'fadeIn', { delay: 20, duration: 500 } )
    } )
    imgSection.find( '.image' ).append( img )
//daysFromTargetDay
    imgSection.find( '.cloud-cover' ).append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
    imgSection.find( '.sensor' ).append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )

    imgSection.find( '.btn-add' ).click( function () {
        console.log( sceneImage )
        Animation.animateOut( imgSection, function () {
        } )
        setTimeout( function ( e ) {
            Animation.removeAnimation( imgSection )
            imgSection.hide()
        }, 500 )
    } )

    return imgSection
}

EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SHOW, show )