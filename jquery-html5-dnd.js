//= require jquery/jquery

/**
 * These are wrappers for the html5 drag and drop api to get
 * around common pitfalls and to be able to add DnD functionality
 * to components quickly.
 *
 * To use:
 *
 *   On draggable items:
 *   
 *   1) add draggable=true (html5 requirement) to the draggable element
 *   2) add data-draggable=[DRAG_TYPE] - DRAG_TYPE is required
 *   3) (Optional) add data-draggable-data=[DATA] where data is anything
 *      you want passed to the drop handler
 *   4) (Optional) add data-draggable-trigger=true to trigger events for 
 *      the start/end of dragging. Useful for specifying custom data
 *   5) (Optional) add data-draggable-image=[ELEMENT_ID] where ELEMENT_ID
 *      is the ID for the html element that you wish to use as the drag
 *      image
 *
 *   Ex:
 *     %div(draggable="true" 
 *          data-draggable="issues"
 *          data-draggable-trigger="true" 
 *          data-draggable-trigger="issue-drag-image")
 *
 *   Also note: 
 *     - a draggable-dragging class is added to the dragging target to 
 *       styled the item that is currently being dragged
 *
 *   Events:
 *     All event are passed originalDragEvent, dragData, and dragType
 *     - dnd-start is triggered when the target starts a drag event
 *     - dnd-end is triggered when the target's drag is finished
 *
 *   On droppable items:
 *   
 *   1) add data-droppable=[ACCEPTED_DRAG_TYPE] - ACCEPTED_DRAG_TYPE is required
 *      and indicates the type of dragged elements that are allowed to be
 *      dropped in the target droppable
 *   2) dnd-drop is triggered on the droppable and it is up to you to handle
 *
 *   Ex:
 *     %div(data-droppable="issues")
 *
 *   Also note: 
 *     - a droppable-hover class is added to valid drop targets to be
 *       styled at your liesure. Because of the crappiness of the 
 *       html5 dnd api, a default style is applied to the :after
 *       psuedoselect to prevent pointer events inside the drop
 *       container.
 *
 *   Events:
 *     All event are passed originalDropEvent, dragData, and dragType
 *     - dnd-drop is triggered on the droppable to signify a drop
 *
 *   To programmatically control draggables and droppables
 *
 *     To be able to start/top draggables and droppables, you can:
 *     1) Add the drag type to data-draggable-type or data-droppable-type
 *        and NOT specifiy data-draggable/data-droppable
 *     2) Initialize the plugin manually on a container:
 *        $(myselector).html5Draggable({ selector: 'dragElSElector });
 *        $(myselector).html5Droppable({ selector: 'dropElSElector });
 *     3) To turn off programmitically setup elements, just call
 *        $(myselector).html5Draggable('destory');
 *        $(myselector).html5Droppable('destory');
 *
 *        In the event your elmeent is removed, it'll be destroyed 
 *        automatically
 *
 *   On droppable item containers:
 *    
 *     If you have a container that includes dropdowns, add the following
 *     elements to make that container scroll during a drag event:
 * 
 *       %div(data-droppable-edge="top" data-droppable-edge-container="window")
 *       %div(data-droppable-edge="bottom")
 *
 *     You're resoponsible for displaying and styling them.
 *     NOTE: This may change in the future if we need a more generic solution,
 *           but limiting perf hit for now.
 *
 *   To set custom data:
 *
 *     Because the dataTransfer api only takes strings, and doesn't always
 *     pass them around, you can manually set the data for the current drag 
 *     event.
 *
 *     To do this:
 *
 *       $(document).trigger('dnd-data-set', [ [DRAG_TYPE], [DRAG_DATA] ]);
 *
 *     You likely want to do this in response to dnd-start
 *
 */
