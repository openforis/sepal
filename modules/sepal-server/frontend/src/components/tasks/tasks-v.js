/**
 * @author Mino Togna
 */
require( './tasks.css' )
require( './task-progress.scss' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )
var Model     = require( './tasks-m' )

// html
var template = require( './tasks.html' )
var html     = $( template( {} ) )

var rowTask   = html.find( '.task' )
var rowHeader = html.find( '.row.row-header' )
var container = html.find( '.tasks-container' )

var init = function () {
    var appSection = $( '#app-section' ).find( '.tasks' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
    }
}

var reset = function () {
    container.find( '.task' ).remove()
}

var setTasks = function ( tasks ) {
    $.each( tasks, function ( i, task ) {
        var taskUI = getTaskUI( i, task )
        
        var progressBar = taskUI.find( '.row-progress .progress' )
        progressBar.children().removeClass( 'determinate indeterminate failed completed' )
        
        var btnRemove  = taskUI.find( '.btn-remove' )
        var btnCancel  = taskUI.find( '.btn-cancel' )
        var btnExecute = taskUI.find( '.btn-execute' )
        btnExecute.prop( "disabled", false )
        
        switch ( task.status ) {
            
            case Model.STATUS.ACTIVE:
                progressBar.children().addClass( 'indeterminate' ).width( '' )
                
                btnRemove.hide()
                btnCancel.show()
                btnExecute.hide()
                break
            case Model.STATUS.PENDING:
                btnRemove.hide()
                btnCancel.hide()
                btnExecute.show()
                btnExecute.prop( "disabled", true )
                
                break
            case Model.STATUS.FAILED:
                // taskLoader.hide()
                progressBar.children().addClass( 'determinate failed' ).width( '100%' )
                
                btnRemove.show()
                btnCancel.hide()
                btnExecute.show()
                
                break
            case Model.STATUS.COMPLETED:
                // taskLoader.hide()
                progressBar.children().addClass( 'determinate completed' ).width( '100%' )
                
                btnRemove.show()
                btnCancel.hide()
                btnExecute.show()
                break
        }
        
    } )
}

var getTaskUI = function ( index, task ) {
    var taskUI = container.find( '.task-' + task.id )
    if ( taskUI.length ) {
    } else {
        taskUI = rowTask.clone()
        taskUI.addClass( 'task-' + task.id )
        taskUI.find( '.name' ).html( task.name )
        container.append( taskUI )
        
        setTimeout( function () {
            Animation.animateIn( taskUI )
        }, index * 50 )
        
        var btnRemove  = taskUI.find( '.btn-remove' )
        var btnCancel  = taskUI.find( '.btn-cancel' )
        var btnExecute = taskUI.find( '.btn-execute' )
        
        btnRemove.click( function ( e ) {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.REMOVE_TASK, null, task.id )
        } )
        btnCancel.click( function ( e ) {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.CANCEL_TASK, null, task.id )
        } )
        btnExecute.click( function ( e ) {
            EventBus.dispatch( Events.SECTION.TASK_MANAGER.EXECUTE_TASK, null, task.id )
        } )
        
    }
    
    return taskUI
}

var removeTask = function ( taskId ) {
    var taskUI = container.find( '.task-' + taskId )
    Animation.animateOut( taskUI , function (  ) {
        taskUI.remove()
    } )
}

module.exports = {
    init        : init
    , reset     : reset
    , setTasks  : setTasks
    , removeTask: removeTask
}

// var getTaskStatus = function ( status ) {
//     var icon = ''
//     switch ( status ) {
//
//         case Model.STATUS.ACTIVE:
//             icon = '<i class="fa fa-refresh fa-spin fa-active" aria-hidden="true"' +
//                 'data-toggle="tooltip" data-placement="top" title="Active"></i>'
//             break;
//         case Model.STATUS.PENDING:
//             icon = '<i class="fa fa-hand-paper-o fa-pending" aria-hidden="true"' +
//                 'data-toggle="tooltip" data-placement="top" title="Pending"></i>'
//             break;
//         case Model.STATUS.FAILED:
//             icon = '<i class="fa fa-exclamation-triangle fa-failed" aria-hidden="true"' +
//                 'data-toggle="tooltip" data-placement="top" title="Failed"></i>'
//             break;
//         case Model.STATUS.COMPLETED:
//             icon = '<i class="fa fa-thumbs-up fa-completed" aria-hidden="true"' +
//                 'data-toggle="tooltip" data-placement="top" title="Completed"></i>'
//             break;
//     }
//
//     return $( icon )
// }
