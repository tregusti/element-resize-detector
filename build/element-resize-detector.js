(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elementResizeDetectorMaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var utils = require("./utils");

module.exports = function BatchProcessor(options) {
    options         = options || {};
    var reporter    = options.reporter;
    var async       = utils.getOption(options, "async", true);
    var autoProcess = utils.getOption(options, "auto", true);

    if(autoProcess && !async) {
        if(reporter) {
            reporter.warn("Invalid options combination. auto=true and async=false is invalid. Setting async=true.");
        }
        async = true;
    }

    var batch;
    var batchSize;
    var topLevel;
    var bottomLevel;

    clearBatch();

    var asyncFrameHandler;

    function addFunction(level, fn) {
        if(!fn) {
            fn = level;
            level = 0;
        }

        if(level > topLevel) {
            topLevel = level;
        } else if(level < bottomLevel) {
            bottomLevel = level;
        }

        if(!batch[level]) {
            batch[level] = [];
        }

        if(autoProcess && async && batchSize === 0) {
            processBatchAsync();
        }

        batch[level].push(fn);
        batchSize++;
    }

    function forceProcessBatch(processAsync) {
        if(processAsync === undefined) {
            processAsync = async;
        }

        if(asyncFrameHandler) {
            cancelFrame(asyncFrameHandler);
            asyncFrameHandler = null;
        }

        if(async) {
            processBatchAsync();
        } else {
            processBatch();
        }
    }

    function processBatch() {
        for(var level = bottomLevel; level <= topLevel; level++) {
            var fns = batch[level];

            for(var i = 0; i < fns.length; i++) {
                var fn = fns[i];
                fn();
            }
        }
        clearBatch();
    }

    function processBatchAsync() {
        asyncFrameHandler = requestFrame(processBatch);
    }

    function clearBatch() {
        batch           = {};
        batchSize       = 0;
        topLevel        = 0;
        bottomLevel     = 0;
    }

    function cancelFrame(listener) {
        // var cancel = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame || window.clearTimeout;
        var cancel = window.clearTimeout;
        return cancel(listener);
    }

    function requestFrame(callback) {
        // var raf = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function(fn) { return window.setTimeout(fn, 20); };
        var raf = function(fn) { return window.setTimeout(fn, 0); };
        return raf(callback);
    }

    return {
        add: addFunction,
        force: forceProcessBatch
    };
};
},{"./utils":2}],2:[function(require,module,exports){
"use strict";

var utils = module.exports = {};

utils.getOption = getOption;

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

},{}],3:[function(require,module,exports){
"use strict";

var detector = module.exports = {};

detector.isIE = function(version) {
    function isAnyIeVersion() {
        var agent = navigator.userAgent.toLowerCase();
        return agent.indexOf("msie") !== -1 || agent.indexOf("trident") !== -1;
    }

    if(!isAnyIeVersion()) {
        return false;
    }

    if(!version) {
        return true;
    }

    //Shamelessly stolen from https://gist.github.com/padolsey/527683
    var ieVersion = (function(){
        var undef,
            v = 3,
            div = document.createElement("div"),
            all = div.getElementsByTagName("i");

        do {
            div.innerHTML = "<!--[if gt IE " + (++v) + "]><i></i><![endif]-->";
        }
        while (all[0]);

        return v > 4 ? v : undef;
    }());

    return version === ieVersion;
};

detector.isLegacyOpera = function() {
    return !!window.opera;
};

},{}],4:[function(require,module,exports){
"use strict";

var utils = module.exports = {};

/**
 * Loops through the collection and calls the callback for each element. if the callback returns truthy, the loop is broken and returns the same value.
 * @public
 * @param {*} collection The collection to loop through. Needs to have a length property set and have indices set from 0 to length - 1.
 * @param {function} callback The callback to be called for each element. The element will be given as a parameter to the callback. If this callback returns truthy, the loop is broken and the same value is returned.
 * @returns {*} The value that a callback has returned (if truthy). Otherwise nothing.
 */
utils.forEach = function(collection, callback) {
    for(var i = 0; i < collection.length; i++) {
        var result = callback(collection[i]);
        if(result) {
            return result;
        }
    }
};

},{}],5:[function(require,module,exports){
/**
 * Resize detection strategy that injects objects to elements in order to detect resize events.
 * Heavily inspired by: http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/
 */

"use strict";

var browserDetector = require("../browser-detector");

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        if(!getObject(element)) {
            throw new Error("Element is not detectable by this strategy.");
        }

        function listenerProxy() {
            listener(element);
        }

        if(browserDetector.isIE(8)) {
            //IE 8 does not support object, but supports the resize event directly on elements.
            element.attachEvent("onresize", listenerProxy);
        } else {
            var object = getObject(element);
            object.contentDocument.defaultView.addEventListener("resize", listenerProxy);
        }
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        function injectObject(element, callback) {
            var OBJECT_STYLE = "display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; padding: 0; margin: 0; opacity: 0; z-index: -1000; pointer-events: none;";

            function onObjectLoad() {
                /*jshint validthis: true */

                function getDocument(element, callback) {
                    //Opera 12 seem to call the object.onload before the actual document has been created.
                    //So if it is not present, poll it with an timeout until it is present.
                    //TODO: Could maybe be handled better with object.onreadystatechange or similar.
                    if(!element.contentDocument) {
                        setTimeout(function checkForObjectDocument() {
                            getDocument(element, callback);
                        }, 100);

                        return;
                    }

                    callback(element.contentDocument);
                }

                //Mutating the object element here seems to fire another load event.
                //Mutating the inner document of the object element is fine though.
                var objectElement = this;

                //Create the style element to be added to the object.
                getDocument(objectElement, function onObjectDocumentReady(objectDocument) {
                    //Notify that the element is ready to be listened to.
                    callback(element);
                });
            }

            //The target element needs to be positioned (everything except static) so the absolute positioned object will be positioned relative to the target element.
            var style = getComputedStyle(element);
            var position = style.position;

            function mutateDom() {
                if(position === "static") {
                    element.style.position = "relative";

                    var removeRelativeStyles = function(reporter, element, style, property) {
                        function getNumericalValue(value) {
                            return value.replace(/[^-\d\.]/g, "");
                        }

                        var value = style[property];

                        if(value !== "auto" && getNumericalValue(value) !== "0") {
                            reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                            element.style[property] = 0;
                        }
                    };

                    //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                    //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                    removeRelativeStyles(reporter, element, style, "top");
                    removeRelativeStyles(reporter, element, style, "right");
                    removeRelativeStyles(reporter, element, style, "bottom");
                    removeRelativeStyles(reporter, element, style, "left");
                }

                //Add an object element as a child to the target element that will be listened to for resize events.
                var object = document.createElement("object");
                object.style.cssText = OBJECT_STYLE;
                object.type = "text/html";
                object.onload = onObjectLoad;

                //Safari: This must occur before adding the object to the DOM.
                //IE: Does not like that this happens before, even if it is also added after.
                if(!browserDetector.isIE()) {
                    object.data = "about:blank";
                }

                element.appendChild(object);
                element._erdObject = object;

                //IE: This must occur after adding the object to the DOM.
                if(browserDetector.isIE()) {
                    object.data = "about:blank";
                }
            }

            if(batchProcessor) {
                batchProcessor.add(mutateDom);
            } else {
                mutateDom();
            }
        }

        if(browserDetector.isIE(8)) {
            //IE 8 does not support objects properly. Luckily they do support the resize event.
            //So do not inject the object and notify that the element is already ready to be listened to.
            //The event handler for the resize event is attached in the utils.addListener instead.
            callback(element);
        } else {
            injectObject(element, callback);
        }
    }

    /**
     * Returns the child object of the target element.
     * @private
     * @param {element} element The target element.
     * @returns The object element of the target.
     */
    function getObject(element) {
        return element._erdObject;
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

},{"../browser-detector":3}],6:[function(require,module,exports){
/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    //TODO: Could this perhaps be done at installation time?
    var scrollbarSizes = getScrollbarSizes();

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        var changed = function() {
            var elementStyle    = getComputedStyle(element);
            var width           = parseSize(elementStyle.width);
            var height          = parseSize(elementStyle.height);

            // Store the size of the element sync here, so that multiple scroll events may be ignored in the event listeners.
            // Otherwise the if-check in handleScroll is useless.
            storeCurrentSize(element, width, height);

            batchProcessor.add(function updateDetectorElements() {
                updateChildSizes(element, width, height);
            });

            batchProcessor.add(1, function updateScrollbars() {
                positionScrollbars(element, width, height);
                listener(element);
            });
        };

        function handleScroll() {
            var style = getComputedStyle(element);
            var width = parseSize(style.width);
            var height = parseSize(style.height);

            if (width !== element.lastWidth || height !== element.lastHeight) {
                changed();
            }
        }

        var expand = getExpandElement(element);
        var shrink = getShrinkElement(element);

        addEvent(expand, "scroll", handleScroll);
        addEvent(shrink, "scroll", handleScroll);
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        // Reading properties of elementStyle will result in a forced getComputedStyle for some browsers, so read all values and store them as primitives here.
        var elementStyle        = getComputedStyle(element);
        var position            = elementStyle.position;
        var width               = parseSize(elementStyle.width);
        var height              = parseSize(elementStyle.height);
        var top                 = elementStyle.top;
        var right               = elementStyle.right;
        var bottom              = elementStyle.bottom;
        var left                = elementStyle.left;
        var readyExpandScroll   = false;
        var readyShrinkScroll   = false;
        var readyOverall        = false;

        function ready() {
            if(readyExpandScroll && readyShrinkScroll && readyOverall) {
                callback(element);
            }
        }

        function mutateDom() {
            if(position === "static") {
                element.style.position = "relative";

                var removeRelativeStyles = function(reporter, element, value, property) {
                    function getNumericalValue(value) {
                        return value.replace(/[^-\d\.]/g, "");
                    }

                    if(value !== "auto" && getNumericalValue(value) !== "0") {
                        reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                        element.style[property] = 0;
                    }
                };

                //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                removeRelativeStyles(reporter, element, top, "top");
                removeRelativeStyles(reporter, element, right, "right");
                removeRelativeStyles(reporter, element, bottom, "bottom");
                removeRelativeStyles(reporter, element, left, "left");
            }

            function getContainerCssText(left, top, bottom, right) {
                left = (!left ? "0" : (left + "px"));
                top = (!top ? "0" : (top + "px"));
                bottom = (!bottom ? "0" : (bottom + "px"));
                right = (!right ? "0" : (right + "px"));

                return "position: absolute; left: " + left + "; top: " + top + "; right: " + right + "; bottom: " + bottom + "; overflow: scroll; z-index: -1; visibility: hidden;";
            }

            var scrollbarWidth          = scrollbarSizes.width;
            var scrollbarHeight         = scrollbarSizes.height;
            var containerStyle          = getContainerCssText(-1, -1, -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandstyle       = getContainerCssText(0, 0, -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandChildStyle  = "position: absolute; left: 0; top: 0;";

            var container               = document.createElement("div");
            var expand                  = document.createElement("div");
            var expandChild             = document.createElement("div");
            var shrink                  = document.createElement("div");
            var shrinkChild             = document.createElement("div");

            container.style.cssText     = containerStyle;
            expand.style.cssText        = shrinkExpandstyle;
            expandChild.style.cssText   = shrinkExpandChildStyle;
            shrink.style.cssText        = shrinkExpandstyle;
            shrinkChild.style.cssText   = shrinkExpandChildStyle + " width: 200%; height: 200%;";

            expand.appendChild(expandChild);
            shrink.appendChild(shrinkChild);
            container.appendChild(expand);
            container.appendChild(shrink);
            element.appendChild(container);
            element._erdElement = container;

            addEvent(expand, "scroll", function onFirstExpandScroll() {
                removeEvent(expand, "scroll", onFirstExpandScroll);
                readyExpandScroll = true;
                ready();
            });

            addEvent(shrink, "scroll", function onFirstShrinkScroll() {
                removeEvent(shrink, "scroll", onFirstShrinkScroll);
                readyShrinkScroll = true;
                ready();
            });

            updateChildSizes(element, width, height);
        }

        function finalizeDomMutation() {
            storeCurrentSize(element, width, height);
            positionScrollbars(element, width, height);
            readyOverall = true;
            ready();
        }

        if(batchProcessor) {
            batchProcessor.add(mutateDom);
            batchProcessor.add(1, finalizeDomMutation);
        } else {
            mutateDom();
            finalizeDomMutation();
        }
    }

    function getExpandElement(element) {
        return element._erdElement.childNodes[0];
    }

    function getExpandChildElement(element) {
        return getExpandElement(element).childNodes[0];
    }

    function getShrinkElement(element) {
        return element._erdElement.childNodes[1];
    }

    function getExpandSize(size) {
        return size + 10;
    }

    function getShrinkSize(size) {
        return size * 2;
    }

    function updateChildSizes(element, width, height) {
        var expandChild             = getExpandChildElement(element);
        var expandWidth             = getExpandSize(width);
        var expandHeight            = getExpandSize(height);
        expandChild.style.width     = expandWidth + "px";
        expandChild.style.height    = expandHeight + "px";
    }

    function storeCurrentSize(element, width, height) {
        element.lastWidth   = width;
        element.lastHeight  = height;
    }

    function positionScrollbars(element, width, height) {
        var expand          = getExpandElement(element);
        var shrink          = getShrinkElement(element);
        var expandWidth     = getExpandSize(width);
        var expandHeight    = getExpandSize(height);
        var shrinkWidth     = getShrinkSize(width);
        var shrinkHeight    = getShrinkSize(height);
        expand.scrollLeft   = expandWidth;
        expand.scrollTop    = expandHeight;
        shrink.scrollLeft   = shrinkWidth;
        shrink.scrollTop    = shrinkHeight;
    }

    function addEvent(el, name, cb) {
        if (el.attachEvent) {
            el.attachEvent("on" + name, cb);
        } else {
            el.addEventListener(name, cb);
        }
    }

    function removeEvent(el, name, cb) {
        if(el.attachEvent) {
            el.detachEvent("on" + name, cb);
        } else {
            el.removeEventListener(name, cb);
        }
    }

    function parseSize(size) {
        return parseFloat(size.replace(/px/, ""));
    }

    function getScrollbarSizes() {
        var width = 500;
        var height = 500;

        var child = document.createElement("div");
        child.style.cssText = "position: absolute; width: " + width*2 + "px; height: " + height*2 + "px; visibility: hidden;";

        var container = document.createElement("div");
        container.style.cssText = "position: absolute; width: " + width + "px; height: " + height + "px; overflow: scroll; visibility: none; top: " + -width*3 + "px; left: " + -height*3 + "px; visibility: hidden;";

        container.appendChild(child);

        document.body.insertBefore(container, document.body.firstChild);

        var widthSize = width - container.clientWidth;
        var heightSize = height - container.clientHeight;

        document.body.removeChild(container);

        return {
            width: widthSize,
            height: heightSize
        };
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

},{}],7:[function(require,module,exports){
"use strict";

var forEach                 = require("./collection-utils").forEach;
var elementUtilsMaker       = require("./element-utils");
var listenerHandlerMaker    = require("./listener-handler");
var idGeneratorMaker        = require("./id-generator");
var idHandlerMaker          = require("./id-handler");
var reporterMaker           = require("./reporter");
var browserDetector         = require("./browser-detector");
var batchProcessorMaker     = require("batch-processor");

//Detection strategies.
var objectStrategyMaker     = require("./detection-strategy/object.js");
var scrollStrategyMaker     = require("./detection-strategy/scroll.js");

/**
 * @typedef idHandler
 * @type {object}
 * @property {function} get Gets the resize detector id of the element.
 * @property {function} set Generate and sets the resize detector id of the element.
 */

/**
 * @typedef Options
 * @type {object}
 * @property {boolean} callOnAdd    Determines if listeners should be called when they are getting added. 
                                    Default is true. If true, the listener is guaranteed to be called when it has been added. 
                                    If false, the listener will not be guarenteed to be called when it has been added (does not prevent it from being called).
 * @property {idHandler} idHandler  A custom id handler that is responsible for generating, setting and retrieving id's for elements.
                                    If not provided, a default id handler will be used.
 * @property {reporter} reporter    A custom reporter that handles reporting logs, warnings and errors. 
                                    If not provided, a default id handler will be used.
                                    If set to false, then nothing will be reported.
 */

/**
 * Creates an element resize detector instance.
 * @public
 * @param {Options?} options Optional global options object that will decide how this instance will work.
 */
module.exports = function(options) {
    options = options || {};

    //idHandler is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var idHandler = options.idHandler;

    if(!idHandler) {
        var idGenerator = idGeneratorMaker();
        var defaultIdHandler = idHandlerMaker(idGenerator);
        idHandler = defaultIdHandler;
    }

    //reporter is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var reporter = options.reporter;

    if(!reporter) {
        //If options.reporter is false, then the reporter should be quiet.
        var quiet = reporter === false;
        reporter = reporterMaker(quiet);
    }

    //batchProcessor is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var batchProcessor = getOption(options, "batchProcessor", batchProcessorMaker({ reporter: reporter }));

    //Options to be used as default for the listenTo function.
    var globalOptions = {};
    globalOptions.callOnAdd     = !!getOption(options, "callOnAdd", true);

    var eventListenerHandler    = listenerHandlerMaker(idHandler);
    var elementUtils            = elementUtilsMaker();

    //The detection strategy to be used.
    var detectionStrategy;
    var desiredStrategy = getOption(options, "strategy", "object");
    var strategyOptions = {
        reporter: reporter,
        batchProcessor: batchProcessor
    };

    if(desiredStrategy === "scroll" && browserDetector.isLegacyOpera()) {
        reporter.warn("Scroll strategy is not supported on legacy Opera. Changing to object strategy.");
        desiredStrategy = "object";
    }

    if(desiredStrategy === "scroll") {
        detectionStrategy = scrollStrategyMaker(strategyOptions);
    } else if(desiredStrategy === "object") {
        detectionStrategy = objectStrategyMaker(strategyOptions);
    } else {
        throw new Error("Invalid strategy name: " + desiredStrategy);
    }

    //Calls can be made to listenTo with elements that are still are being installed.
    //Also, same elements can occur in the elements list in the listenTo function.
    //With this map, the ready callbacks can be synchronized between the calls
    //so that the ready callback can always be called when an element is ready - even if
    //it wasn't installed from the function intself.
    var onReadyCallbacks = {};

    /**
     * Makes the given elements resize-detectable and starts listening to resize events on the elements. Calls the event callback for each event for each element.
     * @public
     * @param {Options?} options Optional options object. These options will override the global options. Some options may not be overriden, such as idHandler.
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} listener The callback to be executed for each resize event for each element.
     */
    function listenTo(options, elements, listener) {
        function onResizeCallback(element) {
            var listeners = eventListenerHandler.get(element);

            forEach(listeners, function callListenerProxy(listener) {
                listener(element);
            });
        }

        function addListener(callOnAdd, element, listener) {
            eventListenerHandler.add(element, listener);
            
            if(callOnAdd) {
                listener(element);
            }
        }

        //Options object may be omitted.
        if(!listener) {
            listener = elements;
            elements = options;
            options = {};
        }

        if(!elements) {
            throw new Error("At least one element required.");
        }

        if(!listener) {
            throw new Error("Listener required.");
        }

        if(elements.length === undefined) {
            elements = [elements];
        }

        var elementsReady = 0;

        var callOnAdd = getOption(options, "callOnAdd", globalOptions.callOnAdd);
        var onReadyCallback = getOption(options, "onReady", function noop() {});

        forEach(elements, function attachListenerToElement(element) {
            var id = idHandler.get(element);

            if(!elementUtils.isDetectable(element)) {
                if(elementUtils.isBusy(element)) {
                    //The element is being prepared to be detectable. Do not make it detectable.
                    //Just add the listener, because the element will soon be detectable.
                    addListener(callOnAdd, element, listener);
                    onReadyCallbacks[id] = onReadyCallbacks[id] || [];
                    onReadyCallbacks[id].push(function onReady() {
                        elementsReady++;

                        if(elementsReady === elements.length) {
                            onReadyCallback();
                        }
                    });
                    return;
                }

                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                elementUtils.markBusy(element, true);
                return detectionStrategy.makeDetectable(element, function onElementDetectable(element) {
                    elementUtils.markAsDetectable(element);
                    elementUtils.markBusy(element, false);
                    detectionStrategy.addListener(element, onResizeCallback);
                    addListener(callOnAdd, element, listener);

                    elementsReady++;
                    if(elementsReady === elements.length) {
                        onReadyCallback();
                    }

                    if(onReadyCallbacks[id]) {
                        forEach(onReadyCallbacks[id], function(callback) {
                            callback();
                        });
                        delete onReadyCallbacks[id];
                    }
                });
            }
            
            //The element has been prepared to be detectable and is ready to be listened to.
            addListener(callOnAdd, element, listener);
            elementsReady++;
        });

        if(elementsReady === elements.length) {
            onReadyCallback();
        }
    }

    return {
        listenTo: listenTo
    };
};

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

},{"./browser-detector":3,"./collection-utils":4,"./detection-strategy/object.js":5,"./detection-strategy/scroll.js":6,"./element-utils":8,"./id-generator":9,"./id-handler":10,"./listener-handler":11,"./reporter":12,"batch-processor":1}],8:[function(require,module,exports){
"use strict";

module.exports = function() {
    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is detectable or not.
     */
    function isDetectable(element) {
        return !!element._erdIsDetectable;
    }

    /**
     * Marks the element that it has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to mark.
     */
    function markAsDetectable(element) {
        element._erdIsDetectable = true;
    }

    /**
     * Tells if the element is busy or not.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is busy or not.
     */
    function isBusy(element) {
        return !!element._erdBusy;
    }

    /**
     * Marks the object is busy and should not be made detectable.
     * @public
     * @param {element} element The element to mark.
     * @param {boolean} busy If the element is busy or not.
     */
    function markBusy(element, busy) {
        element._erdBusy = !!busy;
    }

    return {
        isDetectable: isDetectable,
        markAsDetectable: markAsDetectable,
        isBusy: isBusy,
        markBusy: markBusy
    };
};

},{}],9:[function(require,module,exports){
"use strict";

module.exports = function() {
    var idCount = 1;

    /**
     * Generates a new unique id in the context.
     * @public
     * @returns {number} A unique id in the context.
     */
    function generate() {
        return idCount++;
    }

    return {
        generate: generate
    };
};

},{}],10:[function(require,module,exports){
"use strict";

module.exports = function(idGenerator) {
    var ID_PROP_NAME = "_erdTargetId";

    /**
     * Gets the resize detector id of the element. If the element does not have an id, one will be assigned to the element.
     * @public
     * @param {element} element The target element to get the id of.
     * @param {boolean?} readonly An id will not be assigned to the element if the readonly parameter is true. Default is false.
     * @returns {string|number} The id of the element.
     */
    function getId(element, readonly) {
        if(!readonly && !hasId(element)) {
            setId(element);
        }

        return element[ID_PROP_NAME];
    }

    function setId(element) {
        var id = idGenerator.generate();

        element[ID_PROP_NAME] = id;

        return id;
    }

    function hasId(element) {
        return element[ID_PROP_NAME] !== undefined;
    }

    return {
        get: getId
    };
};

},{}],11:[function(require,module,exports){
"use strict";

module.exports = function(idHandler) {
    var eventListeners = {};

    /**
     * Gets all listeners for the given element.
     * @public
     * @param {element} element The element to get all listeners for.
     * @returns All listeners for the given element.
     */
    function getListeners(element) {
        return eventListeners[idHandler.get(element)];
    }

    /**
     * Stores the given listener for the given element. Will not actually add the listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The callback that the element has added.
     */
    function addListener(element, listener) {
        var id = idHandler.get(element);

        if(!eventListeners[id]) {
            eventListeners[id] = [];
        }

        eventListeners[id].push(listener);
    }

    return {
        get: getListeners,
        add: addListener
    };
};

},{}],12:[function(require,module,exports){
"use strict";

/* global console: false */

/**
 * Reporter that handles the reporting of logs, warnings and errors.
 * @public
 * @param {boolean} quiet Tells if the reporter should be quiet or not.
 */
module.exports = function(quiet) {
    function noop() {
        //Does nothing.
    }

    var reporter = {
        log: noop,
        warn: noop,
        error: noop
    };

    if(!quiet && window.console) {
        var attachFunction = function(reporter, name) {
            //The proxy is needed to be able to call the method with the console context,
            //since we cannot use bind.
            reporter[name] = function reporterProxy() {
                console[name].apply(console, arguments);
            };
        };

        attachFunction(reporter, "log");
        attachFunction(reporter, "warn");
        attachFunction(reporter, "error");
    }

    return reporter;
};
},{}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy9iYXRjaC1wcm9jZXNzb3IuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qcyIsInNyYy9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyIsInNyYy9yZXBvcnRlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBCYXRjaFByb2Nlc3NvcihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgcmVwb3J0ZXIgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBhc3luYyAgICAgICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImFzeW5jXCIsIHRydWUpO1xuICAgIHZhciBhdXRvUHJvY2VzcyA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImF1dG9cIiwgdHJ1ZSk7XG5cbiAgICBpZihhdXRvUHJvY2VzcyAmJiAhYXN5bmMpIHtcbiAgICAgICAgaWYocmVwb3J0ZXIpIHtcbiAgICAgICAgICAgIHJlcG9ydGVyLndhcm4oXCJJbnZhbGlkIG9wdGlvbnMgY29tYmluYXRpb24uIGF1dG89dHJ1ZSBhbmQgYXN5bmM9ZmFsc2UgaXMgaW52YWxpZC4gU2V0dGluZyBhc3luYz10cnVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBhc3luYyA9IHRydWU7XG4gICAgfVxuXG4gICAgdmFyIGJhdGNoO1xuICAgIHZhciBiYXRjaFNpemU7XG4gICAgdmFyIHRvcExldmVsO1xuICAgIHZhciBib3R0b21MZXZlbDtcblxuICAgIGNsZWFyQmF0Y2goKTtcblxuICAgIHZhciBhc3luY0ZyYW1lSGFuZGxlcjtcblxuICAgIGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGxldmVsLCBmbikge1xuICAgICAgICBpZighZm4pIHtcbiAgICAgICAgICAgIGZuID0gbGV2ZWw7XG4gICAgICAgICAgICBsZXZlbCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBpZihsZXZlbCA+IHRvcExldmVsKSB7XG4gICAgICAgICAgICB0b3BMZXZlbCA9IGxldmVsO1xuICAgICAgICB9IGVsc2UgaWYobGV2ZWwgPCBib3R0b21MZXZlbCkge1xuICAgICAgICAgICAgYm90dG9tTGV2ZWwgPSBsZXZlbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFiYXRjaFtsZXZlbF0pIHtcbiAgICAgICAgICAgIGJhdGNoW2xldmVsXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYXV0b1Byb2Nlc3MgJiYgYXN5bmMgJiYgYmF0Y2hTaXplID09PSAwKSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2hBc3luYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgYmF0Y2hbbGV2ZWxdLnB1c2goZm4pO1xuICAgICAgICBiYXRjaFNpemUrKztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb3JjZVByb2Nlc3NCYXRjaChwcm9jZXNzQXN5bmMpIHtcbiAgICAgICAgaWYocHJvY2Vzc0FzeW5jID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHByb2Nlc3NBc3luYyA9IGFzeW5jO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYXN5bmNGcmFtZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIGNhbmNlbEZyYW1lKGFzeW5jRnJhbWVIYW5kbGVyKTtcbiAgICAgICAgICAgIGFzeW5jRnJhbWVIYW5kbGVyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGFzeW5jKSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2hBc3luYygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvY2Vzc0JhdGNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzQmF0Y2goKSB7XG4gICAgICAgIGZvcih2YXIgbGV2ZWwgPSBib3R0b21MZXZlbDsgbGV2ZWwgPD0gdG9wTGV2ZWw7IGxldmVsKyspIHtcbiAgICAgICAgICAgIHZhciBmbnMgPSBiYXRjaFtsZXZlbF07XG5cbiAgICAgICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBmbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmbnNbaV07XG4gICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjbGVhckJhdGNoKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc0JhdGNoQXN5bmMoKSB7XG4gICAgICAgIGFzeW5jRnJhbWVIYW5kbGVyID0gcmVxdWVzdEZyYW1lKHByb2Nlc3NCYXRjaCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJCYXRjaCgpIHtcbiAgICAgICAgYmF0Y2ggICAgICAgICAgID0ge307XG4gICAgICAgIGJhdGNoU2l6ZSAgICAgICA9IDA7XG4gICAgICAgIHRvcExldmVsICAgICAgICA9IDA7XG4gICAgICAgIGJvdHRvbUxldmVsICAgICA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsRnJhbWUobGlzdGVuZXIpIHtcbiAgICAgICAgLy8gdmFyIGNhbmNlbCA9IHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cubW96Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdENhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5jbGVhclRpbWVvdXQ7XG4gICAgICAgIHZhciBjYW5jZWwgPSB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2FuY2VsKGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXF1ZXN0RnJhbWUoY2FsbGJhY2spIHtcbiAgICAgICAgLy8gdmFyIHJhZiA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IGZ1bmN0aW9uKGZuKSB7IHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgMjApOyB9O1xuICAgICAgICB2YXIgcmFmID0gZnVuY3Rpb24oZm4pIHsgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGZuLCAwKTsgfTtcbiAgICAgICAgcmV0dXJuIHJhZihjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgYWRkOiBhZGRGdW5jdGlvbixcbiAgICAgICAgZm9yY2U6IGZvcmNlUHJvY2Vzc0JhdGNoXG4gICAgfTtcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnV0aWxzLmdldE9wdGlvbiA9IGdldE9wdGlvbjtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRldGVjdG9yID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuZGV0ZWN0b3IuaXNJRSA9IGZ1bmN0aW9uKHZlcnNpb24pIHtcbiAgICBmdW5jdGlvbiBpc0FueUllVmVyc2lvbigpIHtcbiAgICAgICAgdmFyIGFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gYWdlbnQuaW5kZXhPZihcIm1zaWVcIikgIT09IC0xIHx8IGFnZW50LmluZGV4T2YoXCJ0cmlkZW50XCIpICE9PSAtMTtcbiAgICB9XG5cbiAgICBpZighaXNBbnlJZVZlcnNpb24oKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYoIXZlcnNpb24pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy9TaGFtZWxlc3NseSBzdG9sZW4gZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wYWRvbHNleS81Mjc2ODNcbiAgICB2YXIgaWVWZXJzaW9uID0gKGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciB1bmRlZixcbiAgICAgICAgICAgIHYgPSAzLFxuICAgICAgICAgICAgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSxcbiAgICAgICAgICAgIGFsbCA9IGRpdi5nZXRFbGVtZW50c0J5VGFnTmFtZShcImlcIik7XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgZGl2LmlubmVySFRNTCA9IFwiPCEtLVtpZiBndCBJRSBcIiArICgrK3YpICsgXCJdPjxpPjwvaT48IVtlbmRpZl0tLT5cIjtcbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoYWxsWzBdKTtcblxuICAgICAgICByZXR1cm4gdiA+IDQgPyB2IDogdW5kZWY7XG4gICAgfSgpKTtcblxuICAgIHJldHVybiB2ZXJzaW9uID09PSBpZVZlcnNpb247XG59O1xuXG5kZXRlY3Rvci5pc0xlZ2FjeU9wZXJhID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICEhd2luZG93Lm9wZXJhO1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vKipcbiAqIExvb3BzIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gYW5kIGNhbGxzIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50LiBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgcmV0dXJucyB0aGUgc2FtZSB2YWx1ZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Kn0gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBsb29wIHRocm91Z2guIE5lZWRzIHRvIGhhdmUgYSBsZW5ndGggcHJvcGVydHkgc2V0IGFuZCBoYXZlIGluZGljZXMgc2V0IGZyb20gMCB0byBsZW5ndGggLSAxLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBjYWxsYmFjay4gSWYgdGhpcyBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCB0aGUgc2FtZSB2YWx1ZSBpcyByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgdGhhdCBhIGNhbGxiYWNrIGhhcyByZXR1cm5lZCAoaWYgdHJ1dGh5KS4gT3RoZXJ3aXNlIG5vdGhpbmcuXG4gKi9cbnV0aWxzLmZvckVhY2ggPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaykge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBjYWxsYmFjayhjb2xsZWN0aW9uW2ldKTtcbiAgICAgICAgaWYocmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxufTtcbiIsIi8qKlxuICogUmVzaXplIGRldGVjdGlvbiBzdHJhdGVneSB0aGF0IGluamVjdHMgb2JqZWN0cyB0byBlbGVtZW50cyBpbiBvcmRlciB0byBkZXRlY3QgcmVzaXplIGV2ZW50cy5cbiAqIEhlYXZpbHkgaW5zcGlyZWQgYnk6IGh0dHA6Ly93d3cuYmFja2FsbGV5Y29kZXIuY29tLzIwMTMvMDMvMTgvY3Jvc3MtYnJvd3Nlci1ldmVudC1iYXNlZC1lbGVtZW50LXJlc2l6ZS1kZXRlY3Rpb24vXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBicm93c2VyRGV0ZWN0b3IgPSByZXF1aXJlKFwiLi4vYnJvd3Nlci1kZXRlY3RvclwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHJlcG9ydGVyICAgICAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGJhdGNoUHJvY2Vzc29yICA9IG9wdGlvbnMuYmF0Y2hQcm9jZXNzb3I7XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyByZXF1aXJlZCBkZXBlbmRlbmN5OiByZXBvcnRlci5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJlc2l6ZSBldmVudCBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IG9mIHRoZSBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBsaXN0ZW5lciBjYWxsYmFjay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICBpZighZ2V0T2JqZWN0KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50IGlzIG5vdCBkZXRlY3RhYmxlIGJ5IHRoaXMgc3RyYXRlZ3kuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbGlzdGVuZXJQcm94eSgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdCwgYnV0IHN1cHBvcnRzIHRoZSByZXNpemUgZXZlbnQgZGlyZWN0bHkgb24gZWxlbWVudHMuXG4gICAgICAgICAgICBlbGVtZW50LmF0dGFjaEV2ZW50KFwib25yZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgb2JqZWN0ID0gZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgICAgICAgICAgb2JqZWN0LmNvbnRlbnREb2N1bWVudC5kZWZhdWx0Vmlldy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIGxpc3RlbmVyUHJveHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZXMgYW4gZWxlbWVudCBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy4gV2lsbCBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICBmdW5jdGlvbiBpbmplY3RPYmplY3QoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciBPQkpFQ1RfU1RZTEUgPSBcImRpc3BsYXk6IGJsb2NrOyBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMDsgbGVmdDogMDsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgYm9yZGVyOiBub25lOyBwYWRkaW5nOiAwOyBtYXJnaW46IDA7IG9wYWNpdHk6IDA7IHotaW5kZXg6IC0xMDAwOyBwb2ludGVyLWV2ZW50czogbm9uZTtcIjtcblxuICAgICAgICAgICAgZnVuY3Rpb24gb25PYmplY3RMb2FkKCkge1xuICAgICAgICAgICAgICAgIC8qanNoaW50IHZhbGlkdGhpczogdHJ1ZSAqL1xuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gZ2V0RG9jdW1lbnQoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgLy9PcGVyYSAxMiBzZWVtIHRvIGNhbGwgdGhlIG9iamVjdC5vbmxvYWQgYmVmb3JlIHRoZSBhY3R1YWwgZG9jdW1lbnQgaGFzIGJlZW4gY3JlYXRlZC5cbiAgICAgICAgICAgICAgICAgICAgLy9TbyBpZiBpdCBpcyBub3QgcHJlc2VudCwgcG9sbCBpdCB3aXRoIGFuIHRpbWVvdXQgdW50aWwgaXQgaXMgcHJlc2VudC5cbiAgICAgICAgICAgICAgICAgICAgLy9UT0RPOiBDb3VsZCBtYXliZSBiZSBoYW5kbGVkIGJldHRlciB3aXRoIG9iamVjdC5vbnJlYWR5c3RhdGVjaGFuZ2Ugb3Igc2ltaWxhci5cbiAgICAgICAgICAgICAgICAgICAgaWYoIWVsZW1lbnQuY29udGVudERvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uIGNoZWNrRm9yT2JqZWN0RG9jdW1lbnQoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0RG9jdW1lbnQoZWxlbWVudCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSwgMTAwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudC5jb250ZW50RG9jdW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vTXV0YXRpbmcgdGhlIG9iamVjdCBlbGVtZW50IGhlcmUgc2VlbXMgdG8gZmlyZSBhbm90aGVyIGxvYWQgZXZlbnQuXG4gICAgICAgICAgICAgICAgLy9NdXRhdGluZyB0aGUgaW5uZXIgZG9jdW1lbnQgb2YgdGhlIG9iamVjdCBlbGVtZW50IGlzIGZpbmUgdGhvdWdoLlxuICAgICAgICAgICAgICAgIHZhciBvYmplY3RFbGVtZW50ID0gdGhpcztcblxuICAgICAgICAgICAgICAgIC8vQ3JlYXRlIHRoZSBzdHlsZSBlbGVtZW50IHRvIGJlIGFkZGVkIHRvIHRoZSBvYmplY3QuXG4gICAgICAgICAgICAgICAgZ2V0RG9jdW1lbnQob2JqZWN0RWxlbWVudCwgZnVuY3Rpb24gb25PYmplY3REb2N1bWVudFJlYWR5KG9iamVjdERvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1RoZSB0YXJnZXQgZWxlbWVudCBuZWVkcyB0byBiZSBwb3NpdGlvbmVkIChldmVyeXRoaW5nIGV4Y2VwdCBzdGF0aWMpIHNvIHRoZSBhYnNvbHV0ZSBwb3NpdGlvbmVkIG9iamVjdCB3aWxsIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHN0eWxlLnBvc2l0aW9uO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICAgICAgaWYocG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXi1cXGRcXC5dL2csIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBzdHlsZVtwcm9wZXJ0eV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIud2FybihcIkFuIGVsZW1lbnQgdGhhdCBpcyBwb3NpdGlvbmVkIHN0YXRpYyBoYXMgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiPVwiICsgdmFsdWUgKyBcIiB3aGljaCBpcyBpZ25vcmVkIGR1ZSB0byB0aGUgc3RhdGljIHBvc2l0aW9uaW5nLiBUaGUgZWxlbWVudCB3aWxsIG5lZWQgdG8gYmUgcG9zaXRpb25lZCByZWxhdGl2ZSwgc28gdGhlIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIiB3aWxsIGJlIHNldCB0byAwLiBFbGVtZW50OiBcIiwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL0FkZCBhbiBvYmplY3QgZWxlbWVudCBhcyBhIGNoaWxkIHRvIHRoZSB0YXJnZXQgZWxlbWVudCB0aGF0IHdpbGwgYmUgbGlzdGVuZWQgdG8gZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnN0eWxlLmNzc1RleHQgPSBPQkpFQ1RfU1RZTEU7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnR5cGUgPSBcInRleHQvaHRtbFwiO1xuICAgICAgICAgICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG5cbiAgICAgICAgICAgICAgICAvL1NhZmFyaTogVGhpcyBtdXN0IG9jY3VyIGJlZm9yZSBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIC8vSUU6IERvZXMgbm90IGxpa2UgdGhhdCB0aGlzIGhhcHBlbnMgYmVmb3JlLCBldmVuIGlmIGl0IGlzIGFsc28gYWRkZWQgYWZ0ZXIuXG4gICAgICAgICAgICAgICAgaWYoIWJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChvYmplY3QpO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuX2VyZE9iamVjdCA9IG9iamVjdDtcblxuICAgICAgICAgICAgICAgIC8vSUU6IFRoaXMgbXVzdCBvY2N1ciBhZnRlciBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihiYXRjaFByb2Nlc3Nvcikge1xuICAgICAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZChtdXRhdGVEb20pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtdXRhdGVEb20oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICAvL0lFIDggZG9lcyBub3Qgc3VwcG9ydCBvYmplY3RzIHByb3Blcmx5LiBMdWNraWx5IHRoZXkgZG8gc3VwcG9ydCB0aGUgcmVzaXplIGV2ZW50LlxuICAgICAgICAgICAgLy9TbyBkbyBub3QgaW5qZWN0IHRoZSBvYmplY3QgYW5kIG5vdGlmeSB0aGF0IHRoZSBlbGVtZW50IGlzIGFscmVhZHkgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAvL1RoZSBldmVudCBoYW5kbGVyIGZvciB0aGUgcmVzaXplIGV2ZW50IGlzIGF0dGFjaGVkIGluIHRoZSB1dGlscy5hZGRMaXN0ZW5lciBpbnN0ZWFkLlxuICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbmplY3RPYmplY3QoZWxlbWVudCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY2hpbGQgb2JqZWN0IG9mIHRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICogQHJldHVybnMgVGhlIG9iamVjdCBlbGVtZW50IG9mIHRoZSB0YXJnZXQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0T2JqZWN0KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZE9iamVjdDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIiwiLyoqXG4gKiBSZXNpemUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRoYXQgaW5qZWN0cyBkaXZzIHRvIGVsZW1lbnRzIGluIG9yZGVyIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9uIHNjcm9sbCBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwczovL2dpdGh1Yi5jb20vbWFyY2ovY3NzLWVsZW1lbnQtcXVlcmllcy9ibG9iL21hc3Rlci9zcmMvUmVzaXplU2Vuc29yLmpzXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFByb2Nlc3NvciAgPSBvcHRpb25zLmJhdGNoUHJvY2Vzc29yO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogcmVwb3J0ZXIuXCIpO1xuICAgIH1cblxuICAgIC8vVE9ETzogQ291bGQgdGhpcyBwZXJoYXBzIGJlIGRvbmUgYXQgaW5zdGFsbGF0aW9uIHRpbWU/XG4gICAgdmFyIHNjcm9sbGJhclNpemVzID0gZ2V0U2Nyb2xsYmFyU2l6ZXMoKTtcblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGNoYW5nZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBlbGVtZW50U3R5bGUgICAgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHdpZHRoICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUuaGVpZ2h0KTtcblxuICAgICAgICAgICAgLy8gU3RvcmUgdGhlIHNpemUgb2YgdGhlIGVsZW1lbnQgc3luYyBoZXJlLCBzbyB0aGF0IG11bHRpcGxlIHNjcm9sbCBldmVudHMgbWF5IGJlIGlnbm9yZWQgaW4gdGhlIGV2ZW50IGxpc3RlbmVycy5cbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSB0aGUgaWYtY2hlY2sgaW4gaGFuZGxlU2Nyb2xsIGlzIHVzZWxlc3MuXG4gICAgICAgICAgICBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuXG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQoZnVuY3Rpb24gdXBkYXRlRGV0ZWN0b3JFbGVtZW50cygpIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVDaGlsZFNpemVzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzKCkge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZVNjcm9sbCgpIHtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgICAgICB2YXIgd2lkdGggPSBwYXJzZVNpemUoc3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCA9IHBhcnNlU2l6ZShzdHlsZS5oZWlnaHQpO1xuXG4gICAgICAgICAgICBpZiAod2lkdGggIT09IGVsZW1lbnQubGFzdFdpZHRoIHx8IGhlaWdodCAhPT0gZWxlbWVudC5sYXN0SGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGFuZCA9IGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBzaHJpbmsgPSBnZXRTaHJpbmtFbGVtZW50KGVsZW1lbnQpO1xuXG4gICAgICAgIGFkZEV2ZW50KGV4cGFuZCwgXCJzY3JvbGxcIiwgaGFuZGxlU2Nyb2xsKTtcbiAgICAgICAgYWRkRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBoYW5kbGVTY3JvbGwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1ha2VzIGFuIGVsZW1lbnQgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuIFdpbGwgY2FsbCB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFrZSBkZXRlY3RhYmxlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy4gV2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgZWxlbWVudCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZURldGVjdGFibGUoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgLy8gUmVhZGluZyBwcm9wZXJ0aWVzIG9mIGVsZW1lbnRTdHlsZSB3aWxsIHJlc3VsdCBpbiBhIGZvcmNlZCBnZXRDb21wdXRlZFN0eWxlIGZvciBzb21lIGJyb3dzZXJzLCBzbyByZWFkIGFsbCB2YWx1ZXMgYW5kIHN0b3JlIHRoZW0gYXMgcHJpbWl0aXZlcyBoZXJlLlxuICAgICAgICB2YXIgZWxlbWVudFN0eWxlICAgICAgICA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgIHZhciBwb3NpdGlvbiAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLnBvc2l0aW9uO1xuICAgICAgICB2YXIgd2lkdGggICAgICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICB2YXIgaGVpZ2h0ICAgICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgdmFyIHRvcCAgICAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUudG9wO1xuICAgICAgICB2YXIgcmlnaHQgICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5yaWdodDtcbiAgICAgICAgdmFyIGJvdHRvbSAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUuYm90dG9tO1xuICAgICAgICB2YXIgbGVmdCAgICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5sZWZ0O1xuICAgICAgICB2YXIgcmVhZHlFeHBhbmRTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlTaHJpbmtTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlPdmVyYWxsICAgICAgICA9IGZhbHNlO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlYWR5KCkge1xuICAgICAgICAgICAgaWYocmVhZHlFeHBhbmRTY3JvbGwgJiYgcmVhZHlTaHJpbmtTY3JvbGwgJiYgcmVhZHlPdmVyYWxsKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICBpZihwb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgdmFsdWUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW14tXFxkXFwuXS9nLCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGVbcHJvcGVydHldID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvL0NoZWNrIHNvIHRoYXQgdGhlcmUgYXJlIG5vIGFjY2lkZW50YWwgc3R5bGVzIHRoYXQgd2lsbCBtYWtlIHRoZSBlbGVtZW50IHN0eWxlZCBkaWZmZXJlbnRseSBub3cgdGhhdCBpcyBpcyByZWxhdGl2ZS5cbiAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgdG9wLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgcmlnaHQsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGJvdHRvbSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGxlZnQsIFwibGVmdFwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gZ2V0Q29udGFpbmVyQ3NzVGV4dChsZWZ0LCB0b3AsIGJvdHRvbSwgcmlnaHQpIHtcbiAgICAgICAgICAgICAgICBsZWZ0ID0gKCFsZWZ0ID8gXCIwXCIgOiAobGVmdCArIFwicHhcIikpO1xuICAgICAgICAgICAgICAgIHRvcCA9ICghdG9wID8gXCIwXCIgOiAodG9wICsgXCJweFwiKSk7XG4gICAgICAgICAgICAgICAgYm90dG9tID0gKCFib3R0b20gPyBcIjBcIiA6IChib3R0b20gKyBcInB4XCIpKTtcbiAgICAgICAgICAgICAgICByaWdodCA9ICghcmlnaHQgPyBcIjBcIiA6IChyaWdodCArIFwicHhcIikpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiBcIiArIGxlZnQgKyBcIjsgdG9wOiBcIiArIHRvcCArIFwiOyByaWdodDogXCIgKyByaWdodCArIFwiOyBib3R0b206IFwiICsgYm90dG9tICsgXCI7IG92ZXJmbG93OiBzY3JvbGw7IHotaW5kZXg6IC0xOyB2aXNpYmlsaXR5OiBoaWRkZW47XCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzY3JvbGxiYXJXaWR0aCAgICAgICAgICA9IHNjcm9sbGJhclNpemVzLndpZHRoO1xuICAgICAgICAgICAgdmFyIHNjcm9sbGJhckhlaWdodCAgICAgICAgID0gc2Nyb2xsYmFyU2l6ZXMuaGVpZ2h0O1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lclN0eWxlICAgICAgICAgID0gZ2V0Q29udGFpbmVyQ3NzVGV4dCgtMSwgLTEsIC1zY3JvbGxiYXJIZWlnaHQsIC1zY3JvbGxiYXJXaWR0aCk7XG4gICAgICAgICAgICB2YXIgc2hyaW5rRXhwYW5kc3R5bGUgICAgICAgPSBnZXRDb250YWluZXJDc3NUZXh0KDAsIDAsIC1zY3JvbGxiYXJIZWlnaHQsIC1zY3JvbGxiYXJXaWR0aCk7XG4gICAgICAgICAgICB2YXIgc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZSAgPSBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogMDsgdG9wOiAwO1wiO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIGV4cGFuZCAgICAgICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBleHBhbmRDaGlsZCAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgc2hyaW5rICAgICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIHNocmlua0NoaWxkICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmNzc1RleHQgICAgID0gY29udGFpbmVyU3R5bGU7XG4gICAgICAgICAgICBleHBhbmQuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGU7XG4gICAgICAgICAgICBzaHJpbmsuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIHNocmlua0NoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGUgKyBcIiB3aWR0aDogMjAwJTsgaGVpZ2h0OiAyMDAlO1wiO1xuXG4gICAgICAgICAgICBleHBhbmQuYXBwZW5kQ2hpbGQoZXhwYW5kQ2hpbGQpO1xuICAgICAgICAgICAgc2hyaW5rLmFwcGVuZENoaWxkKHNocmlua0NoaWxkKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChleHBhbmQpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHNocmluayk7XG4gICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gICAgICAgICAgICBlbGVtZW50Ll9lcmRFbGVtZW50ID0gY29udGFpbmVyO1xuXG4gICAgICAgICAgICBhZGRFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RFeHBhbmRTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBvbkZpcnN0RXhwYW5kU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeUV4cGFuZFNjcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhZGRFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RTaHJpbmtTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBvbkZpcnN0U2hyaW5rU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeVNocmlua1Njcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB1cGRhdGVDaGlsZFNpemVzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZmluYWxpemVEb21NdXRhdGlvbigpIHtcbiAgICAgICAgICAgIHN0b3JlQ3VycmVudFNpemUoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICByZWFkeU92ZXJhbGwgPSB0cnVlO1xuICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQobXV0YXRlRG9tKTtcbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmaW5hbGl6ZURvbU11dGF0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgZmluYWxpemVEb21NdXRhdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50Ll9lcmRFbGVtZW50LmNoaWxkTm9kZXNbMF07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kQ2hpbGRFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCkuY2hpbGROb2Rlc1swXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZEVsZW1lbnQuY2hpbGROb2Rlc1sxXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKyAxMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKiAyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kQ2hpbGQgICAgICAgICAgICAgPSBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgICAgICAgICAgPSBnZXRFeHBhbmRTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLndpZHRoICAgICA9IGV4cGFuZFdpZHRoICsgXCJweFwiO1xuICAgICAgICBleHBhbmRDaGlsZC5zdHlsZS5oZWlnaHQgICAgPSBleHBhbmRIZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGVsZW1lbnQubGFzdFdpZHRoICAgPSB3aWR0aDtcbiAgICAgICAgZWxlbWVudC5sYXN0SGVpZ2h0ICA9IGhlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayAgICAgICAgICA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgPSBnZXRFeHBhbmRTaXplKHdpZHRoKTtcbiAgICAgICAgdmFyIGV4cGFuZEhlaWdodCAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgdmFyIHNocmlua1dpZHRoICAgICA9IGdldFNocmlua1NpemUod2lkdGgpO1xuICAgICAgICB2YXIgc2hyaW5rSGVpZ2h0ICAgID0gZ2V0U2hyaW5rU2l6ZShoZWlnaHQpO1xuICAgICAgICBleHBhbmQuc2Nyb2xsTGVmdCAgID0gZXhwYW5kV2lkdGg7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxUb3AgICAgPSBleHBhbmRIZWlnaHQ7XG4gICAgICAgIHNocmluay5zY3JvbGxMZWZ0ICAgPSBzaHJpbmtXaWR0aDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbFRvcCAgICA9IHNocmlua0hlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRFdmVudChlbCwgbmFtZSwgY2IpIHtcbiAgICAgICAgaWYgKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5hdHRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZihlbC5hdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgZWwuZGV0YWNoRXZlbnQoXCJvblwiICsgbmFtZSwgY2IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBjYik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVNpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChzaXplLnJlcGxhY2UoL3B4LywgXCJcIikpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNjcm9sbGJhclNpemVzKCkge1xuICAgICAgICB2YXIgd2lkdGggPSA1MDA7XG4gICAgICAgIHZhciBoZWlnaHQgPSA1MDA7XG5cbiAgICAgICAgdmFyIGNoaWxkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgY2hpbGQuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCoyICsgXCJweDsgaGVpZ2h0OiBcIiArIGhlaWdodCoyICsgXCJweDsgdmlzaWJpbGl0eTogaGlkZGVuO1wiO1xuXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCArIFwicHg7IGhlaWdodDogXCIgKyBoZWlnaHQgKyBcInB4OyBvdmVyZmxvdzogc2Nyb2xsOyB2aXNpYmlsaXR5OiBub25lOyB0b3A6IFwiICsgLXdpZHRoKjMgKyBcInB4OyBsZWZ0OiBcIiArIC1oZWlnaHQqMyArIFwicHg7IHZpc2liaWxpdHk6IGhpZGRlbjtcIjtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgZG9jdW1lbnQuYm9keS5maXJzdENoaWxkKTtcblxuICAgICAgICB2YXIgd2lkdGhTaXplID0gd2lkdGggLSBjb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciBoZWlnaHRTaXplID0gaGVpZ2h0IC0gY29udGFpbmVyLmNsaWVudEhlaWdodDtcblxuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGNvbnRhaW5lcik7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aFNpemUsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFNpemVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcbnZhciBlbGVtZW50VXRpbHNNYWtlciAgICAgICA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG52YXIgbGlzdGVuZXJIYW5kbGVyTWFrZXIgICAgPSByZXF1aXJlKFwiLi9saXN0ZW5lci1oYW5kbGVyXCIpO1xudmFyIGlkR2VuZXJhdG9yTWFrZXIgICAgICAgID0gcmVxdWlyZShcIi4vaWQtZ2VuZXJhdG9yXCIpO1xudmFyIGlkSGFuZGxlck1ha2VyICAgICAgICAgID0gcmVxdWlyZShcIi4vaWQtaGFuZGxlclwiKTtcbnZhciByZXBvcnRlck1ha2VyICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3JlcG9ydGVyXCIpO1xudmFyIGJyb3dzZXJEZXRlY3RvciAgICAgICAgID0gcmVxdWlyZShcIi4vYnJvd3Nlci1kZXRlY3RvclwiKTtcbnZhciBiYXRjaFByb2Nlc3Nvck1ha2VyICAgICA9IHJlcXVpcmUoXCJiYXRjaC1wcm9jZXNzb3JcIik7XG5cbi8vRGV0ZWN0aW9uIHN0cmF0ZWdpZXMuXG52YXIgb2JqZWN0U3RyYXRlZ3lNYWtlciAgICAgPSByZXF1aXJlKFwiLi9kZXRlY3Rpb24tc3RyYXRlZ3kvb2JqZWN0LmpzXCIpO1xudmFyIHNjcm9sbFN0cmF0ZWd5TWFrZXIgICAgID0gcmVxdWlyZShcIi4vZGV0ZWN0aW9uLXN0cmF0ZWd5L3Njcm9sbC5qc1wiKTtcblxuLyoqXG4gKiBAdHlwZWRlZiBpZEhhbmRsZXJcbiAqIEB0eXBlIHtvYmplY3R9XG4gKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBnZXQgR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gc2V0IEdlbmVyYXRlIGFuZCBzZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKi9cblxuLyoqXG4gKiBAdHlwZWRlZiBPcHRpb25zXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtib29sZWFufSBjYWxsT25BZGQgICAgRGV0ZXJtaW5lcyBpZiBsaXN0ZW5lcnMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuIHRoZXkgYXJlIGdldHRpbmcgYWRkZWQuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRGVmYXVsdCBpcyB0cnVlLiBJZiB0cnVlLCB0aGUgbGlzdGVuZXIgaXMgZ3VhcmFudGVlZCB0byBiZSBjYWxsZWQgd2hlbiBpdCBoYXMgYmVlbiBhZGRlZC4gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBmYWxzZSwgdGhlIGxpc3RlbmVyIHdpbGwgbm90IGJlIGd1YXJlbnRlZWQgdG8gYmUgY2FsbGVkIHdoZW4gaXQgaGFzIGJlZW4gYWRkZWQgKGRvZXMgbm90IHByZXZlbnQgaXQgZnJvbSBiZWluZyBjYWxsZWQpLlxuICogQHByb3BlcnR5IHtpZEhhbmRsZXJ9IGlkSGFuZGxlciAgQSBjdXN0b20gaWQgaGFuZGxlciB0aGF0IGlzIHJlc3BvbnNpYmxlIGZvciBnZW5lcmF0aW5nLCBzZXR0aW5nIGFuZCByZXRyaWV2aW5nIGlkJ3MgZm9yIGVsZW1lbnRzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgbm90IHByb3ZpZGVkLCBhIGRlZmF1bHQgaWQgaGFuZGxlciB3aWxsIGJlIHVzZWQuXG4gKiBAcHJvcGVydHkge3JlcG9ydGVyfSByZXBvcnRlciAgICBBIGN1c3RvbSByZXBvcnRlciB0aGF0IGhhbmRsZXMgcmVwb3J0aW5nIGxvZ3MsIHdhcm5pbmdzIGFuZCBlcnJvcnMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgbm90IHByb3ZpZGVkLCBhIGRlZmF1bHQgaWQgaGFuZGxlciB3aWxsIGJlIHVzZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBzZXQgdG8gZmFsc2UsIHRoZW4gbm90aGluZyB3aWxsIGJlIHJlcG9ydGVkLlxuICovXG5cbi8qKlxuICogQ3JlYXRlcyBhbiBlbGVtZW50IHJlc2l6ZSBkZXRlY3RvciBpbnN0YW5jZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgZ2xvYmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgd2lsbCBkZWNpZGUgaG93IHRoaXMgaW5zdGFuY2Ugd2lsbCB3b3JrLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIC8vaWRIYW5kbGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBpZEhhbmRsZXIgPSBvcHRpb25zLmlkSGFuZGxlcjtcblxuICAgIGlmKCFpZEhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGlkR2VuZXJhdG9yID0gaWRHZW5lcmF0b3JNYWtlcigpO1xuICAgICAgICB2YXIgZGVmYXVsdElkSGFuZGxlciA9IGlkSGFuZGxlck1ha2VyKGlkR2VuZXJhdG9yKTtcbiAgICAgICAgaWRIYW5kbGVyID0gZGVmYXVsdElkSGFuZGxlcjtcbiAgICB9XG5cbiAgICAvL3JlcG9ydGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciByZXBvcnRlciA9IG9wdGlvbnMucmVwb3J0ZXI7XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgLy9JZiBvcHRpb25zLnJlcG9ydGVyIGlzIGZhbHNlLCB0aGVuIHRoZSByZXBvcnRlciBzaG91bGQgYmUgcXVpZXQuXG4gICAgICAgIHZhciBxdWlldCA9IHJlcG9ydGVyID09PSBmYWxzZTtcbiAgICAgICAgcmVwb3J0ZXIgPSByZXBvcnRlck1ha2VyKHF1aWV0KTtcbiAgICB9XG5cbiAgICAvL2JhdGNoUHJvY2Vzc29yIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBiYXRjaFByb2Nlc3NvciA9IGdldE9wdGlvbihvcHRpb25zLCBcImJhdGNoUHJvY2Vzc29yXCIsIGJhdGNoUHJvY2Vzc29yTWFrZXIoeyByZXBvcnRlcjogcmVwb3J0ZXIgfSkpO1xuXG4gICAgLy9PcHRpb25zIHRvIGJlIHVzZWQgYXMgZGVmYXVsdCBmb3IgdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIHZhciBnbG9iYWxPcHRpb25zID0ge307XG4gICAgZ2xvYmFsT3B0aW9ucy5jYWxsT25BZGQgICAgID0gISFnZXRPcHRpb24ob3B0aW9ucywgXCJjYWxsT25BZGRcIiwgdHJ1ZSk7XG5cbiAgICB2YXIgZXZlbnRMaXN0ZW5lckhhbmRsZXIgICAgPSBsaXN0ZW5lckhhbmRsZXJNYWtlcihpZEhhbmRsZXIpO1xuICAgIHZhciBlbGVtZW50VXRpbHMgICAgICAgICAgICA9IGVsZW1lbnRVdGlsc01ha2VyKCk7XG5cbiAgICAvL1RoZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdG8gYmUgdXNlZC5cbiAgICB2YXIgZGV0ZWN0aW9uU3RyYXRlZ3k7XG4gICAgdmFyIGRlc2lyZWRTdHJhdGVneSA9IGdldE9wdGlvbihvcHRpb25zLCBcInN0cmF0ZWd5XCIsIFwib2JqZWN0XCIpO1xuICAgIHZhciBzdHJhdGVneU9wdGlvbnMgPSB7XG4gICAgICAgIHJlcG9ydGVyOiByZXBvcnRlcixcbiAgICAgICAgYmF0Y2hQcm9jZXNzb3I6IGJhdGNoUHJvY2Vzc29yXG4gICAgfTtcblxuICAgIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJzY3JvbGxcIiAmJiBicm93c2VyRGV0ZWN0b3IuaXNMZWdhY3lPcGVyYSgpKSB7XG4gICAgICAgIHJlcG9ydGVyLndhcm4oXCJTY3JvbGwgc3RyYXRlZ3kgaXMgbm90IHN1cHBvcnRlZCBvbiBsZWdhY3kgT3BlcmEuIENoYW5naW5nIHRvIG9iamVjdCBzdHJhdGVneS5cIik7XG4gICAgICAgIGRlc2lyZWRTdHJhdGVneSA9IFwib2JqZWN0XCI7XG4gICAgfVxuXG4gICAgaWYoZGVzaXJlZFN0cmF0ZWd5ID09PSBcInNjcm9sbFwiKSB7XG4gICAgICAgIGRldGVjdGlvblN0cmF0ZWd5ID0gc2Nyb2xsU3RyYXRlZ3lNYWtlcihzdHJhdGVneU9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZihkZXNpcmVkU3RyYXRlZ3kgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgZGV0ZWN0aW9uU3RyYXRlZ3kgPSBvYmplY3RTdHJhdGVneU1ha2VyKHN0cmF0ZWd5T3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBzdHJhdGVneSBuYW1lOiBcIiArIGRlc2lyZWRTdHJhdGVneSk7XG4gICAgfVxuXG4gICAgLy9DYWxscyBjYW4gYmUgbWFkZSB0byBsaXN0ZW5UbyB3aXRoIGVsZW1lbnRzIHRoYXQgYXJlIHN0aWxsIGFyZSBiZWluZyBpbnN0YWxsZWQuXG4gICAgLy9BbHNvLCBzYW1lIGVsZW1lbnRzIGNhbiBvY2N1ciBpbiB0aGUgZWxlbWVudHMgbGlzdCBpbiB0aGUgbGlzdGVuVG8gZnVuY3Rpb24uXG4gICAgLy9XaXRoIHRoaXMgbWFwLCB0aGUgcmVhZHkgY2FsbGJhY2tzIGNhbiBiZSBzeW5jaHJvbml6ZWQgYmV0d2VlbiB0aGUgY2FsbHNcbiAgICAvL3NvIHRoYXQgdGhlIHJlYWR5IGNhbGxiYWNrIGNhbiBhbHdheXMgYmUgY2FsbGVkIHdoZW4gYW4gZWxlbWVudCBpcyByZWFkeSAtIGV2ZW4gaWZcbiAgICAvL2l0IHdhc24ndCBpbnN0YWxsZWQgZnJvbSB0aGUgZnVuY3Rpb24gaW50c2VsZi5cbiAgICB2YXIgb25SZWFkeUNhbGxiYWNrcyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogTWFrZXMgdGhlIGdpdmVuIGVsZW1lbnRzIHJlc2l6ZS1kZXRlY3RhYmxlIGFuZCBzdGFydHMgbGlzdGVuaW5nIHRvIHJlc2l6ZSBldmVudHMgb24gdGhlIGVsZW1lbnRzLiBDYWxscyB0aGUgZXZlbnQgY2FsbGJhY2sgZm9yIGVhY2ggZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtPcHRpb25zP30gb3B0aW9ucyBPcHRpb25hbCBvcHRpb25zIG9iamVjdC4gVGhlc2Ugb3B0aW9ucyB3aWxsIG92ZXJyaWRlIHRoZSBnbG9iYWwgb3B0aW9ucy4gU29tZSBvcHRpb25zIG1heSBub3QgYmUgb3ZlcnJpZGVuLCBzdWNoIGFzIGlkSGFuZGxlci5cbiAgICAgKiBAcGFyYW0ge2VsZW1lbnRbXXxlbGVtZW50fSBlbGVtZW50cyBUaGUgZ2l2ZW4gYXJyYXkgb2YgZWxlbWVudHMgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb2YuIFNpbmdsZSBlbGVtZW50IGlzIGFsc28gdmFsaWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRvIGJlIGV4ZWN1dGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGxpc3RlblRvKG9wdGlvbnMsIGVsZW1lbnRzLCBsaXN0ZW5lcikge1xuICAgICAgICBmdW5jdGlvbiBvblJlc2l6ZUNhbGxiYWNrKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVySGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGZvckVhY2gobGlzdGVuZXJzLCBmdW5jdGlvbiBjYWxsTGlzdGVuZXJQcm94eShsaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVySGFuZGxlci5hZGQoZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZihjYWxsT25BZGQpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vT3B0aW9ucyBvYmplY3QgbWF5IGJlIG9taXR0ZWQuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgbGlzdGVuZXIgPSBlbGVtZW50cztcbiAgICAgICAgICAgIGVsZW1lbnRzID0gb3B0aW9ucztcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFlbGVtZW50cykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXQgbGVhc3Qgb25lIGVsZW1lbnQgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMaXN0ZW5lciByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZihlbGVtZW50cy5sZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZWxlbWVudHMgPSBbZWxlbWVudHNdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVsZW1lbnRzUmVhZHkgPSAwO1xuXG4gICAgICAgIHZhciBjYWxsT25BZGQgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJjYWxsT25BZGRcIiwgZ2xvYmFsT3B0aW9ucy5jYWxsT25BZGQpO1xuICAgICAgICB2YXIgb25SZWFkeUNhbGxiYWNrID0gZ2V0T3B0aW9uKG9wdGlvbnMsIFwib25SZWFkeVwiLCBmdW5jdGlvbiBub29wKCkge30pO1xuXG4gICAgICAgIGZvckVhY2goZWxlbWVudHMsIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVyVG9FbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmKCFlbGVtZW50VXRpbHMuaXNEZXRlY3RhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgaWYoZWxlbWVudFV0aWxzLmlzQnVzeShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgICAgICAvL1RoZSBlbGVtZW50IGlzIGJlaW5nIHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUuIERvIG5vdCBtYWtlIGl0IGRldGVjdGFibGUuXG4gICAgICAgICAgICAgICAgICAgIC8vSnVzdCBhZGQgdGhlIGxpc3RlbmVyLCBiZWNhdXNlIHRoZSBlbGVtZW50IHdpbGwgc29vbiBiZSBkZXRlY3RhYmxlLlxuICAgICAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrc1tpZF0gPSBvblJlYWR5Q2FsbGJhY2tzW2lkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrc1tpZF0ucHVzaChmdW5jdGlvbiBvblJlYWR5KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL1RoZSBlbGVtZW50IGlzIG5vdCBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLCBzbyBkbyBwcmVwYXJlIGl0IGFuZCBhZGQgYSBsaXN0ZW5lciB0byBpdC5cbiAgICAgICAgICAgICAgICBlbGVtZW50VXRpbHMubWFya0J1c3koZWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRldGVjdGlvblN0cmF0ZWd5Lm1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGZ1bmN0aW9uIG9uRWxlbWVudERldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50VXRpbHMubWFya0FzRGV0ZWN0YWJsZShlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtCdXN5KGVsZW1lbnQsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uU3RyYXRlZ3kuYWRkTGlzdGVuZXIoZWxlbWVudCwgb25SZXNpemVDYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcbiAgICAgICAgICAgICAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmKG9uUmVhZHlDYWxsYmFja3NbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JFYWNoKG9uUmVhZHlDYWxsYmFja3NbaWRdLCBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBvblJlYWR5Q2FsbGJhY2tzW2lkXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1RoZSBlbGVtZW50IGhhcyBiZWVuIHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUgYW5kIGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIHRvLlxuICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBsaXN0ZW5UbzogbGlzdGVuVG9cbiAgICB9O1xufTtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAvKipcbiAgICAgKiBUZWxscyBpZiB0aGUgZWxlbWVudCBoYXMgYmVlbiBtYWRlIGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIGNoZWNrLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiB0aGUgZWxlbWVudCBpcyBkZXRlY3RhYmxlIG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0RldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gISFlbGVtZW50Ll9lcmRJc0RldGVjdGFibGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFya3MgdGhlIGVsZW1lbnQgdGhhdCBpdCBoYXMgYmVlbiBtYWRlIGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIG1hcmsuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFya0FzRGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgIGVsZW1lbnQuX2VyZElzRGV0ZWN0YWJsZSA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVsbHMgaWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gY2hlY2suXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzQnVzeShlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAhIWVsZW1lbnQuX2VyZEJ1c3k7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFya3MgdGhlIG9iamVjdCBpcyBidXN5IGFuZCBzaG91bGQgbm90IGJlIG1hZGUgZGV0ZWN0YWJsZS5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1hcmsuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBidXN5IElmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1hcmtCdXN5KGVsZW1lbnQsIGJ1c3kpIHtcbiAgICAgICAgZWxlbWVudC5fZXJkQnVzeSA9ICEhYnVzeTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpc0RldGVjdGFibGU6IGlzRGV0ZWN0YWJsZSxcbiAgICAgICAgbWFya0FzRGV0ZWN0YWJsZTogbWFya0FzRGV0ZWN0YWJsZSxcbiAgICAgICAgaXNCdXN5OiBpc0J1c3ksXG4gICAgICAgIG1hcmtCdXN5OiBtYXJrQnVzeVxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGlkQ291bnQgPSAxO1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgbmV3IHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHJldHVybnMge251bWJlcn0gQSB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2VuZXJhdGUoKSB7XG4gICAgICAgIHJldHVybiBpZENvdW50Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2VuZXJhdGU6IGdlbmVyYXRlXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEdlbmVyYXRvcikge1xuICAgIHZhciBJRF9QUk9QX05BTUUgPSBcIl9lcmRUYXJnZXRJZFwiO1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LiBJZiB0aGUgZWxlbWVudCBkb2VzIG5vdCBoYXZlIGFuIGlkLCBvbmUgd2lsbCBiZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudCB0byBnZXQgdGhlIGlkIG9mLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbj99IHJlYWRvbmx5IEFuIGlkIHdpbGwgbm90IGJlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IGlmIHRoZSByZWFkb25seSBwYXJhbWV0ZXIgaXMgdHJ1ZS4gRGVmYXVsdCBpcyBmYWxzZS5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfG51bWJlcn0gVGhlIGlkIG9mIHRoZSBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldElkKGVsZW1lbnQsIHJlYWRvbmx5KSB7XG4gICAgICAgIGlmKCFyZWFkb25seSAmJiAhaGFzSWQoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHNldElkKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnRbSURfUFJPUF9OQU1FXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRJZChlbGVtZW50KSB7XG4gICAgICAgIHZhciBpZCA9IGlkR2VuZXJhdG9yLmdlbmVyYXRlKCk7XG5cbiAgICAgICAgZWxlbWVudFtJRF9QUk9QX05BTUVdID0gaWQ7XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhc0lkKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRbSURfUFJPUF9OQU1FXSAhPT0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0SWRcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkSGFuZGxlcikge1xuICAgIHZhciBldmVudExpc3RlbmVycyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyBhbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIGdldCBhbGwgbGlzdGVuZXJzIGZvci5cbiAgICAgKiBAcmV0dXJucyBBbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZXZlbnRMaXN0ZW5lcnNbaWRIYW5kbGVyLmdldChlbGVtZW50KV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RvcmVzIHRoZSBnaXZlbiBsaXN0ZW5lciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuIFdpbGwgbm90IGFjdHVhbGx5IGFkZCB0aGUgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgY2FsbGJhY2sgdGhhdCB0aGUgZWxlbWVudCBoYXMgYWRkZWQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICBpZighZXZlbnRMaXN0ZW5lcnNbaWRdKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVyc1tpZF0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXS5wdXNoKGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldExpc3RlbmVycyxcbiAgICAgICAgYWRkOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qIGdsb2JhbCBjb25zb2xlOiBmYWxzZSAqL1xuXG4vKipcbiAqIFJlcG9ydGVyIHRoYXQgaGFuZGxlcyB0aGUgcmVwb3J0aW5nIG9mIGxvZ3MsIHdhcm5pbmdzIGFuZCBlcnJvcnMuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHF1aWV0IFRlbGxzIGlmIHRoZSByZXBvcnRlciBzaG91bGQgYmUgcXVpZXQgb3Igbm90LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHF1aWV0KSB7XG4gICAgZnVuY3Rpb24gbm9vcCgpIHtcbiAgICAgICAgLy9Eb2VzIG5vdGhpbmcuXG4gICAgfVxuXG4gICAgdmFyIHJlcG9ydGVyID0ge1xuICAgICAgICBsb2c6IG5vb3AsXG4gICAgICAgIHdhcm46IG5vb3AsXG4gICAgICAgIGVycm9yOiBub29wXG4gICAgfTtcblxuICAgIGlmKCFxdWlldCAmJiB3aW5kb3cuY29uc29sZSkge1xuICAgICAgICB2YXIgYXR0YWNoRnVuY3Rpb24gPSBmdW5jdGlvbihyZXBvcnRlciwgbmFtZSkge1xuICAgICAgICAgICAgLy9UaGUgcHJveHkgaXMgbmVlZGVkIHRvIGJlIGFibGUgdG8gY2FsbCB0aGUgbWV0aG9kIHdpdGggdGhlIGNvbnNvbGUgY29udGV4dCxcbiAgICAgICAgICAgIC8vc2luY2Ugd2UgY2Fubm90IHVzZSBiaW5kLlxuICAgICAgICAgICAgcmVwb3J0ZXJbbmFtZV0gPSBmdW5jdGlvbiByZXBvcnRlclByb3h5KCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0uYXBwbHkoY29uc29sZSwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwibG9nXCIpO1xuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJ3YXJuXCIpO1xuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJlcnJvclwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVwb3J0ZXI7XG59OyJdfQ==