(function () {

  var DEFAULT_DRAG_NAMESPACE = 'html5-draggable';
  var DEFAULT_DROP_NAMESPACE = 'html5-droppable';
  var DRAGGABLE_SELECTOR = '[data-draggable]';
  var DRAGGABLE_DRAGGING_CLASS = 'draggable-dragging';
  var DROPPABLE_SELECTOR = '[data-droppable]';
  var DROPPABLE_HOVER_CLASS = 'droppable-hover';
  var DROPPABLE_EDGE_SELECTOR = '[data-droppable-edge]';
  var GLOBAL_DRAGGING_ATTR = 'data-dragging';
  var SCROLL_INTERVAL = 50;
  

  // STATE VARIABLES

  // global drag data
  // Note: To get around lack of ability to store data pertaining to
  //       the drag event, we store any drag data within this closure
  //       and don't rely on the dataTransfer api
  var dragData;

  // global drag type
  var dragType;

  // whether to trigger custom events
  var triggerDraggableEvents = false;

  // whether the current drag has been cancelled
  var cancelled = false;

  // scrolling interval reference
  var scrollInterval;

  // scroll container jquery object
  var $scrollContainer;


  // HELPERS

  // updates global dragging state to current drag type
  var setDraggingState = function () {
    document.body.setAttribute(GLOBAL_DRAGGING_ATTR, dragType);
  };

  // clear global dragging state to signal no drags in progress 
  var clearDraggingState = function () {
    document.body.removeAttribute(GLOBAL_DRAGGING_ATTR);
  };


  // EVENT HANDLERS

  // generic drag start handler
  var onDragStart = function (e) {
    // get draggable info
    var target = e.target;
    var type = target.getAttribute('data-draggable') ||
      target.getAttribute('data-draggable-type');
    var data = target.getAttribute('data-draggable-data') || '';
    if (!type) return; // if no type info, don't continue with dnd

    // store data
    dragData = data;
    dragType = type;

    // allow styling of item being dragged
    target.classList.add(DRAGGABLE_DRAGGING_CLASS);

    // trigger custom event if requested
    if (target.getAttribute('data-draggable-trigger') === 'true') {
      triggerDraggableEvents = true;
      $(target).trigger({ 
        type: 'dnd-start',
        originalDragEvent: e,
        dragType: type,
        dragData: data
      });
    }

    // set data transfer object
    // NOTE: must specify type as Text for IE
    e.originalEvent.dataTransfer.effectAllowed = 'move';
    e.originalEvent.dataTransfer.setData('Text', 'true');

    // determine drag image (IE doesn't support this)
    if (e.originalEvent.dataTransfer.setDragImage) {
      var dragImageId = target.getAttribute('data-draggable-image');
      if (dragImageId) {
        var dragImage = document.getElementById(dragImageId);
        e.originalEvent.dataTransfer.setDragImage(dragImage, 0, 0);
      } 
    }

    // update dragging state + defer to prevent browser from cancelling
    setTimeout(setDraggingState, 1);
  };

  // generic drag end handler
  var onDragEnd = function (e) {
    // remove styling of item being dragged
    var target = e.target;
    target.classList.remove(DRAGGABLE_DRAGGING_CLASS);

    // trigger custom event if requested
    if (triggerDraggableEvents) {
      $(target).trigger({ 
        type: 'dnd-end',
        originalDragEvent: e,
        dragType: dragType,
        dragData: dragData
      });
      triggerDraggableEvents = false;
    }                   

    // update dragging state + defer to prevent executing before set
    setTimeout(clearDraggingState, 1);
  };

  // generic drag enter handler
  var onDragEnter = function (e) {
    // check if this droppable accepts current type
    // NOTE: we don't use dataTransfer object because chrome doesn't store
    //       arbitrary types
    // NOTE: we use e.currentTarget to get around dnd bubbling weirdness
    // TODO: allow accepting multiple types
    var dataTransfer = e.originalEvent.dataTransfer;
    var target = e.currentTarget;
    var acceptedType = target.getAttribute('data-droppable') ||
      target.getAttribute('data-droppable-type');
    cancelled = acceptedType !== dragType;
    if (cancelled) return;

    // update dataTransfer object so the api is satisfied...
    // NOTE: this is really just required by Firefox
    dataTransfer.dropEffect = 'move';

    // allow droppable to be styled
    target.classList.add(DROPPABLE_HOVER_CLASS);

    // drop accepted, so don't let allow accepts up the dom tree
    e.stopPropagation();
  };

  // generic drag over handler
  var onDragOver = function (e) {
    // NOTE: not triggering custom event here as this function is called
    //       many many times during a drag and there is no current usecase

    // the following accepts the drag and drop per the api
    if (!cancelled) {
      e.preventDefault();
      return false;
    }
  };

  // generic drag leave handler
  var onDragLeave = function (e) {
    // remove styling from droppable
    // NOTE: we use e.currentTarget to get around dnd bubbling weirdness
    var target = e.currentTarget;
    target.classList.remove(DROPPABLE_HOVER_CLASS);
  };

  // generic drag drop handler
  var onDragDrop = function (e) {
    // prevent links/etc from being followed
    e.stopPropagation();
    e.preventDefault();

    // make sure styling is removed
    // NOTE: we use e.currentTarget to get around dnd bubbling weirdness
    var target = e.currentTarget;
    target.classList.remove(DROPPABLE_HOVER_CLASS);

    // trigger custom drop event
    $(target).trigger({ 
      type: 'dnd-drop',
      originalDropEvent: e,
      dragType: dragType,
      dragData: dragData
    });

    // update dragging state + defer to prevent executing before set
    setTimeout(clearDraggingState, 1);
  };

  // handler for drag enters into droppable edges
  var onDroppableEdgeEnter = function (e) {
    // get scroll container
    var edge = e.currentTarget;
    var selector = edge.getAttribute('data-droppable-edge-container');
    if (selector) {
      if (selector === 'window') selector = window;

      // if container exists...
      $scrollContainer = $(selector);
      if ($scrollContainer.length) {
        // get scroll diff
        var position = edge.getAttribute('data-droppable-edge');
        var scrollDiff = position === 'top' ? -40 : 40;

        // clear any existing interval
        clearInterval(scrollInterval);

        // update scroll position by creating interval
        scrollInterval = setInterval(function () {
          var scrollTop = $scrollContainer.scrollTop();
          $scrollContainer.scrollTop(scrollTop + scrollDiff);
        }, SCROLL_INTERVAL);
      }
    }
  };

  // stop scrolling on leave of container
  var onDroppableEdgeLeave = function (e) {
    clearInterval(scrollInterval);
    $scrollContainer = null;
  };

  // CONSTRUCTORS/DESTRUCTORS

  // initialize draggables in an element
  var initializeDraggable = function (ns, el, draggableSelector) {
    // define draggable event handlers
    $(el).on('dragstart.' + ns, draggableSelector, onDragStart)
      .on('dragend.' + ns, draggableSelector, onDragEnd);
  };

  // initialize droppables in an element
  var initializeDroppable = function (ns, el, droppableSelector) {
    // define droppable event handlers
    $(el).on('dragenter.' + ns, droppableSelector, onDragEnter)
      .on('dragover.' + ns, droppableSelector, onDragOver)
      .on('dragleave.' + ns, droppableSelector, onDragLeave)
      .on('drop.' + ns, droppableSelector, onDragDrop);
  };

  // destroy namespace in an element
  var destroy = function (ns, el) {
    $(el).off('.' + ns);
  };

  // PLUGINS

  // draggable plugin
  $.fn.html5Draggable = function (options) {
    return this.each(function () {
      var initialized = $.data(this, DEFAULT_DRAG_NAMESPACE);
      if (options === 'destroy') {
        if (initialized) {
          destroy(DEFAULT_DRAG_NAMESPACE, this);
          $.data(this, DEFAULT_DRAG_NAMESPACE, false);
        }
      } else if (!initialized) {
        (options) || (options = { selector: DRAGGABLE_SELECTOR });
        initializeDraggable(DEFAULT_DRAG_NAMESPACE, this, options.selector);
        $.data(this, DEFAULT_DRAG_NAMESPACE, true);
      }
    });
  };

  // droppable plugin
  $.fn.html5Droppable = function (options) {
    return this.each(function () {
      var initialized = $.data(this, DEFAULT_DROP_NAMESPACE);
      if (options === 'destroy') {
        if (initialized) {
          destroy(DEFAULT_DROP_NAMESPACE, this);
          $.data(this, DEFAULT_DROP_NAMESPACE, false);
        }
      } else if (!initialized) {
        (options) || (options = { selector: DROPPABLE_SELECTOR });
        initializeDroppable(DEFAULT_DROP_NAMESPACE, this, options.selector);
        $.data(this, DEFAULT_DROP_NAMESPACE, true);
      }
    });
  };


  // EXTERNAL METHODS

  setTimeout(function () {

    // setter for complex drag data for current dnd sequence
    $(document).on('dnd-data-set', function (e, type, data) {
      if (type === dragType) dragData = data;
    });


    // SETUP LISTENERS

    $(document).html5Draggable();
    $(document).html5Droppable();
    $(document).on('dragenter.' + DEFAULT_DROP_NAMESPACE,
      DROPPABLE_EDGE_SELECTOR, onDroppableEdgeEnter);
    $(document).on('dragleave.' + DEFAULT_DROP_NAMESPACE,
      DROPPABLE_EDGE_SELECTOR, onDroppableEdgeLeave);

  }, 1);

})();
