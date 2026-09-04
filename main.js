/*
AskMyu — Obsidian plugin. Bundled from packages/obsidian in the askmyu-frontend
monorepo; the public mirror (AskMyu/askmyu-obsidian-plugin) carries the same source.
*/
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../../node_modules/event-source-polyfill/src/eventsource.js
var require_eventsource = __commonJS({
  "../../node_modules/event-source-polyfill/src/eventsource.js"(exports, module2) {
    (function(global) {
      "use strict";
      var setTimeout = global.setTimeout;
      var clearTimeout = global.clearTimeout;
      var XMLHttpRequest = global.XMLHttpRequest;
      var XDomainRequest = global.XDomainRequest;
      var ActiveXObject = global.ActiveXObject;
      var NativeEventSource = global.EventSource;
      var document2 = global.document;
      var Promise2 = global.Promise;
      var fetch = global.fetch;
      var Response = global.Response;
      var TextDecoder2 = global.TextDecoder;
      var TextEncoder2 = global.TextEncoder;
      var AbortController = global.AbortController;
      if (typeof window !== "undefined" && typeof document2 !== "undefined" && !("readyState" in document2) && document2.body == null) {
        document2.readyState = "loading";
        window.addEventListener("load", function(event) {
          document2.readyState = "complete";
        }, false);
      }
      if (XMLHttpRequest == null && ActiveXObject != null) {
        XMLHttpRequest = function() {
          return new ActiveXObject("Microsoft.XMLHTTP");
        };
      }
      if (Object.create == void 0) {
        Object.create = function(C) {
          function F() {
          }
          F.prototype = C;
          return new F();
        };
      }
      if (!Date.now) {
        Date.now = function now() {
          return (/* @__PURE__ */ new Date()).getTime();
        };
      }
      if (AbortController == void 0) {
        var originalFetch2 = fetch;
        fetch = function(url, options) {
          var signal = options.signal;
          return originalFetch2(url, { headers: options.headers, credentials: options.credentials, cache: options.cache }).then(function(response) {
            var reader = response.body.getReader();
            signal._reader = reader;
            if (signal._aborted) {
              signal._reader.cancel();
            }
            return {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: {
                getReader: function() {
                  return reader;
                }
              }
            };
          });
        };
        AbortController = function() {
          this.signal = {
            _reader: null,
            _aborted: false
          };
          this.abort = function() {
            if (this.signal._reader != null) {
              this.signal._reader.cancel();
            }
            this.signal._aborted = true;
          };
        };
      }
      function TextDecoderPolyfill() {
        this.bitsNeeded = 0;
        this.codePoint = 0;
      }
      TextDecoderPolyfill.prototype.decode = function(octets) {
        function valid(codePoint2, shift, octetsCount2) {
          if (octetsCount2 === 1) {
            return codePoint2 >= 128 >> shift && codePoint2 << shift <= 2047;
          }
          if (octetsCount2 === 2) {
            return codePoint2 >= 2048 >> shift && codePoint2 << shift <= 55295 || codePoint2 >= 57344 >> shift && codePoint2 << shift <= 65535;
          }
          if (octetsCount2 === 3) {
            return codePoint2 >= 65536 >> shift && codePoint2 << shift <= 1114111;
          }
          throw new Error();
        }
        function octetsCount(bitsNeeded2, codePoint2) {
          if (bitsNeeded2 === 6 * 1) {
            return codePoint2 >> 6 > 15 ? 3 : codePoint2 > 31 ? 2 : 1;
          }
          if (bitsNeeded2 === 6 * 2) {
            return codePoint2 > 15 ? 3 : 2;
          }
          if (bitsNeeded2 === 6 * 3) {
            return 3;
          }
          throw new Error();
        }
        var REPLACER = 65533;
        var string = "";
        var bitsNeeded = this.bitsNeeded;
        var codePoint = this.codePoint;
        for (var i = 0; i < octets.length; i += 1) {
          var octet = octets[i];
          if (bitsNeeded !== 0) {
            if (octet < 128 || octet > 191 || !valid(codePoint << 6 | octet & 63, bitsNeeded - 6, octetsCount(bitsNeeded, codePoint))) {
              bitsNeeded = 0;
              codePoint = REPLACER;
              string += String.fromCharCode(codePoint);
            }
          }
          if (bitsNeeded === 0) {
            if (octet >= 0 && octet <= 127) {
              bitsNeeded = 0;
              codePoint = octet;
            } else if (octet >= 192 && octet <= 223) {
              bitsNeeded = 6 * 1;
              codePoint = octet & 31;
            } else if (octet >= 224 && octet <= 239) {
              bitsNeeded = 6 * 2;
              codePoint = octet & 15;
            } else if (octet >= 240 && octet <= 247) {
              bitsNeeded = 6 * 3;
              codePoint = octet & 7;
            } else {
              bitsNeeded = 0;
              codePoint = REPLACER;
            }
            if (bitsNeeded !== 0 && !valid(codePoint, bitsNeeded, octetsCount(bitsNeeded, codePoint))) {
              bitsNeeded = 0;
              codePoint = REPLACER;
            }
          } else {
            bitsNeeded -= 6;
            codePoint = codePoint << 6 | octet & 63;
          }
          if (bitsNeeded === 0) {
            if (codePoint <= 65535) {
              string += String.fromCharCode(codePoint);
            } else {
              string += String.fromCharCode(55296 + (codePoint - 65535 - 1 >> 10));
              string += String.fromCharCode(56320 + (codePoint - 65535 - 1 & 1023));
            }
          }
        }
        this.bitsNeeded = bitsNeeded;
        this.codePoint = codePoint;
        return string;
      };
      var supportsStreamOption = function() {
        try {
          return new TextDecoder2().decode(new TextEncoder2().encode("test"), { stream: true }) === "test";
        } catch (error) {
          console.debug("TextDecoder does not support streaming option. Using polyfill instead: " + error);
        }
        return false;
      };
      if (TextDecoder2 == void 0 || TextEncoder2 == void 0 || !supportsStreamOption()) {
        TextDecoder2 = TextDecoderPolyfill;
      }
      var k = function() {
      };
      function XHRWrapper(xhr) {
        this.withCredentials = false;
        this.readyState = 0;
        this.status = 0;
        this.statusText = "";
        this.responseText = "";
        this.onprogress = k;
        this.onload = k;
        this.onerror = k;
        this.onreadystatechange = k;
        this._contentType = "";
        this._xhr = xhr;
        this._sendTimeout = 0;
        this._abort = k;
      }
      XHRWrapper.prototype.open = function(method, url) {
        this._abort(true);
        var that = this;
        var xhr = this._xhr;
        var state = 1;
        var timeout = 0;
        this._abort = function(silent) {
          if (that._sendTimeout !== 0) {
            clearTimeout(that._sendTimeout);
            that._sendTimeout = 0;
          }
          if (state === 1 || state === 2 || state === 3) {
            state = 4;
            xhr.onload = k;
            xhr.onerror = k;
            xhr.onabort = k;
            xhr.onprogress = k;
            xhr.onreadystatechange = k;
            xhr.abort();
            if (timeout !== 0) {
              clearTimeout(timeout);
              timeout = 0;
            }
            if (!silent) {
              that.readyState = 4;
              that.onabort(null);
              that.onreadystatechange();
            }
          }
          state = 0;
        };
        var onStart = function() {
          if (state === 1) {
            var status = 0;
            var statusText = "";
            var contentType = void 0;
            if (!("contentType" in xhr)) {
              try {
                status = xhr.status;
                statusText = xhr.statusText;
                contentType = xhr.getResponseHeader("Content-Type");
              } catch (error) {
                status = 0;
                statusText = "";
                contentType = void 0;
              }
            } else {
              status = 200;
              statusText = "OK";
              contentType = xhr.contentType;
            }
            if (status !== 0) {
              state = 2;
              that.readyState = 2;
              that.status = status;
              that.statusText = statusText;
              that._contentType = contentType;
              that.onreadystatechange();
            }
          }
        };
        var onProgress = function() {
          onStart();
          if (state === 2 || state === 3) {
            state = 3;
            var responseText = "";
            try {
              responseText = xhr.responseText;
            } catch (error) {
            }
            that.readyState = 3;
            that.responseText = responseText;
            that.onprogress();
          }
        };
        var onFinish = function(type, event) {
          if (event == null || event.preventDefault == null) {
            event = {
              preventDefault: k
            };
          }
          onProgress();
          if (state === 1 || state === 2 || state === 3) {
            state = 4;
            if (timeout !== 0) {
              clearTimeout(timeout);
              timeout = 0;
            }
            that.readyState = 4;
            if (type === "load") {
              that.onload(event);
            } else if (type === "error") {
              that.onerror(event);
            } else if (type === "abort") {
              that.onabort(event);
            } else {
              throw new TypeError();
            }
            that.onreadystatechange();
          }
        };
        var onReadyStateChange = function(event) {
          if (xhr != void 0) {
            if (xhr.readyState === 4) {
              if (!("onload" in xhr) || !("onerror" in xhr) || !("onabort" in xhr)) {
                onFinish(xhr.responseText === "" ? "error" : "load", event);
              }
            } else if (xhr.readyState === 3) {
              if (!("onprogress" in xhr)) {
                onProgress();
              }
            } else if (xhr.readyState === 2) {
              onStart();
            }
          }
        };
        var onTimeout = function() {
          timeout = setTimeout(function() {
            onTimeout();
          }, 500);
          if (xhr.readyState === 3) {
            onProgress();
          }
        };
        if ("onload" in xhr) {
          xhr.onload = function(event) {
            onFinish("load", event);
          };
        }
        if ("onerror" in xhr) {
          xhr.onerror = function(event) {
            onFinish("error", event);
          };
        }
        if ("onabort" in xhr) {
          xhr.onabort = function(event) {
            onFinish("abort", event);
          };
        }
        if ("onprogress" in xhr) {
          xhr.onprogress = onProgress;
        }
        if ("onreadystatechange" in xhr) {
          xhr.onreadystatechange = function(event) {
            onReadyStateChange(event);
          };
        }
        if ("contentType" in xhr || !("ontimeout" in XMLHttpRequest.prototype)) {
          url += (url.indexOf("?") === -1 ? "?" : "&") + "padding=true";
        }
        xhr.open(method, url, true);
        if ("readyState" in xhr) {
          timeout = setTimeout(function() {
            onTimeout();
          }, 0);
        }
      };
      XHRWrapper.prototype.abort = function() {
        this._abort(false);
      };
      XHRWrapper.prototype.getResponseHeader = function(name) {
        return this._contentType;
      };
      XHRWrapper.prototype.setRequestHeader = function(name, value) {
        var xhr = this._xhr;
        if ("setRequestHeader" in xhr) {
          xhr.setRequestHeader(name, value);
        }
      };
      XHRWrapper.prototype.getAllResponseHeaders = function() {
        return this._xhr.getAllResponseHeaders != void 0 ? this._xhr.getAllResponseHeaders() || "" : "";
      };
      XHRWrapper.prototype.send = function() {
        if ((!("ontimeout" in XMLHttpRequest.prototype) || !("sendAsBinary" in XMLHttpRequest.prototype) && !("mozAnon" in XMLHttpRequest.prototype)) && document2 != void 0 && document2.readyState != void 0 && document2.readyState !== "complete") {
          var that = this;
          that._sendTimeout = setTimeout(function() {
            that._sendTimeout = 0;
            that.send();
          }, 4);
          return;
        }
        var xhr = this._xhr;
        if ("withCredentials" in xhr) {
          xhr.withCredentials = this.withCredentials;
        }
        try {
          xhr.send(void 0);
        } catch (error1) {
          throw error1;
        }
      };
      function toLowerCase(name) {
        return name.replace(/[A-Z]/g, function(c) {
          return String.fromCharCode(c.charCodeAt(0) + 32);
        });
      }
      function HeadersPolyfill(all) {
        var map = /* @__PURE__ */ Object.create(null);
        var array = all.split("\r\n");
        for (var i = 0; i < array.length; i += 1) {
          var line = array[i];
          var parts = line.split(": ");
          var name = parts.shift();
          var value = parts.join(": ");
          map[toLowerCase(name)] = value;
        }
        this._map = map;
      }
      HeadersPolyfill.prototype.get = function(name) {
        return this._map[toLowerCase(name)];
      };
      if (XMLHttpRequest != null && XMLHttpRequest.HEADERS_RECEIVED == null) {
        XMLHttpRequest.HEADERS_RECEIVED = 2;
      }
      function XHRTransport() {
      }
      XHRTransport.prototype.open = function(xhr, onStartCallback, onProgressCallback, onFinishCallback, url, withCredentials, headers) {
        xhr.open("GET", url);
        var offset = 0;
        xhr.onprogress = function() {
          var responseText = xhr.responseText;
          var chunk = responseText.slice(offset);
          offset += chunk.length;
          onProgressCallback(chunk);
        };
        xhr.onerror = function(event) {
          event.preventDefault();
          onFinishCallback(new Error("NetworkError"));
        };
        xhr.onload = function() {
          onFinishCallback(null);
        };
        xhr.onabort = function() {
          onFinishCallback(null);
        };
        xhr.onreadystatechange = function() {
          if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
            var status = xhr.status;
            var statusText = xhr.statusText;
            var contentType = xhr.getResponseHeader("Content-Type");
            var headers2 = xhr.getAllResponseHeaders();
            onStartCallback(status, statusText, contentType, new HeadersPolyfill(headers2));
          }
        };
        xhr.withCredentials = withCredentials;
        for (var name in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, name)) {
            xhr.setRequestHeader(name, headers[name]);
          }
        }
        xhr.send();
        return xhr;
      };
      function HeadersWrapper(headers) {
        this._headers = headers;
      }
      HeadersWrapper.prototype.get = function(name) {
        return this._headers.get(name);
      };
      function FetchTransport() {
      }
      FetchTransport.prototype.open = function(xhr, onStartCallback, onProgressCallback, onFinishCallback, url, withCredentials, headers) {
        var reader = null;
        var controller = new AbortController();
        var signal = controller.signal;
        var textDecoder = new TextDecoder2();
        fetch(url, {
          headers,
          credentials: withCredentials ? "include" : "same-origin",
          signal,
          cache: "no-store"
        }).then(function(response) {
          reader = response.body.getReader();
          onStartCallback(response.status, response.statusText, response.headers.get("Content-Type"), new HeadersWrapper(response.headers));
          return new Promise2(function(resolve, reject) {
            var readNextChunk = function() {
              reader.read().then(function(result) {
                if (result.done) {
                  resolve(void 0);
                } else {
                  var chunk = textDecoder.decode(result.value, { stream: true });
                  onProgressCallback(chunk);
                  readNextChunk();
                }
              })["catch"](function(error) {
                reject(error);
              });
            };
            readNextChunk();
          });
        })["catch"](function(error) {
          if (error.name === "AbortError") {
            return void 0;
          } else {
            return error;
          }
        }).then(function(error) {
          onFinishCallback(error);
        });
        return {
          abort: function() {
            if (reader != null) {
              reader.cancel();
            }
            controller.abort();
          }
        };
      };
      function EventTarget() {
        this._listeners = /* @__PURE__ */ Object.create(null);
      }
      function throwError(e) {
        setTimeout(function() {
          throw e;
        }, 0);
      }
      EventTarget.prototype.dispatchEvent = function(event) {
        event.target = this;
        var typeListeners = this._listeners[event.type];
        if (typeListeners != void 0) {
          var length = typeListeners.length;
          for (var i = 0; i < length; i += 1) {
            var listener = typeListeners[i];
            try {
              if (typeof listener.handleEvent === "function") {
                listener.handleEvent(event);
              } else {
                listener.call(this, event);
              }
            } catch (e) {
              throwError(e);
            }
          }
        }
      };
      EventTarget.prototype.addEventListener = function(type, listener) {
        type = String(type);
        var listeners = this._listeners;
        var typeListeners = listeners[type];
        if (typeListeners == void 0) {
          typeListeners = [];
          listeners[type] = typeListeners;
        }
        var found = false;
        for (var i = 0; i < typeListeners.length; i += 1) {
          if (typeListeners[i] === listener) {
            found = true;
          }
        }
        if (!found) {
          typeListeners.push(listener);
        }
      };
      EventTarget.prototype.removeEventListener = function(type, listener) {
        type = String(type);
        var listeners = this._listeners;
        var typeListeners = listeners[type];
        if (typeListeners != void 0) {
          var filtered = [];
          for (var i = 0; i < typeListeners.length; i += 1) {
            if (typeListeners[i] !== listener) {
              filtered.push(typeListeners[i]);
            }
          }
          if (filtered.length === 0) {
            delete listeners[type];
          } else {
            listeners[type] = filtered;
          }
        }
      };
      function Event2(type) {
        this.type = type;
        this.target = void 0;
      }
      function MessageEvent(type, options) {
        Event2.call(this, type);
        this.data = options.data;
        this.lastEventId = options.lastEventId;
      }
      MessageEvent.prototype = Object.create(Event2.prototype);
      function ConnectionEvent(type, options) {
        Event2.call(this, type);
        this.status = options.status;
        this.statusText = options.statusText;
        this.headers = options.headers;
      }
      ConnectionEvent.prototype = Object.create(Event2.prototype);
      function ErrorEvent(type, options) {
        Event2.call(this, type);
        this.error = options.error;
      }
      ErrorEvent.prototype = Object.create(Event2.prototype);
      var WAITING = -1;
      var CONNECTING = 0;
      var OPEN = 1;
      var CLOSED = 2;
      var AFTER_CR = -1;
      var FIELD_START = 0;
      var FIELD = 1;
      var VALUE_START = 2;
      var VALUE = 3;
      var contentTypeRegExp = /^text\/event\-stream(;.*)?$/i;
      var MINIMUM_DURATION = 1e3;
      var MAXIMUM_DURATION = 18e6;
      var parseDuration = function(value, def) {
        var n = value == null ? def : parseInt(value, 10);
        if (n !== n) {
          n = def;
        }
        return clampDuration(n);
      };
      var clampDuration = function(n) {
        return Math.min(Math.max(n, MINIMUM_DURATION), MAXIMUM_DURATION);
      };
      var fire = function(that, f, event) {
        try {
          if (typeof f === "function") {
            f.call(that, event);
          }
        } catch (e) {
          throwError(e);
        }
      };
      function EventSourcePolyfill2(url, options) {
        EventTarget.call(this);
        options = options || {};
        this.onopen = void 0;
        this.onmessage = void 0;
        this.onerror = void 0;
        this.url = void 0;
        this.readyState = void 0;
        this.withCredentials = void 0;
        this.headers = void 0;
        this._close = void 0;
        start(this, url, options);
      }
      function getBestXHRTransport() {
        return XMLHttpRequest != void 0 && "withCredentials" in XMLHttpRequest.prototype || XDomainRequest == void 0 ? new XMLHttpRequest() : new XDomainRequest();
      }
      var isFetchSupported = fetch != void 0 && Response != void 0 && "body" in Response.prototype;
      function start(es, url, options) {
        url = String(url);
        var withCredentials = Boolean(options.withCredentials);
        var lastEventIdQueryParameterName = options.lastEventIdQueryParameterName || "lastEventId";
        var initialRetry = clampDuration(1e3);
        var heartbeatTimeout = parseDuration(options.heartbeatTimeout, 45e3);
        var lastEventId = "";
        var retry = initialRetry;
        var wasActivity = false;
        var textLength = 0;
        var headers = options.headers || {};
        var TransportOption = options.Transport;
        var xhr = isFetchSupported && TransportOption == void 0 ? void 0 : new XHRWrapper(TransportOption != void 0 ? new TransportOption() : getBestXHRTransport());
        var transport = TransportOption != null && typeof TransportOption !== "string" ? new TransportOption() : xhr == void 0 ? new FetchTransport() : new XHRTransport();
        var abortController = void 0;
        var timeout = 0;
        var currentState = WAITING;
        var dataBuffer = "";
        var lastEventIdBuffer = "";
        var eventTypeBuffer = "";
        var textBuffer = "";
        var state = FIELD_START;
        var fieldStart = 0;
        var valueStart = 0;
        var onStart = function(status, statusText, contentType, headers2) {
          if (currentState === CONNECTING) {
            if (status === 200 && contentType != void 0 && contentTypeRegExp.test(contentType)) {
              currentState = OPEN;
              wasActivity = Date.now();
              retry = initialRetry;
              es.readyState = OPEN;
              var event = new ConnectionEvent("open", {
                status,
                statusText,
                headers: headers2
              });
              es.dispatchEvent(event);
              fire(es, es.onopen, event);
            } else {
              var message = "";
              if (status !== 200) {
                if (statusText) {
                  statusText = statusText.replace(/\s+/g, " ");
                }
                message = "EventSource's response has a status " + status + " " + statusText + " that is not 200. Aborting the connection.";
              } else {
                message = "EventSource's response has a Content-Type specifying an unsupported type: " + (contentType == void 0 ? "-" : contentType.replace(/\s+/g, " ")) + ". Aborting the connection.";
              }
              close();
              var event = new ConnectionEvent("error", {
                status,
                statusText,
                headers: headers2
              });
              es.dispatchEvent(event);
              fire(es, es.onerror, event);
              console.error(message);
            }
          }
        };
        var onProgress = function(textChunk) {
          if (currentState === OPEN) {
            var n = -1;
            for (var i = 0; i < textChunk.length; i += 1) {
              var c = textChunk.charCodeAt(i);
              if (c === "\n".charCodeAt(0) || c === "\r".charCodeAt(0)) {
                n = i;
              }
            }
            var chunk = (n !== -1 ? textBuffer : "") + textChunk.slice(0, n + 1);
            textBuffer = (n === -1 ? textBuffer : "") + textChunk.slice(n + 1);
            if (textChunk !== "") {
              wasActivity = Date.now();
              textLength += textChunk.length;
            }
            for (var position = 0; position < chunk.length; position += 1) {
              var c = chunk.charCodeAt(position);
              if (state === AFTER_CR && c === "\n".charCodeAt(0)) {
                state = FIELD_START;
              } else {
                if (state === AFTER_CR) {
                  state = FIELD_START;
                }
                if (c === "\r".charCodeAt(0) || c === "\n".charCodeAt(0)) {
                  if (state !== FIELD_START) {
                    if (state === FIELD) {
                      valueStart = position + 1;
                    }
                    var field = chunk.slice(fieldStart, valueStart - 1);
                    var value = chunk.slice(valueStart + (valueStart < position && chunk.charCodeAt(valueStart) === " ".charCodeAt(0) ? 1 : 0), position);
                    if (field === "data") {
                      dataBuffer += "\n";
                      dataBuffer += value;
                    } else if (field === "id") {
                      lastEventIdBuffer = value;
                    } else if (field === "event") {
                      eventTypeBuffer = value;
                    } else if (field === "retry") {
                      initialRetry = parseDuration(value, initialRetry);
                      retry = initialRetry;
                    } else if (field === "heartbeatTimeout") {
                      heartbeatTimeout = parseDuration(value, heartbeatTimeout);
                      if (timeout !== 0) {
                        clearTimeout(timeout);
                        timeout = setTimeout(function() {
                          onTimeout();
                        }, heartbeatTimeout);
                      }
                    }
                  }
                  if (state === FIELD_START) {
                    if (dataBuffer !== "") {
                      lastEventId = lastEventIdBuffer;
                      if (eventTypeBuffer === "") {
                        eventTypeBuffer = "message";
                      }
                      var event = new MessageEvent(eventTypeBuffer, {
                        data: dataBuffer.slice(1),
                        lastEventId: lastEventIdBuffer
                      });
                      es.dispatchEvent(event);
                      if (eventTypeBuffer === "open") {
                        fire(es, es.onopen, event);
                      } else if (eventTypeBuffer === "message") {
                        fire(es, es.onmessage, event);
                      } else if (eventTypeBuffer === "error") {
                        fire(es, es.onerror, event);
                      }
                      if (currentState === CLOSED) {
                        return;
                      }
                    }
                    dataBuffer = "";
                    eventTypeBuffer = "";
                  }
                  state = c === "\r".charCodeAt(0) ? AFTER_CR : FIELD_START;
                } else {
                  if (state === FIELD_START) {
                    fieldStart = position;
                    state = FIELD;
                  }
                  if (state === FIELD) {
                    if (c === ":".charCodeAt(0)) {
                      valueStart = position + 1;
                      state = VALUE_START;
                    }
                  } else if (state === VALUE_START) {
                    state = VALUE;
                  }
                }
              }
            }
          }
        };
        var onFinish = function(error) {
          if (currentState === OPEN || currentState === CONNECTING) {
            currentState = WAITING;
            if (timeout !== 0) {
              clearTimeout(timeout);
              timeout = 0;
            }
            timeout = setTimeout(function() {
              onTimeout();
            }, retry);
            retry = clampDuration(Math.min(initialRetry * 16, retry * 2));
            es.readyState = CONNECTING;
            var event = new ErrorEvent("error", { error });
            es.dispatchEvent(event);
            fire(es, es.onerror, event);
            if (error != void 0) {
              console.error(error);
            }
          }
        };
        var close = function() {
          currentState = CLOSED;
          if (abortController != void 0) {
            abortController.abort();
            abortController = void 0;
          }
          if (timeout !== 0) {
            clearTimeout(timeout);
            timeout = 0;
          }
          es.readyState = CLOSED;
        };
        var onTimeout = function() {
          timeout = 0;
          if (currentState !== WAITING) {
            if (!wasActivity && abortController != void 0) {
              onFinish(new Error("No activity within " + heartbeatTimeout + " milliseconds. " + (currentState === CONNECTING ? "No response received." : textLength + " chars received.") + " Reconnecting."));
              if (abortController != void 0) {
                abortController.abort();
                abortController = void 0;
              }
            } else {
              var nextHeartbeat = Math.max((wasActivity || Date.now()) + heartbeatTimeout - Date.now(), 1);
              wasActivity = false;
              timeout = setTimeout(function() {
                onTimeout();
              }, nextHeartbeat);
            }
            return;
          }
          wasActivity = false;
          textLength = 0;
          timeout = setTimeout(function() {
            onTimeout();
          }, heartbeatTimeout);
          currentState = CONNECTING;
          dataBuffer = "";
          eventTypeBuffer = "";
          lastEventIdBuffer = lastEventId;
          textBuffer = "";
          fieldStart = 0;
          valueStart = 0;
          state = FIELD_START;
          var requestURL = url;
          if (url.slice(0, 5) !== "data:" && url.slice(0, 5) !== "blob:") {
            if (lastEventId !== "") {
              var i = url.indexOf("?");
              requestURL = i === -1 ? url : url.slice(0, i + 1) + url.slice(i + 1).replace(/(?:^|&)([^=&]*)(?:=[^&]*)?/g, function(p, paramName) {
                return paramName === lastEventIdQueryParameterName ? "" : p;
              });
              requestURL += (url.indexOf("?") === -1 ? "?" : "&") + lastEventIdQueryParameterName + "=" + encodeURIComponent(lastEventId);
            }
          }
          var withCredentials2 = es.withCredentials;
          var requestHeaders = {};
          requestHeaders["Accept"] = "text/event-stream";
          var headers2 = es.headers;
          if (headers2 != void 0) {
            for (var name in headers2) {
              if (Object.prototype.hasOwnProperty.call(headers2, name)) {
                requestHeaders[name] = headers2[name];
              }
            }
          }
          try {
            abortController = transport.open(xhr, onStart, onProgress, onFinish, requestURL, withCredentials2, requestHeaders);
          } catch (error) {
            close();
            throw error;
          }
        };
        es.url = url;
        es.readyState = CONNECTING;
        es.withCredentials = withCredentials;
        es.headers = headers;
        es._close = close;
        onTimeout();
      }
      EventSourcePolyfill2.prototype = Object.create(EventTarget.prototype);
      EventSourcePolyfill2.prototype.CONNECTING = CONNECTING;
      EventSourcePolyfill2.prototype.OPEN = OPEN;
      EventSourcePolyfill2.prototype.CLOSED = CLOSED;
      EventSourcePolyfill2.prototype.close = function() {
        this._close();
      };
      EventSourcePolyfill2.CONNECTING = CONNECTING;
      EventSourcePolyfill2.OPEN = OPEN;
      EventSourcePolyfill2.CLOSED = CLOSED;
      EventSourcePolyfill2.prototype.withCredentials = void 0;
      var R = NativeEventSource;
      if (XMLHttpRequest != void 0 && (NativeEventSource == void 0 || !("withCredentials" in NativeEventSource.prototype))) {
        R = EventSourcePolyfill2;
      }
      (function(factory) {
        if (typeof module2 === "object" && typeof module2.exports === "object") {
          var v = factory(exports);
          if (v !== void 0) module2.exports = v;
        } else if (typeof define === "function" && define.amd) {
          define(["exports"], factory);
        } else {
          factory(global);
        }
      })(function(exports2) {
        exports2.EventSourcePolyfill = EventSourcePolyfill2;
        exports2.NativeEventSource = NativeEventSource;
        exports2.EventSource = R;
      });
    })(typeof globalThis === "undefined" ? typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : exports : globalThis);
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AskMyuPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian54 = require("obsidian");

// src/views/SettingsTab.ts
var import_obsidian14 = require("obsidian");

// src/views/settingsMount.ts
var SECTION_CLASS = "myu-settings-section";
function mountInRow(setting, render) {
  const el = setting.settingEl;
  el.empty();
  el.removeClass("setting-item");
  el.addClass(SECTION_CLASS);
  render(el);
  return () => el.empty();
}

// src/views/ZulipConnectModal.ts
var import_obsidian2 = require("obsidian");

// src/notify.ts
var import_obsidian = require("obsidian");
function notifyStatus(message, durationMs = 4e3) {
  new import_obsidian.Notice(message, durationMs);
}
function notifyError(message, durationMs = 8e3) {
  new import_obsidian.Notice(message, durationMs);
}
function notifyLive(notice, onClick) {
  const duration = notice.durationMs ?? (notice.kind === "error" ? 8e3 : 5e3);
  let message = notice.body ? `${notice.title} \u2014 ${notice.body}` : notice.title;
  if (typeof document !== "undefined") {
    const frag = createFragment();
    frag.createEl("strong", { text: notice.title });
    if (notice.body) {
      frag.createEl("br");
      frag.appendText(notice.body);
    }
    message = frag;
  }
  const n = new import_obsidian.Notice(message, duration);
  if (onClick) {
    n.messageEl.addClass("myu-notice-action");
    n.messageEl.onclick = () => {
      onClick();
      n.hide();
    };
  }
}

// src/views/ZulipConnectModal.ts
var ZulipConnectModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.realm = "";
    this.email = "";
    this.apiKey = "";
    this.problem = null;
    this.busy = false;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Connect a Zulip organization" });
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "In Zulip, open your personal settings and copy the API key. Myu reads the streams you are in; the key is sent once and kept on the server, never in this vault." });
    new import_obsidian2.Setting(contentEl).setName("Realm URL").addText((t) => t.setPlaceholder("https://yourorg.zulipchat.com").setValue(this.realm).onChange((v) => {
      this.realm = v;
    }));
    new import_obsidian2.Setting(contentEl).setName("Email").addText((t) => t.setPlaceholder("you@yourorg.com").setValue(this.email).onChange((v) => {
      this.email = v;
    }));
    new import_obsidian2.Setting(contentEl).setName("API key").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.apiKey).onChange((v) => {
        this.apiKey = v;
      });
    });
    if (this.problem) contentEl.createDiv({ cls: "myu-problem", text: this.problem });
    new import_obsidian2.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton((b) => b.setButtonText(this.busy ? "Connecting\u2026" : "Connect").setCta().setDisabled(this.busy).onClick(() => void this.connect()));
  }
  async connect() {
    const realm = this.realm.trim().replace(/\/$/, "");
    if (!realm || !this.email.trim() || !this.apiKey.trim()) {
      this.problem = "All three are needed.";
      this.render();
      return;
    }
    this.busy = true;
    this.problem = null;
    this.render();
    const res = await this.plugin.backend.zulipConnect(/^https?:\/\//.test(realm) ? realm : `https://${realm}`, this.email.trim(), this.apiKey.trim()).catch(() => null);
    this.busy = false;
    if (res?.ok && res.data?.success !== false) {
      notifyStatus(`Connected ${res.data?.realm_name || "Zulip"}.`);
      this.close();
      this.onDone();
      return;
    }
    this.problem = res?.data?.error || res?.error || "Zulip did not accept that.";
    this.render();
  }
  onClose() {
    this.apiKey = "";
    this.contentEl.empty();
  }
};

// src/views/pickFile.ts
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = createEl("input", { type: "file", attr: { accept } });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) {
        resolve(null);
        return;
      }
      try {
        resolve({ name: f.name, bytes: await f.arrayBuffer() });
      } catch {
        resolve(null);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  token: null,
  device_id: null,
  wrapped_mdek: null,
  session_token: null,
  account_id: null,
  background_work_consented: null,
  base_url: "https://myu.askmyu.com/api",
  sse_url: "",
  vault_id: "",
  allowlist_folders: [],
  allowlist_tags: [],
  consent_completed: false,
  // 90 seconds. Vault-culture finding: daily notes are edited continuously all
  // day, so anything shorter captures a half-written sentence over and over.
  quiescence_seconds: 90,
  capture_hashes: {},
  queue: [],
  weekly_review_enabled: false,
  weekly_review_folder: "",
  meeting_folders: [],
  people_folders: ["People"],
  meeting_hashes: {},
  monthly_seen: {},
  materialize_consented: false,
  auto_keep_canvas: false,
  materialize_enabled: false,
  materialize_offered: false,
  materialize_folder: "Myu",
  materialize_people: true,
  materialize_today: true,
  materialize_commitments: true,
  materialize_meetings_history: true,
  materialize_journal_history: true,
  materialize_calendar: true,
  sync_on_open: true,
  myu_checkbox_state: {},
  myu_canvas_node_state: {},
  myu_file_hashes: {},
  vault_event_queue: [],
  last_people_materialize: 0,
  last_history_materialize: 0,
  memories_by_day: {},
  last_open_sync: 0,
  vault_changes_since: 0,
  myu_entity_changed_at: {},
  recovery_pending: false,
  use_mock_backend: false,
  first_run_shown: false,
  setup_hidden: false,
  backfill_done: false,
  meeting_consent_offered: false,
  last_protocol: ""
};
function normalizeSettings(raw) {
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const merged = Object.assign({}, DEFAULT_SETTINGS, stored);
  if (typeof merged.base_url === "string" && merged.base_url.includes("://api.askmyu.com")) {
    merged.base_url = merged.base_url.replace("://api.askmyu.com", "://myu.askmyu.com");
  }
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = merged[key];
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value)) merged[key] = [...fallback];
    } else if (fallback !== null && typeof fallback === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) merged[key] = { ...fallback };
    }
  }
  return merged;
}

// src/views/ApprovalModal.ts
var import_obsidian3 = require("obsidian");

// src/views/settingsLoad.ts
function loadFailure(res) {
  if (res?.ok) return null;
  if (!res || res.status === 0) return "askMyu could not be reached. Check the connection and try again.";
  switch (res.status) {
    case 401:
      return "The session had to be reopened. Try again.";
    case 403:
      return "This session is still being opened. Try again in a moment.";
    case 428:
      return "Agree to the beta terms first \u2014 the Today pane has them.";
    case 429:
      return "askMyu asked for a pause. Try again in a minute.";
    default:
      return res.status >= 500 ? `askMyu could not answer (${res.status}). Try again.` : `askMyu answered ${res.status}. Try again.`;
  }
}

// src/views/approvalCopy.ts
function approvalFailureText(f) {
  if (f.step === "handover") return "The key handover did not finish on this device. Try again.";
  if (f.step === "request" && f.status === 429) {
    return "Too many approval requests in the last hour, so askMyu asked for a pause. Try again later, or use your recovery phrase.";
  }
  const why = loadFailure({ ok: false, status: f.status, error: f.error }) ?? "Something went wrong.";
  return f.step === "request" ? `Could not start the approval. ${why}` : `Could not check on the approval. ${why}`;
}

// src/views/ApprovalModal.ts
var ApprovalModal = class extends import_obsidian3.Modal {
  constructor(app, unlock, onFinished, initialStage = "choose") {
    super(app);
    this.unlock = unlock;
    this.onFinished = onFinished;
    this.message = null;
    this.unobserve = null;
    this.stage = initialStage;
  }
  onOpen() {
    if (this.unlock.approval?.status === "pending") this.stage = "waiting";
    this.unobserve = this.unlock.observeApproval(() => this.onApprovalMoved());
    this.render();
  }
  onClose() {
    this.unobserve?.();
    this.unobserve = null;
    this.contentEl.empty();
  }
  onApprovalMoved() {
    const a = this.unlock.approval;
    if (!a) {
      if (this.unlock.current === "unlocked") this.stage = "done";
      else if (this.stage === "waiting") this.stage = "choose";
    } else if (a.status === "pending") {
      this.stage = "waiting";
    } else {
      this.stage = "failed";
      this.message = a.status === "failed" ? approvalFailureText(a.failure) : a.status === "denied" ? "That request was declined on the other device." : "The request timed out. You can start again.";
    }
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Connect this vault to Myu" });
    switch (this.stage) {
      case "choose":
        this.renderChoose();
        break;
      case "waiting":
        this.renderWaiting();
        break;
      case "phrase":
        this.renderPhrase();
        break;
      case "done":
        this.renderDone();
        break;
      case "failed":
        this.renderFailed();
        break;
    }
  }
  renderChoose() {
    const { contentEl } = this;
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Your notes are encrypted with a key only your devices hold. To let this one read and write with that key, approve it from a device you are already signed in on."
    });
    new import_obsidian3.Setting(contentEl).setName("Approve from another device").setDesc("Shows a 4-digit code here; you type it in askMyu on your phone or the web app.").addButton(
      (b) => b.setButtonText("Start").setCta().onClick(() => void this.beginApproval())
    );
    new import_obsidian3.Setting(contentEl).setName("Use your recovery phrase").setDesc("The 12 words you saved when you set up encryption. Use this if you can't reach another device.").addButton(
      (b) => b.setButtonText("Enter phrase").onClick(() => {
        this.stage = "phrase";
        this.render();
      })
    );
  }
  async beginApproval() {
    this.stage = "waiting";
    this.message = null;
    this.render();
    const pending = await this.unlock.beginApproval();
    if (!pending) {
      this.stage = "failed";
      this.message = "Couldn't start the approval. Check your connection and try again.";
      this.render();
    }
  }
  renderWaiting() {
    const { contentEl } = this;
    const approval = this.unlock.approval;
    if (approval?.status !== "pending") {
      contentEl.createEl("p", { cls: "myu-prose", text: "Starting\u2026" });
      return;
    }
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "In askMyu on your phone or the web app, approve this device and enter:"
    });
    contentEl.createDiv({ cls: "myu-code", text: approval.code });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Waiting for approval. You can close this \u2014 it finishes on its own, and the Today pane shows the same code."
    });
    new import_obsidian3.Setting(contentEl).addButton(
      (b) => b.setButtonText("Cancel").onClick(() => {
        this.unlock.cancelApproval();
      })
    );
  }
  renderPhrase() {
    const { contentEl } = this;
    let phrase = "";
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Enter your 12-word recovery phrase. It is used here and not stored."
    });
    new import_obsidian3.Setting(contentEl).setName("Recovery phrase").addTextArea((t) => {
      t.setPlaceholder("Twelve words, separated by spaces").onChange((v) => {
        phrase = v;
      });
      t.inputEl.rows = 3;
      t.inputEl.addClass("myu-phrase-input");
    });
    if (this.message) contentEl.createEl("p", { cls: "myu-prose myu-warn", text: this.message });
    new import_obsidian3.Setting(contentEl).addButton(
      (b) => b.setButtonText("Back").onClick(() => {
        this.message = null;
        this.stage = "choose";
        this.render();
      })
    ).addButton(
      (b) => b.setButtonText("Unlock").setCta().onClick(async () => {
        const result = await this.unlock.unlockWithRecoveryPhrase(phrase);
        if (result === "ok") {
          this.stage = "done";
        } else {
          this.message = result === "invalid_phrase" ? "That phrase doesn't match this account. Check for typos or a missing word." : result === "no_recovery_key" ? "This account has no recovery phrase set up. Approve from another device instead." : "Couldn't reach askMyu just now. Try again in a moment.";
        }
        this.render();
      })
    );
  }
  renderDone() {
    const { contentEl } = this;
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Done \u2014 this vault is connected."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Nothing is read yet. Next you choose which folders to share; until then Myu sees nothing from this vault."
    });
    new import_obsidian3.Setting(contentEl).addButton(
      (b) => b.setButtonText("Close").setCta().onClick(() => {
        this.onFinished();
        this.close();
      })
    );
  }
  renderFailed() {
    const { contentEl } = this;
    contentEl.createEl("p", { cls: "myu-prose myu-warn", text: this.message ?? "That did not work." });
    new import_obsidian3.Setting(contentEl).addButton(
      (b) => b.setButtonText("Close").onClick(() => {
        this.close();
      })
    ).addButton(
      (b) => b.setButtonText("Try again").setCta().onClick(() => {
        this.message = null;
        this.stage = "choose";
        this.render();
      })
    );
  }
};

// src/views/ConsentModal.ts
var import_obsidian4 = require("obsidian");

// src/capture/vaultConfig.ts
async function readPeriodicConfig(app) {
  const dailyFolder = await readJsonField(app, `${app.vault.configDir}/daily-notes.json`, "folder");
  const weekly = await readWeekly(app);
  return {
    dailyFolder: normalizeFolder(dailyFolder),
    weeklyFolder: normalizeFolder(weekly.folder),
    weeklyFormat: weekly.format
  };
}
async function readWeekly(app) {
  try {
    const raw = await readJson(app, `${app.vault.configDir}/plugins/periodic-notes/data.json`);
    if (!raw) return { folder: null, format: null };
    const weekly = raw.weekly;
    if (!weekly || weekly.enabled === false) return { folder: null, format: null };
    return {
      folder: typeof weekly.folder === "string" ? weekly.folder : null,
      format: typeof weekly.format === "string" && weekly.format ? weekly.format : null
    };
  } catch {
    return { folder: null, format: null };
  }
}
async function suggestFolders(app) {
  const suggestions = [];
  const { dailyFolder } = await readPeriodicConfig(app);
  if (dailyFolder) {
    suggestions.push({
      path: dailyFolder,
      reason: "your Daily Notes folder",
      recommended: true
    });
  }
  const topLevel = app.vault.getAllLoadedFiles().filter((f) => "children" in f).map((f) => f.path).filter((p) => p && !p.startsWith(".") && !p.includes("/"));
  for (const path of topLevel) {
    if (path === dailyFolder) continue;
    const lower = path.toLowerCase();
    if (/^(journal|journals|daily|diary)$/.test(lower)) {
      suggestions.push({ path, reason: "looks like a journal folder", recommended: !dailyFolder });
    } else if (/^(meetings?|1-?1s?|notes)$/.test(lower)) {
      suggestions.push({ path, reason: "looks like meeting notes", recommended: false });
    }
  }
  return suggestions;
}
function normalizeFolder(folder) {
  if (!folder) return null;
  const trimmed = folder.replace(/^\/+|\/+$/g, "").trim();
  return trimmed.length ? trimmed : null;
}
async function readJson(app, path) {
  try {
    if (!await app.vault.adapter.exists(path)) return null;
    return JSON.parse(await app.vault.adapter.read(path));
  } catch {
    return null;
  }
}
async function readJsonField(app, path, field) {
  const raw = await readJson(app, path);
  if (raw && typeof raw === "object") {
    const value = raw[field];
    if (typeof value === "string") return value;
  }
  return null;
}

// src/views/ConsentModal.ts
function serverHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
function folderScope(app, folder) {
  const prefix = folder.replace(/\/$/, "") + "/";
  let n = 0;
  let oldest = Infinity;
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(prefix)) continue;
    n++;
    if (f.stat.ctime < oldest) oldest = f.stat.ctime;
  }
  if (n === 0) return "no notes yet";
  return `${n} ${n === 1 ? "note" : "notes"}${Number.isFinite(oldest) ? `, oldest ${new Date(oldest).getFullYear()}` : ""}`;
}
var ConsentModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, onFinished) {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.suggestions = [];
    this.chosen = /* @__PURE__ */ new Set();
    this.tags = "";
    this.loaded = false;
  }
  async onOpen() {
    this.chosen = new Set(this.plugin.settings.allowlist_folders);
    this.tags = this.plugin.settings.allowlist_tags.join(", ");
    this.render();
    this.suggestions = await suggestFolders(this.app);
    if (this.chosen.size === 0) {
      for (const s2 of this.suggestions) if (s2.recommended) this.chosen.add(s2.path);
    }
    this.loaded = true;
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "What may Myu read?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Nothing in this vault has been read. Choose the folders whose notes should go to Myu \u2014 usually the one you journal in. Everything outside them stays here, untouched."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Only the folders you choose leave this device, encrypted with a key that stays on your devices. Everything else in your vault is never read. You can change this list or disconnect at any time, and any single note can opt out with `myu: false` in its frontmatter."
    });
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: `One server: ${serverHost(this.plugin.settings.base_url)}. No telemetry.` });
    if (!this.loaded) {
      contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "Looking at your vault setup\u2026" });
      return;
    }
    if (this.suggestions.length === 0) {
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: "Your vault doesn't have a Daily Notes folder configured, so there's nothing obvious to suggest. Type a folder path below."
      });
    }
    for (const suggestion of this.suggestions) {
      const scope = folderScope(this.app, suggestion.path);
      new import_obsidian4.Setting(contentEl).setName(`${suggestion.path}/`).setDesc(`${suggestion.reason} \u2014 ${scope}`).addToggle(
        (t) => t.setValue(this.chosen.has(suggestion.path)).onChange((v) => {
          if (v) this.chosen.add(suggestion.path);
          else this.chosen.delete(suggestion.path);
        })
      );
    }
    new import_obsidian4.Setting(contentEl).setName("Other folders").setDesc("Comma-separated paths, e.g. Journal, work/meetings").addText(
      (t) => t.setPlaceholder("Journal, work/meetings").setValue(this.extraFolders().join(", ")).onChange((v) => {
        for (const path of this.extraFolders()) this.chosen.delete(path);
        for (const path of splitList(v)) this.chosen.add(path);
      })
    );
    new import_obsidian4.Setting(contentEl).setName("Or by tag").setDesc("Notes carrying any of these tags are shared wherever they live.").addText(
      (t) => t.setPlaceholder("Myu, journal").setValue(this.tags).onChange((v) => {
        this.tags = v;
      })
    );
    new import_obsidian4.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Share these").setCta().onClick(() => void this.confirm())
    );
  }
  /** Folders the user typed, i.e. chosen minus the ones we suggested. */
  extraFolders() {
    const suggested = new Set(this.suggestions.map((s2) => s2.path));
    return [...this.chosen].filter((p) => !suggested.has(p));
  }
  async confirm() {
    const folders = [...this.chosen].map(normalizeFolder2).filter(Boolean);
    const tags = splitList(this.tags).map((t) => t.replace(/^#/, ""));
    this.plugin.settings.allowlist_folders = folders;
    this.plugin.settings.allowlist_tags = tags;
    this.plugin.settings.consent_completed = true;
    await this.plugin.saveSettings();
    this.plugin.restartCapture();
    this.plugin.forgetLinkSurvey();
    if (folders.length === 0 && tags.length === 0) {
      notifyStatus("Nothing shared. Myu will not read this vault.");
      this.onFinished();
      this.close();
      return;
    }
    this.close();
    this.onFinished();
  }
};
function splitList(value) {
  return value.split(",").map((s2) => s2.trim()).filter(Boolean);
}
function normalizeFolder2(path) {
  return path.replace(/^\/+|\/+$/g, "").trim();
}

// src/views/MeetingConsentModal.ts
var import_obsidian5 = require("obsidian");
var MeetingConsentModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, onFinished) {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.folders = "";
  }
  onOpen() {
    this.folders = this.plugin.settings.meeting_folders.join(", ");
    this.render();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.plugin.settings.meeting_consent_offered) {
      this.plugin.settings.meeting_consent_offered = true;
      void this.plugin.saveSettings();
    }
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Share meeting notes with Myu?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Notes in the folders you choose become meetings Myu understands: decisions, who owns what, and the read on each person deepen from what you already write."
    });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "This is a different kind of sharing than your journal. Meeting notes carry other people's words, and their content is processed on askMyu's servers like every meeting source \u2014 it is not end-to-end encrypted the way journal capture is. Say no and nothing changes."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "A note outside these folders can opt in with `myu-meeting: true` in its frontmatter; clearing the list stops the watching entirely."
    });
    new import_obsidian5.Setting(contentEl).setName("Meeting-notes folders").setDesc("Comma-separated paths, e.g. Meetings, work/1-1s").addText(
      (t) => t.setPlaceholder("Meetings").setValue(this.folders).onChange((v) => {
        this.folders = v;
      })
    );
    new import_obsidian5.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Share these").setCta().onClick(() => void this.confirm())
    );
  }
  async confirm() {
    const folders = this.folders.split(",").map((f) => f.replace(/^\/+|\/+$/g, "").trim()).filter(Boolean);
    this.plugin.settings.meeting_folders = folders;
    await this.plugin.saveSettings();
    this.plugin.restartCapture();
    void this.plugin.runMeetingBackfill();
    notifyStatus(
      folders.length === 0 ? "No meeting folders shared. Myu reads none." : `Sharing meeting notes from: ${folders.join(", ")}`
    );
    this.close();
    this.onFinished();
  }
};

// src/views/MaterializeConsentModal.ts
var import_obsidian6 = require("obsidian");
var MaterializeConsentModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, onFinished) {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.folder = "Myu";
    this.people = true;
    this.today = true;
    this.commitments = true;
    /** Set true by confirm(); read in onClose so the ladder can proceed to
        backfill whether the user said yes or "not now". */
    this.accepted = false;
  }
  onOpen() {
    const s2 = this.plugin.settings;
    this.folder = s2.materialize_folder || "Myu";
    this.people = s2.materialize_people;
    this.today = s2.materialize_today;
    this.commitments = s2.materialize_commitments;
    this.render();
  }
  onClose() {
    this.contentEl.empty();
    this.onFinished(this.accepted);
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Let Myu keep a folder in your vault?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Myu keeps one folder in your vault, up to date: a page for each person and company, your journal, meetings, your calendar, today and the week, and any canvas you save. All plain markdown. Myu writes only in this folder \u2014 your own notes are never touched."
    });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Worth knowing: these files are plain text on your disk, and they sync wherever your vault syncs. Right now this content lives only on askMyu\u2019s servers, encrypted. If you\u2019d rather keep it that way, say no \u2014 nothing changes."
    });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "You can tick a checkbox in these files to mark something done \u2014 Myu sees it. But don\u2019t write notes in them: Myu rewrites these files, and your edits would be lost."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Every file is marked `myu-generated: true`. You can turn writing off in settings, and \u201CRemove everything Myu wrote\u201D (Settings \u2192 askMyu \u2192 Your data) moves it all to the trash."
    });
    new import_obsidian6.Setting(contentEl).setName("Folder").setDesc("Everything Myu writes lives under this path.").addText(
      (t) => t.setPlaceholder("Myu").setValue(this.folder).onChange((v) => {
        this.folder = v;
      })
    );
    new import_obsidian6.Setting(contentEl).setName("People").setDesc("A page per person \u2014 role, company, what Myu knows. A ready-made base makes it a table.").addToggle((t) => t.setValue(this.people).onChange((v) => this.people = v));
    new import_obsidian6.Setting(contentEl).setName("Today and the week").setDesc("The brief and weekly review as files \u2014 embed `![[Myu/Today]]` in your daily template.").addToggle((t) => t.setValue(this.today).onChange((v) => this.today = v));
    new import_obsidian6.Setting(contentEl).setName("Commitments").setDesc("Open commitments as real checkboxes your Tasks queries can see.").addToggle((t) => t.setValue(this.commitments).onChange((v) => this.commitments = v));
    new import_obsidian6.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Start writing").setCta().onClick(() => void this.confirm())
    );
  }
  async confirm() {
    const s2 = this.plugin.settings;
    s2.materialize_consented = true;
    s2.materialize_enabled = true;
    s2.materialize_folder = this.folder.replace(/^\/+|\/+$/g, "").trim() || "Myu";
    s2.materialize_people = this.people;
    s2.materialize_today = this.today;
    s2.materialize_commitments = this.commitments;
    await this.plugin.saveSettings();
    notifyStatus(`Myu is filling ${s2.materialize_folder}/ \u2014 watch it build.`);
    this.accepted = true;
    this.close();
  }
};

// src/views/SignupModal.ts
var import_obsidian7 = require("obsidian");

// src/devHooks.ts
var signupDoors = [];

// src/brand.ts
var VIEWBOX = "0 0 600 600";
var LABEL = "askMyu character \u2014 sumie-white-on-dark";
var SEAL_FILL = "#CC5200";
var SEAL_R = "300.0";
var CHARACTER_FILL = "#FAFAF9";
var CHARACTER_TRANSFORM = "translate(137.17,66.00) scale(1.0241)";
var CHARACTER_PATH = "M170.00,455.93C165.88,455.46 159.23,454.86 155.23,454.59C151.23,454.32 147.58,453.86 147.12,453.58C146.66,453.29 144.32,452.81 141.91,452.51C139.50,452.21 136.17,451.53 134.51,451.01C132.86,450.48 126.59,448.65 120.59,446.94C88.36,437.75 63.73,418.19 49.18,390.24C44.90,382.01 44.08,379.68 46.20,381.80C48.11,383.71 49.14,383.19 47.77,381.00C47.08,379.90 45.74,379.00 44.80,379.00C42.95,379.00 40.54,372.27 41.29,369.17C41.72,367.39 41.85,367.60 43.46,372.47C43.98,374.07 44.27,374.17 44.98,373.03C45.49,372.21 45.48,370.89 44.96,369.92C44.46,369.00 43.53,365.07 42.89,361.19C41.88,355.06 41.94,353.92 43.31,352.55C44.74,351.11 44.98,351.13 45.95,352.74C46.84,354.22 46.94,354.07 46.58,351.81C46.34,350.31 46.67,348.90 47.33,348.63C48.15,348.30 48.05,347.83 47.00,347.08C45.73,346.16 45.71,345.86 46.90,345.10C48.42,344.12 47.85,337.15 46.15,336.08C45.65,335.76 45.01,334.60 44.73,333.50C44.39,332.15 44.19,332.54 44.12,334.69C44.05,336.45 44.45,338.16 45.00,338.50C46.24,339.27 46.33,343.00 45.11,343.00C44.62,343.00 43.92,342.23 43.55,341.28C42.99,339.80 42.76,339.77 41.96,341.03C41.31,342.06 40.99,342.13 40.89,341.25C40.81,340.56 40.64,339.55 40.50,339.00C40.36,338.45 40.19,337.21 40.11,336.25C39.99,334.75 39.83,334.71 39.00,336.00C38.16,337.29 38.03,337.27 38.02,335.81C38.01,334.88 38.45,333.84 39.00,333.50C40.50,332.57 40.20,331.00 38.53,331.00C37.66,331.00 37.29,330.41 37.62,329.55C37.93,328.75 37.48,327.10 36.64,325.89C35.55,324.34 35.38,323.16 36.05,321.91C36.67,320.75 36.65,319.90 36.00,319.50C34.37,318.49 34.85,315.46 37.10,312.60C38.79,310.46 38.96,309.65 37.97,308.47C36.98,307.27 37.10,306.98 38.63,306.88C39.66,306.82 40.81,306.81 41.19,306.86C41.57,306.92 42.16,306.06 42.51,304.97C42.86,303.87 43.57,303.23 44.09,303.55C44.61,303.88 44.73,304.63 44.36,305.22C43.97,305.86 44.16,306.02 44.82,305.61C45.44,305.23 46.49,303.11 47.15,300.90C48.41,296.70 51.44,293.99 52.33,296.26C52.59,296.94 53.14,296.04 53.53,294.25C54.27,290.91 55.48,290.04 56.30,292.25C56.56,292.95 57.24,292.30 57.86,290.75C58.46,289.24 59.36,288.00 59.86,288.00C60.36,288.00 62.61,285.19 64.87,281.75C68.78,275.81 80.97,262.00 82.31,262.00C82.65,262.00 82.65,262.75 82.30,263.66C81.87,264.78 82.04,265.09 82.83,264.61C83.47,264.21 84.00,264.31 84.00,264.82C84.00,265.34 83.01,266.03 81.79,266.34C80.58,266.66 79.87,267.21 80.22,267.56C80.57,267.91 79.91,269.84 78.75,271.85C72.68,282.38 70.81,286.39 67.95,295.04C64.97,304.08 64.83,305.20 64.92,320.00C64.99,330.57 64.70,335.02 64.02,334.00C63.48,333.18 62.96,329.57 62.88,326.00C62.80,322.43 62.53,320.51 62.29,321.75C62.06,322.99 61.43,324.00 60.91,324.00C59.78,324.00 60.92,318.65 62.15,318.17C62.62,317.98 63.00,317.17 63.00,316.36C63.00,315.55 62.59,315.14 62.09,315.45C61.58,315.76 60.94,315.45 60.66,314.76C60.39,314.07 60.12,315.39 60.08,317.69C60.00,321.74 58.59,324.27 57.77,321.81C57.55,321.15 57.30,323.96 57.22,328.05C57.08,335.25 59.89,348.14 62.09,350.45C62.59,350.97 63.00,352.24 63.00,353.26C63.00,354.28 63.43,354.85 63.96,354.53C64.48,354.20 64.63,353.20 64.28,352.29C63.80,351.03 64.06,350.81 65.46,351.35C67.08,351.97 67.20,351.60 66.62,347.77C66.02,343.87 66.26,344.14 69.32,351.00C75.99,365.94 77.50,368.63 83.72,376.50C93.89,389.37 105.61,399.12 118.50,405.42C132.20,412.11 139.98,414.57 156.50,417.40C168.01,419.37 171.16,419.53 184.00,418.80C191.97,418.35 202.52,417.27 207.43,416.41C223.60,413.56 247.69,404.45 258.17,397.22C263.29,393.69 277.12,379.79 280.36,374.92C285.99,366.47 290.82,344.75 289.56,333.59C289.18,330.24 288.67,325.77 288.43,323.66C288.19,321.55 287.27,316.60 286.39,312.66C285.52,308.72 284.23,302.80 283.55,299.50C281.77,290.99 278.61,282.55 271.96,268.50C268.96,262.18 265.65,247.88 265.58,241.00C265.51,234.12 265.79,233.03 269.00,227.78C270.93,224.63 272.78,222.04 273.12,222.03C273.47,222.01 274.00,223.25 274.31,224.78C275.56,231.04 279.48,239.51 285.04,247.98C288.28,252.92 292.32,260.23 294.01,264.23C295.70,268.23 298.58,273.98 300.42,277.00C307.60,288.82 313.66,306.99 315.93,323.50C317.54,335.19 317.66,351.50 316.14,353.33C315.30,354.34 315.24,355.03 315.95,355.47C319.00,357.36 315.68,374.11 310.32,383.86C300.41,401.92 291.97,411.96 276.04,424.71C257.53,439.51 240.16,446.66 211.00,451.47C206.32,452.24 201.79,453.14 200.92,453.48C199.40,454.06 188.42,455.69 181.00,456.43C179.07,456.63 174.12,456.40 170.00,455.93ZM55.06,367.03C51.73,359.22 50.35,357.00 48.83,357.00C47.76,357.00 47.04,357.34 47.24,357.75C47.96,359.28 49.81,363.63 51.59,368.00C54.28,374.59 57.34,379.06 58.42,377.98C58.98,377.42 57.67,373.14 55.06,367.03ZM67.49,360.98C66.05,358.13 64.69,355.98 64.48,356.19C63.99,356.68 66.12,362.71 67.95,366.00C70.54,370.66 70.13,366.19 67.49,360.98ZM72.26,362.57C72.00,361.23 71.16,359.89 70.38,359.59C69.22,359.15 69.25,359.58 70.51,362.03C72.38,365.64 72.87,365.79 72.26,362.57ZM37.67,361.33C37.30,360.97 37.03,359.73 37.06,358.58C37.12,356.67 37.20,356.69 38.08,358.90C39.06,361.34 38.86,362.53 37.67,361.33ZM42.67,349.33C42.30,348.97 42.00,348.01 42.00,347.21C42.00,346.03 42.28,345.99 43.50,347.00C44.33,347.68 45.00,348.64 45.00,349.12C45.00,350.16 43.62,350.28 42.67,349.33ZM62.00,344.50C62.00,343.68 62.18,343.00 62.39,343.00C62.61,343.00 63.05,343.68 63.36,344.50C63.68,345.32 63.50,346.00 62.97,346.00C62.44,346.00 62.00,345.32 62.00,344.50ZM38.00,340.44C38.00,339.58 38.45,339.16 39.00,339.50C39.55,339.84 40.00,340.54 40.00,341.06C40.00,341.58 39.55,342.00 39.00,342.00C38.45,342.00 38.00,341.30 38.00,340.44ZM59.92,332.75C59.87,332.06 59.72,330.49 59.58,329.25C59.45,328.01 59.71,327.00 60.17,327.00C60.63,327.00 61.00,327.86 61.00,328.92C61.00,329.97 61.27,331.55 61.61,332.42C61.94,333.29 61.72,334.00 61.11,334.00C60.50,334.00 59.96,333.44 59.92,332.75ZM43.66,326.75C43.38,326.06 43.16,326.62 43.16,328.00C43.16,329.38 43.38,329.94 43.66,329.25C43.94,328.56 43.94,327.44 43.66,326.75ZM62.90,309.75C62.82,306.29 62.67,305.96 62.08,308.00C61.41,310.32 61.74,314.00 62.62,314.00C62.83,314.00 62.96,312.09 62.90,309.75ZM44.08,300.42C44.13,299.25 44.36,299.01 44.68,299.81C44.97,300.53 44.94,301.40 44.60,301.73C44.27,302.06 44.04,301.47 44.08,300.42ZM52.00,299.00C52.00,298.45 51.80,298.00 51.56,298.00C51.32,298.00 50.84,298.45 50.50,299.00C50.16,299.55 50.36,300.00 50.94,300.00C51.52,300.00 52.00,299.55 52.00,299.00ZM56.00,294.50C56.00,293.68 55.82,293.00 55.61,293.00C55.39,293.00 54.95,293.68 54.64,294.50C54.32,295.32 54.50,296.00 55.03,296.00C55.56,296.00 56.00,295.32 56.00,294.50ZM160.18,283.97C151.06,279.06 147.91,270.89 149.25,255.58C149.49,252.76 149.17,252.53 140.00,249.00C128.45,244.55 111.48,236.19 106.30,232.40C97.82,226.18 93.04,220.23 100.73,225.46C102.78,226.86 104.81,228.00 105.23,228.00C106.87,228.00 105.86,226.41 103.00,224.50C101.35,223.40 100.00,221.85 100.00,221.05C100.00,219.92 100.27,219.87 101.20,220.80C101.86,221.46 102.84,222.00 103.37,222.00C103.91,222.00 103.48,221.16 102.42,220.13C101.37,219.10 100.14,218.46 99.71,218.71C97.57,219.95 80.00,203.03 80.00,199.74C80.00,199.20 80.67,199.32 81.50,200.00C82.62,200.93 83.00,200.94 83.00,200.06C83.00,199.41 83.50,199.19 84.11,199.57C84.88,200.04 84.82,200.50 83.89,201.07C83.16,201.52 82.94,202.25 83.42,202.70C83.89,203.14 84.48,202.93 84.72,202.24C84.97,201.55 85.58,201.24 86.09,201.55C87.60,202.49 87.11,200.34 85.50,199.00C84.67,198.32 84.00,197.14 84.00,196.38C84.00,195.62 83.62,195.00 83.16,195.00C81.89,195.00 79.98,190.22 80.60,188.61C80.90,187.83 80.04,184.34 78.69,180.85C77.34,177.36 75.98,173.73 75.66,172.78C74.28,168.65 77.31,170.65 84.74,178.78C89.13,183.58 94.03,188.17 95.62,188.97C97.20,189.77 99.78,191.30 101.35,192.36C103.59,193.86 104.38,194.00 105.00,193.00C105.61,192.01 106.47,192.20 108.80,193.86C112.41,196.43 115.97,196.87 114.00,194.50C112.99,193.29 113.03,193.00 114.18,193.00C114.96,193.00 116.03,193.40 116.55,193.88C118.99,196.14 140.78,207.19 148.00,209.83C151.03,210.94 156.43,212.97 160.00,214.34C174.66,219.97 197.55,221.93 210.50,218.66C240.66,211.05 256.74,201.27 271.20,181.71C276.14,175.04 276.52,174.74 276.82,177.28C276.99,178.77 277.47,180.00 277.89,180.00C278.90,180.00 283.00,175.60 283.00,174.51C283.00,174.04 283.63,172.95 284.40,172.08C286.16,170.10 289.00,160.61 289.00,156.71C289.00,154.09 288.74,153.85 286.50,154.41L284.00,155.04 L284.00,146.68C284.00,136.18 281.29,125.32 275.90,114.18C269.24,100.41 267.97,96.97 267.35,91.04C266.87,86.49 267.16,84.60 268.85,81.29C270.00,79.03 271.41,77.03 271.98,76.84C272.59,76.64 273.26,70.71 273.61,62.50C274.07,51.80 273.85,46.80 272.66,41.27C270.64,31.82 267.06,24.60 264.18,24.18C259.04,23.43 242.93,33.28 233.54,42.91C228.37,48.21 226.60,49.22 227.72,46.25C228.28,44.75 228.14,44.69 226.78,45.80C225.82,46.58 224.94,46.71 224.59,46.14C223.75,44.79 234.79,30.19 240.08,25.66C242.51,23.57 246.93,20.48 249.90,18.77C255.31,15.68 256.73,15.43 270.75,15.12C275.50,15.01 276.00,14.78 275.99,12.75C275.99,11.51 275.32,9.21 274.49,7.64C272.68,4.16 272.67,4.00 274.27,4.00C276.89,4.00 282.96,10.23 286.69,16.75C296.37,33.65 300.00,45.75 300.00,61.12C300.00,70.08 297.67,83.47 295.92,84.55C294.34,85.53 294.92,93.36 296.82,96.50C300.16,102.03 306.00,117.74 306.00,121.19C306.00,123.07 306.52,125.12 307.16,125.76C308.03,126.63 308.02,127.27 307.10,128.38C306.41,129.21 305.95,132.35 306.04,135.67C306.13,138.88 305.90,144.20 305.54,147.50C304.91,153.29 304.94,153.41 306.50,151.00C308.06,148.58 308.10,148.70 307.59,154.65C307.29,158.03 306.63,161.85 306.11,163.15C305.59,164.44 304.41,167.97 303.49,171.00C302.58,174.03 301.00,177.40 299.99,178.50C298.98,179.60 297.83,181.85 297.44,183.50C296.60,187.03 290.90,197.00 289.72,197.00C288.71,197.00 284.07,202.18 284.03,203.36C284.01,203.83 279.61,208.70 274.25,214.19C257.69,231.13 244.64,238.73 215.05,248.65C207.65,251.13 201.08,253.88 200.44,254.75C199.53,255.99 196.77,256.44 187.89,256.79C181.63,257.04 175.71,257.65 174.75,258.16C168.30,261.52 180.15,275.00 189.55,275.00C192.69,275.00 192.40,276.97 189.02,278.67C187.55,279.41 185.86,279.52 184.42,278.97C182.91,278.40 182.01,278.48 181.76,279.22C181.50,279.99 180.38,279.84 178.18,278.74C176.41,277.86 175.22,277.55 175.53,278.04C175.85,278.56 173.91,278.80 171.04,278.60C166.25,278.26 164.27,279.40 167.50,280.64C170.28,281.70 169.03,282.60 165.25,282.25C162.21,281.97 161.83,282.11 163.25,283.00C164.99,284.09 165.69,286.11 164.25,285.88C163.84,285.81 162.01,284.95 160.18,283.97ZM92.00,220.50C90.71,219.12 90.08,218.00 90.60,218.00C91.72,218.00 95.33,222.00 94.74,222.59C94.52,222.81 93.29,221.87 92.00,220.50ZM97.50,214.00C97.16,213.45 96.43,213.00 95.88,213.00C95.33,213.00 95.16,213.45 95.50,214.00C95.84,214.55 96.57,215.00 97.12,215.00C97.67,215.00 97.84,214.55 97.50,214.00ZM92.77,210.62C91.81,209.89 91.32,209.01 91.68,208.65C92.04,208.29 91.81,208.00 91.17,208.00C89.41,208.00 89.76,209.76 91.75,210.92C94.22,212.36 94.82,212.18 92.77,210.62ZM88.00,205.50C87.29,204.65 86.49,204.18 86.21,204.45C85.94,204.73 86.29,205.65 87.00,206.50C87.71,207.35 88.51,207.82 88.79,207.55C89.06,207.27 88.71,206.35 88.00,205.50ZM40.83,204.99C40.64,204.43 39.37,203.76 38.00,203.50C36.63,203.24 35.35,202.55 35.16,201.98C34.97,201.41 32.94,198.65 30.66,195.84C28.37,193.03 25.48,189.22 24.24,187.37C22.99,185.52 21.36,184.00 20.62,184.00C19.88,184.00 18.14,183.11 16.77,182.03C15.39,180.95 13.95,180.38 13.57,180.76C12.55,181.78 7.02,175.17 4.86,170.35C2.09,164.17 -0.28,150.37 0.30,143.76C0.85,137.56 5.88,127.00 10.84,121.62C14.97,117.15 23.07,112.33 30.47,109.94C44.59,105.37 58.17,108.75 73.80,120.71C83.35,128.01 87.87,133.56 88.37,138.59C88.58,140.74 89.30,144.89 89.97,147.80C90.95,152.06 90.93,153.98 89.88,157.55C89.15,160.00 88.18,162.00 87.71,162.00C87.23,162.00 83.84,158.92 80.16,155.16C72.63,147.47 64.25,142.85 54.59,141.09C45.73,139.47 41.76,140.88 34.61,148.20L28.72,154.22 L29.29,163.11C29.81,171.14 30.42,173.24 35.55,184.75C38.68,191.76 41.63,197.93 42.12,198.45C43.90,200.36 42.94,201.25 40.99,199.49C37.83,196.63 37.52,198.51 40.52,202.43C42.01,204.40 42.77,206.00 42.20,206.00C41.63,206.00 41.02,205.55 40.83,204.99ZM83.18,189.78C82.47,189.07 82.00,189.01 82.00,189.63C82.00,190.97 83.18,192.15 83.85,191.48C84.13,191.20 83.83,190.43 83.18,189.78ZM77.62,187.25C77.28,186.29 76.74,184.94 76.42,184.25C76.10,183.56 76.25,183.00 76.76,183.00C77.54,183.00 80.00,187.20 80.00,188.55C80.00,189.78 78.16,188.78 77.62,187.25ZM190.50,182.21C188.85,181.17 185.77,178.40 183.66,176.06L179.82,171.80 L177.16,174.33C171.38,179.85 160.72,182.59 154.64,180.12C152.32,179.18 152.00,178.70 152.97,177.54C153.91,176.40 153.73,175.85 152.08,174.82C148.84,172.79 149.41,170.71 152.98,171.50C157.74,172.54 166.75,170.20 170.33,166.99L173.50,164.15 L170.71,161.23C168.30,158.70 168.12,158.14 169.41,157.08C170.56,156.12 170.65,155.33 169.82,153.50C167.60,148.64 170.85,144.31 177.00,143.93C184.53,143.47 187.80,144.09 190.35,146.45C193.79,149.64 193.69,151.85 189.91,156.61C187.39,159.79 186.92,161.13 187.37,163.91C188.48,170.72 197.42,176.94 206.19,176.98C211.76,177.00 213.03,178.41 210.11,181.33C207.05,184.39 194.83,184.94 190.50,182.21ZM71.50,179.00C71.16,178.45 71.36,178.00 71.94,178.00C72.52,178.00 73.00,178.45 73.00,179.00C73.00,179.55 72.80,180.00 72.56,180.00C72.32,180.00 71.84,179.55 71.50,179.00ZM68.53,173.42C67.66,171.33 66.69,168.47 66.38,167.06C66.07,165.65 65.58,163.60 65.29,162.50C64.01,157.56 66.94,163.09 68.92,169.37C71.31,176.88 71.06,179.46 68.53,173.42ZM72.62,171.46C71.66,168.95 71.94,168.30 73.12,170.33C73.71,171.33 73.97,172.36 73.72,172.62C73.46,172.88 72.97,172.36 72.62,171.46ZM307.00,146.06C307.00,144.93 307.45,144.00 308.00,144.00C308.55,144.00 309.00,144.65 309.00,145.44C309.00,146.23 308.55,147.16 308.00,147.50C307.45,147.84 307.00,147.19 307.00,146.06ZM307.00,135.44C307.00,133.99 307.43,133.15 308.00,133.50C308.55,133.84 309.00,134.99 309.00,136.06C309.00,137.13 308.55,138.00 308.00,138.00C307.45,138.00 307.00,136.85 307.00,135.44ZM131.16,128.73C129.32,128.14 125.14,125.12 121.86,122.03L115.91,116.39 L118.41,113.70C120.39,111.56 121.81,111.00 125.30,111.00C134.04,111.00 142.28,115.72 143.92,121.68C145.11,125.98 144.43,127.89 141.30,129.08C138.31,130.21 135.51,130.12 131.16,128.73ZM215.63,127.93C211.93,125.01 212.33,122.87 217.48,118.13C222.41,113.58 223.27,113.43 234.48,115.05C243.39,116.34 244.42,117.35 240.36,120.82C230.03,129.64 229.37,130.00 223.70,130.00C219.72,130.00 217.57,129.45 215.63,127.93ZM66.60,94.18C62.24,85.78 60.71,63.83 63.42,48.47C65.28,37.87 69.37,25.34 74.14,15.64C76.26,11.32 78.00,7.14 78.00,6.36C78.00,4.28 75.50,3.66 72.83,5.09C70.63,6.26 70.58,6.22 71.95,4.41C74.80,0.65 76.40,-0.00 82.80,-0.00C87.67,-0.00 91.44,0.83 98.36,3.43C111.40,8.31 121.00,12.76 121.00,13.90C121.00,14.44 123.81,17.03 127.25,19.65C130.69,22.26 134.32,25.33 135.33,26.45C141.20,33.02 145.22,37.00 145.99,37.00C146.48,37.00 150.61,36.10 155.19,35.01C174.25,30.44 198.16,34.69 219.00,46.34C225.23,49.83 226.92,51.58 226.97,54.61C226.99,56.19 225.92,57.14 222.72,58.36C217.18,60.48 213.48,60.41 202.50,57.96C190.76,55.35 170.56,54.35 161.48,55.93C157.68,56.59 150.59,58.49 145.72,60.15C137.16,63.07 136.74,63.11 132.91,61.58C130.74,60.71 128.15,60.00 127.16,60.00C126.06,60.00 123.54,57.37 120.70,53.25C110.90,39.01 92.21,22.56 87.77,24.26C83.83,25.77 79.23,48.25 78.46,69.76C77.74,89.86 77.36,92.54 75.44,90.95C74.24,89.95 73.99,90.31 73.97,93.13C73.94,96.07 73.78,96.29 72.66,94.82C71.30,93.03 69.61,93.55 68.81,96.00C68.47,97.04 67.80,96.49 66.60,94.18Z";
function appendBrand(el, cls = "myu-brand") {
  const host = el.createDiv({ cls });
  const svg = host.createSvg("svg", { attr: { viewBox: VIEWBOX, "aria-label": LABEL } });
  svg.createSvg("circle", { attr: { cx: SEAL_R, cy: SEAL_R, r: SEAL_R, fill: SEAL_FILL } });
  const character = svg.createSvg("g", {
    attr: { transform: CHARACTER_TRANSFORM, fill: CHARACTER_FILL, "fill-rule": "evenodd" }
  });
  character.createSvg("path", { attr: { d: CHARACTER_PATH } });
}

// src/terms.ts
var TERMS_TYPES = ["beta_participation", "privacy_policy"];
var TERMS_LABELS = {
  beta_participation: "Beta participation terms",
  privacy_policy: "Privacy policy"
};
var TERMS_FALLBACK_URLS = {
  beta_participation: "https://www.askmyu.com/beta-program-participation-terms",
  privacy_policy: "https://www.askmyu.com/privacy-policy"
};
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var strings = (v) => Array.isArray(v) ? v.filter((s2) => typeof s2 === "string" && s2.length > 0) : [];
function urlsFrom(raw) {
  const out = { ...TERMS_FALLBACK_URLS };
  if (!isRecord(raw)) return out;
  for (const [type, url] of Object.entries(raw)) {
    if (typeof url === "string" && /^https:\/\//.test(url)) out[type] = url;
  }
  return out;
}
function parseTermsInfo(data) {
  if (!isRecord(data) || typeof data.current_version !== "string" || !data.current_version) return null;
  const required = strings(data.required);
  return {
    currentVersion: data.current_version,
    required: required.length ? required : [...TERMS_TYPES],
    urls: urlsFrom(data.urls)
  };
}
function parseTermsState(data) {
  const t = isRecord(data) ? data.terms : null;
  if (!isRecord(t) || typeof t.current_version !== "string" || !t.current_version) return null;
  const accepted = {};
  if (isRecord(t.accepted_versions)) {
    for (const [type, v] of Object.entries(t.accepted_versions)) if (typeof v === "string" && v) accepted[type] = v;
  }
  return {
    currentVersion: t.current_version,
    required: strings(t.required),
    urls: urlsFrom(t.urls),
    satisfied: t.satisfied === true,
    acceptedVersions: accepted,
    gateEnabled: t.gate_enabled !== false
  };
}
function termsStateFrom428(body) {
  if (!isRecord(body) || body.error !== "terms_required") return null;
  const version = typeof body.terms_version === "string" ? body.terms_version : "";
  const required = strings(body.terms_required);
  return {
    currentVersion: version,
    required: required.length ? required : [...TERMS_TYPES],
    urls: urlsFrom(body.urls),
    satisfied: false,
    acceptedVersions: {},
    gateEnabled: true
  };
}
function termsStanding(state) {
  if (!state) return "ok";
  if (state.gateEnabled && !state.satisfied) return "gated";
  if (!state.satisfied) return "ok";
  const types = /* @__PURE__ */ new Set([...state.required, ...Object.keys(state.acceptedVersions)]);
  for (const type of types) {
    const accepted = state.acceptedVersions[type];
    if (accepted && accepted < state.currentVersion) return "update";
  }
  return "ok";
}
function termsLinks(urls) {
  return TERMS_TYPES.map((type) => ({ type, label: TERMS_LABELS[type], url: urls[type] ?? TERMS_FALLBACK_URLS[type] }));
}

// src/views/SignupModal.ts
var GOOGLE_G_PATHS = [
  ["#4285F4", "M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"],
  ["#34A853", "M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"],
  ["#FBBC05", "M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"],
  ["#EA4335", "M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"]
];
var SignupModal = class extends import_obsidian7.Modal {
  constructor(app, plugin, onFinished, flavor = "create") {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.flavor = flavor;
    this.email = "";
    this.name = "";
    this.password = "";
    this.pasted = "";
    this.stage = "form";
    this.showPassword = false;
    /** Which door the 'sent' stage is waiting on — tunes its copy. */
    this.sentVia = "email";
    /** Polls the machine while 'sent' — the deep link lands OUTSIDE this modal,
        and a modal that can't notice its own success just sits there (live
        finding, 2026-08-25: sign-in completed behind the modal; the user saw
        nothing but "Check your email"). */
    this.sentWatch = null;
    this.working = false;
    /**
     * Beta terms (2026-09-02): affirmative assent at the one moment an account
     * is created. `/terms` is public and read here because the door has no
     * session yet; the version the person SAW is the version sent back. When it
     * cannot be reached the links fall back to the public pages and no version
     * is sent — the backend's gate catches that on first load.
     */
    this.agreed = false;
    this.terms = null;
    this.termsAsked = false;
  }
  onOpen() {
    this.render();
    void this.loadTerms();
  }
  async loadTerms() {
    if (this.termsAsked) return;
    this.termsAsked = true;
    const res = await this.plugin.backend.getTerms().catch(() => null);
    this.terms = res?.ok ? parseTermsInfo(res.data) : null;
    if (this.stage === "form") this.render();
  }
  /** The bundle to send: only what was shown and agreed to. */
  termsVersion() {
    return this.agreed && this.terms ? this.terms.currentVersion : void 0;
  }
  /** Create-flavour doors are inert until the box is ticked; pressing one says why. */
  doorOpen() {
    if (this.flavor !== "create" || this.agreed) return true;
    notifyError("Tick the box to continue.");
    return false;
  }
  markDoor(el) {
    if (this.flavor !== "create" || this.agreed) return;
    el.addClass("myu-inert");
    el.setAttr("aria-disabled", "true");
  }
  /**
   * The sentence uses the agreement's own words ("I agree"), both documents
   * are links that open in the browser, and the links are BUILT — Obsidian's
   * review rejects assigned markup categorically.
   */
  renderTermsRow(host) {
    const row = host.createDiv({ cls: "myu-terms-row" });
    const label = row.createEl("label", { cls: "myu-terms-label" });
    const box = label.createEl("input", { cls: "myu-terms-box", attr: { type: "checkbox", "aria-label": "I agree to the beta participation terms and the privacy policy" } });
    box.checked = this.agreed;
    box.onchange = () => {
      this.agreed = box.checked;
      this.render();
    };
    const sentence = label.createSpan({ cls: "myu-terms-sentence" });
    sentence.appendText("I agree to the ");
    const links = termsLinks(this.terms?.urls ?? TERMS_FALLBACK_URLS);
    links.forEach((link, i) => {
      sentence.createEl("a", { text: link.label, href: link.url, attr: { target: "_blank", rel: "noopener" } });
      sentence.appendText(i === 0 ? " and the " : ".");
    });
  }
  watchWhileSent() {
    if (this.sentWatch !== null) return;
    this.sentWatch = window.setInterval(() => {
      const state = this.plugin.unlock.current;
      if (state === "unlocked") {
        this.close();
      } else if (state === "blocked") {
        if (this.plugin.unlock.genesisPending) {
          this.close();
        } else {
          this.close();
          new ApprovalModal(this.app, this.plugin.unlock, () => this.onFinished()).open();
        }
      }
    }, 700);
  }
  onClose() {
    if (this.sentWatch !== null) {
      window.clearInterval(this.sentWatch);
      this.sentWatch = null;
    }
    this.contentEl.empty();
  }
  /** The web app's origin for this stack: the backend origin, minus /api. */
  webOrigin() {
    return this.plugin.settings.base_url.replace(/\/api\/?$/, "");
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    if (this.stage === "sent") {
      this.renderSent();
      return;
    }
    if (this.flavor === "signin") {
      appendBrand(contentEl);
      contentEl.createEl("h2", { text: "Sign in to Myu" });
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: "Welcome back. Any door below reaches your existing account."
      });
    } else {
      appendBrand(contentEl);
      contentEl.createEl("h2", { text: "Start with Myu, right here" });
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: "Your account starts in the vault. Share a meeting-notes folder and Myu builds your people, decisions, and commitments from notes you already have \u2014 no calendar or email needed to begin."
      });
    }
    const google = contentEl.createEl("button", { cls: "myu-google-door" });
    const gMark = google.createSpan({ cls: "myu-google-mark" });
    const gSvg = gMark.createSvg("svg", {
      attr: { viewBox: "0 0 18 18", width: "16", height: "16", "aria-hidden": "true" }
    });
    for (const [fill, d] of GOOGLE_G_PATHS) gSvg.createSvg("path", { attr: { fill, d } });
    google.createSpan({ text: "Continue with Google" });
    this.markDoor(google);
    google.onclick = () => {
      if (!this.doorOpen()) return;
      const version = this.termsVersion();
      window.open(`${this.webOrigin()}/?origin=obsidian${version ? `&terms_version=${encodeURIComponent(version)}` : ""}`, "_blank");
      this.stage = "sent";
      this.sentVia = "google";
      this.render();
    };
    contentEl.createDiv({ cls: "myu-door-divider", text: "or with your email" });
    new import_obsidian7.Setting(contentEl).setName("Email").addText((t) => {
      t.setPlaceholder("you@company.com").setValue(this.email).onChange((v) => this.email = v.trim());
      t.inputEl.type = "email";
    });
    if (this.flavor === "create") {
      new import_obsidian7.Setting(contentEl).setName("Name").addText((t) => {
        t.setPlaceholder("Your name").setValue(this.name).onChange((v) => this.name = v.trim());
      });
      this.renderTermsRow(contentEl);
    }
    if (this.showPassword) {
      new import_obsidian7.Setting(contentEl).setName("Password").setDesc(
        "For signing in to askMyu on the web or your phone later. It is not an encryption passphrase \u2014 your notes\u2019 key is created separately on this device and never comes from this password."
      ).addText((t) => {
        t.setPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").onChange((v) => this.password = v);
        t.inputEl.type = "password";
      });
    }
    const buttons = new import_obsidian7.Setting(contentEl);
    buttons.addButton((b) => b.setButtonText("Not now").onClick(() => this.close()));
    if (this.showPassword) {
      buttons.addButton((b) => {
        b.setButtonText("Create my account").setCta().onClick(() => void this.submitPassword(b.buttonEl));
        this.markDoor(b.buttonEl);
      });
    } else {
      buttons.addButton((b) => {
        b.setButtonText("Email me a sign-in link").setCta().onClick(() => void this.submitMagic(b.buttonEl));
        this.markDoor(b.buttonEl);
      });
    }
    const doors = contentEl.createDiv({ cls: "myu-modal-doors" });
    const alt = doors.createEl("button", {
      cls: "myu-affordance",
      text: this.showPassword ? "Use a sign-in link instead" : "Use a password instead"
    });
    alt.onclick = () => {
      this.showPassword = !this.showPassword;
      this.render();
    };
    for (const door of signupDoors) {
      door(doors, { app: this.app, plugin: this.plugin, email: () => this.email, close: () => this.close(), finished: () => this.onFinished() });
    }
    const switchRow = contentEl.createDiv({ cls: "myu-modal-switch" });
    if (this.flavor === "create") {
      switchRow.createSpan({ cls: "myu-quiet", text: "Already use Myu?" });
      const toSignin = switchRow.createEl("button", { cls: "myu-affordance", text: "Sign in" });
      toSignin.onclick = () => {
        this.flavor = "signin";
        this.showPassword = false;
        this.render();
      };
    } else {
      switchRow.createSpan({ cls: "myu-quiet", text: "New to Myu?" });
      const toCreate = switchRow.createEl("button", { cls: "myu-affordance", text: "Create an account" });
      toCreate.onclick = () => {
        this.flavor = "create";
        this.render();
      };
    }
  }
  renderSent() {
    this.watchWhileSent();
    const { contentEl } = this;
    if (this.sentVia === "google") {
      contentEl.createEl("h2", { text: "Finish in your browser" });
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: "A browser tab is open with the Google sign-in. When it finishes, press \u201COpen in Obsidian\u201D on the page it lands on \u2014 you come right back here."
      });
    } else {
      contentEl.createEl("h2", { text: "Check your email" });
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: `A sign-in link is on its way to ${this.email}. It opens right back here \u2014 press \u201COpen in Obsidian\u201D on the page it lands on.`
      });
    }
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Nothing happening when you click? Paste the link from the page below."
    });
    new import_obsidian7.Setting(contentEl).setName("Paste the sign-in link").addText((t) => {
      t.setPlaceholder("https://\u2026token=\u2026").onChange((v) => this.pasted = v.trim());
    });
    new import_obsidian7.Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Sign in with the pasted link").setCta().onClick(() => void this.submitPasted(b.buttonEl))
    );
  }
  // ── doors ─────────────────────────────────────────────────────────────────
  async submitMagic(button) {
    if (this.working || !this.doorOpen()) return;
    if (!this.email) {
      notifyError("Email first \u2014 the sign-in link needs somewhere to go.");
      return;
    }
    this.working = true;
    button.disabled = true;
    button.textContent = "Sending\u2026";
    const res = await this.plugin.backend.requestMagicLink(this.email, this.name || void 0, this.termsVersion());
    this.working = false;
    if (res.ok) {
      this.stage = "sent";
      this.render();
    } else {
      notifyError("Could not send the link. Check the connection and try again.");
      button.disabled = false;
      button.textContent = "Email me a sign-in link";
    }
  }
  async submitPasted(button) {
    const token = /[?&]token=([^&\s]+)/.exec(this.pasted)?.[1] ?? (/^[a-fA-F0-9]{32}$/.test(this.pasted) ? this.pasted : void 0);
    if (!token) {
      notifyError("That doesn't look like the sign-in link \u2014 it carries a token= part.");
      return;
    }
    button.disabled = true;
    await this.plugin.completeMagicSignup(decodeURIComponent(token));
    this.close();
  }
  async submitPassword(button) {
    if (this.working || !this.doorOpen()) return;
    if (!this.email || !this.name || this.password.length < 8) {
      notifyError("Email, name, and a password of at least 8 characters.");
      return;
    }
    this.working = true;
    button.disabled = true;
    button.textContent = "Creating\u2026";
    const deviceId = await this.plugin.ensureDeviceId();
    const outcome = await this.plugin.unlock.signup(this.email, this.name, this.password, deviceId, this.termsVersion());
    this.working = false;
    if (outcome === "ceremony") {
      this.close();
      this.onFinished();
      this.plugin.openGenesisCeremony();
    } else if (outcome === "existing_account") {
      this.close();
      new ApprovalModal(this.app, this.plugin.unlock, () => this.onFinished()).open();
    } else if (outcome === "email_not_allowed") {
      notifyError("askMyu is in closed beta \u2014 this email isn\u2019t on the list yet. Ask for an invite.");
      button.disabled = false;
      button.textContent = "Create my account";
    } else {
      notifyError("Could not create the account. Check the connection and try again.");
      button.disabled = false;
      button.textContent = "Create my account";
    }
  }
};

// src/views/SetupRecoveryModal.ts
var import_obsidian8 = require("obsidian");

// ../../node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n, title = "") {
  if (!Number.isSafeInteger(n) || n < 0) {
    const prefix = title && `"${title}" `;
    throw new Error(`${prefix}expected integer >= 0, got ${n}`);
  }
}
function abytes(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "digestInto() output");
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error('"digestInto() output" expected to be of length >=' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr2) {
  return new DataView(arr2.buffer, arr2.byteOffset, arr2.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var nextTick = async () => {
};
async function asyncLoop(iters, tick, cb) {
  let ts = Date.now();
  for (let i = 0; i < iters; i++) {
    cb(i);
    const diff = Date.now() - ts;
    if (diff >= 0 && diff < tick)
      continue;
    await nextTick();
    ts += diff;
  }
}
function utf8ToBytes(str5) {
  if (typeof str5 !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str5));
}
function kdfInputToBytes(data, errorTitle = "") {
  if (typeof data === "string")
    return utf8ToBytes(data);
  return abytes(data, void 0, errorTitle);
}
function checkOpts(defaults, opts) {
  if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
    throw new Error("options must be object or undefined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// ../../node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  constructor(hash, key) {
    __publicField(this, "oHash");
    __publicField(this, "iHash");
    __publicField(this, "blockLen");
    __publicField(this, "outputLen");
    __publicField(this, "finished", false);
    __publicField(this, "destroyed", false);
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen, "output");
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new _HMAC(hash, key);

// ../../node_modules/@noble/hashes/pbkdf2.js
function pbkdf2Init(hash, _password, _salt, _opts) {
  ahash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  anumber(c, "c");
  anumber(dkLen, "dkLen");
  anumber(asyncTick, "asyncTick");
  if (c < 1)
    throw new Error("iterations (c) must be >= 1");
  const password = kdfInputToBytes(_password, "password");
  const salt = kdfInputToBytes(_salt, "salt");
  const DK = new Uint8Array(dkLen);
  const PRF = hmac.create(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt);
  return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}
function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
  PRF.destroy();
  PRFSalt.destroy();
  if (prfW)
    prfW.destroy();
  clean(u);
  return DK;
}
async function pbkdf2Async(hash, password, salt, opts) {
  const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
  let prfW;
  const arr2 = new Uint8Array(4);
  const view = createView(arr2);
  const u = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    (prfW = PRFSalt._cloneInto(prfW)).update(arr2).digestInto(u);
    Ti.set(u.subarray(0, Ti.length));
    await asyncLoop(c - 1, asyncTick, () => {
      PRF._cloneInto(prfW).update(u).digestInto(u);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u[i];
    });
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}

// ../../node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  constructor(blockLen, outputLen, padOffset, isLE) {
    __publicField(this, "blockLen");
    __publicField(this, "outputLen");
    __publicField(this, "padOffset");
    __publicField(this, "isLE");
    // For partial updates less than block size
    __publicField(this, "buffer");
    __publicField(this, "view");
    __publicField(this, "finished", false);
    __publicField(this, "length", 0);
    __publicField(this, "pos", 0);
    __publicField(this, "destroyed", false);
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);

// ../../node_modules/@noble/hashes/_u64.js
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var shrSH = (h, _l, s2) => h >>> s2;
var shrSL = (h, l, s2) => h << 32 - s2 | l >>> s2;
var rotrSH = (h, l, s2) => h >>> s2 | l << 32 - s2;
var rotrSL = (h, l, s2) => h << 32 - s2 | l >>> s2;
var rotrBH = (h, l, s2) => h << 64 - s2 | l >>> s2 - 32;
var rotrBL = (h, l, s2) => h >>> s2 - 32 | l << 64 - s2;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

// ../../node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  constructor(outputLen) {
    super(64, outputLen, 8, false);
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    __publicField(this, "A", SHA256_IV[0] | 0);
    __publicField(this, "B", SHA256_IV[1] | 0);
    __publicField(this, "C", SHA256_IV[2] | 0);
    __publicField(this, "D", SHA256_IV[3] | 0);
    __publicField(this, "E", SHA256_IV[4] | 0);
    __publicField(this, "F", SHA256_IV[5] | 0);
    __publicField(this, "G", SHA256_IV[6] | 0);
    __publicField(this, "H", SHA256_IV[7] | 0);
  }
};
var K512 = /* @__PURE__ */ (() => split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((n) => BigInt(n))))();
var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
var SHA2_64B = class extends HashMD {
  constructor(outputLen) {
    super(128, outputLen, 16, false);
  }
  // prettier-ignore
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  // prettier-ignore
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset += 4);
    }
    for (let i = 16; i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
      const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
      const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
      const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0; i < 80; i++) {
      const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
      const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
      const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const All = add3L(T1l, sigma0l, MAJl);
      Ah = add3H(All, T1h, sigma0h, MAJh);
      Al = All | 0;
    }
    ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
    ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
    ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
    ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
    ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
    ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
    ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
    ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    clean(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var _SHA512 = class extends SHA2_64B {
  constructor() {
    super(64);
    __publicField(this, "Ah", SHA512_IV[0] | 0);
    __publicField(this, "Al", SHA512_IV[1] | 0);
    __publicField(this, "Bh", SHA512_IV[2] | 0);
    __publicField(this, "Bl", SHA512_IV[3] | 0);
    __publicField(this, "Ch", SHA512_IV[4] | 0);
    __publicField(this, "Cl", SHA512_IV[5] | 0);
    __publicField(this, "Dh", SHA512_IV[6] | 0);
    __publicField(this, "Dl", SHA512_IV[7] | 0);
    __publicField(this, "Eh", SHA512_IV[8] | 0);
    __publicField(this, "El", SHA512_IV[9] | 0);
    __publicField(this, "Fh", SHA512_IV[10] | 0);
    __publicField(this, "Fl", SHA512_IV[11] | 0);
    __publicField(this, "Gh", SHA512_IV[12] | 0);
    __publicField(this, "Gl", SHA512_IV[13] | 0);
    __publicField(this, "Hh", SHA512_IV[14] | 0);
    __publicField(this, "Hl", SHA512_IV[15] | 0);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);
var sha512 = /* @__PURE__ */ createHasher(
  () => new _SHA512(),
  /* @__PURE__ */ oidNist(3)
);

// ../../node_modules/@scure/base/index.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function isArrayOf(isString, arr2) {
  if (!Array.isArray(arr2))
    return false;
  if (arr2.length === 0)
    return true;
  if (isString) {
    return arr2.every((item) => typeof item === "string");
  } else {
    return arr2.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new Error("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new Error(`${label}: string expected`);
  return true;
}
function anumber2(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
  if (!Array.isArray(input))
    throw new Error("array expected");
}
function astrArr(label, input) {
  if (!isArrayOf(true, input))
    throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new Error(`${label}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
// @__NO_SIDE_EFFECTS__
function alphabet(letters) {
  const lettersA = typeof letters === "string" ? letters.split("") : letters;
  const len = lettersA.length;
  astrArr("alphabet", lettersA);
  const indexes = new Map(lettersA.map((l, i) => [l, i]));
  return {
    encode: (digits) => {
      aArr(digits);
      return digits.map((i) => {
        if (!Number.isSafeInteger(i) || i < 0 || i >= len)
          throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
        return lettersA[i];
      });
    },
    decode: (input) => {
      aArr(input);
      return input.map((letter) => {
        astr("alphabet.decode", letter);
        const i = indexes.get(letter);
        if (i === void 0)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
        return i;
      });
    }
  };
}
// @__NO_SIDE_EFFECTS__
function join(separator = "") {
  astr("join", separator);
  return {
    encode: (from) => {
      astrArr("join.decode", from);
      return from.join(separator);
    },
    decode: (to) => {
      astr("join.decode", to);
      return to.split(separator);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function padding(bits, chr = "=") {
  anumber2(bits);
  astr("padding", chr);
  return {
    encode(data) {
      astrArr("padding.encode", data);
      while (data.length * bits % 8)
        data.push(chr);
      return data;
    },
    decode(input) {
      astrArr("padding.decode", input);
      let end = input.length;
      if (end * bits % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; end > 0 && input[end - 1] === chr; end--) {
        const last = end - 1;
        const byte = last * bits;
        if (byte % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      }
      return input.slice(0, end);
    }
  };
}
function convertRadix(data, from, to) {
  if (from < 2)
    throw new Error(`convertRadix: invalid from=${from}, base cannot be less than 2`);
  if (to < 2)
    throw new Error(`convertRadix: invalid to=${to}, base cannot be less than 2`);
  aArr(data);
  if (!data.length)
    return [];
  let pos = 0;
  const res = [];
  const digits = Array.from(data, (d) => {
    anumber2(d);
    if (d < 0 || d >= from)
      throw new Error(`invalid integer: ${d}`);
    return d;
  });
  const dlen = digits.length;
  while (true) {
    let carry = 0;
    let done = true;
    for (let i = pos; i < dlen; i++) {
      const digit = digits[i];
      const fromCarry = from * carry;
      const digitBase = fromCarry + digit;
      if (!Number.isSafeInteger(digitBase) || fromCarry / from !== carry || digitBase - digit !== fromCarry) {
        throw new Error("convertRadix: carry overflow");
      }
      const div = digitBase / to;
      carry = digitBase % to;
      const rounded = Math.floor(div);
      digits[i] = rounded;
      if (!Number.isSafeInteger(rounded) || rounded * to + carry !== digitBase)
        throw new Error("convertRadix: carry overflow");
      if (!done)
        continue;
      else if (!rounded)
        pos = i;
      else
        done = false;
    }
    res.push(carry);
    if (done)
      break;
  }
  for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
    res.push(0);
  return res.reverse();
}
var gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
var radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
var powers = /* @__PURE__ */ (() => {
  let res = [];
  for (let i = 0; i < 40; i++)
    res.push(2 ** i);
  return res;
})();
function convertRadix2(data, from, to, padding2) {
  aArr(data);
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (/* @__PURE__ */ radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${/* @__PURE__ */ radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const max = powers[from];
  const mask = powers[to] - 1;
  const res = [];
  for (const n of data) {
    anumber2(n);
    if (n >= max)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    const pow = powers[pos];
    if (pow === void 0)
      throw new Error("invalid carry");
    carry &= pow - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding2 && pos >= from)
    throw new Error("Excess padding");
  if (!padding2 && carry > 0)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding2 && pos > 0)
    res.push(carry >>> 0);
  return res;
}
// @__NO_SIDE_EFFECTS__
function radix(num) {
  anumber2(num);
  const _256 = 2 ** 8;
  return {
    encode: (bytes) => {
      if (!isBytes2(bytes))
        throw new Error("radix.encode input should be Uint8Array");
      return convertRadix(Array.from(bytes), _256, num);
    },
    decode: (digits) => {
      anumArr("radix.decode", digits);
      return Uint8Array.from(convertRadix(digits, num, _256));
    }
  };
}
// @__NO_SIDE_EFFECTS__
function radix2(bits, revPadding = false) {
  anumber2(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ radix2carry(8, bits) > 32 || /* @__PURE__ */ radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (bytes) => {
      if (!isBytes2(bytes))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    },
    decode: (digits) => {
      anumArr("radix2.decode", digits);
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }
  };
}
function checksum(len, fn) {
  anumber2(len);
  afn(fn);
  return {
    encode(data) {
      if (!isBytes2(data))
        throw new Error("checksum.encode: input should be Uint8Array");
      const sum = fn(data).slice(0, len);
      const res = new Uint8Array(data.length + len);
      res.set(data);
      res.set(sum, data.length);
      return res;
    },
    decode(data) {
      if (!isBytes2(data))
        throw new Error("checksum.decode: input should be Uint8Array");
      const payload = data.slice(0, -len);
      const oldChecksum = data.slice(-len);
      const newChecksum = fn(payload).slice(0, len);
      for (let i = 0; i < len; i++)
        if (newChecksum[i] !== oldChecksum[i])
          throw new Error("Invalid checksum");
      return payload;
    }
  };
}
var utils = {
  alphabet,
  chain,
  checksum,
  convertRadix,
  convertRadix2,
  radix,
  radix2,
  join,
  padding
};

// ../../node_modules/@scure/bip39/index.js
var isJapanese = (wordlist2) => wordlist2[0] === "\u3042\u3044\u3053\u304F\u3057\u3093";
function nfkd(str5) {
  if (typeof str5 !== "string")
    throw new TypeError("invalid mnemonic type: " + typeof str5);
  return str5.normalize("NFKD");
}
function normalize(str5) {
  const norm = nfkd(str5);
  const words = norm.split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: norm, words };
}
function aentropy(ent) {
  abytes(ent);
  if (![16, 20, 24, 28, 32].includes(ent.length))
    throw new Error("invalid entropy length");
}
function generateMnemonic(wordlist2, strength = 128) {
  anumber(strength);
  if (strength % 32 !== 0 || strength > 256)
    throw new TypeError("Invalid entropy");
  return entropyToMnemonic(randomBytes(strength / 8), wordlist2);
}
var calcChecksum = (entropy) => {
  const bitsLeft = 8 - entropy.length / 4;
  return new Uint8Array([sha256(entropy)[0] >> bitsLeft << bitsLeft]);
};
function getCoder(wordlist2) {
  if (!Array.isArray(wordlist2) || wordlist2.length !== 2048 || typeof wordlist2[0] !== "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  wordlist2.forEach((i) => {
    if (typeof i !== "string")
      throw new Error("wordlist: non-string element: " + i);
  });
  return utils.chain(utils.checksum(1, calcChecksum), utils.radix2(11, true), utils.alphabet(wordlist2));
}
function mnemonicToEntropy(mnemonic, wordlist2) {
  const { words } = normalize(mnemonic);
  const entropy = getCoder(wordlist2).decode(words);
  aentropy(entropy);
  return entropy;
}
function entropyToMnemonic(entropy, wordlist2) {
  aentropy(entropy);
  const words = getCoder(wordlist2).encode(entropy);
  return words.join(isJapanese(wordlist2) ? "\u3000" : " ");
}
function validateMnemonic(mnemonic, wordlist2) {
  try {
    mnemonicToEntropy(mnemonic, wordlist2);
  } catch (e) {
    return false;
  }
  return true;
}
var psalt = (passphrase) => nfkd("mnemonic" + passphrase);
function mnemonicToSeed(mnemonic, passphrase = "") {
  return pbkdf2Async(sha512, normalize(mnemonic).nfkd, psalt(passphrase), { c: 2048, dkLen: 64 });
}

// ../../node_modules/@scure/bip39/wordlists/english.js
var wordlist = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split("\n");

// src/crypto/primitives.ts
var cryptoRef = crypto;
var subtle = cryptoRef.subtle;
var getRandomValues = cryptoRef.getRandomValues.bind(cryptoRef);
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function generateDeviceId() {
  if (typeof cryptoRef.randomUUID === "function") return cryptoRef.randomUUID();
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function generateKEK() {
  return subtle.generateKey({ name: "AES-KW", length: 256 }, true, ["wrapKey", "unwrapKey"]);
}
async function generateMDEK() {
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function encryptMDEKForTransfer(mDEK, requesterPublicKeyB64) {
  const ours = await generateECDHKeyPair();
  const requesterKey = await importECDHPublicKey(requesterPublicKeyB64);
  const shared = await deriveSharedKey(ours.privateKey, requesterKey);
  const mdekBytes = await subtle.exportKey("raw", mDEK);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, shared, mdekBytes);
  const ourSpki = new Uint8Array(base64ToArrayBuffer(ours.publicKey));
  const blob = new Uint8Array(ourSpki.length + iv.length + ciphertext.byteLength);
  blob.set(ourSpki, 0);
  blob.set(iv, ourSpki.length);
  blob.set(new Uint8Array(ciphertext), ourSpki.length + iv.length);
  return arrayBufferToBase64(blob.buffer);
}
async function exportKeyAsBase64(key) {
  return arrayBufferToBase64(await subtle.exportKey("raw", key));
}
async function importKEK(base64Key) {
  return subtle.importKey("raw", base64ToArrayBuffer(base64Key), { name: "AES-KW", length: 256 }, true, [
    "wrapKey",
    "unwrapKey"
  ]);
}
async function importMDEK(base64Key) {
  return subtle.importKey("raw", base64ToArrayBuffer(base64Key), { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt"
  ]);
}
async function wrapMDEK(mDEK, kek) {
  return arrayBufferToBase64(await subtle.wrapKey("raw", mDEK, kek, "AES-KW"));
}
async function unwrapMDEK(wrapped, kek) {
  return subtle.unwrapKey(
    "raw",
    base64ToArrayBuffer(wrapped),
    kek,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
async function encryptWithKey(plaintext, key) {
  const iv = getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const out = new Uint8Array(iv.length + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), iv.length);
  return arrayBufferToBase64(out.buffer);
}
async function decryptWithKey(encrypted, key) {
  const data = new Uint8Array(base64ToArrayBuffer(encrypted));
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
  return new TextDecoder().decode(decrypted);
}
async function decryptToBase64(encrypted, key) {
  const data = new Uint8Array(base64ToArrayBuffer(encrypted));
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
  return arrayBufferToBase64(decrypted);
}
async function generateECDHKeyPair() {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const spki = await subtle.exportKey("spki", pair.publicKey);
  return { publicKey: arrayBufferToBase64(spki), privateKey: pair.privateKey };
}
async function importECDHPublicKey(base64PublicKey) {
  const buffer = base64ToArrayBuffer(base64PublicKey);
  const bytes = new Uint8Array(buffer);
  const format = bytes.length === 65 && bytes[0] === 4 ? "raw" : "spki";
  return subtle.importKey(format, buffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
}
async function deriveSharedKey(privateKey, publicKey) {
  return subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt"
  ]);
}
var PBKDF2_ITERATIONS = 1e5;
var PBKDF2_SALT = "askmyu-recovery-kek-v1";
async function deriveRecoveryKEK(seed) {
  const baseKey = await subtle.importKey("raw", seed, "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// src/crypto/recovery.ts
function generatePhrase() {
  return generateMnemonic(wordlist, 128);
}
function normalizePhrase(phrase) {
  return phrase.toLowerCase().trim().split(/\s+/).join(" ");
}
async function deriveKEKFromPhrase(phrase) {
  const normalized = normalizePhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("invalid_recovery_phrase");
  }
  const seed = await mnemonicToSeed(normalized);
  return deriveRecoveryKEK(new Uint8Array(seed));
}

// src/views/SetupRecoveryModal.ts
var SetupRecoveryModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, onFinished, mode = "harden") {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.mode = mode;
    this.phrase = "";
    this.stage = "show";
    /** How they secured the phrase — the finish button speaks to the door they
        actually took ('file' saves shouldn't be asked about password managers). */
    this.securedVia = null;
    this.checkIndexes = [2, 8];
    this.answers = ["", ""];
    this.working = false;
    /** The show-stage buttons; re-rendered when `copied` flips. */
    this.buttonRow = null;
  }
  onOpen() {
    this.phrase = generatePhrase();
    const first = Math.floor(Math.random() * 6);
    const second = 6 + Math.floor(Math.random() * 6);
    this.checkIndexes = [first, second];
    this.render();
  }
  onClose() {
    this.phrase = "";
    this.contentEl.empty();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    if (this.stage === "show") {
      contentEl.createEl("h2", { text: this.mode === "genesis" ? "Your keys \u2014 and the twelve words that back them" : "Your recovery phrase" });
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: this.mode === "genesis" ? "Your notes get their own key, created on this device. These twelve words are its backup \u2014 the only way in if this device is lost. Write them down somewhere real; they are shown once and never leave this device." : "Twelve words that can unlock your notes if this device is lost. Write them down somewhere real \u2014 paper beats pixels. They are shown once and never leave this device."
      });
      const grid = contentEl.createDiv({ cls: "myu-recovery-grid" });
      this.phrase.split(" ").forEach((word, i) => {
        const cell2 = grid.createDiv({ cls: "myu-recovery-word" });
        cell2.createSpan({ cls: "myu-quiet", text: `${i + 1}. ` });
        cell2.createSpan({ text: word });
      });
      const copy = contentEl.createEl("button", {
        cls: "myu-affordance",
        text: "Copy for your password manager"
      });
      copy.onclick = async () => {
        await navigator.clipboard.writeText(this.phrase);
        this.securedVia = "manager";
        copy.textContent = "Copied \u2014 paste it into your manager now";
        copy.disabled = true;
        const snapshot = this.phrase;
        window.setTimeout(() => {
          void navigator.clipboard.readText().then((current) => {
            if (current === snapshot) return navigator.clipboard.writeText("");
          }).catch(() => void 0);
        }, 9e4);
        this.renderButtons();
      };
      if (import_obsidian8.Platform.isDesktopApp) {
        const saveBtn = contentEl.createEl("button", { cls: "myu-affordance", text: "Save to a file" });
        saveBtn.onclick = () => void this.saveToFile(saveBtn);
      }
      this.renderButtons();
      return;
    }
    contentEl.createEl("h2", { text: "Prove the paper" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Two of your twelve, from what you wrote \u2014 not from memory of the screen."
    });
    const [a, b] = this.checkIndexes;
    new import_obsidian8.Setting(contentEl).setName(`Word ${a + 1}`).addText((t) => {
      t.onChange((v) => this.answers[0] = v.trim().toLowerCase());
    });
    new import_obsidian8.Setting(contentEl).setName(`Word ${b + 1}`).addText((t) => {
      t.onChange((v) => this.answers[1] = v.trim().toLowerCase());
    });
    new import_obsidian8.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Show the words again").onClick(() => {
        this.stage = "show";
        this.render();
      })
    ).addButton(
      (btn) => btn.setButtonText("Finish").setCta().onClick(() => void this.finish(btn.buttonEl))
    );
  }
  /** Desktop-only OS save dialog — the web download button's plugin twin. */
  async saveToFile(button) {
    try {
      const w = window;
      const electron = w.require?.("electron");
      const dialog = electron?.remote?.dialog;
      const fs = w.require?.("fs");
      if (!dialog || !fs) {
        notifyError("Saving needs the desktop app \u2014 copy the phrase instead.");
        return;
      }
      const result = await dialog.showSaveDialog({
        title: "Save your recovery phrase (not inside your vault)",
        defaultPath: "askmyu-recovery-phrase.txt"
      });
      if (result.canceled || !result.filePath) return;
      const adapter = this.app.vault.adapter;
      const vaultBase = adapter instanceof import_obsidian8.FileSystemAdapter ? adapter.getBasePath() : null;
      if (vaultBase && result.filePath.startsWith(vaultBase)) {
        notifyError("Not inside your vault \u2014 it syncs, and this phrase must never sync. Pick somewhere else.");
        return;
      }
      const lines = [
        "askMyu recovery phrase",
        `Saved ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`,
        "",
        this.phrase,
        "",
        "These twelve words unlock your askMyu notes if every signed-in device is lost.",
        "Anyone holding them can read your notes. Best homes: your password manager,",
        "a printed page, an offline drive. Avoid cloud-synced folders.",
        ""
      ];
      fs.writeFileSync(result.filePath, lines.join("\n"));
      this.securedVia = "file";
      button.textContent = "Saved";
      button.disabled = true;
      notifyStatus("Saved. Treat the file like a key.");
      await this.finish(button);
      if (!button.disabled) this.renderButtons();
    } catch {
      notifyError("Couldn't save \u2014 copy the phrase instead.");
    }
  }
  renderButtons() {
    this.buttonRow?.remove();
    const row = new import_obsidian8.Setting(this.contentEl);
    this.buttonRow = row.settingEl;
    row.addButton((b) => b.setButtonText("Not now").onClick(() => this.close()));
    if (this.securedVia) {
      row.addButton(
        (b) => b.setButtonText(this.securedVia === "manager" ? "It\u2019s in my password manager \u2014 finish" : "The file is safe \u2014 finish").setCta().onClick(() => void this.finish(b.buttonEl))
      );
    }
    row.addButton(
      (b) => b.setButtonText(this.securedVia ? "I also wrote it down" : "I wrote it down").onClick(() => {
        this.stage = "confirm";
        this.render();
      })
    );
  }
  async finish(button) {
    if (this.working) return;
    if (this.stage === "confirm") {
      const words = this.phrase.split(" ");
      const [a, b] = this.checkIndexes;
      if (this.answers[0] !== words[a] || this.answers[1] !== words[b]) {
        notifyError("Those don't match \u2014 check the paper.");
        return;
      }
    }
    this.working = true;
    button.disabled = true;
    button.textContent = "Saving\u2026";
    const outcome = this.mode === "genesis" ? await this.plugin.unlock.completeGenesis(this.phrase) : await this.plugin.unlock.setupRecoveryPhrase(this.phrase);
    this.working = false;
    if (outcome === "ok" || outcome === "unlocked") {
      this.plugin.settings.recovery_pending = false;
      await this.plugin.saveSettings();
      notifyStatus(
        this.mode === "genesis" ? "Keys created. The phrase on paper is their only backup." : "Recovery is set. The phrase on paper is now the only copy."
      );
      this.close();
      this.onFinished();
    } else if (outcome === "locked") {
      notifyError("Unlock first, then set up recovery.");
      this.close();
    } else {
      notifyError("Couldn't save the recovery key. Check the connection and try again.");
      button.disabled = false;
      button.textContent = "Finish";
    }
  }
};

// src/views/ApproveDeviceModal.ts
var import_obsidian9 = require("obsidian");
var ApproveDeviceModal = class extends import_obsidian9.Modal {
  constructor(app, plugin, requestId, requesterPublicKey, onFinished) {
    super(app);
    this.plugin = plugin;
    this.requestId = requestId;
    this.requesterPublicKey = requesterPublicKey;
    this.onFinished = onFinished;
    this.code = "";
    this.working = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Let this device in?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "The new device is showing a 4-digit code. Typing it here proves the same person is holding both screens \u2014 then it gets its own key custody, revocable from your device list any time."
    });
    new import_obsidian9.Setting(contentEl).setName("The code on the new device").addText((t) => {
      t.setPlaceholder("0000").onChange((v) => this.code = v.trim());
    });
    new import_obsidian9.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Approve").setCta().onClick(() => void this.approve(b.buttonEl))
    );
  }
  onClose() {
    this.contentEl.empty();
  }
  async approve(button) {
    if (this.working || this.code.length !== 4) {
      if (this.code.length !== 4) notifyError("Four digits, from the new device\u2019s screen.");
      return;
    }
    this.working = true;
    button.disabled = true;
    const outcome = await this.plugin.unlock.approvePendingDevice(this.requestId, this.code, this.requesterPublicKey);
    this.working = false;
    if (outcome === "ok") {
      notifyStatus("Approved \u2014 the new device is unlocking now.");
      this.close();
      this.onFinished();
    } else if (outcome === "bad_code") {
      notifyError("That code doesn\u2019t match \u2014 read it again from the new device.");
      button.disabled = false;
    } else {
      notifyError("Approval failed \u2014 check the connection and try again.");
      button.disabled = false;
    }
  }
};

// src/views/AddSourceModal.ts
var import_obsidian10 = require("obsidian");
var AddSourceModal = class extends import_obsidian10.Modal {
  constructor(app, plugin, kind, onFinished) {
    super(app);
    this.plugin = plugin;
    this.kind = kind;
    this.onFinished = onFinished;
    this.email = "";
    this.password = "";
    this.host = "";
    this.port = 993;
    this.ssl = true;
    this.caldavUrl = "";
    this.provider = "caldav";
    this.working = false;
  }
  onOpen() {
    this.contentEl.addClass("myu-power-down");
    this.render();
  }
  onClose() {
    this.password = "";
    this.contentEl.empty();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.kind === "imap" ? "Add an email account (IMAP)" : "Add a calendar (CalDAV)" });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: this.kind === "imap" ? "Any mailbox with IMAP \u2014 Fastmail, Proton via bridge, your own server. Myu reads it the way it reads Gmail." : "Any CalDAV calendar \u2014 Fastmail, iCloud, Nextcloud. Myu preps those meetings too."
    });
    new import_obsidian10.Setting(contentEl).setName("Email").addText((t) => {
      t.setPlaceholder("you@fastmail.com").setValue(this.email).onChange((v) => this.email = v.trim());
      t.inputEl.type = "email";
    });
    new import_obsidian10.Setting(contentEl).setName(this.kind === "imap" ? "Password (or app password)" : "Password").addText((t) => {
      t.setPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").onChange((v) => this.password = v);
      t.inputEl.type = "password";
    });
    if (this.kind === "imap") {
      new import_obsidian10.Setting(contentEl).setName("IMAP host").addText((t) => {
        t.setPlaceholder("imap.fastmail.com").setValue(this.host).onChange((v) => this.host = v.trim());
      });
      new import_obsidian10.Setting(contentEl).setName("Port").addText((t) => {
        t.setPlaceholder("993").setValue(String(this.port)).onChange((v) => this.port = Number(v.trim()) || 993);
      });
      new import_obsidian10.Setting(contentEl).setName("SSL").addToggle((t) => t.setValue(this.ssl).onChange((v) => this.ssl = v));
    } else {
      new import_obsidian10.Setting(contentEl).setName("CalDAV URL").addText((t) => {
        t.setPlaceholder("https://caldav.fastmail.com/dav/").setValue(this.caldavUrl).onChange((v) => this.caldavUrl = v.trim());
      });
    }
    new import_obsidian10.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton((b) => b.setButtonText("Test connection").onClick(() => void this.test(b.buttonEl))).addButton((b) => b.setButtonText("Add").setCta().onClick(() => void this.add(b.buttonEl)));
  }
  complete() {
    if (!this.email || !this.password) return false;
    return this.kind === "imap" ? !!this.host : !!this.caldavUrl;
  }
  async test(button) {
    if (!this.complete() || this.working) {
      notifyError("Fill everything in first.");
      return;
    }
    this.working = true;
    button.textContent = "Testing\u2026";
    const res = this.kind === "imap" ? await this.plugin.backend.testImapConnection(this.email, this.password, this.host, this.port, this.ssl) : await this.plugin.backend.testCalDavConnection(this.provider, this.email, this.password, this.caldavUrl);
    this.working = false;
    button.textContent = "Test connection";
    if (res.ok) notifyStatus("Connection works.");
    else notifyError(`Connection failed (${res.error ?? res.status}). Check host and credentials.`);
  }
  async add(button) {
    if (!this.complete() || this.working) {
      notifyError("Fill everything in first.");
      return;
    }
    this.working = true;
    button.disabled = true;
    const res = this.kind === "imap" ? await this.plugin.backend.addImapConnection(this.email, this.password, this.host, this.port, this.ssl) : await this.plugin.backend.addCalDavAccount(this.provider, this.email, this.password, this.caldavUrl);
    this.working = false;
    if (res.ok) {
      notifyStatus(`${this.email} connected \u2014 Myu starts reading it now.`);
      this.close();
      this.onFinished();
    } else {
      button.disabled = false;
      notifyError(`Couldn't add it (${res.error ?? res.status}). Try Test connection first.`);
    }
  }
};

// src/views/DeleteAccountModal.ts
var import_obsidian11 = require("obsidian");
var CONFIRMATION = "DELETE";
var DeleteAccountModal = class extends import_obsidian11.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.typed = "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Delete your askMyu account?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Everything askMyu holds about you is deleted: your entries, the people and companies it built, its reads, and the key that opens them. This cannot be undone and there is no grace period."
    });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Your vault is untouched. Every note you wrote stays exactly where it is, including the folder Myu has been keeping \u2014 that folder simply stops changing. Delete it whenever you like; everything in it is marked myu-generated: true."
    });
    new import_obsidian11.Setting(contentEl).setName(`Type ${CONFIRMATION} to confirm`).addText((t) => t.setPlaceholder(CONFIRMATION).onChange((v) => this.typed = v.trim()));
    new import_obsidian11.Setting(contentEl).addButton((b) => b.setButtonText("Keep my account").setCta().onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Delete everything").setDestructive().onClick(async () => {
        if (this.typed !== CONFIRMATION) {
          notifyError(`Type ${CONFIRMATION} exactly to confirm.`);
          return;
        }
        const res = await this.plugin.backend.deleteAccount(CONFIRMATION);
        if (!res.ok) {
          notifyError("Couldn't delete the account \u2014 check the connection and try again.");
          return;
        }
        this.close();
        await this.plugin.unlock.disconnect();
        notifyStatus("Your account is deleted. Your vault is untouched.");
        this.onDone();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/AddAccountEmailModal.ts
var import_obsidian12 = require("obsidian");
var AddAccountEmailModal = class extends import_obsidian12.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.email = "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Add an email address" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Myu emails this address a link. Click it and the address can sign you in too \u2014 useful when work and personal mail both reach you."
    });
    new import_obsidian12.Setting(contentEl).setName("Address").addText((t) => t.setPlaceholder("you@work.com").onChange((v) => this.email = v.trim()));
    new import_obsidian12.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Send the link").setCta().onClick(async () => {
        if (!this.email.includes("@")) {
          notifyError("That does not look like an email address.");
          return;
        }
        const res = await this.plugin.backend.addAccountEmail(this.email);
        if (!res.ok) {
          notifyError("Couldn't add that address \u2014 it may already be in use.");
          return;
        }
        this.close();
        notifyStatus(`Link sent to ${this.email}. Click it to finish.`);
        this.onDone();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/cardSections.ts
var DISCUSSABLE_SECTION_TYPES = /* @__PURE__ */ new Set(["patterns", "predictions", "threads", "weather"]);
function isDiscussable(section) {
  return section.actionable === true && DISCUSSABLE_SECTION_TYPES.has(section.section_type ?? "");
}
function sectionDiscussSeed(card, entityType, section, blocks) {
  const name = card.header?.display_name ?? "";
  return {
    text: `About ${name} \u2014 ${(section.title ?? section.section_type ?? "").toLowerCase()}: `,
    source_id: `${card.entity_id ?? ""}:${section.section_id ?? section.section_type ?? ""}`,
    section_content: blocks.filter((b) => b.kind === "row").map((b) => b.text).join("\n"),
    section_narrative: section.narrative ?? blocks.find((b) => b.kind === "narrative")?.text ?? ""
  };
}
function normalizeSection(raw) {
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const out = { section_type: raw.section_type, title: raw.title };
  const text = data.text ?? data.narrative ?? raw.narrative;
  if (typeof text === "string" && text.trim()) out.narrative = text;
  const rows = [];
  if (Array.isArray(data.items)) {
    for (const it of data.items) {
      const t = it?.text ?? it?.content;
      const extra = {
        ...typeof it?.source_type === "string" && typeof it?.source_id === "string" ? { source_type: it.source_type, source_id: it.source_id } : {},
        ...typeof it?.title === "string" ? { title: it.title } : {},
        ...typeof it?.subtitle === "string" ? { subtitle: it.subtitle } : {}
      };
      if (typeof t === "string" && t.trim()) rows.push({ text: t, date: it?.date, ...extra });
      else if (raw.section_type === "sources" && typeof it?.title === "string" && it.title.trim()) rows.push({ ...extra, date: it?.date });
    }
  }
  if (Array.isArray(data.bullets)) {
    for (const b of data.bullets) {
      if (typeof b === "string" && b.trim()) rows.push({ text: b });
    }
  }
  if (rows.length > 0) out.items = rows;
  for (const key of ["dimensions", "entries", "events", "voiced_narrative"]) {
    if (data[key] !== void 0) out[key] = data[key];
  }
  return out;
}
function sectionBlocks(rawSection) {
  const section = normalizeSection(rawSection);
  const blocks = [];
  if (typeof section.narrative === "string" && section.narrative.trim()) {
    blocks.push({ kind: "narrative", text: section.narrative });
  }
  for (const item of Array.isArray(section.items) ? section.items : []) {
    const source = item?.source_type && item?.source_id ? { type: item.source_type, id: item.source_id } : void 0;
    if (item?.text?.trim()) blocks.push({ kind: "row", text: item.text, meta: item.date, source });
    else if (section.section_type === "sources" && item?.title?.trim()) blocks.push({ kind: "row", text: item.title, meta: item.subtitle, source });
  }
  const dimensions = section.dimensions;
  if (Array.isArray(dimensions)) {
    for (const d of dimensions) {
      if (!d?.name) continue;
      blocks.push({ kind: "row", text: d.evidence?.trim() || d.name, meta: `${d.name} \xB7 ${d.intensity ?? "\u2014"}` });
    }
  }
  const entries = section.entries;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const name = e?.display_name || e?.entity_name;
      if (!name) continue;
      const meta = [e.mention_count != null ? `\xD7${e.mention_count}` : null, e.overall_trend ?? null].filter(Boolean).join(" \xB7 ");
      blocks.push({ kind: "row", text: name, meta: meta || void 0 });
    }
  }
  const events = section.events;
  if (Array.isArray(events)) {
    for (const e of events) {
      const text = e?.description || e?.summary || e?.label || e?.change_type;
      if (!text) continue;
      blocks.push({ kind: "row", text, meta: e.date });
    }
  }
  const voiced = section.voiced_narrative;
  if (voiced && typeof voiced === "object") {
    for (const value of Object.values(voiced)) {
      if (typeof value === "string" && value.trim()) blocks.push({ kind: "narrative", text: value });
    }
  }
  return blocks;
}

// src/vault/myuFiles.ts
var MYU_GENERATED_KEY = "myu-generated";
var MYU_ID_RE = /%%myu-id:([A-Za-z0-9_-]+)%%/;
var CHECKBOX_RE = /^\s*- \[( |x|X)\]/;
function firstPresent(...values) {
  for (const v of values) {
    if (v !== null && v !== void 0 && !(typeof v === "string" && v.trim() === "")) return v;
  }
  return void 0;
}
function parseWhen(value) {
  if (value == null) return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    let n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e12) n *= 1e3;
    const d2 = new Date(n);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  const s2 = String(value).trim();
  if (!s2) return null;
  const d = new Date(s2.includes(" ") && !s2.includes("T") ? s2.replace(" ", "T") : s2);
  return Number.isNaN(d.getTime()) ? null : d;
}
function safeFirstNameAlias(displayName, allDisplayNames, isTaken) {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return [];
  const first = parts[0];
  if (!first || first.length < 2 || first === displayName) return [];
  const sharedByAnother = allDisplayNames.some(
    (other) => other !== displayName && other.trim().split(/\s+/)[0] === first
  );
  if (sharedByAnother) return [];
  if (isTaken(first)) return [];
  return [first];
}
function sanitizeName(name) {
  const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Unknown";
}
function frontmatter(pairs) {
  const lines = pairs.filter(([, v]) => v !== null && v !== void 0 && v !== "" && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map((item) => JSON.stringify(item)).join(", ")}]`;
    return `${k}: ${typeof v === "string" && /[:#]|^\[\[/.test(v) ? JSON.stringify(v) : String(v)}`;
  });
  return ["---", ...lines, "---"].join("\n");
}
function commitmentLine(c, checked) {
  const box = checked ? "x" : " ";
  const owner = c.owner ? `[[${sanitizeName(c.owner)}]] ` : "";
  const text = (c.content ?? "").trim() || "(encrypted \u2014 open in Myu)";
  const due = c.deadline ? ` \u{1F4C5} ${c.deadline.slice(0, 10)}` : "";
  const from = c.meeting_title ? ` *(from ${c.meeting_title})*` : "";
  return `- [${box}] ${owner}${text}${due}${from} %%myu-id:${c.commitment_id}%%`;
}
function lineKey(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h << 5) + h + text.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
function meetingAdditions(contents) {
  const out = { decisions: [], commitments: [] };
  let section = null;
  for (const raw of contents.split("\n")) {
    const line = raw.trimEnd();
    if (/^## /.test(line)) {
      section = /^## Decisions\s*$/.test(line) ? "decisions" : /^## Commitments\s*$/.test(line) ? "commitments" : null;
      continue;
    }
    if (!section) continue;
    const m = /^- (?!\[[ xX]\])(.+)$/.exec(line);
    if (!m || MYU_ID_RE.test(line)) continue;
    const body = m[1].trim();
    if (!body) continue;
    if (section === "decisions") {
      out.decisions.push(body);
      continue;
    }
    const owned = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s+(.+)$/.exec(body);
    out.commitments.push(owned ? { content: owned[2].trim(), owner: owned[1].trim() } : { content: body });
  }
  return out;
}
function parseCheckboxes(contents) {
  const out = [];
  for (const line of contents.split("\n")) {
    const id = MYU_ID_RE.exec(line)?.[1];
    if (!id) continue;
    const box = CHECKBOX_RE.exec(line);
    if (!box) continue;
    out.push({ myuId: id, checked: box[1].toLowerCase() === "x", line });
  }
  return out;
}
function buildMeetingHistoryMarkdown(meeting) {
  const title = String(meeting.title ?? meeting.meeting_title ?? "Meeting");
  const whenDate = parseWhen(firstPresent(meeting.meeting_date, meeting.occurred_at, meeting.created_at));
  const when = whenDate ? whenDate.toISOString().slice(0, 10) : "";
  const participation = Array.isArray(meeting.participation) ? meeting.participation.map((p) => String(p.display_name ?? p.name ?? p.person_name ?? "").trim()).filter(Boolean) : [];
  const rawAttendees = meeting.attendees ?? meeting.participants;
  const listAttendees = Array.isArray(rawAttendees) ? rawAttendees.map(String) : [];
  const attendees = participation.length > 0 ? participation : listAttendees;
  const head = frontmatter([
    ["type", "myu-meeting"],
    ["myu-id", String(meeting.meeting_id ?? "")],
    [MYU_GENERATED_KEY, true],
    ["date", when || null],
    ["source", String(meeting.source ?? "") || null]
  ]);
  const parts = [head, "", `# ${title}`];
  if (attendees.length > 0) {
    parts.push("", `**Attendees:** ${attendees.map((a) => `[[${sanitizeName(a)}]]`).join(", ")}`);
  }
  const text = (v) => typeof v === "string" ? v.trim() : "";
  const list2 = (v) => Array.isArray(v) ? v.map((i) => typeof i === "string" ? i : text(i?.text) || text(i?.content)).filter(Boolean) : [];
  const summary = text(meeting.summary) || text(meeting.debrief);
  if (summary) parts.push("", "## Summary", "", summary);
  const keyPoints = list2(meeting.key_points);
  if (keyPoints.length > 0) {
    parts.push("", "## Key points");
    for (const p of keyPoints) parts.push(`- ${p}`);
  }
  const decisions = list2(meeting.decisions);
  if (decisions.length > 0) {
    parts.push("", "## Decisions");
    for (const d of decisions) parts.push(`- ${d} %%myu-id:d-${lineKey(d)}%%`);
  }
  const commitments = Array.isArray(meeting.commitments) ? meeting.commitments : [];
  if (commitments.length > 0) {
    parts.push("", "## Commitments");
    for (const c of commitments) {
      const owner = text(c.owner);
      const line = text(c.content) || text(c.text);
      if (line) parts.push(`- ${owner ? `[[${sanitizeName(owner)}]] ` : ""}${line} %%myu-id:${text(c.commitment_id) || `c-${lineKey(line)}`}%%`);
    }
  }
  let topics = [];
  const rawTopics = meeting.topics_detail;
  if (Array.isArray(rawTopics)) topics = rawTopics;
  else if (typeof rawTopics === "string" && rawTopics.trim().startsWith("[")) {
    try {
      topics = JSON.parse(rawTopics);
    } catch {
      topics = [];
    }
  }
  if (topics.length > 0) {
    parts.push("", "## Topics");
    for (const t of topics) {
      if (!t?.name) continue;
      parts.push(`- ${t.name}${typeof t.time_spent_percent === "number" ? ` *(${t.time_spent_percent}%)*` : ""}`);
    }
  }
  const notes = text(meeting.content) || text(meeting.raw_notes);
  if (notes && notes !== summary) parts.push("", "## Notes", "", notes);
  const transcript = text(meeting.transcript);
  if (transcript) parts.push("", "## Transcript", "", transcript);
  parts.push("", "*Maintained by Myu \u2014 meeting history from your account. Edits here are replaced.*", "");
  return parts.join("\n");
}
function buildJournalDayMarkdown(date, entries) {
  const head = frontmatter([
    ["type", "myu-journal"],
    [MYU_GENERATED_KEY, true],
    ["date", date],
    ["entries", entries.length]
  ]);
  const parts = [head, "", `# Journal \u2014 ${date}`];
  for (const entry of entries) {
    parts.push("", `## ${entry.time}`, "", entry.text.trim());
    if (entry.turns && entry.turns.length > 0) {
      parts.push("");
      for (const turn of entry.turns) {
        const speaker = turn.role === "myu" ? "myu" : "you";
        for (const line of turn.text.trim().split("\n")) {
          parts.push(`> **${speaker}:** ${line}`.trimEnd());
        }
        parts.push(">");
      }
      parts.pop();
    }
    if (entry.journalId) {
      parts.push("", `[continue this conversation \u25B8](obsidian://myu-chat?journal=${entry.journalId})`);
    }
  }
  parts.push("", "*Maintained by Myu \u2014 your journal, decrypted into your vault. Edits here are replaced.*", "");
  return parts.join("\n");
}
function buildDayMarkdown(date, events, meetingLinks, hasJournal, memoryPeople = []) {
  const head = frontmatter([
    ["type", "myu-day"],
    [MYU_GENERATED_KEY, true],
    ["date", date],
    ["events", events.length]
  ]);
  const parts = [head, "", `# ${date}`];
  if (events.length > 0) {
    parts.push("", "## Schedule");
    for (const e of events) {
      const time = e.all_day ? "all day" : (e.start_time ?? "").slice(11, 16) || "\u2014";
      const door = e.event_id ? ` [prep \u25B8](obsidian://myu-prep?event=${e.event_id})` : "";
      parts.push(`- **${time}** ${e.title ?? "Busy"}${door}`);
    }
  }
  if (meetingLinks.length > 0) {
    parts.push("", "## Meetings");
    for (const link of meetingLinks) parts.push(`- [[${link}]]`);
  }
  if (hasJournal) {
    parts.push("", `## Journal`, "", `![[Journal/${date}]]`);
  }
  if (memoryPeople.length > 0) {
    parts.push("", "## Relationship notes", "", `Memories minted this day about ${memoryPeople.map((n) => `[[${n}]]`).join(", ")}.`);
  }
  if (events.length === 0 && meetingLinks.length === 0 && !hasJournal && memoryPeople.length === 0) {
    parts.push("", "*Nothing on file for this day.*");
  }
  parts.push("", "*Maintained by Myu.*", "");
  return parts.join("\n");
}
function buildMonthCalendarMarkdown(months, busy) {
  const head = frontmatter([["type", "myu-calendar"], [MYU_GENERATED_KEY, true]]);
  const parts = [head, "", "# Calendar"];
  for (const { year, month } of months) {
    const label = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    parts.push("", `## ${label}`, "", "| Mon | Tue | Wed | Thu | Fri | Sat | Sun |", "| --- | --- | --- | --- | --- | --- | --- |");
    const first = new Date(Date.UTC(year, month, 1));
    const startOffset = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    let row = new Array(startOffset).fill(" ");
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const count = busy.get(iso) ?? 0;
      row.push(`[[Days/${iso}\\|${d}]]${count > 0 ? ` \xB7${count}` : ""}`);
      if (row.length === 7) {
        parts.push(`| ${row.join(" | ")} |`);
        row = [];
      }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(" ");
      parts.push(`| ${row.join(" | ")} |`);
    }
  }
  parts.push("", "*Maintained by Myu \u2014 the number after a day is how much is on file for it.*", "");
  return parts.join("\n");
}
function flattenMemoryPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out = [];
  const takeRows = (value) => {
    if (!Array.isArray(value)) return;
    for (const row of value) {
      if (row && typeof row === "object" && !Array.isArray(row)) out.push(row);
    }
  };
  for (const value of Object.values(raw)) {
    if (Array.isArray(value)) takeRows(value);
    else if (value && typeof value === "object") {
      for (const nested of Object.values(value)) takeRows(nested);
    }
  }
  out.sort((a, b) => String(b.memory_date ?? "").localeCompare(String(a.memory_date ?? "")));
  return out;
}
function buildCompositionMarkdown(spec, resolvePersonName) {
  const parts = [];
  if (spec.summary_text?.trim()) parts.push(spec.summary_text.trim(), "");
  const components = spec.components ?? [];
  const emit = (component, depth) => {
    const rendered = componentMarkdown(component, depth, resolvePersonName, components);
    if (!rendered.trim()) return;
    const isItem = rendered.startsWith("- ");
    const prevWasItem = parts.length >= 2 && parts[parts.length - 2].startsWith("- ") && parts[parts.length - 1] === "";
    if (isItem && prevWasItem) parts.splice(parts.length - 1, 1);
    parts.push(rendered, "");
  };
  for (const entry of compositionFlow(spec)) {
    if ("scene" in entry) parts.push(`## ${entry.scene}`, "");
    else emit(entry.component, entry.depth);
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
function compositionFlow(spec) {
  const components = spec.components ?? [];
  const containers = components.filter((c) => c.type === "container");
  const childIds = new Set(containers.flatMap((c) => Array.isArray(c.data?.child_ids) ? c.data?.child_ids : []));
  const flowOf = (pool, depth) => {
    const out2 = [];
    const seen = /* @__PURE__ */ new Set();
    for (const container of pool.filter((c) => c.type === "container")) {
      out2.push({ component: container, depth });
      seen.add(container.id);
      for (const id of container.data?.child_ids ?? []) {
        const child = components.find((c) => c.id === id);
        if (child && child.type !== "container" && !seen.has(child.id)) {
          out2.push({ component: child, depth: depth + 1 });
          seen.add(child.id);
        }
      }
    }
    for (const component of pool) {
      if (seen.has(component.id) || component.type === "container" || childIds.has(component.id)) continue;
      out2.push({ component, depth });
    }
    return out2;
  };
  const scenes = (spec.scenes ?? []).filter((sc) => Array.isArray(sc.component_ids) && sc.component_ids.length > 0);
  if (scenes.length === 0) return flowOf(components, 2);
  const out = [];
  const claimed = /* @__PURE__ */ new Set();
  for (const scene of scenes) {
    const pool = scene.component_ids.map((id) => components.find((c) => c.id === id)).filter((c) => !!c && !claimed.has(c.id));
    if (pool.length === 0) continue;
    out.push({ scene: scene.label?.trim() || "Scene" });
    for (const e of flowOf(pool, 3)) {
      out.push(e);
      if ("component" in e) claimed.add(e.component.id);
    }
    for (const c of pool) claimed.add(c.id);
  }
  const rest = components.filter((c) => !claimed.has(c.id));
  if (rest.length) out.push(...flowOf(rest, 2));
  return out;
}
function buildExportManifest(s2) {
  const head = frontmatter([["type", "myu-export"], [MYU_GENERATED_KEY, true], ["date", s2.date]]);
  return [
    head,
    "",
    "# Everything Myu knows, as files",
    "",
    `*Exported ${s2.date}. Every file Myu wrote carries \`myu-generated: true\` \u2014 this whole export is one search away, and one delete away.*`,
    "",
    "## What is here",
    "",
    ...s2.surfaces.map((x) => `- ${x}`),
    `- **People** \u2014 ${s2.people} ${s2.people === 1 ? "page" : "pages"} written or refreshed this pass`,
    `- **Conversations** \u2014 ${s2.conversations.saved} saved${s2.conversations.alreadyThere ? `, ${s2.conversations.alreadyThere} already here` : ""}${s2.conversations.failed ? `, ${s2.conversations.failed} could not be read` : ""} \u2192 \`Myu/Conversations/\``,
    `- **Canvases** \u2014 ${s2.canvases.kept} kept${s2.canvases.expired ? `, ${s2.canvases.expired} expired on the server and cannot be fetched` : ""}${s2.canvases.failed ? `, ${s2.canvases.failed} failed` : ""} \u2192 \`Myu/Canvas/\``,
    "",
    "## What is not here",
    "",
    "- Your **account** itself \u2014 email addresses, devices, keys, consents. Those are not vault material. For a complete archive of what the server holds, use **Request my data archive** (Settings \u2192 askMyu \u2192 Advanced): an encrypted zip, link by email, passphrase shown once.",
    "- Your **own notes** \u2014 they were never Myu\u2019s to export. They are already yours.",
    "",
    "## If you uninstall",
    "",
    "- Everything under `Myu/` stays exactly as it is. Nothing here needs the plugin to open: markdown, `.canvas` (an open standard), `.base` (an Obsidian core feature).",
    "- Notes stop refreshing; nothing breaks. Links, properties and tables keep working.",
    "- The plugin\u2019s own `data.json` (your plugin token and wrapped key) goes with it \u2014 no custody is left on this device.",
    "- Your account is untouched. Delete it from Settings \u2192 askMyu, or on the web.",
    ""
  ].join("\n");
}
function joinBlock(heading, body, rows, bullet = true) {
  const out = [];
  if (heading) out.push(heading, "");
  if (body) out.push(body, "");
  let started = false;
  for (const row of rows) {
    if (!started && row === "") continue;
    started = true;
    out.push(bullet ? `- ${row}` : row);
  }
  return out.join("\n").trimEnd();
}
var PLUMBING_SUFFIX = /(?:^|_)(?:id|ids|url|urls|code|key|hint)$/;
var PLUMBING = /* @__PURE__ */ new Set([
  "type",
  "component_type",
  "original_type",
  "variant",
  "kind",
  "mode",
  "x",
  "y",
  "width",
  "height",
  "color",
  "colors",
  "style",
  "styleAttributes",
  "className",
  "icon",
  "emoji",
  "shape_type",
  "actor_color",
  "orientation",
  "display_mode",
  "collapsed",
  "collapsible",
  "initially_collapsed",
  "dismissible",
  "directional",
  "visible",
  "click_action",
  "placeholder",
  "submit_label",
  "submitting_label",
  "aria_label",
  "validate",
  "param_name",
  "params",
  "checkable",
  "readonly",
  "format",
  "tone",
  "prompt_type",
  "provisional",
  "attention_deferred",
  "index",
  "order",
  "locked",
  "is_primary",
  "min_value",
  "max_value",
  "min_selections",
  "max_selections",
  "recharts_config",
  "vega_lite_spec",
  "config",
  "has_linkedin",
  "card_spec_enriched",
  "data_completeness",
  "is_outlier",
  "success",
  "generated_at"
]);
function isPlumbing(key) {
  return PLUMBING.has(key) || PLUMBING_SUFFIX.test(key);
}
function labelOf(key) {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function scalarOf(key, value) {
  if (typeof value === "number" && /(?:_at|timestamp|_time)$/.test(key) && value > 1e11) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === "number" && /(?:probability|confidence|score|rate|pct|overlap)$/.test(key) && value >= 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
  }
  return String(value).trim();
}
function cellOf(key, value) {
  if (value === null || value === void 0) return "";
  let text;
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((v) => typeof v === "number") && /(?:months|years|weeks|days|range)$/.test(key)) {
      text = `${value[0]}\u2013${value[1]}`;
    } else {
      text = value.map((v) => v && typeof v === "object" ? readableOf(v) : scalarOf(key, v)).filter(Boolean).join(", ");
    }
  } else if (typeof value === "object") {
    text = readableOf(value);
  } else {
    text = scalarOf(key, value);
  }
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}
function readableOf(obj) {
  for (const k of ["display_name", "name", "label", "title", "text", "preview", "summary", "what", "action"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const scalars = Object.entries(obj).filter(([k, v]) => !isPlumbing(k) && v !== null && typeof v !== "object");
  return scalars.map(([, v]) => String(v)).join(" \xB7 ");
}
function rowsToTable(value, columnsOverride) {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows = value.filter((r) => r && typeof r === "object" && !Array.isArray(r));
  if (rows.length === 0) return [];
  const candidates = columnsOverride ?? [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !isPlumbing(c));
  const columns = candidates.filter((c) => rows.some((r) => cellOf(c, r[c]) !== ""));
  if (columns.length === 0) return [];
  return [
    `| ${columns.map(labelOf).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${columns.map((c) => cellOf(c, r[c])).join(" | ")} |`)
  ];
}
function bulletsOf(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => v && typeof v === "object" ? readableOf(v) : String(v ?? "").trim()).filter(Boolean).map((t) => `- ${t}`);
}
function genericMarkdown(data, heading, opts = {}) {
  const skip = new Set(opts.skip ?? []);
  const blocks = [];
  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key) || isPlumbing(key) || value === null || value === void 0) continue;
    if (typeof value === "string" && opts.headingText && value.trim() === opts.headingText) continue;
    const name = labelOf(key);
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const table = rowsToTable(value);
      if (table.length > 0) {
        blocks.push(`**${name}**`, "", ...table, "");
        continue;
      }
      const bullets = bulletsOf(value);
      if (bullets.length > 0) blocks.push(`**${name}**`, "", ...bullets, "");
      continue;
    }
    if (typeof value === "object") {
      const inner = genericMarkdown(value, "", {});
      if (inner) blocks.push(`**${name}**`, "", inner, "");
      continue;
    }
    const text = scalarOf(key, value);
    if (!text) continue;
    blocks.push(text.length > 80 || text.includes("\n") ? text : `- **${name}** \u2014 ${text}`, "");
  }
  const body = blocks.join("\n").replace(/\n{3,}/g, "\n\n").replace(/(- \*\*[^\n]+)\n\n(?=- \*\*)/g, "$1\n").trimEnd();
  if (!body) return heading;
  return heading ? `${heading}

${body}` : body;
}
function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}
function listOf(value) {
  if (!Array.isArray(value)) return [];
  return value.map(
    (item) => typeof item === "string" ? item : textOf(item?.text) || textOf(item?.label) || textOf(item?.content)
  ).filter(Boolean);
}
function callout(kind, title, body) {
  return body ? `> [!${kind}] ${title}
> ${body.split("\n").join("\n> ")}` : `> [!${kind}] ${title}`;
}
function quote(text) {
  return `> ${text.split("\n").join("\n> ")}`;
}
function personLink(name, resolvePersonName) {
  const own = resolvePersonName?.(name);
  return own ? `[[${own}]]` : `[[${sanitizeName(name)}]]`;
}
function componentMarkdown(component, depth, resolvePersonName, siblings, mode = "file") {
  const data = component.data ?? {};
  const h = (text) => text ? `${"#".repeat(Math.min(Math.max(depth, 1), 6))} ${text}` : "";
  const sub = (text) => text ? `${"#".repeat(Math.min(Math.max(depth + 1, 1), 6))} ${text}` : "";
  const label = (component.label || textOf(data.title) || textOf(data.headline) || textOf(data.statement)).trim();
  const heading = h(label);
  const generic = (skip = []) => genericMarkdown(data, heading, { skip, headingText: label });
  const nameOfSibling = (id) => {
    const s2 = typeof id === "string" ? siblings?.find((c) => c.id === id) : void 0;
    const d = s2?.data ?? {};
    return textOf(d.name) || textOf(d.subject_name) || textOf(d.title) || s2?.label || (typeof id === "string" ? id : "");
  };
  switch (component.type) {
    // ── headers ──────────────────────────────────────────────────────────
    case "subject_header": {
      const name = textOf(data.subject_name) || label;
      if (!name) return "";
      const kind = textOf(data.subject_type);
      const person = kind === "person" ? personLink(name, resolvePersonName) : name;
      const badges = bulletsOf(data.badges).map((b) => b.slice(2)).map((b) => `\`${b}\``).join(" ");
      const line = [textOf(data.tagline), badges].filter(Boolean).join(" \xB7 ");
      return [h(person), line ? `
${line}` : ""].join("\n").trimEnd();
    }
    case "section_header": {
      const title = textOf(data.title) || label;
      const subtitle = textOf(data.subtitle);
      return title ? subtitle ? `${h(title)}

*${subtitle}*` : h(title) : "";
    }
    // ── people ───────────────────────────────────────────────────────────
    case "person_card":
    case "person": {
      const name = textOf(data.name) || textOf(data.display_name) || component.label || "";
      if (!name) return "";
      const link = personLink(name, resolvePersonName);
      const stakeholder = component.variant === "stakeholder" || data.mode === "stakeholder" || !!data.stance;
      const role = textOf(data.subject_role) || [textOf(data.role), textOf(data.company)].filter(Boolean).join(", ");
      const health = [textOf(data.health_tier).toLowerCase().replace(/_/g, " "), textOf(data.trajectory)].filter(Boolean).join(", ");
      const insight = textOf(data.key_insight) || textOf(data.summary) || textOf(data.text) || textOf(data.tone_summary);
      const tags = Array.isArray(data.tags) ? bulletsOf(data.tags).map((t) => `\`${t.slice(2)}\``).join(" ") : "";
      const tail = [role, health && `*${health}*`, insight].filter(Boolean).join(" \u2014 ");
      const line = `- ${link}${tail ? ` \u2014 ${tail}` : ""}${tags ? ` ${tags}` : ""}`;
      if (!stakeholder) {
        const extra = [];
        if (textOf(data.card_spec_narrative)) extra.push("", `  ${textOf(data.card_spec_narrative)}`);
        for (const p of listOf(data.card_spec_patterns)) extra.push(`  - ${p}`);
        if (textOf(data.card_spec_prediction)) extra.push(`  - *${textOf(data.card_spec_prediction)}*`);
        if (textOf(data.flag_reason)) extra.push(`  - \u2691 ${textOf(data.flag_reason)}`);
        return [line, ...extra].join("\n");
      }
      const rows = [];
      if (textOf(data.stance)) rows.push(`  - **Stance** \u2014 ${textOf(data.stance)}`);
      const quadrant = (key, title) => {
        const items = listOf(data[key]);
        if (items.length) rows.push(`  - **${title}**`, ...items.map((i) => `    - ${i}`));
      };
      quadrant("what_they_want", "What they want");
      quadrant("what_they_can_block", "What they can block");
      quadrant("what_signals_their_stance", "What signals their stance");
      quadrant("your_leverage", "Your leverage");
      return [line, ...rows].join("\n");
    }
    case "team_grid": {
      const people = Array.isArray(data.people) ? data.people : [];
      const lines = people.map((p) => componentMarkdown({ ...p, type: "person_card" }, depth + 1, resolvePersonName, siblings)).filter(Boolean);
      const count = typeof data.total_count === "number" && data.total_count > people.length ? `*${people.length} of ${data.total_count}*` : "";
      return joinBlock(heading, count, lines, false);
    }
    case "person_disambiguation": {
      const q = textOf(data.query_name);
      const rows = rowsToTable(data.candidates, ["name", "role", "company", "relevance_reason"]);
      return joinBlock(heading || (q ? h(`Which ${q}?`) : ""), textOf(data.context_hint), rows, false);
    }
    // ── prose-shaped ─────────────────────────────────────────────────────
    case "text_block":
    case "sticky_note":
    case "shape":
      return joinBlock(heading, textOf(data.text) || textOf(data.content), []);
    case "note_editor": {
      const text = textOf(data.initial_text);
      return text ? joinBlock(h(textOf(data.context_title) || label), text, []) : "";
    }
    case "prepared_content":
      return joinBlock(heading, textOf(data.content), []);
    case "offer_block": {
      const lead = textOf(data.lead);
      const gap = textOf(data.gap_line);
      const options = (Array.isArray(data.options) ? data.options : []).map((o) => textOf(o?.label)).filter(Boolean);
      const trust = textOf(data.trust_line);
      const person = data.named_person && typeof data.named_person === "object" ? data.named_person : null;
      const who = person ? textOf(person.name) : "";
      const lines = mode === "pane" ? [...gap ? [gap] : [], ...trust ? ["", `*${trust}*`] : []] : [
        ...gap ? [gap, ""] : [],
        ...who ? [`re ${personLink(who, resolvePersonName)}${textOf(person?.when_text) ? ` \u2014 ${textOf(person?.when_text)}` : ""}`, ""] : [],
        ...options.length ? [...options.map((o) => `- ${o}`), "", "*Connect a calendar under Settings \u2192 askMyu \u2192 Connection.*"] : [],
        ...trust ? ["", `*${trust}*`] : []
      ];
      return lead || lines.length ? joinBlock(heading, lead, lines, false) : "";
    }
    case "context_annotation": {
      const anchor = nameOfSibling(data.anchor_id);
      const text = textOf(data.text);
      if (!text) return "";
      const kind = textOf(data.severity) === "warning" ? "warning" : "info";
      return callout(kind, anchor ? `re ${anchor}` : "Note", text);
    }
    case "severity_indicator": {
      const level = textOf(data.level) || "attention";
      const kind = level === "critical" ? "danger" : level === "urgent" ? "warning" : "info";
      return callout(kind, level.replace(/^./, (c) => c.toUpperCase()), textOf(data.context));
    }
    case "signal_card": {
      const desc = textOf(data.description) || textOf(data.detail);
      const rows = listOf(data.evidence);
      const foot = [textOf(data.related_entity) && `re ${personLink(textOf(data.related_entity), resolvePersonName)}`, textOf(data.source) && `via ${textOf(data.source)}`].filter(Boolean).join(" \xB7 ");
      const block = joinBlock(heading, desc, rows);
      return foot ? `${block}

*${foot}*` : block;
    }
    case "pattern_card": {
      const title = textOf(data.pattern_name) || label;
      const conf = typeof data.confidence === "number" ? ` *(${Math.round(data.confidence * 100)}% confidence)*` : "";
      const body = [textOf(data.description) + conf, textOf(data.outcome_summary)].filter((s2) => s2.trim()).join("\n\n");
      const rows = rowsToTable(data.instances, ["context", "date_range", "detail", "outcome"]);
      return joinBlock(h(title), body, rows, false);
    }
    case "advisor_panel": {
      const takes = Array.isArray(data.takes) ? data.takes : [];
      const rows = takes.map((t) => `**${labelOf(textOf(t.persona) || "advisor")}** \u2014 ${textOf(t.text)}`).filter((r) => !r.endsWith("\u2014 "));
      return joinBlock(heading, textOf(data.triggering_event) && `*on: ${textOf(data.triggering_event)}*`, rows);
    }
    case "move_node": {
      const who = textOf(data.actor);
      const n = typeof data.move_number === "number" ? `${data.move_number}. ` : "";
      const body = quote(textOf(data.move_text));
      const notes = [textOf(data.unexpected_angle), textOf(data.annotation)].filter(Boolean).map((t) => `*${t}*`);
      return joinBlock(h(`${n}${who}`), body, notes, false);
    }
    // ── questions & decisions ────────────────────────────────────────────
    case "reflection_prompt": {
      const q = textOf(data.question) || textOf(data.prompt) || textOf(data.text);
      const ctx = textOf(data.context);
      return joinBlock(heading, q ? quote(q) : "", ctx ? [`*${ctx}*`] : [], false);
    }
    case "seed_follow_up":
    case "inline_chat": {
      const q = textOf(data.prompt);
      return q ? joinBlock(heading, quote(q), listOf(data.options)) : "";
    }
    case "decision_frame": {
      const q = textOf(data.question) || textOf(data.prompt);
      const rows = [];
      for (const o of Array.isArray(data.options) ? data.options : []) {
        const parts = [textOf(o.description), textOf(o.impact) && `impact: ${textOf(o.impact)}`, textOf(o.risk) && `risk: ${textOf(o.risk)}`].filter(Boolean);
        rows.push(`- **${textOf(o.label)}**${o.recommended ? " \u2713" : ""}${parts.length ? ` \u2014 ${parts.join(" \xB7 ")}` : ""}`);
      }
      const weighted = (key, title) => {
        const items = Array.isArray(data[key]) ? data[key] : [];
        if (!items.length) return;
        rows.push("", `**${title}**`, ...items.map((i) => `- ${textOf(i.text) || readableOf(i)}${textOf(i.weight) ? ` *(${textOf(i.weight)})*` : ""}`));
      };
      weighted("pros", "For");
      weighted("cons", "Against");
      const prereqs = listOf(data.prerequisites);
      if (prereqs.length) rows.push("", "**Before either**", ...prereqs.map((p) => `- [ ] ${p}`));
      const summary = textOf(data.summary);
      if (summary) rows.push("", `*${summary}*`);
      return joinBlock(heading, q ? quote(q) : "", rows, false);
    }
    case "action_controls": {
      if (mode === "pane") return "";
      const actions = Array.isArray(data.actions) ? data.actions : [];
      return joinBlock(heading, "", actions.map((a) => textOf(a.label)).filter(Boolean));
    }
    case "trackable": {
      const title = textOf(data.title) || label;
      const done = textOf(data.status) === "completed" || textOf(data.status) === "resolved";
      const bits = [textOf(data.status), textOf(data.due_date) && `due ${textOf(data.due_date)}`, typeof data.progress_percent === "number" && `${data.progress_percent}%`, textOf(data.linked_person) && `with ${personLink(textOf(data.linked_person), resolvePersonName)}`].filter(Boolean);
      return `- [${done ? "x" : " "}] ${title}${bits.length ? ` \u2014 ${bits.join(" \xB7 ")}` : ""}`;
    }
    // ── structure: tables and timelines ──────────────────────────────────
    case "comparison": {
      const left = data.left ?? {};
      const right = data.right ?? {};
      const lname = textOf(left.label) || "Left";
      const rname = textOf(right.label) || "Right";
      const rows = [];
      const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
      if (dims.length) {
        rows.push(`| | ${lname} | ${rname} | |`, "| --- | --- | --- | --- |");
        for (const d of dims) rows.push(`| **${textOf(d.name)}** | ${cellOf("v", d.left_value)} | ${cellOf("v", d.right_value)} | ${textOf(d.alignment)}${textOf(d.detail) ? ` \u2014 ${cellOf("d", d.detail)}` : ""} |`);
      } else {
        const li = Array.isArray(left.items) ? left.items : [];
        const ri = Array.isArray(right.items) ? right.items : [];
        const keys = [...new Set([...li, ...ri].map((i) => textOf(i.key)))].filter(Boolean);
        if (keys.length) {
          rows.push(`| | ${lname} | ${rname} |`, "| --- | --- | --- |");
          for (const k of keys) rows.push(`| **${k}** | ${cellOf("v", li.find((i) => i.key === k)?.value)} | ${cellOf("v", ri.find((i) => i.key === k)?.value)} |`);
        }
      }
      const summary = textOf(data.summary);
      const block = joinBlock(heading, "", rows, false);
      return summary ? `${block}

*${summary}*` : block;
    }
    case "prediction_table": {
      const framing = [textOf(data.framing), textOf(data.horizon_label) && `*(${textOf(data.horizon_label)})*`].filter(Boolean).join(" ");
      const rows = rowsToTable(data.predictions, ["what", "by_when", "confidence", "who_else_affected", "context"]);
      const block = joinBlock(heading, framing, rows, false);
      return textOf(data.footer) ? `${block}

*${textOf(data.footer)}*` : block;
    }
    case "timeline": {
      const events = Array.isArray(data.events) ? data.events : [];
      const lines = events.map((e) => {
        const when = textOf(e.date) || textOf(e.when);
        const what = [textOf(e.label) || textOf(e.text), textOf(e.description) || textOf(e.expandable_detail)].filter(Boolean).join(" \u2014 ");
        return when ? `- \`${when.slice(0, 10)}\` ${what}` : `- ${what}`;
      });
      const trend = textOf(data.trend);
      return joinBlock(heading, trend ? `*${trend}*` : "", lines, false);
    }
    case "career_position_timeline": {
      const positions = Array.isArray(data.positions) ? data.positions : [];
      const span = (p) => `${p.start_year ?? "?"}\u2013${p.end_year ?? (p.is_current ? "now" : "?")}`;
      const rows = positions.map((p) => `- \`${span(p)}\` **${textOf(p.title)}**, ${textOf(p.company)}${p.is_current ? " *(current)*" : ""}`);
      const parallel = Array.isArray(data.parallel_roles) ? data.parallel_roles : [];
      if (parallel.length) rows.push("", "**Alongside**", ...parallel.map((p) => `- \`${span(p)}\` ${textOf(p.title)}, ${textOf(p.company)}`));
      const s2 = data.summary ?? {};
      const summary = [typeof s2.total_years === "number" && `${s2.total_years} years`, typeof s2.companies === "number" && `${s2.companies} companies`, textOf(s2.primary_family), textOf(s2.education)].filter(Boolean).join(" \xB7 ");
      return joinBlock(heading || h("Career"), summary ? `*${summary}*` : "", rows, false);
    }
    case "micro_arc_timeline": {
      const phases = Array.isArray(data.phases) ? data.phases : [];
      const out = [];
      for (const ph of phases) {
        out.push((heading ? sub : h)(`${textOf(ph.name)}${textOf(ph.status) ? ` *(${textOf(ph.status)})*` : ""}`), "");
        const arcs = Array.isArray(ph.micro_arcs) ? ph.micro_arcs : [];
        for (const a of arcs) {
          const when = typeof a.timestamp === "number" ? `\`${new Date(a.timestamp).toISOString().slice(0, 10)}\` ` : "";
          out.push(`- ${when}${textOf(a.summary)}${textOf(a.source_type) ? ` *(${textOf(a.source_type)})*` : ""}`);
        }
        out.push("");
      }
      return joinBlock(heading, "", out, false);
    }
    case "career_trajectory": {
      const title = textOf(data.pattern_name) || label;
      const now = [textOf(data.current_phase_name) && `**Now: ${textOf(data.current_phase_name)}**`, textOf(data.current_phase_description)].filter(Boolean).join(" \u2014 ");
      const phases = Array.isArray(data.phases) ? data.phases : [];
      const rows = phases.map((p) => `- ${textOf(p.status) === "current" ? "**" : ""}${textOf(p.name)}${textOf(p.status) === "current" ? "**" : ""} \u2014 ${textOf(p.description)}${textOf(p.status) && textOf(p.status) !== "current" ? ` *(${textOf(p.status)})*` : ""}`);
      const next = textOf(data.predicted_next_phase_name);
      if (next) rows.push("", `*Likely next: ${next}${Array.isArray(data.estimated_timeline_weeks) ? ` in ${cellOf("weeks", data.estimated_timeline_weeks)} weeks` : ""}*`);
      for (const [key, name] of [["risk_markers", "Watch"], ["opportunity_markers", "Openings"]]) {
        const items = listOf(data[key]);
        if (items.length) rows.push("", `**${name}**`, ...items.map((i) => `- ${i}`));
      }
      return joinBlock(h(title), now, rows, false);
    }
    case "branch_point": {
      const branches = Array.isArray(data.branches) ? data.branches : [];
      const rows = branches.map((b) => `- **${textOf(b.to_phase_name) || textOf(b.to_phase)}** \u2014 ${textOf(b.conditions)}${textOf(b.contextualized_narrative) ? `
  *${textOf(b.contextualized_narrative)}*` : ""}`);
      const lean = textOf(data.current_lean);
      if (lean) rows.push("", `*Leaning: ${lean}${textOf(data.lean_reasoning) ? ` \u2014 ${textOf(data.lean_reasoning)}` : ""}*`);
      return joinBlock(heading || h(`From ${textOf(data.from_phase) || "here"}`), "", rows, false);
    }
    case "strategy_sequence": {
      const steps = Array.isArray(data.steps) ? data.steps : [];
      const rows = [];
      let phase = "";
      for (const s2 of steps) {
        if (textOf(s2.phase) && textOf(s2.phase) !== phase) {
          phase = textOf(s2.phase);
          rows.push("", `**${phase}**`);
        }
        const who = textOf(s2.person_name) ? ` with ${personLink(textOf(s2.person_name), resolvePersonName)}` : "";
        rows.push(`${typeof s2.step_number === "number" ? s2.step_number : rows.length + 1}. ${textOf(s2.action)}${who}${textOf(s2.timing) ? ` *(${textOf(s2.timing)})*` : ""}${textOf(s2.rationale) ? ` \u2014 ${textOf(s2.rationale)}` : ""}`);
      }
      const body = [textOf(data.context), textOf(data.timing_note) && `*${textOf(data.timing_note)}*`].filter(Boolean).join("\n\n");
      return joinBlock(heading, body, rows, false);
    }
    case "what_if_scenarios": {
      const rows = rowsToTable(data.scenarios, ["scenario", "conditions", "outcome_phase", "outcome_probability", "timeline_weeks"]);
      const levers = rowsToTable(data.levers, ["lever", "impact", "current_signal", "target_signal"]);
      return joinBlock(heading, "", [...rows, ...levers.length ? ["", "**Levers**", "", ...levers] : []], false);
    }
    case "possibility_space": {
      const rows = [];
      for (const [key, title] of [["natural_next_steps", "Natural next steps"], ["pattern_aligned", "Where your pattern points"], ["stretch_possibilities", "Stretch"], ["cross_functional_pivots", "Pivots"]]) {
        const table = rowsToTable(data[key]);
        if (table.length) rows.push(`**${title}**`, "", ...table, "");
      }
      return joinBlock(heading, "", rows, false);
    }
    case "career_pathway": {
      const from = data.from ?? {};
      const to = data.to ?? {};
      const title = label || (textOf(from.title) && textOf(to.title) ? `${textOf(from.title)} \u2192 ${textOf(to.title)}` : "Pathway");
      const yrs = data.estimated_years ?? {};
      const eta = typeof yrs.typical === "number" ? `*~${yrs.typical} years${typeof yrs.optimistic === "number" ? ` (${yrs.optimistic} if it goes well)` : ""}*` : "";
      const body = [textOf(data.narrative), eta, textOf(data.reason)].filter(Boolean).join("\n\n");
      const rows = [];
      const hops = Array.isArray(data.hops) ? data.hops : [];
      for (const hp of hops) rows.push(`${typeof hp.order === "number" ? hp.order : rows.length + 1}. ${textOf(hp.from_title)} \u2192 ${textOf(hp.to_title)}${Array.isArray(hp.typical_years) ? ` *(${cellOf("years", hp.typical_years)} yrs)*` : ""}${textOf(hp.pattern_note) ? ` \u2014 ${textOf(hp.pattern_note)}` : ""}`);
      const gaps = rowsToTable(data.skill_gaps, ["skill", "gap", "user_level", "target_level"]);
      if (gaps.length) rows.push("", "**Skill gaps**", "", ...gaps);
      const signals = listOf(data.recognition_signals);
      if (signals.length) rows.push("", "**What gets you recognised**", ...signals.map((s2) => `- ${s2}`));
      const peers = Array.isArray(data.network_peers_on_path) ? data.network_peers_on_path : [];
      if (peers.length) rows.push("", "**People on this path**", ...peers.map((p) => `- ${personLink(textOf(p.display_name), resolvePersonName)}${textOf(p.current_title) ? `, ${textOf(p.current_title)}` : ""}`));
      return joinBlock(h(title), body, rows, false);
    }
    case "statistical_context": {
      const head = [textOf(data.cohort) && `**${textOf(data.cohort)}**`, typeof data.sample_size === "number" && `n=${data.sample_size}`, textOf(data.source)].filter(Boolean).join(" \xB7 ");
      const rows = [];
      if (typeof data.success_rate === "number") rows.push(`- **Success rate** \u2014 ${Math.round(data.success_rate * 100)}%`);
      const uvc = data.user_vs_cohort ?? {};
      const cmp = Object.entries(uvc);
      if (cmp.length) rows.push("", "| | You | Cohort |", "| --- | --- | --- |", ...cmp.map(([k, v]) => `| **${labelOf(k)}** | ${cellOf("v", v.user)} | ${cellOf("v", v.cohort_avg ?? v.cohort_threshold)} |`));
      if (textOf(data.confidence_note)) rows.push("", `*${textOf(data.confidence_note)}*`);
      return joinBlock(heading, head, rows, false);
    }
    case "alignment_hierarchy": {
      const tiers = Array.isArray(data.tiers) ? data.tiers : [];
      const rows = [];
      for (const t of tiers) {
        const score = typeof t.score === "number" ? ` ${Math.round(t.score * 100)}%` : "";
        rows.push(`- **${textOf(t.level)}${textOf(t.label) ? ` ${textOf(t.label)}` : ""}** \u2014 ${textOf(t.status)}${score}${textOf(t.summary) ? `: ${textOf(t.summary)}` : ""}`);
        if (textOf(t.their_stance)) rows.push(`  - them: ${textOf(t.their_stance)}`);
        if (textOf(t.your_stance)) rows.push(`  - you: ${textOf(t.your_stance)}`);
        for (const e of Array.isArray(t.evidence) ? t.evidence : []) rows.push(`  - \`${textOf(e.date)}\` ${textOf(e.preview)}${textOf(e.source) ? ` *(${textOf(e.source)})*` : ""}`);
        for (const a of listOf(t.actions)) rows.push(`  - \u2192 ${a}`);
      }
      const subj = textOf(data.subject_name);
      const head = [typeof data.overall_alignment_score === "number" && `**${Math.round(data.overall_alignment_score * 100)}% aligned**`, typeof data.active_disagreement_count === "number" && `${data.active_disagreement_count} open disagreements`, typeof data.lookback_days === "number" && `last ${data.lookback_days} days`].filter(Boolean).join(" \xB7 ");
      return joinBlock(heading || (subj ? h(`Alignment with ${personLink(subj, resolvePersonName)}`) : ""), head, rows, false);
    }
    case "budget_allocation": {
      const unit = textOf(data.budget_unit);
      const items = Array.isArray(data.items) ? data.items : [];
      const rows = items.length ? [`| | ${unit || "Value"} |`, "| --- | ---: |", ...items.map((i) => `| ${textOf(i.label)} | ${cellOf("v", i.current_value)} |`)] : [];
      if (typeof data.total_budget === "number" && rows.length) rows.push(`| **Total** | **${data.total_budget}** |`);
      const body = [textOf(data.constraint_text), textOf(data.reflection_text) && `*${textOf(data.reflection_text)}*`].filter(Boolean).join("\n\n");
      return joinBlock(heading, body, rows, false);
    }
    case "perspective_panel": {
      const side = (key) => {
        const s2 = data[key];
        if (!s2) return [];
        const items = Array.isArray(s2.items) ? s2.items : [];
        return [`**${textOf(s2.actor) || labelOf(key)}**`, ...items.map((i) => `- ${textOf(i.label)}: ${textOf(i.value)}`), ""];
      };
      const rows = [...side("left_perspective"), ...side("right_perspective")];
      const asym = rowsToTable(data.asymmetries, ["topic", "left_view", "right_view"]);
      if (asym.length) rows.push("**Where the readings diverge**", "", ...asym);
      return joinBlock(heading, "", rows, false);
    }
    // ── process & change ─────────────────────────────────────────────────
    case "process_card": {
      const bits = [textOf(data.cadence), textOf(data.current_state)].filter(Boolean).join(" \xB7 ");
      return joinBlock(h(textOf(data.title) || label), bits ? `*${bits}*

${textOf(data.summary)}`.trim() : textOf(data.summary), []);
    }
    case "change_suggestion":
      return joinBlock(h(textOf(data.title) || label), textOf(data.rationale), textOf(data.expected_effect) ? [`\u2192 ${textOf(data.expected_effect)}${textOf(data.status) ? ` *(${textOf(data.status)})*` : ""}`] : [], false);
    case "intervention_tracker": {
      const bits = [textOf(data.status), typeof data.watch_period_weeks === "number" && `${data.watch_period_weeks}-week watch`, typeof data.started_at === "number" && `since ${scalarOf("started_at", data.started_at)}`].filter(Boolean).join(" \xB7 ");
      const rows = [textOf(data.expected_effect) && `- **Expecting** \u2014 ${textOf(data.expected_effect)}`, textOf(data.latest_signal_value) && `- **Latest** \u2014 ${textOf(data.latest_signal_value)}`].filter(Boolean);
      return joinBlock(h(textOf(data.title) || label), bits ? `*${bits}*` : "", rows, false);
    }
    // ── drawn structure ──────────────────────────────────────────────────
    case "diagram": {
      const code = textOf(data.source) || textOf(data.mermaid) || textOf(data.definition) || textOf(data.code);
      if (!code) return joinBlock(heading, textOf(data.fallback_text), []);
      const caption = textOf(data.caption);
      return joinBlock(heading, "", ["```mermaid", code, "```", ...caption ? ["", `*${caption}*`] : []], false);
    }
    case "chart": {
      const rc = data.recharts_config ?? {};
      const vl = data.vega_lite_spec ?? {};
      const vlData = vl.data ?? {};
      const rows = rowsToTable(rc.data ?? vlData.values ?? data.data ?? data.rows);
      const caption = textOf(data.fallback_text) || textOf(data.summary) || textOf(data.caption);
      const src = textOf(data.data_source);
      if (rows.length === 0 && !caption) return joinBlock(heading, "", ["*No data in this chart yet.*"], false);
      return joinBlock(heading, "", [...rows, ...caption ? ["", caption] : [], ...src ? ["", `*source: ${src}*`] : []], false);
    }
    case "connection_overlay": {
      const from = nameOfSibling(data.from_id);
      const to = nameOfSibling(data.to_id);
      if (!from || !to) return "";
      const arrow = data.directional === false ? "\u2194" : "\u2192";
      const kind = textOf(data.connection_type);
      return `- **${from} ${arrow} ${to}**${kind ? ` \u2014 ${kind}` : ""}${textOf(data.label) ? `: ${textOf(data.label)}` : ""}`;
    }
    case "relationship_map": {
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      const nameOf = new Map(nodes.map((n) => [textOf(n.id), textOf(n.name)]));
      const centre = data.center_node ?? {};
      const rows = nodes.filter((n) => n.id !== centre.id).map((n) => `- ${textOf(n.type) === "person" ? personLink(textOf(n.name), resolvePersonName) : textOf(n.name)}${textOf(n.health_tier) ? ` *(${textOf(n.health_tier).replace(/_/g, " ")})*` : ""}`);
      const edges = Array.isArray(data.edges) ? data.edges : [];
      if (edges.length) rows.push("", ...edges.map((e) => `- ${nameOf.get(textOf(e.source)) || textOf(e.source)} \u2194 ${nameOf.get(textOf(e.target)) || textOf(e.target)}${textOf(e.label) ? ` \u2014 ${textOf(e.label)}` : ""}`));
      return joinBlock(heading || (textOf(centre.name) ? h(`Around ${personLink(textOf(centre.name), resolvePersonName)}`) : ""), "", rows, false);
    }
    case "hierarchy": {
      const walk = (node, indent) => {
        const line = `${"  ".repeat(indent)}- ${textOf(node.label)}${textOf(node.health_tier) ? ` *(${textOf(node.health_tier).replace(/_/g, " ")})*` : ""}`;
        const kids = Array.isArray(node.children) ? node.children : [];
        return [line, ...kids.flatMap((k) => walk(k, indent + 1))];
      };
      const root = data.root;
      return joinBlock(heading, "", root ? walk(root, 0) : [], false);
    }
    case "circle_pack": {
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      const groups = Array.isArray(data.groups) ? data.groups : [];
      const groupName = new Map(groups.map((g) => [textOf(g.id), textOf(g.label)]));
      const byGroup = /* @__PURE__ */ new Map();
      for (const n of nodes) {
        const g = groupName.get(textOf(n.group)) || textOf(n.group) || "Ungrouped";
        byGroup.set(g, [...byGroup.get(g) ?? [], `- ${personLink(textOf(n.label), resolvePersonName)}${typeof n.value === "number" ? ` (${n.value})` : ""}${textOf(n.health_tier) ? ` *(${textOf(n.health_tier).replace(/_/g, " ")})*` : ""}`]);
      }
      const rows = [...byGroup.entries()].flatMap(([g, lines]) => [`**${g}**`, ...lines, ""]);
      return joinBlock(heading, "", rows, false);
    }
    case "matrix_view": {
      const entities = Array.isArray(data.entities) ? data.entities : [];
      const cells = Array.isArray(data.cells) ? data.cells : [];
      if (!entities.length) return heading;
      const cell2 = new Map(cells.map((c) => [`${textOf(c.row_id)}|${textOf(c.col_id)}`, c]));
      const rows = [
        `| ${textOf(data.value_label) || ""} | ${entities.map((e) => textOf(e.label)).join(" | ")} |`,
        `| --- | ${entities.map(() => "---").join(" | ")} |`,
        ...entities.map((r) => `| **${textOf(r.label)}** | ${entities.map((c) => {
          const v = cell2.get(`${textOf(r.id)}|${textOf(c.id)}`);
          if (!v) return "";
          const n = cellOf("v", v.value);
          return textOf(v.label) ? `${n} (${textOf(v.label)})` : n;
        }).join(" | ")} |`)
      ];
      return joinBlock(heading, "", rows, false);
    }
    case "venn_diagram": {
      const sets = Array.isArray(data.sets) ? data.sets : [];
      const setName = new Map(sets.map((s2) => [textOf(s2.id), textOf(s2.label)]));
      const rows = sets.map((s2) => `- **${textOf(s2.label)}** \u2014 ${cellOf("size", s2.size)}`);
      const inter = Array.isArray(data.intersections) ? data.intersections : [];
      for (const i of inter) {
        const names = (Array.isArray(i.sets) ? i.sets : []).map((id) => setName.get(id) || id).join(" \u2229 ");
        const members = bulletsOf(i.members).map((m) => m.slice(2)).join(", ");
        rows.push(`- **${names}** \u2014 ${cellOf("size", i.size)}${members ? `: ${members}` : ""}`);
      }
      return joinBlock(heading, "", rows, false);
    }
    case "card_section": {
      const s2 = normalizeSection({ section_type: textOf(data.section_type), title: textOf(data.section_title) || label, data: data.section_data });
      const rows = (s2.items ?? []).filter((i) => i.text?.trim()).map((i) => `- ${i.text}${i.date ? ` *(${i.date})*` : ""}`);
      return joinBlock(h(s2.title?.trim() || ""), s2.narrative?.trim() || "", rows, false);
    }
    case "container": {
      const bits = [textOf(data.defining_characteristic), textOf(data.risk_label), textOf(data.departed_reason)].filter(Boolean);
      return joinBlock(h(textOf(data.label) || label), bits.join(" \u2014 "), []);
    }
    default:
      return generic();
  }
}
function buildSelfMarkdown(card) {
  const head = frontmatter([["type", "myu-self"], [MYU_GENERATED_KEY, true]]);
  const parts = [head, "", "# Me"];
  let rendered = 0;
  const facts = (card?.known_facts ?? []).filter((f) => f && typeof f.value === "string" && f.value.trim());
  if (facts.length > 0) {
    rendered++;
    parts.push("", "## What Myu knows so far", "", "*Correct any of it under Settings \u2192 askMyu \u2192 Account.*", "");
    for (const f of facts) {
      const key = (f.key ?? "").replace(/_/g, " ");
      const src = f.source ? ` \xB7 ${f.source}` : "";
      if (f.kind === "read") parts.push(`- **${key}** \u2014 *${f.value}* (a read, worth testing${src})`);
      else if (f.kind === "not_yet") parts.push(`- **not yet** \u2014 ${f.value}${src}`);
      else parts.push(`- **${key}** \u2014 ${f.value}${src}`);
    }
  }
  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    if (!narrative && items.length === 0) continue;
    rendered++;
    parts.push("", `## ${title || "Notes"}`);
    if (narrative) parts.push("", narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ""}`);
    }
  }
  if (rendered === 0) {
    parts.push("", "*Myu is still forming its picture of you \u2014 this page fills in as it learns.*");
  }
  parts.push("", "*Maintained by Myu \u2014 how Myu currently sees you. Edits here are replaced.*", "");
  return parts.join("\n");
}
function buildCompanyMarkdown(entity, card, peopleNames, memories = [], peopleFolder = "Myu/People") {
  const head = frontmatter([
    ["type", "myu-company"],
    ["myu-id", entity.entity_id],
    [MYU_GENERATED_KEY, true],
    ["people", peopleNames.length],
    ["website", card?.header?.website_url ?? null],
    ["last_interaction", entity.last_contact ? entity.last_contact.slice(0, 10) : null]
  ]);
  const parts = [head, "", `# ${entity.display_name}`];
  if (peopleNames.length > 0) {
    parts.push("", "## People", "", ...companyPeopleBase(peopleFolder));
  }
  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    if (!narrative && items.length === 0) continue;
    parts.push("", `## ${title || "Notes"}`);
    if (narrative) parts.push("", narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ""}`);
    }
  }
  const memoryLines = (Array.isArray(memories) ? memories : []).map((m) => (m.memory_text ?? m.text ?? "").trim()).filter(Boolean);
  if (memoryLines.length > 0) {
    parts.push("", "## Memories");
    for (let i = 0; i < memoryLines.length; i++) {
      const when = memories[i]?.created_at ? ` *(${String(memories[i].created_at).slice(0, 10)})*` : "";
      parts.push(`- ${memoryLines[i]}${when}`);
    }
  }
  parts.push(
    "",
    "*Maintained by Myu \u2014 regenerated as things change. Edits here are replaced.*",
    ""
  );
  return parts.join("\n");
}
function buildPersonMarkdown(entity, card, openCommitments, checkedState, theirPageName, memories = [], aliases = []) {
  const head = frontmatter([
    ["type", "myu-person"],
    ["myu-id", entity.entity_id],
    [MYU_GENERATED_KEY, true],
    // Role only when it's an actual title — the subtitle sometimes echoes the
    // company (no known title), which read as role=JustAI, company=JustAI
    // (operator, 2026-08-25). If they match, the role is unknown, not the org.
    ["role", entity.subtitle && entity.subtitle !== entity.organization ? entity.subtitle : null],
    // A WIKILINK (2026-08-29): Bases reads a quoted wikilink as a Link, so the
    // People table groups by company as a link, the graph gets the edge, and the
    // company note's embedded people table can filter `company == this`. (It was
    // a plain string from before Bases typed links.)
    ["company", entity.organization ? `[[${sanitizeName(entity.organization)}]]` : null],
    ["open_commitments", openCommitments.length],
    // People.base computes "Days quiet" from this; it was never written, so the
    // column was blank for all 47 people (2026-08-29).
    ["last_interaction", entity.last_contact ? entity.last_contact.slice(0, 10) : null],
    // FACTS the web card has always shown (parity review 2026-08-26). In
    // frontmatter because they are Bases columns a CRM actually wants —
    // P8.1 bars VERDICTS from frontmatter, not facts.
    ["email", card?.header?.email_primary ?? null],
    ["linkedin", card?.header?.linkedin_url ?? null],
    // Only when provably safe — see safeFirstNameAlias(). Without it a user
    // writing [[Marcus]] never reaches the generated Marcus Webb.md, which is
    // why P8.1 specified aliases in the first place.
    ["aliases", aliases],
    // Date only — a Bases formula turns this into "days quiet", and a
    // frontmatter timestamp down to the second would churn the file on every
    // regenerate without changing what the column says.
    ["last_interaction", entity.last_contact ? entity.last_contact.slice(0, 10) : null]
  ]);
  const parts = [head, "", `# ${entity.display_name}`];
  parts.push("", `[Open in Myu \u25B8](obsidian://myu-card?name=${encodeURIComponent(entity.display_name)})`);
  if (entity.organization) {
    parts.push("", `Company: [[${sanitizeName(entity.organization)}]]`);
  }
  if (theirPageName) {
    parts.push("", `Their page: [[${theirPageName}]]`);
  }
  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    if (!narrative && items.length === 0) continue;
    parts.push("", `## ${title || "Notes"}`);
    if (narrative) parts.push("", narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ""}`);
    }
  }
  if (openCommitments.length > 0) {
    parts.push("", "## Commitments");
    for (const c of openCommitments) {
      parts.push(commitmentLine(c, checkedState(c.commitment_id)));
    }
  }
  const memoryLines = (Array.isArray(memories) ? memories : []).map((m) => (m.memory_text ?? m.text ?? "").trim()).filter(Boolean);
  if (memoryLines.length > 0) {
    parts.push("", "## Memories");
    for (let i = 0; i < memoryLines.length; i++) {
      const when = memories[i]?.created_at ? ` *(${String(memories[i].created_at).slice(0, 10)})*` : "";
      parts.push(`- ${memoryLines[i]}${when}`);
    }
  }
  if (!parts.some((p) => p.startsWith("## "))) {
    parts.push("", "*Nothing here yet \u2014 Myu fills this in as things happen.*");
  }
  parts.push(
    "",
    "*Maintained by Myu \u2014 regenerated as things change. Ticking a checkbox marks it done in Myu; other edits here are replaced.*",
    ""
  );
  return parts.join("\n");
}
function buildTodayMarkdown(briefDate, sections) {
  const head = frontmatter([
    ["type", "myu-today"],
    [MYU_GENERATED_KEY, true],
    ["date", briefDate]
  ]);
  const parts = [head, "", `# From Myu \u2014 ${briefDate}`];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    if (section.title) parts.push("", `## ${section.title}`);
    for (const item of section.items) parts.push(`- ${item}`);
  }
  if (sections.every((s2) => s2.items.length === 0)) {
    parts.push("", "Nothing needs you yet today.");
  }
  parts.push("");
  return parts.join("\n");
}
function buildWeekMarkdown(edition) {
  const head = frontmatter([
    ["type", "myu-week"],
    [MYU_GENERATED_KEY, true],
    ["period", edition.period]
  ]);
  const parts = [head, "", `# The week \u2014 ${edition.period}`];
  for (const section of edition.sections) {
    parts.push("", `## ${section.section}`, "", section.line);
    for (const item of section.items ?? []) parts.push(`- ${item}`);
  }
  parts.push("");
  return parts.join("\n");
}
function buildCommitmentsMarkdown(commitments, checkedState) {
  const head = frontmatter([
    ["type", "myu-commitments"],
    [MYU_GENERATED_KEY, true],
    ["open", commitments.length]
  ]);
  const parts = [head, "", "# Commitments"];
  if (commitments.length === 0) {
    parts.push("", "Nothing open right now.");
  } else {
    parts.push("");
    for (const c of commitments) {
      parts.push(commitmentLine(c, checkedState(c.commitment_id)));
    }
  }
  parts.push(
    "",
    "*Maintained by Myu from your meetings. Tick a box to mark it done in Myu.*",
    ""
  );
  return parts.join("\n");
}
function companyPeopleBase(peopleFolder) {
  return [
    "```base",
    "filters:",
    "  and:",
    `    - file.inFolder("${peopleFolder}")`,
    `    - 'type == "myu-person"'`,
    "    - company == this",
    "formulas:",
    `  days_quiet: 'if(last_interaction, (today() - date(last_interaction)).days, "")'`,
    "properties:",
    "  role:",
    "    displayName: Role",
    "  formula.days_quiet:",
    "    displayName: Days quiet",
    "views:",
    "  - type: table",
    "    name: People here",
    "    order:",
    "      - file.name",
    "      - role",
    "      - formula.days_quiet",
    "```"
  ];
}
function buildCompaniesBase(companiesFolder) {
  return [
    "filters:",
    "  and:",
    `    - file.inFolder("${companiesFolder}")`,
    `    - 'type == "myu-company"'`,
    "formulas:",
    `  days_quiet: 'if(last_interaction, (today() - date(last_interaction)).days, "")'`,
    "properties:",
    "  people:",
    "    displayName: People",
    "  website:",
    "    displayName: Website",
    "  formula.days_quiet:",
    "    displayName: Days quiet",
    "views:",
    "  - type: table",
    "    name: Companies",
    "    order:",
    "      - file.name",
    "      - people",
    "      - formula.days_quiet",
    "      - website",
    "    sort:",
    "      - property: people",
    "        direction: DESC",
    "  - type: cards",
    "    name: Gallery",
    "    order:",
    "      - file.name",
    "      - people",
    ""
  ].join("\n");
}
function buildPeopleBase(peopleFolder) {
  return [
    "filters:",
    "  and:",
    `    - file.inFolder("${peopleFolder}")`,
    `    - 'type == "myu-person"'`,
    "formulas:",
    `  threads: 'if(open_commitments > 0, open_commitments + " open", "\u2014")'`,
    `  days_quiet: 'if(last_interaction, (today() - date(last_interaction)).days, "")'`,
    "properties:",
    "  role:",
    "    displayName: Role",
    "  company:",
    "    displayName: Company",
    "  formula.threads:",
    "    displayName: Open commitments",
    "  formula.days_quiet:",
    "    displayName: Days quiet",
    "views:",
    "  - type: table",
    "    name: People",
    "    order:",
    "      - file.name",
    "      - role",
    "      - company",
    "      - formula.days_quiet",
    "      - formula.threads",
    "    groupBy:",
    "      property: company",
    "      direction: ASC",
    "  - type: cards",
    "    name: Gallery",
    "    order:",
    "      - file.name",
    "      - role",
    "      - formula.days_quiet",
    "      - formula.threads",
    ""
  ].join("\n");
}

// src/buildStamp.ts
var BUILD_STAMP = true ? "0.1.2" : "dev";

// src/transport/api.ts
var COLD_START_OFF = { split_consent: false, onboarding_payback: false, offer_block: false, week_state: false, per_card_offer: false, self_card_legible: false };
function parseColdStartFlags(data) {
  const c = data && typeof data === "object" ? data.cold_start : null;
  const on = (k) => c?.[k] === true;
  return { split_consent: on("split_consent"), onboarding_payback: on("onboarding_payback"), offer_block: on("offer_block"), week_state: on("week_state"), per_card_offer: on("per_card_offer"), self_card_legible: on("self_card_legible") };
}
var BACKEND_FLAGS_OFF = { today_bundle: false, vault_changes: false, entities_changed_ids: false, entity_changed_at: false, retry_after_header: false };
function parseBackendFlags(data) {
  const d = data && typeof data === "object" ? data : null;
  const on = (k) => d?.[k] === true;
  return { today_bundle: on("today_bundle"), vault_changes: on("vault_changes"), entities_changed_ids: on("entities_changed_ids"), entity_changed_at: on("entity_changed_at"), retry_after_header: on("retry_after_header") };
}
function oauthQuery(opts) {
  return (opts.scopeSet ? `&scope_set=${encodeURIComponent(opts.scopeSet)}` : "") + (opts.returnTo ? `&return_to=${encodeURIComponent(opts.returnTo)}` : "");
}
function canvasOnResume(data) {
  const id = typeof data?.composition_id === "string" ? data.composition_id : "";
  if (id && data?.composition) {
    return {
      blocks: [{ type: "composition_offer", composition_id: id, summary_text: data.composition.summary_text ?? "" }],
      open: id,
      // WHICH reply it belongs to. A resumed conversation must put the canvas
      // beside the turn that made it, not beside the last thing said.
      ...typeof data.turn_number === "number" ? { turnNumber: data.turn_number } : {}
    };
  }
  if (data?.status === "encrypted_unavailable") {
    return { note: "This conversation has a canvas, but its key is not available in this session." };
  }
  return null;
}
function canvasesOnResume(data) {
  if (!Array.isArray(data?.compositions)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of data.compositions) {
    const id = typeof row?.composition_id === "string" ? row.composition_id : "";
    const turn = typeof row?.turn_number === "number" ? row.turn_number : 0;
    if (!id || turn <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ compositionId: id, summaryText: typeof row.summary_text === "string" ? row.summary_text : "", turnNumber: turn });
  }
  return out;
}
function parseCanvasSide(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const c = raw;
  const nc = c.narrative_context && typeof c.narrative_context === "object" ? c.narrative_context : {};
  const out = {};
  if (typeof c.composition_id === "string" && c.composition_id) out.composition_id = c.composition_id;
  if (Array.isArray(c.surface_mutations)) out.surface_mutations = c.surface_mutations;
  if (typeof c.summary_text === "string") out.summary_text = c.summary_text;
  if (typeof nc.continues_composition_id === "string" && nc.continues_composition_id) out.continues_composition_id = nc.continues_composition_id;
  return out.composition_id || out.surface_mutations || out.continues_composition_id ? out : void 0;
}
function parseChatTurn(data) {
  if (!data || typeof data !== "object") return { blocks: [] };
  let record = data;
  const canvas = parseCanvasSide(record.canvas);
  const offer = record.offer && typeof record.offer === "object" ? record.offer : void 0;
  if (record.journal && typeof record.journal === "object") record = record.journal;
  const journalId = typeof record.journal_id === "string" ? record.journal_id : void 0;
  let blocks = [];
  let references = Array.isArray(record.references) ? record.references : [];
  const content = record.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.content)) blocks = parsed.content;
      if (references.length === 0 && Array.isArray(parsed.references)) references = parsed.references;
    } catch {
      if (content.trim()) blocks = [{ type: "conversational", text: content }];
    }
  } else if (Array.isArray(content)) {
    blocks = content;
  }
  references = references.filter((r) => r && typeof r === "object" && (typeof r.title === "string" || typeof r.url === "string"));
  const similar = Array.isArray(record.similar_entries) ? record.similar_entries.filter((e) => typeof e?.journal_id === "string").map((e) => ({ journal_id: String(e.journal_id), content_preview: typeof e.content_preview === "string" ? e.content_preview : void 0 })) : [];
  const out = { journal_id: journalId, blocks };
  if (offer) out.offer = offer;
  if (canvas) out.canvas = canvas;
  if (references.length) out.references = references;
  if (similar.length) out.similar_entries = similar;
  return out;
}
function normalizePreferences(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const envelope = data;
  const inner = envelope.preferences;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner;
  }
  return envelope;
}
var Api = class {
  constructor(transport) {
    this.transport = transport;
  }
  exchangeToken(token, deviceId) {
    return this.transport.post(
      "/account/plugin-token/exchange",
      { token, device_id: deviceId, client_version: "0.1.0" },
      { anonymous: true }
    );
  }
  escrowMDEK(mdekBase64, deviceId) {
    return this.transport.post("/account/session/escrow-key", { mdek: mdekBase64, device_id: deviceId });
  }
  storeDeviceKEK(deviceId, kekBase64, deviceName) {
    return this.transport.post("/account/device/kek/store", {
      device_id: deviceId,
      device_kek: kekBase64,
      device_name: deviceName,
      device_type: "obsidian"
    });
  }
  fetchDeviceKEK(deviceId) {
    return this.transport.post("/account/device/kek/get", { device_id: deviceId });
  }
  requestDeviceTransfer(deviceId, publicKey, deviceName) {
    return this.transport.post("/account/device/transfer-request", {
      device_id: deviceId,
      public_key: publicKey,
      device_name: deviceName,
      device_type: "obsidian"
    });
  }
  getPendingTransfers() {
    return this.transport.get("/account/device/transfer-pending");
  }
  approveDeviceTransfer(requestId, verificationCode, encryptedMdek) {
    return this.transport.post("/account/device/transfer-approve", {
      request_id: requestId,
      verification_code: verificationCode,
      encrypted_mdek: encryptedMdek
    });
  }
  denyDeviceTransfer(requestId) {
    return this.transport.post("/account/device/transfer-deny", { request_id: requestId });
  }
  pollDeviceTransfer(requestId) {
    return this.transport.get(
      `/account/device/transfer-receive?request_id=${encodeURIComponent(requestId)}`
    );
  }
  fetchRecoveryWrappedMDEK() {
    return this.transport.get("/account/recovery/wrapped-key");
  }
  upsertJournal(payload) {
    return this.transport.postJournal("/journal/add", payload);
  }
  getBrief() {
    return this.transport.get("/feed/brief");
  }
  getCalendarEvents(start, end) {
    return this.transport.post("/calendar/events", { start_date: start, end_date: end });
  }
  listEntities(tab, opts = {}) {
    const since = opts.changedSince && opts.changedSince > 0 ? `&changed_since=${opts.changedSince}` : "";
    return this.transport.get(
      `/feed/entities?tab=${tab === "company" ? "companies" : "people"}${since}`
    );
  }
  getTodayBundle(start, end, timezone) {
    return this.transport.get(
      `/today/bundle?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`
    );
  }
  getVaultChanges(since, cursor = null, pageSize = 50) {
    const q = [`since=${Math.max(0, Math.floor(since))}`, `page_size=${pageSize}`, ...cursor ? [`cursor=${encodeURIComponent(cursor)}`] : []].join("&");
    return this.transport.get(`/vault/changes?${q}`);
  }
  getCard(entityType, entityId) {
    return this.transport.get(
      `/card/${entityType}?entity_id=${encodeURIComponent(entityId)}&level=read`
    );
  }
  getMeetingPrep(eventId) {
    return this.transport.get(`/prep/meeting?event_id=${encodeURIComponent(eventId)}`);
  }
  linkPrepSubject(eventId, relationshipId) {
    return this.transport.post("/prep/subject/link", { event_id: eventId, relationship_id: relationshipId });
  }
  searchEntities(query) {
    return this.transport.get(
      `/feed/entities/search?query=${encodeURIComponent(query)}`
    );
  }
  getWeeklyReview() {
    return this.transport.get("/review/weekly");
  }
  ingestMeetingNote(payload) {
    return this.transport.post("/meetings/ingest_note", payload);
  }
  getComposition(compositionId) {
    return this.transport.get(
      `/composition?id=${encodeURIComponent(compositionId)}`
    );
  }
  executeCompositionAction(compositionId, componentId, action, params) {
    return this.transport.post("/composition/action", {
      composition_id: compositionId,
      component_id: componentId,
      action,
      params
    });
  }
  persistCompositionMutations(compositionId, mutations) {
    return this.transport.post("/composition/mutate", {
      composition_id: compositionId,
      mutations
    });
  }
  requestDataExport() {
    return this.transport.post("/account/data/export-request", {});
  }
  postCompositionInteraction(events, generateResponse) {
    return this.transport.post("/composition/interaction", { events, timing: {}, generate_response: generateResponse });
  }
  getHelpMyuQueue() {
    return this.transport.get("/feed/help-myu");
  }
  getRelatedPersons(relationshipId, limit = 5) {
    return this.transport.get(`/feed/related-persons?relationship_id=${encodeURIComponent(relationshipId)}&limit=${limit}`);
  }
  getRelatedMemories(relationshipId, limit = 5) {
    return this.transport.get(`/feed/related-memories?relationship_id=${encodeURIComponent(relationshipId)}&limit=${limit}`);
  }
  getEntityDispatch(entityType, entityId) {
    return this.transport.get(`/feed/entities/dispatch?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
  }
  dismissEntityDispatch(entityId, signalFingerprint, category) {
    return this.transport.post("/feed/entities/dismiss", { entity_id: entityId, signal_fingerprint: signalFingerprint, ...category ? { category } : {} });
  }
  searchFeed(q, limit = 10) {
    return this.transport.get(`/feed/search?q=${encodeURIComponent(q)}&types=all&limit=${limit}`);
  }
  getSourceDetail(sourceType, sourceId) {
    return this.transport.get(`/card/source-detail?source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`);
  }
  setRelationshipLinkedIn(relationshipId, linkedinUrl) {
    return this.transport.post(`/v2/relationships/linkedin/${encodeURIComponent(relationshipId)}`, { linkedin_url: linkedinUrl });
  }
  rejectMerge(sourceId, targetId) {
    return this.transport.post("/relationships/merge", { source_id: sourceId, target_id: targetId, action: "reject" });
  }
  addMeetingDecision(meetingId, content) {
    return this.transport.post("/meetings/add-decision", { meeting_id: meetingId, content });
  }
  addMeetingCommitment(meetingId, content, commitmentType = "action_item", owner) {
    return this.transport.post("/meetings/add-commitment", { meeting_id: meetingId, content, commitment_type: commitmentType, ...owner ? { owner } : {} });
  }
  getDriveSuggestions(limit = 10) {
    return this.transport.get(`/meetings/drive/suggestions?limit=${limit}`);
  }
  importFromDrive(fileIds) {
    return this.transport.post("/meetings/import/drive", { file_ids: fileIds });
  }
  dismissDriveSuggestion(id) {
    return this.transport.post("/meetings/drive/suggestions", { id, action: "dismiss" });
  }
  googleOAuthDisconnect(credentialId) {
    return this.transport.post("/oauth/google/disconnect", { credential_id: credentialId });
  }
  googleSetPrimaryCredential(credentialId) {
    return this.transport.post("/oauth/google/credential/set-primary", { credential_id: credentialId });
  }
  microsoftOAuthDisconnect(credentialId) {
    return this.transport.post("/oauth/microsoft/disconnect", { credential_id: credentialId });
  }
  microsoftSetPrimaryCredential(credentialId) {
    return this.transport.post("/oauth/microsoft/credential/set-primary", { credential_id: credentialId });
  }
  slackConnect() {
    return this.transport.post("/slack/connect", {});
  }
  slackDisconnect(connectionId) {
    return this.transport.post("/slack/disconnect", { connection_id: connectionId });
  }
  zulipConnect(realmUrl, email, apiKey) {
    return this.transport.post("/zulip/connect", { realm_url: realmUrl, email, api_key: apiKey });
  }
  zulipDisconnect(connectionId) {
    return this.transport.post("/zulip/disconnect", { connection_id: connectionId });
  }
  updateAccountName(accountId, name) {
    return this.transport.post("/account/update", { account_id: accountId, name });
  }
  getAccountCareer(accountId) {
    return this.transport.get(`/account/career?account_id=${encodeURIComponent(accountId)}`);
  }
  getPersonalLoop() {
    return this.transport.get("/personal_loop/get");
  }
  submitFeedbackSignal(body) {
    return this.transport.post("/feedback/signal", body);
  }
  submitFeedback(body) {
    return this.transport.post("/feedback/submit", body);
  }
  refreshComposition(compositionId) {
    return this.transport.post("/composition/refresh", { composition_id: compositionId });
  }
  getCompositionHistory(limit = 20) {
    return this.transport.get(`/composition/history?limit=${limit}&offset=0`);
  }
  getCompositionForJournal(journalId) {
    return this.transport.get(
      `/composition/for-journal?journal_id=${encodeURIComponent(journalId)}`
    );
  }
  /** Every canvas this conversation made, oldest turn first (backend 2026-09-01).
      A server without the flag ignores it and answers the single-composition
      shape, which `canvasesOnResume` reads as "none" so the caller falls back. */
  getCompositionsForJournal(journalId) {
    return this.transport.get(
      `/composition/for-journal?journal_id=${encodeURIComponent(journalId)}&all=true`
    );
  }
  async createChatEntry(accountId, content, context, templateType, canvas) {
    const body = { account_id: accountId, content, surface_mode: canvas?.surfaceMode ?? "journal" };
    if (canvas?.continuesCompositionId) body.continues_composition_id = canvas.continuesCompositionId;
    if (templateType) body.template_type = templateType;
    if (context) {
      body.feed_context = context;
      body.context_injection = context;
    }
    const res = await this.transport.post("/journal/add", body);
    return { ...res, data: res.ok ? parseChatTurn(res.data) : null };
  }
  async addChatTurn(accountId, journalId, content, context, canvas) {
    const body = {
      account_id: accountId,
      chatter_id: accountId,
      journal_id: journalId,
      content,
      // The web sends its layoutMode and the canvas it has open; without them
      // the backend gates canvas content as if no canvas could show it.
      surface_mode: canvas?.surfaceMode ?? "journal"
    };
    if (canvas?.continuesCompositionId) body.continues_composition_id = canvas.continuesCompositionId;
    if (context) {
      body.feed_context = context;
      body.context_injection = context;
    }
    const res = await this.transport.post("/journal_chats/add", body);
    return { ...res, data: res.ok ? parseChatTurn(res.data) : null };
  }
  getMirrorEdition() {
    return this.transport.get("/initiative/mirror");
  }
  submitPatternFeedback(eventType, patternId, sourceSurface) {
    return this.transport.post("/initiative/pattern-feedback/submit", {
      event_type: eventType,
      pattern_id: patternId,
      source_surface: sourceSurface
    });
  }
  vaultInteraction(events) {
    return this.transport.post("/vault/interaction", { events });
  }
  listVaultCommitments() {
    return this.transport.post("/vault/commitments", {});
  }
  async createAccount(email, name, password, termsVersion) {
    const res = await this.transport.post("/account/create", {
      email,
      name,
      password,
      client: "obsidian",
      ...termsVersion ? { terms_version: termsVersion } : {}
    });
    const flat = res.data?.account ?? res.data ?? null;
    return { ...res, data: flat ? { autoken: flat.autoken, account_id: flat.account_id } : null };
  }
  createPluginToken(label) {
    return this.transport.post("/account/plugin-token/create", {
      label,
      client: "obsidian"
    });
  }
  requestMagicLink(email, name, termsVersion) {
    return this.transport.post(
      "/auth/magic-link/request",
      { email, name, client: "obsidian", ...termsVersion ? { terms_version: termsVersion } : {} },
      { anonymous: true }
    );
  }
  getTerms() {
    return this.transport.get("/terms");
  }
  acceptTerms(termsVersion) {
    return this.transport.post("/account/terms/accept", { terms_version: termsVersion, client: "obsidian" });
  }
  validateMagicLink(token) {
    return this.transport.get(
      `/auth/magic-link/validate?token=${encodeURIComponent(token)}`,
      { headers: { "X-Client-Type": "obsidian" } }
    );
  }
  resolveLinkedInSuggestion(body) {
    return this.transport.post("/v2/relationships/linkedin/suggestion/resolve", body);
  }
  confirmIdentity(relationshipId) {
    return this.transport.post("/card/identity/confirm", {
      relationship_id: relationshipId
    });
  }
  getBoardLite(entityType, entityId) {
    return this.transport.post("/card/board-lite", {
      entity_type: entityType,
      entity_id: entityId
    });
  }
  setupRecovery(wrappedMdekRecovery) {
    return this.transport.post("/account/recovery/setup", {
      wrapped_mdek_recovery: wrappedMdekRecovery
    });
  }
  googleOAuthInit(opts = {}) {
    return this.transport.post(`/oauth/google/init?origin=obsidian${oauthQuery(opts)}`, {});
  }
  setMailOldestDate(provider, credentialId, ymd) {
    return this.transport.post(`/oauth/${provider}/credential/settings`, { credential_id: credentialId, mail_oldest_date: ymd });
  }
  microsoftOAuthInit(opts = {}) {
    return this.transport.post(`/oauth/microsoft/init?origin=obsidian${oauthQuery(opts)}`, {});
  }
  getFeatures() {
    return this.transport.get("/features");
  }
  addIcalUrl(url) {
    return this.transport.post("/calendar/ical/add", { url });
  }
  uploadIcs(bytes) {
    return this.transport.postRaw("/calendar/ics/upload", bytes, "text/calendar");
  }
  createCareerTrajectory() {
    return this.transport.post("/composition/career-trajectory", { entity_type: "self" });
  }
  getRelationshipMemories(relationshipId, limit = 50) {
    return this.transport.get(
      `/memories/relationship/${encodeURIComponent(relationshipId)}?source_type=all&limit=${limit}`
    );
  }
  getSelfCard() {
    return this.transport.get("/card/self");
  }
  getMeetingDetail(meetingId) {
    return this.transport.get(`/meetings/get?meeting_id=${encodeURIComponent(meetingId)}`);
  }
  listMeetings(limit, offset) {
    return this.transport.get(
      `/meetings/list?limit=${limit}&offset=${offset}`
    );
  }
  getJournalChats(journalId) {
    return this.transport.get(`/journal_chats/get?journal_id=${encodeURIComponent(journalId)}`);
  }
  getJournalEntries(accountId, startMs, endMs) {
    return this.transport.get(
      `/journal/get?account_id=${encodeURIComponent(accountId)}&start_date=${startMs}&end_date=${endMs}`
    );
  }
  setBackgroundWorkConsent(consented) {
    return this.transport.post("/account/background-work/set", { consented });
  }
  listGenericEmailAccounts() {
    return this.transport.get("/email/generic/list");
  }
  addImapConnection(email, password, host, port, ssl) {
    return this.transport.post("/email/generic/add", { email, password, protocol: "imap", incoming_host: host, incoming_port: port, incoming_ssl: ssl });
  }
  testImapConnection(email, password, host, port, ssl) {
    return this.transport.post("/email/generic/test", { email, password, protocol: "imap", incoming_host: host, incoming_port: port, incoming_ssl: ssl });
  }
  removeGenericEmailAccount(credentialId) {
    return this.transport.post("/email/generic/remove", { credential_id: credentialId });
  }
  listCalDavAccounts() {
    return this.transport.get("/calendar/caldav/list");
  }
  addCalDavAccount(provider, email, password, caldavUrl) {
    return this.transport.post("/calendar/caldav/add", { provider, email, password, caldav_url: caldavUrl });
  }
  testCalDavConnection(provider, email, password, caldavUrl) {
    return this.transport.post("/calendar/caldav/test", { provider, email, password, caldav_url: caldavUrl });
  }
  removeCalDavAccount(credentialId) {
    return this.transport.post("/calendar/caldav/remove", { credential_id: credentialId });
  }
  getSlackConnections() {
    return this.transport.get("/slack/connections");
  }
  getZulipConnections() {
    return this.transport.get("/zulip/connections");
  }
  // ── account surfaces (parity review 2026-08-26) ──────────────────────────
  // Paths and methods copied from packages/web/src/lib/backendMethods.ts and
  // accountEmailsApi.ts, then checked against each servlet's securityPass:
  // /account/devices and /account/emails/list are GET-only in web's usage;
  // DeviceRemove and AccountDelete gate on POST explicitly.
  listDevices() {
    return this.transport.get("/account/devices");
  }
  removeDevice(deviceId) {
    return this.transport.post("/account/device/remove", { device_id: deviceId });
  }
  renameDevice(deviceId, deviceName) {
    return this.transport.post("/account/device/rename", { device_id: deviceId, device_name: deviceName });
  }
  listAccountEmails() {
    return this.transport.get("/account/emails/list");
  }
  addAccountEmail(email) {
    return this.transport.post("/account/emails/add", { email });
  }
  resendAccountEmail(email) {
    return this.transport.post("/account/emails/resend", { email });
  }
  removeAccountEmail(email) {
    return this.transport.post("/account/emails/remove", { email });
  }
  setPrimaryAccountEmail(email) {
    return this.transport.post("/account/emails/set-primary", { email });
  }
  getAccountPreferences() {
    return this.transport.get("/account/preferences/get");
  }
  updateAccountPreferences(body) {
    return this.transport.post("/account/preferences/update", { preferences: body });
  }
  deleteAccount(confirmation) {
    return this.transport.post("/account/delete", { confirmation, immediate: true });
  }
  // ── person edit suite. Bodies copied from web's experimentsBackendMethods.
  updateRelationshipProfile(relationshipId, fields) {
    return this.transport.post("/v2/relationships/profile/update", { relationship_id: relationshipId, fields });
  }
  editRelationshipMemory(memoryId, action, correction) {
    return this.transport.post("/v2/relationships/memories/edit", {
      memory_id: memoryId,
      action,
      ...correction ? { correction } : {}
    });
  }
  mergeRelationships(sourceId, targetId, reason = "user_initiated_merge") {
    return this.transport.post("/v2/relationships/merge", { source_id: sourceId, target_id: targetId, reason });
  }
  markRelationshipAsSelf(relationshipId) {
    return this.transport.post("/experiments/relationships/mark-as-self", { relationship_id: relationshipId });
  }
  archiveRelationship(relationshipId, action) {
    return this.transport.post("/relationships/archive", { relationship_id: relationshipId, action });
  }
  purgeRelationship(relationshipId) {
    return this.transport.post("/v2/relationships/purge", { relationship_id: relationshipId, confirm: true });
  }
  googleOAuthStatus() {
    return this.transport.get("/oauth/google/status");
  }
  microsoftOAuthStatus() {
    return this.transport.get("/oauth/microsoft/status");
  }
  // ── P10: onboarding (mirrors the web's OnboardingChat calls exactly) ───────
  getAccountState(accountId) {
    return this.transport.get(`/account/state/check?account_id=${encodeURIComponent(accountId)}`);
  }
  updateAccountState(accountId, update) {
    const body = { account_id: accountId };
    if (update.onboardingComplete !== void 0) body.onboarding_complete = update.onboardingComplete;
    if (update.myuScripts) body.myu_scripts = update.myuScripts;
    return this.transport.post("/account/state/update", body);
  }
  linkedinSeek(accountId, linkedinUrl) {
    const qs = `?account_id=${encodeURIComponent(accountId)}&summarize=true&regenerate=false&linkedin_url=${encodeURIComponent(linkedinUrl)}`;
    return this.transport.get(`/linkedin/seek${qs}`);
  }
  saveLinkedinId(accountId, linkedinId) {
    return this.transport.post("/account/career/update", { account_id: accountId, linkedin_id: linkedinId });
  }
  queryCurrentEmployment(accountId, source) {
    return this.transport.get(`/onboard/current_employment?account_id=${encodeURIComponent(accountId)}&source=${source}`);
  }
  confirmCurrentEmployment(accountId) {
    return this.transport.post("/onboard/current_employment_confirm", { account_id: accountId });
  }
  resumeUpload(accountId, fileName, bytes) {
    const boundary = `----myu${Math.random().toString(36).slice(2)}`;
    const enc = new TextEncoder();
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    const mime = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" }[ext] ?? "application/octet-stream";
    const parts = [];
    const push = (text) => parts.push(enc.encode(text));
    push(`--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${fileName}"\r
Content-Type: ${mime}\r
\r
`);
    parts.push(new Uint8Array(bytes));
    push("\r\n");
    for (const [name, value] of [["account_id", accountId], ["resume_name", fileName], ["summarize", "true"]]) {
      push(`--${boundary}\r
Content-Disposition: form-data; name="${name}"\r
\r
${value}\r
`);
    }
    push(`--${boundary}--\r
`);
    const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      body.set(p, offset);
      offset += p.length;
    }
    return this.transport.postRaw("/resume/upload", body.buffer, `multipart/form-data; boundary=${boundary}`);
  }
  saveResumeId(accountId, resumeId) {
    return this.transport.post("/account/career/update", { account_id: accountId, resume_id: resumeId });
  }
  classifyCareerMoment(accountId, content) {
    return this.transport.post("/onboard/classify_career_moment", { account_id: accountId, content });
  }
};

// src/views/PersonActionConfirmModal.ts
var import_obsidian13 = require("obsidian");
var PersonActionConfirmModal = class extends import_obsidian13.Modal {
  constructor(app, copy, onAnswer) {
    super(app);
    this.copy = copy;
    this.onAnswer = onAnswer;
    this.answered = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: this.copy.title });
    contentEl.createEl("p", { cls: "myu-prose", text: this.copy.body });
    new import_obsidian13.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.answer(false))).addButton((b) => b.setButtonText(this.copy.cta).setDestructive().onClick(() => this.answer(true)));
  }
  answer(yes) {
    this.answered = true;
    this.close();
    void this.onAnswer(yes);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      void this.onAnswer(false);
    }
  }
};

// src/views/SettingsTab.ts
function ymdMonthsAgo(n) {
  const d = /* @__PURE__ */ new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function monthsBack(ymd) {
  const t = Date.parse(ymd);
  if (!Number.isFinite(t)) return 12;
  const months = (Date.now() - t) / (30.44 * 864e5);
  return [3, 6, 12, 24].reduce((best, m) => Math.abs(m - months) < Math.abs(best - months) ? m : best, 12);
}
function ago(when) {
  const t = typeof when === "number" ? when : Date.parse(when);
  if (!Number.isFinite(t)) return "a while ago";
  const m = Math.max(0, Math.round((Date.now() - t) / 6e4));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
var MYU_LOOK_URL = "https://github.com/AskMyu/askmyu-obsidian-plugin/raw/main/snippets/myu-look.css";
var INTEGRATION_CARDS = {
  google: {
    name: "Google Calendar & Gmail",
    desc: "Connect and Myu preps your meetings and reads the room from your threads. One browser tab for Google\u2019s consent screen; it sends you right back."
  },
  microsoft: {
    name: "Microsoft Outlook & calendar",
    desc: "Same idea for the Microsoft side of your life. One browser tab for the consent screen; it sends you right back."
  }
};
var AskMyuSettingTab = class extends import_obsidian14.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /**
   * Re-render, but only when the tab is actually on screen. State transitions
   * (unlock, relock, genesis completing behind a modal) otherwise leave a
   * stale one-shot render showing rows for a state that no longer exists.
   */
  refreshIfVisible() {
    if (this.containerEl.isConnected) this.rerender();
  }
  /**
   * Re-render the way Obsidian paints us: `update()` re-reads the definitions
   * and repaints the active tab in place — groups, search, one section order.
   * (The legacy `display()` path is gone with minAppVersion 1.13: calling it
   * over a definitions render reshuffled the pane after every click, 2026-09-03.)
   * Every re-render in this file goes here.
   */
  rerender() {
    this.update();
  }
  /**
   * The declarative settings API (1.13, our floor). Each section is a
   * searchable group (name + aliases reach Obsidian's settings search) whose
   * one item renders the section's UI into the group. (Migrating each toggle
   * to a `control` definition — individually searchable — is the follow-up.)
   */
  getSettingDefinitions() {
    const section = (heading, aliases, render, visible) => ({
      type: "group",
      heading,
      ...visible ? { visible } : {},
      items: [{ name: heading, aliases, render: (setting) => mountInRow(setting, render) }]
    });
    return [
      // The brandmark, first — the one brand moment in settings. A render item
      // outside any group, unsearchable, so 1.13's definitions render paints it
      // exactly where display() does (live, 2026-09-03: it only ever appeared
      // after a legacy repaint, never on open).
      { name: "askMyu", searchable: false, render: (setting) => mountInRow(setting, (root) => appendBrand(root, "myu-brand myu-brand-settings")) },
      section("Connection", ["account", "sign in", "devices", "backend", "token"], (r) => this.renderConnection(r)),
      section("What Myu can read", ["consent", "folders", "tags", "journal", "sharing"], (r) => this.renderSharing(r)),
      section("Meeting notes", ["meetings", "transcripts", "capture"], (r) => this.renderMeetingNotes(r)),
      section("Myu's folder", ["materialize", "people", "companies", "calendar", "commitments", "bases", "sync", "sync on open"], (r) => this.renderMaterialization(r)),
      section("Weave Myu in", ["integrations", "recipes", "snippets", "bases embed", "tasks", "dataview", "daily notes", "template"], (r) => this.renderIntegrations(r)),
      section("Weekly review", ["review", "week"], (r) => this.renderWeeklyReview(r)),
      section("Account", ["delete account", "email", "aliases", "sign out", "export", "archive", "uninstall"], (r) => this.renderAccount(r), () => this.plugin.unlock.current === "unlocked"),
      section("Advanced", ["backend url", "debug", "snippet", "styling"], (r) => this.renderAdvanced(r))
    ];
  }
  // ── P8: the shared surface ──────────────────────────────────────────────────
  renderMaterialization(root) {
    const s2 = this.plugin.settings;
    if (!s2.materialize_consented) {
      root.createEl("p", {
        cls: "myu-prose myu-quiet",
        text: "Myu can keep a folder in your vault \u2014 a page per person, today, the week, and your commitments as real checkboxes. Off until you say so."
      });
      new import_obsidian14.Setting(root).addButton(
        (b) => b.setButtonText("Let Myu write\u2026").onClick(() => {
          new MaterializeConsentModal(this.app, this.plugin, (accepted) => {
            if (!accepted) return;
            this.plugin.restartCapture();
            void this.plugin.materializer.materializeAll();
            this.rerender();
          }).open();
        })
      );
      return;
    }
    new import_obsidian14.Setting(root).setName("Writing on").setDesc(`Myu maintains ${s2.materialize_folder}/ \u2014 ticking a checkbox there marks it done in Myu.`).addToggle(
      (t) => t.setValue(s2.materialize_enabled).onChange(async (v) => {
        s2.materialize_enabled = v;
        await this.plugin.saveSettings();
        this.plugin.restartCapture();
      })
    ).addButton(
      (b) => b.setButtonText("Sync now").onClick(async () => {
        b.setButtonText("Syncing\u2026").setDisabled(true);
        await this.plugin.materializer.materializeAll();
        notifyStatus("Synced \u2014 Myu\u2019s folder is current.");
        this.rerender();
      })
    );
    new import_obsidian14.Setting(root).setName("People").addToggle(
      (t) => t.setValue(s2.materialize_people).onChange(async (v) => {
        s2.materialize_people = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian14.Setting(root).setName("Today and the week").addToggle(
      (t) => t.setValue(s2.materialize_today).onChange(async (v) => {
        s2.materialize_today = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian14.Setting(root).setName("Commitments").addToggle(
      (t) => t.setValue(s2.materialize_commitments).onChange(async (v) => {
        s2.materialize_commitments = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian14.Setting(root).setName("Meeting history").setDesc("Your past meetings, from every source, as notes in Myu/Meetings/.").addToggle(
      (t) => t.setValue(s2.materialize_meetings_history).onChange(async (v) => {
        s2.materialize_meetings_history = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian14.Setting(root).setName("Calendar").setDesc("A month grid (Myu/Calendar.md) and a note per day \u2014 schedule, meetings, journal.").addToggle(
      (t) => t.setValue(s2.materialize_calendar).onChange(async (v) => {
        s2.materialize_calendar = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian14.Setting(root).setName("Sync when the vault opens").setDesc("A full pass in the background every time you open the vault, so Today is current. Off: nothing runs until you press the sync button (Today pane, or the command).").addToggle((tg) => tg.setValue(this.plugin.settings.sync_on_open).onChange(async (v) => {
      this.plugin.settings.sync_on_open = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian14.Setting(root).setName("Journal history").setDesc("Your journal from every surface, decrypted into Myu/Journal/ \u2014 one note per day.").addToggle(
      (t) => t.setValue(s2.materialize_journal_history).onChange(async (v) => {
        s2.materialize_journal_history = v;
        await this.plugin.saveSettings();
      })
    );
  }
  // ── P8.5: weave Myu in — copyable snippets, pasted by THEIR hand ───────────
  renderIntegrations(root) {
    new import_obsidian14.Setting(root).setName("Recipes").setDesc(
      'Your day inside every daily note, the brief, the week, a Tasks query for your commitments, the people table, a Dataview table, a button to Today. Myu never edits your files: you paste them, or put one at the cursor with the command "Insert a Myu snippet\u2026".'
    ).addButton((b) => b.setButtonText("Open the recipes").onClick(() => void this.plugin.openWeave()));
  }
  /**
   * The account itself — devices, login aliases, how Myu addresses you, and
   * the door out.
   *
   * Added by the parity review (2026-08-26). Each of these was reachable on the
   * web and nowhere in the vault, which is rule 3 ("no webapp-only ceremonies")
   * being quietly broken: a vault-primary user could be revoked but could not
   * revoke, could be addressed but could not say how, and could not leave.
   * Everything here calls the same endpoint the webapp calls, with the same
   * method and body.
   */
  renderAccount(containerEl) {
    if (this.plugin.unlock.current !== "unlocked") return;
    const devicesHost = containerEl.createDiv();
    const emailsHost = containerEl.createDiv();
    const nameHost = containerEl.createDiv();
    const addressHost = containerEl.createDiv();
    const careerHost = containerEl.createDiv();
    void this.renderDevices(devicesHost);
    void this.renderAccountEmails(emailsHost);
    void this.renderProfile(nameHost, careerHost);
    void this.renderPreferences(addressHost);
    new import_obsidian14.Setting(containerEl).setName("Delete my account").setDesc("Irreversible. Everything Myu holds about you is deleted, immediately. Your vault is untouched.").addButton(
      (b) => b.setButtonText("Delete\u2026").setDestructive().onClick(() => {
        new DeleteAccountModal(this.app, this.plugin, () => this.rerender()).open();
      })
    );
  }
  /** A section that could not load says so — and offers the one thing that helps. */
  renderLoadFailure(host, what, why, retry) {
    new import_obsidian14.Setting(host).setName(what).setDesc(`Couldn't load \u2014 ${why}`).addButton((b) => b.setButtonText("Retry").onClick(retry));
  }
  /** The web's General → Profile: your name (account/update) and what Myu knows of your career (account/career). */
  async renderProfile(nameHost, careerHost) {
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const retry = () => {
      nameHost.empty();
      careerHost.empty();
      void this.renderProfile(nameHost, careerHost);
    };
    const [self2, career] = await Promise.all([
      this.plugin.backend.getSelfCard().catch(() => null),
      this.plugin.backend.getAccountCareer(accountId).catch(() => null)
    ]);
    const why = loadFailure(self2);
    if (why) {
      this.renderLoadFailure(nameHost, "Your name", why, retry);
      return;
    }
    const current = self2?.data?.card?.header?.display_name ?? "";
    let name = current;
    new import_obsidian14.Setting(nameHost).setName("Your name").setDesc("How Myu writes you into your own notes.").addText((t) => t.setPlaceholder("Your name").setValue(current).onChange((v) => {
      name = v;
    })).addButton((b) => b.setButtonText("Save").onClick(async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === current) return;
      const r = await this.plugin.backend.updateAccountName(accountId, trimmed);
      if (r.ok && r.data?.success !== false) notifyStatus("Name saved.");
      else notifyError(r.data?.message || "Couldn\u2019t save the name.");
    }));
    const c = career?.data;
    if (c && c.status !== "no_data" && (c.summary || c.resume_summary || c.linkedin_data_id || c.linkedin_id)) {
      const handle = c.linkedin_id || c.linkedin_data_id;
      const row = new import_obsidian14.Setting(careerHost).setName("Career, as Myu knows it").setDesc((c.summary || c.resume_summary || "").slice(0, 280));
      if (handle) row.addButton((b) => b.setButtonText("LinkedIn").onClick(() => window.open(`https://linkedin.com/in/${encodeURIComponent(handle)}`, "_blank")));
    }
  }
  /**
   * Devices holding custody, with the revoke.
   *
   * This is the kill switch the listing copy already promises — "removing this
   * device in askMyu deletes the wrapping key, which makes the local blob
   * permanently inert." Until now the plugin could only ever be ON the
   * receiving end of that. THIS device is marked and cannot be revoked from
   * here: pulling your own custody out from under yourself mid-session is a
   * footgun, and Disconnect above already does the local half honestly.
   */
  async renderDevices(host) {
    const res = await this.plugin.backend.listDevices().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      this.renderLoadFailure(host, "Devices", why, () => {
        host.empty();
        void this.renderDevices(host);
      });
      return;
    }
    const devices = res?.data?.devices ?? [];
    const mine = this.plugin.settings.device_id;
    if (devices.length === 0) {
      new import_obsidian14.Setting(host).setName("Devices").setDesc("askMyu lists no devices for this account yet.");
      return;
    }
    new import_obsidian14.Setting(host).setName("Devices").setDesc(`${devices.length} device${devices.length === 1 ? "" : "s"} can open your content. Removing one makes its stored copy permanently unreadable.`);
    for (const device of devices) {
      const id = String(device.device_id ?? "");
      if (!id) continue;
      const name = String(device.device_name ?? device.device_type ?? "Unnamed device");
      const isThis = mine !== null && id === mine;
      const lastUsed = parseWhen(firstPresent(device.last_used_at, device.last_seen_at, device.created_at));
      const when = lastUsed ? lastUsed.toISOString().slice(0, 10) : null;
      const row = new import_obsidian14.Setting(host).setName(isThis ? `${name} \u2014 this vault` : name).setDesc(when ? `Last used ${when}` : "Never used");
      if (isThis) {
        row.addButton((b) => b.setButtonText("In use").setDisabled(true));
        continue;
      }
      row.addButton(
        (b) => b.setButtonText("Remove").setDestructive().onClick(async () => {
          const done = await this.plugin.backend.removeDevice(id);
          if (done.ok) {
            notifyStatus(`${name} removed \u2014 its stored copy can no longer be opened.`);
            this.rerender();
          } else {
            notifyError("Couldn't remove that device. Check the connection and try again.");
          }
        })
      );
    }
  }
  /**
   * Login aliases (V046).
   *
   * No verify button: verification happens by clicking a link in an email, and
   * a vault cannot open mail. The row says so rather than offering a control
   * that could not work.
   */
  async renderAccountEmails(host) {
    const res = await this.plugin.backend.listAccountEmails().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      this.renderLoadFailure(host, "Email addresses", why, () => {
        host.empty();
        void this.renderAccountEmails(host);
      });
      return;
    }
    const emails = res?.data?.emails ?? [];
    new import_obsidian14.Setting(host).setName("Email addresses").setDesc("Any verified address can sign you in. Add one and Myu emails it a link to confirm.").addButton(
      (b) => b.setButtonText("Add\u2026").onClick(() => {
        new AddAccountEmailModal(this.app, this.plugin, () => this.rerender()).open();
      })
    );
    for (const entry of emails) {
      const address = String(entry.email ?? "");
      if (!address) continue;
      const isPrimary = entry.is_primary === true;
      const verified = entry.verified === true;
      const row = new import_obsidian14.Setting(host).setName(address).setDesc(isPrimary ? "Primary" : verified ? "Verified" : "Waiting for you to click the link Myu emailed");
      if (!verified) {
        row.addButton(
          (b) => b.setButtonText("Resend").onClick(async () => {
            await this.plugin.backend.resendAccountEmail(address);
            notifyStatus(`Sent another link to ${address}.`);
          })
        );
      }
      if (verified && !isPrimary) {
        row.addButton(
          (b) => b.setButtonText("Make primary").onClick(async () => {
            await this.plugin.backend.setPrimaryAccountEmail(address);
            notifyStatus(`${address} is now your primary address.`);
            this.rerender();
          })
        );
      }
      if (!isPrimary) {
        row.addButton(
          (b) => b.setButtonText("Remove").setDestructive().onClick(async () => {
            await this.plugin.backend.removeAccountEmail(address);
            notifyStatus(`${address} removed.`);
            this.rerender();
          })
        );
      }
    }
  }
  /** How Myu addresses you, and how directly it speaks. Account state, so it
      is written back rather than mirrored (rule 3). */
  async renderPreferences(host) {
    const res = await this.plugin.backend.getAccountPreferences().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      this.renderLoadFailure(host, "What Myu calls you", why, () => {
        host.empty();
        void this.renderPreferences(host);
      });
      return;
    }
    const prefs = normalizePreferences(res?.data);
    const address = typeof prefs.preferred_address === "string" ? prefs.preferred_address : "";
    const coaching = typeof prefs.coaching_preference === "string" ? prefs.coaching_preference : "auto";
    new import_obsidian14.Setting(host).setName("What Myu calls you").setDesc("In conversation. Leave empty and Myu uses your name.").addText(
      (t) => t.setPlaceholder("E.g. Boss").setValue(address).onChange(async (value) => {
        await this.plugin.backend.updateAccountPreferences({ preferred_address: value.trim() });
      })
    );
    new import_obsidian14.Setting(host).setName("How directly Myu speaks").setDesc("Auto follows the moment. The rest hold Myu to one register.").addDropdown(
      (d) => d.addOptions({
        auto: "Auto",
        socratic: "Ask, don't tell",
        balanced: "Balanced",
        directive: "Say what you think",
        didactic: "Teach me"
      }).setValue(coaching).onChange(async (value) => {
        await this.plugin.backend.updateAccountPreferences({ coaching_preference: value });
        notifyStatus("Saved.");
      })
    );
  }
  /**
   * The webapp's origin, derived from the configured API base.
   *
   * They share an origin — `myu.askmyu.com` serves both the app and `/api`.
   * This used to also rewrite `api.` → `myu.`, from when prod's API lived on a
   * separate host; that host is gone (2026-08-26) and the rewrite with it.
   */
  webOrigin() {
    return this.plugin.settings.base_url.replace(/\/api\/?$/, "");
  }
  /** IMAP mailboxes, CalDAV calendars, Slack, Zulip — listed with remove/add. */
  async renderOtherSources(host) {
    const [imap, caldav, slack, zulip] = await Promise.all([
      this.plugin.backend.listGenericEmailAccounts().catch(() => null),
      this.plugin.backend.listCalDavAccounts().catch(() => null),
      this.plugin.backend.getSlackConnections().catch(() => null),
      this.plugin.backend.getZulipConnections().catch(() => null)
    ]);
    const retry = () => {
      host.empty();
      void this.renderOtherSources(host);
    };
    const imapWhy = loadFailure(imap);
    if (imapWhy) this.renderLoadFailure(host, "Other email (IMAP)", imapWhy, retry);
    else {
      const imapRow = new import_obsidian14.Setting(host).setName("Other email (IMAP)");
      const imapAccounts = imap?.data?.accounts ?? [];
      imapRow.setDesc(
        imapAccounts.length > 0 ? `Connected: ${imapAccounts.map((a) => a.email).filter(Boolean).join(", ")}` : "Fastmail, Proton (bridge), your own server \u2014 any IMAP mailbox."
      );
      for (const account of imapAccounts) {
        if (!account.credential_id) continue;
        const id = account.credential_id;
        imapRow.addButton(
          (b) => b.setButtonText(`Remove ${account.email ?? ""}`).onClick(async () => {
            await this.plugin.backend.removeGenericEmailAccount(id);
            notifyStatus("Removed.");
            this.rerender();
          })
        );
      }
      imapRow.addButton(
        (b) => b.setButtonText("Add\u2026").onClick(() => new AddSourceModal(this.app, this.plugin, "imap", () => this.rerender()).open())
      );
    }
    const caldavWhy = loadFailure(caldav);
    if (caldavWhy) this.renderLoadFailure(host, "Other calendars (CalDAV)", caldavWhy, retry);
    else {
      const caldavRow = new import_obsidian14.Setting(host).setName("Other calendars (CalDAV)");
      const caldavAccounts = caldav?.data?.accounts ?? [];
      caldavRow.setDesc(
        caldavAccounts.length > 0 ? `Connected: ${caldavAccounts.map((a) => a.email).filter(Boolean).join(", ")}` : "Fastmail, iCloud, Nextcloud \u2014 any CalDAV calendar."
      );
      for (const account of caldavAccounts) {
        if (!account.credential_id) continue;
        const id = account.credential_id;
        caldavRow.addButton(
          (b) => b.setButtonText(`Remove ${account.email ?? ""}`).onClick(async () => {
            await this.plugin.backend.removeCalDavAccount(id);
            notifyStatus("Removed.");
            this.rerender();
          })
        );
      }
      caldavRow.addButton(
        (b) => b.setButtonText("Add\u2026").onClick(() => new AddSourceModal(this.app, this.plugin, "caldav", () => this.rerender()).open())
      );
    }
    let icalUrl = "";
    new import_obsidian14.Setting(host).setName("Calendar link").setDesc("A private iCal address \u2014 Google Calendar: Settings \u2192 your calendar \u2192 secret address in iCal format; Outlook: Publish calendar. Read-only by construction.").addText((t) => t.setPlaceholder("https://\u2026/basic.ics").onChange((v) => {
      icalUrl = v.trim();
    })).addButton((b) => b.setButtonText("Read my week").onClick(async () => {
      if (!/^(https:\/\/|webcal:\/\/)/i.test(icalUrl)) {
        notifyError("Paste the full address \u2014 it starts with https://");
        return;
      }
      const r = await this.plugin.backend.addIcalUrl(icalUrl).catch(() => null);
      if (r?.ok && r.data?.success !== false) {
        notifyStatus(`Calendar added \u2014 ${r.data?.events_stored ?? 0} events. Your week starts painting in Today.`);
        void this.plugin.refreshTodayNow();
      } else notifyError(r?.data?.error || "That address did not read as a calendar. Check it ends with .ics and try again.");
    }));
    new import_obsidian14.Setting(host).setName("Calendar file").setDesc("An .ics export from any calendar. Read once; nothing to revoke.").addButton((b) => b.setButtonText("Upload an .ics\u2026").onClick(async () => {
      const picked = await pickFile(".ics,text/calendar");
      if (!picked) return;
      const r = await this.plugin.backend.uploadIcs(picked.bytes).catch(() => null);
      if (r?.ok && r.data?.success !== false) {
        notifyStatus(`Calendar file read \u2014 ${r.data?.events_stored ?? 0} events. Your week starts painting in Today.`);
        void this.plugin.refreshTodayNow();
      } else notifyError(r?.data?.error || "That file did not read as a calendar export. Export an .ics and try again.");
    }));
    const slackWhy = loadFailure(slack);
    if (slackWhy) this.renderLoadFailure(host, "Slack", slackWhy, retry);
    else {
      const slackRows = (slack?.data?.connections ?? []).filter((c) => c.status !== "disconnected");
      const slackRow = new import_obsidian14.Setting(host).setName("Slack").setDesc(slackRows.length > 0 ? `${slackRows.length} workspace${slackRows.length === 1 ? "" : "s"} connected.` : "Myu reads the DMs and channels you choose. Consent happens on Slack\u2019s own screen.");
      for (const c of slackRows) {
        const id = String(c.connection_id ?? "");
        if (!id) continue;
        new import_obsidian14.Setting(host).setName(String(c.workspace_name ?? "Workspace")).setDesc([c.user_email, c.user_name].filter(Boolean).join(" \xB7 ")).addButton((b) => {
          let armed = false;
          b.setButtonText("Disconnect").onClick(async () => {
            if (!armed) {
              armed = true;
              b.setButtonText("Disconnect \u2014 sure?").setDestructive();
              return;
            }
            const r = await this.plugin.backend.slackDisconnect(id);
            if (r.ok) {
              notifyStatus("Slack workspace disconnected.");
              this.rerender();
            } else notifyError("Couldn\u2019t disconnect.");
          });
        });
      }
      slackRow.addButton((b) => b.setButtonText(slackRows.length ? "Connect another\u2026" : "Connect\u2026").onClick(async () => {
        const r = await this.plugin.backend.slackConnect().catch(() => null);
        const url = r?.data?.authorization_url;
        if (r?.ok && url) {
          window.open(url, "_blank");
          notifyStatus("Finish on Slack\u2019s screen; the workspace shows here when you reopen settings.");
        } else notifyError("Could not start the Slack connect.");
      }));
    }
    const zulipWhy = loadFailure(zulip);
    if (zulipWhy) this.renderLoadFailure(host, "Zulip", zulipWhy, retry);
    else {
      const zulipRows = (zulip?.data?.connections ?? []).filter((c) => c.status !== "disconnected");
      const zulipRow = new import_obsidian14.Setting(host).setName("Zulip").setDesc(zulipRows.length > 0 ? `${zulipRows.length} organization${zulipRows.length === 1 ? "" : "s"} connected.` : "Connects with a bot email and API key from your Zulip settings.");
      for (const c of zulipRows) {
        const id = String(c.connection_id ?? "");
        if (!id) continue;
        new import_obsidian14.Setting(host).setName(String(c.workspace_name ?? c.workspace_id ?? "Organization")).setDesc([c.user_email, c.user_name].filter(Boolean).join(" \xB7 ")).addButton((b) => {
          let armed = false;
          b.setButtonText("Disconnect").onClick(async () => {
            if (!armed) {
              armed = true;
              b.setButtonText("Disconnect \u2014 sure?").setDestructive();
              return;
            }
            const r = await this.plugin.backend.zulipDisconnect(id);
            if (r.ok) {
              notifyStatus("Zulip organization disconnected.");
              this.rerender();
            } else notifyError("Couldn\u2019t disconnect.");
          });
        });
      }
      zulipRow.addButton((b) => b.setButtonText(zulipRows.length ? "Connect another\u2026" : "Connect\u2026").onClick(() => new ZulipConnectModal(this.app, this.plugin, () => this.rerender()).open()));
    }
  }
  /**
   * Async: the card says CONNECTED — as whom — or offers Connect…; and when
   * the status call was refused it says THAT. A refused call used to paint
   * "Connect…" over an account that was already syncing (live, 2026-09-03):
   * the reader saw the service rows syncing under a card inviting a connect.
   */
  async renderIntegrationStatus(row, provider, host) {
    const res = provider === "google" ? await this.plugin.backend.googleOAuthStatus().catch(() => null) : await this.plugin.backend.microsoftOAuthStatus().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      row.setDesc(`Couldn't check whether it is connected \u2014 ${why}`);
      row.addButton(
        (b) => b.setButtonText("Retry").onClick(() => {
          row.controlEl.empty();
          row.setDesc(INTEGRATION_CARDS[provider].desc);
          host.empty();
          void this.renderIntegrationStatus(row, provider, host);
        })
      );
      return;
    }
    const connected = res?.data?.connected === true;
    const creds = (res?.data?.credentials ?? []).filter((c) => c.email || c.credential_id);
    const split2 = res?.data?.split_consent === true;
    if (connected) {
      const who = creds.length === 1 ? `as ${creds[0]?.email ?? "one account"}` : `\u2014 ${creds.length} accounts`;
      row.setDesc(
        split2 ? `Connected ${who}. Read-only \u2014 Myu prepares and never sends. Each piece below is its own permission.` : `Connected ${who}. Myu is reading calendar and mail from it.`
      );
      for (const c of creds) {
        if (!c.credential_id) continue;
        const id = c.credential_id;
        const line = new import_obsidian14.Setting(host).setName(c.email ?? id).setDesc(c.is_primary ? "Primary \u2014 meetings and mail are read from this account first." : "");
        if (!c.is_primary) line.addButton((b) => b.setButtonText("Set primary").onClick(async () => {
          const r = provider === "google" ? await this.plugin.backend.googleSetPrimaryCredential(id) : await this.plugin.backend.microsoftSetPrimaryCredential(id);
          if (r.ok && r.data?.success !== false) {
            notifyStatus(r.data?.message || "Primary set.");
            this.rerender();
          } else notifyError(r.data?.error || "Couldn\u2019t set primary.");
        }));
        if (c.services) this.renderServiceRows(host, provider, c.services, split2, c.credential_id);
        line.addButton((b) => {
          let armed = false;
          b.setButtonText("Disconnect").onClick(async () => {
            if (!armed) {
              armed = true;
              b.setButtonText("Disconnect \u2014 sure?").setDestructive();
              return;
            }
            const r = provider === "google" ? await this.plugin.backend.googleOAuthDisconnect(id) : await this.plugin.backend.microsoftOAuthDisconnect(id);
            if (r.ok && r.data?.success !== false) {
              notifyStatus(r.data?.message || "Disconnected.");
              this.rerender();
            } else {
              notifyError(r.data?.error || "Couldn\u2019t disconnect.");
              armed = false;
              b.setButtonText("Disconnect");
            }
          });
        });
      }
      row.addButton((b) => b.setButtonText("Connect another\u2026").onClick(() => void this.startOAuth(provider)));
    } else {
      row.addButton((b) => b.setButtonText("Connect\u2026").onClick(() => void this.startOAuth(provider)));
    }
  }
  renderServiceRows(host, provider, services, split2, credentialId) {
    const rows = [
      ["Calendar", "calendar", "calendar", "Not yet \u2014 who you are meeting, and the homework before each one"],
      ["Mail", "mail", "history", "Not yet \u2014 where you left off with people, what you owe and are owed"],
      [provider === "google" ? "Meeting notes (Drive)" : "Meeting notes", "meeting_notes", "history", "Not yet \u2014 decisions and commitments from your meeting notes, automatically"]
    ];
    let anyNot = false;
    for (const [name, key, scope, notYet] of rows) {
      const svc = services[key];
      const state = svc?.state ?? "not_yet";
      const sub = state === "connected" ? [svc?.last_sync_at ? `synced ${ago(svc.last_sync_at)}` : "connected", key === "calendar" && svc?.events_synced != null ? `${svc.events_synced} events` : "", key === "mail" && svc?.understood_back_to ? `understood back to ${svc.understood_back_to}${svc.still_reading ? " \xB7 still reading" : ""}` : ""].filter(Boolean).join(" \xB7 ") : state === "needs_reconnect" ? "Stopped syncing \u2014 the permission expired" : notYet;
      const r = new import_obsidian14.Setting(host).setName(name).setDesc(sub);
      if (state === "connected" && key === "mail" && credentialId) {
        const current = svc?.oldest_date_limit ?? "";
        r.addDropdown((d) => {
          d.addOption("", "Read everything");
          for (const m of [3, 6, 12, 24]) d.addOption(String(m), `Stop at ${m} months back`);
          d.setValue(current ? String(monthsBack(current)) : "").onChange(async (v) => {
            const ymd = v ? ymdMonthsAgo(Number(v)) : null;
            const res = await this.plugin.backend.setMailOldestDate(provider, credentialId, ymd).catch(() => null);
            if (res?.ok && res.data?.success !== false) notifyStatus(ymd ? `Myu reads mail back to ${ymd}, no further.` : "Myu reads all of it.");
            else notifyError(res?.data?.error || "That did not save. Try again.");
          });
        });
      }
      if (state === "connected") r.addExtraButton((b) => b.setIcon("check").setTooltip("Connected").setDisabled(true));
      else if (state === "needs_reconnect") r.addButton((b) => b.setButtonText("Reconnect").setDestructive().onClick(() => void this.startOAuth(provider, { scopeSet: "all" })));
      else {
        anyNot = true;
        if (split2) r.addButton((b) => b.setButtonText(key === "calendar" ? "Connect calendar" : key === "mail" ? "Connect mail" : "Connect notes").onClick(() => void this.startOAuth(provider, { scopeSet: scope })));
      }
    }
    if (anyNot && split2) new import_obsidian14.Setting(host).setName("Connect everything").setDesc("One consent for calendar, mail and meeting notes.").addButton((b) => b.setButtonText("Connect everything\u2026").onClick(() => void this.startOAuth(provider, { scopeSet: "all" })));
  }
  async startOAuth(provider, opts = {}) {
    const init = provider === "google" ? await this.plugin.backend.googleOAuthInit(opts) : await this.plugin.backend.microsoftOAuthInit(opts);
    const url = init.data?.auth_url;
    if (init.ok && url) window.open(url, "_blank");
    else notifyStatus("Could not start the connect \u2014 check the connection.");
  }
  /** Async section: fetch pending transfer requests, render approve/deny rows. */
  async renderPendingApprovals(root) {
    const host = root.createDiv();
    const res = await this.plugin.backend.getPendingTransfers().catch(() => null);
    const pending = res?.data?.pending_requests ?? [];
    if (pending.length === 0) return;
    for (const request of pending) {
      const row = new import_obsidian14.Setting(host).setName(`\u201C${request.device_name ?? "A device"}\u201D wants to join`).setDesc("Type the 4-digit code shown on that device to let it in \u2014 its own key custody, revocable any time.");
      row.addButton(
        (b) => b.setButtonText("Deny").onClick(async () => {
          await this.plugin.backend.denyDeviceTransfer(request.request_id);
          notifyStatus("Denied.");
          this.rerender();
        })
      );
      row.addButton(
        (b) => b.setButtonText("Approve\u2026").setCta().onClick(() => {
          if (!request.public_key) {
            notifyStatus("This request is from an older app version \u2014 approve it from the web instead.");
            return;
          }
          new ApproveDeviceModal(
            this.app,
            this.plugin,
            request.request_id,
            request.public_key,
            () => this.rerender()
          ).open();
        })
      );
    }
  }
  /**
   * The Myu look: install, turn on/off, update, remove — a CSS snippet in the
   * reader's own config folder, written only when they press the button, and
   * undone from the same row. Bundled with the build (no network), so what
   * this row installs is the look for the plugin they are running.
   */
  async renderLook(host) {
    const installer = this.plugin.lookInstaller();
    const path = installer.path();
    const again = () => {
      host.empty();
      void this.renderLook(host);
    };
    let standing;
    try {
      standing = await installer.standing();
    } catch {
      this.renderLoadFailure(host, "Myu look", "the snippets folder could not be read.", again);
      return;
    }
    const on = installer.isOn();
    const row = new import_obsidian14.Setting(host).setName("Myu look");
    const linkToFile = () => {
      row.descEl.appendText(" ");
      row.descEl.createEl("a", { text: "The file on GitHub", href: MYU_LOOK_URL, attr: { target: "_blank", rel: "noopener" } });
    };
    const install = async () => {
      const r = await installer.install().catch(() => null);
      if (r === "installed") notifyStatus("The Myu look is on. Turn it off or remove it from this row.");
      else if (r === "installed_off") notifyStatus(`Installed at ${path}. Turn it on under Appearance \u2192 CSS snippets.`);
      else notifyError("Could not write the snippet. Check the vault folder is writable.");
      again();
    };
    if (standing.state === "absent") {
      row.setDesc(`Myu\u2019s own look on Myu\u2019s panes only \u2014 cyan and amber, a serif voice. Optional: your theme stays yours. Installs as a CSS snippet at ${path}, yours to edit, turn off, or remove.`);
      linkToFile();
      row.addButton((b) => b.setButtonText("Install the look").setCta().onClick(() => void install()));
      return;
    }
    if (standing.state === "current") {
      row.setDesc(
        on === false ? `Installed from ${standing.version}, off. The file is ${path} \u2014 yours to edit.` : `Installed from ${standing.version}${on ? " and on" : ""}. The file is ${path} \u2014 yours to edit; an edit is kept until you update it here.`
      );
      if (on !== null) row.addButton((b) => b.setButtonText(on ? "Turn off" : "Turn on").onClick(async () => {
        await installer.setOn(!on).catch(() => void 0);
        again();
      }));
      row.addButton(
        (b) => b.setButtonText("Remove").setDestructive().onClick(async () => {
          await installer.remove().catch(() => void 0);
          notifyStatus("The Myu look is gone. Install it again any time.");
          again();
        })
      );
      return;
    }
    row.setDesc(`${standing.version ? `A copy from ${standing.version}` : "A copy Myu did not write"} is at ${path}. Updating replaces it with this build\u2019s look, edits included.`);
    row.addButton(
      (b) => b.setButtonText("Update the look").onClick(
        () => new PersonActionConfirmModal(
          this.app,
          { title: "Replace the installed look?", body: `${path} is replaced with the look for ${this.plugin.manifest.version}. Any edits you made to it are lost \u2014 copy them out first if you want them.`, cta: "Replace it" },
          (yes) => {
            if (yes) void install();
          }
        ).open()
      )
    );
    row.addButton(
      (b) => b.setButtonText("Remove").setDestructive().onClick(
        () => new PersonActionConfirmModal(
          this.app,
          { title: "Remove the look?", body: `${path} is deleted. It may carry edits of yours.`, cta: "Remove it" },
          async (yes) => {
            if (!yes) return;
            await installer.remove().catch(() => void 0);
            notifyStatus("The Myu look is gone.");
            again();
          }
        ).open()
      )
    );
  }
  // ── connection ────────────────────────────────────────────────────────────
  renderConnection(root) {
    const state = this.plugin.unlock.current;
    const status = root.createDiv({ cls: "myu-status" });
    status.createSpan({ cls: "myu-status-label", text: "status" });
    status.createSpan({ cls: "myu-status-value", text: describeState(state, this.plugin.lastStateDetail) });
    const build = root.createDiv({ cls: "myu-status" });
    build.createSpan({ cls: "myu-status-label", text: "build" });
    build.createSpan({ cls: "myu-status-value", text: BUILD_STAMP });
    if (this.plugin.unlock.genesisPending) {
      new import_obsidian14.Setting(root).setName("Finish creating your keys").setDesc("Your account is waiting on the twelve-word step \u2014 two minutes, then everything works.").addButton(
        (b) => b.setButtonText("Finish setup\u2026").setCta().onClick(() => this.plugin.openGenesisCeremony())
      );
    }
    if (state === "unlocked" && this.plugin.onboardingComplete === false) {
      new import_obsidian14.Setting(root).setName("Tell Myu who you are").setDesc(
        "Your notes teach Myu what you did \u2014 not where you are right now. Two minutes: your arc and your current moment. Briefs get sharper the same day."
      ).addButton((b) => b.setButtonText("Start\u2026").setCta().onClick(() => this.plugin.openOnboarding(() => this.rerender())));
    }
    if (state !== "disconnected" && this.plugin.settings.recovery_pending) {
      new import_obsidian14.Setting(root).setName("Add a recovery method").setDesc(
        "Your key lives on this device. Until a recovery method exists, losing it means bringing your vault in again. Twelve words, two minutes, right here \u2014 or a passkey on the web."
      ).addButton(
        (b) => b.setButtonText("Set up recovery phrase\u2026").setCta().onClick(() => new SetupRecoveryModal(this.app, this.plugin, () => this.rerender()).open())
      ).addButton(
        (b) => b.setButtonText("I used the web instead").onClick(async () => {
          this.plugin.settings.recovery_pending = false;
          await this.plugin.saveSettings();
          this.rerender();
        })
      );
    }
    if (state === "unlocked") {
      void this.renderPendingApprovals(root);
    }
    if (state === "unlocked") {
      const googleRow = new import_obsidian14.Setting(root).setName(INTEGRATION_CARDS.google.name).setDesc(INTEGRATION_CARDS.google.desc);
      const googleCreds = root.createDiv();
      const microsoftRow = new import_obsidian14.Setting(root).setName(INTEGRATION_CARDS.microsoft.name).setDesc(INTEGRATION_CARDS.microsoft.desc);
      const microsoftCreds = root.createDiv();
      void this.renderIntegrationStatus(googleRow, "google", googleCreds);
      void this.renderIntegrationStatus(microsoftRow, "microsoft", microsoftCreds);
      const sourcesHost = root.createDiv();
      void this.renderOtherSources(sourcesHost);
    }
    if (state !== "disconnected") {
      new import_obsidian14.Setting(root).setName("Offers in conversation").setDesc("Myu occasionally offers to connect a calendar, mail or notes right in the conversation. Off: it stops asking; everything stays connectable here.").addToggle(
        (t) => t.setValue(this.plugin.onboardingScripts?.offer_all_stopped !== true).onChange(async (v) => {
          const accountId = this.plugin.settings.account_id;
          if (!accountId) return;
          await this.plugin.backend.updateAccountState(accountId, { myuScripts: { offer_all_stopped: !v } }).catch(() => void 0);
          await this.plugin.refreshOnboardingState();
        })
      );
      const consented = this.plugin.settings.background_work_consented;
      new import_obsidian14.Setting(root).setName("Work between visits").setDesc(
        consented === true ? "On \u2014 Myu can keep working on your notes while you are away (compositions, extraction, cards). Turning off stops it immediately." : "Off \u2014 Myu works on your notes only while you are here. Turn on and Myu can prepare things between visits."
      ).addToggle(
        (tg) => tg.setValue(consented === true).onChange(async (v) => {
          const res = await this.plugin.backend.setBackgroundWorkConsent(v);
          if (res.ok) {
            this.plugin.settings.background_work_consented = res.data?.background_work_consented ?? v;
            await this.plugin.saveSettings();
            this.rerender();
          } else {
            notifyStatus("Could not change it \u2014 check the connection.");
            tg.setValue(consented === true);
          }
        })
      );
    }
    if (state === "disconnected") {
      new import_obsidian14.Setting(root).setName("New to Myu?").setDesc("Create your account right here \u2014 no website first. Vault-only start is fine.").addButton(
        (b) => b.setButtonText("Create my account\u2026").setCta().onClick(() => new SignupModal(this.app, this.plugin, () => this.rerender()).open())
      );
      let pasted = "";
      new import_obsidian14.Setting(root).setName("Plugin token").setDesc("Already use Myu? Create a token in askMyu \u2192 settings \u2192 integrations. You will only see it once.").addText((t) => {
        t.setPlaceholder("Paste the token").onChange((v) => {
          pasted = v.trim();
        });
        t.inputEl.type = "password";
        t.inputEl.addClass("myu-token-input");
      }).addButton(
        (b) => b.setButtonText("Connect").setCta().onClick(async () => {
          if (!pasted) return;
          await this.plugin.connect(pasted);
          this.rerender();
        })
      );
      return;
    }
    if (state === "blocked" && !this.plugin.unlock.genesisPending) {
      const inFlight = this.plugin.unlock.approval;
      new import_obsidian14.Setting(root).setName("Approve this device").setDesc(
        inFlight?.status === "pending" ? `Waiting for approval \u2014 enter ${inFlight.code} on a device that is already signed in. It finishes on its own; the Today pane shows the same code.` : "Your notes are encrypted with a key only your devices hold. Approve this one from a device you are already signed in on, or use your recovery phrase."
      ).addButton(
        (b) => b.setButtonText("Approve").setCta().onClick(() => {
          new ApprovalModal(this.app, this.plugin.unlock, () => this.rerender()).open();
        })
      );
    }
    if (state === "relocked") {
      new import_obsidian14.Setting(root).setName("Locked until this device reaches askMyu").setDesc(
        "This vault holds your notes encrypted; the key that opens them is on the server, fetched fresh each time Obsidian starts. Capture is paused until then."
      ).addButton(
        (b) => b.setButtonText("Try now").onClick(async () => {
          await this.plugin.unlock.unlockFromServerKEK();
          this.rerender();
        })
      );
    }
    new import_obsidian14.Setting(root).setName("Disconnect").setDesc("Clears this vault's token and its encrypted key material. Your notes are untouched.").addButton(
      (b) => b.setDestructive().setButtonText("Disconnect").onClick(async () => {
        await this.plugin.unlock.disconnect();
        notifyStatus("askMyu disconnected. Nothing further leaves this vault.");
        this.rerender();
      })
    );
  }
  // ── sharing (the allowlist — consent lives here) ──────────────────────────
  renderSharing(root) {
    const { allowlist_folders, allowlist_tags } = this.plugin.settings;
    const nothingShared = allowlist_folders.length === 0 && allowlist_tags.length === 0;
    if (nothingShared) {
      root.createEl("p", {
        cls: "myu-prose myu-quiet",
        text: "Nothing. No folder or tag is shared, so the vault watcher is not running and no note has been read."
      });
    } else {
      const list2 = root.createDiv({ cls: "myu-list" });
      for (const folder of allowlist_folders) {
        list2.createDiv({ cls: "myu-list-row" }).createSpan({ text: `${folder}/` });
      }
      for (const tag of allowlist_tags) {
        list2.createDiv({ cls: "myu-list-row" }).createSpan({ text: `#${tag}` });
      }
      root.createEl("p", {
        cls: "myu-prose myu-quiet",
        text: "Any note with `myu: false` in its frontmatter is skipped, wherever it lives."
      });
    }
    new import_obsidian14.Setting(root).setName("Choose what to share").setDesc("Pick the folders and tags Myu may read. Nothing outside them is ever opened.").addButton(
      (b) => b.setButtonText(nothingShared ? "Choose folders" : "Change").setCta().onClick(() => {
        new ConsentModal(this.app, this.plugin, () => this.rerender()).open();
      })
    );
  }
  // ── meeting notes (second allowlist — its own consent) ────────────────────
  renderMeetingNotes(root) {
    const folders = this.plugin.settings.meeting_folders;
    root.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: folders.length === 0 ? "Off. No meeting-notes folder is shared; notes can still opt in one at a time with `myu-meeting: true`." : `Sharing: ${folders.map((f) => `${f}/`).join(", ")} \u2014 processed server-side like every meeting source.`
    });
    new import_obsidian14.Setting(root).setName("Choose meeting-notes folders").setDesc("A separate consent from journal capture \u2014 meeting notes are a different kind of data.").addButton(
      (b) => b.setButtonText(folders.length === 0 ? "Choose folders" : "Change").onClick(() => {
        new MeetingConsentModal(this.app, this.plugin, () => this.rerender()).open();
      })
    );
  }
  // ── the one vault write ───────────────────────────────────────────────────
  renderWeeklyReview(root) {
    const enabled = this.plugin.settings.weekly_review_enabled;
    root.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: enabled ? "Myu adds a short section to your weekly note when you ask it to. It is the only thing Myu writes into your vault." : "Off. Myu writes nothing into your vault \u2014 its reads live in panes that close."
    });
    new import_obsidian14.Setting(root).setName("Write a weekly review into my weekly note").setDesc("Movement across your relationships, as counts. Opt-in, and never automatic.").addToggle(
      (t) => t.setValue(enabled).onChange((wanted) => {
        if (!wanted) {
          void (async () => {
            this.plugin.settings.weekly_review_enabled = false;
            await this.plugin.saveSettings();
            this.rerender();
          })();
          return;
        }
        this.plugin.offerWeeklyReview(() => this.rerender());
      })
    );
    if (enabled) {
      new import_obsidian14.Setting(root).setName("Write this week's now").addButton((b) => b.setButtonText("Write it").onClick(() => void this.plugin.writeWeeklyReview()));
    }
  }
  // ── advanced ──────────────────────────────────────────────────────────────
  renderAdvanced(root) {
    new import_obsidian14.Setting(root).setName("Your data").setHeading();
    new import_obsidian14.Setting(root).setName("Export everything into the vault").setDesc("Every surface, every conversation, every canvas that still exists \u2014 as files under Myu/, with a receipt (Myu/Export.md) that says what landed and what did not.").addButton((b) => b.setButtonText("Export now").onClick(() => void this.plugin.exportEverything()));
    new import_obsidian14.Setting(root).setName("Request my data archive").setDesc("Everything the server holds, as one encrypted zip: link by email, passphrase shown once. The part no vault file can carry \u2014 account, devices, keys.").addButton((b) => b.setButtonText("Request\u2026").onClick(() => this.plugin.openDataExport()));
    new import_obsidian14.Setting(root).setName("Remove everything Myu wrote").setDesc("Every page, note, table and canvas Myu wrote goes to the trash (recoverable). Your own notes are untouched. Turn writing off above first if you want it to stay gone.").addButton((b) => b.setButtonText("Remove\u2026").setDestructive().onClick(() => this.plugin.removeEverythingMyuWrote()));
    new import_obsidian14.Setting(root).setName("If you uninstall").setDesc("Everything under Myu/ stays exactly as it is and needs no plugin to open. Notes stop refreshing; nothing breaks. The plugin\u2019s own data.json (your token and wrapped key) goes with it, so no custody is left on this device. Your account is untouched \u2014 delete it above, or on the web.");
    const lookHost = root.createDiv();
    void this.renderLook(lookHost);
    new import_obsidian14.Setting(root).setName("Subscription").setDesc("Billing lives with the payment provider \u2014 one door, on the web.").addButton(
      (b) => b.setButtonText("Manage on the web").onClick(() => {
        window.open(`${this.webOrigin()}/settings/subscription`, "_blank");
      })
    );
    new import_obsidian14.Setting(root).setName("Quiet period before capture").setDesc("Seconds of no editing before a note is sent. Notes are living documents; short values capture half-sentences.").addText(
      (t) => t.setValue(String(this.plugin.settings.quiescence_seconds)).onChange(async (v) => {
        const parsed = Number.parseInt(v, 10);
        if (Number.isFinite(parsed) && parsed >= 10) {
          this.plugin.settings.quiescence_seconds = parsed;
          await this.plugin.saveSettings();
        }
      })
    );
    const queued = this.plugin.settings.queue.length;
    if (queued > 0) {
      new import_obsidian14.Setting(root).setName("Waiting to send").setDesc(`${queued} encrypted ${queued === 1 ? "note is" : "notes are"} queued \u2014 they go out when this device reconnects.`).addButton(
        (b) => b.setButtonText("Send now").onClick(async () => {
          await this.plugin.capture.flushQueue();
          this.rerender();
        })
      );
    }
    const dev = root.createEl("details", { cls: "myu-dev-doors" });
    if (this.plugin.settings.use_mock_backend || this.plugin.settings.base_url !== DEFAULT_SETTINGS.base_url) dev.setAttribute("open", "");
    dev.createEl("summary", { text: "Development" });
    new import_obsidian14.Setting(dev).setName("Backend URL").setDesc("Change only if you are pointing at a development stack.").addText(
      (t) => t.setValue(this.plugin.settings.base_url).setPlaceholder("https://myu.askmyu.com/api").onChange(async (v) => {
        this.plugin.settings.base_url = v.trim();
        await this.plugin.saveSettings();
        this.plugin.transport.setBaseUrl(this.plugin.settings.base_url);
      })
    );
    new import_obsidian14.Setting(dev).setName("Use mock backend").setDesc("Runs against an in-memory stand-in instead of askMyu. For development before the server endpoints land.").addToggle(
      (t) => t.setValue(this.plugin.settings.use_mock_backend).onChange(async (v) => {
        this.plugin.settings.use_mock_backend = v;
        await this.plugin.saveSettings();
        notifyStatus("Reload Obsidian for the backend change to take effect.");
      })
    );
  }
};
function describeState(state, detail) {
  if (detail === "offline") return "waiting for network";
  switch (state) {
    case "unlocked":
      return "connected";
    case "relocked":
      return "locked \u2014 needs the network to reopen";
    case "blocked":
      if (detail === "genesis_pending") return "one step left \u2014 the twelve words";
      if (detail === "genesis_failed") return "key setup didn\u2019t finish \u2014 try again";
      if (detail === "existing_account") return "welcome back \u2014 approve this device or use your phrase";
      return detail === "device_revoked" ? "this device was removed \u2014 approve it again" : "needs approval";
    default:
      return "not connected";
  }
}

// src/views/TodayView.ts
var import_obsidian16 = require("obsidian");

// src/capture/linkSurvey.ts
var LINK_RE = /\[\[([^\]|#^]+)(?:[|#^][^\]]*)?\]\]/g;
function looksLikeAName(target) {
  const t = target.trim();
  if (!t || t.includes("/") || t.length > 60) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t) || /^\d+$/.test(t)) return false;
  if (/^(Myu|Today|Week|Calendar|Commitments|Me)$/i.test(t)) return false;
  return /^[\p{L}][\p{L}\p{M}.'’\- ]*$/u.test(t);
}
function surveyLinks(notes) {
  const seen = /* @__PURE__ */ new Map();
  for (const note of notes) {
    LINK_RE.lastIndex = 0;
    let m;
    const inThisNote = /* @__PURE__ */ new Set();
    while ((m = LINK_RE.exec(note.text)) !== null) {
      const name = m[1].trim();
      if (!looksLikeAName(name) || inThisNote.has(name)) continue;
      inThisNote.add(name);
      const cur = seen.get(name) ?? { name, count: 0, last: 0 };
      cur.count += 1;
      if (note.mtime > cur.last) cur.last = note.mtime;
      seen.set(name, cur);
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || b.last - a.last || a.name.localeCompare(b.name));
}
function surveyLine(people) {
  if (people.length === 0) return null;
  const top = people.slice(0, 3).map((p) => p.name);
  const most = top.length === 1 ? top[0] : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  return `Your links already name ${people.length} ${people.length === 1 ? "person" : "people"}; you write most about ${most}.`;
}
function backfillEstimate(count) {
  const seconds = Math.ceil(count * 0.25);
  if (seconds < 60) return "under a minute";
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
function rangeCutoff(range, now = Date.now()) {
  if (range === "90d") return now - 90 * 24 * 60 * 60 * 1e3;
  if (range === "1y") return now - 365 * 24 * 60 * 60 * 1e3;
  return 0;
}

// src/views/todayReads.ts
function readsFromBundle(res) {
  if (!res?.ok || !res.data) {
    const refused = { ok: false, status: res?.status ?? 0, data: null, error: res?.error ?? "offline" };
    return { brief: refused, events: refused, mirror: null, weekly: null, loop: null, helpQueue: null };
  }
  const b = res.data;
  const part = (name, value) => value ? { ok: true, status: 200, data: value, error: null } : { ok: false, status: 200, data: null, error: b.errors?.[name] ?? "part_missing" };
  const mirror = b.mirror ? part("mirror", b.mirror) : null;
  const weekly = b.weekly ? part("weekly", b.weekly) : null;
  const loop = b.loop ? part("loop", b.loop) : null;
  return {
    brief: part("brief", b.brief),
    events: part("events", b.events),
    mirror,
    weekly,
    loop,
    helpQueue: b.help_queue ? b.help_queue.queue ?? [] : null
  };
}

// src/vault/WeeklyReviewWriter.ts
var import_obsidian15 = require("obsidian");
function isWeeklyEditionFresh(edition, now = /* @__PURE__ */ new Date()) {
  if (!edition.period || !Array.isArray(edition.sections) || edition.sections.length === 0) return false;
  const lastWeek = new Date(now.getTime() - 7 * 864e5);
  return edition.period === isoWeek(now) || edition.period === isoWeek(lastWeek);
}
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function editionToLines(edition) {
  const lines = [];
  for (const section of edition.sections) {
    lines.push(section.line);
    for (const item of section.items ?? []) lines.push(`  - ${item}`);
  }
  return lines;
}
var BEGIN = "<!-- askmyu:begin -->";
var END = "<!-- askmyu:end -->";
var WeeklyReviewWriter = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * Where their weekly note lives, using their own folder and moment format.
   * Returns null when Periodic Notes isn't configured for weeks — in which case
   * we do not guess a location. Inventing `Reviews/2026-W33.md` in someone's
   * vault is precisely the kind of uninvited tidying this audience resents.
   */
  async resolveWeeklyPath(when = /* @__PURE__ */ new Date()) {
    const { weeklyFolder, weeklyFormat } = await readPeriodicConfig(this.app);
    if (!weeklyFolder || !weeklyFormat) return null;
    const momentFn = import_obsidian15.moment;
    const name = momentFn(when).format(weeklyFormat);
    return (0, import_obsidian15.normalizePath)(`${weeklyFolder}/${name}.md`);
  }
  /**
   * Write (or rewrite) the Myu section of this week's note.
   *
   * Creates the note only when their weekly config says where it goes — the same
   * file Periodic Notes would create, in the same place.
   */
  async write(input, when = /* @__PURE__ */ new Date()) {
    if (input.lines.length === 0) return { status: "nothing_to_write" };
    const path = await this.resolveWeeklyPath(when);
    if (!path) return { status: "no_weekly_config" };
    const section = this.renderSection(input);
    try {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof import_obsidian15.TFile) {
        await this.app.vault.process(existing, (contents) => replaceSection(contents, section));
        return { status: "written", path, created: false };
      }
      const folder = path.slice(0, path.lastIndexOf("/"));
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      await this.app.vault.create(path, `${section}
`);
      return { status: "written", path, created: true };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }
  renderSection(input) {
    const body = input.lines.map((line) => `- ${line}`).join("\n");
    return [
      BEGIN,
      `## From Myu \u2014 week of ${input.weekOf}`,
      "",
      body,
      "",
      `*Written by the askMyu plugin because you turned on the weekly review. Everything between these markers is replaced each time it runs; the rest of this note is yours.*`,
      END
    ].join("\n");
  }
};
function replaceSection(contents, section) {
  const begin = contents.indexOf(BEGIN);
  const end = contents.indexOf(END);
  if (begin !== -1 && end !== -1 && end > begin) {
    return contents.slice(0, begin) + section + contents.slice(end + END.length);
  }
  const separator = contents.endsWith("\n") ? "\n" : "\n\n";
  return `${contents}${separator}${section}
`;
}

// src/views/TodayView.ts
function remainingLabel(expiresAt) {
  if (!expiresAt) return "";
  const leftMs = expiresAt - Date.now();
  if (leftMs <= 0) return "This one has expired \u2014 ask that device to try again.";
  const mins = Math.ceil(leftMs / 6e4);
  return `About ${mins} ${mins === 1 ? "minute" : "minutes"} left.`;
}
function whenLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString(void 0, { weekday: "short" })} ${d.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" })}`;
}
function shortDate(ymd) {
  const d = new Date(ymd.length === 10 ? `${ymd}T12:00:00` : ymd);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
var TODAY_VIEW_TYPE = "askmyu-today";
function openTargetFor(item) {
  const refs = item.entity_references ?? [];
  return refs.find((r) => r.entity_type === "person") ?? refs.find((r) => r.entity_type === "company") ?? null;
}
var TodayView = class extends import_obsidian16.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.brief = null;
    /** P4.6: the hero shows 2; the rest render on demand. Reset per refresh. */
    this.briefExpanded = false;
    this.meetings = [];
    /** P8.8 — the rest of the week, day-labeled doors into prep. */
    this.weekAhead = [];
    this.mirror = null;
    this.weekly = null;
    /**
     * Per-observation feedback state, held on the VIEW rather than in render
     * scope: the 5-minute ambient refresh re-renders everything, and a dismissed
     * line coming back from the dead would be worse than no mirror at all.
     * Keyed by observation_id (edition-scoped), so a new edition starts clean.
     */
    this.mirrorFeedback = /* @__PURE__ */ new Map();
    this.mirrorReceiptsOpen = /* @__PURE__ */ new Set();
    this.loading = true;
    /** A refresh has succeeded at least once. Until then "nothing" is not a fact worth stating. */
    this.loadedOnce = false;
    /** The last refresh could not reach Myu — say so, and try again soon rather than in five minutes. */
    this.staleSince = null;
    this.retryTimer = null;
    this.errorState = null;
    // ── render ────────────────────────────────────────────────────────────────
    /** The gate's checkbox, kept across re-renders so a tick survives a refresh. */
    this.termsAgreed = false;
    /** "the week" — the server weekly edition, verbatim, only while fresh. */
    /** Sync, always within reach (operator, 2026-08-29): the button lives at the top of Today, whatever else the day holds. */
    this.giveLine = null;
    this.loop = null;
    this.coupledLoops = [];
    this.loopRated = null;
  }
  getViewType() {
    return TODAY_VIEW_TYPE;
  }
  getDisplayText() {
    return "Myu \u2014 Today";
  }
  getIcon() {
    return "sun";
  }
  async onOpen() {
    this.contentEl.addClass("myu-today");
    await this.refresh();
  }
  async onClose() {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.contentEl.empty();
  }
  /**
   * The six reads — one bundle call when the backend offers it (`today_bundle`),
   * six calls otherwise. The pane cannot tell the difference; the server can.
   */
  async readToday() {
    const start = localDate(/* @__PURE__ */ new Date());
    const end = localDate(addDays(/* @__PURE__ */ new Date(), 7));
    if (this.plugin.backendFlags?.today_bundle) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const reads = readsFromBundle(await this.plugin.backend.getTodayBundle(start, end, tz).catch(() => null));
      if (reads.helpQueue) this.plugin.helpQueue = reads.helpQueue;
      else await this.plugin.loadHelpQueue().catch(() => void 0);
      return reads;
    }
    const [brief, events, mirror, weekly, loop] = await Promise.all([
      this.plugin.backend.getBrief(),
      this.plugin.backend.getCalendarEvents(start, end),
      // The mirror rides along but never decides the view's error state — its
      // absence is a designed condition, not a failure to report.
      this.plugin.backend.getMirrorEdition().catch(() => null),
      this.plugin.backend.getWeeklyReview().catch(() => null),
      // The web's personal-loop strip and its Help Myu queue ride along the same way.
      this.plugin.backend.getPersonalLoop().catch(() => null),
      this.plugin.loadHelpQueue().catch(() => void 0)
    ]);
    return { brief, events, mirror, weekly, loop, helpQueue: null };
  }
  /** Called by the plugin's 5-minute interval and after state changes. */
  async refresh() {
    const state = this.plugin.unlock.current;
    if (state === "disconnected") {
      this.errorState = "disconnected";
      this.loading = false;
      this.render();
      return;
    }
    if (state === "blocked") {
      this.errorState = "blocked";
      this.loading = false;
      this.render();
      return;
    }
    if (state !== "unlocked") {
      this.errorState = "locked";
      this.loading = false;
      this.render();
      return;
    }
    const reads = await this.readToday();
    const { brief: briefRes, events: eventsRes, mirror: mirrorRes, weekly: weeklyRes, loop: loopRes } = reads;
    this.loop = loopRes?.ok ? loopRes.data?.loop ?? null : null;
    this.giveLine = null;
    if (this.plugin.settings.consent_completed && !this.plugin.settings.setup_hidden && (!this.plugin.settings.backfill_done || !this.plugin.settings.materialize_consented)) {
      this.giveLine = surveyLine(await this.plugin.linkSurvey().catch(() => []));
    }
    this.coupledLoops = loopRes?.ok ? loopRes.data?.coupled_loops ?? [] : [];
    if (briefRes.error === "offline" || eventsRes.error === "offline") {
      this.errorState = "offline";
      this.loading = false;
      this.render();
      return;
    }
    if (!briefRes.ok || !eventsRes.ok) {
      this.staleSince = this.staleSince ?? Date.now();
      this.loading = false;
      this.scheduleRetry();
      this.render();
      return;
    }
    this.staleSince = null;
    this.loadedOnce = true;
    this.errorState = null;
    const nextBrief = briefRes.data?.brief ?? null;
    if (nextBrief?.date !== this.brief?.date) this.briefExpanded = false;
    this.brief = nextBrief;
    const weeklyEdition = weeklyRes?.data?.edition ?? null;
    this.weekly = weeklyEdition && isWeeklyEditionFresh(weeklyEdition) ? weeklyEdition : null;
    const edition = mirrorRes?.data?.edition ?? null;
    this.mirror = edition && Array.isArray(edition.observations) && edition.observations.length > 0 ? edition : null;
    const today = localDate(/* @__PURE__ */ new Date());
    const raw = (eventsRes.data?.events ?? []).filter(
      (e) => !e.all_day && e.status !== "cancelled"
    );
    const dated = raw.map((e) => ({ ...e, startDate: parseEventTime(e.start_time) })).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    this.meetings = dated.filter((e) => localDate(e.startDate) === today);
    this.weekAhead = dated.filter((e) => localDate(e.startDate) > today);
    this.loading = false;
    this.render();
  }
  /**
   * A refresh that could not reach Myu retries in seconds, not on the ambient
   * five-minute tick — the pane must not sit on a wrong picture that long.
   */
  scheduleRetry() {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, 15e3);
  }
  render() {
    const root = this.contentEl;
    root.empty();
    if (this.loading) {
      root.createEl("p", { cls: "myu-quiet myu-thinking", text: "Opening your day" });
      return;
    }
    if (this.errorState) {
      this.renderResting(root);
      return;
    }
    if (this.plugin.termsStanding() === "gated") {
      this.renderTermsGate(root);
      return;
    }
    this.renderSyncBar(root);
    if (this.plugin.termsUpdateVisible()) this.renderTermsUpdate(root);
    this.renderDeviceRequests(root);
    this.renderSetup(root);
    this.renderMaterializeProgress(root);
    this.renderCues(root);
    this.renderInsights(root);
    this.renderOffers(root);
    this.renderHelpMyu(root);
    this.renderWeekEdition(root);
    this.renderLoop(root);
    this.renderBrief(root);
    this.renderNext(root);
    this.renderWeek(root);
    this.renderMonthlyPointer(root);
    this.renderMirror(root);
    this.renderChatDoor(root);
  }
  /**
   * "Before you start": the one screen a gated account sees. The documents
   * are links out (the exempt kind — settings/onboarding, not content), the
   * sentence is the agreement's own, and Continue is the only way forward
   * short of signing out.
   */
  renderTermsGate(root) {
    const zone = root.createDiv({ cls: "myu-zone myu-terms-gate" });
    zone.createEl("h3", { text: "Before you start" });
    zone.createEl("p", {
      cls: "myu-prose",
      text: "The beta needs one thing first: your agreement to the beta participation terms and the privacy policy. Read them, then tick the box."
    });
    this.renderTermsLinks(zone);
    const label = zone.createEl("label", { cls: "myu-terms-label" });
    const box = label.createEl("input", { cls: "myu-terms-box", attr: { type: "checkbox", "aria-label": "I agree to the beta participation terms and the privacy policy" } });
    box.checked = this.termsAgreed;
    label.createSpan({ cls: "myu-terms-sentence", text: "I agree to the beta participation terms and the privacy policy." });
    const actions = zone.createDiv({ cls: "myu-mirror-actions" });
    const go = actions.createEl("button", { cls: "myu-affordance myu-cta", text: "Continue" });
    go.disabled = !this.termsAgreed;
    box.onchange = () => {
      this.termsAgreed = box.checked;
      go.disabled = !this.termsAgreed;
    };
    go.onclick = async () => {
      go.disabled = true;
      go.textContent = "Recording\u2026";
      const ok2 = await this.plugin.acceptTerms();
      if (!ok2) {
        go.disabled = false;
        go.textContent = "Continue";
      }
    };
    const out = actions.createEl("button", { cls: "myu-affordance", text: "Sign out" });
    out.onclick = () => void this.plugin.unlock.disconnect();
  }
  /**
   * "We've updated the terms": a later version, a row, never a lockout
   * (decision 7). Accept writes the new rows; Not now hides it for the session.
   */
  renderTermsUpdate(root) {
    const zone = root.createDiv({ cls: "myu-zone myu-terms-update" });
    zone.createEl("h3", { text: "We\u2019ve updated the terms" });
    zone.createEl("p", { cls: "myu-prose", text: `The beta participation terms or the privacy policy changed (version ${this.plugin.terms?.currentVersion ?? ""}). You can keep working on the version you agreed to; accepting the new one takes a moment.` });
    this.renderTermsLinks(zone);
    const actions = zone.createDiv({ cls: "myu-mirror-actions" });
    const accept = actions.createEl("button", { cls: "myu-affordance myu-cta", text: "I agree to the updated terms" });
    accept.onclick = async () => {
      accept.disabled = true;
      const ok2 = await this.plugin.acceptTerms();
      if (!ok2) accept.disabled = false;
    };
    const later = actions.createEl("button", { cls: "myu-affordance", text: "Not now" });
    later.onclick = () => this.plugin.dismissTermsUpdate();
  }
  renderTermsLinks(zone) {
    const links = zone.createDiv({ cls: "myu-terms-links" });
    for (const link of this.plugin.termsLinkTargets()) {
      links.createEl("a", { cls: "myu-affordance", text: `Read the ${link.label} \u2197`, href: link.url, attr: { target: "_blank", rel: "noopener" } });
    }
  }
  /**
   * Another device asking to join — the ONE thing that must never be missed.
   * A transient Notice is not enough (the app may be closed, the stream down,
   * the toast dismissed), so the request lives here until it is answered or
   * expires. Requests are server-side ~5 minutes; the row says so.
   */
  renderDeviceRequests(root) {
    const requests = this.plugin.pendingTransfers;
    if (!requests.length) return;
    for (const request of requests) {
      const zone = root.createDiv({ cls: "myu-zone myu-device-request" });
      zone.createDiv({ cls: "myu-whisper", text: "a device wants in" });
      zone.createDiv({ cls: "myu-claim", text: `\u201C${request.device_name || "A new device"}\u201D wants to join your account` });
      const left = remainingLabel(request.expires_at);
      zone.createDiv({ cls: "myu-quiet", text: left ? `Type the 4-digit code it shows. ${left}` : "Type the 4-digit code it shows." });
      const actions = zone.createDiv({ cls: "myu-canvas-actions" });
      const approve = actions.createEl("button", { cls: "myu-affordance myu-cta", text: "Approve\u2026" });
      approve.onclick = () => {
        if (!request.public_key) {
          this.plugin.openSettings();
          return;
        }
        new ApproveDeviceModal(this.app, this.plugin, request.request_id, request.public_key, () => void this.plugin.refreshPendingTransfers()).open();
      };
      const deny = actions.createEl("button", { cls: "myu-affordance", text: "Deny" });
      deny.onclick = async () => {
        deny.disabled = true;
        await this.plugin.backend.denyDeviceTransfer(request.request_id).catch(() => void 0);
        await this.plugin.refreshPendingTransfers();
      };
    }
  }
  /** One line pointing at the Help Myu tab — the queue itself lives in its own sidebar tab, not here. */
  renderHelpMyu(root) {
    const n = this.plugin.helpQueue.length;
    if (n === 0) return;
    const row = root.createEl("button", { cls: "myu-row myu-row-tappable", attr: { "aria-label": "People Myu needs help placing" } });
    row.createSpan({ cls: "myu-row-title", text: `${n} ${n === 1 ? "person needs" : "people need"} your help placing them` });
    const chev = row.createSpan({ cls: "myu-affordance-inline myu-chevron" });
    (0, import_obsidian16.setIcon)(chev, "chevron-right");
    row.onclick = () => void this.plugin.openHelpMyu();
  }
  /**
   * "This week" — the day-one edition (cold start, slice 5): the web's
   * WeekEdition, in the pane. Stats line, the ONE finite bar while the first
   * minutes run, the watermark during the long tail, silence at steady; a row
   * per meeting with its facts and two doors (prep, capture after).
   */
  renderWeekEdition(root) {
    const section = (this.brief?.sections ?? []).find((s2) => s2.section === "week" && s2.visible && (s2.items?.length ?? 0) > 0);
    const progress = this.brief?.progress ?? null;
    if (!section && !progress) return;
    const zone = root.createDiv({ cls: "myu-zone myu-week" });
    zone.createDiv({ cls: "myu-whisper", text: "this week" });
    if (progress) {
      const stats = [
        progress.meetings_this_week != null ? `${progress.meetings_this_week} ${progress.meetings_this_week === 1 ? "meeting" : "meetings"}` : "",
        progress.first_timers ? `${progress.first_timers} ${progress.first_timers === 1 ? "person" : "people"} you haven\u2019t met` : "",
        progress.external ? `${progress.external} external` : ""
      ].filter(Boolean).join(" \xB7 ");
      if (stats) zone.createDiv({ cls: "myu-quiet", text: stats });
      if (progress.stage === "first_minutes" && (progress.people_total ?? 0) > 0) {
        const read = progress.people_read ?? 0;
        const total = progress.people_total ?? 0;
        const bar = zone.createDiv({ cls: "myu-progress", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(read), "aria-label": "Reading your week" } });
        bar.createDiv({ cls: "myu-progress-fill" }).style.width = `${Math.min(100, Math.round(read / total * 100))}%`;
        zone.createDiv({ cls: "myu-quiet", text: `Reading your week \u2014 ${read} of ${total} people` });
      } else if (progress.stage === "long_tail" && progress.mail_understood_back_to) {
        zone.createDiv({ cls: "myu-quiet", text: `Mail understood back to ${shortDate(progress.mail_understood_back_to)} \xB7 still reading` });
      }
    }
    for (const item of section?.items ?? []) {
      if (item.type === "week_more") {
        zone.createDiv({ cls: "myu-quiet", text: item.text ?? "" });
        continue;
      }
      const row = zone.createDiv({ cls: `myu-week-row${item.meta?.external ? " myu-week-external" : ""}` });
      const when = item.meta?.when ? whenLabel(item.meta.when) : "";
      const head = row.createDiv({ cls: "myu-row" });
      if (when) head.createSpan({ cls: "myu-time", text: when });
      head.createSpan({ cls: "myu-row-title", text: item.text ?? "" });
      const facts = item.meta?.facts;
      const lines = [facts?.role_line, facts?.why_meeting ? `Why: ${facts.why_meeting}` : "", facts?.mutual_ties?.length ? `You both know ${facts.mutual_ties.join(", ")}` : "", ...(facts?.public_context ?? []).slice(0, 2)].filter((x) => !!x);
      for (const l of lines) row.createDiv({ cls: "myu-quiet", text: l });
      if (item.meta?.cold) row.createDiv({ cls: "myu-quiet", text: item.meta.first_time ? "First meeting \u2014 facts only, worth capturing how it lands." : "No history here yet \u2014 Myu starts learning this one afterwards." });
      const actions = row.createDiv({ cls: "myu-canvas-actions" });
      const eventId = item.actions?.find((a) => a.action_type === "prep")?.target_id || item.meta?.event_id;
      if (eventId) {
        const prep = actions.createEl("button", { cls: "myu-affordance myu-cta", text: "Prep" });
        prep.onclick = () => void this.plugin.openPrep(eventId);
      }
      if (item.actions?.some((a) => a.action_type === "capture_after")) {
        const name = item.entity_references?.[0]?.display_name ?? "them";
        const cap = actions.createEl("button", { cls: "myu-affordance", text: "Capture after" });
        cap.onclick = () => void this.plugin.openChat({ text: `After the meeting with ${name}: `, send: false });
      }
    }
  }
  /** Canvases Myu prepared while you were elsewhere — the web's pending-offers strip. Open, or let go. */
  renderOffers(root) {
    const offers = this.plugin.pendingOffers;
    if (offers.length === 0) return;
    const zone = root.createDiv({ cls: "myu-zone myu-offers" });
    zone.createDiv({ cls: "myu-whisper", text: "myu prepared" });
    for (const offer of offers) {
      const row = zone.createDiv({ cls: "myu-offer-row" });
      row.createSpan({ cls: "myu-claim", text: (offer.summaryText || "A canvas") + (offer.subjectName ? ` \u2014 ${offer.subjectName}` : "") });
      const open = row.createEl("button", { cls: "myu-affordance", text: offer.actionLabel });
      open.onclick = () => void this.plugin.openOffer(offer.compositionId);
      const drop = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Let this canvas go" } });
      (0, import_obsidian16.setIcon)(drop, "x");
      drop.onclick = () => this.plugin.dismissOffer(offer.compositionId);
    }
  }
  /**
   * The first run, the Obsidian way:
   * a checklist in the pane — one row per decision, each opening its dialog
   * only when pressed, ticking off, gone when done. Nothing opens itself.
   * Order = give before take: the folder (what Myu gives) leads as soon as
   * there is something to put in it; then what Myu may read; then the
   * preview-and-start of history; meeting notes; identity last, optional.
   */
  renderSetup(root) {
    const s2 = this.plugin.settings;
    if (s2.setup_hidden) return;
    const rows = this.setupRows();
    if (rows.length === 0) return;
    const zone = root.createDiv({ cls: "myu-zone myu-setup" });
    zone.createDiv({ cls: "myu-whisper", text: "setting up" });
    for (const r of rows) {
      const row = zone.createDiv({ cls: "myu-setup-row" });
      row.createDiv({ cls: "myu-claim", text: r.title });
      row.createDiv({ cls: "myu-quiet", text: r.why });
      const actions = row.createDiv({ cls: "myu-canvas-actions" });
      const go = actions.createEl("button", { cls: `myu-affordance${r.primary ? " myu-cta" : ""}`, text: r.button });
      go.onclick = () => r.open();
    }
    if (this.giveLine) zone.createEl("p", { cls: "myu-voice", text: this.giveLine });
    const hide = zone.createEl("button", { cls: "myu-affordance myu-link-button", text: "Hide setup \u2014 every door stays in settings" });
    hide.onclick = () => {
      s2.setup_hidden = true;
      void this.plugin.saveSettings();
      this.render();
    };
  }
  setupRows() {
    const s2 = this.plugin.settings;
    const p = this.plugin;
    const rows = [];
    const refresh = () => void this.refresh();
    if (!s2.materialize_consented && (this.brief || s2.consent_completed)) {
      rows.push({ title: "Keep what Myu knows in your vault", why: "One folder, Myu/, renameable: people and companies, your journal by day, meetings, today, commitments as checkboxes, every canvas you keep. Your own notes are never edited.", button: "Let Myu write\u2026", primary: true, open: () => p.offerResidencyThen(refresh) });
    }
    if (!s2.consent_completed) {
      rows.push({ title: "Choose what Myu may read", why: "Nothing is read until you choose. Only the folders you choose leave this device, encrypted with a key that stays here.", button: "Choose folders\u2026", primary: !rows.length, open: () => new ConsentModal(this.app, p, refresh).open() });
    }
    if (s2.consent_completed && !s2.backfill_done) {
      const { files, oldest } = p.capture.surveyBackfill();
      if (files.length > 0) {
        const months = oldest ? Math.max(1, Math.round((Date.now() - oldest) / (1e3 * 60 * 60 * 24 * 30))) : 0;
        rows.push({ title: "Bring in what you have already written", why: `${files.length} ${files.length === 1 ? "note" : "notes"} in the folders you shared${months ? `, going back ${months >= 12 ? `${Math.round(months / 12)} ${Math.round(months / 12) === 1 ? "year" : "years"}` : `${months} ${months === 1 ? "month" : "months"}`}` : ""}. Preview first; nothing leaves until you press Start.`, button: "Preview\u2026", open: () => p.offerBackfill() });
      } else if (!s2.backfill_done) {
        s2.backfill_done = true;
        void p.saveSettings();
      }
    }
    if (s2.consent_completed && s2.meeting_folders.length === 0 && !s2.meeting_consent_offered) {
      rows.push({ title: "Share meeting notes", why: "A separate choice: meeting notes are processed on the server like every meeting source, not end-to-end encrypted like your journal.", button: "Choose\u2026", open: () => new MeetingConsentModal(this.app, p, refresh).open() });
    }
    if (p.onboardingComplete === false) {
      rows.push({ title: "Tell Myu who you are", why: "Optional. Used to name you and your role in briefs; kept with your encrypted account data only.", button: "Tell Myu\u2026", open: () => p.openOnboarding(refresh) });
    }
    return rows;
  }
  /** Today is Myu's front door — talking to Myu must be reachable FROM it. */
  renderChatDoor(root) {
    const door = root.createEl("button", { cls: "myu-affordance", text: "Talk to Myu" });
    door.onclick = () => void this.plugin.openChat({ text: "", send: false });
  }
  /**
   * Locked / offline / disconnected. Named plainly, with the one action that
   * fixes each — a spinner that never resolves is how a plugin earns a bug
   * report about the wrong thing.
   */
  renderResting(root) {
    if (this.errorState === "blocked") {
      this.renderBlocked(root);
      return;
    }
    const messages = {
      disconnected: "Not connected yet. Create an account, or sign in to the one you already have.",
      locked: "Locked. Myu reopens your notes when this device reaches the server.",
      offline: "No connection right now. Capture is paused and will catch up."
    };
    root.createEl("p", { cls: "myu-prose myu-quiet", text: messages[this.errorState ?? "locked"] });
    if (this.errorState === "disconnected") {
      const doors = root.createDiv({ cls: "myu-door-stack" });
      const signup = doors.createEl("button", { cls: "myu-door-primary", text: "Create my account\u2026" });
      signup.onclick = () => new SignupModal(this.app, this.plugin, () => void this.refresh()).open();
      const alt = doors.createDiv({ cls: "myu-door-alt" });
      alt.createSpan({ cls: "myu-quiet", text: "Already use Myu?" });
      const signin = alt.createEl("button", { cls: "myu-affordance", text: "Sign in" });
      signin.onclick = () => new SignupModal(this.app, this.plugin, () => void this.refresh(), "signin").open();
    }
    if (this.errorState === "locked" || this.errorState === "offline") {
      const retry = root.createEl("button", { cls: "myu-affordance", text: "Try now" });
      retry.onclick = async () => {
        await this.plugin.unlock.unlockFromServerKEK();
        await this.refresh();
      };
    }
  }
  /**
   * Signed in, not yet trusted with the key. This used to fall into the
   * "Locked — try now" copy, which is for a device that HAS custody and is
   * merely offline; a person who clicked the emailed link in a browser came
   * back to a pane with no way forward (operator, 2026-09-03: "someone can
   * flip between interfaces and end up losing the flow"). The approval lives
   * on the machine now, so this pane shows it and drives it — the code, the
   * wait, the retry, the phrase — with no dialog to lose.
   */
  renderBlocked(root) {
    const unlock = this.plugin.unlock;
    const detail = this.plugin.lastStateDetail;
    const again = () => void this.refresh();
    if (unlock.genesisPending || detail === "genesis_pending" || detail === "genesis_failed") {
      root.createEl("p", {
        cls: "myu-prose",
        text: detail === "genesis_failed" ? "Key setup did not finish. Two minutes to try again: the twelve words, then everything works." : "One step left: your twelve words. Two minutes, then everything works."
      });
      const finish = root.createEl("button", { cls: "myu-door-primary", text: "Finish setup\u2026" });
      finish.onclick = () => this.plugin.openGenesisCeremony();
      return;
    }
    if (detail === "token_revoked") {
      root.createEl("p", { cls: "myu-prose", text: "This device was signed out on the server. Sign in again to continue." });
      const signin = root.createEl("button", { cls: "myu-door-primary", text: "Sign in" });
      signin.onclick = () => new SignupModal(this.app, this.plugin, again, "signin").open();
      return;
    }
    const approval = unlock.approval;
    const phraseDoor = (host, label) => {
      const b = host.createEl("button", { cls: "myu-affordance", text: label });
      b.onclick = () => new ApprovalModal(this.app, unlock, again, "phrase").open();
    };
    if (approval?.status === "pending") {
      root.createEl("p", { cls: "myu-prose", text: "Waiting for your approval. In Myu on your phone or the web app, approve this device and enter:" });
      root.createDiv({ cls: "myu-code", text: approval.code });
      root.createEl("p", { cls: "myu-prose myu-quiet", text: "It finishes on its own: go approve it and come back. The code is good for a few minutes." });
      const actions = root.createDiv({ cls: "myu-door-stack" });
      phraseDoor(actions, "Use my recovery phrase instead");
      const cancel = actions.createEl("button", { cls: "myu-affordance", text: "Cancel" });
      cancel.onclick = () => {
        unlock.cancelApproval();
        again();
      };
      return;
    }
    root.createEl("p", {
      cls: "myu-prose",
      text: detail === "device_revoked" ? "This device was removed from your account. Approve it again to continue." : detail === "key_mismatch" ? "This device\u2019s key no longer matches your account. Approve it again to continue." : "You are signed in, but this device is not approved yet. Your notes are encrypted with a key only your approved devices hold."
    });
    if (approval) {
      root.createEl("p", {
        cls: "myu-prose myu-warn",
        text: approval.status === "failed" ? approvalFailureText(approval.failure) : approval.status === "denied" ? "That request was declined on the other device." : "The request timed out."
      });
    }
    const doors = root.createDiv({ cls: "myu-door-stack" });
    const go = doors.createEl("button", { cls: "myu-door-primary", text: approval ? "Try again" : "Get this device approved\u2026" });
    go.onclick = async () => {
      go.disabled = true;
      const pending = await unlock.beginApproval();
      if (!pending) notifyError("Could not start the approval. Check the connection and try again.");
      again();
    };
    const alt = doors.createDiv({ cls: "myu-door-alt" });
    alt.createSpan({ cls: "myu-quiet", text: "No other device handy?" });
    phraseDoor(alt, "Use my recovery phrase");
    const out = root.createDiv({ cls: "myu-door-alt" });
    out.createSpan({ cls: "myu-quiet", text: "Not you?" });
    const signout = out.createEl("button", { cls: "myu-affordance", text: "Sign out" });
    signout.onclick = async () => {
      await unlock.disconnect();
      again();
    };
  }
  /**
   * P8 first-run choreography — the folder visibly filling ("6 of 38 · Jim's
   * file just appeared"). Declared progress beats a silent partial folder,
   * which reads as broken (§First-run, regime 3 applied to day one).
   */
  renderMaterializeProgress(root) {
    const line = this.plugin.materializeProgress;
    if (!line) return;
    const row = root.createDiv({ cls: "myu-cue-row myu-materialize-progress" });
    row.createSpan({ cls: "myu-quiet", text: line });
  }
  /**
   * The progress line moved: repaint THAT ROW, nothing else, no fetch. A row
   * that does not exist yet (the sweep just started) means one local render;
   * a line that went away means the row goes. (Every line used to be a full
   * refresh — six backend calls — 2026-09-03.)
   */
  paintProgress() {
    const line = this.plugin.materializeProgress;
    const row = this.contentEl.querySelector(".myu-materialize-progress");
    if (line && row) {
      const span = row.querySelector("span");
      if (span) span.textContent = line;
      return;
    }
    if (!line && row) {
      row.remove();
      return;
    }
    if (line && !row && !this.loading && !this.errorState) this.render();
  }
  /**
   * Cue rows — the toast's vault analogue, ambient by construction. Two
   * sources merged: SSE-pushed cues (arrive the moment dispatch delivers) and
   * the client-derived pair as belt-and-suspenders when the stream is down —
   * T-15 before a meeting, and just-ended. All are pane content; none are
   * popups (invariant 4).
   */
  renderCues(root) {
    const now = Date.now();
    const rows = [];
    for (const cue of this.plugin.liveCues) {
      rows.push({ text: cue.text, eventId: cue.event_id });
    }
    for (const meeting of this.meetings) {
      const start = meeting.startDate.getTime();
      const title = meeting.summary || "Meeting";
      if (start - now > 0 && start - now < 15 * 60 * 1e3) {
        rows.push({ text: `prep ready \u2014 ${title}`, eventId: meeting.event_id });
      } else if (now - start > 5 * 60 * 1e3 && now - start < 90 * 60 * 1e3) {
        rows.push({ text: `your read on ${title}?`, eventId: meeting.event_id });
      }
    }
    if (rows.length === 0) return;
    const seen = /* @__PURE__ */ new Set();
    const zone = root.createDiv({ cls: "myu-cues" });
    for (const row of rows.slice(0, 3)) {
      if (seen.has(row.text)) continue;
      seen.add(row.text);
      const el = zone.createEl("button", { cls: "myu-cue-row" });
      el.createSpan({ cls: "myu-claim", text: row.text });
      if (row.eventId) {
        const eventId = row.eventId;
        (0, import_obsidian16.setIcon)(el.createSpan({ cls: "myu-affordance-inline myu-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
        el.addClass("myu-row-tappable");
        el.onclick = () => void this.plugin.openPrep(eventId);
      }
    }
  }
  renderBrief(root) {
    const all = (this.brief?.sections ?? []).filter((s2) => s2.visible && s2.section !== "week").flatMap((s2) => s2.items ?? []);
    const items = this.briefExpanded ? all : all.slice(0, 2);
    const held = all.length - 2;
    if (items.length === 0) {
      root.createEl("p", {
        cls: "myu-quiet",
        text: this.loadedOnce ? "Nothing pressing this morning." : "Still reading your day\u2026"
      });
    }
    for (const item of items) {
      const row = root.createDiv({ cls: "myu-hero" });
      row.createDiv({ cls: "myu-whisper", text: "noticing" });
      row.createDiv({ cls: "myu-voice", text: item.text ?? "" });
      const ref = openTargetFor(item);
      if (!ref) continue;
      const open = row.createEl("button", { cls: "myu-affordance", text: "Open" });
      open.onclick = () => void this.plugin.openCard(
        ref.entity_type === "company" ? "company" : "person",
        ref.entity_id,
        ref.display_name
      );
    }
    if (!this.briefExpanded && held > 0) {
      const more = root.createEl("button", { cls: "myu-affordance", text: `+${held} more` });
      more.onclick = () => {
        this.briefExpanded = true;
        this.render();
      };
    }
    const suppressed = this.brief?.suppressed_count ?? 0;
    if (suppressed > 0) {
      root.createEl("p", {
        cls: "myu-quiet",
        text: suppressed === 1 ? "1 lower-confidence item held back" : `${suppressed} lower-confidence items held back`
      });
    }
  }
  /**
   * P4.4 — a quiet catch-up row when this month's mirror edition hasn't been
   * looked at yet. The email remains the OWNED pointer; this is the pane
   * catching you up, once, and then never again for that period.
   */
  renderMonthlyPointer(root) {
    const edition = this.mirror;
    if (!edition) return;
    const now = /* @__PURE__ */ new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (edition.period !== currentPeriod) return;
    if (this.plugin.settings.monthly_seen[edition.period]) return;
    const row = root.createEl("button", { cls: "myu-cue-row myu-row-tappable" });
    row.createSpan({ cls: "myu-claim", text: "your monthly review is ready" });
    (0, import_obsidian16.setIcon)(row.createSpan({ cls: "myu-affordance-inline myu-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
    row.onclick = () => {
      this.plugin.settings.monthly_seen[edition.period] = true;
      void this.plugin.saveSettings();
      this.render();
      this.contentEl.querySelector(".myu-mirror")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
  /**
   * The web's PersonalLoopStrip: Myu's one-sentence read of you, what it is
   * coupled to, and rate-the-read (feedback/signal). A whisper zone, not a card.
   */
  renderLoop(root) {
    const loop = this.loop;
    if (!loop?.statement) return;
    const zone = root.createDiv({ cls: "myu-zone myu-loop" });
    zone.createDiv({ cls: "myu-whisper", text: `the loop${loop.domain ? ` \xB7 ${loop.domain}` : ""}` });
    zone.createDiv({ cls: "myu-voice", text: loop.statement });
    for (const c of this.coupledLoops) {
      if (!c.other_statement) continue;
      const row = zone.createDiv({ cls: "myu-row" });
      row.createSpan({ cls: "myu-time", text: c.type ?? "with" });
      row.createSpan({ cls: "myu-row-title", text: c.other_statement });
    }
    const rate = zone.createDiv({ cls: "myu-chat-rating" });
    if (this.loopRated) {
      rate.createSpan({ cls: "myu-whisper", text: this.loopRated === 1 ? "good read \u2014 noted" : "off the mark \u2014 noted" });
      return;
    }
    for (const [rating, icon, label] of [[1, "thumbs-up", "Good read"], [-1, "thumbs-down", "Off the mark"]]) {
      const b = rate.createEl("button", { cls: "myu-affordance myu-icon-button myu-rating-btn", attr: { "aria-label": `${label} \u2014 rate this read` } });
      (0, import_obsidian16.setIcon)(b, icon);
      b.onclick = () => {
        this.loopRated = rating;
        this.render();
        void this.plugin.backend.submitFeedbackSignal({ subject_type: "personal_loop", subject_id: loop.loop_id, rating, subject_text: loop.statement, surface: "personal_loop_strip", context: { loop_state: loop.state, loop_confidence: loop.confidence, loop_domain: loop.domain } }).catch(() => void 0);
      };
    }
  }
  /** insight_ready, as rows — the web's insight card lives in a side panel; cards stay in Today here (invariant 4). */
  renderInsights(root) {
    const items = this.plugin.liveInsights;
    if (items.length === 0) return;
    const zone = root.createDiv({ cls: "myu-zone myu-insights" });
    zone.createDiv({ cls: "myu-whisper", text: "noticed just now" });
    for (const it of items) {
      const row = zone.createDiv({ cls: "myu-offer-row" });
      row.createSpan({ cls: "myu-claim", text: it.summary ? `${it.title} \u2014 ${it.summary}` : it.title });
      if (it.personId) {
        const open = row.createEl("button", { cls: "myu-affordance", text: it.personName || "Open" });
        open.onclick = () => void this.plugin.openCard("person", it.personId, it.personName || "Person");
      }
      const drop = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Dismiss" } });
      (0, import_obsidian16.setIcon)(drop, "x");
      drop.onclick = () => {
        this.plugin.liveInsights = this.plugin.liveInsights.filter((x) => x !== it);
        this.render();
      };
    }
  }
  renderSyncBar(root) {
    if (this.staleSince) {
      const mins = Math.max(1, Math.round((Date.now() - this.staleSince) / 6e4));
      root.createDiv({ cls: "myu-quiet", text: `Couldn\u2019t reach Myu ${mins === 1 ? "a minute" : `${mins} minutes`} ago \u2014 showing what was here, trying again.` });
    }
    const bar = root.createDiv({ cls: "myu-sync-bar" });
    const sync = bar.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Sync everything from Myu now" } });
    (0, import_obsidian16.setIcon)(sync, "refresh-cw");
    sync.onclick = () => {
      sync.disabled = true;
      void this.plugin.syncNow().finally(() => {
        sync.disabled = false;
        void this.refresh();
      });
    };
    const at = this.plugin.lastSyncAt;
    if (at) bar.createSpan({ cls: "myu-whisper", text: `synced ${Math.max(0, Math.round((Date.now() - at) / 6e4))} min ago` });
    const mode = bar.createEl("button", { cls: "myu-affordance myu-link-button", text: this.plugin.settings.sync_on_open ? "syncs when the vault opens \xB7 change" : "sync on open is off \xB7 change", attr: { "aria-label": "Change whether Myu syncs when the vault opens (opens settings)" } });
    mode.onclick = () => this.plugin.openSettingsAt("Sync when the vault opens");
  }
  renderWeek(root) {
    if (!this.weekly || this.weekly.sections.length === 0) return;
    const zone = root.createDiv({ cls: "myu-zone" });
    zone.createDiv({ cls: "myu-whisper", text: "the week" });
    for (const section of this.weekly.sections) {
      zone.createDiv({ cls: "myu-claim myu-week-line", text: section.line });
      for (const item of section.items ?? []) {
        zone.createDiv({ cls: "myu-quiet myu-week-item", text: item });
      }
    }
  }
  /**
   * The mirror (A11, two-layer) — "noticed this month". Last: the day first,
   * the meetings, then the self. Same register rules as web/mobile:
   * render verbatim, absence renders nothing (zone chrome included), serif =
   * Myu's voice, `wrong` is one tap with an optional refine row, the map
   * layer offers `doesn't fit`, receipts sit behind `why`. Dismissed
   * lines collapse to a quiet "noted." rather than vanishing mid-read.
   * Nothing here calls `Notice` (invariant 4) — the mirror pane IS the channel.
   */
  renderMirror(root) {
    if (!this.mirror) return;
    const zone = root.createDiv({ cls: "myu-zone myu-mirror" });
    zone.createDiv({ cls: "myu-whisper", text: "noticed this month" });
    zone.createEl("p", { cls: "myu-quiet myu-mirror-caveat", text: "Patterns, not verdicts \u2014 each may be wrong" });
    for (const obs of this.mirror.observations) {
      this.renderMirrorObservation(zone, obs);
    }
  }
  renderMirrorObservation(zone, obs) {
    const box = zone.createDiv({ cls: "myu-mirror-obs" });
    const state = this.mirrorFeedback.get(obs.observation_id) ?? "idle";
    if (state === "done") {
      box.createEl("p", { cls: "myu-quiet", text: "Noted." });
      return;
    }
    const line = box.createDiv({ cls: "myu-voice myu-mirror-voice", text: obs.text });
    if (obs.forming) line.createSpan({ cls: "myu-mirror-forming", text: "  forming" });
    const isMap = obs.layer === "map";
    const actions = box.createDiv({ cls: "myu-mirror-actions" });
    const talk = actions.createEl("button", { cls: "myu-mirror-ctl", text: "Talk about this" });
    talk.onclick = () => void this.plugin.openChat({
      text: "",
      send: false,
      context: {
        source: "mirror",
        source_id: obs.observation_id,
        entity_references: []
      }
    });
    if (obs.receipts && obs.receipts.length > 0) {
      const why = actions.createEl("button", { cls: "myu-mirror-ctl", text: "Why" });
      why.onclick = () => {
        if (this.mirrorReceiptsOpen.has(obs.observation_id)) this.mirrorReceiptsOpen.delete(obs.observation_id);
        else this.mirrorReceiptsOpen.add(obs.observation_id);
        this.render();
      };
    }
    if (state === "idle" && isMap && !obs.confirmed) {
      const fits = actions.createEl("button", { cls: "myu-mirror-ctl", text: "That fits" });
      fits.onclick = () => {
        this.recordMirrorFeedback(obs, "confirmed");
        this.mirrorFeedback.set(obs.observation_id, "confirmed");
        this.render();
      };
    }
    if (state === "idle" && !(isMap && obs.confirmed)) {
      const wrong = actions.createEl("button", { cls: "myu-mirror-ctl", text: isMap ? "doesn't fit\u2026" : "Wrong" });
      wrong.onclick = () => {
        this.recordMirrorFeedback(obs, "wrong");
        this.mirrorFeedback.set(obs.observation_id, isMap ? "done" : "refine");
        this.render();
      };
    }
    if (state === "confirmed") {
      actions.createSpan({ cls: "myu-mirror-ctl-label", text: "noted" });
    }
    if (state === "refine") {
      const refine = box.createDiv({ cls: "myu-mirror-actions" });
      refine.createSpan({ cls: "myu-mirror-ctl-label", text: "noted \u2014" });
      const options = [
        ["wrong_facts", "Wrong facts"],
        ["wrong_reading", "Wrong read"],
        ["true_drop_it", "True \u2014 drop it"]
      ];
      for (const [evt, label] of options) {
        const btn = refine.createEl("button", { cls: "myu-mirror-ctl", text: label });
        btn.onclick = () => {
          this.recordMirrorFeedback(obs, evt);
          this.mirrorFeedback.set(obs.observation_id, "done");
          this.render();
        };
      }
      const skip = refine.createEl("button", { cls: "myu-mirror-ctl", text: "Skip" });
      skip.onclick = () => {
        this.mirrorFeedback.set(obs.observation_id, "done");
        this.render();
      };
    }
    if (this.mirrorReceiptsOpen.has(obs.observation_id) && obs.receipts) {
      const receipts = box.createDiv({ cls: "myu-mirror-receipts" });
      for (const r of obs.receipts) {
        receipts.createEl("p", { cls: "myu-quiet myu-mirror-receipt", text: r.label ?? r.source ?? "source" });
      }
    }
  }
  /** One tap, zero justification — a lost signal never surfaces as an error. */
  recordMirrorFeedback(obs, eventType) {
    if (!obs.pattern_id) return;
    void this.plugin.backend.submitPatternFeedback(eventType, obs.pattern_id, "mirror_edition").catch(() => {
    });
  }
  renderNext(root) {
    const now = Date.now();
    const grace = now - 15 * 60 * 1e3;
    const upcoming = this.meetings.filter((m) => m.startDate.getTime() > grace);
    const earlier = this.meetings.filter((m) => m.startDate.getTime() <= grace).reverse();
    if (earlier.length > 0) {
      const past = root.createDiv({ cls: "myu-zone" });
      past.createDiv({ cls: "myu-whisper", text: "earlier today" });
      for (const meeting of earlier.slice(0, 4)) {
        const row = past.createEl("button", { cls: "myu-row myu-row-tappable" });
        row.createSpan({ cls: "myu-time", text: timeLabel(meeting.startDate) });
        row.createSpan({ cls: "myu-row-title myu-row-past", text: meeting.summary || "Meeting" });
        row.createSpan({ cls: "myu-affordance-inline", text: "Your read" });
        row.onclick = () => void this.plugin.openPrep(meeting.event_id);
      }
    }
    const zone = root.createDiv({ cls: "myu-zone" });
    zone.createDiv({ cls: "myu-whisper", text: "next" });
    if (upcoming.length === 0) {
      zone.createEl("p", { cls: "myu-quiet", text: earlier.length > 0 ? "Nothing more today." : "No meetings today." });
    }
    upcoming.slice(0, 5).forEach((meeting, index) => {
      const row = zone.createEl("button", { cls: "myu-row myu-row-tappable" });
      row.createSpan({ cls: "myu-time", text: timeLabel(meeting.startDate) });
      row.createSpan({ cls: "myu-row-title", text: meeting.summary || "Meeting" });
      row.createSpan({
        cls: index === 0 ? "myu-affordance-inline" : "myu-chevron",
        text: index === 0 ? "Prep" : "\u203A"
      });
      row.onclick = () => void this.plugin.openPrep(meeting.event_id);
    });
    if (this.weekAhead.length > 0) {
      zone.createDiv({ cls: "myu-whisper", text: "this week" });
      for (const meeting of this.weekAhead.slice(0, 6)) {
        const row = zone.createEl("button", { cls: "myu-row myu-row-tappable" });
        row.createSpan({ cls: "myu-time", text: dayLabel(meeting.startDate) });
        row.createSpan({ cls: "myu-row-title", text: meeting.summary || "Meeting" });
        row.createSpan({ cls: "myu-chevron", text: "\u203A" });
        row.onclick = () => void this.plugin.openPrep(meeting.event_id);
      }
      const held = this.weekAhead.length - 6;
      if (held > 0) {
        zone.createEl("p", { cls: "myu-quiet", text: `+${held} more later this week` });
      }
    }
  }
};
function dayLabel(date) {
  return date.toLocaleDateString([], { weekday: "short" }).toLowerCase();
}
function parseEventTime(value) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}
function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function timeLabel(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
}

// src/views/CardView.ts
var import_obsidian20 = require("obsidian");

// src/views/SourceDetailModal.ts
var import_obsidian17 = require("obsidian");
var SourceDetailModal = class extends import_obsidian17.Modal {
  constructor(app, plugin, sourceType, sourceId) {
    super(app);
    this.plugin = plugin;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Where this came from" });
    const wait = contentEl.createEl("p", { cls: "myu-quiet myu-thinking", text: "Looking" });
    const res = await this.plugin.backend.getSourceDetail(this.sourceType, this.sourceId).catch(() => null);
    wait.remove();
    const d = res?.data?.detail;
    if (!res?.ok || !d) {
      contentEl.createEl("p", { cls: "myu-problem", text: res?.data?.error === "unsupported_source_type" ? "Myu cannot show this kind of source yet." : "Could not fetch the source." });
      return;
    }
    contentEl.createDiv({ cls: "myu-claim", text: d.title || this.sourceType });
    const meta = [d.subtitle, d.timestamp ? new Date(d.timestamp).toISOString().slice(0, 10) : "", d.source_type].filter(Boolean).join(" \xB7 ");
    if (meta) contentEl.createDiv({ cls: "myu-quiet", text: meta });
    if (d.memories?.length) {
      const zone = contentEl.createDiv({ cls: "myu-zone" });
      zone.createDiv({ cls: "myu-whisper", text: "what Myu took from it" });
      for (const m of d.memories) {
        const row = zone.createDiv({ cls: "myu-row" });
        if (m.memory_date) row.createSpan({ cls: "myu-time", text: new Date(m.memory_date).toISOString().slice(0, 10) });
        row.createSpan({ cls: "myu-row-title", text: m.content });
      }
    }
    for (const [label, list2] of [["commitments", d.tasks?.map((t) => t.title)], ["events", d.events?.map((e) => e.title)]]) {
      if (!list2?.length) continue;
      const zone = contentEl.createDiv({ cls: "myu-zone" });
      zone.createDiv({ cls: "myu-whisper", text: label });
      for (const t of list2) zone.createDiv({ cls: "myu-row" }).createSpan({ cls: "myu-row-title", text: t });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/linkedinCards.ts
var import_obsidian18 = require("obsidian");

// src/views/canvasActions.ts
function str(v) {
  return typeof v === "string" ? v.trim() : "";
}
function rec(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function arr(v) {
  return Array.isArray(v) ? v.filter((x) => rec(x)) : [];
}
function controlsOf(component) {
  const data = component.data ?? {};
  const buttons = [];
  let input = null;
  switch (component.type) {
    case "prepared_content": {
      for (const a of arr(data.channel_actions)) {
        if (str(a.label) && str(a.action)) buttons.push({ label: str(a.label), action: str(a.action), params: rec(a.params) ?? void 0 });
      }
      const f = rec(data.input_field);
      if (f && str(f.action) && str(f.param_name)) {
        input = { action: str(f.action), params: rec(f.params) ?? void 0, param_name: str(f.param_name), placeholder: str(f.placeholder), submit_label: str(f.submit_label), submitting_label: str(f.submitting_label), validate: str(f.validate), help_text: str(f.help_text) };
      }
      break;
    }
    case "action_controls":
      for (const a of arr(data.actions)) {
        if (str(a.label) && str(a.action)) buttons.push({ label: str(a.label), action: str(a.action), params: rec(a.params) ?? void 0, cta: a.priority === "high" || a.style === "primary", interaction: { event_type: "action_clicked", component_type: "action_controls", action_value: str(a.label) || str(a.action), metadata: { action_name: str(a.action) } } });
      }
      break;
    case "reflection_prompt":
      input = { action: "", param_name: "answer", placeholder: str(data.placeholder) || "Your answer\u2026", submit_label: "Answer", submitting_label: "Sending\u2026", interaction: (value) => ({ event_type: "prompt_answered", component_type: "reflection_prompt", action_value: value, metadata: { action_name: "prompt_answered" } }) };
      break;
    case "offer_block": {
      const moment2 = str(data.moment);
      const ids = arr(data.options).map((o) => ({ id: str(o.id), label: str(o.label), init: rec(o.init) ?? void 0 })).filter((o) => o.id && o.label);
      let ctaGiven = false;
      for (const o of ids) {
        if (o.id === "calendar_ical") continue;
        if (o.id === "archive") continue;
        const cta = moment2 ? !!o.init && !ctaGiven : o.id === "calendar_google";
        if (cta) ctaGiven = true;
        buttons.push({ label: o.label, action: `offer:${o.id}`, cta, params: { ...o.init ? { init: o.init } : {}, ...moment2 ? { moment: moment2, journal_id: str(data.journal_id) || void 0 } : {}, ...str(data.stopped_ack) ? { stopped_ack: str(data.stopped_ack) } : {} } });
      }
      if (ids.some((o) => o.id === "calendar_ical")) {
        input = { action: "offer:calendar_ical", param_name: "url", placeholder: "https://calendar.google.com/calendar/ical/\u2026/basic.ics", submit_label: "Read my week", submitting_label: "Reading\u2026", validate: "url", help_text: "Google Calendar \u2192 Settings \u2192 your calendar \u2192 Secret address in iCal format. Outlook: Shared calendars \u2192 Publish. Read-only by construction." };
      }
      break;
    }
    case "inline_chat":
      input = { action: "inline_chat", param_name: "message", placeholder: str(data.placeholder) || "Ask a follow-up about this\u2026", submit_label: "Ask", submitting_label: "Asking\u2026" };
      break;
    case "decision_frame":
      if (component.variant === "multi_select") break;
      arr(data.options).forEach((o, i) => {
        if (str(o.label)) buttons.push({ label: str(o.label), action: "select_option", params: { option_index: i, option_label: str(o.label) }, cta: o.recommended === true, interaction: { event_type: "option_selected", component_type: "decision_frame", action_value: str(o.label), metadata: { action_name: "select_option", option_index: i, option_label: str(o.label) } } });
      });
      break;
    case "person_disambiguation": {
      for (const c of arr(data.candidates)) {
        if (str(c.name) && str(c.relationship_id)) buttons.push({ label: `\u2713 ${str(c.name)}`, action: "resolve_person", params: { type: "confirm", relationship_id: str(c.relationship_id), person_name: str(c.name) } });
      }
      if (buttons.length) buttons.push({ label: "None of these", action: "resolve_person", params: { type: "reject_all" } });
      break;
    }
    default:
      break;
  }
  return { buttons, input };
}
function renderComponentActions(parent, component, host) {
  const { buttons, input } = controlsOf(component);
  if (buttons.length === 0 && !input) return false;
  const row = parent.createDiv({ cls: "myu-canvas-actions" });
  const controls = [];
  let status = null;
  const say = (text) => {
    if (!status) status = row.createSpan({ cls: "myu-status myu-quiet" });
    status.setText(text);
  };
  const press = async (action, params, working, interaction) => {
    for (const b of controls) b.disabled = true;
    say(working);
    if (!action) {
      await host.interact(component.id, interaction).catch(() => void 0);
      say("Sent \u2014 Myu will pick this up in the conversation.");
      return;
    }
    const res = await host.run(component.id, action, params);
    if (res.ok) {
      say(res.message ?? "done \u2713");
      if (interaction) void host.interact(component.id, interaction).catch(() => void 0);
      return;
    }
    say(res.message ?? "That didn\u2019t work. Try again.");
    for (const b of controls) b.disabled = false;
  };
  for (const c of buttons) {
    const b = row.createEl("button", { cls: `myu-affordance${c.cta ? " myu-cta" : ""}`, text: c.label });
    b.onclick = () => void press(c.action, c.params, "working\u2026", c.interaction);
    controls.push(b);
  }
  if (input) {
    const field = row.createEl("input", { cls: "myu-canvas-input" });
    field.type = "text";
    if (input.placeholder) field.placeholder = input.placeholder;
    const submit = row.createEl("button", { cls: "myu-affordance myu-cta", text: input.submit_label || "Submit" });
    controls.push(submit);
    const spec = input;
    submit.onclick = () => {
      const value = field.value.trim();
      if (!value) {
        say("Type something first.");
        return;
      }
      if (spec.validate === "linkedin_url" && !/linkedin\.com\//i.test(value)) {
        say("That doesn\u2019t look like a LinkedIn profile URL.");
        return;
      }
      if ((spec.validate === "url" || spec.validate === "linkedin_url") && !/^https?:\/\//i.test(value)) {
        say("Paste the full URL, starting with https://");
        return;
      }
      void press(spec.action, { ...spec.params ?? {}, [spec.param_name]: value }, spec.submitting_label || "Submitting\u2026", spec.interaction?.(value));
      field.value = "";
    };
    if (input.help_text) row.createDiv({ cls: "myu-quiet myu-help", text: input.help_text });
  }
  return true;
}

// src/views/linkedinCards.ts
function suggestionsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s2) => !!s2 && typeof s2 === "object").map((s2) => ({
    card_id: typeof s2.card_id === "string" ? s2.card_id : void 0,
    person_name: typeof s2.person_name === "string" ? s2.person_name : void 0,
    profile_headline: typeof s2.profile_headline === "string" ? s2.profile_headline : void 0,
    linkedin_url: typeof s2.linkedin_url === "string" ? s2.linkedin_url : void 0,
    confidence: typeof s2.confidence === "number" ? s2.confidence : void 0
  }));
}
function linkedInMatchComponent(sug, personName, index, total) {
  if (!sug.card_id) return null;
  const name = sug.person_name || "Unknown";
  const first = index === 0;
  const remaining = total - index;
  const link = sug.linkedin_url ? `[View profile on LinkedIn](${sug.linkedin_url})

` : "";
  const body = first ? `**${name}**

${sug.profile_headline ? `*${sug.profile_headline}*

> ${name} \u2014 ${sug.profile_headline}

` : ""}${link}Is this the right person?` : `**${name}**

${sug.profile_headline ? `*${sug.profile_headline}*

` : ""}${link}Is this the right person?`;
  const title = first ? "LinkedIn Match Found" : `${personName ? `LinkedIn match for ${personName}` : "LinkedIn Match"}${remaining > 1 ? ` \u2014 ${remaining} suggestions remaining` : " \u2014 last suggestion"}`;
  return {
    id: `linkedin_confirm_${sug.card_id}`,
    type: "prepared_content",
    data: {
      title,
      content: body,
      format: "markdown",
      variant: "message",
      readonly: true,
      channel_actions: [
        { label: "\u2713 Confirm Match", action: "resolve_linkedin", params: { card_id: sug.card_id, resolve_action: "confirm" } },
        { label: "\u2717 Not this person", action: "resolve_linkedin", params: { card_id: sug.card_id, resolve_action: "reject" } }
      ]
    }
  };
}
function linkedInTerminalComponent(relationshipId, personName) {
  const who = personName || "them";
  const whose = personName ? `${personName}\u2019s` : "their";
  return {
    id: `linkedin_recover_${relationshipId}`,
    type: "prepared_content",
    data: {
      title: `Still can\u2019t find ${who}`,
      content: `None of the suggested LinkedIn profiles matched **${who}**. If you have ${whose} LinkedIn URL, paste it below. If ${personName ? `${personName} isn\u2019t` : "they\u2019re not"} on LinkedIn at all, just let me know.`,
      format: "markdown",
      variant: "message",
      readonly: true,
      input_field: { placeholder: "https://linkedin.com/in/...", action: "resolve_linkedin", param_name: "linkedin_url", submit_label: "Link profile", validate: "linkedin_url", help_text: "Paste the full LinkedIn profile URL for the correct person.", params: { resolve_action: "manual_url", relationship_id: relationshipId } },
      channel_actions: [{ label: "Not on LinkedIn", action: "resolve_linkedin", params: { resolve_action: "no_linkedin", relationship_id: relationshipId } }]
    }
  };
}
function renderAsCanvasCard(root, component, host, onReject) {
  const el = root.createDiv({ cls: `myu-canvas-component myu-canvas-${component.type} markdown-rendered` });
  const md = componentMarkdown(component, 0, () => null, [component]).trim();
  if (md) void import_obsidian18.MarkdownRenderer.render(host.app, md, el, "", host.owner);
  renderComponentActions(el, component, {
    run: async (_componentId, action, params) => {
      if (action !== "resolve_linkedin") return { ok: false, message: "Not a LinkedIn action." };
      const p = params ?? {};
      const resolve = String(p.resolve_action ?? "");
      const body = resolve === "confirm" || resolve === "reject" ? { card_id: String(p.card_id ?? ""), action: resolve } : resolve === "manual_url" ? { action: "manual_url", relationship_id: host.relationshipId, linkedin_url: String(p.linkedin_url ?? "") } : { action: "no_linkedin", relationship_id: host.relationshipId };
      const res = await host.plugin.backend.resolveLinkedInSuggestion(body).catch(() => null);
      if (resolve === "reject" && onReject) {
        if (!res?.ok) console.warn("[askmyu] linkedin reject not recorded", res?.error);
        onReject();
        return { ok: true, message: "noted \u2713" };
      }
      if (!res?.ok) return { ok: false, message: res?.error || "That didn\u2019t work. Try again." };
      if (resolve === "confirm" || resolve === "manual_url") notifyStatus("Linked.");
      if (resolve === "no_linkedin") notifyStatus("Noted \u2014 Myu won\u2019t keep guessing.");
      host.onResolved();
      return { ok: true, message: resolve === "reject" ? "noted \u2713" : "linked \u2713" };
    },
    interact: async () => void 0
  });
  return el;
}
function renderLinkedInMatches(root, suggestions, host) {
  const cards = suggestions.filter((s2) => s2.card_id);
  const slot = root.createDiv({ cls: "myu-linkedin-walk" });
  const show = (index) => {
    slot.empty();
    const sug = cards[index];
    const component = sug ? linkedInMatchComponent(sug, host.personName, index, cards.length) : null;
    if (!component) {
      renderAsCanvasCard(slot, linkedInTerminalComponent(host.relationshipId, host.personName), host);
      return;
    }
    renderAsCanvasCard(slot, component, host, () => show(index + 1));
  };
  show(0);
}
function renderLinkedInMatchesInline(root, suggestions, host) {
  const cards = suggestions.filter((s2) => s2.card_id);
  const slot = root.createDiv({ cls: "myu-linkedin-inline" });
  const say = (row, text) => {
    const status = row.querySelector(".myu-status");
    (status ?? row.createSpan({ cls: "myu-status myu-quiet" })).setText(text);
  };
  const resolve = async (body) => {
    const res = await host.plugin.backend.resolveLinkedInSuggestion(body).catch(() => null);
    if (!res?.ok) return { ok: false, message: res?.error || "That didn\u2019t work. Try again." };
    return { ok: true };
  };
  const terminal = () => {
    slot.empty();
    const who = host.personName || "them";
    slot.createDiv({ cls: "myu-quiet", text: `None of the suggested profiles matched ${who}. Paste the right LinkedIn URL below \u2014 or say ${host.personName ? `${host.personName} isn\u2019t` : "they\u2019re not"} on LinkedIn.` });
    const row = slot.createDiv({ cls: "myu-canvas-actions" });
    const field = row.createEl("input", { cls: "myu-canvas-input" });
    field.type = "text";
    field.placeholder = "https://linkedin.com/in/...";
    const link = row.createEl("button", { cls: "myu-affordance myu-cta", text: "Link profile" });
    link.onclick = () => {
      void (async () => {
        const url = field.value.trim();
        if (!/linkedin\.com\//i.test(url) || !/^https?:\/\//i.test(url)) {
          say(row, "Paste the full LinkedIn profile URL.");
          return;
        }
        link.disabled = true;
        const res = await resolve({ action: "manual_url", relationship_id: host.relationshipId, linkedin_url: url });
        if (!res.ok) {
          say(row, res.message ?? "");
          link.disabled = false;
          return;
        }
        notifyStatus("Linked.");
        host.onResolved();
      })();
    };
    const none = row.createEl("button", { cls: "myu-affordance", text: "Not on LinkedIn" });
    none.onclick = () => {
      void (async () => {
        none.disabled = true;
        const res = await resolve({ action: "no_linkedin", relationship_id: host.relationshipId });
        if (!res.ok) {
          say(row, res.message ?? "");
          none.disabled = false;
          return;
        }
        notifyStatus("Noted \u2014 Myu won\u2019t keep guessing.");
        host.onResolved();
      })();
    };
  };
  const show = (index) => {
    slot.empty();
    const sug = cards[index];
    if (!sug?.card_id) {
      terminal();
      return;
    }
    const line = slot.createDiv({ cls: "myu-voice" });
    line.createSpan({ cls: "myu-chat-li-name", text: sug.person_name || "Unknown" });
    if (sug.profile_headline) line.createSpan({ cls: "myu-quiet", text: ` \u2014 ${sug.profile_headline}` });
    if (cards.length > 1) slot.createDiv({ cls: "myu-whisper", text: `${index + 1} of ${cards.length}` });
    if (sug.linkedin_url) {
      const view = slot.createEl("button", { cls: "myu-affordance myu-link-button", text: "View profile on LinkedIn" });
      const url = sug.linkedin_url;
      view.onclick = () => window.open(url, "_blank");
    }
    const row = slot.createDiv({ cls: "myu-canvas-actions" });
    const confirm = row.createEl("button", { cls: "myu-affordance myu-cta", text: "Confirm match" });
    const reject = row.createEl("button", { cls: "myu-affordance", text: "Not this person" });
    confirm.onclick = () => {
      void (async () => {
        confirm.disabled = true;
        reject.disabled = true;
        const res = await resolve({ card_id: sug.card_id, action: "confirm" });
        if (!res.ok) {
          say(row, res.message ?? "");
          confirm.disabled = false;
          reject.disabled = false;
          return;
        }
        notifyStatus("Linked.");
        host.onResolved();
      })();
    };
    reject.onclick = () => {
      void (async () => {
        confirm.disabled = true;
        reject.disabled = true;
        const res = await resolve({ card_id: sug.card_id, action: "reject" });
        if (!res.ok) console.warn("[askmyu] linkedin reject not recorded", res.message);
        show(index + 1);
      })();
    };
  };
  show(0);
}
function renderLinkedInRecovery(root, host) {
  renderAsCanvasCard(root, linkedInTerminalComponent(host.relationshipId, host.personName), host);
}
function linkedInAskInText(queue, text) {
  const haystack = text.toLowerCase();
  for (const item of queue) {
    if (item.item_type !== "linkedin_disambiguation" || !item.relationship_id || !item.display_name) continue;
    const name = item.display_name.toLowerCase();
    const first = name.split(/\s+/)[0] ?? name;
    if (haystack.includes(name) || first.length > 2 && new RegExp(`\\b${first}\\b`).test(haystack)) {
      return { relationshipId: item.relationship_id, personName: item.display_name };
    }
  }
  return null;
}

// src/views/PersonEditModal.ts
var import_obsidian19 = require("obsidian");
var PersonEditModal = class extends import_obsidian19.Modal {
  constructor(app, plugin, relationshipId, displayName, memories, onChanged, linkedinUrl = null) {
    super(app);
    this.plugin = plugin;
    this.relationshipId = relationshipId;
    this.displayName = displayName;
    this.memories = memories;
    this.onChanged = onChanged;
    this.linkedinUrl = linkedinUrl;
    this.fields = {};
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: `Correct what Myu knows about ${this.displayName}` });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "These go to Myu, not to the note \u2014 the note is rewritten from what Myu knows, so this is the end that sticks."
    });
    new import_obsidian19.Setting(contentEl).setName("Facts").setHeading();
    this.textField(contentEl, "Name", "primary_name", this.displayName);
    this.textField(contentEl, "Role", "stated_role");
    this.textField(contentEl, "Company", "stated_company");
    this.textField(contentEl, "Email", "email_primary");
    this.textField(contentEl, "Anything Myu should know", "context_note");
    if (this.memories.length > 0) {
      new import_obsidian19.Setting(contentEl).setName("Things Myu believes").setHeading();
      contentEl.createEl("p", {
        cls: "myu-prose",
        text: "Correcting one keeps the original as a down-weighted memory and records your correction, so Myu learns the difference. Deleting removes it entirely."
      });
      for (const memory of this.memories.slice(0, 12)) this.memoryRow(contentEl, memory);
    }
    new import_obsidian19.Setting(contentEl).setName("This person").setHeading();
    new import_obsidian19.Setting(contentEl).setName("Merge into\u2026").setDesc("This is a duplicate of someone else Myu knows.").addButton((b) => b.setButtonText("Choose who stays").onClick(() => {
      this.close();
      this.plugin.mergePerson({ id: this.relationshipId, name: this.displayName });
    }));
    new import_obsidian19.Setting(contentEl).setName("This is me").setDesc("Myu made a person out of you.").addButton((b) => b.setButtonText("That\u2019s me").onClick(() => {
      this.close();
      this.plugin.markPersonAsSelf({ id: this.relationshipId, name: this.displayName });
    }));
    if (this.linkedinUrl) {
      new import_obsidian19.Setting(contentEl).setName("LinkedIn").setDesc(this.linkedinUrl).addButton((b) => b.setButtonText("Unlink").onClick(async () => {
        const res = await this.plugin.backend.setRelationshipLinkedIn(this.relationshipId, null);
        if (res.ok) {
          notifyStatus("LinkedIn link removed.");
          this.linkedinUrl = null;
          this.onChanged();
          this.close();
        } else notifyError(res.data?.error || "Couldn\u2019t unlink.");
      }));
    }
    new import_obsidian19.Setting(contentEl).setName("Archive").setDesc("Myu stops surfacing them. Reversible, and nothing is deleted.").addButton(
      (b) => b.setButtonText("Archive").onClick(async () => {
        const res = await this.plugin.backend.archiveRelationship(this.relationshipId, "archive");
        if (res.ok) {
          notifyStatus(`${this.displayName} archived.`);
          this.close();
          this.onChanged();
        } else notifyError("Couldn't archive them.");
      })
    );
    new import_obsidian19.Setting(contentEl).setName("Forget entirely").setDesc("Deletes them and everything Myu derived from them. Cannot be undone.").addButton(
      (b) => b.setButtonText("Forget").setDestructive().onClick(async () => {
        const res = await this.plugin.backend.purgeRelationship(this.relationshipId);
        if (res.ok) {
          notifyStatus(`Myu has forgotten ${this.displayName}.`);
          this.close();
          this.onChanged();
        } else notifyError("Couldn't forget them.");
      })
    );
    new import_obsidian19.Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Save facts").setCta().onClick(() => void this.saveFacts())
    );
  }
  textField(host, label, key, placeholder = "") {
    new import_obsidian19.Setting(host).setName(label).addText(
      (t) => t.setPlaceholder(placeholder).onChange((v) => {
        this.fields[key] = v.trim() === "" ? null : v.trim();
      })
    );
  }
  memoryRow(host, memory) {
    let correction = "";
    const row = new import_obsidian19.Setting(host).setName(memory.text.slice(0, 120)).setDesc(memory.date ?? "");
    row.addText((t) => t.setPlaceholder("What is actually true?").onChange((v) => correction = v.trim()));
    row.addButton(
      (b) => b.setButtonText("Correct").onClick(async () => {
        if (!correction) {
          notifyError("Say what is actually true first.");
          return;
        }
        const res = await this.plugin.backend.editRelationshipMemory(memory.memory_id, "correct", correction);
        if (res.ok) {
          notifyStatus("Corrected \u2014 Myu keeps both and weights yours.");
          this.onChanged();
        } else notifyError("Couldn't record that correction.");
      })
    );
    row.addButton(
      (b) => b.setButtonText("Delete").setDestructive().onClick(async () => {
        const res = await this.plugin.backend.editRelationshipMemory(memory.memory_id, "delete");
        if (res.ok) {
          notifyStatus("Deleted.");
          this.onChanged();
        } else notifyError("Couldn't delete that.");
      })
    );
  }
  async saveFacts() {
    const touched = Object.keys(this.fields);
    if (touched.length === 0) {
      this.close();
      return;
    }
    const res = await this.plugin.backend.updateRelationshipProfile(this.relationshipId, this.fields);
    if (!res.ok) {
      notifyError("Couldn't save those \u2014 check the connection and try again.");
      return;
    }
    this.close();
    notifyStatus("Saved. Myu\u2019s note for them updates on the next sync.");
    this.onChanged();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/CardView.ts
var CARD_VIEW_TYPE = "askmyu-card";
var _CardView = class _CardView extends import_obsidian20.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.card = null;
    this.state = "idle";
    this.suggestions = [];
    this.linkedinKnown = true;
    this.title = "Myu \u2014 card";
    this.entityType = "person";
    this.entityId = null;
    this.entityName = "";
    /** Board perspectives — fetched on demand, reset per entity. */
    this.board = null;
    this.boardOpen = false;
  }
  getViewType() {
    return CARD_VIEW_TYPE;
  }
  getDisplayText() {
    return this.title;
  }
  getIcon() {
    return "user";
  }
  async onOpen() {
    this.contentEl.addClass("myu-today");
    this.render();
  }
  async onClose() {
    this.contentEl.empty();
  }
  /** Person or company — the spec shape is the same, so the renderer is too. */
  /** Re-fetch the current entity (after resolving a suggestion). */
  /** Re-read what is on screen — also on card_section_updated. */
  async reload() {
    if (this.entityId) await this.showEntity(this.entityType, this.entityId, this.title.replace(/^Myu — /, ""));
  }
  /** Gather the person's memories so corrections can act on them, then open
      the edit surface. Memories come from the same endpoint the person page
      uses, so what you can correct is exactly what you can see. */
  async openCorrections() {
    const entityId = this.entityId;
    if (!entityId) return;
    const res = await this.plugin.backend.getRelationshipMemories(entityId).catch(() => null);
    const rows = flattenMemoryPayload(res?.data?.memories);
    const key = this.plugin.keys.get();
    const memories = [];
    for (const row of rows) {
      let text = (row.content ?? "").trim();
      if (!text && typeof row.encrypted_content === "string" && row.encrypted_content && key) {
        try {
          text = (await decryptWithKey(row.encrypted_content, key)).trim();
        } catch {
          continue;
        }
      }
      const id = row.memory_id;
      if (!text || !id) continue;
      memories.push({ memory_id: id, text, date: row.memory_date?.slice(0, 10) });
    }
    new PersonEditModal(this.app, this.plugin, entityId, this.entityName, memories, () => {
      void this.showEntity(this.entityType, entityId, this.entityName);
      void this.plugin.materializer.materializeAll();
    }, this.card?.header?.linkedin_url ?? null).open();
  }
  async showEntity(entityType, entityId, fallbackName) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.entityName = fallbackName;
    this.board = null;
    this.boardOpen = false;
    this.title = `Myu \u2014 ${fallbackName}`;
    this.state = "loading";
    this.card = null;
    this.render();
    const res = await this.plugin.backend.getCard(entityType, entityId);
    if (!res.ok || !res.data) {
      this.state = "error";
      this.render();
      return;
    }
    if (res.data.response_type === "disambiguation_pending" || !res.data.card) {
      this.suggestions = Array.isArray(res.data.suggestions) ? res.data.suggestions : [];
      this.state = "unresolved";
      this.render();
      return;
    }
    this.suggestions = [];
    this.linkedinKnown = res.data.linkedin_known !== false;
    this.card = res.data.card;
    this.state = "idle";
    this.render();
  }
  /** Both LinkedIn doors, shared with the Help Myu tab (linkedinCards.ts). */
  renderLinkedInRecovery(root) {
    if (!this.entityId) return;
    renderLinkedInRecovery(root, { app: this.app, owner: this, plugin: this.plugin, relationshipId: this.entityId, personName: this.entityName, onResolved: () => void this.reload() });
  }
  render() {
    const root = this.contentEl;
    root.empty();
    if (this.state === "loading") {
      root.createEl("p", { cls: "myu-quiet", text: "Opening\u2026" });
      return;
    }
    if (this.state === "error") {
      root.createEl("p", { cls: "myu-quiet", text: "Couldn't reach Myu just now." });
      return;
    }
    if (this.state === "unresolved") {
      if (this.suggestions.length > 0 && this.entityId) {
        renderLinkedInMatches(root, suggestionsOf(this.suggestions), { app: this.app, owner: this, plugin: this.plugin, relationshipId: this.entityId, personName: this.entityName, onResolved: () => void this.reload() });
        return;
      }
      root.createEl("p", {
        cls: "myu-quiet",
        text: this.entityType === "company" ? "Myu doesn't have a read on this company yet." : "Myu couldn't find this person. Point it at the right profile:"
      });
      if (this.entityType === "person") this.renderLinkedInRecovery(root);
      return;
    }
    if (!this.card) return;
    const header = this.card.header;
    root.createDiv({ cls: "myu-card-title", text: header?.display_name || this.entityName || "Card" });
    if (header?.subtitle) root.createDiv({ cls: "myu-quiet", text: header.subtitle });
    if (header?.identity_status && header.identity_status !== "confirmed" && header.identity_status !== "linked") {
      const confirm = root.createEl("button", { cls: "myu-affordance myu-cta", text: "That's them \u2014 confirm" });
      confirm.onclick = () => {
        const entityId = this.entityId;
        if (!entityId) return;
        confirm.disabled = true;
        void this.plugin.backend.confirmIdentity(entityId).then(async (res) => {
          if (res.ok) await this.showEntity(this.entityType, entityId, this.entityName);
          else confirm.disabled = false;
        });
      };
    }
    if (this.entityType === "person" && this.card && this.linkedinKnown === false) {
      root.createEl("p", { cls: "myu-quiet", text: "Myu doesn't have this person's LinkedIn yet." });
      this.renderLinkedInRecovery(root);
    }
    const contacts = [];
    if (header?.linkedin_url) contacts.push(["LinkedIn", header.linkedin_url]);
    if (header?.website_url) contacts.push(["Website", header.website_url]);
    if (header?.email_primary) contacts.push([header.email_primary, `mailto:${header.email_primary}`]);
    if (contacts.length > 0) {
      const row = root.createDiv({ cls: "myu-quiet" });
      contacts.forEach(([label, href], i) => {
        if (i > 0) row.createSpan({ text: " \xB7 " });
        const a = row.createEl("a", { text: label, href });
        a.setAttr("target", "_blank");
        a.setAttr("rel", "noopener");
      });
    }
    if (this.entityType === "person" && this.card.mail_offer && !_CardView.mailOfferHidden) {
      this.renderMailOffer(root, this.card.mail_offer);
    }
    if (this.entityId) this.renderDispatch(root, header?.display_name || this.entityName);
    if (this.entityType === "person") this.renderVaultLink(root, header?.display_name);
    if (this.entityType === "person" && this.entityId) {
      const correct = root.createEl("button", { cls: "myu-affordance", text: "Correct this" });
      correct.onclick = () => void this.openCorrections();
    }
    const discuss = root.createEl("button", { cls: "myu-affordance", text: "Discuss" });
    discuss.onclick = () => void this.plugin.openChat({
      text: "",
      send: false,
      context: {
        source: "card",
        source_id: this.card?.entity_id ?? "",
        card_entity_type: this.entityType,
        card_entity_id: this.card?.entity_id,
        entity_references: this.card?.entity_id ? [{ entity_type: this.entityType, entity_id: this.card.entity_id, display_name: header?.display_name ?? "" }] : []
      }
    });
    let undrawn = 0;
    for (const section of this.card.sections ?? []) {
      const blocks = sectionBlocks(section);
      if (blocks.length === 0) {
        undrawn++;
        continue;
      }
      const zone = root.createDiv({ cls: "myu-zone" });
      if (section.title) zone.createDiv({ cls: "myu-whisper", text: section.title.toLowerCase() });
      for (const block of blocks) {
        if (block.kind === "narrative") {
          zone.createDiv({ cls: "myu-voice", text: block.text });
        } else {
          const row = zone.createDiv({ cls: "myu-row" });
          if (block.meta) row.createSpan({ cls: "myu-time", text: block.meta });
          row.createSpan({ cls: "myu-row-title", text: block.text });
          if (block.source) {
            const src = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Where this came from" } });
            (0, import_obsidian20.setIcon)(src, "file-search");
            const source = block.source;
            src.onclick = () => new SourceDetailModal(this.app, this.plugin, source.type, source.id).open();
          }
        }
      }
      if (isDiscussable(section) && this.card) {
        const seed = sectionDiscussSeed(this.card, this.entityType, section, blocks);
        const discussSection = zone.createEl("button", { cls: "myu-affordance myu-link-button", text: "Discuss this with Myu" });
        discussSection.onclick = () => void this.plugin.openChat({
          text: seed.text,
          send: false,
          context: { source: "card_section", source_id: seed.source_id, card_entity_type: this.entityType, card_entity_id: this.card?.entity_id, section_type: section.section_type, section_content: seed.section_content, section_narrative: seed.section_narrative, entity_references: this.card?.entity_id ? [{ entity_type: this.entityType, entity_id: this.card.entity_id, display_name: header?.display_name ?? "" }] : [] }
        });
      }
    }
    if (this.entityType === "person" && this.entityId) void this.renderRelated(root, this.entityId);
    if (undrawn > 0) {
      const disclosure = root.createDiv({ cls: "myu-zone" });
      const link = disclosure.createEl("a", {
        cls: "myu-quiet",
        text: `${undrawn} ${undrawn === 1 ? "section doesn\u2019t" : "sections don\u2019t"} render here yet \u2014 open on the web`,
        href: `${this.plugin.settings.base_url.replace(/\/api\/?$/, "")}/dashboard`
      });
      link.setAttr("target", "_blank");
      link.setAttr("rel", "noopener");
    }
    this.renderBoard(root);
  }
  /**
   * Board perspectives (parity gap closed 2026-08-21) — 2-3 advisor takes,
   * fetched on demand from /card/board-lite. Pane content by doctrine: takes
   * are ephemeral advisory voices generated for this moment, not standing
   * state, so they have no vault-native expression. Each advisor is a NAMED
   * voice — whisper label carries the name, the take renders verbatim.
   */
  renderBoard(root) {
    const zone = root.createDiv({ cls: "myu-zone" });
    if (!this.boardOpen) {
      const open = zone.createEl("button", { cls: "myu-affordance", text: "Board perspectives" });
      open.onclick = () => {
        this.boardOpen = true;
        this.render();
        if (!this.board && this.entityId) {
          void this.plugin.backend.getBoardLite(this.entityType, this.entityId).then((res) => {
            this.board = res.ok ? res.data ?? { takes: [] } : { takes: [] };
            this.render();
          });
        }
      };
      return;
    }
    zone.createDiv({ cls: "myu-whisper", text: "the board" });
    if (!this.board) {
      zone.createEl("p", { cls: "myu-quiet", text: "Convening\u2026" });
      return;
    }
    const takes = this.board.takes ?? [];
    if (takes.length === 0) {
      zone.createEl("p", { cls: "myu-quiet", text: "The board has nothing yet \u2014 not enough history here." });
      return;
    }
    for (const take of takes) {
      const block = zone.createDiv({ cls: "myu-hero" });
      block.createDiv({ cls: "myu-whisper", text: (take.advisor_name ?? "advisor").toLowerCase() });
      block.createDiv({ cls: "myu-voice", text: take.take_text ?? take.text ?? "" });
    }
    const talk = zone.createEl("button", { cls: "myu-affordance", text: "Talk this through" });
    talk.onclick = () => {
      const lines = takes.map((t) => `${t.advisor_name ?? "Advisor"}: ${t.take_text ?? t.text ?? ""}`).join("\n");
      void this.plugin.openChat({
        text: `The board's takes on ${this.entityName}:

${lines}

What do you make of these?`,
        send: false
      });
    };
  }
  renderMailOffer(root, offer) {
    const box = root.createDiv({ cls: "myu-mail-offer myu-canvas-component" });
    const lead = (offer.lead ?? "").trim();
    const cut = lead.indexOf(". ");
    if (cut > 0) {
      box.createDiv({ cls: "myu-voice", text: lead.slice(0, cut + 1) });
      box.createDiv({ cls: "myu-quiet", text: lead.slice(cut + 2) });
    } else if (lead) box.createDiv({ cls: "myu-voice", text: lead });
    const actions = box.createDiv({ cls: "myu-canvas-actions" });
    for (const o of offer.options ?? []) {
      const label = (o.label ?? "").trim();
      if (!label) continue;
      if (o.init?.provider === "google" || o.init?.provider === "microsoft") {
        const provider = o.init.provider;
        const opts = { scopeSet: o.init.scope_set ?? "history", returnTo: o.init.return_to };
        const b = actions.createEl("button", { cls: `myu-affordance${o.id === "gmail" ? " myu-cta" : ""}`, text: label });
        b.onclick = async () => {
          b.disabled = true;
          const init = provider === "google" ? await this.plugin.backend.googleOAuthInit(opts).catch(() => null) : await this.plugin.backend.microsoftOAuthInit(opts).catch(() => null);
          const url = init?.data?.auth_url;
          if (init?.ok && url) {
            window.open(url, "_blank");
            notifyStatus("Finish in your browser \u2014 Myu reads the history when you come back.");
          } else {
            notifyError("The consent screen did not answer. Try again in a moment.");
            b.disabled = false;
          }
        };
      } else if (o.id === "imap") {
        const b = actions.createEl("button", { cls: "myu-affordance", text: label });
        b.onclick = () => this.plugin.openSettingsAt("Other email (IMAP)");
      } else if (o.id === "not_now") {
        const b = actions.createEl("button", { cls: "myu-affordance myu-link-button", text: label });
        b.onclick = () => {
          _CardView.mailOfferHidden = true;
          box.remove();
        };
      }
    }
    if (offer.trust_line) box.createDiv({ cls: "myu-quiet", text: offer.trust_line });
  }
  /** feed/entities/dispatch → one sentence on demand; dismiss with the receipt's fingerprint. */
  renderDispatch(root, name) {
    const host = root.createDiv({ cls: "myu-dispatch" });
    const ask = host.createEl("button", { cls: "myu-affordance myu-link-button", text: `What\u2019s up with ${name}?` });
    ask.onclick = async () => {
      ask.disabled = true;
      ask.setText("Asking\u2026");
      const entityId = this.entityId;
      if (!entityId) return;
      const res = await this.plugin.backend.getEntityDispatch(this.entityType, entityId).catch(() => null);
      host.empty();
      const line = res?.data?.dispatch_sentence?.trim();
      if (!res?.ok || !line) {
        host.createDiv({ cls: "myu-quiet", text: "Nothing new to say right now." });
        return;
      }
      host.createDiv({ cls: "myu-voice", text: line });
      const fp = res.data?.dispatch_receipt?.signal_fingerprint;
      if (typeof fp === "string" && fp) {
        const drop = host.createEl("button", { cls: "myu-affordance myu-link-button", text: "Dismiss" });
        drop.onclick = () => {
          void this.plugin.backend.dismissEntityDispatch(entityId, fp, res.data?.dispatch_category).catch(() => void 0);
          host.empty();
        };
      }
    };
  }
  /** The expanded feed card's related people + memories (feed/related-*). Quiet rows; people open their card. */
  async renderRelated(root, relationshipId) {
    const [people, memories] = await Promise.all([
      this.plugin.backend.getRelatedPersons(relationshipId).catch(() => null),
      this.plugin.backend.getRelatedMemories(relationshipId).catch(() => null)
    ]);
    if (this.entityId !== relationshipId) return;
    const persons = people?.data?.related ?? [];
    const mems = memories?.data?.related ?? [];
    if (!persons.length && !mems.length) return;
    const zone = root.createDiv({ cls: "myu-zone" });
    zone.createDiv({ cls: "myu-whisper", text: "around them" });
    for (const p of persons) {
      const row = zone.createEl("button", { cls: "myu-row myu-row-tappable", attr: { "aria-label": `Open ${p.display_name}` } });
      row.createSpan({ cls: "myu-row-title", text: p.display_name + (p.subtitle ? ` \u2014 ${p.subtitle}` : "") });
      row.onclick = () => void this.plugin.openCard("person", p.relationship_id, p.display_name);
    }
    for (const m of mems) {
      if (!m.content) continue;
      const row = zone.createDiv({ cls: "myu-row" });
      if (m.memory_date) row.createSpan({ cls: "myu-time", text: m.memory_date.slice(0, 10) });
      row.createSpan({ cls: "myu-row-title", text: (m.entity_display_name ? `${m.entity_display_name}: ` : "") + m.content });
      if (m.source_type && m.source_id) {
        const src = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Where this came from" } });
        (0, import_obsidian20.setIcon)(src, "file-search");
        src.onclick = () => new SourceDetailModal(this.app, this.plugin, m.source_type, m.source_id).open();
      }
    }
  }
  renderVaultLink(root, name) {
    if (!name) return;
    const page = this.plugin.personIndex.find(name);
    if (!page) return;
    const note = this.plugin.app.vault.getAbstractFileByPath(page.path);
    if (!(note instanceof import_obsidian20.TFile)) return;
    const link = root.createEl("button", { cls: "myu-affordance", text: "Your note" });
    link.onclick = () => void this.app.workspace.getLeaf(false).openFile(note);
  }
};
/**
 * Name-match against the vault's own people pages, via the PersonPageIndex —
 * so `aliases:` frontmatter and `type: person` pages count, not just an exact
 * basename anywhere in the vault. Link only (R2): we open their note, we
 * never touch it.
 */
_CardView.mailOfferHidden = false;
var CardView = _CardView;

// src/views/PrepView.ts
var import_obsidian21 = require("obsidian");
var PREP_VIEW_TYPE = "askmyu-prep";
var PrepView = class extends import_obsidian21.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.prep = null;
    this.eventId = null;
    this.state = "idle";
    this.showWhy = false;
    this.showNotes = false;
    this.showLink = false;
    this.linkResults = [];
    this.linkQuery = "";
    this.linking = false;
    this.searchSeq = 0;
  }
  getViewType() {
    return PREP_VIEW_TYPE;
  }
  getDisplayText() {
    return this.prep ? `Myu \u2014 ${this.prep.subject.display_name}` : "Myu \u2014 prep";
  }
  getIcon() {
    return "target";
  }
  async onOpen() {
    this.contentEl.addClass("myu-today");
    this.render();
  }
  async onClose() {
    this.contentEl.empty();
  }
  async showMeeting(eventId) {
    this.eventId = eventId;
    this.state = "loading";
    this.prep = null;
    this.showWhy = false;
    this.showNotes = false;
    this.showLink = false;
    this.linkQuery = "";
    this.linkResults = [];
    this.render();
    await this.loadPrep();
  }
  async loadPrep() {
    if (!this.eventId) return;
    const res = await this.plugin.backend.getMeetingPrep(this.eventId);
    if (!res.ok || !res.data?.prep) {
      this.state = res.status === 404 ? "unavailable" : "error";
      this.render();
      return;
    }
    this.prep = res.data.prep;
    this.state = "idle";
    this.render();
  }
  /** Quiet refetch — the stale chip's `refresh` and the post-link re-warm. */
  refresh() {
    void this.loadPrep();
  }
  // ── render ────────────────────────────────────────────────────────────────
  render() {
    const root = this.contentEl;
    root.empty();
    if (this.state === "loading") {
      root.createEl("p", { cls: "myu-quiet", text: "Opening prep\u2026" });
      return;
    }
    if (this.state === "unavailable") {
      root.createEl("p", { cls: "myu-quiet", text: "No prep for this meeting yet." });
      return;
    }
    if (this.state === "error") {
      root.createEl("p", { cls: "myu-quiet", text: "Couldn't reach Myu just now." });
      const retry = root.createEl("button", { cls: "myu-affordance", text: "Try again" });
      retry.onclick = () => this.refresh();
      return;
    }
    if (!this.prep) return;
    const prep = this.prep;
    this.renderHeader(root, prep);
    this.renderChips(root, prep);
    if (this.showLink) this.renderLinkSearch(root);
    this.renderZones(root, prep);
    this.renderFactual(root, prep);
    this.renderFooter(root, prep);
    if (this.showNotes) this.renderNotes(root, prep);
    if (this.showWhy) this.renderWhy(root, prep);
  }
  renderHeader(root, prep) {
    const head = root.createDiv({ cls: "myu-prep-head" });
    head.createDiv({ cls: "myu-card-title", text: prep.subject.display_name });
    if (prep.meeting) {
      const time = new Date(prep.meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
      head.createDiv({
        cls: "myu-quiet myu-prep-meeting",
        text: `${prep.meeting.title ? `${prep.meeting.title} \xB7 ` : ""}${time}`
      });
    }
  }
  renderChips(root, prep) {
    const cold = prep.data_tier === "cold";
    const stale = prep.data_tier === "stale";
    const identityUnconfirmed = prep.subject.identity_status === "likely_match" || prep.subject.identity_status === "pending_disambiguation";
    const unlinked = prep.subject.entity_id === "unlinked" || prep.subject.entity_id.includes("@");
    if (!cold && !stale && !identityUnconfirmed && !unlinked) return;
    const chips = root.createDiv({ cls: "myu-prep-chips" });
    if (identityUnconfirmed) {
      const confirm = chips.createEl("button", { cls: "myu-chip myu-chip-amber", text: "Likely match \u2014 confirm" });
      confirm.onclick = () => {
        this.showLink = true;
        this.linkQuery = prep.subject.display_name ?? "";
        void this.runLinkSearch(this.linkQuery);
        this.render();
      };
    }
    if (unlinked) {
      const who = chips.createEl("button", { cls: "myu-chip myu-chip-amber", text: "Who is this?" });
      who.onclick = () => {
        this.showLink = !this.showLink;
        this.render();
      };
    }
    if (cold) chips.createSpan({ cls: "myu-chip", text: "no history yet" });
    if (stale) {
      chips.createSpan({ cls: "myu-chip", text: `stale \u2014 ${staleLabel(prep)}` });
      const refresh = chips.createEl("button", { cls: "myu-affordance", text: "Refresh" });
      refresh.onclick = () => this.refresh();
    }
  }
  /** Inline `who is this?` — search people, link, refetch re-warmed. */
  renderLinkSearch(root) {
    const box = root.createDiv({ cls: "myu-prep-evidence" });
    const input = box.createEl("input", { cls: "myu-prep-search", attr: { placeholder: "Search your people\u2026" } });
    input.value = this.linkQuery;
    input.oninput = () => {
      this.linkQuery = input.value;
      void this.runLinkSearch(input.value);
    };
    window.setTimeout(() => input.focus(), 0);
    for (const result of this.linkResults) {
      const row = box.createEl("button", { cls: "myu-affordance myu-prep-link-row" });
      row.createSpan({ text: `${result.display_name} ` });
      if (result.organization) row.createSpan({ cls: "myu-quiet", text: `${result.organization} ` });
      (0, import_obsidian21.setIcon)(row.createSpan({ cls: "myu-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
      row.disabled = this.linking;
      row.onclick = () => void this.linkSubject(result.entity_id);
    }
    if (this.linkQuery.trim().length > 1 && this.linkResults.length === 0) {
      box.createEl("p", {
        cls: "myu-quiet",
        text: "Nobody by that name yet \u2014 they may not have history with you"
      });
    }
  }
  async runLinkSearch(query) {
    const q = query.trim();
    if (q.length < 2) {
      this.linkResults = [];
      this.render();
      return;
    }
    const seq = ++this.searchSeq;
    const res = await this.plugin.backend.searchEntities(q);
    if (seq !== this.searchSeq) return;
    this.linkResults = (res.data?.results ?? []).filter((r) => r.entity_type === "person").slice(0, 5);
    this.render();
  }
  async linkSubject(relationshipId) {
    if (!this.eventId || this.linking) return;
    this.linking = true;
    this.render();
    const res = await this.plugin.backend.linkPrepSubject(this.eventId, relationshipId);
    this.linking = false;
    if (res.ok) {
      this.showLink = false;
      this.refresh();
    } else {
      this.render();
    }
  }
  renderZones(root, prep) {
    if (prep.watch) {
      const zone = root.createDiv({ cls: "myu-zone" });
      zone.createDiv({ cls: "myu-whisper", text: "signal" });
      const row = zone.createDiv({ cls: "myu-prep-signal" });
      row.createSpan({ cls: "myu-prep-dot" });
      row.createSpan({ cls: "myu-claim", text: prep.watch.text });
      this.renderDated(zone, prep, prep.watch);
    }
    if (prep.stand) {
      const zone = root.createDiv({ cls: "myu-zone" });
      zone.createDiv({ cls: "myu-whisper", text: "read" });
      zone.createDiv({ cls: "myu-voice", text: prep.stand.text });
      this.renderDated(zone, prep, prep.stand);
    }
    if (prep.move) {
      const zone = root.createDiv({ cls: "myu-zone" });
      zone.createDiv({ cls: "myu-whisper", text: "move" });
      zone.createDiv({ cls: "myu-claim", text: prep.move.text });
    }
  }
  /** Stale claims surface their date (isStalePrep contract). */
  renderDated(zone, prep, claim) {
    if (prep.data_tier !== "stale" || !claim.last_updated) return;
    zone.createDiv({ cls: "myu-quiet", text: `as of ${new Date(claim.last_updated).toLocaleDateString()}` });
  }
  /** Cold/low floor: facts, plainly, never an invented read. Zero accents. */
  renderFactual(root, prep) {
    const factual = prep.factual;
    if (!factual) return;
    const zone = root.createDiv({ cls: "myu-zone" });
    zone.createDiv({ cls: "myu-whisper", text: "what we know" });
    for (const line of [
      factual.role_line,
      factual.company_name,
      factual.why_meeting,
      (factual.mutual_ties ?? []).length ? `Mutual: ${(factual.mutual_ties ?? []).join(", ")}` : null,
      ...factual.public_context ?? []
    ]) {
      if (line) zone.createDiv({ cls: "myu-quiet myu-fact-row", text: line });
    }
    if (factual.no_history) {
      zone.createEl("p", {
        cls: "myu-quiet",
        text: `Myu doesn't have history with ${prep.subject.display_name} yet \u2014 it builds from here.`
      });
    }
  }
  renderFooter(root, prep) {
    const hasWhy = this.evidence(prep).length > 0 || prep.thread !== null;
    if (!hasWhy && !prep.capture_hook && !prep.notes_captured) return;
    const foot = root.createDiv({ cls: "myu-prep-foot" });
    if (hasWhy) {
      const why = foot.createEl("button", { cls: "myu-affordance", text: "Why" });
      why.onclick = () => {
        this.showWhy = !this.showWhy;
        this.render();
      };
    }
    if (prep.notes_captured) {
      const notes = foot.createEl("button", { cls: "myu-affordance", text: "Notes captured" });
      notes.onclick = () => {
        this.showNotes = !this.showNotes;
        this.render();
      };
    }
    if (prep.capture_hook) {
      const after = prep.meeting ? Date.now() >= prep.meeting.starts_at : false;
      const talk = foot.createEl("button", { cls: "myu-affordance", text: after ? "After" : "Ask" });
      talk.onclick = () => void this.plugin.openChat({
        text: after ? `How it went with ${prep.subject.display_name}: ` : "",
        send: false,
        context: {
          source: "prep",
          source_id: prep.prep_id,
          prep_phase: after ? "after" : "before",
          prep_event_id: prep.meeting?.meeting_id,
          prep_meeting_title: prep.meeting?.title,
          prep_claims: [prep.watch, prep.stand, prep.thread, prep.move].filter((c) => c !== null).map((c) => c.text),
          entity_references: [
            {
              entity_type: prep.subject.entity_type,
              entity_id: prep.subject.entity_id,
              display_name: prep.subject.display_name
            }
          ]
        }
      });
    }
  }
  /** The captured notes, inspectable in place — a state you can't inspect reads as a claim. */
  renderNotes(root, prep) {
    const box = root.createDiv({ cls: "myu-prep-evidence" });
    if (prep.notes_summary) box.createDiv({ cls: "myu-claim", text: prep.notes_summary });
    const decisions = prep.notes_decision_count ?? 0;
    const actions = prep.notes_action_count ?? 0;
    if (decisions > 0 || actions > 0) {
      const parts = [
        decisions > 0 ? `${decisions} decision${decisions === 1 ? "" : "s"}` : null,
        actions > 0 ? `${actions} action item${actions === 1 ? "" : "s"}` : null
      ].filter(Boolean);
      box.createDiv({ cls: "myu-quiet", text: `${parts.join(" \xB7 ")} on record` });
    }
  }
  renderWhy(root, prep) {
    const box = root.createDiv({ cls: "myu-prep-evidence" });
    if (prep.thread) box.createDiv({ cls: "myu-claim", text: prep.thread.text });
    for (const { refs } of this.evidence(prep)) {
      for (const ref of refs) {
        if (ref.link) {
          const a = box.createEl("a", { cls: "myu-quiet myu-prep-ref", text: `${ref.label}`, href: ref.link });
          a.setAttr("target", "_blank");
          a.setAttr("rel", "noopener");
        } else {
          box.createDiv({ cls: "myu-quiet myu-prep-ref", text: ref.label });
        }
      }
    }
  }
  evidence(prep) {
    return [prep.watch, prep.stand, prep.move, prep.thread].filter((c) => c !== null && (c.evidence_refs?.length ?? 0) > 0).map((c) => ({ refs: c.evidence_refs ?? [] }));
  }
};
function staleLabel(prep) {
  const newest = [prep.stand, prep.thread, prep.watch, prep.move].filter((c) => c !== null).reduce((max, c) => Math.max(max, c.last_updated ?? 0), 0) || prep.generated_at;
  return new Date(newest).toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase();
}

// src/views/LookupModal.ts
var import_obsidian22 = require("obsidian");
var LookupModal = class extends import_obsidian22.FuzzySuggestModal {
  constructor(app, plugin, tab, onPick) {
    super(app);
    this.plugin = plugin;
    this.tab = tab;
    this.onPick = onPick;
    this.entities = [];
    this.setPlaceholder(tab === "company" ? "Look up a company\u2026" : "Look up someone Myu knows\u2026");
  }
  async onOpen() {
    await super.onOpen();
    const res = await this.plugin.backend.listEntities(this.tab);
    this.entities = res.data?.entities ?? [];
    this.inputEl.dispatchEvent(new Event("input"));
  }
  getItems() {
    return this.entities;
  }
  getItemText(entity) {
    return entity.display_name;
  }
  renderSuggestion(match, el) {
    el.createDiv({ text: match.item.display_name });
    const sub = match.item.organization || match.item.subtitle;
    if (sub) el.createDiv({ cls: "myu-quiet", text: sub });
  }
  onChooseItem(entity) {
    this.onPick(entity);
  }
};

// src/views/WeeklyReviewModal.ts
var import_obsidian23 = require("obsidian");
var WeeklyReviewModal = class extends import_obsidian23.Modal {
  constructor(app, onDecision) {
    super(app);
    this.onDecision = onDecision;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Write a weekly review into your vault?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Once a week, Myu can add a short section to your Periodic Notes weekly note \u2014 the movement it saw across your relationships, as counts. It goes between two markers and replaces itself each week; the rest of the note stays yours."
    });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Worth knowing before you say yes: this is the only thing Myu ever writes into your vault. Vault files sync through whatever you use \u2014 Dropbox, iCloud, Obsidian Sync \u2014 and land wherever that takes them. Anything written here leaves our reach permanently."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "It writes counts, not names. Turning this off stops future writes; anything already written is yours to keep or delete."
    });
    new import_obsidian23.Setting(contentEl).addButton(
      (b) => b.setButtonText("No, keep it out of my vault").onClick(() => {
        void this.onDecision(false);
        this.close();
      })
    ).addButton(
      (b) => b.setButtonText("Yes, write it").setCta().onClick(() => {
        void this.onDecision(true);
        this.close();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/BackfillModal.ts
var import_obsidian24 = require("obsidian");
var BackfillModal = class extends import_obsidian24.Modal {
  constructor(app, plugin, files, oldest) {
    super(app);
    this.plugin = plugin;
    this.files = files;
    this.oldest = oldest;
    this.range = "all";
    this.people = null;
  }
  async onOpen() {
    this.render();
    this.people = await this.plugin.linkSurvey().catch(() => []);
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  inRange() {
    const cutoff = rangeCutoff(this.range);
    return cutoff ? this.files.filter((f) => f.stat.mtime >= cutoff) : this.files;
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Bring in what you have already written?" });
    const chosen = this.inRange();
    const folders = new Set(this.files.map((f) => f.path.split("/").slice(0, -1).join("/") || "/"));
    contentEl.createEl("p", { cls: "myu-prose", text: describeScope(this.files.length, folders.size, this.oldest) });
    const line = this.people === null ? "Looking at your links\u2026" : surveyLine(this.people);
    if (line) contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: line });
    new import_obsidian24.Setting(contentEl).setName("How far back").setDesc(`${chosen.length} ${chosen.length === 1 ? "note" : "notes"} \xB7 ${backfillEstimate(chosen.length)}. Each note keeps its own date; every note is encrypted on this device before it leaves.`).addDropdown((d) => d.addOption("90d", "Last 90 days").addOption("1y", "Last year").addOption("all", "Everything").setValue(this.range).onChange((v) => {
      this.range = v;
      this.render();
    }));
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "Nothing leaves before you start it. It runs in the background \u2014 progress in the status bar, and a command to cancel. You can share only what you write from now on instead." });
    new import_obsidian24.Setting(contentEl).addButton((b) => b.setButtonText("Only from now on").onClick(() => {
      this.plugin.settings.backfill_done = true;
      void this.plugin.saveSettings();
      this.close();
      void this.plugin.refreshTodayNow();
    })).addButton((b) => b.setButtonText("Start").setCta().setDisabled(chosen.length === 0).onClick(() => {
      this.close();
      void this.plugin.runBackfill(this.inRange());
    }));
  }
};
function describeScope(count, folders, oldest) {
  if (count === 0) return "There is nothing in the folders you shared yet.";
  const noun = count === 1 ? "note" : "notes";
  const where = `${count} ${noun} across ${folders} ${folders === 1 ? "folder" : "folders"}`;
  if (!oldest) return `${where}.`;
  return `${where}, oldest ${new Date(oldest).getFullYear()}.`;
}

// src/transport/index.ts
var import_obsidian25 = require("obsidian");

// src/transport/assertEncrypted.ts
var PlaintextRefusedError = class extends Error {
  constructor(reason) {
    super(
      `Refused to send a journal payload: ${reason}. This is the transport chokepoint \u2014 content is encrypted under the mDEK before it reaches here, and nothing else is allowed out.`
    );
    this.name = "PlaintextRefusedError";
  }
};
function assertEncrypted(payload) {
  const carrier = payload;
  if ("content" in carrier || "text" in carrier || "body" in carrier) {
    throw new PlaintextRefusedError("it carries a plaintext field (content/text/body)");
  }
  if (typeof payload.encrypted_content !== "string" || payload.encrypted_content.length === 0) {
    throw new PlaintextRefusedError("encrypted_content is missing or empty");
  }
  if (!Number.isInteger(payload.encryption_version) || payload.encryption_version < 1) {
    throw new PlaintextRefusedError("encryption_version is missing");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.encrypted_content)) {
    throw new PlaintextRefusedError("encrypted_content is not base64");
  }
  if (!looksLikeEnvelope(payload.encrypted_content)) {
    throw new PlaintextRefusedError("encrypted_content is not a plausible AES-GCM envelope");
  }
}
function looksLikeEnvelope(base64) {
  let bytes;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return false;
  }
  if (bytes.length < 29) return false;
  const printable = (b) => b === 9 || b === 10 || b === 13 || b >= 32 && b <= 126;
  return !Array.from(bytes.slice(0, 12)).every(printable);
}

// src/transport/budget.ts
var WAF_PAUSE_MS = 5 * 60 * 1e3;
var RequestBudget = class _RequestBudget {
  constructor(opts = {}) {
    this.pausedUntil = /* @__PURE__ */ new Map();
    this.allPausedUntil = 0;
    /** Serialises acquirers so two callers cannot both take the last token. */
    this.queue = Promise.resolve();
    this.perSecond = opts.perSecond ?? 5;
    this.burst = opts.burst ?? 10;
    this.defaultPauseMs = opts.defaultPauseMs ?? 6e4;
    this.wafPauseMs = opts.wafPauseMs ?? WAF_PAUSE_MS;
    this.maxWaitMs = opts.maxWaitMs ?? 3e4;
    this.now = opts.now ?? (() => Date.now());
    this.tokens = this.burst;
    this.lastRefill = this.now();
  }
  /** The endpoint a path belongs to — the path without its query. */
  static keyOf(path) {
    const q = path.indexOf("?");
    return q === -1 ? path : path.slice(0, q);
  }
  /** ms until `path` may go: the later of its own pause and the global one, then the bucket. */
  waitFor(path) {
    const t = this.now();
    const key = _RequestBudget.keyOf(path);
    const pause = Math.max(this.pausedUntil.get(key) ?? 0, this.allPausedUntil) - t;
    if (pause > 0) return pause;
    this.refill(t);
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.perSecond * 1e3);
  }
  /**
   * Wait for a turn, then take it. Resolves `ok` when the call may go, or
   * `paused` (with the wait it would have needed) when that wait exceeds the cap.
   */
  acquire(path, sleep = (ms) => new Promise((r) => window.setTimeout(r, ms))) {
    const turn = this.queue.then(async () => {
      const wait = this.waitFor(path);
      if (wait > this.maxWaitMs) return { ok: false, retryAfterMs: wait };
      if (wait > 0) await sleep(wait);
      const again = this.waitFor(path);
      if (again > this.maxWaitMs) return { ok: false, retryAfterMs: again };
      if (again > 0) await sleep(again);
      this.refill(this.now());
      this.tokens = Math.max(0, this.tokens - 1);
      return { ok: true };
    });
    this.queue = turn.then(() => void 0, () => void 0);
    return turn;
  }
  /**
   * The server said 429: that endpoint rests for Retry-After, or the default
   * when it said nothing. An EXPLICIT zero is a third case (backend,
   * 2026-09-03): the request behind the 429 is invalidated (`next_action:
   * "request_new_transfer"`) — waiting is the wrong move, so no rest at all.
   */
  pause(path, retryAfterMs2) {
    if (retryAfterMs2 === 0) return;
    const ms = retryAfterMs2 && retryAfterMs2 > 0 ? retryAfterMs2 : this.defaultPauseMs;
    this.pausedUntil.set(_RequestBudget.keyOf(path), this.now() + ms);
  }
  /** A bare 403 — the WAF: everything rests, long and flat. */
  pauseAll(ms = this.wafPauseMs) {
    this.allPausedUntil = Math.max(this.allPausedUntil, this.now() + ms);
  }
  /** Whether anything is resting right now — the status bar can say so. */
  pausedMs(path) {
    const t = this.now();
    const own = path ? this.pausedUntil.get(_RequestBudget.keyOf(path)) ?? 0 : 0;
    return Math.max(0, Math.max(own, this.allPausedUntil) - t);
  }
  refill(t) {
    const elapsed = Math.max(0, t - this.lastRefill);
    this.tokens = Math.min(this.burst, this.tokens + elapsed / 1e3 * this.perSecond);
    this.lastRefill = t;
  }
};
function retryAfterMs(headers, body, now = Date.now()) {
  const header = headers ? headers["retry-after"] ?? headers["Retry-After"] : void 0;
  if (typeof header === "string" && header.trim()) {
    const secs = Number(header.trim());
    if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1e3));
    const when = Date.parse(header);
    if (Number.isFinite(when)) return Math.max(0, when - now);
  }
  if (body && typeof body === "object") {
    const v = body.retry_after;
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v * 1e3));
    if (typeof v === "string" && Number.isFinite(Number(v))) return Math.max(0, Math.round(Number(v) * 1e3));
  }
  return null;
}

// src/transport/index.ts
function isWafRefusal(status, data) {
  if (status !== 403) return false;
  if (!data || typeof data !== "object") return true;
  const d = data;
  return !("err" in d) && !("error" in d);
}
function isEncryptionBlocked(status, data) {
  return status === 403 && !!data && typeof data === "object" && data.err === "enc";
}
var Transport = class {
  constructor(opts) {
    /** One recovery in flight per kind; every request refused by that wall awaits it. */
    this.recoveries = /* @__PURE__ */ new Map();
    this.opts = opts;
    this.budget = opts.budget ?? new RequestBudget();
  }
  setAuthToken(token) {
    this.opts.authToken = token;
  }
  get isAuthed() {
    return !!this.opts.authToken;
  }
  setBaseUrl(baseUrl) {
    this.opts.baseUrl = baseUrl;
  }
  /**
   * The frontend origin for this stack, sent as the Origin header on every
   * request — exactly what a browser at the web app sends. The backend derives
   * OAuth redirect URIs and magic-link landing URLs from it
   * (ServletUtility.extractOriginFromRequest, priority 1); requestUrl sends no
   * Origin of its own, so without this the server falls back to proxy headers
   * and can build a callback Google has never heard of (redirect_uri_mismatch).
   */
  origin() {
    try {
      return new URL(this.opts.baseUrl).origin;
    } catch {
      return "";
    }
  }
  baseHeaders(extra = {}) {
    const origin = this.origin();
    return { ...origin ? { Origin: origin } : {}, ...extra };
  }
  /** Headers for one send — read at send time, so a retry carries the session a recovery minted. */
  headersFor(extra, authed) {
    const headers = this.baseHeaders(extra);
    if (authed && this.opts.authToken) headers["Authorization"] = `Bearer ${this.opts.authToken}`;
    return headers;
  }
  /** Which recovery a refused answer calls for, if any. */
  recoveryFor(status, data) {
    if (status === 401) return "session";
    if (isEncryptionBlocked(status, data)) return "escrow";
    return null;
  }
  /** Run the recovery for `kind`, or join the one already running. */
  recover(kind) {
    const running = this.recoveries.get(kind);
    if (running) return running;
    const hook = kind === "session" ? this.opts.onUnauthorized : this.opts.onEncryptionBlocked;
    const recovery = Promise.resolve().then(() => hook?.()).then(
      (recovered) => recovered === true,
      () => false
    ).finally(() => {
      this.recoveries.delete(kind);
    });
    this.recoveries.set(kind, recovery);
    return recovery;
  }
  /**
   * Send; if the answer is a wall a recovery can clear, wait for the (shared)
   * recovery and send ONCE more. `send` builds the request when called, so
   * the second send carries whatever the recovery changed. Anonymous requests
   * never recover: there is no session to mend.
   *
   * `throw: false` on requestUrl so 4xx/5xx come back as responses — Obsidian's
   * default throws, which would turn every expected 401 into an unhandled
   * rejection in a background interval.
   */
  async exchange(path, send, authed) {
    const turn = await this.budget.acquire(path);
    if (!turn.ok) {
      return { status: 429, ok: false, data: { retry_after: Math.ceil(turn.retryAfterMs / 1e3) }, error: "paused" };
    }
    let res;
    try {
      res = await send();
    } catch (err) {
      return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
    }
    let data = parseJson(res);
    const kind = authed ? this.recoveryFor(res.status, data) : null;
    if (kind && await this.recover(kind)) {
      const again = await this.budget.acquire(path);
      if (!again.ok) return { status: 429, ok: false, data: null, error: "paused" };
      try {
        res = await send();
      } catch (err) {
        return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
      }
      data = parseJson(res);
    }
    this.noteRefusal(path, res, data);
    if (res.status === 428) this.opts.onTermsRequired?.(data);
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data,
      error: errorCodeOf(data) ?? (res.status >= 400 ? `http_${res.status}` : null)
    };
  }
  /**
   * What a refusal means for the budget: 429 rests that endpoint for exactly
   * Retry-After; a bare 403 (not the encryption gate) is the WAF and rests
   * everything.
   */
  noteRefusal(path, res, data) {
    if (res.status === 429) this.budget.pause(path, retryAfterMs(res.headers, data));
    else if (isWafRefusal(res.status, data)) this.budget.pauseAll();
  }
  /** Authenticated POST. Every backend call in the plugin goes through here. */
  async post(path, body = {}, opts = {}) {
    const authed = !opts.anonymous && !!this.opts.authToken;
    return this.exchange(
      path,
      () => (0, import_obsidian25.requestUrl)({
        url: `${this.opts.baseUrl}${path}`,
        method: "POST",
        headers: this.headersFor({ "Content-Type": "application/json", ...opts.headers ?? {} }, authed),
        body: JSON.stringify(body),
        throw: false
      }),
      authed
    );
  }
  /**
   * Authenticated POST with a caller-assembled binary body (the resume upload's
   * hand-built multipart — requestUrl has no FormData). Same auth, same error
   * taxonomy as post().
   */
  async postRaw(path, body, contentType) {
    const authed = !!this.opts.authToken;
    return this.exchange(
      path,
      () => (0, import_obsidian25.requestUrl)({ url: `${this.opts.baseUrl}${path}`, method: "POST", headers: this.headersFor({ "Content-Type": contentType }, authed), body, throw: false }),
      authed
    );
  }
  /**
   * Authenticated GET. The card and relationship endpoints are query-param GETs
   * rather than POSTs, so the adapter has to speak both.
   */
  async get(path, opts) {
    const authed = !!this.opts.authToken;
    return this.exchange(
      path,
      () => (0, import_obsidian25.requestUrl)({ url: `${this.opts.baseUrl}${path}`, method: "GET", headers: this.headersFor({ ...opts?.headers }, authed), throw: false }),
      authed
    );
  }
  /**
   * The only way to send a journal entry. Asserts the invariant before the
   * request is built, so a violation can't reach the wire even in a mock.
   */
  async postJournal(path, payload) {
    assertEncrypted(payload);
    return this.post(path, payload);
  }
};
function parseJson(res) {
  try {
    return res.json ?? null;
  } catch {
    return null;
  }
}
function errorCodeOf(data) {
  if (data && typeof data === "object" && "error" in data) {
    const code = data.error;
    if (typeof code === "string") return code;
  }
  return null;
}
function networkErrorCode(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Failed to fetch/i.test(message) ? "offline" : "network_error";
}

// src/transport/mock.ts
var MOCK_TERMS_VERSION = "2026-09-01";
function ok(data) {
  return { status: 200, ok: true, data, error: null };
}
function fail(status, error) {
  return { status, ok: false, data: null, error };
}
var MockApi = class {
  constructor() {
    this.state = {
      revokedTokens: /* @__PURE__ */ new Set(),
      keks: /* @__PURE__ */ new Map(),
      transfers: /* @__PURE__ */ new Map(),
      meetings: /* @__PURE__ */ new Map(),
      journals: /* @__PURE__ */ new Map(),
      offline: false,
      linkedPrepSubjects: /* @__PURE__ */ new Set(),
      interactions: [],
      feedback: [],
      autoApproveAfterMs: 8e3
    };
    /**
     * The mock's stand-in for "some other device holds the account mDEK". Real
     * transfers carry the mDEK from an approving device; here we mint one once and
     * hand out the same key, so a restart genuinely re-derives the same content
     * key and mis-wired unwrapping shows up as garbled content rather than silence.
     */
    this.accountMDEK = randomBase64(32);
    this.accountRecoveryWrapped = null;
    /**
     * What changed since `since`: the mock has no clock of its own, so a first
     * sync (since 0) returns everything and a later one returns nothing —
     * unless a test nudged `mockChangedAt` above `since`. Pages by unit
     * (a card, a meeting, a journal day) so paging itself is exercised.
     */
    this.mockChangedAt = 17e11;
    /** The mock's magic email: request "sends" a token, validate accepts it once. */
    this.pendingMagicToken = null;
    // ── account surfaces (parity review 2026-08-26) ──────────────────────────
    // Enough shape to drive the settings UI offline, including the states that
    // are awkward to reach live: a second device you can revoke, and an
    // unverified alias waiting on a link nobody can click from a vault.
    this.mockDevices = [
      { device_id: "mock-this-device", device_name: "Obsidian \u2014 Vault", device_type: "obsidian", last_used_at: Date.now() },
      { device_id: "mock-other", device_name: "Chrome \u2014 MacBook", device_type: "web", last_used_at: Date.now() - 864e5 }
    ];
    this.mockEmails = [
      { email: "you@example.com", verified: true, is_primary: true },
      { email: "work@example.com", verified: false, is_primary: false }
    ];
    // ── P10: onboarding twins. State lives in-memory; the classifier is a word
    // counter (>= 8 words reads as a real answer) so both branches are drivable.
    this.mockAccountState = {
      onboarding_complete: false,
      myu_scripts: {}
    };
  }
  guard() {
    return this.state.offline ? fail(0, "offline") : null;
  }
  async exchangeToken(token, _deviceId) {
    const offline = this.guard();
    if (offline) return offline;
    if (!token || token.trim().length < 16) return fail(404, "invalid_token");
    if (this.state.revokedTokens.has(token)) return fail(410, "token_revoked");
    return ok({
      auth_token: `mock-session-${generateDeviceId()}`,
      account_id: "mock-account",
      // Mirrors the real gate: a fresh session is blocked until key escrow.
      encryption_blocked: true,
      // Flip to true to exercise the Tier-2 (escrowing) path.
      background_work_consented: false
    });
  }
  async escrowMDEK() {
    return this.guard() ?? ok({});
  }
  async storeDeviceKEK(deviceId, kekBase64) {
    const offline = this.guard();
    if (offline) return offline;
    this.state.keks.set(deviceId, kekBase64);
    return ok({});
  }
  async fetchDeviceKEK(deviceId) {
    const offline = this.guard();
    if (offline) return offline;
    const kek = this.state.keks.get(deviceId);
    if (!kek) return fail(404, "device_not_found");
    return ok({ device_kek: kek });
  }
  async requestDeviceTransfer(deviceId, publicKey) {
    const offline = this.guard();
    if (offline) return offline;
    const requestId = generateDeviceId();
    this.state.transfers.set(requestId, { deviceId, publicKey, approvedAt: Date.now() + this.state.autoApproveAfterMs });
    return ok({
      request_id: requestId,
      verification_code: String(Math.floor(1e3 + Math.random() * 9e3))
    });
  }
  async pollDeviceTransfer(requestId) {
    const offline = this.guard();
    if (offline) return offline;
    const transfer = this.state.transfers.get(requestId);
    if (!transfer) return fail(404, "request_not_found");
    if (transfer.approvedAt === null || Date.now() < transfer.approvedAt) return ok({ status: "pending" });
    return ok({ status: "approved", encrypted_mdek: this.accountMDEK });
  }
  async getPendingTransfers() {
    const offline = this.guard();
    if (offline) return offline;
    const rows = [...this.state.transfers.entries()].filter(([, t]) => t.approvedAt === null || Date.now() < t.approvedAt).map(([request_id, t]) => ({ request_id, device_name: "Mock device", public_key: t.publicKey }));
    return ok({ pending_requests: rows });
  }
  async approveDeviceTransfer(requestId, _code, encryptedMdek) {
    const offline = this.guard();
    if (offline) return offline;
    const transfer = this.state.transfers.get(requestId);
    if (!transfer) return fail(404, "request_not_found");
    transfer.approvedAt = Date.now();
    void encryptedMdek;
    return ok({});
  }
  async denyDeviceTransfer(requestId) {
    const offline = this.guard();
    if (offline) return offline;
    this.state.transfers.delete(requestId);
    return ok({});
  }
  async fetchRecoveryWrappedMDEK() {
    const offline = this.guard();
    if (offline) return offline;
    if (!this.accountRecoveryWrapped) return fail(404, "no_recovery_key");
    return ok({ wrapped_mdek_recovery: this.accountRecoveryWrapped });
  }
  async upsertJournal(payload) {
    const offline = this.guard();
    if (offline) return offline;
    const existing = this.state.journals.get(payload.external_id);
    if (existing) {
      existing.revision += 1;
      return ok({ ...existing, created: false });
    }
    const record = { journal_id: generateDeviceId(), revision: 1 };
    this.state.journals.set(payload.external_id, record);
    return ok({ ...record, created: true });
  }
  async getBrief() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      brief: {
        date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        suppressed_count: 1,
        // Cold start (week_state on, few journal entries): the day-one edition
        // leads, with the first-minutes progress alongside.
        progress: { stage: "first_minutes", people_read: 3, people_total: 7, meetings_this_week: 4, first_timers: 2, external: 1, mail_understood_back_to: null },
        sections: [
          {
            section: "week",
            title: "This week",
            visible: true,
            items: [
              {
                feed_item_id: "week_evt-1",
                type: "week_meeting",
                urgency: "info",
                text: "Priya Natarajan \u2014 Roadmap sync",
                entity_type: "person",
                entity_id: "rel-2",
                entity_references: [{ entity_type: "person", entity_id: "rel-2", display_name: "Priya Natarajan" }],
                actions: [{ action_type: "prep", label: "Prep \u25B8", target_id: "evt-1", primary: true }, { action_type: "capture_after", label: "Capture after \u25B8", target_id: "evt-1", primary: false }],
                meta: { event_id: "evt-1", relationship_id: "rel-2", when: new Date(Date.now() + 26 * 36e5).toISOString(), cold: true, first_time: true, external: true, facts: { role_line: "Head of Product at Lumen", why_meeting: "first meeting since the partnership announcement", mutual_ties: ["Marcus Webb"], public_context: ["Spoke at Config 2026 on roadmap rituals"] } }
              },
              {
                feed_item_id: "week_evt-2",
                type: "week_meeting",
                urgency: "info",
                text: "Marcus Webb \u2014 1:1",
                entity_type: "person",
                entity_id: "rel-1",
                entity_references: [{ entity_type: "person", entity_id: "rel-1", display_name: "Marcus Webb" }],
                actions: [{ action_type: "prep", label: "Prep \u25B8", target_id: "evt-2", primary: true }, { action_type: "capture_after", label: "Capture after \u25B8", target_id: "evt-2", primary: false }],
                meta: { event_id: "evt-2", relationship_id: "rel-1", when: new Date(Date.now() + 50 * 36e5).toISOString(), cold: false, first_time: false, external: false, facts: { role_line: null, why_meeting: null, mutual_ties: [], public_context: [] } }
              },
              { feed_item_id: "week_more", type: "week_more", text: "2 more, routine" }
            ]
          },
          {
            section: "today",
            visible: true,
            items: [
              {
                feed_item_id: "mock-1",
                text: "Marcus has been quiet since the reorg \u2014 three weeks.",
                entity_references: [{ entity_type: "person", entity_id: "rel-1", display_name: "Marcus Webb" }]
              },
              {
                feed_item_id: "mock-2",
                text: "You said you would send Priya the headcount note on Friday.",
                entity_references: [{ entity_type: "person", entity_id: "rel-2", display_name: "Priya Raman" }]
              },
              {
                // No entity: proves the row renders without an `open` it can't honour.
                feed_item_id: "mock-3",
                text: "A meeting was cancelled this morning.",
                entity_references: []
              }
            ]
          }
        ]
      }
    });
  }
  async listEntities(tab, _opts = {}) {
    const offline = this.guard();
    if (offline) return offline;
    if (tab === "company") {
      return ok({
        entities: [
          { entity_type: "company", entity_id: "co-1", display_name: "Acme", subtitle: "4 people you know", item_count: 2, top_urgency: "low" },
          { entity_type: "company", entity_id: "co-2", display_name: "Northwind", subtitle: "1 person you know", item_count: 0, top_urgency: "info" }
        ]
      });
    }
    return ok({
      entities: [
        { entity_type: "person", entity_id: "rel-1", display_name: "Marcus Webb", organization: "Acme", item_count: 3, top_urgency: "medium" },
        { entity_type: "person", entity_id: "rel-2", display_name: "Priya Raman", organization: "Northwind", item_count: 1, top_urgency: "low" }
      ]
    });
  }
  async getCard(entityType, entityId) {
    const res = await this.getCardBase(entityType, entityId);
    const card = res.ok ? res.data?.card : void 0;
    if (entityType === "person" && card) {
      const name = card.header?.display_name ?? card.header?.title ?? "them";
      card.mail_offer = {
        lead: `I can see the invite, and I can't see where you two left off. Connect mail and I read the history with ${name} \u2014 nothing else changes.`,
        trust_line: "Read-only. Content is used to build memory, then dropped. Myu never sends. Revoke any time.",
        options: [
          { id: "gmail", label: "Connect Gmail", init: { provider: "google", scope_set: "history", return_to: `card:${entityId}` } },
          { id: "microsoft", label: "Connect Microsoft mail", init: { provider: "microsoft", scope_set: "history", return_to: `card:${entityId}` } },
          { id: "archive", label: "Upload a mail archive" },
          { id: "imap", label: "IMAP" },
          { id: "not_now", label: "Not now" }
        ]
      };
    }
    return res;
  }
  async getCardBase(entityType, entityId) {
    const offline = this.guard();
    if (offline) return offline;
    if (entityType === "person" && entityId === "rel-2") {
      return ok({ response_type: "disambiguation_pending", suggestions: [
        { card_id: "lc-1", person_name: "Priya Raman", profile_headline: "Head of Platform at Northwind", linkedin_url: "https://linkedin.com/in/priya-raman-nw", confidence: 0.82 },
        { card_id: "lc-2", person_name: "Priya Raman", profile_headline: "Recruiter, Contoso", linkedin_url: "https://linkedin.com/in/priyaraman", confidence: 0.31 }
      ] });
    }
    if (entityType === "company") {
      return ok({
        card: {
          entity_id: entityId,
          header: { title: "Acme", subtitle: "4 people you know" },
          sections: [
            {
              section_type: "narrative",
              title: "read",
              narrative: "Two of your contacts there changed roles this quarter; the third has gone quiet."
            },
            { section_type: "people", title: "people here", items: [{ text: "Marcus Webb \u2014 engineering" }] }
          ]
        }
      });
    }
    return ok({
      card: {
        entity_id: entityId,
        header: { title: "Marcus Webb", subtitle: "Acme \xB7 engineering" },
        sections: [
          {
            section_type: "narrative",
            title: "read",
            narrative: "Quieter since the reorg \u2014 three weeks without the usual mid-week check-in."
          },
          {
            section_type: "threads",
            title: "open threads",
            items: [{ text: "The headcount proposal you owe him", date: "2026-08-04" }]
          }
        ]
      }
    });
  }
  async getCalendarEvents() {
    const offline = this.guard();
    if (offline) return offline;
    const soon = new Date(Date.now() + 90 * 60 * 1e3);
    return ok({
      events: [
        {
          event_id: "mock-event-1",
          summary: "Marcus / 1:1",
          start_time: soon.toISOString().replace("T", " ").slice(0, 19),
          all_day: false,
          status: "confirmed",
          attendee_emails: ["marcus@example.com"]
        }
      ]
    });
  }
  /**
   * Two prep shapes, switched by event id, so BOTH card states demo offline:
   * the default is a warm read (claims + notes captured); `mock-event-cold`
   * exercises the cold/unlinked path — factual only, subject is a bare email,
   * `who is this?` must appear and the searchEntities → linkPrepSubject loop
   * must be walkable.
   */
  async getMeetingPrep(eventId) {
    const offline = this.guard();
    if (offline) return offline;
    if (this.state.linkedPrepSubjects.has(eventId) || !eventId.includes("cold")) {
      const now = Date.now();
      return ok({
        prep: {
          prep_id: `mock-prep-${eventId}`,
          subject: { entity_type: "person", entity_id: "rel-1", display_name: "Marcus Webb" },
          meeting: { meeting_id: eventId, title: "Marcus / 1:1", starts_at: now + 90 * 60 * 1e3 },
          data_tier: "medium",
          generated_at: now,
          watch: {
            text: "'process' has come up in his last three messages \u2014 twice unprompted.",
            last_updated: now - 3 * 864e5,
            evidence_refs: [
              { evidence_id: "ev-1", label: "Slack \u2014 #platform, Aug 14" },
              { evidence_id: "ev-2", label: "Email \u2014 re: sync cadence, Aug 12" }
            ]
          },
          stand: {
            text: "Steadier than last month \u2014 a read, worth testing: the reorg pressure seems to have eased.",
            last_updated: now - 5 * 864e5,
            evidence_refs: [{ evidence_id: "ev-3", label: "1:1 notes \u2014 Aug 5" }]
          },
          thread: {
            text: "The headcount proposal is still open between you \u2014 three weeks now.",
            last_updated: now - 21 * 864e5,
            evidence_refs: []
          },
          move: { text: "Name the question you both keep circling.", last_updated: now - 3 * 864e5 },
          capture_hook: true,
          notes_captured: true,
          notes_summary: "Platform sync \u2014 ownership split agreed; two follow-ups assigned.",
          notes_decision_count: 1,
          notes_action_count: 2,
          notes_meeting_id: "mock-meeting-1"
        }
      });
    }
    return ok({
      prep: {
        prep_id: `mock-prep-${eventId}`,
        subject: { entity_type: "person", entity_id: "jim@northwind.example", display_name: "jim" },
        meeting: { meeting_id: eventId, title: "Daily Sync", starts_at: Date.now() + 45 * 60 * 1e3 },
        data_tier: "cold",
        generated_at: Date.now(),
        stand: null,
        thread: null,
        watch: null,
        move: null,
        factual: {
          role_line: "Engineering \u2014 Northwind",
          why_meeting: "Recurring sync on the shared invite.",
          no_history: true
        },
        capture_hook: true
      }
    });
  }
  async linkPrepSubject(eventId) {
    const offline = this.guard();
    if (offline) return offline;
    this.state.linkedPrepSubjects.add(eventId);
    return ok({});
  }
  async searchEntities(query) {
    const offline = this.guard();
    if (offline) return offline;
    const all = [
      { entity_type: "person", entity_id: "rel-1", display_name: "Marcus Webb", organization: "Acme", item_count: 3, top_urgency: "medium" },
      { entity_type: "person", entity_id: "rel-2", display_name: "Priya Raman", organization: "Northwind", item_count: 1, top_urgency: "low" },
      { entity_type: "person", entity_id: "rel-3", display_name: "Jim Halvorsen", organization: "Northwind", item_count: 0, top_urgency: "info" }
    ];
    const q = query.toLowerCase();
    return ok({ results: all.filter((e) => e.display_name.toLowerCase().includes(q)) });
  }
  async ingestMeetingNote(payload) {
    const offline = this.guard();
    if (offline) return offline;
    if (!payload.occurred_at_ms) return fail(400, "missing_occurred_at");
    if (payload.content.length > 200 * 1024) return fail(400, "content_too_large");
    const hash = String(payload.content.length) + ":" + payload.content.slice(0, 32);
    const existing = this.state.meetings.get(payload.external_id);
    if (existing) {
      if (existing.hash === hash) return ok({ meeting_id: existing.meeting_id, created: false, reextracted: false });
      existing.hash = hash;
      return ok({ meeting_id: existing.meeting_id, created: false, reextracted: true });
    }
    const meeting_id = generateDeviceId();
    this.state.meetings.set(payload.external_id, { meeting_id, hash });
    return ok({ meeting_id, created: true, reextracted: false });
  }
  async createChatEntry(_accountId, content, context, _templateType, canvas) {
    const offline = this.guard();
    if (offline) return offline;
    const out = { journal_id: `mock-journal-${generateDeviceId().slice(0, 8)}`, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    return ok(out);
  }
  /** The backend's canvas side (CreateJournalEntry / CreateJournalChat): a named canvas is mutated. */
  canvasSide(compositionId, content) {
    return {
      composition_id: compositionId,
      summary_text: "Updated from the thread",
      surface_mutations: [{ op: "add", target_id: "", position: "end", components: [{ id: `chat-${Date.now()}`, type: "text_block", label: "From the thread", data: { text: `You asked: \u201C${content.slice(0, 80)}\u201D \u2014 noted on the canvas.` } }] }]
    };
  }
  async addChatTurn(_accountId, journalId, content, context, canvas) {
    const offline = this.guard();
    if (offline) return offline;
    const out = { journal_id: journalId, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    return ok(out);
  }
  /** Canned but state-aware enough to demo: "team" earns a composition offer. */
  reply(content, context) {
    const blocks = [
      {
        type: "conversational",
        text: context ? `About that (${context.source}) \u2014 noted. What stands out to you?` : "I hear you. What's underneath that?"
      }
    ];
    if (/team|group|landscape/i.test(content)) {
      blocks.push({
        type: "composition_offer",
        composition_id: "mock-comp-1",
        summary_text: "Team read \u2014 platform group",
        action_label: "See the team read"
      });
    }
    return blocks;
  }
  async executeCompositionAction(_compositionId, componentId, action) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      success: true,
      surface_mutations: [{ op: "replace", target_id: componentId, components: [{ id: componentId, type: "text_block", data: { text: `\u2713 ${action.replace(/_/g, " ")}` } }] }]
    });
  }
  async persistCompositionMutations() {
    const offline = this.guard();
    return offline ?? ok({ success: true });
  }
  async requestDataExport() {
    return this.guard() ?? ok({ success: true, export_id: "exp-mock", passphrase: "orbit velvet cinder maple quartz harbor" });
  }
  async postCompositionInteraction(events, generateResponse) {
    const offline = this.guard();
    if (offline) return offline;
    this.state.interactions.push(...events);
    return ok({ success: true, ack: true, ...generateResponse ? { response_generating: true } : {} });
  }
  async getHelpMyuQueue() {
    return this.guard() ?? ok({ queue: [
      { item_type: "linkedin_disambiguation", relationship_id: "rel-2", display_name: "Priya Raman", organization: "Northwind", suggestion_count: 2 },
      { item_type: "merge_candidate", source: { relationship_id: "rel-3", display_name: "Marcus W." }, target: { relationship_id: "rel-1", display_name: "Marcus Webb", subtitle: "VP Eng @ Acme" }, reason: "same email domain and first name" }
    ], total_count: 2 });
  }
  async getRelatedPersons() {
    return this.guard() ?? ok({ related: [{ relationship_id: "rel-2", display_name: "Priya Raman", subtitle: "Northwind", weight: 0.8 }] });
  }
  async getRelatedMemories() {
    return this.guard() ?? ok({ related: [{ memory_id: "m-9", content: "Asked for the headcount plan twice.", memory_date: "2026-08-20", source_type: "journal_entry", source_id: "mock-j-1" }] });
  }
  async getEntityDispatch() {
    return this.guard() ?? ok({ dispatch_sentence: "Quieter since the reorg; the weekly has slipped twice.", dispatch_category: "attention", dispatch_receipt: { signal_fingerprint: "fp-1" } });
  }
  async dismissEntityDispatch() {
    return this.guard() ?? ok({});
  }
  async searchFeed(q) {
    const offline = this.guard();
    if (offline) return offline;
    const people = /mar/i.test(q) ? [{ entity_id: "rel-1", header: { display_name: "Marcus Webb", subtitle: "VP Eng \xB7 Acme" } }] : [];
    return ok({ results: { people, companies: /acme/i.test(q) ? [{ entity_id: "co-1", header: { display_name: "Acme" } }] : [], feed_items: [], total_count: people.length } });
  }
  async getSourceDetail(sourceType, sourceId) {
    return this.guard() ?? ok({ detail: { source_type: sourceType, source_id: sourceId, title: "Journal, 2026-08-20", subtitle: "you wrote", timestamp: 175568e7, memories: [{ memory_id: "m-9", content: "Asked for the headcount plan twice.", memory_type: "observation" }] } });
  }
  async setRelationshipLinkedIn() {
    return this.guard() ?? ok({ success: true });
  }
  async rejectMerge() {
    return this.guard() ?? ok({ success: true });
  }
  async addMeetingDecision() {
    return this.guard() ?? ok({ success: true, decision_id: `dec-${generateDeviceId().slice(0, 6)}` });
  }
  async addMeetingCommitment() {
    return this.guard() ?? ok({ success: true, commitment_id: `cmt-${generateDeviceId().slice(0, 6)}` });
  }
  async getDriveSuggestions() {
    return this.guard() ?? ok({ suggestions: [{ id: "sug-1", file_id: "f-1", file_type: "gdoc", source_email_subject: "Notes: Platform weekly", source_email_sender: "dana@acme.com", source_email_date: "2026-08-27", meeting_likelihood_score: 0.9, meeting_signals: ["agenda", "attendees"] }], count: 1 });
  }
  async importFromDrive(fileIds) {
    return this.guard() ?? ok({ success: true, results: fileIds.map((f) => ({ file_id: f, status: "imported", title: "Platform weekly" })), imported_count: fileIds.length });
  }
  async dismissDriveSuggestion() {
    return this.guard() ?? ok({});
  }
  /** The six Today reads in one answer — each part the payload its own method serves. */
  async getTodayBundle(_start, _end, _timezone) {
    const offline = this.guard();
    if (offline) return offline;
    const part = async (p) => {
      const r = await p.catch(() => null);
      return r?.ok ? r.data ?? null : null;
    };
    const [brief, events, mirror, weekly, loop, help] = await Promise.all([
      part(this.getBrief()),
      part(this.getCalendarEvents()),
      part(this.getMirrorEdition()),
      part(this.getWeeklyReview()),
      part(this.getPersonalLoop()),
      part(this.getHelpMyuQueue())
    ]);
    return ok({ brief, events, mirror, weekly, loop, help_queue: help, server_time: Date.now() });
  }
  async getVaultChanges(since, cursor = null, pageSize = 50) {
    const offline = this.guard();
    if (offline) return offline;
    const units = [];
    if (since < this.mockChangedAt) {
      for (const tab of ["person", "company"]) {
        const listed = await this.listEntities(tab);
        for (const e of listed.data?.entities ?? []) {
          const card = await this.getCard(tab, e.entity_id);
          units.push({ kind: tab, item: { ...card.data ?? {}, entity_id: e.entity_id, changed_at: this.mockChangedAt } });
        }
      }
      const meetings = await this.listMeetings();
      for (const m of meetings.data?.meetings ?? []) units.push({ kind: "meeting", item: m });
      const journal = await this.getJournalEntries();
      const byDay = /* @__PURE__ */ new Map();
      for (const entry of journal.data?.entries ?? []) {
        const when = typeof entry.timestamp === "number" ? new Date(entry.timestamp) : new Date(String(entry.date ?? entry.created_at ?? ""));
        if (Number.isNaN(when.getTime())) continue;
        const day = when.toISOString().slice(0, 10);
        byDay.set(day, [...byDay.get(day) ?? [], entry]);
      }
      for (const [day, entries] of byDay) units.push({ kind: "day", item: { day, entries } });
    }
    const offset = cursor ? Number(cursor) || 0 : 0;
    const slice = units.slice(offset, offset + pageSize);
    const page = { server_time: Date.now(), since, people: [], companies: [], meetings: [], journal_days: [], next_cursor: offset + pageSize < units.length ? String(offset + pageSize) : null };
    if (offset === 0) {
      page.self = (await this.getSelfCard()).data ?? null;
      page.removed = [];
    }
    for (const u of slice) {
      if (u.kind === "person") page.people.push(u.item);
      else if (u.kind === "company") page.companies.push(u.item);
      else if (u.kind === "meeting") page.meetings.push(u.item);
      else page.journal_days.push(u.item);
    }
    return ok(page);
  }
  async getFeatures() {
    return this.guard() ?? ok({
      cold_start: { split_consent: true, onboarding_payback: true, offer_block: true, week_state: true, per_card_offer: true, self_card_legible: true },
      // Batched reads (2026-09-03): the mock serves the bundle and the delta feed from its own fixtures.
      today_bundle: true,
      vault_changes: true,
      entities_changed_ids: true,
      entity_changed_at: true,
      retry_after_header: true,
      // The beta-terms block (2026-09-02): the demo account has agreed to the current bundle.
      terms: { current_version: MOCK_TERMS_VERSION, required: [], satisfied: true, accepted_versions: { beta_participation: MOCK_TERMS_VERSION, privacy_policy: MOCK_TERMS_VERSION }, urls: { ...TERMS_FALLBACK_URLS }, gate_enabled: true }
    });
  }
  /** `GET /terms` — public; what the Create-account door shows. */
  async getTerms() {
    return this.guard() ?? ok({ success: true, current_version: MOCK_TERMS_VERSION, required: ["beta_participation", "privacy_policy"], urls: { ...TERMS_FALLBACK_URLS } });
  }
  async acceptTerms(termsVersion) {
    const offline = this.guard();
    if (offline) return offline;
    return termsVersion === MOCK_TERMS_VERSION ? ok({ success: true }) : fail(400, "terms_version_not_accepted");
  }
  async addIcalUrl(url) {
    const offline = this.guard();
    if (offline) return offline;
    if (!/^(https:\/\/|webcal:\/\/)/.test(url)) return ok({ success: false, error: "A private iCal address starts with https:// (or webcal://)." });
    return ok({ success: true, source_id: "ical-1", events_stored: 9 });
  }
  async uploadIcs(bytes) {
    return this.guard() ?? ok({ success: true, events_stored: Math.max(1, Math.round(bytes.byteLength / 400)) });
  }
  async createCareerTrajectory() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ success: true, composition_id: "mock-career", composition: { id: "mock-career", summary_text: "Builder to operator", components: [{ id: "ct", type: "career_trajectory", data: { pattern_name: "Builder to operator", current_phase_name: "Scaling", current_phase_description: "Hiring faster than delegating.", phases: [{ id: "p2", name: "Scaling", description: "Hiring.", status: "current" }] } }] } });
  }
  async googleOAuthDisconnect() {
    return this.guard() ?? ok({ success: true, message: "Disconnected" });
  }
  async googleSetPrimaryCredential() {
    return this.guard() ?? ok({ success: true, message: "Primary set" });
  }
  async microsoftOAuthDisconnect() {
    return this.guard() ?? ok({ success: true, message: "Disconnected" });
  }
  async microsoftSetPrimaryCredential() {
    return this.guard() ?? ok({ success: true, message: "Primary set" });
  }
  async slackConnect() {
    return this.guard() ?? ok({ authorization_url: "https://slack.com/oauth/v2/authorize?client_id=mock" });
  }
  async slackDisconnect() {
    return this.guard() ?? ok({ success: true });
  }
  async zulipConnect(realmUrl) {
    return this.guard() ?? ok({ success: true, connection_id: "zc-1", realm_name: realmUrl.replace(/^https?:\/\//, "") });
  }
  async zulipDisconnect() {
    return this.guard() ?? ok({ success: true });
  }
  async updateAccountName() {
    return this.guard() ?? ok({ success: true, message: "Account updated successfully" });
  }
  async getAccountCareer() {
    return this.guard() ?? ok({ status: "ok", summary: "Engineering leader; platform teams; two companies.", linkedin_data_id: "masumi-example" });
  }
  async getPersonalLoop() {
    return this.guard() ?? ok({ loop: { loop_id: "loop-1", statement: "You take on the hard conversation yourself rather than hand it off, and then run out of week.", state: "mirrored", confidence: 0.7, domain: "career" }, coupled_loops: [{ to_loop_id: "loop-2", type: "drains", confidence: 0.6, other_statement: "Evenings go to catching up instead of resting.", other_domain: "energy" }] });
  }
  async submitFeedbackSignal() {
    return this.guard() ?? ok({ success: true, signal_id: "sig-1" });
  }
  async submitFeedback(body) {
    const offline = this.guard();
    if (offline) return offline;
    this.state.feedback.push(body);
    return ok({ success: true, message: "Feedback submitted successfully" });
  }
  async refreshComposition(compositionId) {
    const offline = this.guard();
    if (offline) return offline;
    const res = await this.getComposition(compositionId);
    return ok({ success: true, composition: res.data?.composition });
  }
  async getCompositionHistory() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      compositions: [
        { id: "comp-team", composition_id: "comp-team", source_flow: "team_read", summary_text: "Team read \u2014 platform group", subject_name: "Platform", component_count: 5, created_at: 17562e8 },
        { id: "comp-marcus", composition_id: "comp-marcus", source_flow: "person", summary_text: "Where things stand with Marcus", subject_name: "Marcus Webb", component_count: 3, created_at: 17561e8 },
        { id: "comp-old", composition_id: "comp-old", summary_text: "An expired one", created_at: 175e10, is_expired: true }
      ],
      total: 3
    });
  }
  async getCompositionForJournal(journalId) {
    const offline = this.guard();
    if (offline) return offline;
    if (journalId.includes("bare")) return ok({ composition: null, status: "no_composition" });
    if (journalId === "mock-j-3") {
      const welcome = (await this.getComposition("mock-welcome")).data?.composition;
      return ok({ composition: welcome ?? null, composition_id: welcome?.id, turn_number: 1 });
    }
    const spec = (await this.getComposition(`comp-for-${journalId}`)).data?.composition;
    return ok({ composition: spec ?? null, composition_id: spec?.id, turn_number: 1 });
  }
  /** `all=true` — every canvas the conversation made. `mock-j-1` made two, on
      different replies, so demo mode exercises the placement rather than the
      one-canvas case the single call can already show. */
  async getCompositionsForJournal(journalId) {
    const offline = this.guard();
    if (offline) return offline;
    if (journalId.includes("bare")) return ok({ success: true, count: 0, compositions: [] });
    if (journalId === "mock-j-1") {
      return ok({ success: true, count: 2, compositions: [
        { composition_id: "comp-for-mock-j-1-a", turn_number: 1, summary_text: "What to ask each firm", is_expired: true, component_count: 5 },
        { composition_id: "comp-for-mock-j-1", turn_number: 2, summary_text: "Team read \u2014 platform group", is_expired: false, component_count: 5 }
      ] });
    }
    const single = (await this.getCompositionForJournal(journalId)).data;
    if (!single?.composition_id) return ok({ success: true, count: 0, compositions: [] });
    return ok({ success: true, count: 1, compositions: [
      { composition_id: single.composition_id, turn_number: single.turn_number ?? 1, summary_text: single.composition?.summary_text ?? "", is_expired: false }
    ] });
  }
  async getComposition(compositionId) {
    const offline = this.guard();
    if (offline) return offline;
    if (compositionId === "mock-welcome") {
      return ok({ composition: { id: compositionId, summary_text: "Welcome", components: [
        { id: "w1", type: "text_block", data: { text: "You named Priya as the one that matters this week." } },
        { id: "w2", type: "offer_block", data: {
          lead: "I can prepare you for Priya on Thursday \u2014 if I can see your week.",
          gap_line: "Right now I know what you told me, and nothing about when you meet.",
          options: [
            { id: "calendar_google", label: "Connect Google Calendar" },
            { id: "calendar_microsoft", label: "Connect Microsoft Calendar" },
            { id: "calendar_ical", label: "Paste a calendar link" },
            { id: "calendar_ics", label: "Upload an .ics" },
            { id: "just_tell", label: "I'll just tell you" },
            { id: "stop_asking", label: "Stop asking" }
          ],
          stopped_ack: "Done \u2014 I won't bring this up again. You can connect anything whenever you want, in Settings under Integrations.",
          trust_line: "Read-only. Myu prepares; it never sends anything.",
          named_person: { relationship_id: "rel-2", name: "Priya", when_text: "this week", from: "you" }
        } }
      ] } });
    }
    return ok({
      composition: {
        id: compositionId,
        summary_text: "Team read \u2014 platform group",
        components: [
          { id: "c1", type: "text_block", data: { text: "The platform group is steadier than last month." } },
          { id: "c2", type: "person_card", label: "Marcus Webb", data: { name: "Marcus Webb" } },
          { id: "c3", type: "person_card", label: "Priya Raman", data: { name: "Priya Raman" } },
          { id: "c4", type: "chart", label: "Trust over time", data: {} },
          {
            id: "g1",
            type: "container",
            label: "the pair to watch",
            data: { child_ids: ["c2", "c3"] }
          }
        ]
      }
    });
  }
  async getWeeklyReview() {
    const offline = this.guard();
    if (offline) return offline;
    const now = /* @__PURE__ */ new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
    return ok({
      edition: {
        edition_id: "mock-week-1",
        period: `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
        generated_at: Date.now(),
        sections: [
          { section: "movement", line: "Two relationships moved this week.", items: ["Marcus \u2014 steadier", "Priya \u2014 quieter"] },
          { section: "held", line: "One commitment is three weeks old.", items: [] }
        ]
      }
    });
  }
  async getMirrorEdition() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      edition: {
        edition_id: "mock-edition-1",
        period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7),
        generated_at: Date.now(),
        observations: [
          {
            observation_id: "mock-obs-map",
            pattern_id: "career_map:first_time_manager",
            layer: "map",
            text: "You placed yourself at the first-time-manager moment. People at this point typically find their calendar fills before their judgement adjusts. Does that match where you are?",
            receipts: [
              { source_class: "user_stated", label: "Your own career-moment classification" },
              { source_class: "reference", label: "The career-pattern library: First-time manager" }
            ]
          },
          {
            observation_id: "mock-obs-1",
            pattern_id: "mock-pattern-1",
            layer: "observed",
            forming: true,
            text: "Threads with Marcus tend to go quiet after you hand something off (early signal \u2014 the pattern is still forming).",
            receipts: [{ source_class: "journal", label: "Three handoffs since June, each followed by 2+ quiet weeks" }]
          }
        ]
      }
    });
  }
  async submitPatternFeedback(_eventType, _patternId, _sourceSurface) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({});
  }
  /** P8 — resolved unless the mock is told otherwise; unticks queue. */
  async vaultInteraction(events) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      results: events.map((e) => ({
        myu_id: e.myu_id,
        kind: e.kind,
        outcome: e.kind === "tick" ? "resolved" : e.kind === "untick" ? "queued" : "absorbed"
      }))
    });
  }
  async listVaultCommitments() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      commitments: [
        {
          commitment_id: "com-1",
          content: "Send the platform deck",
          owner: "Priya Raman",
          owner_relationship_id: "rel-2",
          deadline: "2026-08-22",
          status: "open",
          meeting_title: "Platform sync"
        },
        {
          commitment_id: "com-2",
          content: "Follow up on the headcount ask",
          owner: "Marcus Webb",
          owner_relationship_id: "rel-1",
          status: "open",
          meeting_title: "Weekly 1:1"
        }
      ]
    });
  }
  /** P9 — signup succeeds and mints a mock session, like the real flat shape. */
  async createAccount(_email, _name, _password) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ autoken: `mock-session-${randomBase64(6)}`, account_id: "mock-account" });
  }
  async createPluginToken(_label) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ token: `mock-plugin-token-${randomBase64(6)}`, token_id: "mock-token-id" });
  }
  async requestMagicLink(_email, _name) {
    const offline = this.guard();
    if (offline) return offline;
    this.pendingMagicToken = `mock-magic-${randomBase64(6)}`;
    return ok({ expires_in_minutes: 15 });
  }
  async validateMagicLink(token) {
    const offline = this.guard();
    if (offline) return offline;
    if (!this.pendingMagicToken || token !== this.pendingMagicToken) {
      return fail(404, "token_not_found");
    }
    this.pendingMagicToken = null;
    return ok({
      auth_token: `mock-session-${randomBase64(6)}`,
      account_id: "mock-account",
      is_new_account: true
    });
  }
  async resolveLinkedInSuggestion() {
    return ok({});
  }
  async confirmIdentity(_relationshipId) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ confirmed: true });
  }
  async getBoardLite(_entityType, _entityId) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      takes: [
        {
          advisor_id: "strategic_advisor",
          advisor_name: "The strategist",
          take_text: "The friction here is information asymmetry, not disagreement \u2014 get them the same data and re-ask."
        },
        {
          advisor_id: "relationship_counsel",
          advisor_name: "The counsel",
          take_text: "He has flagged workload twice without being asked once. That pattern usually precedes a resignation, not a complaint."
        }
      ],
      full_deliberation_available: true
    });
  }
  async setupRecovery(_wrappedMdekRecovery) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({});
  }
  async googleOAuthInit(_opts) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ auth_url: "https://accounts.google.com/o/oauth2/mock" });
  }
  async microsoftOAuthInit(_opts) {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ auth_url: "https://login.microsoftonline.com/mock" });
  }
  async getRelationshipMemories() {
    return ok({ memories: { email: [{ content: "Prefers early-morning meetings; mentioned a move to Osaka.", memory_date: "2026-08-01" }], journal: {} } });
  }
  async getSelfCard() {
    return ok({ card: { known_facts: [
      { key: "title", value: "Founder, askMyu", source: "linkedin", kind: "fact" },
      { key: "career", value: "Twelve years in product, now building the second company.", source: "read", kind: "read" },
      { key: "people", value: "Marcus Webb, Priya Natarajan", source: "you", kind: "fact" },
      { key: "week", value: "4 meetings in the next 7 days", source: "calendar", kind: "fact" },
      { key: "mail", value: "Where you and the people you named left off", source: "mail", kind: "not_yet" }
    ] } });
  }
  async listMeetings() {
    return ok({ meetings: [], total: 0 });
  }
  async getMeetingDetail() {
    return ok({ meeting: {} });
  }
  // Past conversations, so the chat browser and the export have rows to show.
  async getJournalEntries() {
    return this.guard() ?? ok({ entries: [
      { journal_id: "mock-j-1", content: "so this whole shopping for a corporate law firm is very new to me. Jenny has been helping", created_at: "2026-08-28T15:10:00Z" },
      { journal_id: "mock-j-2", content: "How it went with Francesca: it was a good conversation. To provide more context, I am", created_at: "2026-08-27T09:00:00Z" },
      { journal_id: "mock-j-3", content: "so today i have a bunch of meetings. i feel like i am not quite prepared for any of them.", created_at: "2026-08-25T08:30:00Z" }
    ] });
  }
  async getJournalChats(journalId) {
    const offline = this.guard();
    if (offline) return offline;
    if (journalId === "mock-j-2") {
      return ok({
        chats: [
          { content: "After the meeting with Priya: she pushed back on the timeline, I agreed to send the revised plan Friday." },
          { content: JSON.stringify({ content: [{ type: "conversational", text: "Captured. The commitment to Priya is on the board." }] }) }
        ],
        offer: {
          moment: "notes",
          journal_id: "mock-j-2",
          lead: "You brought these notes in yourself. If they live in Google Docs, I read them myself next time and prep comes pre-filled.",
          trust_line: "Read-only. Docs are read for meeting prep and memory, then left alone. Revoke any time in Settings.",
          stopped_ack: "Done \u2014 I won't bring this up again. You can connect anything whenever you want, in Settings under Integrations.",
          options: [
            { id: "drive_google", label: "They're in Google Docs \u2014 read them", init: { provider: "google", scope_set: "drive", return_to: "dashboard" } },
            { id: "notes_transcripts", label: "They're in a transcript tool" },
            { id: "notes_none", label: "No notes to read" },
            { id: "stop_asking", label: "Stop asking" }
          ]
        }
      });
    }
    if (journalId !== "mock-j-1") return ok({ chats: [] });
    return ok({ chats: [
      { content: JSON.stringify({ content: [{ type: "conversational", text: "Shopping for counsel is mostly shopping for **judgement**. Three things to ask each firm:\n\n1. Who actually does the work\n2. How they bill the first call\n3. What they would *not* take on" }] }) },
      { content: "what should I ask about fees?" },
      { content: JSON.stringify({ content: [{ type: "conversational", text: "Ask for a *capped* first engagement. See [1]." }], references: [{ id: "1", title: "Your note: law firm shortlist", url: "obsidian://open?file=law" }] }) }
    ] });
  }
  async setBackgroundWorkConsent(consented) {
    return ok({ background_work_consented: consented });
  }
  async listGenericEmailAccounts() {
    return ok({ accounts: [] });
  }
  async addImapConnection() {
    return ok({});
  }
  async testImapConnection() {
    return ok({});
  }
  async removeGenericEmailAccount() {
    return ok({});
  }
  async listCalDavAccounts() {
    return ok({ accounts: [] });
  }
  async addCalDavAccount() {
    return ok({});
  }
  async testCalDavConnection() {
    return ok({});
  }
  async removeCalDavAccount() {
    return ok({});
  }
  async getSlackConnections() {
    return ok({ connections: [] });
  }
  async getZulipConnections() {
    return ok({ connections: [] });
  }
  async listDevices() {
    return ok({ devices: this.mockDevices });
  }
  async removeDevice(deviceId) {
    this.mockDevices = this.mockDevices.filter((d) => d.device_id !== deviceId);
    return ok({});
  }
  async renameDevice(deviceId, deviceName) {
    for (const d of this.mockDevices) if (d.device_id === deviceId) d.device_name = deviceName;
    return ok({});
  }
  async listAccountEmails() {
    return ok({ emails: this.mockEmails });
  }
  async addAccountEmail(email) {
    this.mockEmails.push({ email, verified: false, is_primary: false });
    return ok({});
  }
  async resendAccountEmail(_email) {
    return ok({});
  }
  async removeAccountEmail(email) {
    this.mockEmails = this.mockEmails.filter((e) => e.email !== email);
    return ok({});
  }
  async setPrimaryAccountEmail(email) {
    for (const e of this.mockEmails) e.is_primary = e.email === email;
    return ok({});
  }
  async getAccountPreferences() {
    return ok({ preferences: { preferred_address: "", coaching_preference: "auto" } });
  }
  async updateAccountPreferences(_body) {
    return ok({});
  }
  async updateRelationshipProfile(_id, _fields) {
    return ok({});
  }
  async editRelationshipMemory(_memoryId, _action, _correction) {
    return ok({});
  }
  async mergeRelationships() {
    return this.guard() ?? ok({ success: true });
  }
  async markRelationshipAsSelf() {
    return this.guard() ?? ok({ success: true });
  }
  async archiveRelationship(_id, _action) {
    return ok({});
  }
  async purgeRelationship(_id) {
    return ok({});
  }
  async deleteAccount(_confirmation) {
    return ok({});
  }
  async googleOAuthStatus() {
    return ok({ connected: true, split_consent: true, credentials: [{
      credential_id: "cred-1",
      email: "you@example.com",
      sync_gmail: false,
      sync_calendar: true,
      is_primary: true,
      connected_at: new Date(Date.now() - 864e5).toISOString(),
      granted_scopes: ["calendar"],
      health: "ok",
      services: {
        calendar: { state: "connected", last_sync_at: new Date(Date.now() - 4 * 6e4).toISOString(), events_synced: 18 },
        mail: { state: "not_yet", last_sync_at: null, understood_back_to: null, still_reading: false, oldest_date_limit: null },
        meeting_notes: { state: "not_yet", last_sync_at: null }
      }
    }] });
  }
  async setMailOldestDate(_provider, credentialId, ymd) {
    if (ymd !== null && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ok({ success: false, error: "mail_oldest_date must be YYYY-MM-DD or null" });
    return ok({ success: true, message: `Settings updated for ${credentialId}` });
  }
  async microsoftOAuthStatus() {
    return ok({ connected: false, credentials: [] });
  }
  async getAccountState() {
    return ok({ ...this.mockAccountState });
  }
  async updateAccountState(_accountId, update) {
    if (update.onboardingComplete) this.mockAccountState.onboarding_complete = true;
    if (update.myuScripts) Object.assign(this.mockAccountState.myu_scripts, update.myuScripts);
    return ok({});
  }
  async linkedinSeek(_accountId, linkedinUrl) {
    if (!linkedinUrl.includes("linkedin.com/in/")) return { status: 400, ok: false, data: null, error: "invalid_url" };
    return ok({ body: { content: "A career summary, mocked: ten years of building things with people." } });
  }
  async saveLinkedinId() {
    return ok({});
  }
  async queryCurrentEmployment() {
    return ok({});
  }
  async confirmCurrentEmployment() {
    return ok({ companies: [{ company: "Mock & Co" }], role: "Founder" });
  }
  async resumeUpload() {
    return ok({ resume_id: "mock-resume", summary: "A mocked decade: engineering, then leading engineers." });
  }
  async saveResumeId() {
    return ok({});
  }
  async classifyCareerMoment(_accountId, content) {
    const words = content.trim().split(/\s+/).length;
    const scripts = this.mockAccountState.myu_scripts;
    scripts.onboard_moment_attempt_count = (scripts.onboard_moment_attempt_count ?? 0) + 1;
    if (words >= 8) return ok({ confidence: 0.9, moment_captured: true });
    return ok({ confidence: 0.1, moment_captured: false });
  }
};
function randomBase64(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

// src/crypto/KeyHolder.ts
var KeyHolder = class {
  constructor() {
    this.mDEK = null;
  }
  get isUnlocked() {
    return this.mDEK !== null;
  }
  set(key) {
    this.mDEK = key;
  }
  /**
   * The key, or null. Callers that need it must handle null rather than assert —
   * a relock can happen between a caller's check and its use (revocation,
   * restart, user disconnect), and a thrown "key missing" in the capture path
   * would surface as a lost note.
   */
  get() {
    return this.mDEK;
  }
  /**
   * Export the raw key for session escrow (`POST /account/session/escrow-key`).
   * The backend holds it for the escrow TTL so async work can unwrap content —
   * the established architecture, not a plugin-specific concession.
   */
  async exportForEscrow() {
    if (!this.mDEK) throw new Error("locked");
    return exportKeyAsBase64(this.mDEK);
  }
  clear() {
    this.mDEK = null;
  }
};

// src/auth/UnlockMachine.ts
var TERMINAL_AUTH_ERRORS = /* @__PURE__ */ new Set(["invalid_token", "token_revoked", "token_used", "token_expired", "token_not_found"]);
function isTerminalAuthError(res) {
  if (res.error === "offline" || res.error === "network_error") return false;
  if (res.status === 429 || res.status >= 500 || res.status === 0) return false;
  if (res.error && TERMINAL_AUTH_ERRORS.has(res.error)) return true;
  return res.status === 400 || res.status === 404 || res.status === 410;
}
var UnlockMachine = class {
  constructor(deps) {
    this.deps = deps;
    this.state = "disconnected";
    /** The one re-mint / re-escrow in flight — every 401 / 403-enc of a burst joins it. */
    this.remint = null;
    this.reescrow = null;
    this.transferKeys = null;
    this.pollTimer = null;
    this.approvalState = null;
    this.approvalObservers = /* @__PURE__ */ new Set();
    /** Device id captured between the door and the ceremony. */
    this.pendingGenesisDeviceId = null;
  }
  get current() {
    return this.state;
  }
  /** The device approval in flight, or how the last one ended; null when none. */
  get approval() {
    return this.approvalState;
  }
  /** Watch the approval move; returns the unsubscribe. A dialog is a window onto it, not its owner. */
  observeApproval(fn) {
    this.approvalObservers.add(fn);
    return () => {
      this.approvalObservers.delete(fn);
    };
  }
  setApproval(next) {
    this.approvalState = next;
    this.deps.onApproval?.();
    for (const fn of this.approvalObservers) fn();
  }
  setState(next, detail) {
    this.state = next;
    this.deps.onState(next, detail);
  }
  // ── load ──────────────────────────────────────────────────────────────────
  /**
   * Called once at plugin load. Walks as far up the ladder as the material
   * allows and stops — every stop is a legitimate resting state with its own UI.
   */
  async resume() {
    const auth = this.deps.load();
    if (!auth.token) {
      this.setState("disconnected");
      return;
    }
    const session = await this.mintSession(auth);
    if (!session) return;
    if (!auth.wrapped_mdek) {
      this.setState("blocked");
      return;
    }
    this.setState("relocked");
    await this.unlockFromServerKEK();
  }
  /** Token → session. Shared by resume() and the settings connect card. */
  async mintSession(auth) {
    if (!auth.token || !auth.device_id) {
      this.setState("disconnected");
      return false;
    }
    const res = await this.deps.api.exchangeToken(auth.token, auth.device_id);
    if (!res.ok || !res.data) {
      if (isTerminalAuthError(res)) {
        await this.forget("token_revoked");
      } else {
        this.setState(auth.wrapped_mdek ? "relocked" : "blocked", "offline");
      }
      return false;
    }
    this.deps.onSession(res.data.auth_token);
    await this.deps.save({
      session_token: res.data.auth_token,
      account_id: res.data.account_id,
      background_work_consented: res.data.background_work_consented ?? null
    });
    return true;
  }
  // ── connect ───────────────────────────────────────────────────────────────
  /**
   * P9 — gateway primacy: the plugin as a FIRST device. Silent crypto at t=0,
   * exactly the web funnel's discipline expressed device-native:
   *
   *   createAccount → session (signup IS the first session) → mint a plugin
   *   token in-flow (durable custody, so restarts re-mint sessions like every
   *   connected install) → GENESIS: a fresh mDEK, adopted through the same
   *   split-custody path an approved transfer uses (wrap under fresh KEK, KEK
   *   to the server, blob local, memory-only key).
   *
   * Recovery hardening is deliberately a FOLLOW-UP, not a gate — no phrase
   * wall at the door. The caller shows the "add a recovery method" prompt;
   * until then, device loss means re-ingesting a vault the user still has
   * (named in the signup modal, because it's true).
   */
  async signup(email, name, password, deviceId, termsVersion) {
    const created = await this.deps.api.createAccount(email, name, password, termsVersion);
    if (!created.ok || !created.data?.autoken || !created.data.account_id) {
      return created.status === 401 ? "email_not_allowed" : "error";
    }
    return this.bootstrapFreshSession(created.data.autoken, created.data.account_id, deviceId, false);
  }
  /**
   * P9 passwordless — redeem an emailed magic-link token (arrives through the
   * obsidian:// handler or pasted from the landing page). ValidateMagicLink
   * creates the account when the email is new, so this IS signup.
   */
  async completeMagicLink(token, deviceId) {
    const res = await this.deps.api.validateMagicLink(token);
    if (!res.ok || !res.data?.auth_token || !res.data.account_id) {
      const serverAnswered = res.status > 0 && res.status < 500;
      return serverAnswered ? "invalid" : "error";
    }
    const hasKeys = res.data.device_transfer_required === true;
    const outcome = await this.bootstrapFreshSession(res.data.auth_token, res.data.account_id, deviceId, hasKeys);
    return outcome === "error" ? "error" : outcome;
  }
  /**
   * The shared tail of every fresh-session onboarding door (password, magic
   * link): persist the session, mint the plugin token (durable
   * custody — restarts re-mint sessions like any connected install), then
   * silent key genesis through the same split-custody path a transfer uses.
   *
   * GENESIS GUARD: if this account already has key material (an existing user
   * signing in through the vault door), minting a fresh mDEK would FORK their
   * content key. The auth response is authoritative (`device_transfer_required`
   * / `encryption_redirect` — the server's own encryption-state check), so the
   * caller passes it; keys are RECEIVED via approval/phrase, never re-created.
   */
  async bootstrapFreshSession(autoken, accountId, deviceId, hasExistingKeys) {
    this.deps.onSession(autoken);
    await this.deps.save({
      session_token: autoken,
      account_id: accountId,
      device_id: deviceId,
      background_work_consented: null
    });
    if (hasExistingKeys) {
      this.setState("blocked", "existing_account");
      return "existing_account";
    }
    this.pendingGenesisDeviceId = deviceId;
    this.setState("blocked", "genesis_pending");
    return "ceremony";
  }
  get genesisPending() {
    return this.pendingGenesisDeviceId !== null;
  }
  /**
   * P9 — key genesis: the same enablement rule every frontend satisfies
   * (device present + recovery stored → encryption on), expressed in the
   * plugin's custody polarity. The account_device_keys custody-split CHECK is
   * the schema's own ruling here: a device row holds wrapped_mdek (web
   * polarity) OR device_kek (plugin polarity), never both — so the plugin's
   * device is BORN as a kek-row via kek/store (whitelisted setup endpoint,
   * write-once guarded), not via device/register, which exists for mdek-rows.
   *
   * Sequence: real phrase-derived recovery first (whitelisted), then
   * adoptMDEK (kek/store creates the device row and flips enablement through
   * the same setup-complete check DeviceRegister/RecoverySetup share, then
   * escrow + blob). hasRecoveryKey is TRUE and MEANS IT from birth.
   */
  async completeGenesis(phrase) {
    const deviceId = this.pendingGenesisDeviceId ?? this.deps.load().device_id;
    if (!deviceId) return "error";
    try {
      const mdek = await generateMDEK();
      const recoveryKEK = await deriveKEKFromPhrase(phrase);
      const recoveryWrapped = await wrapMDEK(mdek, recoveryKEK);
      const recovery = await this.deps.api.setupRecovery(recoveryWrapped);
      if (!recovery.ok) {
        this.setState("blocked", "genesis_failed");
        return "error";
      }
      const ok2 = await this.adoptMDEK(mdek);
      if (!ok2) {
        this.setState("blocked", "genesis_failed");
        return "error";
      }
      this.pendingGenesisDeviceId = null;
      return "unlocked";
    } catch {
      this.setState("blocked", "genesis_failed");
      return "error";
    }
  }
  /** Settings: the user pasted a token. */
  async connect(token, deviceId) {
    await this.deps.save({ token, device_id: deviceId });
    const ok2 = await this.mintSession(this.deps.load());
    if (!ok2) return;
    const auth = this.deps.load();
    if (auth.wrapped_mdek) {
      this.setState("relocked");
      await this.unlockFromServerKEK();
    } else {
      this.setState("blocked");
    }
  }
  /** Settings: disconnect. Local material goes; the server's KEK is the user's to revoke. */
  async disconnect() {
    await this.forget("disconnected_by_user");
  }
  /** The server ended this account's sessions (admin force-logout): custody is void. */
  async revokedRemotely() {
    await this.forget("remote_logout");
  }
  async forget(reason) {
    this.stopPolling();
    this.transferKeys = null;
    this.approvalState = null;
    this.pendingGenesisDeviceId = null;
    this.deps.keys.clear();
    this.deps.onSession(null);
    await this.deps.save({ token: null, session_token: null, wrapped_mdek: null, account_id: null });
    this.setState("disconnected", reason);
  }
  // ── the split-custody re-unlock (the common path) ─────────────────────────
  /**
   * RELOCKED → UNLOCKED. Fetch the server's KEK, unwrap the local blob, keep the
   * result in memory. This is what makes restarts self-service on both consent
   * tiers — no re-approval in the normal course.
   */
  async unlockFromServerKEK() {
    const auth = this.deps.load();
    if (!auth.device_id || !auth.wrapped_mdek) {
      this.setState("blocked");
      return;
    }
    const res = await this.deps.api.fetchDeviceKEK(auth.device_id);
    if (!res.ok || !res.data?.device_kek) {
      if (res.status === 404 || res.error === "kek_not_found") {
        await this.deps.save({ wrapped_mdek: null });
        this.setState("blocked", "device_revoked");
      } else if (res.status === 403 || res.error === "token_revoked") {
        this.setState("blocked", "token_revoked");
      } else {
        this.setState("relocked", "offline");
      }
      return;
    }
    try {
      const kek = await importKEK(res.data.device_kek);
      const mdek = await unwrapMDEK(auth.wrapped_mdek, kek);
      this.deps.keys.set(mdek);
      await this.escrowToSession(auth.device_id);
      this.setState("unlocked");
    } catch {
      await this.deps.save({ wrapped_mdek: null });
      this.setState("blocked", "key_mismatch");
    }
  }
  // ── device approval (BLOCKED → UNLOCKED) ──────────────────────────────────
  /**
   * Start an ECDH device transfer and WATCH it until it resolves. Returns the
   * 4-digit code for the user to type on a device that is already approved;
   * the same code stays readable on `approval` for every pane that asks.
   */
  async beginApproval() {
    const auth = this.deps.load();
    if (!auth.device_id) return null;
    this.stopPolling();
    this.transferKeys = await generateECDHKeyPair();
    const res = await this.deps.api.requestDeviceTransfer(auth.device_id, this.transferKeys.publicKey, this.deps.deviceName);
    if (!res.ok || !res.data) {
      this.transferKeys = null;
      this.setApproval({ status: "failed", failure: { step: "request", status: res.status, error: res.error } });
      return null;
    }
    const pending = { requestId: res.data.request_id, verificationCode: res.data.verification_code };
    this.setApproval({ status: "pending", requestId: pending.requestId, code: pending.verificationCode, startedAt: Date.now() });
    this.pollApproval(pending.requestId);
    return pending;
  }
  /**
   * Poll until the other device approves. Stops on approval, denial, expiry, or
   * `cancelApproval()`. Deliberately not an infinite retry: a request that has
   * expired should surface, not spin. Outcomes land on `approval`; an approval
   * lands the machine UNLOCKED through adoptMDEK before the record clears.
   */
  pollApproval(requestId) {
    this.stopPolling();
    const started = Date.now();
    const settle = (outcome) => {
      this.stopPolling();
      this.transferKeys = null;
      this.setApproval(outcome);
    };
    const verdict = (status) => ({ status });
    const failed = (step, status, error) => ({ status: "failed", failure: { step, status, error } });
    const tick = async () => {
      if (this.approvalState?.status !== "pending" || this.approvalState.requestId !== requestId) {
        this.stopPolling();
        return;
      }
      if (Date.now() - started > 10 * 60 * 1e3) {
        settle(verdict("expired"));
        return;
      }
      const res = await this.deps.api.pollDeviceTransfer(requestId);
      if (!res.ok || !res.data) {
        if (res.error === "offline" || res.error === "network_error" || res.status === 429 || res.status >= 500) return;
        if (res.status === 400 || res.status === 404 || res.status === 410) settle(verdict("expired"));
        else settle(failed("poll", res.status, res.error));
        return;
      }
      if (res.data.status === "pending") return;
      this.stopPolling();
      if (res.data.status !== "approved" || !res.data.encrypted_mdek) {
        settle(verdict(res.data.status === "denied" ? "denied" : "expired"));
        return;
      }
      const completed = await this.completeApproval(res.data.encrypted_mdek);
      if (completed) this.setApproval(null);
      else settle(failed("handover", 0, null));
    };
    this.pollTimer = window.setInterval(() => void tick(), this.deps.pollIntervalMs ?? 2e3);
    void tick();
  }
  stopPolling() {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
  /** The person gave up on this request (an explicit choice — never a dialog closing). */
  cancelApproval() {
    this.stopPolling();
    this.transferKeys = null;
    this.setApproval(null);
  }
  /**
   * The mDEK has arrived. Wrap it under a brand-new KEK, write the blob HERE and
   * the KEK THERE — the moment split custody is established.
   */
  async completeApproval(encryptedMDEK) {
    try {
      let mdek;
      if (this.deps.mockMode()) {
        mdek = await importMDEK(encryptedMDEK);
      } else {
        if (!this.transferKeys) return false;
        const blob = new Uint8Array(base64ToArrayBuffer(encryptedMDEK));
        if (blob.length <= 91 + 12) return false;
        const senderSPKI = arrayBufferToBase64(blob.slice(0, 91).buffer);
        const ivAndCiphertext = arrayBufferToBase64(blob.slice(91).buffer);
        const shared = await deriveSharedKey(
          this.transferKeys.privateKey,
          await importECDHPublicKey(senderSPKI)
        );
        mdek = await importMDEK(await decryptToBase64(ivAndCiphertext, shared));
      }
      return await this.adoptMDEK(mdek);
    } catch {
      return false;
    } finally {
      this.transferKeys = null;
    }
  }
  /**
   * P9 — recovery SETUP, in the vault: wrap the current mDEK under a
   * phrase-derived KEK and store the ciphertext. Exact mirror of
   * unlockWithRecoveryPhrase's unwrap, so a phrase written here works on the
   * web and vice versa. The phrase itself never leaves the device.
   */
  async setupRecoveryPhrase(phrase) {
    const mdek = this.deps.keys.get();
    if (!mdek) return "locked";
    try {
      const recoveryKEK = await deriveKEKFromPhrase(phrase);
      const wrapped = await wrapMDEK(mdek, recoveryKEK);
      const res = await this.deps.api.setupRecovery(wrapped);
      return res.ok ? "ok" : "error";
    } catch {
      return "error";
    }
  }
  /**
   * The APPROVING side (fleet fix, 2026-08-22): wrap the live mDEK to the
   * requester's public key — the exact blob every receiver already parses —
   * and hand it to the server with the 4-digit code the user read off the new
   * device. The raw key never leaves this function.
   */
  async approvePendingDevice(requestId, verificationCode, requesterPublicKey) {
    const mdek = this.deps.keys.get();
    if (!mdek) return "error";
    try {
      const blob = await encryptMDEKForTransfer(mdek, requesterPublicKey);
      const res = await this.deps.api.approveDeviceTransfer(requestId, verificationCode, blob);
      if (res.ok) return "ok";
      return res.error === "invalid_verification_code" || res.status === 400 ? "bad_code" : "error";
    } catch {
      return "error";
    }
  }
  // ── recovery phrase (the fallback) ────────────────────────────────────────
  /**
   * BLOCKED → UNLOCKED without another device: unwrap the account's
   * recovery-wrapped mDEK with the user's 12 words. The phrase never leaves this
   * process and is never stored.
   */
  async unlockWithRecoveryPhrase(phrase) {
    let recoveryKEK;
    try {
      recoveryKEK = await deriveKEKFromPhrase(phrase);
    } catch {
      return "invalid_phrase";
    }
    const res = await this.deps.api.fetchRecoveryWrappedMDEK();
    if (!res.ok || !res.data?.wrapped_mdek_recovery) {
      return res.error === "no_recovery_key" ? "no_recovery_key" : "error";
    }
    try {
      const mdek = await unwrapMDEK(res.data.wrapped_mdek_recovery, recoveryKEK);
      return await this.adoptMDEK(mdek) ? "ok" : "error";
    } catch {
      return "invalid_phrase";
    }
  }
  // ── shared tail of both onboarding paths ──────────────────────────────────
  /**
   * Establish split custody for a freshly obtained mDEK, then unlock.
   *
   * Order matters and is not incidental: the KEK goes to the server FIRST. If
   * that call fails we have gained nothing and lost nothing — the user retries.
   * Writing the blob first would leave a device holding ciphertext whose key
   * nobody has, which looks identical to remote wipe and would send the user
   * through re-approval for a network blip.
   */
  async adoptMDEK(mdek) {
    const auth = this.deps.load();
    if (!auth.device_id) return false;
    const kek = await generateKEK();
    const wrapped = await wrapMDEK(mdek, kek);
    this.deps.keys.set(mdek);
    const stored = await this.deps.api.storeDeviceKEK(auth.device_id, await exportKeyAsBase64(kek), this.deps.deviceName);
    if (!stored.ok) {
      this.deps.keys.clear();
      return false;
    }
    await this.escrowToSession(auth.device_id);
    await this.deps.save({ wrapped_mdek: wrapped });
    if (!this.deps.load().token) {
      const minted = await this.deps.api.createPluginToken(this.deps.deviceName);
      if (minted.ok && minted.data?.token) {
        await this.deps.save({ token: minted.data.token });
      }
    }
    this.pendingGenesisDeviceId = null;
    this.setState("unlocked");
    return true;
  }
  /**
   * Hand the mDEK to the session — ONLY when the account has consented to
   * background work.
   *
   * Escrow is exactly what that consent is about: it is what lets Myu work on
   * content while the user isn't looking. An account that hasn't opted in gets
   * an unlocked plugin that captures and reads, and its key stays on this
   * device. The plugin never *sets* this — the ceremony is webapp-side and the
   * plugin only reflects it (plan §decisions, background-work consent).
   *
   * `null` means we haven't been told yet — treat as not consented. Failing
   * closed here costs a user some server-side freshness; failing open would
   * hand over a key they declined to give.
   */
  async escrowToSession(deviceId) {
    try {
      const res = await this.deps.api.escrowMDEK(await this.deps.keys.exportForEscrow(), deviceId);
      return res.ok;
    } catch {
      return false;
    }
  }
  /** Transport saw a 401 — the session died mid-flight. */
  /** Belt-and-braces: an UNLOCKED machine without a durable plugin token
      (sessions minted by the pre-fix approval/recovery paths) heals itself. */
  async ensurePluginToken() {
    if (!this.deps.keys.isUnlocked || this.deps.load().token) return;
    const minted = await this.deps.api.createPluginToken(this.deps.deviceName);
    if (minted.ok && minted.data?.token) {
      await this.deps.save({ token: minted.data.token });
    }
  }
  /**
   * Transport saw a 401 — the session died mid-flight. Re-mint ONCE for
   * everyone who noticed: a burst of parallel calls (the settings pane opens
   * a dozen at a time) used to re-mint a session each, the key was escrowed to
   * whichever session was current at that moment, and the transport kept a
   * different one — every call after that was refused until a restart (live,
   * 2026-09-03). Resolves true when the new session is usable, so the caller
   * can send the refused request again.
   */
  onUnauthorized() {
    if (!this.remint) {
      this.remint = this.remintSession().finally(() => {
        this.remint = null;
      });
    }
    return this.remint;
  }
  async remintSession() {
    const auth = this.deps.load();
    if (!auth.token) {
      this.deps.onSession(null);
      return false;
    }
    const minted = await this.mintSession(auth);
    if (!minted) {
      this.deps.onSession(null);
      return false;
    }
    if (this.deps.keys.isUnlocked && auth.device_id) return this.escrowToSession(auth.device_id);
    return true;
  }
  /**
   * Transport saw 403 `{"err":"enc"}` — this session holds no escrowed key:
   * a session minted while the key was not yet in memory, or an escrow that
   * lapsed. Re-escrow, once for everyone who noticed. True means the refused
   * request is worth sending again.
   */
  onEncryptionBlocked() {
    if (!this.reescrow) {
      this.reescrow = (async () => {
        const auth = this.deps.load();
        if (!this.deps.keys.isUnlocked || !auth.device_id || !auth.session_token) return false;
        return this.escrowToSession(auth.device_id);
      })().finally(() => {
        this.reescrow = null;
      });
    }
    return this.reescrow;
  }
  /** Plugin unload. Memory only — nothing to flush, which is the point. */
  shutdown() {
    this.stopPolling();
    this.deps.keys.clear();
  }
};

// src/capture/CaptureService.ts
var import_obsidian26 = require("obsidian");

// src/capture/wikilinks.ts
var WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
var CODE_FENCE = /```[\s\S]*?```|`[^`\n]*`/g;
function extractEntityHints(markdown) {
  const withoutCode = markdown.replace(CODE_FENCE, " ");
  const seen = /* @__PURE__ */ new Set();
  const hints = [];
  for (const match of withoutCode.matchAll(WIKILINK)) {
    if (match.index !== void 0 && match.index > 0 && withoutCode[match.index - 1] === "!") continue;
    const target = match[1].trim();
    if (!target) continue;
    const leaf = target.includes("/") ? target.slice(target.lastIndexOf("/") + 1) : target;
    const name = leaf.trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(name);
  }
  return hints;
}

// src/capture/noteMeta.ts
var FILENAME_DATE = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;
function readNoteMeta(app, file) {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  const vetoed = fm?.myu === false || fm?.myu === "false";
  return { occurredAt: resolveOccurredAt(fm, file), vetoed };
}
function resolveOccurredAt(fm, file) {
  for (const key of ["date", "created", "created_at"]) {
    const parsed = parseDateValue(fm?.[key]);
    if (parsed !== null) return parsed;
  }
  const match = file.basename.match(FILENAME_DATE);
  if (match) {
    const [, y, m, d] = match;
    const local = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    if (!Number.isNaN(local.getTime())) return local.getTime();
  }
  return file.stat.mtime;
}
function parseDateValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1e3 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).getTime();
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
async function hashContent(content) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stripFrontmatter(content) {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(content.indexOf("\n", end + 1) + 1).trimStart();
}

// src/capture/CaptureService.ts
var ENCRYPTION_VERSION = 1;
var CaptureService = class {
  constructor(deps) {
    this.deps = deps;
    this.timers = /* @__PURE__ */ new Map();
    this.registered = false;
    /** REVIEW M1: at most one flushQueue drain in flight. */
    this.flushing = false;
    /** REVIEW M2: gate the (register-once) watcher handlers on capture liveness. */
    this.active = false;
    this.everRegistered = false;
  }
  get isWatching() {
    return this.registered;
  }
  /**
   * Register the vault watcher — but ONLY if something is shared. Returns
   * whether it registered, so callers can render honest status.
   */
  start(register) {
    const { allowlist_folders, allowlist_tags } = this.deps.settings();
    if (allowlist_folders.length === 0 && allowlist_tags.length === 0) {
      return false;
    }
    if (!this.everRegistered) {
      const onChange = (file) => {
        if (this.active && file instanceof import_obsidian26.TFile) this.scheduleCapture(file);
      };
      const onRename = (file, oldPath) => {
        if (this.active && file instanceof import_obsidian26.TFile) this.scheduleCapture(file, oldPath);
      };
      register("modify", onChange);
      register("create", onChange);
      register("rename", onRename);
      this.everRegistered = true;
    }
    this.active = true;
    this.registered = true;
    return true;
  }
  /** Called when the allowlist empties or the plugin unloads. */
  stop() {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.registered = false;
    this.active = false;
  }
  // ── the pipeline ──────────────────────────────────────────────────────────
  scheduleCapture(file, previousPath) {
    if (file.extension !== "md") return;
    if (!this.isShared(file)) return;
    const existing = this.timers.get(file.path);
    if (existing) window.clearTimeout(existing);
    const wait = Math.max(10, this.deps.settings().quiescence_seconds) * 1e3;
    const timer = window.setTimeout(() => {
      this.timers.delete(file.path);
      void this.capture(file, previousPath);
    }, wait);
    this.timers.set(file.path, timer);
  }
  /**
   * Allowlist test. Folder match is prefix-on-path-segments (so `Daily` matches
   * `Daily/2026-08-10.md` but never `DailyPlanning/…`), tag match consults the
   * metadata cache so both frontmatter and inline tags count.
   */
  isShared(file) {
    const { allowlist_folders, allowlist_tags } = this.deps.settings();
    for (const folder of allowlist_folders) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }
    if (allowlist_tags.length) {
      const cache = this.deps.app.metadataCache.getFileCache(file);
      const tags = /* @__PURE__ */ new Set();
      for (const t of cache?.tags ?? []) tags.add(t.tag.replace(/^#/, "").toLowerCase());
      const fmTags = cache?.frontmatter?.tags;
      if (Array.isArray(fmTags)) {
        for (const t of fmTags) if (typeof t === "string") tags.add(t.replace(/^#/, "").toLowerCase());
      } else if (typeof fmTags === "string") {
        tags.add(fmTags.replace(/^#/, "").toLowerCase());
      }
      for (const wanted of allowlist_tags) if (tags.has(wanted.replace(/^#/, "").toLowerCase())) return true;
    }
    return false;
  }
  /** One note → one upsert. Safe to call directly (backfill does). */
  async capture(file, previousPath) {
    const meta = readNoteMeta(this.deps.app, file);
    if (meta.vetoed) return "vetoed";
    const raw = await this.deps.app.vault.cachedRead(file);
    const body = stripFrontmatter(raw);
    if (body.trim().length === 0) return "skipped";
    const settings = this.deps.settings();
    const externalId = this.externalId(file.path);
    const hash = await hashContent(body);
    if (settings.capture_hashes[externalId] === hash) return "skipped";
    const key = this.deps.keys.get();
    if (!key) {
      this.deps.onStatus?.("paused \u2014 locked");
      return "skipped";
    }
    const payload = {
      encrypted_content: await encryptWithKey(body, key),
      encryption_version: ENCRYPTION_VERSION,
      source_type: "obsidian",
      external_id: externalId,
      occurred_at: meta.occurredAt,
      entity_hints: extractEntityHints(body),
      no_response: true,
      ...previousPath ? { previous_external_id: this.externalId(previousPath) } : {}
    };
    const res = await this.deps.api.upsertJournal(payload);
    if (res.ok) {
      settings.capture_hashes[externalId] = hash;
      await this.deps.save();
      return "sent";
    }
    if (res.error === "offline" || res.error === "network_error" || res.status >= 500) {
      await this.enqueue(payload);
      return "queued";
    }
    return "skipped";
  }
  // ── queue ─────────────────────────────────────────────────────────────────
  async enqueue(payload) {
    const settings = this.deps.settings();
    const existing = settings.queue.findIndex((q) => q.external_id === payload.external_id);
    const entry = {
      external_id: payload.external_id,
      encrypted_content: payload.encrypted_content,
      encryption_version: payload.encryption_version,
      occurred_at: payload.occurred_at,
      entity_hints: payload.entity_hints ?? [],
      previous_external_id: payload.previous_external_id,
      queued_at: Date.now(),
      attempts: 0
    };
    if (existing >= 0) settings.queue[existing] = entry;
    else settings.queue.push(entry);
    await this.deps.save();
    this.deps.onStatus?.(`${settings.queue.length} waiting to send`);
  }
  /**
   * Drain the queue. Called on unlock, on a timer, and from settings.
   * Stops at the first network failure — draining 200 entries against a dead
   * connection just burns battery.
   */
  async flushQueue() {
    const settings = this.deps.settings();
    if (this.flushing) {
      return { sent: 0, remaining: settings.queue.length };
    }
    if (!settings.queue.length || !this.deps.canCapture()) {
      return { sent: 0, remaining: settings.queue.length };
    }
    this.flushing = true;
    try {
      return await this.drainQueue(settings);
    } finally {
      this.flushing = false;
    }
  }
  async drainQueue(settings) {
    let sent = 0;
    while (settings.queue.length > 0) {
      const entry = settings.queue[0];
      const res = await this.deps.api.upsertJournal({
        encrypted_content: entry.encrypted_content,
        encryption_version: entry.encryption_version,
        source_type: "obsidian",
        external_id: entry.external_id,
        occurred_at: entry.occurred_at,
        entity_hints: entry.entity_hints,
        no_response: true,
        ...entry.previous_external_id ? { previous_external_id: entry.previous_external_id } : {}
      });
      if (res.ok) {
        settings.queue.shift();
        sent += 1;
        continue;
      }
      if (res.error === "offline" || res.error === "network_error") break;
      entry.attempts += 1;
      if (entry.attempts >= 5) {
        settings.queue.shift();
        this.deps.onStatus?.(`Gave up sending one note after ${entry.attempts} tries.`);
      } else {
        break;
      }
    }
    await this.deps.save();
    return { sent, remaining: settings.queue.length };
  }
  // ── backfill ──────────────────────────────────────────────────────────────
  /** What a backfill would cover, for the scope confirmation. Reads no content. */
  surveyBackfill() {
    const files = this.deps.app.vault.getMarkdownFiles().filter((f) => this.isShared(f));
    const oldest = files.reduce((min, f) => min === null || f.stat.mtime < min ? f.stat.mtime : min, null);
    return { files, oldest };
  }
  /**
   * Bring in the vault's history — the acquisition wedge: months or years of
   * existing journal, so Myu has substrate on day one instead of a cold start.
   *
   * Sequential and yielding, not a parallel storm: this runs on someone's laptop
   * while they work, and a thousand-note vault should be invisible, not a fan.
   */
  async backfill(files, onProgress, shouldStop) {
    let sent = 0;
    let skipped = 0;
    let stopped = false;
    for (let i = 0; i < files.length; i++) {
      if (!this.deps.canCapture()) break;
      if (shouldStop?.()) {
        stopped = true;
        break;
      }
      const result = await this.capture(files[i]);
      if (result === "sent" || result === "queued") sent += 1;
      else skipped += 1;
      onProgress?.(i + 1, files.length);
      await new Promise((r) => window.setTimeout(r, 60));
    }
    return { sent, skipped, stopped };
  }
  /** The shared notes' text + mtime, for the link survey. Reads from Obsidian's cache; capped so a huge vault stays quick. */
  async sharedNotesForSurvey(limit = 600) {
    const files = this.surveyBackfill().files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, limit);
    const out = [];
    for (const f of files) {
      try {
        out.push({ text: await this.deps.app.vault.cachedRead(f), mtime: f.stat.mtime });
      } catch {
      }
    }
    return out;
  }
  /**
   * `external_id` — stable per note, per vault. The vault name scopes it so two
   * vaults with a `Daily/2026-08-10.md` don't collide into one entry.
   */
  externalId(path) {
    const vaultId = this.deps.settings().vault_id || this.deps.app.vault.getName();
    return `${vaultId}:${path}`;
  }
};

// src/transport/sse.ts
var import_event_source_polyfill = __toESM(require_eventsource(), 1);
var HEARTBEAT_TIMEOUT_MS = 9e4;
var BACKOFF_START_MS = 2e3;
var BACKOFF_MAX_MS = 6e4;
var REFUSED_BACKOFF_MS = 5 * 6e4;
function sseErrorPlan(status) {
  if (status === 428) return "gated";
  if (status === 401 || status === 403) return "refused";
  return "retry";
}
var SSEClient = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
    this.source = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.backoffMs = BACKOFF_START_MS;
    this.desired = false;
    /** A stream is OPEN right now (not merely wanted). */
    this.connected = false;
    this.lastContactAt = 0;
    this.url = null;
    this.token = null;
    /** Stopped by a 428: no reconnect until `start()` is called again. */
    this.gated = false;
    /** The plugin's ear for the gate — it shows the screen; the stream just stops. */
    this.onGated = null;
  }
  /** Connect (or re-target) the stream. Safe to call repeatedly. */
  start(url, token) {
    this.url = url;
    this.token = token;
    this.desired = true;
    this.gated = false;
    this.backoffMs = BACKOFF_START_MS;
    this.open();
  }
  /** Stop and stay stopped (relock, disconnect, unload). */
  stop() {
    this.desired = false;
    this.connected = false;
    this.closeSource();
    this.clearTimers();
  }
  /** We WANT a stream (start called, stop not). Not proof of one. */
  get isRunning() {
    return this.desired;
  }
  /** A stream is open right now. */
  get isConnected() {
    return this.connected;
  }
  /** ms since the last byte from the server (Infinity when never). */
  get sinceLastContactMs() {
    return this.lastContactAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastContactAt;
  }
  /**
   * Watchdog entry point: reconnect NOW if the stream is down. A live socket is
   * not something to take on faith.
   */
  ensure() {
    if (!this.desired || this.connected) return;
    this.clearTimers();
    this.backoffMs = BACKOFF_START_MS;
    this.open();
  }
  subscribe(eventType, handler) {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(eventType, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }
  // ── stream ────────────────────────────────────────────────────────────────
  open() {
    if (!this.desired || !this.url || !this.token || this.gated) return;
    this.closeSource();
    try {
      const source = new import_event_source_polyfill.EventSourcePolyfill(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
        // The polyfill's own staleness watch; ours below is the backstop.
        heartbeatTimeout: HEARTBEAT_TIMEOUT_MS
      });
      this.source = source;
      source.onopen = () => {
        if (source !== this.source) return;
        this.connected = true;
        this.backoffMs = BACKOFF_START_MS;
        this.lastContactAt = Date.now();
        this.armHeartbeat();
      };
      source.onmessage = (event) => {
        if (source !== this.source) return;
        const data = event.data;
        this.dispatch("message", typeof data === "string" ? data : "");
      };
      source.addEventListener("heartbeat", () => {
        if (source !== this.source) return;
        this.lastContactAt = Date.now();
        this.armHeartbeat();
      });
      source.onerror = (event) => {
        if (source !== this.source) return;
        this.connected = false;
        const status = event?.status;
        this.closeSource();
        const plan = sseErrorPlan(status);
        if (plan === "gated") {
          this.gated = true;
          this.onGated?.();
          return;
        }
        if (plan === "refused") this.backoffMs = REFUSED_BACKOFF_MS;
        this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      this.scheduleReconnect();
    }
  }
  closeSource() {
    const source = this.source;
    this.source = null;
    if (!source) return;
    try {
      source.close();
    } catch {
    }
  }
  dispatch(eventName, data) {
    this.lastContactAt = Date.now();
    this.armHeartbeat();
    if (eventName === "heartbeat") return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || !("eventType" in parsed)) return;
    const { eventType, ...rest } = parsed;
    let payload = rest;
    const inner = rest.content;
    if (typeof inner === "string" && inner.trimStart().startsWith("{")) {
      try {
        const innerParsed = JSON.parse(inner);
        if (innerParsed && typeof innerParsed === "object" && !Array.isArray(innerParsed)) {
          payload = innerParsed;
        }
      } catch {
      }
    }
    for (const handler of this.listeners.get(eventType) ?? []) {
      try {
        handler(payload);
      } catch {
      }
    }
  }
  // ── liveness ──────────────────────────────────────────────────────────────
  armHeartbeat() {
    if (this.heartbeatTimer !== null) window.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = window.setTimeout(() => {
      this.connected = false;
      this.closeSource();
      this.scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }
  scheduleReconnect() {
    if (!this.desired || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
  }
  clearTimers() {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) window.clearTimeout(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }
};
function deriveSseUrl(baseUrl, accountId) {
  const origin = baseUrl.replace(/\/api\/?$/, "");
  return `${origin}/sse/get?account_id=${encodeURIComponent(accountId)}`;
}

// src/capture/MeetingCapture.ts
var import_obsidian27 = require("obsidian");
var FILENAME_DATE2 = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;
var MeetingCapture = class {
  constructor(deps) {
    this.deps = deps;
    this.timers = /* @__PURE__ */ new Map();
    this.registered = false;
  }
  get isWatching() {
    return this.registered;
  }
  /**
   * Register the watcher — ONLY when the meeting allowlist is non-empty
   * (invariant 2 applies to this pipeline exactly as it does to journal
   * capture; the frontmatter opt-in alone doesn't watch the whole vault).
   */
  start(register) {
    if (this.registered) return true;
    if (this.deps.settings().meeting_folders.length === 0) return false;
    const onChange = (file) => {
      if (file instanceof import_obsidian27.TFile) this.schedule(file);
    };
    register("modify", onChange);
    register("create", onChange);
    this.registered = true;
    return true;
  }
  stop() {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.registered = false;
  }
  /** Folder allowlist OR the per-note frontmatter opt-in. */
  qualifies(file) {
    if (file.extension !== "md") return false;
    for (const folder of this.deps.settings().meeting_folders) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }
    const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.["myu-meeting"] === true || fm?.["myu-meeting"] === "true";
  }
  schedule(file) {
    if (!this.qualifies(file)) return;
    const existing = this.timers.get(file.path);
    if (existing) window.clearTimeout(existing);
    const wait = Math.max(10, this.deps.settings().quiescence_seconds) * 1e3;
    this.timers.set(
      file.path,
      window.setTimeout(() => {
        this.timers.delete(file.path);
        void this.capture(file);
      }, wait)
    );
  }
  /** One note → one ingest. Safe to call directly (the command does). */
  async capture(file) {
    if (!this.deps.canCapture()) return "skipped";
    const raw = await this.deps.app.vault.cachedRead(file);
    const body = stripFrontmatter(raw);
    if (body.trim().length === 0) return "skipped";
    const settings = this.deps.settings();
    const hash = await hashContent(body);
    if (settings.meeting_hashes[file.path] === hash) return "unchanged";
    const payload = {
      external_id: file.path,
      title: this.titleOf(file, body),
      occurred_at_ms: this.occurredAt(file),
      content: body,
      wikilink_names: this.namesOf(body)
    };
    const res = await this.deps.api.ingestMeetingNote(payload);
    if (res.ok) {
      settings.meeting_hashes[file.path] = hash;
      await this.deps.save();
      return "sent";
    }
    return res.status === 400 ? "refused" : "skipped";
  }
  /** First H1 wins; else the filename with a leading date stripped. */
  titleOf(file, body) {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
    return file.basename.replace(FILENAME_DATE2, "").replace(/^[\s\-–—·]+/, "").trim() || file.basename;
  }
  occurredAt(file) {
    const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
    for (const key of ["date", "created"]) {
      const value = fm?.[key];
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
      if (typeof value === "string") {
        const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12).getTime();
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    const named = file.basename.match(FILENAME_DATE2);
    if (named) return new Date(Number(named[1]), Number(named[2]) - 1, Number(named[3]), 12).getTime();
    return file.stat.ctime;
  }
  /**
   * Wikilink targets, enriched with the person-page index's aliases so the
   * backend resolver sees the user's own alias list. Deduped case-insensitively
   * and capped client-side at the server's 50 — over-cap names would just be
   * dropped there, and we'd rather drop the aliases than the primaries.
   */
  namesOf(body) {
    const primaries = extractEntityHints(body);
    const seen = new Set(primaries.map((n) => n.toLowerCase()));
    const out = [...primaries];
    const index = this.deps.personIndex?.();
    if (index) {
      for (const name of primaries) {
        for (const alias of index.aliasesFor(name)) {
          const key = alias.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(alias);
          }
        }
      }
    }
    return out.slice(0, 50);
  }
  // ── backfill (the acquisition wedge, meeting-side) ─────────────────────────
  /**
   * What a meeting backfill would cover. The GAP this closes (found
   * 2026-08-23 by the preload test question): journal had a backfill sweep
   * from day one, but the folder the acquisition story is actually ABOUT —
   * existing Meetings/ notes — only ever ingested on EDIT. A preloaded vault
   * sat cold. The backend's ingest rate limit was sized for exactly this
   * burst; now a client sends it.
   */
  surveyBackfill() {
    const files = this.deps.app.vault.getMarkdownFiles().filter((f) => this.qualifies(f));
    const oldest = files.reduce(
      (min, f) => min === null || f.stat.mtime < min ? f.stat.mtime : min,
      null
    );
    return { files, oldest };
  }
  /** Sequential and yielding, like the journal sweep — a laptop, not a fan. */
  async backfill(files, onProgress) {
    let sent = 0;
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      if (!this.deps.canCapture()) break;
      const result = await this.capture(files[i]);
      if (result === "sent") sent += 1;
      else skipped += 1;
      onProgress?.(i + 1, files.length);
      await new Promise((r) => window.setTimeout(r, 120));
    }
    return { sent, skipped };
  }
};

// src/people/PersonPageIndex.ts
var import_obsidian28 = require("obsidian");
var PersonPageIndex = class {
  constructor(app, folders) {
    this.app = app;
    this.folders = folders;
    /** lowercased name/alias → page. First writer wins (basename beats alias). */
    this.byName = /* @__PURE__ */ new Map();
    this.pages = [];
  }
  /** Wire the rebuild triggers through the plugin's registerEvent. */
  watch(register) {
    const rebuild = () => this.rebuild();
    const created = this.app.vault.on("create", rebuild);
    const deleted = this.app.vault.on("delete", rebuild);
    const renamed = this.app.vault.on("rename", rebuild);
    register(() => this.app.vault.offref(created));
    register(() => this.app.vault.offref(deleted));
    register(() => this.app.vault.offref(renamed));
    const metaRef = this.app.metadataCache.on("changed", (file) => {
      if (this.isCandidate(file)) this.rebuild();
    });
    register(() => this.app.metadataCache.offref(metaRef));
    this.rebuild();
  }
  rebuild() {
    this.byName.clear();
    this.pages = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isCandidate(file)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const page = {
        path: file.path,
        name: file.basename,
        aliases: aliasesFrom(cache)
      };
      this.pages.push(page);
      if (!this.byName.has(page.name.toLowerCase())) this.byName.set(page.name.toLowerCase(), page);
    }
    for (const page of this.pages) {
      for (const alias of page.aliases) {
        const key = alias.toLowerCase();
        if (!this.byName.has(key)) this.byName.set(key, page);
      }
    }
  }
  isCandidate(file) {
    if (!(file instanceof import_obsidian28.TFile) || file.extension !== "md") return false;
    for (const folder of this.folders()) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.type === "person";
  }
  /** The vault page for a display name, or null. Exact (case-insensitive) only. */
  find(name) {
    return this.byName.get(name.trim().toLowerCase()) ?? null;
  }
  /** The user's own aliases for a name (the page's other names + its basename). */
  aliasesFor(name) {
    const page = this.find(name);
    if (!page) return [];
    const wanted = name.trim().toLowerCase();
    return [page.name, ...page.aliases].filter((n) => n.toLowerCase() !== wanted);
  }
  get size() {
    return this.pages.length;
  }
};
function aliasesFrom(cache) {
  const fm = cache?.frontmatter;
  const raw = fm?.aliases;
  if (Array.isArray(raw)) return raw.filter((a) => typeof a === "string" && a.trim().length > 0);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

// src/vault/CanvasExporter.ts
var import_obsidian29 = require("obsidian");
var CONTENT_KEYS = ["type", "text", "file", "url", "label"];
var COLUMN_WIDTH = 360;
var GUTTER = 40;
var COLUMNS = 3;
function mergeCanvas(existingJson, fresh) {
  let existing;
  try {
    existing = JSON.parse(existingJson);
  } catch {
    return { nodes: fresh.nodes, edges: [] };
  }
  const previous = Array.isArray(existing.nodes) ? existing.nodes : [];
  const byId = new Map(previous.map((node) => [node.id, node]));
  const freshIds = new Set(fresh.nodes.map((node) => node.id));
  const merged = fresh.nodes.map((node) => {
    const before = byId.get(node.id);
    if (!before) return node;
    const kept = { ...before };
    for (const key of CONTENT_KEYS) delete kept[key];
    const ours = {};
    for (const key of CONTENT_KEYS) {
      const value = node[key];
      if (value !== void 0) ours[key] = value;
    }
    return { ...kept, ...ours };
  });
  for (const node of previous) {
    if (!freshIds.has(node.id)) merged.push(node);
  }
  return { nodes: merged, edges: Array.isArray(existing.edges) ? existing.edges : [] };
}
function buildCanvas(spec, resolvePersonPath, webUrl, chartAssetPath) {
  const nodes = [];
  const linkedPages = [];
  const positioned = /* @__PURE__ */ new Map();
  const containers = spec.components.filter((c) => c.type === "container");
  const childIds = new Set(
    containers.flatMap((c) => Array.isArray(c.data?.child_ids) ? c.data?.child_ids : [])
  );
  const flowOrder = [];
  for (const container of containers) {
    for (const id of container.data?.child_ids ?? []) {
      const child = spec.components.find((c) => c.id === id);
      if (child && child.type !== "container") flowOrder.push(child);
    }
  }
  for (const component of spec.components) {
    if (component.type === "container" || childIds.has(component.id)) continue;
    flowOrder.push(component);
  }
  let column = 0;
  const columnBottoms = Array.from({ length: COLUMNS }, () => 0);
  const place = (node) => {
    const x = column * (COLUMN_WIDTH + GUTTER);
    const y = columnBottoms[column];
    columnBottoms[column] += node.height + GUTTER;
    column = (column + 1) % COLUMNS;
    const placed = { ...node, x, y };
    nodes.push(placed);
    return placed;
  };
  for (const component of flowOrder) {
    const node = toNode(component, resolvePersonPath, webUrl, chartAssetPath);
    if (node.type === "file" && node.file) linkedPages.push(node.file);
    positioned.set(component.id, place(node));
  }
  for (const container of containers) {
    const children = (container.data?.child_ids ?? []).map((id) => positioned.get(id)).filter((n) => !!n);
    if (children.length === 0) continue;
    const minX = Math.min(...children.map((n) => n.x));
    const minY = Math.min(...children.map((n) => n.y));
    const maxX = Math.max(...children.map((n) => n.x + n.width));
    const maxY = Math.max(...children.map((n) => n.y + n.height));
    const pad = 20;
    nodes.push({
      id: `group-${container.id}`,
      type: "group",
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      label: container.label ?? (typeof container.data?.label === "string" ? container.data.label : void 0)
    });
  }
  return { canvas: { nodes, edges: [] }, linkedPages };
}
function toNode(component, resolvePersonPath, webUrl, chartAssetPath) {
  const data = component.data ?? {};
  if (component.type === "chart") {
    const assetPath = chartAssetPath?.(component.id) ?? null;
    if (assetPath) {
      return { id: component.id, type: "file", file: assetPath, width: COLUMN_WIDTH, height: 220 };
    }
  }
  if (component.type === "person_card" || component.type === "person") {
    const name = typeof data.name === "string" && data.name || typeof data.display_name === "string" && data.display_name || component.label || "";
    const path = name ? resolvePersonPath(name) : null;
    if (path) {
      return { id: component.id, type: "file", file: path, width: COLUMN_WIDTH, height: 120 };
    }
    return { id: component.id, type: "text", text: name || "Person", width: COLUMN_WIDTH, height: 80 };
  }
  const text = typeof data.text === "string" && data.text || typeof data.content === "string" && data.content || typeof data.summary === "string" && data.summary || null;
  if (text) {
    return { id: component.id, type: "text", text, width: COLUMN_WIDTH, height: estimateHeight(text) };
  }
  const generic = componentMarkdown(component, 3).trim();
  if (generic) {
    return { id: component.id, type: "text", text: generic, width: COLUMN_WIDTH, height: estimateHeight(generic) };
  }
  const label = component.label ?? component.type.replace(/_/g, " ");
  return { id: component.id, type: "text", text: `**${label}**`, width: COLUMN_WIDTH, height: 60 };
}
function chartToSvg(title, config, snapshotDate) {
  if (!config || !Array.isArray(config.data) || config.data.length === 0) return null;
  const kind = config.type;
  if (kind !== "bar" && kind !== "line" && kind !== "area") return null;
  const yKey = config.y_key ?? "";
  const xKey = config.x_key ?? "";
  const values = config.data.map((row) => Number(row[yKey]));
  if (values.some((v) => !Number.isFinite(v))) return null;
  const W = 360;
  const H = 220;
  const PAD = { top: 34, right: 12, bottom: 26, left: 12 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const yFor = (v) => PAD.top + plotH - (v - min) / span * plotH;
  const color = typeof config.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(config.color) ? config.color : "var(--color-accent, #b8860b)";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`,
    `<text x="${PAD.left}" y="18" font-size="13" fill="currentColor">${escapeXml(title)}</text>`,
    `<text x="${W - PAD.right}" y="18" font-size="9" fill="currentColor" opacity="0.55" text-anchor="end">snapshot \xB7 ${escapeXml(snapshotDate)}</text>`,
    `<line x1="${PAD.left}" y1="${yFor(Math.max(min, 0))}" x2="${W - PAD.right}" y2="${yFor(Math.max(min, 0))}" stroke="currentColor" opacity="0.25"/>`
  ];
  if (kind === "bar") {
    const step = plotW / values.length;
    const barW = Math.max(4, step * 0.6);
    values.forEach((v, i) => {
      const x = PAD.left + i * step + (step - barW) / 2;
      const y0 = yFor(Math.max(v, 0));
      const y1 = yFor(Math.min(v, 0));
      parts.push(`<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" fill="${color}"/>`);
    });
  } else {
    const step = values.length > 1 ? plotW / (values.length - 1) : 0;
    const points = values.map((v, i) => `${(PAD.left + i * step).toFixed(1)},${yFor(v).toFixed(1)}`);
    if (kind === "area") {
      const base = yFor(Math.max(min, 0)).toFixed(1);
      parts.push(`<polygon points="${PAD.left},${base} ${points.join(" ")} ${(PAD.left + (values.length - 1) * step).toFixed(1)},${base}" fill="${color}" opacity="0.25"/>`);
    }
    parts.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`);
    const last = points[points.length - 1].split(",");
    parts.push(`<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/>`);
  }
  if (xKey && config.data.length > 1) {
    const firstLabel = String(config.data[0][xKey] ?? "");
    const lastLabel = String(config.data[config.data.length - 1][xKey] ?? "");
    parts.push(`<text x="${PAD.left}" y="${H - 8}" font-size="9" fill="currentColor" opacity="0.6">${escapeXml(firstLabel)}</text>`);
    parts.push(`<text x="${W - PAD.right}" y="${H - 8}" font-size="9" fill="currentColor" opacity="0.6" text-anchor="end">${escapeXml(lastLabel)}</text>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}
function escapeXml(text) {
  return text.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch]);
}
function estimateHeight(text) {
  const lines = Math.max(1, Math.ceil(text.length / 45) + (text.match(/\n/g)?.length ?? 0));
  return Math.min(600, 40 + lines * 24);
}
var CanvasExporter = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * The canvas already saved for this composition, if there is one.
   *
   * `.canvas` files carry no frontmatter, which is why every export writes a
   * sibling `.md` stub — and that stub's `myu-composition-id` is what makes
   * this lookup possible at all. The stub was built as a purge handle; it
   * turns out to be the join key too.
   */
  findExistingCanvas(compositionId) {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith("Myu/Canvas/")) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.["myu-composition-id"] !== compositionId) continue;
      const canvasPath = file.path.replace(/\.md$/, ".canvas");
      if (this.app.vault.getAbstractFileByPath(canvasPath)) return canvasPath;
    }
    return null;
  }
  /**
   * The same composition, as an ORDINARY MARKDOWN NOTE.
   *
   * A `.canvas` is the spatial form and needs Obsidian to read it. This is the
   * portable one: prose, lists, tables, `[[wikilinks]]` and a mermaid block —
   * greppable, diffable, readable in any editor, and still readable years after
   * this plugin is gone. That last property is the whole argument: what
   * survives uninstalling us.
   *
   * Uses the SAME builder as the reading pane, so the note and the pane can
   * never disagree — one mechanism, two outputs, the pattern the weekly review
   * established.
   */
  async writeMarkdown(spec, resolvePersonName, webUrl) {
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const subject = (spec.summary_text ?? "composition").replace(/[\\/:*?"<>|#^[\]]/g, "").slice(0, 60).trim();
    const path = (0, import_obsidian29.normalizePath)(`Myu/Canvas/${date} ${subject || "composition"}.md`);
    try {
      if (!this.app.vault.getAbstractFileByPath("Myu")) await this.app.vault.createFolder("Myu");
      if (!this.app.vault.getAbstractFileByPath("Myu/Canvas")) await this.app.vault.createFolder("Myu/Canvas");
      const body = buildCompositionMarkdown(spec, resolvePersonName);
      const head = ["---", "type: myu-canvas", "myu-generated: true", `captured: ${date}`, "---", ""].join("\n");
      const foot = ["", "---", "", `*Snapshot taken ${date}. [Open the live canvas \u25B8](${webUrl})*`, ""].join("\n");
      await this.app.vault.create(path, head + body + foot);
      return { status: "written", canvasPath: path };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }
  async write(spec, resolvePersonPath, webUrl) {
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const subject = (spec.summary_text ?? "composition").replace(/[\\/:*?"<>|]/g, "").slice(0, 60).trim();
    const base = (0, import_obsidian29.normalizePath)(`Myu/Canvas/${date} ${subject}`);
    try {
      const folder = "Myu/Canvas";
      if (!this.app.vault.getAbstractFileByPath("Myu")) await this.app.vault.createFolder("Myu");
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      const chartPaths = /* @__PURE__ */ new Map();
      for (const component of spec.components) {
        if (component.type !== "chart") continue;
        const data = component.data ?? {};
        const title = typeof data.title === "string" && data.title || component.label || "Chart";
        const svg = chartToSvg(title, data.recharts_config, date);
        if (!svg) continue;
        const assetsFolder = `${folder}/assets`;
        if (!this.app.vault.getAbstractFileByPath(assetsFolder)) {
          await this.app.vault.createFolder(assetsFolder);
        }
        const assetPath = await this.freePath(
          (0, import_obsidian29.normalizePath)(`${assetsFolder}/${date} ${component.id}`),
          "svg"
        );
        await this.app.vault.create(assetPath, svg);
        chartPaths.set(component.id, assetPath);
      }
      const { canvas, linkedPages } = buildCanvas(
        spec,
        resolvePersonPath,
        webUrl,
        (id) => chartPaths.get(id) ?? null
      );
      const existingPath = this.findExistingCanvas(spec.id);
      if (existingPath) {
        const existingFile = this.app.vault.getAbstractFileByPath(existingPath);
        if (existingFile instanceof import_obsidian29.TFile) {
          const merged = mergeCanvas(await this.app.vault.cachedRead(existingFile), canvas);
          await this.app.vault.process(existingFile, () => JSON.stringify(merged, null, 2));
          return { status: "written", canvasPath: existingPath };
        }
      }
      const canvasPath = await this.freePath(base, "canvas");
      await this.app.vault.create(canvasPath, JSON.stringify(canvas, null, 2));
      const stubPath = await this.freePath(base, "md");
      const stub = [
        "---",
        "myu-generated: true",
        `myu-composition-id: ${spec.id}`,
        `date: ${date}`,
        "---",
        "",
        `Saved from Myu \u2014 [[${canvasPath}|open the canvas]].`,
        linkedPages.length ? `
Links to: ${linkedPages.map((p) => `[[${p}]]`).join(", ")}` : "",
        ""
      ].join("\n");
      await this.app.vault.create(stubPath, stub);
      return { status: "written", canvasPath };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }
  /** `name.ext`, `name 2.ext`, … — an export never overwrites an existing file. */
  async freePath(base, ext) {
    let candidate = `${base}.${ext}`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(candidate); i++) {
      candidate = `${base} ${i}.${ext}`;
    }
    return candidate;
  }
};

// src/composition/keepOnce.ts
function shouldKeepCanvas(autoKeep, compositionId, seen) {
  if (!autoKeep) return false;
  if (typeof compositionId !== "string" || !compositionId) return false;
  if (seen.has(compositionId)) return false;
  seen.add(compositionId);
  return true;
}

// src/liveNotices.ts
var TOAST_CARD_TYPES = /* @__PURE__ */ new Set(["conflict_risk", "burnout_warning", "goal_at_risk", "deadline_alert", "unanswered_message", "no_contact", "communication_debt", "sentiment_drop", "engagement_decline", "person_validation"]);
var LIVE_NOTICE_EVENTS = [
  "DEVICE_TRANSFER_PENDING",
  "DEVICE_TRANSFER_COMPLETED",
  "DEVICE_TRANSFER_DENIED",
  "logout",
  "toast",
  "career_position_update",
  "career_prediction_ready",
  // Relationship health (bucket 2, 2026-08-29) — only what the web shows under
  // its default "smart" mode: high/critical. Lower severities stay in the feed.
  "relationship_alert",
  "priority_card"
];
function str2(v) {
  return typeof v === "string" ? v.trim() : "";
}
function liveNoticeFor(eventType, payload, accountId) {
  switch (eventType) {
    case "DEVICE_TRANSFER_PENDING": {
      const device = str2(payload.device_name) || "A new device";
      return { title: "New Device Request", body: `\u201C${device}\u201D wants to join your account`, kind: "info", durationMs: 0, action: "open_devices" };
    }
    case "DEVICE_TRANSFER_COMPLETED": {
      const device = str2(payload.new_device_name) || "A device";
      return { title: "Transfer Completed", body: `\u201C${device}\u201D was added by another device`, kind: "info" };
    }
    case "DEVICE_TRANSFER_DENIED":
      return { title: "Transfer Denied", body: str2(payload.reason) || "The device transfer was denied", kind: "error" };
    case "logout": {
      const target = str2(payload.content);
      if (!target || !accountId || target !== accountId) return null;
      return { title: "Logged Out", body: str2(payload.reason) || "Your session was ended by an administrator", kind: "error", durationMs: 0 };
    }
    case "toast": {
      const body = str2(payload.content) || str2(payload.message);
      const title = str2(payload.title);
      if (!body && !title) return null;
      const type = str2(payload.type);
      const kind = type === "error" || type === "warning" ? "error" : type === "success" ? "success" : "info";
      const persistent = payload.persistent === true;
      const duration = typeof payload.duration === "number" && payload.duration > 0 ? payload.duration : void 0;
      return { title: title || body, body: title ? body : void 0, kind, durationMs: persistent ? 0 : duration };
    }
    case "career_position_update": {
      const role = str2(payload.role_title);
      if (!role) return null;
      const company = str2(payload.company_name);
      return { title: "Career position updated", body: role + (company ? ` at ${company}` : ""), kind: "info" };
    }
    case "relationship_alert": {
      const severity = str2(payload.severity);
      if (severity !== "high" && severity !== "critical") return null;
      const name = str2(payload.person_name);
      const message = str2(payload.message) || `Relationship status change detected${name ? ` with ${name}` : ""}`;
      const rel = str2(payload.relationship_id);
      return { title: name ? `\u26A0\uFE0F ${name}` : "Relationship alert", body: message, kind: "error", durationMs: 8e3, ...rel ? { action: "open_person", relationshipId: rel, personName: name } : {}, dedupeKey: `relationship_alert:${rel || name}:${str2(payload.alert_type)}` };
    }
    case "priority_card": {
      const type = str2(payload.card_type).replace(/_card$/, "");
      if (!TOAST_CARD_TYPES.has(type)) return null;
      const urgency = str2(payload.urgency);
      const critical = urgency === "critical" || urgency === "immediate";
      if (!critical && urgency !== "high" && urgency !== "urgent") return null;
      const data = payload.card_data && typeof payload.card_data === "object" ? payload.card_data : {};
      const title = str2(data.title) || str2(payload.title) || type.replace(/_/g, " ");
      const body = str2(data.description) || str2(payload.description);
      const rel = str2(data.relationship_id) || str2(data.person_id);
      return { title, body: body || void 0, kind: critical ? "error" : "info", durationMs: critical ? 0 : 8e3, ...rel ? { action: "open_person", relationshipId: rel, personName: str2(data.person_name) } : {}, dedupeKey: `priority_card:${type}` };
    }
    case "career_prediction_ready": {
      const summary = str2(payload.summary);
      if (!summary) return null;
      return { title: "New career prediction available", body: summary.length > 60 ? summary.slice(0, 57) + "..." : summary, kind: "info" };
    }
    default:
      return null;
  }
}
function registerLiveNotices(subscribe, deps) {
  const recent = /* @__PURE__ */ new Map();
  for (const eventType of LIVE_NOTICE_EVENTS) {
    subscribe(eventType, (payload) => {
      const notice = liveNoticeFor(eventType, payload ?? {}, deps.accountId());
      if (!notice) return;
      if (notice.dedupeKey) {
        const last = recent.get(notice.dedupeKey) ?? 0;
        if (Date.now() - last < 30 * 60 * 1e3) return;
        recent.set(notice.dedupeKey, Date.now());
      }
      deps.notify(notice);
      if (eventType === "logout") deps.onRemoteLogout(notice.body ?? "logout");
    });
  }
}

// src/views/MergeIntoModal.ts
var import_obsidian30 = require("obsidian");

// src/views/personActions.ts
function mergeCandidates(entities, sourceId) {
  return entities.filter((e) => e.entity_type === "person" && e.entity_id !== sourceId);
}
var PERSON_ACTION_COPY = {
  merge: (source, target) => ({
    title: `Merge ${source} into ${target}?`,
    body: `Everything Myu knows about ${source} \u2014 memories, threads, history \u2014 moves to ${target}. ${source} is removed from your people, and their note here goes to the trash. This cannot be undone from the vault.`,
    cta: "Merge"
  }),
  self: (name) => ({
    title: `${name} is you?`,
    // Backend folds the person into the self (memories, threads, names) as of
    // 2026-08-29. The earlier wording that said it did NOT is gone.
    body: `Everything Myu knows about ${name} becomes part of you \u2014 memories, threads, and the name itself, so future mentions are recognised as you. ${name} is removed from your people, and their note here goes to the trash.`,
    cta: "Yes, that\u2019s me"
  })
};

// src/views/MergeIntoModal.ts
var MergeIntoModal = class extends import_obsidian30.FuzzySuggestModal {
  constructor(app, plugin, sourceId, sourceName, onPick) {
    super(app);
    this.plugin = plugin;
    this.sourceId = sourceId;
    this.onPick = onPick;
    this.entities = [];
    this.setPlaceholder(`Merge ${sourceName} into\u2026`);
  }
  async onOpen() {
    await super.onOpen();
    const res = await this.plugin.backend.listEntities("person");
    this.entities = mergeCandidates(res.data?.entities ?? [], this.sourceId);
    this.inputEl.dispatchEvent(new Event("input"));
  }
  getItems() {
    return this.entities;
  }
  getItemText(entity) {
    return entity.display_name;
  }
  renderSuggestion(match, el) {
    el.createDiv({ text: match.item.display_name });
    const sub = match.item.organization || match.item.subtitle;
    if (sub) el.createDiv({ cls: "myu-quiet", text: sub });
  }
  onChooseItem(entity) {
    this.onPick(entity);
  }
};

// src/views/CanvasExportModal.ts
var import_obsidian31 = require("obsidian");
var CanvasExportModal = class extends import_obsidian31.Modal {
  constructor(app, plugin, compositionId) {
    super(app);
    this.plugin = plugin;
    this.compositionId = compositionId;
    this.input = "";
    this.selected = null;
    this.rows = null;
    this.listEl = null;
    this.problemEl = null;
    /** Resolves when the picker has loaded — tests await it; the UI never does. */
    this.ready = Promise.resolve();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Save this composition into your vault?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "Two forms, both into Myu/Canvas/. A CANVAS keeps the spatial layout and opens in Obsidian\u2019s own canvas editor. A NOTE is ordinary markdown \u2014 prose, lists, tables, a mermaid diagram \u2014 greppable, diffable, and readable in any editor long after this plugin is gone."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Either way, people link to their pages in your vault when you keep them."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Worth knowing: vault files sync through whatever you use, and anything written here leaves Myu\u2019s reach permanently. Charts are saved as a dated snapshot \u2014 a table in a note, a picture on a canvas \u2014 never as something pretending to be live."
    });
    if (!this.compositionId) {
      contentEl.createEl("h3", { text: "Which composition?" });
      this.listEl = contentEl.createDiv({ cls: "myu-pick-list" });
      this.listEl.createEl("p", { cls: "myu-quiet myu-thinking", text: "Finding your compositions" });
      this.ready = this.loadRows();
      new import_obsidian31.Setting(contentEl).setName("Or paste a web canvas URL").setDesc("If you are looking at one on the web right now.").addText(
        (t) => t.setPlaceholder("https://myu.askmyu.com/\u2026 or an id").onChange((v) => {
          this.input = v.trim();
          this.clearProblem();
        })
      );
    }
    this.problemEl = contentEl.createDiv({ cls: "myu-problem" });
    new import_obsidian31.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton((b) => b.setButtonText("As a note").onClick(() => this.go("markdown"))).addButton((b) => b.setButtonText("As a canvas").setCta().onClick(() => this.go("canvas")));
  }
  async loadRows() {
    const res = await this.plugin.backend.getCompositionHistory(20).catch(() => null);
    const all = Array.isArray(res?.data?.compositions) ? res.data.compositions : [];
    this.rows = all.filter((r) => !r.is_expired && (r.composition_id || r.id));
    this.renderRows();
  }
  renderRows() {
    const host = this.listEl;
    if (!host) return;
    host.empty();
    if (this.rows === null) return;
    if (this.rows.length === 0) {
      host.createEl("p", {
        cls: "myu-quiet",
        text: "No compositions yet. Ask Myu for a canvas in chat \u2014 the offer there saves it directly."
      });
      return;
    }
    for (const row of this.rows) {
      const id = String(row.composition_id ?? row.id);
      const item = host.createEl("button", {
        cls: "myu-pick-row" + (this.selected === id ? " is-selected" : ""),
        text: row.summary_text || row.subject_name || "Untitled composition"
      });
      const meta = [row.subject_name && row.summary_text ? row.subject_name : "", whenOf(row.created_at)].filter(Boolean).join(" \xB7 ");
      if (meta) item.createSpan({ cls: "myu-whisper", text: meta });
      item.onclick = () => {
        this.selected = id;
        this.clearProblem();
        this.renderRows();
      };
    }
  }
  go(format) {
    const id = this.compositionId ?? this.selected ?? extractId(this.input);
    if (!id) {
      this.problemEl?.setText(
        this.rows && this.rows.length > 0 ? "Pick a composition above first." : "Nothing to save yet \u2014 ask Myu for a canvas in chat, then save it from the offer there."
      );
      return;
    }
    this.close();
    void this.plugin.exportComposition(id, format);
  }
  clearProblem() {
    this.problemEl?.setText("");
  }
  onClose() {
    this.contentEl.empty();
  }
};
function whenOf(value) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : "";
}
function extractId(input) {
  if (!input) return null;
  try {
    const url = new URL(input);
    const fromQuery = url.searchParams.get("id") ?? url.searchParams.get("composition_id");
    if (fromQuery) return fromQuery;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? null;
  } catch {
    return input;
  }
}

// src/views/ChatView.ts
var import_obsidian35 = require("obsidian");

// src/views/chatBlocks.ts
var import_obsidian32 = require("obsidian");
function renderReferences(parent, references) {
  if (!references?.length) return;
  const box = parent.createDiv({ cls: "myu-chat-sources" });
  box.createDiv({ cls: "myu-whisper", text: "Sources" });
  for (const ref of references) {
    const row = box.createDiv({ cls: "myu-chat-source" });
    row.createSpan({ cls: "myu-mono", text: `[${ref.id}]` });
    const type = typeof ref.source_type === "string" ? ref.source_type : "";
    row.createSpan({ text: type === "news" ? "\u{1F4F0}" : type === "wiki" ? "\u{1F4D6}" : type.startsWith("linkedin") ? "\u{1F4BC}" : "\u{1F310}" });
    const title = typeof ref.title === "string" && ref.title.trim() || (typeof ref.url === "string" ? ref.url : "source");
    if (typeof ref.url === "string" && ref.url) {
      const a = row.createEl("a", { text: title, href: ref.url });
      a.setAttr("target", "_blank");
      a.setAttr("rel", "noopener");
    } else {
      row.createSpan({ text: title });
    }
  }
}
function renderChatBlock(parent, block, host) {
  if (block.type === "composition_offer" && block.composition_id) {
    if (host.inlineCanvas?.(parent, block.composition_id)) return;
    const row = parent.createDiv({ cls: "myu-chat-offer" });
    if (block.summary_text) row.createDiv({ cls: "myu-claim", text: block.summary_text });
    const asks = host.asksFor?.(block.composition_id);
    if (asks) row.createDiv({ cls: "myu-quiet", text: asks });
    const actions = row.createDiv({ cls: "myu-mirror-actions" });
    const compositionId = block.composition_id;
    const open = actions.createEl("button", { cls: `myu-affordance${asks ? " myu-cta" : ""}`, text: "Open canvas" });
    open.onclick = () => host.openCanvas(compositionId);
    if (!host.autoKeep) {
      const save = actions.createEl("button", { cls: "myu-affordance", text: "Save to vault" });
      save.onclick = () => host.saveCanvas(compositionId);
    }
    const web = actions.createEl("a", { cls: "myu-affordance", text: "View on web", href: `${host.webOrigin}/dashboard` });
    web.setAttr("target", "_blank");
    web.setAttr("rel", "noopener");
    return;
  }
  const md = chatBlockMarkdown(block);
  if (!md) return;
  const cls = block.type === "conversational" ? "myu-voice myu-chat-block myu-md markdown-rendered" : `myu-claim myu-chat-block myu-md markdown-rendered myu-block-${block.type}`;
  const el = parent.createDiv({ cls });
  void import_obsidian32.MarkdownRenderer.render(host.app, md, el, "", host.component);
}
function s(v) {
  return typeof v === "string" ? v.trim() : "";
}
function list(v) {
  return Array.isArray(v) ? v.map((x) => typeof x === "string" ? x : s(x?.text) || s(x?.label)).filter(Boolean) : [];
}
function cell(v) {
  return v === null || v === void 0 ? "" : String(typeof v === "object" ? JSON.stringify(v) : v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function chatBlockMarkdown(block) {
  const b = block;
  switch (block.type) {
    case "conversational":
    case "text":
      return s(b.text) || null;
    case "question": {
      const q = s(b.text) || s(b.question);
      const opts = list(b.options);
      return q ? [`> ${q}`, ...opts.length ? ["", ...opts.map((o) => `- ${o}`)] : []].join("\n") : null;
    }
    case "suggestion": {
      const t = s(b.text) || s(b.summary);
      return t ? `\u2192 ${t}` : null;
    }
    case "insight_card": {
      const title = s(b.title);
      const body = s(b.summary) || s(b.text);
      if (!title && !body) return null;
      return [title ? `**${title}**` : "", body].filter(Boolean).join("\n\n");
    }
    case "action_card": {
      const title = s(b.title);
      const desc = s(b.description);
      const facts = [s(b.due_date) && `due ${s(b.due_date)}`, s(b.estimated_effort) && `effort: ${s(b.estimated_effort)}`, list(b.related_people).length ? `with ${list(b.related_people).join(", ")}` : ""].filter(Boolean);
      if (!title && !desc && facts.length === 0) return null;
      return [title ? `**${title}**` : "", desc, ...facts.map((f) => `- ${f}`)].filter(Boolean).join("\n");
    }
    case "data_table": {
      const columns = Array.isArray(b.columns) ? b.columns : [];
      const rows = Array.isArray(b.rows) ? b.rows : Array.isArray(b.data) ? b.data : [];
      if (columns.length === 0 || rows.length === 0) return s(b.title) ? `**${s(b.title)}**` : null;
      const keys = columns.map((c) => s(c.key) || s(c.label));
      const head = `| ${columns.map((c) => s(c.label) || s(c.key)).join(" | ")} |`;
      const sep = `| ${columns.map(() => "---").join(" | ")} |`;
      const body = rows.map((r) => `| ${keys.map((k) => cell(r[k])).join(" | ")} |`);
      return [s(b.title) ? `**${s(b.title)}**
` : "", head, sep, ...body].filter((x) => x !== "").join("\n");
    }
    case "quick_stats": {
      const stats = Array.isArray(b.stats) ? b.stats : [];
      const rows = stats.filter((st) => s(st.label)).map((st) => `- **${s(st.label)}** \u2014 ${cell(st.value)}${s(st.trend_label) ? ` *(${s(st.trend_label)})*` : ""}`);
      if (rows.length === 0) return null;
      return [s(b.title) ? `**${s(b.title)}**
` : "", ...rows].filter((x) => x !== "").join("\n");
    }
    case "chart": {
      const data = b.data ?? {};
      const labels = Array.isArray(data.labels) ? data.labels : [];
      const sets = Array.isArray(data.datasets) ? data.datasets : [];
      const title = [s(b.title) && `**${s(b.title)}**`, s(b.subtitle) && `*${s(b.subtitle)}*`].filter(Boolean).join("\n");
      if (labels.length === 0 || sets.length === 0) return title || null;
      const head = `| ${s(b.x_axis_label) || ""} | ${sets.map((d, i) => s(d.label) || `Series ${i + 1}`).join(" | ")} |`;
      const sep = `| --- | ${sets.map(() => "---").join(" | ")} |`;
      const rows = labels.map((l, i) => `| ${cell(l)} | ${sets.map((d) => cell(Array.isArray(d.data) ? d.data[i] : "")).join(" | ")} |`);
      return [...title ? [title, ""] : [], head, sep, ...rows].join("\n");
    }
    case "diagram": {
      const source = s(b.source) || s(b.mermaid);
      if (!source) return s(b.caption) || s(b.title) || null;
      return [s(b.title) ? `**${s(b.title)}**
` : "", "```mermaid", source, "```", s(b.caption) ? `
*${s(b.caption)}*` : ""].filter((x) => x !== "").join("\n");
    }
    case "separator":
      return s(b.label) ? `---
*${s(b.label)}*` : "---";
    case "board_deliberation": {
      const advisors = Array.isArray(b.advisors) ? b.advisors : [];
      const syn = b.synthesis ?? {};
      const out = ["### Your Board Weighs In"];
      for (const a of advisors) {
        const who = s(a.advisor_type).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) || "Advisor";
        const take = s(a.content) || s(a.summary);
        if (take) out.push("", `**${who}**${s(a.to) ? ` \u2192 ${s(a.to)}` : ""}`, "", take);
      }
      const section = (key, title) => {
        const items = list(syn[key]);
        if (items.length) out.push("", `**${title}**`, ...items.map((i) => `- ${i}`));
      };
      section("agreements", "Points of Agreement");
      section("tensions", "Key Tensions");
      if (s(syn.crux)) out.push("", "**The bottom line**", "", s(syn.crux));
      section("next_steps", "Suggested Next Steps");
      if (s(b.gut_check)) out.push("", `> [!question] Gut Check
> ${s(b.gut_check)}`);
      return out.length > 1 ? out.join("\n") : null;
    }
    default: {
      if (s(b.text)) return s(b.text);
      const { type, id, ...data } = b;
      const md = componentMarkdown({ id: typeof id === "string" ? id : "block", type: String(type), data }, 3).trim();
      return md || null;
    }
  }
}
function renderRelatedEntries(parent, entries, onOpen) {
  const rows = (entries ?? []).filter((e) => typeof e.journal_id === "string" && e.journal_id);
  if (rows.length === 0) return;
  const box = parent.createDiv({ cls: "myu-chat-related" });
  box.createDiv({ cls: "myu-whisper", text: "Related entries" });
  for (const e of rows) {
    const preview = s(e.content_preview) || e.journal_id;
    const btn = box.createEl("button", { cls: "myu-chat-related-row", text: preview.length > 120 ? preview.slice(0, 117) + "\u2026" : preview });
    btn.onclick = () => onOpen(e.journal_id);
  }
}

// src/views/canvasAsks.ts
function canvasAsksLine(spec) {
  const parts = [];
  let questions = 0;
  let decisions = 0;
  for (const c of spec?.components ?? []) {
    if (c.type === "offer_block") {
      const options = c.data?.options ?? [];
      parts.push(options.some((o) => (o.id ?? "").startsWith("calendar")) ? "connect a calendar" : "an offer to answer");
    } else if (c.type === "decision_frame") decisions++;
    else if (c.type === "reflection_prompt" || c.type === "inline_chat") questions++;
  }
  if (decisions) parts.push(decisions === 1 ? "a decision to weigh" : `${decisions} decisions to weigh`);
  if (questions) parts.push(questions === 1 ? "a question to answer" : `${questions} questions to answer`);
  if (parts.length === 0) return null;
  return `Needs you on the canvas: ${parts.join(" \xB7 ")}`;
}

// src/views/calloutBox.ts
function calloutBox(parent, kind, title, cls) {
  const callout2 = parent.createDiv({ cls: `callout${cls ? ` ${cls}` : ""}`, attr: { "data-callout": kind } });
  const head = callout2.createDiv({ cls: "callout-title" });
  head.createDiv({ cls: "callout-title-inner", text: title });
  return callout2.createDiv({ cls: "callout-content" });
}

// src/views/inlineCanvas.ts
var import_obsidian33 = require("obsidian");

// src/views/offerActions.ts
async function runOfferOption(plugin, option, params) {
  const moment2 = typeof params?.moment === "string" ? params.moment : "";
  const init = params?.init && typeof params.init === "object" ? params.init : null;
  if (init?.provider === "google" || init?.provider === "microsoft") {
    const opts = { scopeSet: init.scope_set, returnTo: init.return_to };
    const res = init.provider === "google" ? await plugin.backend.googleOAuthInit(opts).catch(() => null) : await plugin.backend.microsoftOAuthInit(opts).catch(() => null);
    const url = res?.data?.auth_url;
    if (!res?.ok || !url) return { ok: false, message: "The consent screen did not answer. Try again in a moment." };
    window.open(url, "_blank");
    return { ok: true, message: "Finish in your browser \u2014 Myu starts reading when you come back." };
  }
  if (option === "stop_asking") {
    const accountId = plugin.settings.account_id;
    if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts: { offer_all_stopped: true } }).catch(() => void 0);
    plugin.welcomeOfferAnswered = true;
    const ack = typeof params?.stopped_ack === "string" && params.stopped_ack ? params.stopped_ack : "Done \u2014 Myu won\u2019t bring this up again. Settings stays the door.";
    return { ok: true, done: "dismissed", ackText: ack, message: ack };
  }
  if (moment2) {
    const accountId = plugin.settings.account_id;
    const answer = async (myuScripts) => {
      if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts }).catch(() => void 0);
    };
    if (option === "not_now") {
      const journalId = typeof params?.journal_id === "string" ? params.journal_id : "";
      if (journalId) await answer({ offer_snoozed_journal: journalId });
      return { ok: true, done: "dismissed", message: "Noted." };
    }
    if (option === "notes_none" || option === "notes_transcripts") {
      await answer({ offer_notes_state: option === "notes_none" ? "none" : "transcripts" });
      return { ok: true, done: "dismissed", message: "Noted." };
    }
    return { ok: false, message: "Not an option here." };
  }
  if (option === "calendar_google" || option === "calendar_microsoft") {
    const opts = { scopeSet: "calendar", returnTo: "dashboard" };
    const init2 = option === "calendar_google" ? await plugin.backend.googleOAuthInit(opts).catch(() => null) : await plugin.backend.microsoftOAuthInit(opts).catch(() => null);
    const url = init2?.data?.auth_url;
    if (!init2?.ok || !url) return { ok: false, message: `${option === "calendar_google" ? "Google" : "Microsoft"} did not answer. Try again, or paste a calendar link.` };
    window.open(url, "_blank");
    return { ok: true, message: "Finish in your browser \u2014 your week starts painting in Today when you come back." };
  }
  if (option === "calendar_ical") {
    const url = String(params?.url ?? "").trim();
    const res = await plugin.backend.addIcalUrl(url).catch(() => null);
    if (!res?.ok || res.data?.success === false) return { ok: false, message: res?.data?.error || "That address did not read as a calendar. Check it ends with .ics and try again." };
    if (!moment2) plugin.welcomeOfferAnswered = true;
    void plugin.refreshTodayNow();
    return { ok: true, done: "connected", message: `${res.data?.events_stored ?? 0} events read \u2713` };
  }
  if (option === "calendar_ics") {
    const picked = await pickFile(".ics,text/calendar");
    if (!picked) return { ok: false, message: "No file chosen." };
    const res = await plugin.backend.uploadIcs(picked.bytes).catch(() => null);
    if (!res?.ok || res.data?.success === false) return { ok: false, message: res?.data?.error || "That file did not read as a calendar export. Export an .ics and try again." };
    if (!moment2) plugin.welcomeOfferAnswered = true;
    void plugin.refreshTodayNow();
    return { ok: true, done: "connected", message: `${res.data?.events_stored ?? 0} events read \u2713` };
  }
  if (option === "just_tell") {
    const accountId = plugin.settings.account_id;
    if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts: { offer_dismissed_at: (/* @__PURE__ */ new Date()).toISOString() } }).catch(() => void 0);
    plugin.welcomeOfferAnswered = true;
    return { ok: true, done: "dismissed", message: "Noted \u2014 just tell Myu as you go." };
  }
  return { ok: false, message: "Not an option here." };
}
function offerSource(moment2, component) {
  if (moment2 === "calendar" || moment2 === "mail" || moment2 === "notes" || moment2 === "connect_rest" || moment2 === "history") return moment2;
  const options = (component.data?.options ?? []).map((o) => o.id ?? "");
  if (options.some((id) => id.startsWith("calendar"))) return "calendar";
  if (options.some((id) => id === "gmail" || id === "microsoft" || id.startsWith("mail"))) return "mail";
  if (options.some((id) => id.startsWith("drive") || id.startsWith("notes"))) return "notes";
  return "unknown";
}

// src/views/inlineCanvas.ts
var FLASH_MS = 1400;
function staysOpen(component) {
  if (component.type === "offer_block") return true;
  return /^linkedin_(confirm|recover)/.test(component.id ?? "");
}
function foldLabel(component, markdown) {
  const label = (component.label ?? "").trim() || (typeof component.data?.title === "string" ? String(component.data.title).trim() : "");
  if (label) return label;
  const firstLine = markdown.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length > 0) ?? "";
  const plain = firstLine.replace(/[*_`>[\]]/g, "").trim();
  return plain.length > 72 ? `${plain.slice(0, 71)}\u2026` : plain || "More";
}
function revealComponent(root, componentId, expanded, refresh) {
  const el = root.querySelector(`[data-myu-component-id="${CSS.escape(componentId)}"]`);
  if (!(el instanceof HTMLElement)) return false;
  if (!expanded.has(componentId)) {
    expanded.add(componentId);
    refresh();
  }
  el.scrollIntoView({ block: "center" });
  el.classList.add("is-flashing");
  window.setTimeout(() => el.classList.remove("is-flashing"), FLASH_MS);
  return true;
}
function renderInlineCanvas(parent, compositionId, spec, host) {
  const region = parent.createDiv({ cls: "myu-inline-canvas", attr: { "data-myu-canvas-id": compositionId } });
  const head = region.createDiv({ cls: "myu-inline-canvas-head" });
  const title = (spec.summary_text ?? "").trim().split("\n")[0] ?? "";
  head.createSpan({ cls: "myu-whisper", text: title ? `canvas \xB7 ${title}` : "canvas" });
  const door = head.createEl("button", { cls: "myu-affordance myu-link-button", text: "Open canvas" });
  door.onclick = () => host.openCanvas(compositionId);
  const run = async (componentId, action, params) => {
    if (action.startsWith("offer:")) {
      const out = await runOfferOption(host.plugin, action.slice("offer:".length), params);
      if (out.done) host.refresh();
      return { ok: out.ok, message: out.ackText ?? out.message };
    }
    const res = await host.plugin.backend.executeCompositionAction(compositionId, componentId, action, params).catch(() => null);
    const d = res?.data;
    if (!res?.ok || !d) return { ok: false, message: res?.error || "Could not reach Myu." };
    if (d.response_type === "error" || d.success === false) return { ok: false, message: d.error || d.message || "That didn\u2019t work." };
    if (d.composition || d.surface_mutations?.length) host.refresh();
    return { ok: true, message: d.message };
  };
  const interact = async (componentId, interaction) => {
    const res = await host.plugin.backend.postCompositionInteraction([{ composition_id: compositionId, component_id: componentId, component_type: interaction.component_type, event_type: interaction.event_type, action_value: interaction.action_value, timestamp: Date.now(), metadata: interaction.metadata }], true).catch(() => null);
    if (res?.data?.response_generating) host.plugin.expectChatReply();
  };
  for (const entry of compositionFlow(spec)) {
    if ("scene" in entry) {
      region.createDiv({ cls: "myu-whisper myu-inline-scene", text: entry.scene.toLowerCase() });
      continue;
    }
    const { component, depth } = entry;
    const markdown = componentMarkdown(component, depth, () => null, spec.components, "pane").trim();
    const ask = staysOpen(component);
    const open = ask || host.expanded.has(component.id);
    const holder = region.createDiv({ cls: `myu-inline-component myu-canvas-${component.type}`, attr: { "data-myu-component-id": component.id } });
    if (!ask) {
      const details = holder.createEl("details", { cls: "myu-fold" });
      if (open) details.setAttr("open", "");
      details.createEl("summary", { text: foldLabel(component, markdown) });
      const body2 = details.createDiv({ cls: "markdown-rendered" });
      if (markdown) void import_obsidian33.MarkdownRenderer.render(host.app, markdown, body2, "", host.component);
      details.addEventListener("toggle", () => {
        if (details.hasAttribute("open")) host.expanded.add(component.id);
        else host.expanded.delete(component.id);
      });
      continue;
    }
    const box = calloutBox(holder, component.type === "offer_block" ? "tip" : "question", foldLabel(component, markdown), "myu-inline-ask");
    const body = box.createDiv({ cls: "markdown-rendered" });
    if (markdown) void import_obsidian33.MarkdownRenderer.render(host.app, markdown, body, "", host.component);
    renderComponentActions(box, component, { run, interact });
  }
  const doors = region.createDiv({ cls: "myu-canvas-actions" });
  const save = doors.createEl("button", { cls: "myu-affordance myu-link-button", text: "Save to vault" });
  save.onclick = () => host.saveCanvas(compositionId);
}

// src/composition/afterTurn.ts
function canvasAfterTurn(canvas, openId) {
  if (!canvas) return { kind: "none" };
  const mutations = Array.isArray(canvas.surface_mutations) ? canvas.surface_mutations : [];
  const target = canvas.continues_composition_id || openId || canvas.composition_id || "";
  if (!target) return { kind: "none" };
  if (openId) {
    if (target !== openId) return { kind: "open", compositionId: target };
    const nextId = canvas.composition_id && canvas.composition_id !== openId ? canvas.composition_id : void 0;
    if (mutations.length) return { kind: "apply", compositionId: target, mutations, ...nextId ? { nextId } : {} };
    return nextId ? { kind: "open", compositionId: nextId } : { kind: "none" };
  }
  if (!mutations.length) return { kind: "none" };
  return { kind: "offer", compositionId: canvas.composition_id || target, summaryText: canvas.summary_text?.trim() || "" };
}

// src/views/ReplyRatingModal.ts
var import_obsidian34 = require("obsidian");

// src/views/feedbackAttachment.ts
function turnText(turn) {
  if (turn.text) return turn.text;
  return (turn.blocks ?? []).map((b) => chatBlockMarkdown(b)).filter(Boolean).join("\n\n");
}
var COMPOSITION_JSON_CAP = 1e5;
function formatCompositionAttachment(canvas) {
  const lines = [`--- Canvas Composition (${canvas.source}) ---`, `ID: ${canvas.id}`];
  try {
    const json = JSON.stringify(canvas.spec, null, 2);
    lines.push(json.length > COMPOSITION_JSON_CAP ? json.slice(0, COMPOSITION_JSON_CAP) + "\n... [truncated]" : json);
  } catch {
    lines.push("(could not serialize composition)");
  }
  return lines.join("\n");
}
function formatConversationAttachment(turns, journalId, now = /* @__PURE__ */ new Date(), canvases = []) {
  const opening = turns[0]?.role === "user" ? turnText(turns[0]) : "";
  const rest = turns[0]?.role === "user" ? turns.slice(1) : turns;
  const lines = ["--- Journal Entry ---", `ID: ${journalId}`, `Timestamp: ${now.toISOString()}`, "", opening || "(empty content)"];
  if (rest.length > 0) {
    lines.push("", "--- Journal Chat ---");
    for (const t of rest) lines.push(`[${t.role === "myu" ? "agent" : "user"}] ${turnText(t)}`);
  }
  const entry = opening.trim() || "(empty entry)";
  const summary = [`Journal entry (${now.toLocaleString()}):`, entry.length > 2e3 ? entry.slice(0, 2e3) + "\u2026" : entry, "", `${rest.length} chat turn${rest.length === 1 ? "" : "s"} attached in full.${canvases.length ? ` ${canvases.length} canvas${canvases.length === 1 ? "" : "es"} attached (${canvases.map((c) => c.id).join(", ")}).` : ""}`];
  const parts = [lines.join("\n"), ...canvases.map(formatCompositionAttachment)];
  return { attached_content: parts.join("\n\n"), attached_summary: summary.join("\n") };
}

// src/views/ReplyRatingModal.ts
var ReplyRatingModal = class extends import_obsidian34.Modal {
  constructor(app, plugin, rating, journalId, turns, onSubmitted) {
    super(app);
    this.plugin = plugin;
    this.rating = rating;
    this.journalId = journalId;
    this.turns = turns;
    this.onSubmitted = onSubmitted;
    this.note = "";
    this.attach = true;
    this.busy = false;
    this.problem = null;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: this.rating === 1 ? "What worked?" : "What was off?" });
    const box = contentEl.createEl("textarea", { cls: "myu-chat-input", attr: { rows: "4", placeholder: "Optional \u2014 anything to add?", "aria-label": "Your note" } });
    box.value = this.note;
    box.oninput = () => {
      this.note = box.value;
    };
    new import_obsidian34.Setting(contentEl).setName("Attach this conversation and its canvas").setDesc(`${this.turns.length} turn${this.turns.length === 1 ? "" : "s"} as text \u2014 decrypted, so the team can read what you rated \u2014 plus the canvas this conversation made. Off: only the rating and your optional comments.`).addToggle((t) => t.setValue(this.attach).onChange((v) => {
      this.attach = v;
    }));
    if (this.problem) contentEl.createDiv({ cls: "myu-problem", text: this.problem });
    new import_obsidian34.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton((b) => b.setButtonText(this.busy ? "Sending\u2026" : "Send").setCta().setDisabled(this.busy).onClick(() => void this.send()));
  }
  async send() {
    this.busy = true;
    this.problem = null;
    this.render();
    const attachments = this.attach ? formatConversationAttachment(this.turns, this.journalId, /* @__PURE__ */ new Date(), await this.gatherCanvases()) : void 0;
    const res = await this.plugin.sendFeedback({ message: this.note.trim(), category: "myu_response", rating: this.rating, surface: "chat", journalId: this.journalId, attachments }).catch(() => null);
    this.busy = false;
    if (res?.ok) {
      notifyStatus("Thanks \u2014 feedback recorded.");
      this.onSubmitted();
      this.close();
      return;
    }
    this.problem = res?.data?.error === "attachment_too_large" ? "Attachment too large \u2014 try without the conversation." : res?.data?.error === "Rate limit exceeded" ? `Too many in a row \u2014 try again in ${res.data.retry_after_minutes ?? 60} minutes.` : res?.error || "Something went wrong. Please try again.";
    this.render();
  }
  /** Only the canvas this conversation made — the web's linked composition (operator, 2026-08-30: not the pane's). */
  async gatherCanvases() {
    const linked = await this.plugin.backend.getCompositionForJournal(this.journalId).catch(() => null);
    const linkedSpec = linked?.data?.composition;
    const linkedId = linked?.data?.composition_id || (linkedSpec && typeof linkedSpec.id === "string" ? linkedSpec.id : "");
    return linkedSpec && linkedId ? [{ id: linkedId, spec: linkedSpec, source: "Linked to journal" }] : [];
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/conversations.ts
async function readText(enc, plain, key) {
  if (typeof enc === "string" && enc && key) {
    try {
      return await decryptWithKey(enc, key);
    } catch {
      return null;
    }
  }
  return typeof plain === "string" ? plain : "";
}
async function listConversations(deps) {
  if (!deps.accountId) return [];
  const res = await deps.backend.getJournalEntries(deps.accountId, 0, Date.now());
  const entries = Array.isArray(res.data?.entries) ? res.data.entries : [];
  const out = [];
  for (const entry of entries) {
    const journalId = String(entry.journal_id ?? entry.id ?? "");
    if (!journalId) continue;
    const created = parseWhen(firstPresent(entry.timestamp, entry.occurred_at, entry.created_at, entry.created));
    const text = await readText(entry.encrypted_content, entry.content, deps.key);
    if (text === null || !text.trim()) continue;
    out.push({ journalId, day: created ? created.toISOString().slice(0, 10) : "", preview: text.trim().slice(0, 90) });
  }
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}
async function loadConversation(deps, journalId, opening, onOffer) {
  const turns = [];
  if (opening) turns.push({ role: "user", text: `(${opening.day}) ${opening.preview}` });
  const res = await deps.backend.getJournalChats(journalId);
  if (onOffer && res.data?.offer) onOffer(res.data.offer);
  const chats = Array.isArray(res.data?.chats) ? res.data.chats : [];
  for (const chat of chats) {
    const content = await readText(chat.encrypted_content, chat.content, deps.key);
    if (content === null || !content.trim()) continue;
    const parsed = parseChatTurn({ content });
    if (parsed.blocks.length > 0 && content.trim().startsWith("{")) {
      turns.push({ role: "myu", blocks: parsed.blocks, references: parsed.references });
    } else {
      turns.push({ role: "user", text: content });
    }
  }
  return turns;
}

// src/views/ChatView.ts
var CHAT_VIEW_TYPE = "askmyu-chat";
var ChatView = class extends import_obsidian35.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.turns = [];
    /** P8.10 — the conversations browser: past entries, resumable in place. */
    this.browsing = false;
    /** Panel behavior (2026-08-25): the chat FOLLOWS the active note like the
        extension panel follows the Gmail thread — grounding rides along unless
        the user mutes it. */
    this.followActive = true;
    this.pastEntries = null;
    /** The browser's search — the web's "Search journals…" box, over decrypted previews. */
    this.pastQuery = "";
    /** 👍/👎 given, per Myu turn index — so a rating is shown, not repeatable. */
    this.ratings = /* @__PURE__ */ new Map();
    this.journalId = null;
    this.pendingContext = null;
    this.pendingTemplateType = null;
    this.busy = false;
    this.draft = "";
    // ── the cold-start calendar offer, inline (canonical in the thread) ────────
    // The web's AssistantOutput: the offer_block arrives server-composed inside
    // the welcome composition; presence of the component IS the gate, the panel
    // being open is the suppressor, and a real "no" ends the ask everywhere.
    this.inlineOffer = null;
    this.offerDone = null;
    /** Server-authored acknowledgement shown in place of an answered offer (stop_asking). */
    this.offerDoneText = null;
    // ── what the canvas needs, said in the row ─────────────────────────────────
    // A tab is invisible furniture: when the conversation's canvas carries an
    // ask, the row names it and Open canvas becomes the cta.
    this.canvasAsks = /* @__PURE__ */ new Map();
    /** Specs for the canvases this thread shows inline. */
    this.canvasSpecs = /* @__PURE__ */ new Map();
    this.canvasFetching = /* @__PURE__ */ new Set();
    /** Folds the reader opened, by component id — the thread re-renders on every event. */
    this.expandedComponents = /* @__PURE__ */ new Set();
    // ── the LinkedIn ask, in the conversation that names the person ────────────
    // "Confirm the LinkedIn match for Jim" as reply prose with no door is a dead
    // end (operator, 2026-08-31). When a pending disambiguation's person is
    // named in this thread, the panel's own match cards render right here.
    this.linkedinAsk = null;
  }
  getViewType() {
    return CHAT_VIEW_TYPE;
  }
  getDisplayText() {
    return "Myu \u2014 chat";
  }
  getIcon() {
    return "message-circle";
  }
  async onOpen() {
    queueMicrotask(() => this.contentEl.querySelector("textarea.myu-chat-input")?.focus());
    this.contentEl.addClass("myu-today");
    this.render();
  }
  async onClose() {
    this.contentEl.empty();
  }
  /**
   * Seed a fresh conversation (prep's ask/after, a card's discuss ▸, a note).
   * A seed always starts a NEW thread: the context belongs to its first
   * message, and continuing an old thread with a new subject's context would
   * attribute the old conversation to the new subject.
   */
  seed(seed) {
    this.turns = [];
    this.journalId = null;
    this.pendingContext = seed.context ?? null;
    this.pendingTemplateType = seed.templateType ?? null;
    this.draft = seed.send ? "" : seed.text;
    this.render();
    if (seed.send && seed.text.trim()) void this.send(seed.text);
  }
  /** A blank thread: this conversation is finished, the next one starts clean. */
  startNew() {
    this.turns = [];
    this.journalId = null;
    this.pendingContext = null;
    this.pendingTemplateType = null;
    this.draft = "";
    this.browsing = false;
    this.canvasSpecs.clear();
    this.canvasFetching.clear();
    this.canvasAsks.clear();
    this.expandedComponents.clear();
    this.inlineOffer = null;
    this.offerDone = null;
    this.offerDoneText = null;
    this.linkedinAsk = null;
    this.ratings.clear();
    this.render();
  }
  async send(text) {
    const content = text.trim();
    if (!content || this.busy) return;
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    if (!this.pendingContext && this.followActive && !this.journalId) {
      const active = this.app.workspace.getActiveFile();
      if (active && active.extension === "md") {
        this.pendingContext = await this.plugin.chatContextForFile(active) ?? null;
      }
    }
    this.turns.push({ role: "user", text: content });
    this.draft = "";
    this.busy = true;
    this.render();
    const context = this.pendingContext ?? void 0;
    this.pendingContext = null;
    const openId = this.plugin.openCanvasId();
    const canvasOpts = { surfaceMode: openId ? "dual" : "journal", ...openId ? { continuesCompositionId: openId } : {} };
    const res = this.journalId ? await this.plugin.backend.addChatTurn(accountId, this.journalId, content, context, canvasOpts) : await this.plugin.backend.createChatEntry(accountId, content, context, this.pendingTemplateType ?? void 0, canvasOpts);
    this.busy = false;
    if (!res.ok || !res.data) {
      this.turns.push({
        role: "myu",
        text: res.error === "offline" ? "You're offline \u2014 this didn't send. Try again when you're back." : "That didn't reach Myu. Try again in a moment."
      });
      this.render();
      return;
    }
    if (res.data.journal_id) this.journalId = res.data.journal_id;
    if (res.data.offer) this.adoptDeliveredOffer(res.data.offer);
    const blocks = [...res.data.blocks];
    const step = canvasAfterTurn(res.data.canvas, this.plugin.openCanvasId());
    if (step.kind === "apply") {
      this.plugin.applyCanvasMutations(step.compositionId, step.mutations);
      if (step.nextId) this.plugin.adoptCanvasId(step.nextId);
      const live = step.nextId ?? step.compositionId;
      this.canvasSpecs.delete(live);
      if (!blocks.some((b) => b.type === "composition_offer" && b.composition_id === live)) {
        blocks.push({ type: "composition_offer", composition_id: live, summary_text: res.data.canvas?.summary_text ?? "", action_label: "Open canvas" });
      }
    } else if (step.kind === "open") {
      if (!blocks.some((b) => b.type === "composition_offer" && b.composition_id === step.compositionId)) {
        blocks.push({ type: "composition_offer", composition_id: step.compositionId, summary_text: res.data.canvas?.summary_text ?? "", action_label: "Open canvas" });
      }
      void this.plugin.openCanvas(step.compositionId, { reveal: false });
    } else if (step.kind === "offer" && !blocks.some((b) => b.type === "composition_offer" && b.composition_id === step.compositionId)) {
      blocks.push({ type: "composition_offer", composition_id: step.compositionId, summary_text: step.summaryText, action_label: "Open canvas" });
    }
    if (step.kind !== "none") {
      const liveId = step.kind === "apply" && step.nextId ? step.nextId : step.compositionId;
      void this.plugin.keepCanvasIfAlwaysOn(liveId, res.data.canvas?.summary_text ?? "");
      void this.fetchInlineOffer(liveId);
    }
    this.turns.push({ role: "myu", blocks, references: res.data.references, related: res.data.similar_entries });
    void this.checkLinkedInAsk();
    for (const b of blocks) {
      if (b.type === "composition_offer" && b.composition_id) void this.plugin.keepCanvasIfAlwaysOn(b.composition_id, b.summary_text ?? "");
    }
    this.render();
  }
  /**
   * The canvas, in the thread. Returns false while the spec is still on its
   * way, so the caller can fall back to the row for that beat.
   */
  renderCanvasInThread(parent, compositionId) {
    const spec = this.canvasSpecs.get(compositionId);
    if (!spec) {
      if (!this.canvasFetching.has(compositionId)) {
        this.canvasFetching.add(compositionId);
        void this.plugin.backend.getComposition(compositionId).then((res) => {
          const loaded = res?.data?.composition;
          if (loaded) {
            this.canvasSpecs.set(compositionId, loaded);
            this.render();
          }
        }).catch(() => void 0);
      }
      return false;
    }
    renderInlineCanvas(parent, compositionId, spec, {
      app: this.app,
      component: this,
      plugin: this.plugin,
      expanded: this.expandedComponents,
      refresh: () => {
        this.canvasSpecs.delete(compositionId);
        this.canvasFetching.delete(compositionId);
        this.render();
      },
      openCanvas: (id) => void this.plugin.openCanvas(id),
      saveCanvas: (id) => new CanvasExportModal(this.app, this.plugin, id).open()
    });
    return true;
  }
  /**
   * The way back: from a canvas to the reply that made it. Returns false when
   * this thread is not the one — the canvas belongs to another conversation,
   * and saying so is better than scrolling to nothing.
   */
  revealCanvas(compositionId) {
    const has = this.turns.some((t) => t.blocks?.some((b) => b.type === "composition_offer" && b.composition_id === compositionId));
    if (!has) return false;
    const el = this.contentEl.querySelector(`[data-myu-canvas-id="${CSS.escape(compositionId)}"]`);
    const target = el instanceof HTMLElement ? el : null;
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.classList.add("is-flashing");
      window.setTimeout(() => target.classList.remove("is-flashing"), 1400);
    }
    return true;
  }
  /** Walk the thread to a component the reply's prose names: open its fold, flash it. */
  revealCanvasComponent(componentId) {
    return revealComponent(this.contentEl, componentId, this.expandedComponents, () => this.render());
  }
  asksFor(compositionId) {
    if (!this.canvasAsks.has(compositionId)) {
      this.canvasAsks.set(compositionId, null);
      void this.plugin.backend.getComposition(compositionId).then((res) => {
        const line = canvasAsksLine(res?.data?.composition);
        if (line) {
          this.canvasAsks.set(compositionId, line);
          this.render();
        }
      }).catch(() => void 0);
    }
    return this.canvasAsks.get(compositionId) ?? null;
  }
  async checkLinkedInAsk() {
    if (this.linkedinAsk) return;
    if (this.plugin.helpQueue.length === 0) await this.plugin.loadHelpQueue();
    const text = this.turns.map((t) => [t.text ?? "", ...(t.blocks ?? []).map((b) => "text" in b && typeof b.text === "string" ? b.text : "")].join("\n")).join("\n");
    const ask = linkedInAskInText(this.plugin.helpQueue, text);
    if (!ask || this.plugin.linkedinAskResolved.has(ask.relationshipId)) return;
    const card = await this.plugin.backend.getCard("person", ask.relationshipId).catch(() => null);
    const suggestions = suggestionsOf(card?.data?.suggestions);
    this.linkedinAsk = { ...ask, suggestions };
    this.render();
  }
  /**
   * Re-check the showing ask against server truth: resolved on the canvas, the
   * web, or another device (entities_changed / a canvas action), the box goes.
   */
  async revalidateLinkedInAsk() {
    const ask = this.linkedinAsk;
    if (!ask) return;
    await this.plugin.loadHelpQueue();
    const stillPending = this.plugin.helpQueue.some((i) => i.item_type === "linkedin_disambiguation" && i.relationship_id === ask.relationshipId);
    if (stillPending) return;
    this.plugin.linkedinAskResolved.add(ask.relationshipId);
    this.linkedinAsk = null;
    this.render();
  }
  renderLinkedInAsk(parent) {
    if (!this.linkedinAsk) return;
    const { relationshipId, personName, suggestions } = this.linkedinAsk;
    const box = calloutBox(parent, "question", `Is this ${personName}?`, "myu-chat-offer");
    renderLinkedInMatchesInline(box, suggestions, {
      app: this.app,
      owner: this,
      plugin: this.plugin,
      relationshipId,
      personName,
      onResolved: () => {
        this.plugin.linkedinAskResolved.add(relationshipId);
        this.linkedinAsk = null;
        void this.plugin.loadHelpQueue();
        void this.plugin.canvasView()?.refresh();
        this.render();
      }
    });
    queueMicrotask(() => {
      try {
        box.scrollIntoView({ block: "nearest" });
      } catch {
      }
    });
  }
  /** A trust-ladder ask riding the reply (or re-served on reopen) — rendered like the calendar offer, once per conversation. */
  adoptDeliveredOffer(offer) {
    if (!offer?.moment) return;
    const journal = typeof offer.journal_id === "string" && offer.journal_id || this.journalId || "";
    if (journal && this.plugin.offerAnsweredJournals.has(journal)) return;
    if (this.inlineOffer?.component.id === "offer_moment" && this.inlineOffer.component.data?.moment === offer.moment) return;
    this.inlineOffer = { compositionId: "", component: { id: "offer_moment", type: "offer_block", data: offer } };
    this.offerDone = null;
    this.offerDoneText = null;
  }
  adoptInlineOffer(spec) {
    if (!spec?.id) return;
    const component = (spec.components ?? []).find((c) => c.type === "offer_block");
    if (!component) return;
    if (component.id === "welcome_offer" && this.plugin.welcomeOfferAnswered) return;
    if (this.inlineOffer?.component.id === component.id && this.inlineOffer.compositionId === spec.id) return;
    this.inlineOffer = { compositionId: spec.id, component };
    this.offerDone = null;
    this.offerDoneText = null;
  }
  async fetchInlineOffer(compositionId) {
    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    this.adoptInlineOffer(res?.data?.composition);
    if (this.inlineOffer) this.render();
  }
  renderInlineOffer(parent) {
    if (!this.inlineOffer || this.offerDone === "dismissed" && !this.offerDoneText) return;
    if (this.inlineOffer.component.id === "welcome_offer" && this.plugin.welcomeOfferAnswered && !this.offerDone) return;
    if (!this.turns.some((t) => t.role === "myu")) return;
    const { compositionId, component } = this.inlineOffer;
    if (!this.offerDone) {
      if (compositionId && this.plugin.openCanvasId() === compositionId) return;
      const data2 = component.data;
      if (data2?.triggered !== true) {
        const mine = offerSource(data2?.moment, component);
        const shown = [this.plugin.canvasView()?.currentSpec(), ...this.canvasSpecs.values()].flatMap((s2) => s2?.components ?? []).filter((c) => c.type === "offer_block").map((c) => offerSource(c.data?.moment, c));
        if (shown.includes(mine)) return;
      }
      if (compositionId && this.canvasSpecs.has(compositionId)) return;
    }
    const box = calloutBox(parent, "tip", "Myu needs a source", "myu-chat-offer");
    if (this.offerDone) {
      box.createDiv({ cls: "myu-voice", text: this.offerDoneText ?? "Calendar\u2019s in. Your week starts painting in Today." });
      return;
    }
    const data = component.data ?? {};
    const text = (v) => typeof v === "string" ? v.trim() : "";
    if (text(data.lead)) box.createDiv({ cls: "myu-voice", text: text(data.lead) });
    if (text(data.gap_line)) box.createDiv({ cls: "myu-quiet", text: text(data.gap_line) });
    const person = data.named_person && typeof data.named_person === "object" ? data.named_person : null;
    if (person && text(person.name)) box.createDiv({ cls: "myu-whisper", text: `${text(person.name)}${text(person.when_text) ? ` \u2014 ${text(person.when_text)}` : ""}` });
    renderComponentActions(box, component, {
      run: async (_componentId, action, params) => {
        const out = await runOfferOption(this.plugin, action.replace(/^offer:/, ""), params);
        if (out.done) {
          this.offerDone = out.done;
          this.offerDoneText = out.ackText ?? null;
          if (component.id === "offer_moment") {
            const journal = (component.data?.journal_id ?? this.journalId) || "";
            if (journal) this.plugin.offerAnsweredJournals.add(journal);
          }
          this.render();
        }
        return { ok: out.ok, message: out.message };
      },
      interact: async () => void 0
    });
    if (text(data.trust_line)) box.createDiv({ cls: "myu-quiet", text: text(data.trust_line) });
    queueMicrotask(() => {
      try {
        box.scrollIntoView({ block: "nearest" });
      } catch {
      }
    });
  }
  /** 👍/👎 under a Myu turn — the web's JournalRatingBar → `/feedback/submit` (myu_response). */
  renderRating(parent, index) {
    const given = this.ratings.get(index);
    const row = parent.createDiv({ cls: "myu-chat-rating" });
    if (given) {
      row.createSpan({ cls: "myu-whisper", text: given === 1 ? "thanks \u2014 noted as a good read" : "thanks \u2014 noted as off the mark" });
      return;
    }
    for (const [rating, icon, label] of [[1, "thumbs-up", "Good read"], [-1, "thumbs-down", "Off the mark"]]) {
      const b = row.createEl("button", { cls: "myu-affordance myu-icon-button myu-rating-btn", attr: { "aria-label": `${label} \u2014 rate this reply` } });
      (0, import_obsidian35.setIcon)(b, icon);
      b.onclick = () => {
        if (!this.journalId) return;
        new ReplyRatingModal(this.app, this.plugin, rating, this.journalId, this.turns.slice(0, index + 1), () => {
          this.ratings.set(index, rating);
          this.render();
        }).open();
      };
    }
  }
  // ── render ────────────────────────────────────────────────────────────────
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("myu-chat");
    const top = root.createDiv({ cls: "myu-chat-top" });
    const active = this.app.workspace.getActiveFile();
    if (active && active.extension === "md" && !this.browsing) {
      const listen = top.createSpan({ cls: "myu-chat-listen" });
      listen.createSpan({ text: this.followActive ? `listening to ${active.basename}` : "not listening" });
      const mute = listen.createEl("button", { cls: this.followActive ? "myu-affordance myu-icon-button" : "myu-affordance" });
      if (this.followActive) {
        (0, import_obsidian35.setIcon)(mute, "x");
        mute.setAttr("aria-label", "Stop listening to this note");
      } else mute.setText("Listen");
      mute.onclick = () => {
        this.followActive = !this.followActive;
        this.render();
      };
    }
    if (!this.browsing && (this.turns.length > 0 || this.journalId)) {
      const fresh = top.createEl("button", { cls: "myu-affordance", text: "New conversation" });
      fresh.onclick = () => this.startNew();
    }
    const browse = top.createEl("button", {
      cls: "myu-affordance",
      text: this.browsing ? "\u2190 back to the conversation" : "Past conversations"
    });
    browse.onclick = () => {
      this.browsing = !this.browsing;
      if (this.browsing && !this.pastEntries) void this.loadPastEntries();
      this.render();
    };
    if (this.browsing) {
      this.renderBrowser(root);
      return;
    }
    const thread = root.createDiv({ cls: "myu-chat-thread" });
    if (this.turns.length === 0 && !this.busy) {
      thread.createEl("p", { cls: "myu-quiet", text: "Talk to Myu \u2014 about a note, a person, or the day." });
    }
    for (const [index, turn] of this.turns.entries()) {
      if (turn.role === "user") {
        thread.createDiv({ cls: "myu-chat-user", text: turn.text ?? "" });
        continue;
      }
      const myu = thread.createDiv({ cls: "myu-chat-myu" });
      myu.createDiv({ cls: "myu-whisper", text: "myu" });
      if (turn.text) myu.createDiv({ cls: "myu-voice", text: turn.text });
      for (const block of turn.blocks ?? []) this.renderBlock(myu, block);
      renderReferences(myu, turn.references);
      renderRelatedEntries(myu, turn.related, (id) => void this.openPastConversation(id));
      if (turn.blocks?.length && this.journalId) this.renderRating(myu, index);
    }
    if (!this.busy) {
      this.renderInlineOffer(thread);
      this.renderLinkedInAsk(thread);
    }
    if (this.busy) thread.createEl("p", { cls: "myu-quiet myu-thinking", text: "Thinking" });
    if (this.turns.length > 1 && !this.busy) {
      const save = thread.createEl("button", { cls: "myu-affordance myu-chat-save", text: "Save this conversation" });
      save.onclick = () => this.plugin.offerConversationSave([...this.turns]);
    }
    const composer = root.createDiv({ cls: "myu-chat-composer" });
    const input = composer.createEl("textarea", {
      cls: "myu-chat-input",
      attr: { rows: "3", placeholder: "Say it plainly\u2026" }
    });
    input.value = this.draft;
    input.oninput = () => {
      this.draft = input.value;
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.send(input.value);
      }
    };
    const send = composer.createEl("button", { cls: "myu-affordance", text: "Send" });
    send.onclick = () => void this.send(input.value);
    if (this.draft) window.setTimeout(() => input.focus(), 0);
  }
  /** The list: recent entries, decrypted previews, newest first. */
  renderBrowser(root) {
    const host = root.createDiv({ cls: "myu-chat-thread" });
    if (this.pastEntries === null) {
      host.createEl("p", { cls: "myu-quiet myu-thinking", text: "Finding your conversations" });
      return;
    }
    if (this.pastEntries.length === 0) {
      host.createEl("p", { cls: "myu-quiet", text: "No past conversations yet \u2014 the first one starts below." });
      return;
    }
    const search = host.createEl("input", { cls: "myu-chat-search", attr: { type: "search", placeholder: "Search conversations\u2026", "aria-label": "Search past conversations" } });
    search.value = this.pastQuery;
    search.oninput = () => {
      this.pastQuery = search.value;
      this.renderBrowserRows(host);
    };
    this.renderBrowserRows(host);
  }
  renderBrowserRows(host) {
    host.querySelector(".myu-chat-past-rows")?.remove();
    const rows = host.createDiv({ cls: "myu-chat-past-rows" });
    const q = this.pastQuery.trim().toLowerCase();
    const shown = (this.pastEntries ?? []).filter((e) => !q || e.preview.toLowerCase().includes(q) || e.day.includes(q));
    if (shown.length === 0) {
      rows.createEl("p", { cls: "myu-quiet", text: "Nothing matches." });
      return;
    }
    for (const entry of shown) {
      const row = rows.createEl("button", { cls: "myu-row-tappable myu-chat-past", attr: { "aria-label": `Open the conversation from ${entry.day}` } });
      row.createSpan({ cls: "myu-whisper", text: entry.day });
      row.createSpan({ cls: "myu-chat-past-preview", text: entry.preview });
      row.onclick = () => void this.openPastConversation(entry.journalId, entry.day);
    }
  }
  /**
   * Re-read this conversation from the server — after a canvas click made Myu
   * answer in it (`response_generating` → `chatrefresh`). The opening entry is
   * not a chat row, so the first user turn is kept from what is on screen.
   */
  async reloadThread() {
    if (!this.journalId || this.busy) return;
    const opening = this.turns[0]?.role === "user" ? this.turns[0] : null;
    const fresh = await loadConversation({ backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id }, this.journalId).catch(() => null);
    if (!fresh) return;
    this.turns = opening ? [opening, ...fresh] : fresh;
    this.render();
  }
  /** A canvas made while you were elsewhere — the web's offer strip, as a row in the thread. */
  /**
   * Put a resumed conversation's canvas beside the reply it belongs to.
   *
   * `/composition/for-journal` says which turn made it (`turn_number`); without
   * that we can only fall back to the last reply. Appending blindly would stick
   * an old canvas onto whatever was said most recently (operator, 2026-09-01:
   * "any past canvas needs to stick to the response it is attached to").
   */
  placeCanvasOnTurn(blocks, turnNumber) {
    const myuTurns = this.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.role === "myu");
    const target = typeof turnNumber === "number" && turnNumber > 0 && turnNumber <= myuTurns.length ? myuTurns[turnNumber - 1] : myuTurns[myuTurns.length - 1];
    if (!target || target.t.blocks?.some((b) => b.type === "composition_offer")) {
      this.turns.push({ role: "myu", blocks });
      return;
    }
    target.t.blocks = [...target.t.blocks ?? [], ...blocks];
  }
  /**
   * Every canvas the conversation made, each on the reply that made it.
   *
   * The reply list is snapshotted BEFORE any placing: a canvas with no reply to
   * belong to becomes a row of its own at the end, and that extra row must not
   * shift where the canvases after it land.
   */
  placeCanvases(rows) {
    const myuTurns = this.turns.filter((t) => t.role === "myu");
    for (const row of rows) {
      if (this.turns.some((t) => t.blocks?.some((b) => b.type === "composition_offer" && b.composition_id === row.compositionId))) continue;
      const block = { type: "composition_offer", composition_id: row.compositionId, summary_text: row.summaryText };
      const target = row.turnNumber <= myuTurns.length ? myuTurns[row.turnNumber - 1] : void 0;
      if (!target || target.blocks?.some((b) => b.type === "composition_offer")) {
        this.turns.push({ role: "myu", blocks: [block] });
        continue;
      }
      target.blocks = [...target.blocks ?? [], block];
    }
  }
  /**
   * A canvas belongs to the reply that made it.
   *
   * Canvases that arrive after the reply (SSE `composition_ready`, or one that
   * took the pane) used to be pushed as their own turn at the END of the
   * thread, so a conversation with four canvases showed one floating row at the
   * bottom and nothing beside the replies that earned them (operator,
   * 2026-09-01). Attach it to the most recent Myu turn instead; only a canvas
   * with no reply to belong to gets a turn of its own.
   */
  offerCanvas(compositionId, summaryText, actionLabel) {
    if (this.turns.some((t) => t.blocks?.some((b) => b.type === "composition_offer" && b.composition_id === compositionId))) return;
    const block = { type: "composition_offer", composition_id: compositionId, summary_text: summaryText, action_label: actionLabel };
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const turn = this.turns[i];
      if (turn?.role !== "myu") continue;
      if (turn.blocks?.some((b) => b.type === "composition_offer")) break;
      turn.blocks = [...turn.blocks ?? [], block];
      this.render();
      return;
    }
    this.turns.push({ role: "myu", blocks: [block] });
    this.render();
  }
  async loadPastEntries() {
    this.pastEntries = await listConversations({ backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id });
    this.render();
  }
  /** Load one past conversation INTO the thread — and it stays resumable:
      the next send chains onto the same journal id, exactly like the web.
      PUBLIC: the Journal notes' "continue this conversation ▸" deep links
      land here (obsidian://myu-chat?journal=…). */
  async openPastConversation(journalId, day = "") {
    this.browsing = false;
    this.journalId = journalId;
    this.pendingContext = null;
    const entry = this.pastEntries?.find((e) => e.journalId === journalId);
    this.turns = await loadConversation(
      { backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id },
      journalId,
      entry ? { day, preview: entry.preview } : void 0,
      (offer) => this.adoptDeliveredOffer(offer)
    );
    void this.checkLinkedInAsk();
    this.render();
    const [liveRes, allRes] = await Promise.all([
      this.plugin.backend.getCompositionForJournal(journalId).catch(() => null),
      this.plugin.backend.getCompositionsForJournal(journalId).catch(() => null)
    ]);
    const forJournal = liveRes?.data;
    this.adoptInlineOffer(forJournal?.composition);
    const canvas = canvasOnResume(forJournal);
    const all = canvasesOnResume(allRes?.data);
    if (canvas && "note" in canvas) {
      this.turns.push({ role: "myu", text: canvas.note });
      this.render();
      return;
    }
    if (all.length > 0) {
      this.placeCanvases(all);
      this.render();
      if (canvas && "blocks" in canvas && !this.inlineOffer) void this.plugin.openCanvas(canvas.open, { reveal: false });
      return;
    }
    if (!canvas) return;
    if ("blocks" in canvas) {
      this.placeCanvasOnTurn(canvas.blocks, canvas.turnNumber);
      this.render();
      if (!this.inlineOffer) void this.plugin.openCanvas(canvas.open, { reveal: false });
    }
  }
  renderBlock(parent, block) {
    renderChatBlock(parent, block, {
      app: this.app,
      component: this,
      openCanvas: (id) => void this.plugin.openCanvas(id),
      asksFor: (id) => this.asksFor(id),
      inlineCanvas: (parent2, id) => this.renderCanvasInThread(parent2, id),
      saveCanvas: (id) => new CanvasExportModal(this.app, this.plugin, id).open(),
      // Strip /api — the web app and the backend share an origin.
      webOrigin: this.plugin.settings.base_url.replace(/\/api\/?$/, ""),
      autoKeep: this.plugin.settings.auto_keep_canvas
    });
  }
};

// src/views/CanvasView.ts
var import_obsidian39 = require("obsidian");

// src/composition/applyMutations.ts
function applyMutations(spec, mutations) {
  let components = [...spec.components ?? []];
  for (const m of mutations) {
    switch (m.op) {
      case "add": {
        if (!m.components?.length) break;
        if (m.position === "end") {
          components.push(...m.components);
          break;
        }
        const at = components.findIndex((c) => c.id === m.target_id);
        if (at < 0) {
          components.push(...m.components);
          break;
        }
        components.splice(m.position === "before" ? at : at + 1, 0, ...m.components);
        break;
      }
      case "remove":
        components = components.filter((c) => c.id !== m.target_id);
        break;
      case "update":
        components = components.map((c) => c.id === m.target_id ? { ...c, data: { ...c.data ?? {}, ...m.data_patch ?? {} } } : c);
        break;
      case "replace": {
        if (m.target_id === "root" && m.components) {
          components = [...m.components];
          break;
        }
        const next = m.components?.[0];
        if (!next) break;
        components = components.map((c) => c.id === m.target_id ? next : c);
        break;
      }
      default:
        break;
    }
  }
  return { ...spec, components };
}

// src/views/canvasFooter.ts
var import_obsidian36 = require("obsidian");
function renderCanvasFooter(parent, state, host) {
  if (state.expired) {
    const bar = parent.createDiv({ cls: "myu-canvas-expired" });
    bar.createSpan({ text: `This canvas may be outdated${state.expired.reason ? ` (${state.expired.reason})` : ""}.` });
    if (state.expired.refreshable && host.onRefresh) {
      const refresh = bar.createEl("button", { cls: "myu-affordance", text: "Refresh" });
      refresh.onclick = () => host.onRefresh?.();
    }
  }
  const tools = parent.createDiv({ cls: "myu-canvas-tools" });
  if (state.canUndo && host.onUndo) {
    const undo = tools.createEl("button", { cls: "myu-affordance", text: "Undo" });
    undo.onclick = () => host.onUndo?.();
  }
  if (host.onHistory) {
    const history = tools.createEl("button", { cls: "myu-affordance myu-link-button", text: "Past canvases\u2026" });
    history.onclick = () => host.onHistory?.();
  }
  const row = new import_obsidian36.Setting(parent).setName("Always keep in my vault").setDesc(state.autoKeep ? "Every canvas this pane shows is saved to Myu/Canvas/." : "Off \u2014 save each canvas yourself.").addToggle((t) => t.setValue(state.autoKeep).onChange((v) => host.onToggle(v)));
  row.settingEl.addClass("myu-canvas-footer");
  if (!state.autoKeep) {
    const keep = parent.createEl("button", { cls: "myu-affordance", text: "Save to my vault" });
    keep.onclick = () => host.onSave();
    return;
  }
  if (state.problem) parent.createDiv({ cls: "myu-problem", text: state.problem });
  else if (state.keptPath) parent.createDiv({ cls: "myu-whisper", text: `kept in ${state.keptPath}` });
}

// src/views/AutoKeepModal.ts
var import_obsidian37 = require("obsidian");
var AutoKeepModal = class extends import_obsidian37.Modal {
  constructor(app, onAnswer) {
    super(app);
    this.onAnswer = onAnswer;
    this.answered = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Keep every canvas in your vault?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "While this is on, every canvas this pane shows is saved into Myu/Canvas/ \u2014 the same composition updates its file in place and keeps your layout; a new one gets a new file. Canvases Myu makes expire on the server within a day; the vault copy is the one that lasts."
    });
    contentEl.createEl("p", {
      cls: "myu-prose myu-quiet",
      text: "Worth knowing: vault files sync through whatever you use, and anything written here leaves Myu\u2019s reach permanently. Turn the switch off any time; files already kept stay yours."
    });
    new import_obsidian37.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.answer(false))).addButton((b) => b.setButtonText("Keep every canvas").setCta().onClick(() => this.answer(true)));
  }
  answer(keep) {
    this.answered = true;
    this.close();
    this.onAnswer(keep);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.onAnswer(false);
    }
  }
};

// src/views/CanvasHistoryModal.ts
var import_obsidian38 = require("obsidian");
function whenOf2(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : "";
}
var CanvasHistoryModal = class extends import_obsidian38.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.rows = [];
    this.setPlaceholder("Open a past canvas\u2026");
  }
  async onOpen() {
    await super.onOpen();
    const res = await this.plugin.backend.getCompositionHistory(50).catch(() => null);
    this.rows = (res?.data?.compositions ?? []).filter((r) => r.composition_id || r.id);
    this.inputEl.dispatchEvent(new Event("input"));
  }
  getItems() {
    return this.rows;
  }
  getItemText(row) {
    return [row.summary_text, row.subject_name, whenOf2(row.created_at)].filter(Boolean).join(" ");
  }
  renderSuggestion(match, el) {
    const r = match.item;
    el.createDiv({ text: r.summary_text || r.subject_name || "Untitled canvas" });
    const meta = [r.subject_name && r.summary_text ? r.subject_name : "", whenOf2(r.created_at), r.is_expired ? "expired on the server" : ""].filter(Boolean).join(" \xB7 ");
    if (meta) el.createDiv({ cls: "myu-quiet", text: meta });
  }
  onChooseItem(row) {
    const id = String(row.composition_id ?? row.id ?? "");
    if (id) void this.plugin.openCanvas(id);
  }
};

// src/views/CanvasView.ts
var CANVAS_VIEW_TYPE = "askmyu-canvas";
var CanvasView = class extends import_obsidian39.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.compositionId = null;
    this.title = "Myu \u2014 canvas";
    this.state = "idle";
    /** The spec on screen — mutated by the controls, then re-rendered. */
    this.spec = null;
    /** Undo, the web's way: a snapshot before every change, 20 deep, client-only. */
    this.snapshots = [];
    /** Pinned: this pane holds still. Obsidian's *linked* pane, applied to canvases. */
    this.pinned = false;
    /** Recent canvases, newest first — the stepper's ground, fetched with the pane. */
    this.history = [];
    /** A newer canvas arrived while this one was pinned or being read. */
    this.newer = null;
    /** The server's word that this canvas is stale (composition_expired) — shown, never acted on silently. */
    this.expired = null;
    this.keptPath = null;
    this.keepProblem = null;
    this.resolvePerson = (name) => {
      const path = this.plugin.personIndex.find(name)?.path;
      return path ? path.replace(/\.md$/, "").split("/").pop() ?? null : null;
    };
    /**
     * A control pressed on a card. The web's sequence, exactly: POST the action,
     * apply the returned mutations to the spec on screen, persist them
     * (fire-and-forget, as the web does), re-render. Errors come back to the
     * row that asked — never a silent no-op.
     */
    this.runAction = async (componentId, action, params) => {
      if (!this.compositionId || !this.spec) return { ok: false, message: "No canvas open." };
      if (action.startsWith("offer:")) return this.runOffer(componentId, action.slice("offer:".length), params);
      if (action === "inline_chat" && typeof params?.message === "string") this.chatMessages.push(params.message);
      const res = await this.plugin.backend.executeCompositionAction(this.compositionId, componentId, action, params).catch(() => null);
      const d = res?.data;
      if (!res?.ok || !d) return { ok: false, message: res?.error || "Could not reach Myu." };
      if (d.response_type === "error" || d.success === false) return { ok: false, message: d.error || d.message || "That didn\u2019t work." };
      if (d.composition || d.surface_mutations?.length) this.snapshot();
      if (d.composition) this.spec = d.composition;
      if (Array.isArray(d.surface_mutations) && d.surface_mutations.length > 0) {
        this.spec = applyMutations(this.spec, d.surface_mutations);
        void this.plugin.backend.persistCompositionMutations(this.compositionId, d.surface_mutations).catch(() => void 0);
      }
      if (d.composition || d.surface_mutations?.length) {
        this.render();
        void this.autoKeep();
      }
      void this.plugin.chatView()?.revalidateLinkedInAsk();
      return { ok: true, message: d.message };
    };
    /**
     * The interaction record — the web's `recordInteraction` + immediate flush
     * for high-signal events. `generate_response` on: the backend answers in the
     * conversation (chat turn + `chatrefresh`), and may mutate this canvas
     * (`composition_mutation`, already handled). The reply lands in the chat
     * pane; `expectChatReply` makes sure it is shown.
     */
    this.interact = async (componentId, spec) => {
      if (!this.compositionId) return;
      const res = await this.plugin.backend.postCompositionInteraction([{ composition_id: this.compositionId, component_id: componentId, component_type: spec.component_type, event_type: spec.event_type, action_value: spec.action_value, timestamp: Date.now(), metadata: spec.metadata }], true).catch(() => null);
      if (res?.data?.response_generating) this.plugin.expectChatReply();
    };
    /** What was asked of this canvas through inline_chat — summarised into the thread on close, like the web's canvas chat bar. */
    this.chatMessages = [];
  }
  getViewType() {
    return CANVAS_VIEW_TYPE;
  }
  getDisplayText() {
    return this.title;
  }
  getIcon() {
    return "layout-dashboard";
  }
  async onOpen() {
    void this.loadHistory();
    this.contentEl.addClass("myu-canvas");
    if (this.compositionId) await this.showComposition(this.compositionId);
    else this.render();
  }
  snapshot() {
    if (!this.spec) return;
    this.snapshots.push(this.spec);
    if (this.snapshots.length > 20) this.snapshots.shift();
  }
  undo() {
    const prev = this.snapshots.pop();
    if (!prev) return false;
    this.spec = prev;
    this.render();
    void this.autoKeep();
    return true;
  }
  markExpired(compositionId, reason, refreshAvailable) {
    if (this.compositionId !== compositionId) return false;
    this.expired = { reason, refreshable: refreshAvailable !== false };
    this.render();
    return true;
  }
  /** False when the pane is pinned — a new canvas must not take it. */
  followsLatest() {
    return !this.pinned;
  }
  /** A newer canvas exists; say so rather than swapping under a pinned pane. */
  noteNewer(compositionId, summary) {
    if (!compositionId || compositionId === this.compositionId) return;
    this.newer = { compositionId, summary };
    this.render();
  }
  /** What this pane shows — the id the chat sends as `continues_composition_id`. */
  currentId() {
    return this.compositionId;
  }
  /** The spec on screen, for a feedback attachment. */
  currentSpec() {
    return this.spec;
  }
  /**
   * Mutations that arrived from OUTSIDE the pane — a chat turn's canvas side,
   * or a composition_mutation event. Applied in place like the web's store;
   * not persisted from here (the backend already holds them).
   */
  /** The same canvas under a new id (the reply's `composition_id`): follow it, no refetch. */
  adoptId(compositionId) {
    if (!compositionId || compositionId === this.compositionId) return;
    this.compositionId = compositionId;
    this.keptPath = null;
    void this.autoKeep();
  }
  applyRemoteMutations(compositionId, mutations) {
    if (this.compositionId !== compositionId || !this.spec || mutations.length === 0) return false;
    this.snapshot();
    this.spec = applyMutations(this.spec, mutations);
    this.render();
    void this.autoKeep();
    return true;
  }
  async showComposition(compositionId) {
    this.compositionId = compositionId;
    this.state = "loading";
    this.spec = null;
    this.snapshots = [];
    this.expired = null;
    this.render();
    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    const spec = res?.data?.composition ?? null;
    if (!res?.ok || !spec) {
      this.state = "error";
      this.render();
      return;
    }
    this.state = "idle";
    this.spec = spec;
    this.keptPath = null;
    this.keepProblem = null;
    this.newer = null;
    this.render();
    void this.autoKeep();
    void this.loadHistory();
  }
  /**
   * The switch, honoured: keep what the pane shows, quietly, and say where.
   * Runs on show and after every mutation, so the file tracks the canvas;
   * P-CANVAS-2 merges into the existing file and keeps the user's layout.
   */
  async autoKeep() {
    if (!this.plugin.settings.auto_keep_canvas || !this.compositionId || !this.spec) return;
    const outcome = await this.plugin.exportComposition(this.compositionId, "canvas", { quiet: true });
    if (outcome.status === "written") {
      this.keptPath = outcome.canvasPath;
      this.keepProblem = null;
    } else {
      this.keepProblem = `Couldn\u2019t keep this canvas: ${outcome.message}`;
    }
    this.render();
  }
  onToggleKeep(next) {
    if (!next) {
      this.plugin.settings.auto_keep_canvas = false;
      void this.plugin.saveSettings();
      this.render();
      return;
    }
    new AutoKeepModal(this.app, (keep) => {
      if (keep) {
        this.plugin.settings.auto_keep_canvas = true;
        void this.plugin.saveSettings();
        void this.autoKeep();
      }
      this.render();
    }).open();
  }
  /**
   * The offer block's doors (cold start, slice 4) — the web's OfferBlockRenderer,
   * in the pane. Success rewrites the block in place ("Calendar's in…"), the
   * dismissal removes it and is remembered on the account.
   */
  async runOffer(componentId, option, params) {
    const out = await runOfferOption(this.plugin, option, params);
    if (out.done === "connected" && this.spec) {
      this.snapshot();
      this.spec = applyMutations(this.spec, [{ op: "update", target_id: componentId, data_patch: { lead: "Calendar\u2019s in. Your week starts painting in Today.", gap_line: "", options: [], trust_line: "", named_person: null } }]);
      this.render();
    }
    if (out.done === "dismissed" && this.spec) {
      this.snapshot();
      this.spec = out.ackText ? applyMutations(this.spec, [{ op: "update", target_id: componentId, data_patch: { lead: out.ackText, gap_line: "", options: [], trust_line: "", named_person: null } }]) : applyMutations(this.spec, [{ op: "remove", target_id: componentId }]);
      this.render();
    }
    return { ok: out.ok, message: out.message };
  }
  render() {
    const root = this.contentEl;
    root.empty();
    if (this.state === "loading") {
      root.createDiv({ cls: "myu-quiet", text: "reading\u2026" });
      return;
    }
    if (this.state === "error") {
      root.createDiv({ cls: "myu-quiet", text: "Couldn't load that canvas." });
      return;
    }
    if (!this.spec) {
      root.createDiv({ cls: "myu-quiet", text: "No canvas open." });
      return;
    }
    this.renderHeader(root);
    const body = root.createDiv({ cls: "myu-canvas-body" });
    if (this.spec.summary_text?.trim()) {
      const lead = body.createDiv({ cls: "myu-canvas-component markdown-rendered" });
      void import_obsidian39.MarkdownRenderer.render(this.app, this.spec.summary_text.trim(), lead, "", this);
    }
    for (const entry of compositionFlow(this.spec)) {
      if ("scene" in entry) {
        body.createEl("h2", { cls: "myu-canvas-scene", text: entry.scene });
        continue;
      }
      const { component, depth } = entry;
      const md = componentMarkdown(component, depth, this.resolvePerson, this.spec.components, "pane").trim();
      const host = body.createDiv({ cls: `myu-canvas-component myu-canvas-${component.type} markdown-rendered` });
      if (md) void import_obsidian39.MarkdownRenderer.render(this.app, md, host, "", this);
      renderComponentActions(host, component, { run: this.runAction, interact: this.interact });
    }
    renderCanvasFooter(root, { autoKeep: this.plugin.settings.auto_keep_canvas, keptPath: this.keptPath, problem: this.keepProblem, canUndo: this.snapshots.length > 0, expired: this.expired }, {
      onToggle: (next) => this.onToggleKeep(next),
      // The pane KNOWS which composition it is showing.
      onSave: () => new CanvasExportModal(this.app, this.plugin, this.compositionId ?? void 0).open(),
      onUndo: () => {
        this.undo();
      },
      onHistory: () => new CanvasHistoryModal(this.app, this.plugin).open(),
      onRefresh: () => void this.refresh()
    });
  }
  /**
   * The header the pane never had: WHICH canvas this is, how to step to the one
   * before it, and whether the pane is following. Every artifact panel worth
   * copying does this in place (Claude's ← → at the top of the panel, ChatGPT's
   * version arrows in the toolbar) rather than sending you to a list.
   */
  renderHeader(root) {
    const head = root.createDiv({ cls: "myu-canvas-head" });
    const title = (this.spec?.summary_text ?? "").trim().split("\n")[0] || "Canvas";
    head.createDiv({ cls: "myu-canvas-heading", text: title.length > 64 ? `${title.slice(0, 63)}\u2026` : title });
    const row = head.createDiv({ cls: "myu-canvas-nav" });
    const rows = this.history.some((h) => (h.composition_id ?? h.id) === this.compositionId) ? this.history : [{ composition_id: this.compositionId ?? "", summary_text: this.spec?.summary_text }, ...this.history];
    const index = rows.findIndex((h) => (h.composition_id ?? h.id) === this.compositionId);
    const total = rows.length;
    const older = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Older canvas" } });
    (0, import_obsidian39.setIcon)(older, "chevron-left");
    older.disabled = index < 0 || index >= total - 1;
    older.onclick = () => void this.stepTo(rows, index + 1);
    const newerBtn = row.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Newer canvas" } });
    (0, import_obsidian39.setIcon)(newerBtn, "chevron-right");
    newerBtn.disabled = index <= 0;
    newerBtn.onclick = () => void this.stepTo(rows, index - 1);
    row.createSpan({ cls: "myu-whisper", text: total > 1 ? `${index + 1} of ${total}` : "the only canvas so far" });
    const pin = row.createEl("button", { cls: `myu-affordance myu-icon-button myu-canvas-pin${this.pinned ? " myu-cta" : ""}`, attr: { "aria-label": this.pinned ? "Pinned: this canvas stays put. A newer one waits, and says so here." : "Following the newest: a new canvas takes this pane. Pin to hold this one." } });
    (0, import_obsidian39.setIcon)(pin, this.pinned ? "pin" : "pin-off");
    pin.onclick = () => {
      this.pinned = !this.pinned;
      if (!this.pinned) this.newer = null;
      this.render();
    };
    head.createDiv({ cls: "myu-whisper", text: this.pinned ? "pinned \u2014 a newer canvas will wait for you" : "following the newest canvas" });
    const back = head.createEl("button", { cls: "myu-affordance myu-link-button", text: "Show in the conversation" });
    back.onclick = () => {
      if (this.compositionId) void this.plugin.showCanvasInChat(this.compositionId);
    };
    if (this.newer) {
      const nudge = head.createEl("button", { cls: "myu-affordance myu-link-button", text: `A newer canvas is ready \u2014 ${this.newer.summary || "open it"} \u2192` });
      const id = this.newer.compositionId;
      nudge.onclick = () => {
        this.newer = null;
        void this.showComposition(id);
      };
    }
  }
  /** Recent canvases, newest first — refreshed quietly; failure just leaves the stepper disabled. */
  async loadHistory() {
    const res = await this.plugin.backend.getCompositionHistory(20).catch(() => null);
    const rows = (res?.data?.compositions ?? []).filter((r) => r.composition_id || r.id);
    if (rows.length === 0) return;
    this.history = rows;
    this.render();
  }
  /** Walk the history list in place — the stepper's action. */
  async stepTo(rows, index) {
    const row = rows[index];
    const id = row?.composition_id ?? row?.id;
    if (!id) return;
    this.newer = null;
    await this.showComposition(id);
  }
  /** The web's Refresh: a fresh spec for a stale canvas. Wire filled in once the contract is read (bucket 1, row 2). */
  async refresh() {
    if (!this.compositionId) return;
    const res = await this.plugin.backend.refreshComposition(this.compositionId).catch(() => null);
    const spec = res?.data?.composition ?? null;
    if (!res?.ok || !spec) {
      this.keepProblem = `Couldn\u2019t refresh: ${res?.error || "no answer from Myu"}`;
      this.render();
      return;
    }
    this.snapshot();
    this.spec = spec;
    if (typeof spec.id === "string" && spec.id && spec.id !== this.compositionId) {
      this.compositionId = spec.id;
      this.keptPath = null;
    }
    this.expired = null;
    this.keepProblem = null;
    this.render();
    void this.autoKeep();
  }
  onClose() {
    if (this.compositionId && this.chatMessages.length > 0) {
      void this.plugin.backend.executeCompositionAction(this.compositionId, "__session__", "summarize_session", { chat_messages: [...this.chatMessages] }).catch(() => void 0);
      this.chatMessages = [];
    }
    this.contentEl.empty();
    return Promise.resolve();
  }
};

// src/vault/ConversationWriter.ts
var import_obsidian40 = require("obsidian");
var ConversationWriter = class {
  constructor(app) {
    this.app = app;
  }
  /** Is this conversation already a note here? (`myu-journal-id` frontmatter — the export skips these.) */
  hasNoteFor(journalId) {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith("Myu/Conversations/")) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.["myu-journal-id"] === journalId) return true;
    }
    return false;
  }
  async write(turns, opts = {}) {
    const lines = renderConversation(turns);
    if (!lines) return { status: "nothing_to_write" };
    const date = opts.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const slug = slugFrom(turns);
    try {
      if (!this.app.vault.getAbstractFileByPath("Myu")) await this.app.vault.createFolder("Myu");
      if (!this.app.vault.getAbstractFileByPath("Myu/Conversations")) {
        await this.app.vault.createFolder("Myu/Conversations");
      }
      let path = (0, import_obsidian40.normalizePath)(`Myu/Conversations/${date} ${slug}.md`);
      for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
        path = (0, import_obsidian40.normalizePath)(`Myu/Conversations/${date} ${slug} ${i}.md`);
      }
      const head = ["---", "myu-generated: true", ...opts.journalId ? [`myu-journal-id: ${opts.journalId}`] : [], `date: ${date}`, "---"];
      await this.app.vault.create(path, [...head, "", lines, ""].join("\n"));
      return { status: "written", path };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }
};
function renderConversation(turns) {
  const parts = [];
  for (const turn of turns) {
    const text = turn.text ?? (turn.blocks ?? []).map((b) => b.text ?? (b.type === "composition_offer" ? offerLine(b.composition_id, b.summary_text) : "")).filter(Boolean).join("\n\n");
    if (!text) continue;
    parts.push(`**${turn.role === "user" ? "You" : "Myu"}:** ${text}`);
    if (turn.references?.length) {
      parts.push(turn.references.map((r) => `> [${r.id}] ${r.url ? `[${r.title || r.url}](${r.url})` : r.title ?? "source"}`).join("\n"));
    }
  }
  return parts.length ? parts.join("\n\n") : null;
}
function offerLine(compositionId, summary) {
  const what = summary?.trim() ? `a canvas: \u201C${summary.trim()}\u201D` : "a canvas";
  const link = compositionId ? ` \u2014 [open it \u25B8](obsidian://myu-canvas?id=${encodeURIComponent(compositionId)})` : "";
  return `*(Myu offered ${what}${link})*`;
}
function slugFrom(turns) {
  const first = turns.find((t) => t.role === "user")?.text ?? "conversation";
  return first.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 6).join(" ") || "conversation";
}

// src/vault/ExportService.ts
var import_obsidian41 = require("obsidian");
var ExportService = class {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  async exportEverything(progress) {
    const s2 = this.plugin.settings;
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const keep = { people: s2.materialize_people, commitments: s2.materialize_commitments, meetings: s2.materialize_meetings_history, journal: s2.materialize_journal_history, calendar: s2.materialize_calendar };
    Object.assign(s2, { materialize_people: true, materialize_commitments: true, materialize_meetings_history: true, materialize_journal_history: true, materialize_calendar: true });
    progress("Export \u2014 writing people, companies, journal, meetings, calendar, commitments\u2026");
    let people = 0;
    try {
      ({ people } = await this.plugin.materializer.materializeAll());
    } finally {
      Object.assign(s2, { materialize_people: keep.people, materialize_commitments: keep.commitments, materialize_meetings_history: keep.meetings, materialize_journal_history: keep.journal, materialize_calendar: keep.calendar });
    }
    const deps = { backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: s2.account_id };
    const heads = await listConversations(deps);
    const conversations = { saved: 0, alreadyThere: 0, failed: 0 };
    for (const [i, head] of heads.entries()) {
      progress(`Export \u2014 conversations ${i + 1} of ${heads.length}`);
      if (this.plugin.conversationWriter.hasNoteFor(head.journalId)) {
        conversations.alreadyThere++;
        continue;
      }
      try {
        const turns = await loadConversation(deps, head.journalId, { day: head.day, preview: head.preview });
        const outcome = await this.plugin.conversationWriter.write(turns, { journalId: head.journalId, date: head.day || date });
        if (outcome.status === "written") conversations.saved++;
        else if (outcome.status === "error") conversations.failed++;
      } catch {
        conversations.failed++;
      }
    }
    const history = await this.plugin.backend.getCompositionHistory(200).catch(() => null);
    const rows = history?.data?.compositions ?? [];
    const canvases = { kept: 0, expired: 0, failed: 0 };
    for (const [i, row] of rows.entries()) {
      progress(`Export \u2014 canvases ${i + 1} of ${rows.length}`);
      if (row.is_expired) {
        canvases.expired++;
        continue;
      }
      const id = String(row.composition_id ?? row.id ?? "");
      if (!id) continue;
      const outcome = await this.plugin.exportComposition(id, "canvas", { quiet: true });
      if (outcome.status === "written") canvases.kept++;
      else canvases.failed++;
    }
    const summary = {
      date,
      people,
      conversations,
      canvases,
      surfaces: [
        "**Me** \u2192 `Myu/Me.md`",
        "**People** and **Companies** \u2192 `Myu/People/`, `Myu/Companies/` (+ `People.base`, `Companies.base`)",
        "**Journal** (every surface, decrypted) \u2192 `Myu/Journal/`",
        "**Meetings** \u2192 `Myu/Meetings/`",
        "**Calendar** \u2192 `Myu/Calendar.md`, `Myu/Days/`",
        "**Commitments** \u2192 `Myu/Commitments.md`",
        "**Today / Week** \u2192 `Myu/Today.md`, `Myu/Week.md`"
      ]
    };
    const path = (0, import_obsidian41.normalizePath)("Myu/Export.md");
    const existing = this.app.vault.getAbstractFileByPath(path);
    const md = buildExportManifest(summary);
    if (existing instanceof import_obsidian41.TFile) await this.app.vault.process(existing, () => md);
    else await this.app.vault.create(path, md);
    progress("");
    return summary;
  }
};

// src/views/DataExportModal.ts
var import_obsidian42 = require("obsidian");
var DataExportModal = class extends import_obsidian42.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.passphrase = null;
    this.problem = null;
    this.busy = false;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Download your data" });
    if (this.passphrase) {
      contentEl.createEl("p", { cls: "myu-prose", text: "Your archive is being prepared. The download link is delivered by email when it is ready." });
      contentEl.createEl("p", { cls: "myu-prose", text: "Save this passphrase. It unlocks the zip, it is shown only once, and it is never stored \u2014 not here, not on the server." });
      const box = contentEl.createDiv({ cls: "myu-code myu-passphrase" });
      for (const word of this.passphrase.split(/\s+/)) box.createSpan({ cls: "myu-passphrase-word", text: word });
      new import_obsidian42.Setting(contentEl).addButton((b) => b.setButtonText("Copy passphrase").setCta().onClick(async () => {
        try {
          await navigator.clipboard.writeText(this.passphrase ?? "");
          b.setButtonText("Copied");
        } catch {
          b.setButtonText("Copy failed \u2014 write it down");
        }
      })).addButton((b) => b.setButtonText("Done").onClick(() => this.close()));
      return;
    }
    contentEl.createEl("p", { cls: "myu-prose", text: "Everything the server holds about you \u2014 journal, people, memories, meetings, commitments, account details \u2014 as one encrypted zip." });
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "The link is emailed when the archive is ready. You will get a passphrase that unlocks it; it is shown once. One request per day." });
    if (this.problem) contentEl.createDiv({ cls: "myu-problem", text: this.problem });
    new import_obsidian42.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton((b) => b.setButtonText(this.busy ? "Requesting\u2026" : "Request my archive").setCta().setDisabled(this.busy).onClick(() => void this.request()));
  }
  async request() {
    this.busy = true;
    this.problem = null;
    this.render();
    const res = await this.plugin.backend.requestDataExport().catch(() => null);
    this.busy = false;
    const pass = res?.data?.passphrase;
    if (res?.ok && typeof pass === "string" && pass) {
      this.passphrase = pass;
    } else {
      this.problem = res?.data?.message || res?.error || "Could not request the archive right now.";
    }
    this.render();
  }
  onClose() {
    this.passphrase = null;
    this.contentEl.empty();
  }
};

// src/views/FeedbackModal.ts
var import_obsidian43 = require("obsidian");
var CATEGORIES = [["general", "General"], ["bug", "Something broke"], ["feature", "An idea"]];
var FeedbackModal = class extends import_obsidian43.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.category = "general";
    this.message = "";
    this.problem = null;
    this.busy = false;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Send feedback to askMyu" });
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "Goes to the team by email, with the plugin build number. Nothing from your vault is attached." });
    new import_obsidian43.Setting(contentEl).setName("About").addDropdown((d) => {
      for (const [id, label] of CATEGORIES) d.addOption(id, label);
      d.setValue(this.category).onChange((v) => {
        this.category = v;
      });
    });
    const box = contentEl.createEl("textarea", { cls: "myu-chat-input", attr: { rows: "6", placeholder: "What happened, or what you wish happened\u2026", "aria-label": "Feedback" } });
    box.value = this.message;
    box.oninput = () => {
      this.message = box.value;
    };
    if (this.problem) contentEl.createDiv({ cls: "myu-problem", text: this.problem });
    new import_obsidian43.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton((b) => b.setButtonText(this.busy ? "Sending\u2026" : "Send").setCta().setDisabled(this.busy).onClick(() => void this.send()));
  }
  async send() {
    if (!this.message.trim()) {
      this.problem = "Say something first.";
      this.render();
      return;
    }
    this.busy = true;
    this.problem = null;
    this.render();
    const res = await this.plugin.sendFeedback({ message: this.message.trim(), category: this.category, surface: "feedback_modal" }).catch(() => null);
    this.busy = false;
    if (res?.ok) {
      notifyStatus("Thank you \u2014 sent.");
      this.close();
      return;
    }
    this.problem = res?.data?.error === "Rate limit exceeded" ? `Too many in a row \u2014 try again in ${res.data.retry_after_minutes ?? 60} minutes.` : res?.error || "Could not send right now.";
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/vault/removeEverything.ts
var import_obsidian44 = require("obsidian");
function findEverythingMyuWrote(app, registryPaths) {
  const seen = /* @__PURE__ */ new Map();
  let byFrontmatter = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.["myu-generated"] === true) {
      seen.set(file.path, file);
      byFrontmatter++;
    }
  }
  let byRegistry = 0;
  for (const path of registryPaths) {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof import_obsidian44.TFile && !seen.has(f.path)) {
      seen.set(f.path, f);
      byRegistry++;
    }
  }
  return { files: [...seen.values()], byFrontmatter, byRegistry };
}
async function trashEverythingMyuWrote(app, files) {
  let n = 0;
  for (const f of files) {
    try {
      await app.fileManager.trashFile(f);
      n++;
    } catch {
    }
  }
  return n;
}

// src/views/FeedSearchModal.ts
var import_obsidian45 = require("obsidian");
var FeedSearchModal = class extends import_obsidian45.SuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.seq = 0;
    this.setPlaceholder("Search people, companies, memories\u2026");
    this.emptyStateText = "Type at least two characters.";
  }
  async getSuggestions(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const mine = ++this.seq;
    const res = await this.plugin.backend.searchFeed(q, 12).catch(() => null);
    if (mine !== this.seq) return [];
    const r = res?.data?.results;
    if (!res?.ok || !r) {
      this.emptyStateText = "Search is not answering right now.";
      return [];
    }
    const card = (kind) => (c) => c.entity_id ? { kind, id: c.entity_id, title: c.header?.display_name || "Unnamed", subtitle: c.header?.subtitle } : null;
    const hits = [...(r.people ?? []).map(card("person")), ...(r.companies ?? []).map(card("company"))].filter((h) => !!h);
    for (const f of r.feed_items ?? []) if (f.title) hits.push({ kind: "feed_item", id: f.feed_item_id ?? "", title: f.title, subtitle: f.summary });
    this.emptyStateText = hits.length ? "" : "Nothing matches.";
    return hits;
  }
  renderSuggestion(hit, el) {
    el.createDiv({ text: hit.title });
    const sub = [hit.kind === "feed_item" ? "feed" : hit.kind, hit.subtitle].filter(Boolean).join(" \xB7 ");
    if (sub) el.createDiv({ cls: "myu-quiet", text: sub });
  }
  onChooseSuggestion(hit) {
    if (hit.kind === "feed_item") {
      void this.plugin.openToday();
      return;
    }
    void this.plugin.openCard(hit.kind, hit.id, hit.title);
  }
};

// src/views/HelpMyuView.ts
var import_obsidian46 = require("obsidian");
var HELP_VIEW_TYPE = "askmyu-help";
var HelpMyuView = class extends import_obsidian46.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.loading = false;
  }
  getViewType() {
    return HELP_VIEW_TYPE;
  }
  getDisplayText() {
    return "Myu \u2014 help Myu";
  }
  getIcon() {
    return "user-search";
  }
  async onOpen() {
    this.contentEl.addClass("myu-help");
    await this.refresh();
  }
  async refresh() {
    this.loading = true;
    this.render();
    await this.plugin.loadHelpQueue();
    this.loading = false;
    this.render();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    const top = root.createDiv({ cls: "myu-sync-bar" });
    const again = top.createEl("button", { cls: "myu-affordance myu-icon-button", attr: { "aria-label": "Check again" } });
    (0, import_obsidian46.setIcon)(again, "refresh-cw");
    again.onclick = () => void this.refresh();
    top.createSpan({ cls: "myu-whisper", text: this.loading ? "looking" : "people Myu cannot place" });
    if (this.plugin.unlock.current !== "unlocked") {
      root.createEl("p", { cls: "myu-quiet", text: "Sign in to see who Myu needs help with." });
      return;
    }
    const items = this.plugin.helpQueue;
    if (!this.loading && items.length === 0) {
      root.createEl("p", { cls: "myu-quiet", text: "Nothing needs you right now." });
      return;
    }
    for (const item of items) {
      const row = root.createDiv({ cls: "myu-zone myu-help-row" });
      if (item.item_type === "linkedin_disambiguation") {
        row.createDiv({ cls: "myu-claim", text: item.display_name + (item.organization ? ` \u2014 ${item.organization}` : "") });
        const matches = row.createDiv({ cls: "myu-help-matches" });
        matches.createEl("p", { cls: "myu-quiet myu-thinking", text: "Finding the matches" });
        void this.plugin.backend.getCard("person", item.relationship_id).then((res) => {
          matches.empty();
          const sugs = suggestionsOf(res.data?.suggestions);
          if (!res.ok) {
            matches.createDiv({ cls: "myu-quiet", text: "Could not fetch the matches." });
            return;
          }
          renderLinkedInMatches(matches, sugs, { app: this.app, owner: this, plugin: this.plugin, relationshipId: item.relationship_id, personName: item.display_name, onResolved: () => void this.refresh() });
          const open = matches.createEl("button", { cls: "myu-affordance myu-link-button", text: "Open their card" });
          open.onclick = () => void this.plugin.openCard("person", item.relationship_id, item.display_name);
        }).catch(() => {
          matches.empty();
          matches.createDiv({ cls: "myu-quiet", text: "Could not fetch the matches." });
        });
      } else {
        row.createDiv({ cls: "myu-claim", text: `${item.source.display_name} and ${item.target.display_name} \u2014 the same person?` });
        const why = [item.reason, item.target.subtitle].filter(Boolean).join(" \xB7 ");
        if (why) row.createDiv({ cls: "myu-quiet", text: why });
        const actions = row.createDiv({ cls: "myu-canvas-actions" });
        const yes = actions.createEl("button", { cls: "myu-affordance myu-cta", text: "Merge" });
        yes.onclick = () => this.plugin.mergePersonInto({ id: item.source.relationship_id, name: item.source.display_name }, { id: item.target.relationship_id, name: item.target.display_name });
        const no = actions.createEl("button", { cls: "myu-affordance", text: "Not the same" });
        no.onclick = async () => {
          no.disabled = true;
          await this.plugin.backend.rejectMerge(item.source.relationship_id, item.target.relationship_id).catch(() => void 0);
          this.plugin.helpQueue = this.plugin.helpQueue.filter((x) => x !== item);
          this.render();
        };
      }
    }
  }
  onClose() {
    this.contentEl.empty();
    return Promise.resolve();
  }
};

// src/views/WeaveView.ts
var import_obsidian47 = require("obsidian");

// src/vault/weaveRecipes.ts
var WEAVE_NOTE = "Weave Myu in.md";
function weaveSnippets(folder) {
  const f = folder.replace(/\/+$/, "") || "Myu";
  return [
    {
      id: "day",
      name: "Your day, inside every daily note",
      desc: "Add to your daily-note template. Every daily note \u2014 including ones the Calendar plugin creates \u2014 carries that day's schedule, meetings and journal.",
      text: `![[${f}/Days/{{date:YYYY-MM-DD}}]]`,
      lang: "markdown"
    },
    { id: "today", name: "The brief in your daily note", desc: "Add to your daily-note template; every daily note carries the morning brief.", text: `![[${f}/Today]]`, lang: "markdown" },
    { id: "week", name: "The week, embedded", desc: "Same idea for your weekly note.", text: `![[${f}/Week]]`, lang: "markdown" },
    { id: "tasks", name: "Myu commitments in a Tasks query", desc: "Anywhere you keep a Tasks block.", text: "```tasks\nnot done\npath includes " + f + "\n```", lang: "markdown" },
    { id: "uri", name: "A button to today", desc: "Works from any note, QuickAdd macro, or launcher.", text: "obsidian://myu", lang: "text" },
    { id: "people-base", name: "The people table, inside any note", desc: "Bases embed \u2014 the live CRM table lands wherever you paste this.", text: `![[${f}/People.base]]`, lang: "markdown" },
    {
      id: "people-dataview",
      name: "Your people as a Dataview table",
      desc: "If you use Dataview; the bundled Base does this without it.",
      text: '```dataview\ntable role, company, open_commitments\nfrom "' + f + '/People"\n```',
      lang: "markdown"
    }
  ];
}
function fence(text, lang) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${lang}
${text}
${ticks}`;
}
function weaveGuide(folder, opts = {}) {
  const head = opts.asNote ? "---\nmyu-generated: true\n---\n\n" : "# Weave Myu in\n\n";
  const intro = "Myu never edits your files. These are for you to paste into the things you already own \u2014 a daily-note template, a weekly note, a Tasks block, a launcher. Each block has a copy button; the command *Insert a Myu snippet\u2026* puts one at the cursor.";
  const body = weaveSnippets(folder).map((s2) => `## ${s2.name}

${s2.desc}

${fence(s2.text, s2.lang)}`).join("\n\n");
  const api = "## For scripts\n\n`app.plugins.plugins.askmyu.api` \u2014 `getBrief()`, `getPrep(id)`, `getPersonCard(name)`, `getWeeklyReview()`. Read-only; every call resolves null while the vault is locked, so a template never triggers a ceremony.";
  return `${head}${intro}

${body}

${api}
`;
}

// src/views/WeaveView.ts
var WEAVE_VIEW_TYPE = "askmyu-weave";
var WeaveView = class extends import_obsidian47.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return WEAVE_VIEW_TYPE;
  }
  getDisplayText() {
    return "Myu \u2014 weave Myu in";
  }
  getIcon() {
    return "puzzle";
  }
  async onOpen() {
    this.contentEl.addClass("myu-weave");
    await this.render();
  }
  async render() {
    const root = this.contentEl;
    root.empty();
    const s2 = this.plugin.settings;
    const folder = (s2.materialize_folder || "Myu").replace(/\/+$/, "");
    if (s2.materialize_consented && s2.materialize_enabled) {
      const top = root.createDiv({ cls: "myu-sync-bar" });
      const keep = top.createEl("button", { cls: "myu-affordance", text: `Keep a copy in ${folder}/` });
      keep.onclick = async () => {
        const path = await this.plugin.materializer.writeGuide(weaveGuide(folder, { asNote: true }));
        if (path) {
          notifyStatus(`Saved \u2014 ${path}.`);
          void this.plugin.app.workspace.openLinkText(path, "", true);
        } else {
          notifyError("Could not write the note \u2014 it may carry your own edits, which Myu will not overwrite.");
        }
      };
    }
    const body = root.createDiv({ cls: "markdown-rendered myu-voice myu-weave-body" });
    await import_obsidian47.MarkdownRenderer.render(this.plugin.app, weaveGuide(folder), body, "", this);
    addCopyButtons(body);
  }
};
function addCopyButtons(body) {
  let added = 0;
  body.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-code-button")) return;
    const code = pre.querySelector("code");
    if (!code) return;
    const btn = pre.createEl("button", { cls: "myu-affordance myu-copy-code", text: "Copy", attr: { "aria-label": "Copy this snippet" } });
    btn.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent ?? "");
      notifyStatus("Copied.");
    };
    added += 1;
  });
  return added;
}

// snippets/myu-look.css
var myu_look_default = "/*\n * Myu look \u2014 an optional CSS snippet for the AskMyu plugin.\n *\n * Myu's own identity, on Myu's surfaces only: the web app's cyan/amber\n * duotone, a serif voice, a breath of glow. It never touches your notes or\n * Obsidian's chrome, and it is not part of the plugin \u2014 it is yours to keep,\n * edit, or delete.\n *\n * Install: Settings \u2192 AskMyu \u2192 Advanced \u2192 Myu look \u2192 Install the look (the\n * plugin carries this file and writes it here on request; the same row turns\n * it off or removes it). By hand: copy it into <vault>/.obsidian/snippets/ and\n * enable it under Settings \u2192 Appearance \u2192 CSS snippets. Latest copy:\n * https://github.com/AskMyu/askmyu-obsidian-plugin/raw/main/snippets/myu-look.css (In the monorepo:\n * scripts/obsidian-dev.sh snippet-on / snippet-off.)\n *\n * Everything Myu renders carries a stable `.myu-*` class \u2014 see README,\n * \"Styling Myu\" \u2014 so this is one look of many possible.\n */\nbody {\n  --myu-cy: #38bdf8;\n  --myu-cy2: #0369a1;\n  --myu-al: #fb923c;\n}\n.workspace .myu-affordance,\n.workspace .myu-affordance-inline {\n  color: var(--myu-cy);\n}\n.workspace .myu-affordance:hover {\n  color: var(--myu-al);\n}\n.workspace .myu-whisper,\n.workspace .myu-status-label,\n.workspace .myu-onboard-role {\n  color: var(--myu-cy2);\n}\n.workspace .myu-voice {\n  font-family: Georgia, 'Times New Roman', serif;\n}\n/* Myu's own register: monospace, letter-spaced, lowercase whispers \u2014 the\n   web app's labels. The default plugin look leaves labels in the UI font. */\n.workspace .myu-whisper,\n.workspace .myu-status-label,\n.workspace .myu-onboard-role,\n.workspace .myu-door-divider,\n.workspace .myu-mirror-forming,\n.workspace .myu-mirror-ctl-label,\n.workspace .myu-prep-meeting,\n.workspace .myu-statusbar {\n  font-family: var(--font-monospace);\n  font-weight: normal;\n  letter-spacing: 0.14em;\n  text-transform: lowercase;\n}\n.workspace .myu-zone > .myu-whisper::first-letter { text-transform: lowercase; }\n.workspace .myu-time,\n.workspace .myu-list-row {\n  font-family: var(--font-monospace);\n}\n.workspace .myu-chip-amber {\n  border-color: var(--myu-al);\n  color: var(--myu-al);\n}\n.workspace .myu-door-primary,\n.workspace .myu-google-door:hover {\n  box-shadow: 0 0 14px rgba(56, 189, 248, 0.22);\n}\n.workspace .myu-door-primary {\n  background: var(--myu-cy2);\n  color: #e8f4fb;\n}\n.workspace .myu-chat-offer,\n.workspace .myu-chat-past:hover {\n  border-left: 2px solid var(--myu-cy);\n  padding-left: 8px;\n}\n.workspace .myu-statusbar {\n  color: var(--myu-cy2);\n}\n";

// src/look.ts
var LOOK_NAME = "myu-look";
var LOOK_FILE = `${LOOK_NAME}.css`;
function lookPath(configDir) {
  return `${configDir}/snippets/${LOOK_FILE}`;
}
function lookText(version) {
  return `/* @myu-look ${version} \u2014 installed by the askMyu plugin. Yours to edit, turn off, or remove: Settings \u2192 askMyu \u2192 Advanced \u2192 Myu look. */
${myu_look_default}`;
}
function lookStamp(text) {
  const m = /^\/\* @myu-look (\S+)/.exec(text);
  return m ? m[1] ?? null : null;
}
function lookStanding(installed, version) {
  if (installed === null) return { state: "absent" };
  if (installed === lookText(version)) return { state: "current", version };
  return { state: "different", version: lookStamp(installed) };
}
function snippetSwitch(app, name) {
  const css = app?.customCss;
  if (!css || typeof css.setCssEnabledStatus !== "function") return null;
  const setStatus = css.setCssEnabledStatus.bind(css);
  return {
    isOn: () => css.enabledSnippets instanceof Set && css.enabledSnippets.has(name),
    set: async (on) => {
      await css.readSnippets?.();
      setStatus(name, on);
    }
  };
}
var LookInstaller = class {
  constructor(fs, configDir, version, sw) {
    this.fs = fs;
    this.configDir = configDir;
    this.version = version;
    this.sw = sw;
  }
  path() {
    return lookPath(this.configDir);
  }
  async installed() {
    return await this.fs.exists(this.path()) ? this.fs.read(this.path()) : null;
  }
  async standing() {
    return lookStanding(await this.installed(), this.version);
  }
  /** On, when the switch is reachable; null when only Appearance can say. */
  isOn() {
    return this.sw ? this.sw.isOn() : null;
  }
  /** Write this build's look and turn it on. `installed_off` = written, but the switch is not reachable. */
  async install() {
    await this.fs.mkdir(`${this.configDir}/snippets`).catch(() => void 0);
    await this.fs.write(this.path(), lookText(this.version));
    if (!this.sw) return "installed_off";
    await this.sw.set(true);
    return "installed";
  }
  async setOn(on) {
    await this.sw?.set(on);
  }
  /** Turn it off, then delete the file. The undo of install — nothing else is touched. */
  async remove() {
    await this.sw?.set(false).catch(() => void 0);
    if (await this.fs.exists(this.path())) await this.fs.remove(this.path());
  }
};

// src/views/WeaveSnippetModal.ts
var import_obsidian48 = require("obsidian");
var WeaveSnippetModal = class extends import_obsidian48.FuzzySuggestModal {
  constructor(app, folder, onPick) {
    super(app);
    this.folder = folder;
    this.onPick = onPick;
    this.setPlaceholder("Insert a Myu snippet\u2026");
  }
  getItems() {
    return weaveSnippets(this.folder);
  }
  getItemText(snippet) {
    return `${snippet.name} ${snippet.text}`;
  }
  renderSuggestion(match, el) {
    el.createDiv({ text: match.item.name });
    el.createDiv({ cls: "myu-quiet", text: match.item.text.split("\n")[0] ?? "" });
  }
  onChooseItem(snippet) {
    this.onPick(snippet);
  }
};

// src/views/DriveImportModal.ts
var import_obsidian49 = require("obsidian");
var FILE_ID_RE = /\/d\/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})|^([A-Za-z0-9_-]{20,})$/;
function driveFileId(input) {
  const m = FILE_ID_RE.exec(input.trim());
  return m ? m[1] || m[2] || m[3] || null : null;
}
var DriveImportModal = class extends import_obsidian49.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.suggestions = null;
    this.problem = null;
    this.pasted = "";
  }
  async onOpen() {
    this.render();
    const res = await this.plugin.backend.getDriveSuggestions(10).catch(() => null);
    this.suggestions = res?.ok ? res.data?.suggestions ?? [] : [];
    if (!res?.ok) this.problem = "Could not look at Drive right now.";
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Meeting notes on Google Drive" });
    contentEl.createEl("p", { cls: "myu-prose myu-quiet", text: "Docs beside your email that look like meeting notes. Importing makes a meeting Myu understands, like a note in your meetings folder." });
    if (this.problem) contentEl.createDiv({ cls: "myu-problem", text: this.problem });
    if (this.suggestions === null) contentEl.createEl("p", { cls: "myu-quiet myu-thinking", text: "Looking" });
    else if (this.suggestions.length === 0) contentEl.createEl("p", { cls: "myu-quiet", text: "Nothing suggested right now." });
    for (const s2 of this.suggestions ?? []) {
      const row = new import_obsidian49.Setting(contentEl).setName(s2.source_email_subject || s2.file_id).setDesc([s2.source_email_sender, s2.source_email_date, s2.meeting_signals?.join(", ")].filter(Boolean).join(" \xB7 "));
      row.addButton((b) => b.setButtonText("Import").setCta().onClick(() => void this.importIds([s2.file_id], s2.id)));
      row.addButton((b) => b.setButtonText("Dismiss").onClick(async () => {
        await this.plugin.backend.dismissDriveSuggestion(s2.id).catch(() => void 0);
        this.suggestions = (this.suggestions ?? []).filter((x) => x.id !== s2.id);
        this.render();
      }));
    }
    new import_obsidian49.Setting(contentEl).setName("Or paste a Google Doc link").addText((t) => t.setPlaceholder("https://docs.google.com/document/d/\u2026").setValue(this.pasted).onChange((v) => {
      this.pasted = v;
    })).addButton((b) => b.setButtonText("Import").onClick(() => {
      const id = driveFileId(this.pasted);
      if (!id) {
        this.problem = "That does not look like a Google Doc link.";
        this.render();
        return;
      }
      void this.importIds([id]);
    }));
  }
  async importIds(fileIds, suggestionId) {
    this.problem = null;
    const res = await this.plugin.backend.importFromDrive(fileIds).catch(() => null);
    if (!res?.ok || res.data?.success === false) {
      this.problem = res?.data?.error === "drive_not_connected" ? "Google Drive is not connected \u2014 connect Google under Settings \u2192 askMyu \u2192 Connection." : res?.data?.message || res?.error || "Import failed.";
      this.render();
      return;
    }
    const results = res.data?.results ?? [];
    const imported = results.filter((r) => r.status === "imported").length;
    const dup = results.filter((r) => r.status === "duplicate").length;
    notifyStatus(imported ? `Imported ${imported} meeting${imported === 1 ? "" : "s"}${dup ? ` (${dup} already known)` : ""}.` : dup ? "Already imported." : results[0]?.message || "Nothing imported.");
    if (suggestionId) this.suggestions = (this.suggestions ?? []).filter((x) => x.id !== suggestionId);
    if (imported) void this.plugin.materializer.refreshHistoryIfDue(true);
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/composition/offers.ts
function str3(v) {
  return typeof v === "string" ? v.trim() : "";
}
function offerFromPayload(payload, now) {
  const compositionId = str3(payload.composition_id);
  if (!compositionId) return null;
  return {
    compositionId,
    summaryText: str3(payload.summary_text),
    actionLabel: str3(payload.action_label) || "View",
    subjectName: str3(payload.subject_name) || void 0,
    flowType: str3(payload.flow_type) || void 0,
    receivedAt: now
  };
}
function routeOffer(source, payload, openPaneId, now, paneFollows = true) {
  const offer = offerFromPayload(payload, now);
  if (!offer) return { kind: "none" };
  if (openPaneId === offer.compositionId) return { kind: "none" };
  if (openPaneId && paneFollows) return { kind: "replace", compositionId: offer.compositionId, summaryText: offer.summaryText };
  return { kind: "offer", offer, announce: source === "offer" && payload.announce === true };
}
function addOffer(list2, offer) {
  return [offer, ...list2.filter((o) => o.compositionId !== offer.compositionId)].slice(0, 10);
}

// src/views/wellbeingRows.ts
function str4(v) {
  return typeof v === "string" ? v.trim() : "";
}
function burnoutRow(payload) {
  const person = str4(payload.person_name);
  const drivers = (Array.isArray(payload.primary_drivers) ? payload.primary_drivers : []).map((d) => typeof d === "string" ? d : d && typeof d === "object" ? str4(d.dimension) : "").filter(Boolean).slice(0, 2).map((d) => d.replace(/_/g, " "));
  const summary = drivers.length >= 2 ? `${drivers[0]} and ${drivers[1]} are adding up` : drivers.length === 1 ? `${drivers[0]} is adding up` : "Stress levels are elevated \u2014 consider taking breaks";
  return { title: person ? `${person} might need support` : "Take care of yourself", summary, personId: str4(payload.person_id) || void 0, personName: person || void 0 };
}
function goalMilestoneRow(payload) {
  const type = str4(payload.milestone_type);
  if (type !== "stalled" && type !== "deadline_approaching") return null;
  const goal = str4(payload.goal_content) || str4(payload.message);
  if (!goal) return null;
  return { title: type === "stalled" ? "A goal needs attention" : "A goal deadline is approaching", summary: goal };
}

// src/views/revealSetting.ts
var FLASH_MS2 = 1800;
function revealSetting(container, name, schedule = (fn, ms) => window.setTimeout(fn, ms)) {
  const rows = Array.from(container.querySelectorAll(".setting-item"));
  const row = rows.find((r) => r.querySelector(".setting-item-name")?.textContent?.trim() === name);
  if (!row) return false;
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.classList.add("is-flashing");
  schedule(() => row.classList.remove("is-flashing"), FLASH_MS2);
  const control = row.querySelector(".setting-item-control [tabindex], .setting-item-control button, .setting-item-control input, .setting-item-control select");
  control?.focus();
  return true;
}

// src/views/ConversationSaveModal.ts
var import_obsidian50 = require("obsidian");
var ConversationSaveModal = class extends import_obsidian50.Modal {
  constructor(app, onConfirm) {
    super(app);
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("myu-power-down");
    contentEl.createEl("h2", { text: "Save this conversation into your vault?" });
    contentEl.createEl("p", {
      cls: "myu-prose",
      text: "It becomes a note in Myu/Conversations/ \u2014 Myu's words about you and the people you discussed, in a file that syncs wherever your vault syncs and stays after Myu forgets. Saving is always per-conversation; nothing saves itself."
    });
    new import_obsidian50.Setting(contentEl).addButton((b) => b.setButtonText("Not now").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Save it").setCta().onClick(() => {
        this.close();
        void this.onConfirm();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/vault/MaterializationService.ts
var import_obsidian51 = require("obsidian");
var PEOPLE_SWEEP_MS = 24 * 60 * 60 * 1e3;
var HISTORY_SWEEP_MS = 30 * 60 * 1e3;
var PACE_MS = 500;
function headlineFromCard(kind, id, card) {
  const h = card?.header;
  return { entity_type: kind, entity_id: id, display_name: h?.display_name ?? id, item_count: 0, top_urgency: "info", subtitle: h?.subtitle };
}
var MaterializationService = class {
  constructor(deps) {
    this.deps = deps;
    this.lastNetCall = 0;
    /** True while a full sweep runs — the ambient ratchet must not start a second one. */
    this.sweeping = false;
    /** entities_changed: the people list moved on the server — re-list now, not on the ratchet. Never more than once a minute. */
    this.lastPeopleRefresh = 0;
  }
  /** Wait until the next per-item call may go. */
  async paced() {
    const gap = this.deps.paceMs ?? PACE_MS;
    const wait = this.lastNetCall + gap - Date.now();
    if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
    this.lastNetCall = Date.now();
  }
  get folder() {
    return this.deps.settings().materialize_folder.replace(/\/+$/, "") || "Myu";
  }
  enabled() {
    const s2 = this.deps.settings();
    return s2.materialize_consented && s2.materialize_enabled && this.deps.canRun();
  }
  /**
   * The full sweep — consent lands here, and the daily ratchet re-runs it.
   * Progressive by design: files appear one by one as each card returns.
   */
  async materializeAll() {
    if (!this.enabled()) return { people: 0, skipped: 0 };
    if (this.sweeping) return { people: 0, skipped: 0 };
    this.sweeping = true;
    try {
      return await this.sweep();
    } finally {
      this.sweeping = false;
    }
  }
  async sweep() {
    const s2 = this.deps.settings();
    await this.writeBaseOnce();
    await this.refreshAmbient();
    if (this.deps.flags().vault_changes) {
      const r = await this.syncChanges(s2.vault_changes_since > 0 ? "delta" : "full");
      if (s2.materialize_calendar) await this.materializeCalendar();
      s2.last_history_materialize = Date.now();
      await this.deps.save();
      this.deps.onProgress(null);
      return r;
    }
    const selfCard = await this.deps.api().getSelfCard().catch(() => null);
    await this.writeHeld(`${this.folder}/Me.md`, buildSelfMarkdown(selfCard?.data?.card ?? null));
    let people = 0;
    let skipped = 0;
    if (s2.materialize_people) {
      const listed = await this.deps.api().listEntities("person");
      const entities = listed.data?.entities ?? [];
      const commitments = s2.materialize_commitments ? await this.fetchCommitments() : [];
      const byOwner = groupByOwner(commitments);
      const allNames = entities.map((e) => e.display_name);
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        this.deps.onProgress(
          `Myu is writing your people \u2014 ${i + 1} of ${entities.length} \xB7 ${entity.display_name}`
        );
        const wrote = await this.writePerson(entity, byOwner.get(entity.entity_id) ?? [], allNames);
        if (wrote === "written") people++;
        else if (wrote === "held") skipped++;
      }
      s2.last_people_materialize = Date.now();
      await this.deps.save();
    }
    if (s2.materialize_people) {
      await this.materializeCompanies();
    }
    if (s2.materialize_meetings_history) await this.materializeMeetingHistory(true);
    if (s2.materialize_journal_history) await this.materializeJournalHistory(true);
    if (s2.materialize_calendar) await this.materializeCalendar();
    s2.last_history_materialize = Date.now();
    await this.deps.save();
    this.deps.onProgress(null);
    return { people, skipped };
  }
  /** Myu/Meetings/ — server-side meeting history, newest first, capped per
      pass (a full corpus lands over a few ambient ticks; no silent drop —
      the cap is logged through the progress line). */
  async materializeMeetingHistory(fullRefresh = false) {
    const PAGE = 200;
    const listed = await this.deps.api().listMeetings(PAGE, 0);
    const rawMeetings = listed.data?.meetings;
    const meetings = Array.isArray(rawMeetings) ? rawMeetings : [];
    for (let i = 0; i < meetings.length; i++) {
      await this.writeMeetingRow(meetings[i], i + 1, meetings.length, fullRefresh);
    }
    const total = listed.data?.count ?? meetings.length;
    if (total > meetings.length) {
      this.deps.onProgress(`Meeting history: ${meetings.length} of ${total} this pass \u2014 the rest follow on later passes`);
    }
  }
  /**
   * One meeting row → one note. The LIST rows are thin — summaries at best.
   * The substance (key points, decisions, commitments, notes, transcript)
   * needs the detail endpoint: one GET per meeting, so it runs for NEW files
   * always and for existing ones only on a full pass — paced.
   */
  async writeMeetingRow(row, i, total, fullRefresh) {
    const id = String(row.meeting_id ?? "");
    if (!id) return;
    const title = String(row.title ?? row.meeting_title ?? "Meeting");
    const whenDate = parseWhen(firstPresent(row.meeting_date, row.occurred_at, row.created_at));
    const when = whenDate ? whenDate.toISOString().slice(0, 10) : "";
    const name = sanitizeName(`${when ? `${when} ` : ""}${title}`.trim() || id);
    const path = `${this.folder}/Meetings/${name}.md`;
    const exists = this.deps.app.vault.getAbstractFileByPath((0, import_obsidian51.normalizePath)(path)) !== null;
    if (exists && !fullRefresh) return;
    this.deps.onProgress(`Myu is writing your meeting history \u2014 ${i} of ${total} \xB7 ${title}`);
    await this.paced();
    const detail = await this.deps.api().getMeetingDetail(id).catch(() => null);
    const d = detail?.data;
    const full = d?.meeting;
    let meeting = row;
    if (full && typeof full === "object") {
      meeting = {
        ...row,
        ...full,
        key_points: d?.key_points,
        decisions: d?.decisions,
        commitments: d?.commitments,
        participation: d?.participation
      };
    }
    await this.writeHeld(path, buildMeetingHistoryMarkdown(meeting));
  }
  /** The memories payload, flattened and DECRYPTED: rows carry `content` or
      E2EE `encrypted_content` — only a device with custody can open those,
      which makes the vault page RICHER than a session-less surface, not
      thinner. Returns builder-ready {memory_text, created_at} rows. */
  async resolveMemories(raw) {
    const rows = flattenMemoryPayload(raw);
    const key = this.deps.contentKey();
    const out = [];
    for (const row of rows) {
      let text = (row.content ?? "").trim();
      if (!text && typeof row.encrypted_content === "string" && row.encrypted_content && key) {
        try {
          text = (await decryptWithKey(row.encrypted_content, key)).trim();
        } catch {
          continue;
        }
      }
      if (!text) continue;
      out.push({ memory_text: text, created_at: row.memory_date });
    }
    return out;
  }
  /** day → people with memories minted that day. Fed by the people pass
      (data we already fetch), consumed by the Days weave — the web calendar's
      relationships mode, vault-style. Kept in settings, capped at 90 days. */
  recordMemoryDays(name, memories) {
    const s2 = this.deps.settings();
    const map = s2.memories_by_day;
    const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    for (const m of memories) {
      const day = String(m.created_at ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < cutoff) continue;
      const names = map[day] ?? [];
      if (!names.includes(name)) names.push(name);
      map[day] = names;
    }
    for (const day of Object.keys(map)) {
      if (day < cutoff) delete map[day];
    }
  }
  /** Myu/Days/ + Myu/Calendar.md — the web's month view, as paper. Window:
      30 days back, 60 forward, plus any day that has a meeting or journal on
      file. The daily-note template snippet embeds Days/{{date}} — which is
      the ONE integration surface the base Calendar plugin has (its grid IS
      daily notes). */
  async materializeCalendar() {
    const now = /* @__PURE__ */ new Date();
    const start = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const end = new Date(now.getTime() + 60 * 864e5).toISOString().slice(0, 10);
    const res = await this.deps.api().getCalendarEvents(start, end);
    const rawEvents = res.data?.events;
    const events = (Array.isArray(rawEvents) ? rawEvents : []).filter(
      (e) => e.status !== "cancelled"
    );
    const byDay = /* @__PURE__ */ new Map();
    for (const e of events) {
      const day = String(e.start_time ?? "").slice(0, 10);
      if (!day) continue;
      const bucket = byDay.get(day) ?? [];
      bucket.push({ title: String(e.title ?? e.summary ?? "Busy"), start_time: String(e.start_time ?? ""), all_day: e.all_day === true, event_id: String(e.event_id ?? "") || void 0 });
      byDay.set(day, bucket);
    }
    const meetingsByDay = /* @__PURE__ */ new Map();
    const journalDays = /* @__PURE__ */ new Set();
    const folder = this.folder;
    for (const file of this.deps.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(`${folder}/Meetings/`)) {
        const day = file.basename.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          const bucket = meetingsByDay.get(day) ?? [];
          bucket.push(`Meetings/${file.basename}`);
          meetingsByDay.set(day, bucket);
        }
      } else if (file.path.startsWith(`${folder}/Journal/`)) {
        journalDays.add(file.basename);
      }
    }
    const allDays = /* @__PURE__ */ new Set([...byDay.keys(), ...meetingsByDay.keys(), ...journalDays, ...Object.keys(this.deps.settings().memories_by_day)]);
    const busy = /* @__PURE__ */ new Map();
    let i = 0;
    for (const day of allDays) {
      i++;
      this.deps.onProgress(`Myu is writing your calendar \u2014 day ${i} of ${allDays.size}`);
      const dayEvents = (byDay.get(day) ?? []).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
      const meetings = meetingsByDay.get(day) ?? [];
      const hasJournal = journalDays.has(day);
      const memoryPeople = (this.deps.settings().memories_by_day[day] ?? []).map((n) => sanitizeName(n));
      busy.set(day, dayEvents.length + meetings.length + (hasJournal ? 1 : 0) + (memoryPeople.length > 0 ? 1 : 0));
      await this.writeHeld(`${folder}/Days/${day}.md`, buildDayMarkdown(day, dayEvents, meetings, hasJournal, memoryPeople));
    }
    const months = [
      { year: now.getUTCFullYear(), month: now.getUTCMonth() },
      { year: now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), month: (now.getUTCMonth() + 1) % 12 }
    ];
    await this.writeHeld(`${folder}/Calendar.md`, buildMonthCalendarMarkdown(months, busy));
  }
  /** Myu/Journal/ — one file per day, DECRYPTED with this vault's key.
      Plaintext-on-paper is exactly what the materialize consent granted. */
  async materializeJournalHistory(fullRefresh = false) {
    const s2 = this.deps.settings();
    const accountId = s2.account_id;
    const key = this.deps.contentKey();
    if (!accountId || !key) return;
    const res = await this.deps.api().getJournalEntries(accountId, 0, Date.now());
    const rawEntries = res.data?.entries;
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const byDay = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const item = await this.journalEntryToDay(entry, key, accountId, fullRefresh);
      if (!item) continue;
      byDay.set(item.day, [...byDay.get(item.day) ?? [], item.entry]);
    }
    await this.writeJournalDays(byDay);
  }
  async writeJournalDays(byDay) {
    let i = 0;
    for (const [day, dayEntries] of byDay) {
      i++;
      this.deps.onProgress(`Myu is writing your journal \u2014 day ${i} of ${byDay.size}`);
      dayEntries.sort((a, b) => a.time.localeCompare(b.time));
      await this.writeHeld(`${this.folder}/Journal/${day}.md`, buildJournalDayMarkdown(day, dayEntries));
    }
  }
  /**
   * One journal entry, decrypted here, with the conversation that grew from
   * it woven in (chats are one GET per entry, paced: the recent week always,
   * everything on a full pass). Null when it cannot be read.
   */
  async journalEntryToDay(entry, key, accountId, fullRefresh) {
    const created = parseWhen(firstPresent(entry.date, entry.timestamp, entry.occurred_at, entry.created_at, entry.created));
    if (!created) return null;
    const day = created.toISOString().slice(0, 10);
    const time = created.toISOString().slice(11, 16);
    let text = "";
    const enc = entry.encrypted_content;
    if (typeof enc === "string" && enc) {
      try {
        text = await decryptWithKey(enc, key);
      } catch {
        return null;
      }
    } else if (typeof entry.content === "string") {
      text = entry.content;
    }
    if (!text.trim()) return null;
    const journalId = String(entry.journal_id ?? entry.id ?? "") || void 0;
    const recentCutoff = Date.now() - 7 * 864e5;
    let turns;
    if (journalId && (fullRefresh || created.getTime() >= recentCutoff)) {
      await this.paced();
      const chatsRes = await this.deps.api().getJournalChats(journalId).catch(() => null);
      const chats = Array.isArray(chatsRes?.data?.chats) ? chatsRes.data.chats : [];
      const collected = [];
      for (const chat of chats) {
        let content = typeof chat.content === "string" ? chat.content : "";
        const chatEnc = chat.encrypted_content;
        if (typeof chatEnc === "string" && chatEnc) {
          try {
            content = await decryptWithKey(chatEnc, key);
          } catch {
            continue;
          }
        }
        if (!content.trim()) continue;
        const isUser = String(chat.chatter_id ?? "") === accountId;
        if (!isUser && content.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(content);
            const textBlocks = (parsed.content ?? []).map((b) => b.text ?? "").filter(Boolean);
            if (textBlocks.length > 0) collected.push({ role: "myu", text: textBlocks.join("\n") });
            continue;
          } catch {
          }
        }
        collected.push({ role: isUser ? "you" : "myu", text: content });
      }
      if (collected.length > 0) turns = collected;
    }
    return { day, entry: { time, text, journalId, turns } };
  }
  /** Myu/Companies/ — org pages with wikilinked people. Person-pass sibling. */
  async materializeCompanies() {
    const listed = await this.deps.api().listEntities("company");
    const rawCompanies = listed.data?.entities;
    const companies = Array.isArray(rawCompanies) ? rawCompanies : [];
    if (companies.length === 0) return;
    const peopleListed = await this.deps.api().listEntities("person");
    const people = peopleListed.data?.entities ?? [];
    for (let i = 0; i < companies.length; i++) {
      const entity = companies[i];
      this.deps.onProgress(
        `Myu is writing your companies \u2014 ${i + 1} of ${companies.length} \xB7 ${entity.display_name}`
      );
      await this.paced();
      const cardRes = await this.deps.api().getCard("company", entity.entity_id);
      if (!cardRes.ok) continue;
      await this.writeCompanyFromCard(entity, cardRes.data?.card ?? null, people);
    }
  }
  async writeCompanyFromCard(entity, card, people) {
    await this.paced();
    const memRes = await this.deps.api().getRelationshipMemories(entity.entity_id).catch(() => null);
    const companyMemories = await this.resolveMemories(memRes?.data?.memories);
    const theirPeople = people.filter((p) => (p.organization ?? "").toLowerCase() === entity.display_name.toLowerCase()).map((p) => sanitizeName(p.display_name));
    const md = buildCompanyMarkdown(entity, card, theirPeople, companyMemories, `${this.folder}/People`);
    await this.writeHeld(`${this.folder}/Companies/${sanitizeName(entity.display_name)}.md`, md);
  }
  /** The cheap refresh the 5-minute ambient tick can afford: Today, Week, rollup. */
  async refreshAmbient() {
    if (!this.enabled()) return;
    const s2 = this.deps.settings();
    if (s2.materialize_today) {
      await this.writeToday();
      await this.writeWeek();
    }
    if (s2.materialize_commitments) {
      await this.writeCommitmentsRollup();
    }
    if (s2.materialize_people && !this.sweeping && Date.now() - s2.last_people_materialize > PEOPLE_SWEEP_MS) {
      if (this.deps.flags().vault_changes) void this.syncChanges("full", { quiet: true });
      else void this.materializePeopleQuietly();
    }
    void this.refreshHistoryIfDue();
  }
  /** The half-hourly tier: meetings, journal, calendar — cheap enough to be
      fresh. Also nudged by SSE (brief_ready) so a new day's intelligence
      lands without waiting out the ratchet. */
  async refreshHistoryIfDue(force = false) {
    if (!this.enabled()) return;
    const s2 = this.deps.settings();
    if (!force && Date.now() - s2.last_history_materialize < HISTORY_SWEEP_MS) return;
    s2.last_history_materialize = Date.now();
    await this.deps.save();
    if (this.deps.flags().vault_changes && !this.sweeping) {
      await this.syncChanges("delta", { quiet: true });
    } else if (!this.deps.flags().vault_changes) {
      if (s2.materialize_meetings_history) await this.materializeMeetingHistory();
      if (s2.materialize_journal_history) await this.materializeJournalHistory();
    }
    if (s2.materialize_calendar) await this.materializeCalendar();
  }
  /** Regenerate exactly one commitment's surfaces — the watcher calls this
      after a 'restored' outcome so server truth reappears promptly. */
  async refreshCommitmentSurfaces() {
    if (!this.enabled()) return;
    const s2 = this.deps.settings();
    if (s2.materialize_commitments) await this.writeCommitmentsRollup();
  }
  // ── individual writers ─────────────────────────────────────────────────────
  /**
   * Does anything in the vault already answer to this name?
   *
   * `getFirstLinkpathDest` is the same resolver Obsidian uses for `[[name]]`,
   * so this asks the exact question that matters: would an alias steal a link
   * that already goes somewhere? The person's OWN generated page is excluded —
   * once the alias is written the name resolves to us, and without this the
   * alias would be added and removed on alternating passes.
   */
  nameIsTaken(name, ownPath) {
    const dest = this.deps.app.metadataCache.getFirstLinkpathDest?.(name, "");
    if (!dest) return false;
    return (0, import_obsidian51.normalizePath)(dest.path) !== (0, import_obsidian51.normalizePath)(ownPath);
  }
  async writePerson(entity, commitments, allDisplayNames = []) {
    await this.paced();
    const cardRes = await this.deps.api().getCard("person", entity.entity_id);
    if (!cardRes.ok) return "error";
    return this.writePersonFromCard(entity, cardRes.data?.card ?? null, commitments, allDisplayNames);
  }
  /** The page from a card in hand — the memory layer rides along (one paced call). */
  async writePersonFromCard(entity, card, commitments, allDisplayNames = []) {
    const s2 = this.deps.settings();
    const open = commitments.filter((c) => c.status === "open");
    await this.paced();
    const memoriesRes = await this.deps.api().getRelationshipMemories(entity.entity_id).catch(() => null);
    const memories = await this.resolveMemories(memoriesRes?.data?.memories);
    this.recordMemoryDays(entity.display_name, memories);
    const path = `${this.folder}/People/${sanitizeName(entity.display_name)}.md`;
    const aliases = safeFirstNameAlias(
      entity.display_name,
      allDisplayNames,
      (name) => this.nameIsTaken(name, path)
    );
    const md = buildPersonMarkdown(
      entity,
      card,
      open,
      (id) => s2.myu_checkbox_state[id] ?? false,
      this.deps.findTheirPage(entity.display_name)?.replace(/\.md$/, "").split("/").pop() ?? null,
      memories,
      aliases
    );
    const outcome = await this.writeHeld(path, md);
    if (outcome === "written") {
      for (const c of open) s2.myu_checkbox_state[c.commitment_id] = false;
      await this.deps.save();
    }
    return outcome;
  }
  /**
   * The delta path (backend flag `vault_changes`, 2026-09-03): one feed of
   * what changed since the last server time, cards included, instead of a
   * card call per person on every open. `full` re-reads everything (since 0)
   * and is the daily ratchet: meetings and journal entries hard-delete and a
   * journal edit bumps revision, not the stamp, so the feed cannot tell us
   * those — the occasional full pass does. A card whose `changed_at` we hold
   * is skipped: no rewrite, no memories call. So a full pass on a quiet vault
   * is a few pages and nothing else.
   */
  async syncChanges(mode, opts = {}) {
    if (!this.enabled()) return { people: 0, skipped: 0 };
    const s2 = this.deps.settings();
    const api = this.deps.api();
    const since = mode === "delta" ? s2.vault_changes_since : 0;
    const key = this.deps.contentKey();
    const accountId = s2.account_id;
    const say = (line) => {
      if (!opts.quiet) this.deps.onProgress(line);
    };
    let people = 0;
    let skipped = 0;
    const headlines = /* @__PURE__ */ new Map();
    if (s2.materialize_people) {
      const listOpts = mode === "delta" && since > 0 && this.deps.flags().entity_changed_at ? { changedSince: since } : void 0;
      for (const tab of ["person", "company"]) {
        const listed = await api.listEntities(tab, listOpts).catch(() => null);
        for (const e of listed?.data?.entities ?? []) headlines.set(e.entity_id, e);
      }
    }
    const allPeople = [...headlines.values()].filter((h) => h.entity_type !== "company");
    const allNames = allPeople.map((h) => h.display_name);
    const commitments = s2.materialize_people && s2.materialize_commitments ? await this.fetchCommitments() : [];
    const byOwner = groupByOwner(commitments);
    const journalByDay = /* @__PURE__ */ new Map();
    let serverTime = null;
    let cursor = null;
    let page = 0;
    let seen = 0;
    do {
      const res = await api.getVaultChanges(since, cursor, 50).catch(() => null);
      if (!res?.ok || !res.data) break;
      const d = res.data;
      page++;
      if (serverTime === null && typeof d.server_time === "number") serverTime = d.server_time;
      if (page === 1 && d.self?.card) {
        await this.writeHeld(`${this.folder}/Me.md`, buildSelfMarkdown(d.self.card));
      }
      if (s2.materialize_people) {
        for (const item of d.people ?? []) {
          const id = item.entity_id ?? item.card?.entity_id ?? "";
          if (!id || !item.card) continue;
          seen++;
          const stamp = typeof item.changed_at === "number" ? item.changed_at : null;
          if (stamp !== null && s2.myu_entity_changed_at[id] === stamp) continue;
          const headline = headlines.get(id) ?? headlineFromCard("person", id, item.card);
          say(`Myu is writing your people \u2014 ${seen} \xB7 ${headline.display_name}`);
          const wrote = await this.writePersonFromCard(headline, item.card, byOwner.get(id) ?? [], allNames);
          if (wrote === "written") people++;
          else if (wrote === "held") skipped++;
          if (stamp !== null && wrote !== "error") s2.myu_entity_changed_at[id] = stamp;
        }
        for (const item of d.companies ?? []) {
          const id = item.entity_id ?? item.card?.entity_id ?? "";
          if (!id || !item.card) continue;
          const stamp = typeof item.changed_at === "number" ? item.changed_at : null;
          if (stamp !== null && s2.myu_entity_changed_at[id] === stamp) continue;
          const headline = headlines.get(id) ?? headlineFromCard("company", id, item.card);
          say(`Myu is writing your companies \u2014 ${headline.display_name}`);
          await this.writeCompanyFromCard(headline, item.card, allPeople);
          if (stamp !== null) s2.myu_entity_changed_at[id] = stamp;
        }
        if (page === 1) {
          for (const id of d.removed ?? []) await this.retirePersonNote(id).catch(() => false);
        }
      }
      if (s2.materialize_meetings_history) {
        const rows = d.meetings ?? [];
        for (let i = 0; i < rows.length; i++) await this.writeMeetingRow(rows[i], i + 1, rows.length, true);
      }
      if (s2.materialize_journal_history && key && accountId) {
        for (const dayBlock of d.journal_days ?? []) {
          for (const entry of dayBlock.entries ?? []) {
            const item = await this.journalEntryToDay(entry, key, accountId, mode === "full");
            if (!item) continue;
            journalByDay.set(item.day, [...journalByDay.get(item.day) ?? [], item.entry]);
          }
        }
      }
      cursor = d.next_cursor ?? null;
    } while (cursor);
    if (journalByDay.size > 0) await this.writeJournalDays(journalByDay);
    if (serverTime !== null && page > 0 && cursor === null) s2.vault_changes_since = serverTime;
    if (s2.materialize_people && page > 0) s2.last_people_materialize = Date.now();
    await this.deps.save();
    return { people, skipped };
  }
  async refreshPeople() {
    if (!this.enabled() || !this.deps.settings().materialize_people) return;
    if (Date.now() - this.lastPeopleRefresh < 6e4) return;
    this.lastPeopleRefresh = Date.now();
    if (this.deps.flags().vault_changes) await this.syncChanges("delta", { quiet: true });
    else await this.materializePeopleQuietly();
  }
  /**
   * entities_changed with ids (flag `entities_changed_ids`): the people the
   * server resolved at entry creation — refetch exactly those, now, paced.
   * Async enrichment touches more later; the next delta pass picks those up.
   */
  async refreshPeopleByIds(ids) {
    if (!this.enabled() || !this.deps.settings().materialize_people) return;
    const s2 = this.deps.settings();
    const wanted = new Set(ids.filter((id) => typeof id === "string" && id));
    if (wanted.size === 0) return;
    const listed = await this.deps.api().listEntities("person").catch(() => null);
    const entities = (listed?.data?.entities ?? []).filter((e) => wanted.has(e.entity_id));
    const commitments = s2.materialize_commitments ? await this.fetchCommitments() : [];
    const byOwner = groupByOwner(commitments);
    const allNames = (listed?.data?.entities ?? []).map((e) => e.display_name);
    for (const entity of entities) {
      const wrote = await this.writePerson(entity, byOwner.get(entity.entity_id) ?? [], allNames);
      const stamp = entity.changed_at;
      if (wrote !== "error" && typeof stamp === "number") s2.myu_entity_changed_at[entity.entity_id] = stamp;
    }
    await this.deps.save();
  }
  async materializePeopleQuietly() {
    const s2 = this.deps.settings();
    const listed = await this.deps.api().listEntities("person");
    const commitments = s2.materialize_commitments ? await this.fetchCommitments() : [];
    const byOwner = groupByOwner(commitments);
    const entities = listed.data?.entities ?? [];
    const allNames = entities.map((e) => e.display_name);
    for (const entity of entities) {
      await this.writePerson(entity, byOwner.get(entity.entity_id) ?? [], allNames);
    }
    s2.last_people_materialize = Date.now();
    await this.deps.save();
  }
  async writeToday() {
    const res = await this.deps.api().getBrief();
    const brief = res.data?.brief;
    if (!brief) return;
    const date = brief.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const sections = (brief.sections ?? []).map((section) => ({
      title: section.title,
      items: (section.items ?? []).map((i) => i.text ?? "").filter(Boolean)
    }));
    await this.writeHeld(`${this.folder}/Today.md`, buildTodayMarkdown(date, sections));
  }
  async writeWeek() {
    const res = await this.deps.api().getWeeklyReview().catch(() => null);
    const edition = res?.data?.edition;
    if (!edition || !isWeeklyEditionFresh(edition)) return;
    await this.writeHeld(`${this.folder}/Week.md`, buildWeekMarkdown(edition));
  }
  async writeCommitmentsRollup() {
    const s2 = this.deps.settings();
    const open = (await this.fetchCommitments()).filter((c) => c.status === "open");
    const md = buildCommitmentsMarkdown(open, (id) => s2.myu_checkbox_state[id] ?? false);
    const outcome = await this.writeHeld(`${this.folder}/Commitments.md`, md);
    if (outcome === "written") {
      for (const c of open) s2.myu_checkbox_state[c.commitment_id] = false;
      await this.deps.save();
    }
  }
  /**
   * The person is gone from Myu (merged away, or marked as you): their note
   * goes to the TRASH — so the action reads as done in the vault, not only on
   * the server — never deleted, per the plugin guidelines (trash() for
   * user-initiated removals, so it is recoverable).
   */
  async retirePersonNote(entityId) {
    const folder = (0, import_obsidian51.normalizePath)(`${this.folder}/People`);
    for (const file of this.deps.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${folder}/`)) continue;
      const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.["myu-id"] !== entityId) continue;
      await this.deps.app.fileManager.trashFile(file);
      return true;
    }
    return false;
  }
  /**
   * The Weave guide as a note in Myu's folder — on request only (the pane's
   * button), never on sync: it is the reader's to keep or edit, and a copy
   * they edited is held like every other file here.
   */
  async writeGuide(content) {
    if (!this.enabled()) return null;
    const path = (0, import_obsidian51.normalizePath)(`${this.folder}/${WEAVE_NOTE}`);
    const r = await this.writeHeld(path, content);
    return r === "written" || r === "unchanged" ? path : null;
  }
  async writeBaseOnce() {
    await this.ensureFolder(this.folder);
    for (const [name, build] of [
      ["People.base", () => buildPeopleBase(`${this.folder}/People`)],
      ["Companies.base", () => buildCompaniesBase(`${this.folder}/Companies`)]
    ]) {
      const path = (0, import_obsidian51.normalizePath)(`${this.folder}/${name}`);
      if (this.deps.app.vault.getAbstractFileByPath(path)) continue;
      await this.deps.app.vault.create(path, build());
    }
  }
  async fetchCommitments() {
    const res = await this.deps.api().listVaultCommitments();
    return res.data?.commitments ?? [];
  }
  // ── write mechanics ────────────────────────────────────────────────────────
  /** Write with edit-hold + no-op suppression; updates the hash baseline. */
  async writeHeld(rawPath, content) {
    const s2 = this.deps.settings();
    const path = (0, import_obsidian51.normalizePath)(rawPath);
    try {
      const existing = this.deps.app.vault.getAbstractFileByPath(path);
      const newHash = await hashContent(content);
      if (existing instanceof import_obsidian51.TFile) {
        const current = await this.deps.app.vault.cachedRead(existing);
        const currentHash = await hashContent(current);
        if (currentHash === newHash) return "unchanged";
        const baseline = s2.myu_file_hashes[path];
        if (baseline && baseline !== currentHash) {
          return "held";
        }
        await this.deps.app.vault.process(existing, () => content);
      } else {
        const folder = path.slice(0, path.lastIndexOf("/"));
        if (folder) await this.ensureFolder(folder);
        await this.deps.app.vault.create(path, content);
      }
      s2.myu_file_hashes[path] = newHash;
      await this.deps.save();
      return "written";
    } catch {
      return "error";
    }
  }
  /** After the watcher ships a file's edits, re-arm the hold with disk truth. */
  async rebaseline(path) {
    const s2 = this.deps.settings();
    const file = this.deps.app.vault.getAbstractFileByPath((0, import_obsidian51.normalizePath)(path));
    if (file instanceof import_obsidian51.TFile) {
      s2.myu_file_hashes[(0, import_obsidian51.normalizePath)(path)] = await hashContent(await this.deps.app.vault.cachedRead(file));
      await this.deps.save();
    }
  }
  async ensureFolder(folder) {
    const parts = folder.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.deps.app.vault.getAbstractFileByPath((0, import_obsidian51.normalizePath)(current))) {
        await this.deps.app.vault.createFolder((0, import_obsidian51.normalizePath)(current)).catch(() => void 0);
      }
    }
  }
};
function groupByOwner(commitments) {
  const map = /* @__PURE__ */ new Map();
  for (const c of commitments) {
    const key = c.owner_relationship_id;
    if (!key) continue;
    const list2 = map.get(key) ?? [];
    list2.push(c);
    map.set(key, list2);
  }
  return map;
}

// src/capture/MyuFolderWatcher.ts
var import_obsidian52 = require("obsidian");
var TICK_DEBOUNCE_MS = 5 * 1e3;
function canvasNodeMeaning(node) {
  const parts = [
    typeof node.type === "string" ? node.type : "",
    typeof node.text === "string" ? node.text : "",
    typeof node.file === "string" ? node.file : "",
    typeof node.url === "string" ? node.url : "",
    typeof node.label === "string" ? node.label : ""
  ];
  return parts.join("\0");
}
var MyuFolderWatcher = class {
  constructor(deps) {
    this.deps = deps;
    this.timers = /* @__PURE__ */ new Map();
    this.active = false;
    this.shippedAdditions = /* @__PURE__ */ new Set();
  }
  /** Register-once, active-gated — the same shape the other watchers use. */
  start(register) {
    const s2 = this.deps.settings();
    if (!s2.materialize_consented || !s2.materialize_enabled) return;
    if (this.active) return;
    this.active = true;
    register("modify", (file) => {
      if (!this.active || !(file instanceof import_obsidian52.TFile)) return;
      if (file.extension !== "md" && file.extension !== "canvas") return;
      const folder = this.deps.settings().materialize_folder.replace(/\/+$/, "") || "Myu";
      if (!file.path.startsWith(`${folder}/`) && file.path !== `${folder}.md`) return;
      const existing = this.timers.get(file.path);
      if (existing) window.clearTimeout(existing);
      this.timers.set(
        file.path,
        window.setTimeout(() => {
          this.timers.delete(file.path);
          void (file.extension === "canvas" ? this.shipCanvas(file) : this.shipFile(file));
        }, TICK_DEBOUNCE_MS)
      );
    });
  }
  stop() {
    this.active = false;
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
  }
  /**
   * Diff one settled canvas against our per-node baseline.
   *
   * A canvas is edited constantly BY DESIGN — that is what it is for — so the
   * whole-file hash that guards markdown would put it in permanent hold. Per
   * node instead, and the meaning hash deliberately excludes x/y/width/height:
   * moving a card is handling, not meaning, and raising a signal for it would
   * bury the engine in noise the moment anyone tidied a board.
   *
   * K2 holds: this ships events and interprets nothing. What a deleted node
   * MEANS is the engine's call with context, per P8.3 — not a mapping table's,
   * here, in advance.
   */
  async shipCanvas(file) {
    const s2 = this.deps.settings();
    const raw = await this.deps.app.vault.cachedRead(file);
    let nodes = [];
    try {
      const parsed = JSON.parse(raw);
      nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    } catch {
      return;
    }
    const prefix = `${file.path}::`;
    const events = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of nodes) {
      const id = typeof node.id === "string" ? node.id : null;
      if (!id) continue;
      seen.add(id);
      const meaning = canvasNodeMeaning(node);
      const hash = await hashContent(meaning);
      const key = prefix + id;
      const before = s2.myu_canvas_node_state[key];
      if (before === void 0) {
        s2.myu_canvas_node_state[key] = hash;
        continue;
      }
      if (before === hash) continue;
      s2.myu_canvas_node_state[key] = hash;
      events.push({ myu_id: id, kind: "edit", after: meaning.slice(0, 500), source_timestamp: Date.now(), content_hash: hash });
    }
    for (const key of Object.keys(s2.myu_canvas_node_state)) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (seen.has(id)) continue;
      delete s2.myu_canvas_node_state[key];
      events.push({ myu_id: id, kind: "delete", source_timestamp: Date.now() });
    }
    await this.deps.save();
    if (events.length > 0) await this.send(events, null);
  }
  /**
   * The part of a canvas node that carries MEANING — text, or the file it
   * points at. Geometry is excluded by construction, which is what makes
   * "moved it" and "changed it" different events rather than the same hash.
   */
  async shipFile(file) {
    const s2 = this.deps.settings();
    const contents = await this.deps.app.vault.cachedRead(file);
    const hash = await hashContent(contents);
    if (s2.myu_file_hashes[file.path] === hash) return;
    const events = [];
    let sawCheckboxChange = false;
    if (file.path.includes("/Meetings/")) {
      const meetingId = String(this.deps.app.metadataCache.getFileCache(file)?.frontmatter?.["myu-id"] ?? "");
      if (meetingId) await this.shipMeetingAdditions(file.path, meetingId, contents);
    }
    for (const box of parseCheckboxes(contents)) {
      const wasChecked = s2.myu_checkbox_state[box.myuId] ?? false;
      if (box.checked === wasChecked) continue;
      sawCheckboxChange = true;
      events.push({
        myu_id: box.myuId,
        kind: box.checked ? "tick" : "untick",
        after: box.line,
        source_timestamp: Date.now(),
        content_hash: hash
      });
    }
    if (!sawCheckboxChange) {
      events.push({
        myu_id: `file:${file.path}`,
        kind: "edit",
        source_timestamp: Date.now(),
        content_hash: hash
      });
    }
    await this.send(events, file.path);
  }
  async shipMeetingAdditions(path, meetingId, contents) {
    if (!this.deps.canSend()) return;
    const added = meetingAdditions(contents);
    let landed = 0;
    for (const d of added.decisions) {
      const key = `${path}|d|${d}`;
      if (this.shippedAdditions.has(key)) continue;
      const res = await this.deps.api().addMeetingDecision(meetingId, d).catch(() => null);
      if (res?.ok) {
        this.shippedAdditions.add(key);
        landed++;
      }
    }
    for (const c of added.commitments) {
      const key = `${path}|c|${c.owner ?? ""}|${c.content}`;
      if (this.shippedAdditions.has(key)) continue;
      const res = await this.deps.api().addMeetingCommitment(meetingId, c.content, "action_item", c.owner).catch(() => null);
      if (res?.ok) {
        this.shippedAdditions.add(key);
        landed++;
      }
    }
    if (landed > 0) void this.deps.onMeetingAdded();
  }
  async send(events, path) {
    const s2 = this.deps.settings();
    if (!this.deps.canSend()) {
      s2.vault_event_queue.push(...events);
      await this.deps.save();
      return;
    }
    const res = await this.deps.api().vaultInteraction(events);
    if (!res.ok) {
      s2.vault_event_queue.push(...events);
      await this.deps.save();
      return;
    }
    let restored = false;
    for (const result of res.data?.results ?? []) {
      if (result.kind === "tick" && result.outcome === "resolved") {
        s2.myu_checkbox_state[result.myu_id] = true;
      } else if (result.kind === "untick") {
        if (result.outcome === "restored") {
          s2.myu_checkbox_state[result.myu_id] = true;
          restored = true;
        } else {
          s2.myu_checkbox_state[result.myu_id] = false;
        }
      }
    }
    await this.deps.save();
    if (path) await this.deps.rebaseline(path);
    if (restored) await this.deps.onRestored();
  }
  /** Drain events queued while offline — rides the same retry interval. */
  async flushQueue() {
    const s2 = this.deps.settings();
    if (s2.vault_event_queue.length === 0 || !this.deps.canSend()) return;
    const events = s2.vault_event_queue.splice(0, 100);
    await this.deps.save();
    await this.send(events, null);
  }
};

// src/views/OnboardingModal.ts
var import_obsidian53 = require("obsidian");
var ONBOARDING_COPY = {
  gapLine: "What LinkedIn can't tell me is where you are right now.",
  situatedQuestion: "Who's the person, or the meeting, that matters most this week?",
  situatedPlaceholder: "A name, a meeting, and what is at stake \u2014 a sentence or two",
  partialArc: "I can see your past roles, and I can't tell what you're doing right now.",
  skipped: "No problem. Who's the person, or the meeting, that matters most this week?"
};
var onboardingSession = { accountId: null, transcript: [], careerReadMd: null, stage: null };
var CONFIDENCE_SUFFICIENT = 0.5;
var CONFIDENCE_BORDERLINE_MIN = 0.2;
var OnboardingModal = class extends import_obsidian53.Modal {
  constructor(app, plugin, onFinished) {
    super(app);
    this.plugin = plugin;
    this.onFinished = onFinished;
    this.stage = "arc";
    this.transcript = [];
    /** The career read's fold, open or shut — held here because the modal re-renders on every beat. */
    this.readOpen = false;
    this.working = false;
    /** Arc succeeded WITH a current role during this session. */
    this.arcCompleted = false;
    this.isOpen = false;
    /** Finished or dismissed — the caller hears exactly once. */
    this.handedOff = false;
    /** Markdown render lifecycle scoped to this modal, not the plugin (obsidianmd/no-plugin-as-component). */
    this.mdHost = new import_obsidian53.Component();
  }
  setStage(stage) {
    this.stage = stage;
    onboardingSession.stage = stage;
  }
  onOpen() {
    this.isOpen = true;
    this.contentEl.addClass("myu-power-down");
    const accountId = this.plugin.settings.account_id ?? null;
    if (onboardingSession.accountId !== accountId) {
      onboardingSession.accountId = accountId;
      onboardingSession.transcript = [];
      onboardingSession.careerReadMd = null;
      onboardingSession.stage = null;
    }
    this.transcript = onboardingSession.transcript;
    if (onboardingSession.careerReadMd && !this.transcript.some((l) => l.role === "read")) {
      this.transcript.push({ role: "read", text: onboardingSession.careerReadMd });
    }
    const resuming = this.transcript.length > 0;
    if (resuming && onboardingSession.stage) this.stage = onboardingSession.stage;
    const scripts = this.scripts();
    if (scripts.onboard_moment_captured === true || scripts.onboard_arc_provided === true) {
      this.setStage("moment");
      if (!resuming) this.say(this.momentPrompt(scripts));
    } else if (!resuming) {
      this.say("Hey \u2014 I'm Myu. Your notes will teach me plenty over time, but they can't tell me where you are RIGHT NOW. Two minutes fixes that. To start: your career arc \u2014 share your LinkedIn, or a resume.");
    }
    this.render();
  }
  handOff() {
    if (this.handedOff) return;
    this.handedOff = true;
    this.onFinished();
  }
  onClose() {
    this.isOpen = false;
    this.mdHost.unload();
    this.contentEl.empty();
    this.handOff();
  }
  scripts() {
    return this.plugin.onboardingScripts ?? {};
  }
  /**
   * The career canvas, shown in the conversation: the narrative and the
   * position timeline as markdown (the same arms the vault note uses), so the
   * paste is visibly paid back without leaving the modal.
   */
  async showCareerRead(compositionId) {
    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    const components = res?.data?.composition?.components ?? [];
    const wanted = components.filter((c) => c.type === "text_block" || c.type === "career_position_timeline" || c.type === "career_trajectory");
    const md = wanted.map((c) => componentMarkdown(c, 3, () => null, components, "pane").trim()).filter(Boolean).join("\n\n");
    if (!md) return;
    onboardingSession.careerReadMd = md;
    if (!this.transcript.some((l) => l.role === "read")) this.transcript.push({ role: "read", text: md });
    if (!this.isOpen) return;
    this.render();
  }
  say(text) {
    this.transcript.push({ role: "myu", text });
  }
  you(text) {
    this.transcript.push({ role: "you", text });
  }
  // ── render ─────────────────────────────────────────────────────────────────
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Tell Myu who you are" });
    const log = contentEl.createDiv({ cls: "myu-onboard-log" });
    for (const line of this.transcript) {
      if (line.role === "read") {
        const fold = log.createEl("details", { cls: "myu-fold myu-onboard-read" });
        if (this.readOpen) fold.setAttr("open", "");
        fold.createEl("summary", { text: "What Myu read from your career" });
        const body = fold.createDiv({ cls: "markdown-rendered" });
        void import_obsidian53.MarkdownRenderer.render(this.app, line.text, body, "/", this.mdHost);
        body.createDiv({ cls: "myu-quiet", text: "The full canvas is open behind this window \u2014 yours to keep, and to explore after." });
        fold.addEventListener("toggle", () => {
          this.readOpen = fold.hasAttribute("open");
        });
        continue;
      }
      const row = log.createDiv({ cls: `myu-onboard-line myu-onboard-${line.role}` });
      row.createSpan({ cls: "myu-onboard-role", text: line.role === "myu" ? "myu" : "you" });
      row.createSpan({ cls: "myu-onboard-text", text: line.text });
    }
    if (this.working) {
      contentEl.createEl("p", { cls: "myu-quiet myu-thinking", text: "Thinking" });
      return;
    }
    if (this.stage === "arc") this.renderArc(contentEl);
    if (this.stage === "moment") this.renderMoment(contentEl);
  }
  renderArc(root) {
    let url = "";
    new import_obsidian53.Setting(root).setName("LinkedIn").addText((t) => {
      t.setPlaceholder("https://linkedin.com/in/you").onChange((v) => url = v.trim());
    }).addButton(
      (b) => b.setButtonText("Share").setCta().onClick(() => void this.submitLinkedin(url))
    );
    const row = new import_obsidian53.Setting(root);
    if (import_obsidian53.Platform.isDesktopApp) {
      row.addButton((b) => b.setButtonText("Upload a resume").onClick(() => void this.submitResume()));
    }
    row.addButton(
      (b) => b.setButtonText("Skip for now").onClick(() => {
        this.you("Skip for now");
        this.say("No worries. So tell me \u2014 what's going on in your work life right now?");
        this.setStage("moment");
        this.render();
      })
    );
  }
  renderMoment(root) {
    let text = "";
    let field = null;
    const seeds = root.createDiv({ cls: "myu-prep-chips" });
    void Promise.resolve().then(() => this.plugin.linkSurvey()).then((people) => {
      if (people.length === 0) return;
      seeds.createSpan({ cls: "myu-quiet", text: "Start from someone: " });
      for (const p of people.slice(0, 3)) {
        const chip = seeds.createEl("button", { cls: "myu-chip myu-chip-amber", text: p.name });
        chip.onclick = () => {
          text = `About ${p.name}: `;
          field?.setValue(text);
          field?.inputEl.focus();
        };
      }
    }).catch(() => void 0);
    new import_obsidian53.Setting(root).setName("Right now").addText((t) => {
      field = t;
      t.setPlaceholder(this.payback() ? ONBOARDING_COPY.situatedPlaceholder : "A sentence or two, in your words").onChange((v) => text = v);
    }).addButton(
      (b) => b.setButtonText("Tell Myu").setCta().onClick(() => void this.submitMoment(text.trim()))
    );
    new import_obsidian53.Setting(root).addButton(
      (b) => b.setButtonText("Not now").onClick(() => {
        this.close();
        this.handOff();
      })
    );
  }
  // ── beat 1: arc ────────────────────────────────────────────────────────────
  async submitLinkedin(url) {
    if (!url || !url.includes("linkedin.com/in/")) {
      notifyError("That does not look like a LinkedIn profile URL.");
      return;
    }
    this.you(url);
    this.working = true;
    this.render();
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const seek = await this.plugin.backend.linkedinSeek(accountId, url);
    this.working = false;
    const failCode = seek.data?.body?.code;
    if (!seek.ok || typeof failCode === "number" && failCode >= 400) {
      this.say("I couldn't access that LinkedIn profile. Want to try again, or we can skip this for now?");
      this.render();
      return;
    }
    const summary = seek.data?.body?.content ?? "LinkedIn profile found.";
    const lid = url.match(/linkedin\.com\/in\/([^/?]+)/)?.[1] ?? "";
    if (lid) await this.plugin.backend.saveLinkedinId(accountId, lid);
    await this.finishArc("linkedin", summary);
  }
  async submitResume() {
    const w = window;
    const electron = w.require?.("electron");
    const dialog = electron?.remote?.dialog;
    const fs = w.require?.("fs");
    if (!dialog || !fs) {
      notifyError("Resume upload needs the desktop app \u2014 paste your LinkedIn instead.");
      return;
    }
    const picked = await dialog.showOpenDialog({
      title: "Choose your resume",
      filters: [{ name: "Resume", extensions: ["pdf", "doc", "docx", "txt"] }],
      properties: ["openFile"]
    });
    if (picked.canceled || !picked.filePaths?.[0]) return;
    const path = picked.filePaths[0];
    const name = path.split(/[\\/]/).pop() ?? "resume.pdf";
    this.you(`(uploaded ${name})`);
    this.working = true;
    this.render();
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const bytes = fs.readFileSync(path);
    const upload = await this.plugin.backend.resumeUpload(accountId, name, bytes.buffer);
    this.working = false;
    if (!upload.ok) {
      this.say("That upload didn't take. Try again, paste your LinkedIn, or skip for now.");
      this.render();
      return;
    }
    if (upload.data?.resume_id) await this.plugin.backend.saveResumeId(accountId, upload.data.resume_id);
    await this.finishArc("resume", upload.data?.summary ?? "Resume processed.");
  }
  /** Shared arc tail: employment extraction decides full vs partial arc. */
  async finishArc(source, summary) {
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    this.working = true;
    this.render();
    await this.plugin.backend.queryCurrentEmployment(accountId, source);
    const confirm = await this.plugin.backend.confirmCurrentEmployment(accountId);
    this.working = false;
    const d = confirm.data;
    const hasCurrent = Array.isArray(d?.companies) && d.companies.length > 0 || typeof d?.role === "string" && d.role.trim().length > 0 || typeof d?.company_name === "string" && d.company_name.trim().length > 0;
    if (hasCurrent) {
      this.arcCompleted = true;
      await this.plugin.backend.updateAccountState(accountId, {
        onboardingComplete: true,
        myuScripts: { onboard_arc_provided: true, onboard_arc_source: source }
      });
      if (this.payback()) {
        this.say(`${summary}

${ONBOARDING_COPY.gapLine}

${ONBOARDING_COPY.situatedQuestion}`);
        this.plugin.careerCanvasListener = (id) => void this.showCareerRead(id);
        this.plugin.expectCareerCanvas();
      } else {
        this.say(`${summary}

So tell me \u2014 where does it feel like you are right now? What's the work situation?`);
      }
    } else {
      await this.plugin.backend.updateAccountState(accountId, {
        myuScripts: { onboard_arc_partial: true, onboard_arc_source: source }
      });
      this.say(this.payback() ? `${summary}

${ONBOARDING_COPY.partialArc} ${ONBOARDING_COPY.situatedQuestion}` : `${summary}

I can see your past roles, but couldn't quite tell what you're doing right now. Tell me what you're working on these days?`);
    }
    await this.plugin.refreshOnboardingState();
    this.setStage("moment");
    this.render();
  }
  /** The payback flag, read defensively — test doubles carry no flags. */
  payback() {
    return this.plugin.flags?.onboarding_payback === true;
  }
  // ── beat 2: moment ─────────────────────────────────────────────────────────
  momentPrompt(scripts) {
    const attempts = scripts.onboard_moment_attempt_count ?? 0;
    const role = scripts.onboard_moment_role_title;
    if (attempts >= 1 && role) {
      return `Last time I heard something about "${role}" \u2014 say a bit more about where that stands right now?`;
    }
    if (attempts >= 1) {
      return "Let's try once more \u2014 in a sentence or two, where are you in your career right now?";
    }
    if (this.payback()) return ONBOARDING_COPY.situatedQuestion;
    return "Where are you in your career right now? A sentence or two, in your own words.";
  }
  async submitMoment(text) {
    if (!text) return;
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    this.you(text);
    this.working = true;
    this.render();
    const arcProvided = this.arcCompleted || this.scripts().onboard_arc_provided === true;
    const priorAttempts = this.scripts().onboard_moment_attempt_count ?? 0;
    let shouldComplete = arcProvided;
    try {
      const classify = await this.plugin.backend.classifyCareerMoment(accountId, text);
      const confidence = classify.data?.confidence ?? 0;
      const captured = classify.data?.moment_captured === true || confidence >= CONFIDENCE_SUFFICIENT;
      const borderline = !captured && confidence >= CONFIDENCE_BORDERLINE_MIN;
      shouldComplete = arcProvided || captured || priorAttempts >= 1 && (captured || borderline);
    } catch {
      shouldComplete = arcProvided;
    }
    if (shouldComplete) {
      await this.plugin.backend.updateAccountState(accountId, { onboardingComplete: true });
    }
    this.working = false;
    void this.plugin.refreshOnboardingState();
    onboardingSession.transcript = [];
    onboardingSession.careerReadMd = null;
    onboardingSession.stage = null;
    this.close();
    this.handOff();
    void this.plugin.openChat({ text, send: true, templateType: "onboarding_moment" });
  }
};

// src/refreshGate.ts
var RefreshGate = class {
  constructor(run, gapMs, timers = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => window.setTimeout(r, ms))
  }) {
    this.run = run;
    this.gapMs = gapMs;
    this.timers = timers;
    this.inFlight = null;
    this.dirty = false;
    this.urgent = false;
    this.last = 0;
    /** Wakes a wait in progress — the person's ask must not sit out a gap that began before it. */
    this.wake = null;
    /** True while the gate is sleeping out a gap (a run has not started yet). */
    this.waiting = false;
    /** How many runs actually happened — the test's fingerprint. */
    this.runs = 0;
  }
  /** Ask. `now` is the person's own hand — no gap for them. */
  request(opts = {}) {
    if (this.inFlight) {
      if (opts.now && this.waiting) {
        this.wake?.();
      } else {
        this.dirty = true;
        if (opts.now) this.urgent = true;
      }
      return this.inFlight;
    }
    if (opts.now) this.urgent = true;
    this.inFlight = (async () => {
      let wait = this.urgent ? 0 : Math.max(0, this.last + this.gapMs - this.timers.now());
      do {
        if (wait > 0) await this.pause(wait);
        this.dirty = false;
        this.urgent = false;
        this.last = this.timers.now();
        this.runs += 1;
        try {
          await this.run();
        } catch (err) {
          console.error("[askmyu] Today refresh failed", err);
        }
        wait = this.urgent ? 0 : this.gapMs;
      } while (this.dirty);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  /** Sleep the gap — or less, if an urgent ask lands meanwhile. */
  async pause(ms) {
    this.waiting = true;
    await new Promise((resolve) => {
      this.wake = resolve;
      void this.timers.sleep(ms).then(resolve);
    });
    this.wake = null;
    this.waiting = false;
  }
  get pending() {
    return this.inFlight !== null;
  }
};

// src/main.ts
var RECOVERY_REPAINT_MS = 3e4;
var TODAY_REFRESH_MS = 5 * 60 * 1e3;
var TODAY_REFRESH_GAP_MS = 5e3;
var LIVE_WATCHDOG_MS = 45 * 1e3;
var QUEUE_RETRY_MS = 10 * 60 * 1e3;
var AskMyuPlugin = class extends import_obsidian54.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.keys = new KeyHolder();
    /** Live layer. Best-effort: the 5-min poll stays the floor. */
    this.sse = new SSEClient();
    /** When the last full sync finished — the Today pane says \"synced N min ago\". */
    this.lastSyncAt = null;
    /** SSE-pushed initiative cues, rendered by TodayView as pane rows. */
    this.liveCues = [];
    /** Canvases Myu made while you were elsewhere — the web's pending offers; rows in Today and the thread. */
    this.pendingOffers = [];
    /** feed/help-myu — people Myu cannot place; rendered by Today. */
    this.helpQueue = [];
    /** GET /features — the cold-start flags; all off until fetched. */
    this.flags = COLD_START_OFF;
    /** GET /features → terms (2026-09-02): what the account has agreed to. Null until fetched, or on a backend without the gate. */
    this.terms = null;
    /** The dismissible "terms were updated" row, dismissed for this session. */
    this.termsUpdateDismissed = false;
    /** GET /oauth/google/status, cached per session — the scope-aware picture (calendar · mail · meeting notes). */
    this.integration = null;
    /**
     * The transport hit a wall a fresh session (401) or a fresh escrow (403 enc)
     * clears. Let the machine try; when it worked, the refused request is sent
     * again by the transport, the live stream re-opens on the new session, and
     * whatever was painted from refused answers repaints. The repaint is
     * throttled so a server that keeps refusing cannot turn recovery into a loop.
     */
    this.lastRecoveryRepaint = 0;
    /** insight_ready, kept for Today as rows (the web's insight cards). Twelve hours, six deep. */
    this.liveInsights = [];
    this.lastStateDetail = null;
    /** P10 — server-truth onboarding state (null = not yet fetched). The server
        tracks whether the arc/moment were captured; vault ingestion never
        substitutes, so every surface reads THESE, not local flags. */
    this.onboardingComplete = null;
    this.onboardingScripts = null;
    this.settingTab = null;
    this.statusBarEl = null;
    this.returningSetupOffered = false;
    /** First-run choreography line, rendered by TodayView ("6 of 38 · Jim…"). */
    this.materializeProgress = null;
    /** The batched-reads flags from /features; off until it answers, and on an older backend. */
    this.backendFlags = BACKEND_FLAGS_OFF;
    /**
     * P8.6 — the DOCUMENTED public surface: `app.plugins.plugins.askmyu.api`,
     * the ecosystem convention (Dataview/MetaEdit/Templater). Read-only, and
     * every call resolves null while the vault is locked — a Templater template
     * must never trigger an unlock ceremony. Everything else on this plugin
     * instance is internal and unstable; this object is the contract.
     */
    this.api = {
      status: () => this.unlock?.current ?? "disconnected",
      getBrief: async () => {
        if (this.unlock?.current !== "unlocked") return null;
        const res = await this.backend.getBrief();
        return res.ok ? res.data?.brief ?? null : null;
      },
      getPrep: async (eventId) => {
        if (this.unlock?.current !== "unlocked") return null;
        const res = await this.backend.getMeetingPrep(eventId);
        return res.ok ? res.data?.prep ?? null : null;
      },
      getPersonCard: async (name) => {
        if (this.unlock?.current !== "unlocked") return null;
        const search = await this.backend.searchEntities(name);
        const match = (search.data?.results ?? []).find((r) => r.entity_type === "person");
        if (!match) return null;
        const card = await this.backend.getCard("person", match.entity_id);
        return card.ok ? card.data?.card ?? null : null;
      },
      getWeeklyReview: async () => {
        if (this.unlock?.current !== "unlocked") return null;
        const res = await this.backend.getWeeklyReview();
        return res.ok ? res.data?.edition ?? null : null;
      }
    };
    /**
     * Every state transition lands here: capture starts or stops, Today redraws.
     * Capture is bound to UNLOCKED and nothing else — no key, no capture, and the
     * user is told which of the three reasons applies.
     */
    this.syncingOnOpen = false;
    /**
     * Refresh every LOADED Today pane.
     *
     * Deferred panes (Obsidian 1.7.2+) are skipped ON PURPOSE, not by accident:
     * a deferred leaf's `view` is a placeholder rather than a TodayView, and
     * forcing it to load from a background timer would defeat precisely the
     * startup and memory saving deferral exists for. Nothing is lost — the
     * view's `onOpen` refreshes, so a pane is current the moment it is actually
     * revealed. `isDeferred` is undefined on older builds, which reads falsy and
     * keeps the pre-1.7.2 behaviour intact.
     */
    /**
     * Every "refresh Today" in this file lands here: coalesced, paced, one fetch
     * in flight. The sync button passes `now`. (The unpaced version, called once
     * per progress line, is what tripped the WAF on 2026-09-03.)
     */
    this.todayGate = new RefreshGate(() => this.fetchTodayLeaves(), TODAY_REFRESH_GAP_MS);
    /**
     * The payback beat: after the LinkedIn confirm the backend seeds the career
     * canvas and announces it over `composition_ready` (flow_type
     * CareerTrajectoryCompositionFlow) — the plugin opens that one. If nothing
     * arrives (older backend, seed failed), it asks on demand instead.
     */
    this.careerCanvasTimer = null;
    /** The cold-start calendar offer was answered this session (a calendar landed, or a real "no") — no surface asks again. */
    this.welcomeOfferAnswered = false;
    /** Conversations whose delivered ask was answered this session — never ask twice in one conversation. */
    this.offerAnsweredJournals = /* @__PURE__ */ new Set();
    /** People whose LinkedIn ask was resolved this session — the chat stops offering the walk. */
    this.linkedinAskResolved = /* @__PURE__ */ new Set();
    /** Device transfer requests waiting on THIS vault to approve them (server truth, polled — never only SSE). */
    this.pendingTransfers = [];
    /** While the onboarding modal is open it listens here, so the read can be SHOWN in the conversation, not just in a tab behind it. */
    this.careerCanvasListener = null;
    // ── backfill: background, status bar, cancel; the link survey ─────────────
    this.backfillStop = false;
    this.backfillActive = false;
    this.surveyCache = null;
    /** The always-keep switch, honoured from outside the pane. Once per id per session. */
    this.keptCanvasIds = /* @__PURE__ */ new Set();
  }
  async loadFeatures() {
    const res = await this.backend.getFeatures().catch(() => null);
    this.flags = res?.ok ? parseColdStartFlags(res.data) : COLD_START_OFF;
    this.backendFlags = res?.ok ? parseBackendFlags(res.data) : BACKEND_FLAGS_OFF;
    if (res?.ok) this.terms = parseTermsState(res.data);
  }
  // ── beta terms (2026-09-02) — PLAN_BETA_TERMS_ACCEPTANCE_20260901 ─────────
  // First acceptance BLOCKS (the gate, a fourth Today-pane state); a later
  // version update does not (a dismissible row). The backend enforces the gate
  // with 428 on every content call; /features is how the pane learns it first.
  termsStanding() {
    return termsStanding(this.terms);
  }
  termsUpdateVisible() {
    return this.termsStanding() === "update" && !this.termsUpdateDismissed;
  }
  dismissTermsUpdate() {
    this.termsUpdateDismissed = true;
    void this.refreshToday({ now: true });
  }
  termsLinkTargets() {
    return termsLinks(this.terms?.urls ?? TERMS_FALLBACK_URLS);
  }
  /** The way out of the gate, and the update row's Accept. Everything that waited resumes. */
  async acceptTerms() {
    const version = this.terms?.currentVersion;
    if (!version) return false;
    const res = await this.backend.acceptTerms(version).catch(() => null);
    if (!res?.ok) {
      notifyError("Could not record your agreement. Check the connection and try again.");
      return false;
    }
    this.termsUpdateDismissed = false;
    await this.loadFeatures();
    await this.refreshToday({ now: true });
    this.startLiveStream();
    void this.loadIntegrationStatus(true);
    void this.syncOnOpen();
    return true;
  }
  async recoverSession(kind) {
    const ok2 = kind === "session" ? await this.unlock.onUnauthorized() : await this.unlock.onEncryptionBlocked();
    if (!ok2 || this.unlock.current !== "unlocked") return ok2;
    if (kind === "session") this.startLiveStream();
    if (Date.now() - this.lastRecoveryRepaint > RECOVERY_REPAINT_MS) {
      this.lastRecoveryRepaint = Date.now();
      this.settingTab?.refreshIfVisible();
      void this.refreshToday();
    }
    return ok2;
  }
  /** A gated call answered 428: the pane shows the screen; the stream stops. */
  onTermsRequired(body) {
    const state = termsStateFrom428(body);
    if (!state) return;
    this.terms = state.currentVersion || !this.terms ? state : { ...this.terms, satisfied: false, gateEnabled: true };
    this.sse.stop();
    void this.refreshToday({ now: true });
  }
  /** The live layer, once the account may have content — never while gated. */
  startLiveStream() {
    if (this.settings.use_mock_backend || this.termsStanding() === "gated") return;
    const token = this.settings.session_token;
    const account = this.settings.account_id;
    if (!token || !account) return;
    this.sse.onGated = () => void this.loadFeatures().then(() => this.refreshToday());
    this.sse.start(this.settings.sse_url || deriveSseUrl(this.settings.base_url, account), token);
  }
  async loadIntegrationStatus(force = false) {
    if (this.integration && !force) return this.integration;
    const res = await this.backend.googleOAuthStatus().catch(() => null);
    this.integration = res?.ok ? res.data ?? null : null;
    return this.integration;
  }
  /** The mail service's state across credentials — for the per-card offer. */
  mailState() {
    const creds = this.integration?.credentials ?? [];
    if (creds.some((c) => c.services?.mail?.state === "connected")) return "connected";
    if (creds.some((c) => c.services?.mail?.state === "needs_reconnect")) return "needs_reconnect";
    return creds.length ? "not_yet" : "none";
  }
  async onload() {
    await this.loadSettings();
    this.transport = new Transport({
      baseUrl: this.settings.base_url,
      authToken: this.settings.session_token,
      onUnauthorized: () => this.recoverSession("session"),
      onEncryptionBlocked: () => this.recoverSession("escrow"),
      onTermsRequired: (body) => this.onTermsRequired(body)
    });
    this.backend = this.settings.use_mock_backend ? new MockApi() : new Api(this.transport);
    this.unlock = new UnlockMachine({
      api: this.backend,
      keys: this.keys,
      load: () => this.settings,
      save: async (partial) => {
        Object.assign(this.settings, partial);
        await this.saveSettings();
      },
      onSession: (token) => {
        this.settings.session_token = token;
        this.transport.setAuthToken(token);
      },
      onState: (state, detail) => void this.onUnlockState(state, detail ?? null),
      onApproval: () => {
        void this.refreshToday({ now: true });
        this.settingTab?.refreshIfVisible();
      },
      deviceName: `Obsidian \u2014 ${this.app.vault.getName()}`,
      mockMode: () => this.settings.use_mock_backend
    });
    this.capture = new CaptureService({
      app: this.app,
      api: this.backend,
      keys: this.keys,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canCapture: () => this.unlock.current === "unlocked",
      onStatus: (status) => {
        this.lastStateDetail = status;
      }
    });
    this.weeklyReview = new WeeklyReviewWriter(this.app);
    this.personIndex = new PersonPageIndex(this.app, () => this.settings.people_folders);
    this.canvasExporter = new CanvasExporter(this.app);
    this.conversationWriter = new ConversationWriter(this.app);
    this.exporter = new ExportService(this.app, this);
    this.meetingCapture = new MeetingCapture({
      app: this.app,
      api: this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canCapture: () => this.unlock.current === "unlocked",
      personIndex: () => this.personIndex
    });
    this.materializer = new MaterializationService({
      contentKey: () => this.keys.get(),
      app: this.app,
      api: () => this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canRun: () => this.unlock.current === "unlocked",
      findTheirPage: (name) => this.personIndex.find(name)?.path ?? null,
      flags: () => this.backendFlags,
      onProgress: (line) => {
        this.materializeProgress = line;
        if (line === null) void this.refreshToday();
        else this.paintProgress();
      }
    });
    this.myuWatcher = new MyuFolderWatcher({
      app: this.app,
      api: () => this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canSend: () => this.unlock.current === "unlocked",
      onRestored: () => this.materializer.refreshCommitmentSurfaces(),
      rebaseline: (path) => this.materializer.rebaseline(path),
      onMeetingAdded: () => this.materializer.refreshHistoryIfDue(true)
    });
    this.registerView(TODAY_VIEW_TYPE, (leaf) => new TodayView(leaf, this));
    this.registerView(CARD_VIEW_TYPE, (leaf) => new CardView(leaf, this));
    this.registerView(PREP_VIEW_TYPE, (leaf) => new PrepView(leaf, this));
    this.registerView(HELP_VIEW_TYPE, (leaf) => new HelpMyuView(leaf, this));
    this.registerView(WEAVE_VIEW_TYPE, (leaf) => new WeaveView(leaf, this));
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.registerView(CANVAS_VIEW_TYPE, (leaf) => new CanvasView(leaf, this));
    this.settingTab = new AskMyuSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.registerCommands();
    this.addRibbonIcon("sun", "Open Myu", () => void this.openToday());
    this.addRibbonIcon("message-circle", "Talk to Myu", () => {
      if (this.unlock.current === "unlocked") void this.openChat({ text: "", send: false });
      else void this.openToday();
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        if (this.unlock.current !== "unlocked") return;
        const selection = editor.getSelection().trim();
        if (selection) {
          menu.addItem(
            (i) => i.setTitle("Ask Myu about this selection").setIcon("message-circle").onClick(() => void this.openChat({ text: `About this:

${selection}

`, send: false }))
          );
        }
        const file = info.file;
        if (file && file.extension === "md") {
          menu.addItem(
            (i) => i.setTitle("Ask Myu about this note").setIcon("message-circle").onClick(() => void this.askMyuAboutNote(file))
          );
          if (this.personIndex.find(file.basename)) {
            menu.addItem(
              (i) => i.setTitle(`Open Myu's card for ${file.basename}`).setIcon("contact").onClick(() => void this.showMyuCardFor(file))
            );
          }
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (this.unlock.current !== "unlocked") return;
        if (!(file instanceof import_obsidian54.TFile) || file.extension !== "md") return;
        menu.addItem(
          (i) => i.setTitle("Ask Myu about this note").setIcon("message-circle").onClick(() => void this.askMyuAboutNote(file))
        );
        if (this.personIndex.find(file.basename)) {
          menu.addItem(
            (i) => i.setTitle(`Open Myu's card for ${file.basename}`).setIcon("contact").onClick(() => void this.showMyuCardFor(file))
          );
        }
        const person = this.personOfNote(file);
        if (person) {
          menu.addSeparator();
          menu.addItem((i) => i.setTitle(`Merge ${person.name} into\u2026`).setIcon("git-merge").onClick(() => this.mergePerson(person)));
          menu.addItem((i) => i.setTitle(`${person.name} is me`).setIcon("user-check").onClick(() => this.markPersonAsSelf(person)));
          menu.addItem((i) => i.setTitle(`Archive ${person.name}`).setIcon("archive").onClick(() => void this.archivePerson(person)));
        }
      })
    );
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("myu-statusbar");
    this.statusBarEl.onclick = () => void this.openToday();
    this.setStatusBar("disconnected", null);
    this.registerInterval(window.setInterval(() => void this.refreshToday(), TODAY_REFRESH_MS));
    this.registerInterval(window.setInterval(() => {
      if (this.unlock.current !== "unlocked") return;
      this.ensureLiveStream();
      void this.refreshPendingTransfers();
    }, LIVE_WATCHDOG_MS));
    this.registerInterval(window.setInterval(() => void this.capture.flushQueue(), QUEUE_RETRY_MS));
    this.registerInterval(window.setInterval(() => void this.materializer.refreshAmbient(), TODAY_REFRESH_MS));
    this.registerInterval(window.setInterval(() => void this.myuWatcher.flushQueue(), QUEUE_RETRY_MS));
    const stamp = (verb) => {
      this.settings.last_protocol = `${(/* @__PURE__ */ new Date()).toISOString()} ${verb}`;
      void this.saveSettings();
    };
    this.registerObsidianProtocolHandler("myu", () => {
      stamp("myu");
      void this.openToday();
    });
    this.registerObsidianProtocolHandler("myu-prep", (params) => {
      stamp("myu-prep");
      if (typeof params.event === "string" && params.event) void this.openPrep(params.event);
    });
    this.registerObsidianProtocolHandler("myu-connected", () => {
      stamp("myu-connected");
      notifyStatus("Welcome back \u2014 Myu is syncing your calendar and email now.");
      void this.loadIntegrationStatus(true).then(() => this.refreshToday({ now: true }));
      void this.openToday();
    });
    this.registerObsidianProtocolHandler("myu-card", (params) => {
      stamp("myu-card");
      if (typeof params.name === "string" && params.name) {
        const file = this.app.metadataCache.getFirstLinkpathDest?.(params.name, "");
        void this.showMyuCardForName(params.name, file ?? null);
      }
    });
    this.registerObsidianProtocolHandler("myu-canvas", (params) => {
      if (typeof params.id === "string" && params.id) void this.openCanvas(params.id);
    });
    this.registerObsidianProtocolHandler("myu-chat", (params) => {
      stamp("myu-chat");
      if (typeof params.journal === "string" && params.journal) {
        void this.openConversation(params.journal);
      }
    });
    this.registerObsidianProtocolHandler("myu-signin", (params) => {
      stamp("myu-signin");
      if (typeof params.token === "string" && params.token) void this.completeMagicSignup(params.token);
    });
    this.sse.subscribe("initiative_cue", (payload) => {
      const text = typeof payload.text === "string" ? payload.text : null;
      if (!text) return;
      this.liveCues.push({
        text,
        event_id: typeof payload.event_id === "string" ? payload.event_id : void 0,
        received_at: Date.now()
      });
      this.liveCues = this.liveCues.filter((c) => Date.now() - c.received_at < 12 * 60 * 60 * 1e3).slice(-6);
      void this.refreshToday();
    });
    this.sse.subscribe("brief_ready", () => {
      void this.refreshToday();
      void this.materializer.refreshHistoryIfDue(true);
    });
    this.sse.subscribe("brief_item_updated", () => void this.refreshToday());
    registerLiveNotices((type, handler) => this.sse.subscribe(type, handler), {
      accountId: () => this.settings.account_id,
      // A device event also refreshes the durable row — the Notice is the fast
      // path, Today is the one that survives a missed toast.
      notify: (n) => {
        void this.refreshPendingTransfers();
        notifyLive(n, n.action === "open_devices" ? () => this.openSettings() : n.action === "open_person" && n.relationshipId ? () => void this.openCard("person", n.relationshipId, n.personName || "Person") : void 0);
      },
      openDevices: () => this.openSettings(),
      openPerson: (id, name) => void this.openCard("person", id, name),
      onRemoteLogout: () => void this.unlock.revokedRemotely()
    });
    this.sse.subscribe("composition_ready", (payload) => {
      void this.keepCanvasIfAlwaysOn(payload.composition_id, typeof payload.summary_text === "string" ? payload.summary_text : "");
      if (this.claimCareerCanvas(payload) && typeof payload.composition_id === "string") {
        void this.openCanvas(payload.composition_id);
        this.careerCanvasListener?.(payload.composition_id);
        return;
      }
      this.takeOffer("ready", payload);
    });
    this.sse.subscribe("composition_offer", (payload) => this.takeOffer("offer", payload));
    this.sse.subscribe("entities_changed", (payload) => {
      const ids = Array.isArray(payload.entity_ids) ? payload.entity_ids.filter((id) => typeof id === "string") : [];
      if (ids.length && this.backendFlags.entities_changed_ids) void this.materializer.refreshPeopleByIds(ids);
      else void this.materializer.refreshPeople();
      void this.refreshToday();
      void this.chatView()?.revalidateLinkedInAsk();
    });
    this.sse.subscribe("personal_loop.updated", () => void this.refreshToday());
    this.sse.subscribe("insight_ready", (payload) => {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (title) this.noteInsight({ title, summary: typeof payload.summary === "string" ? payload.summary : void 0, personId: typeof payload.person_id === "string" ? payload.person_id : void 0, personName: typeof payload.person_name === "string" ? payload.person_name : void 0 });
    });
    this.sse.subscribe("burnout_warning", (payload) => this.noteInsight(burnoutRow(payload)));
    this.sse.subscribe("goal_milestone", (payload) => {
      const row = goalMilestoneRow(payload);
      if (row) this.noteInsight(row);
    });
    this.sse.subscribe("card_section_updated", () => void this.cardView()?.reload());
    this.sse.subscribe("meeting_extraction_complete", (payload) => {
      if (payload.success === false) return;
      void this.materializer.refreshHistoryIfDue(true);
    });
    this.sse.subscribe("chatrefresh", () => void this.chatView()?.reloadThread());
    this.sse.subscribe("composition_expired", (payload) => {
      const id = typeof payload.composition_id === "string" ? payload.composition_id : "";
      if (id) this.canvasView()?.markExpired(id, typeof payload.reason === "string" ? payload.reason : void 0, typeof payload.refresh_available === "boolean" ? payload.refresh_available : void 0);
    });
    this.sse.subscribe("composition_mutation", (payload) => {
      const id = typeof payload.composition_id === "string" ? payload.composition_id : "";
      const mutations = Array.isArray(payload.mutations) ? payload.mutations : [];
      if (id && mutations.length) this.applyCanvasMutations(id, mutations);
    });
    this.app.workspace.onLayoutReady(() => {
      this.personIndex.watch((unsub) => this.register(unsub));
      void this.resume();
      const s2 = this.settings;
      if (!s2.first_run_shown && !s2.token && !s2.wrapped_mdek && !s2.account_id && !s2.consent_completed) {
        s2.first_run_shown = true;
        void this.saveSettings();
        notifyStatus("askMyu is installed \u2014 the Myu pane is where you set it up.");
        void this.openToday();
      }
    });
  }
  onunload() {
    if (this.careerCanvasTimer !== null) {
      window.clearTimeout(this.careerCanvasTimer);
      this.careerCanvasTimer = null;
    }
    this.careerCanvasListener = null;
    this.unlock?.shutdown();
    this.capture?.stop();
    this.myuWatcher?.stop();
    this.sse?.stop();
  }
  // ── lifecycle ─────────────────────────────────────────────────────────────
  async resume() {
    if (!this.settings.device_id) {
      this.settings.device_id = generateDeviceId();
      await this.saveSettings();
    }
    await this.unlock.resume();
  }
  /** Full materialize on vault open, so the state is current without a manual
      Sync now. Throttled (a reload within 60s of the last open-sync is a no-op)
      and single-flight. */
  async syncOnOpen() {
    if (this.syncingOnOpen) return;
    if (!this.settings.sync_on_open) return;
    const since = Date.now() - (this.settings.last_open_sync ?? 0);
    if (since < 6e4) return;
    this.syncingOnOpen = true;
    this.settings.last_open_sync = Date.now();
    await this.saveSettings();
    try {
      await this.materializer.materializeAll();
      this.lastSyncAt = Date.now();
    } finally {
      this.syncingOnOpen = false;
    }
  }
  async onUnlockState(state, detail) {
    this.lastStateDetail = detail;
    this.setStatusBar(state, detail);
    if (state !== "unlocked") void this.refreshToday({ now: true });
    if (state === "unlocked") {
      void this.refreshOnboardingState();
      void this.unlock.ensurePluginToken();
      void this.loadFeatures().then(() => {
        void this.refreshToday({ now: true });
        this.startLiveStream();
      });
      void this.loadIntegrationStatus(true);
      if ((!this.settings.consent_completed || !this.settings.materialize_consented) && !this.returningSetupOffered) {
        this.returningSetupOffered = true;
        void this.openToday();
      }
      {
        void this.syncOnOpen();
      }
    }
    this.settingTab?.refreshIfVisible();
    if (state === "unlocked") {
      this.restartCapture();
      await this.capture.flushQueue();
      await this.myuWatcher.flushQueue();
      void this.refreshPendingTransfers();
    } else {
      this.capture.stop();
      this.meetingCapture.stop();
      this.sse.stop();
    }
    if (state === "disconnected" && detail === "token_revoked") {
      notifyError("askMyu access was revoked. Reconnect in Settings \u2192 askMyu to resume.");
    }
    await this.refreshToday({ now: true });
  }
  /**
   * (Re)register the vault watcher. Called after consent and after unlock.
   * Registration is refused when the allowlist is empty — QA invariant 2 — so
   * this is safe to call at any time.
   */
  restartCapture() {
    this.capture.stop();
    this.meetingCapture.stop();
    this.myuWatcher.stop();
    if (this.unlock.current !== "unlocked") return;
    this.capture.start((event, fn) => {
      this.registerEvent(this.app.vault.on(event, fn));
    });
    this.meetingCapture.start((event, fn) => {
      this.registerEvent(this.app.vault.on(event, fn));
    });
    this.myuWatcher.start((event, fn) => {
      this.registerEvent(this.app.vault.on(event, fn));
    });
  }
  // ── commands ──────────────────────────────────────────────────────────────
  registerCommands() {
    this.addCommand({
      id: "open-today",
      name: "Open Myu",
      callback: () => void this.openToday()
    });
    this.addCommand({
      id: "sync-from-myu",
      name: "Sync everything from Myu now",
      checkCallback: (checking) => {
        if (this.unlock.current !== "unlocked" || !this.settings.materialize_consented) return false;
        if (checking) return true;
        void this.materializer.materializeAll().then(() => notifyStatus("Synced \u2014 Myu\u2019s folder is current."));
        return true;
      }
    });
    this.addCommand({
      id: "talk-to-myu",
      name: "Talk to Myu",
      callback: () => {
        if (this.unlock.current === "unlocked") void this.openChat({ text: "", send: false });
        else void this.openToday();
      }
    });
    this.addCommand({
      id: "choose-shared-folders",
      name: "Choose what Myu can read",
      callback: () => new ConsentModal(this.app, this, () => void this.refreshToday({ now: true })).open()
    });
    this.addCommand({
      id: "capture-current-note",
      name: "Send this note to Myu now",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || !this.capture.isShared(file)) return false;
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.capture.capture(file).then((result) => {
          notifyStatus(
            result === "sent" ? "Sent to Myu." : result === "queued" ? "Saved \u2014 it goes out when you are back online." : result === "vetoed" ? "This note opts out with `myu: false`." : "Nothing new in this note since the last time."
          );
        });
        return true;
      }
    });
    this.addCommand({
      id: "ask-about-note",
      name: "Ask Myu about this note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.askMyuAboutNote(file);
        return true;
      }
    });
    this.addCommand({
      id: "ask-about-selection",
      name: "Ask Myu about this selection",
      editorCheckCallback: (checking, editor) => {
        const selection = editor.getSelection();
        if (!selection.trim() || this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.openChat({ text: `About this:

${selection.trim()}

`, send: false });
        return true;
      }
    });
    for (const [id, name, run] of [
      ["merge-person", "Merge this person into\u2026", (p) => this.mergePerson(p)],
      ["this-is-me", "This person is me", (p) => this.markPersonAsSelf(p)],
      ["archive-person", "Archive this person", (p) => void this.archivePerson(p)]
    ]) {
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (this.unlock.current !== "unlocked") return false;
          const file = this.app.workspace.getActiveFile();
          const person = file ? this.personOfNote(file) : null;
          if (!person) return false;
          if (!checking) run(person);
          return true;
        }
      });
    }
    this.addCommand({ id: "new-conversation", name: "Start a new conversation", callback: () => {
      void this.openChat({ text: "", send: false });
      this.chatView()?.startNew();
    } });
    this.addCommand({ id: "cancel-backfill", name: "Cancel bringing in notes", checkCallback: (checking) => {
      if (!this.backfillActive) return false;
      if (!checking) this.cancelBackfill();
      return true;
    } });
    this.addCommand({ id: "remove-myu-files", name: "Remove everything Myu wrote", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked" && Object.keys(this.settings.myu_file_hashes).length === 0) return false;
      if (!checking) this.removeEverythingMyuWrote();
      return true;
    } });
    this.addCommand({ id: "weave-myu-in", name: "Weave Myu in (recipes for your notes)", callback: () => void this.openWeave() });
    this.addCommand({
      id: "insert-myu-snippet",
      name: "Insert a Myu snippet\u2026",
      editorCallback: (editor) => {
        new WeaveSnippetModal(this.app, this.settings.materialize_folder || "Myu", (snippet) => editor.replaceSelection(snippet.text)).open();
      }
    });
    this.addCommand({ id: "help-myu", name: "Help Myu (people it cannot place)", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) void this.openHelpMyu();
      return true;
    } });
    this.addCommand({ id: "search-myu", name: "Search Myu (people, companies, memories)", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) new FeedSearchModal(this.app, this).open();
      return true;
    } });
    this.addCommand({ id: "import-from-drive", name: "Import meeting notes from Google Drive\u2026", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) new DriveImportModal(this.app, this).open();
      return true;
    } });
    this.addCommand({ id: "send-feedback", name: "Send feedback", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) new FeedbackModal(this.app, this).open();
      return true;
    } });
    this.addCommand({ id: "past-canvases", name: "Open a past canvas", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) new CanvasHistoryModal(this.app, this).open();
      return true;
    } });
    this.addCommand({ id: "export-everything", name: "Export everything Myu knows into the vault", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) void this.exportEverything();
      return true;
    } });
    this.addCommand({ id: "request-data-archive", name: "Request my data archive (encrypted zip by email)", checkCallback: (checking) => {
      if (this.unlock.current !== "unlocked") return false;
      if (!checking) this.openDataExport();
      return true;
    } });
    this.addCommand({
      id: "save-composition",
      name: "Save a Myu composition to my vault",
      checkCallback: (checking) => {
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        new CanvasExportModal(this.app, this).open();
        return true;
      }
    });
    this.addCommand({
      id: "choose-meeting-folders",
      name: "Choose my meeting-notes folders",
      callback: () => new MeetingConsentModal(this.app, this, () => void this.refreshToday({ now: true })).open()
    });
    this.addCommand({
      id: "show-myu-card",
      name: "Show Myu's card for this person",
      checkCallback: (checking) => {
        if (this.unlock.current !== "unlocked") return false;
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.personIndex.find(file.basename)) return false;
        if (checking) return true;
        void this.showMyuCardFor(file);
        return true;
      }
    });
    this.addCommand({
      id: "send-meeting-note",
      name: "Send this meeting note to Myu now",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.meetingCapture.qualifies(file)) return false;
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.meetingCapture.capture(file).then((result) => {
          notifyStatus(
            result === "sent" ? "Meeting note sent \u2014 Myu is reading it now." : result === "unchanged" ? "Nothing new in this note since the last send." : result === "refused" ? "The server refused this note (too large, or it has no date Myu can find)." : "Not sent \u2014 check the connection."
          );
        });
        return true;
      }
    });
    this.addCommand({
      id: "next-meeting-prep",
      name: "Look at my next meeting's prep",
      checkCallback: (checking) => {
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void (async () => {
          const today = /* @__PURE__ */ new Date();
          const pad = (n) => String(n).padStart(2, "0");
          const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
          const next = new Date(today.getTime() + 864e5);
          const res = await this.backend.getCalendarEvents(
            day,
            `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
          );
          const events = (res.data?.events ?? []).filter((e) => !e.all_day && e.status !== "cancelled").map((e) => ({ ...e, at: new Date(e.start_time.includes("T") ? e.start_time : `${e.start_time.replace(" ", "T")}Z`).getTime() })).filter((e) => e.at > Date.now()).sort((a, b) => a.at - b.at);
          if (events.length === 0) {
            notifyStatus("No more meetings today.");
            return;
          }
          await this.openPrep(events[0].event_id);
        })();
        return true;
      }
    });
    for (const tab of ["person", "company"]) {
      this.addCommand({
        id: `look-up-${tab}`,
        name: tab === "company" ? "Look up a company" : "Look up a person",
        checkCallback: (checking) => {
          if (this.unlock.current !== "unlocked") return false;
          if (checking) return true;
          new LookupModal(this.app, this, tab, (entity) => {
            void this.openCard(tab, entity.entity_id, entity.display_name);
          }).open();
          return true;
        }
      });
    }
    this.addCommand({
      id: "write-weekly-review",
      name: "Write this week's review into my weekly note",
      checkCallback: (checking) => {
        if (!this.settings.weekly_review_enabled) return false;
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.writeWeeklyReview();
        return true;
      }
    });
    this.addCommand({
      id: "let-myu-write",
      name: "Let Myu keep a folder in my vault",
      checkCallback: (checking) => {
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        new MaterializeConsentModal(this.app, this, (accepted) => {
          if (!accepted) return;
          this.restartCapture();
          void this.materializer.materializeAll().then(({ people }) => {
            if (people > 0) notifyStatus(`Myu wrote ${people} ${people === 1 ? "page" : "pages"}.`);
          });
        }).open();
        return true;
      }
    });
    this.addCommand({
      id: "refresh-myu-folder",
      name: "Refresh Myu's folder now",
      checkCallback: (checking) => {
        const s2 = this.settings;
        if (!s2.materialize_consented || !s2.materialize_enabled) return false;
        if (this.unlock.current !== "unlocked") return false;
        if (checking) return true;
        void this.materializer.materializeAll().then(({ people, skipped }) => {
          notifyStatus(
            skipped > 0 ? `Refreshed. ${skipped} ${skipped === 1 ? "file has" : "files have"} unshipped edits and ${skipped === 1 ? "was" : "were"} left alone.` : `Refreshed ${people} ${people === 1 ? "page" : "pages"}.`
          );
        });
        return true;
      }
    });
    this.addCommand({
      id: "send-queued",
      name: "Send queued notes now",
      callback: () => {
        void this.capture.flushQueue().then(({ sent, remaining }) => {
          notifyStatus(remaining === 0 ? `Sent ${sent}. Nothing waiting.` : `Sent ${sent}. ${remaining} still waiting.`);
        });
      }
    });
  }
  // ── views ─────────────────────────────────────────────────────────────────
  async openToday() {
    const existing = this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      void this.refreshToday({ now: true });
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: TODAY_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  /**
   * Cards open in the right sidebar and REPLACE each other — one card leaf, not
   * a pile. They are ephemeral views of someone's read, not documents to
   * accumulate.
   */
  setStatusBar(state, detail) {
    if (!this.statusBarEl) return;
    const word = state === "unlocked" ? "ready" : state === "relocked" ? detail === "offline" ? "offline" : "locked" : state === "blocked" ? "setup" : "off";
    this.statusBarEl.setText(`myu \xB7 ${word}`);
  }
  /** Shared by the palette command and the context menus. */
  async askMyuAboutNote(file) {
    const raw = await this.app.vault.cachedRead(file);
    const clipped = raw.length > 6e3 ? `${raw.slice(0, 6e3)}

[\u2026 clipped]` : raw;
    const context = await this.chatContextForFile(file);
    await this.openChat({
      text: `About my note "${file.basename}":

${clipped}

What do you notice?`,
      send: true,
      context
    });
  }
  /** Entity grounding for a note: Myu-materialized pages carry their entity id
      in frontmatter; the user's own person pages resolve by name. */
  async chatContextForFile(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const fmType = fm?.type;
    const fmId = fm?.["myu-id"];
    if ((fmType === "myu-person" || fmType === "myu-company") && typeof fmId === "string" && fmId) {
      const entityType = fmType === "myu-person" ? "person" : "company";
      return {
        source: "vault_note",
        source_id: file.path,
        entity_references: [{ entity_type: entityType, entity_id: fmId, display_name: file.basename }],
        card_entity_type: entityType,
        card_entity_id: fmId
      };
    }
    if (this.personIndex.find(file.basename)) {
      const res = await this.backend.searchEntities(file.basename);
      const match = (res.data?.results ?? []).find(
        (r) => r.entity_type === "person" && r.display_name.toLowerCase() === file.basename.toLowerCase()
      );
      if (match) {
        return {
          source: "vault_note",
          source_id: file.path,
          entity_references: [{ entity_type: "person", entity_id: match.entity_id, display_name: match.display_name }],
          card_entity_type: "person",
          card_entity_id: match.entity_id
        };
      }
    }
    return void 0;
  }
  /** Open a person's card by display name (the myu-card deep link target). */
  async showMyuCardForName(name, _file) {
    const res = await this.backend.searchEntities(name);
    const match = (res.data?.results ?? []).find(
      (r) => r.entity_type === "person" && r.display_name.toLowerCase() === name.toLowerCase()
    ) ?? (res.data?.results ?? []).find((r) => r.entity_type === "person");
    if (!match) {
      notifyStatus(`Myu doesn't know ${name} yet.`);
      return;
    }
    await this.openCard("person", match.entity_id, match.display_name);
  }
  /** Shared by the palette command and the context menus. */
  async showMyuCardFor(file) {
    const res = await this.backend.searchEntities(file.basename);
    const match = (res.data?.results ?? []).find(
      (r) => r.entity_type === "person" && r.display_name.toLowerCase() === file.basename.toLowerCase()
    ) ?? (res.data?.results ?? []).find((r) => r.entity_type === "person");
    if (!match) {
      notifyStatus(`Myu doesn't know ${file.basename} yet.`);
      return;
    }
    await this.openCard("person", match.entity_id, match.display_name);
  }
  /** Help Myu — its own sidebar tab, reused like cards. */
  /** The Myu look, over the vault's own adapter and config folder — whatever that folder is called. */
  lookInstaller() {
    const a = this.app.vault.adapter;
    return new LookInstaller(
      { exists: (p) => a.exists(p), read: (p) => a.read(p), write: (p, t) => a.write(p, t), remove: (p) => a.remove(p), mkdir: (p) => a.mkdir(p) },
      this.app.vault.configDir,
      this.manifest.version,
      snippetSwitch(this.app, LOOK_NAME)
    );
  }
  /** The recipes pane — a document, so it opens in the main area, once. */
  async openWeave() {
    const existing = this.app.workspace.getLeavesOfType(WEAVE_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getLeaf("tab");
    if (!existing.length) await leaf.setViewState({ type: WEAVE_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof WeaveView) await view.render();
  }
  async openHelpMyu() {
    const existing = this.app.workspace.getLeavesOfType(HELP_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: HELP_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof HelpMyuView) await view.refresh();
  }
  async openCard(entityType, entityId, name) {
    const existing = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof CardView) await view.showEntity(entityType, entityId, name);
  }
  /**
   * A composition, read beside the notes (P-CANVAS-1). One canvas leaf,
   * reused — like cards and preps, it is a view of something, not a document
   * to accumulate.
   */
  /** The card pane, if one is open. */
  cardView() {
    const view = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0]?.view;
    return view instanceof CardView ? view : null;
  }
  /** A row for Today's "noticed just now": twelve hours, six deep, newest first, one per title. */
  noteInsight(row) {
    this.liveInsights = [{ ...row, receivedAt: Date.now() }, ...this.liveInsights.filter((i) => i.title !== row.title)].filter((i) => Date.now() - i.receivedAt < 12 * 60 * 60 * 1e3).slice(0, 6);
    void this.refreshToday();
  }
  /** feed/help-myu, for Today. Quiet on failure — the queue is a courtesy, not a state. */
  async loadHelpQueue() {
    if (this.unlock.current !== "unlocked") {
      this.helpQueue = [];
      return;
    }
    const res = await this.backend.getHelpMyuQueue().catch(() => null);
    this.helpQueue = res?.ok ? res.data?.queue ?? [] : [];
  }
  /** A merge the Help Myu queue proposed — same confirm, same wire as the picker path. */
  mergePersonInto(source, target) {
    new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.merge(source.name, target.name), (yes) => {
      if (!yes) return;
      void (async () => {
        const res = await this.backend.mergeRelationships(source.id, target.id);
        if (!res.ok) {
          notifyError(`Couldn\u2019t merge: ${res.error ?? res.data?.message ?? res.status}`);
          return;
        }
        await this.materializer.retirePersonNote(source.id);
        notifyStatus(`Merged ${source.name} into ${target.name}.`);
        this.helpQueue = this.helpQueue.filter((i) => !(i.item_type === "merge_candidate" && i.source.relationship_id === source.id));
        void this.refreshToday({ now: true });
        for (const leaf of this.app.workspace.getLeavesOfType(HELP_VIEW_TYPE)) if (leaf.view instanceof HelpMyuView) leaf.view.render();
        void this.materializer.materializeAll();
      })();
    }).open();
  }
  /** The chat pane, if one is open anywhere. */
  chatView() {
    const view = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]?.view;
    return view instanceof ChatView ? view : null;
  }
  /** A canvas click that talks back: the reply lands in the thread within seconds — show it even if `chatrefresh` is late. */
  expectChatReply() {
    window.setTimeout(() => void this.chatView()?.reloadThread(), 3500);
  }
  /**
   * `composition_ready` / `composition_offer`: an OPEN pane follows a ready
   * canvas ("if a new one comes in it replaces the last one" — operator);
   * otherwise it is an offer — a row in the conversation and in Today, and a
   * Notice only when the backend marked it `announce`. Nothing opens itself.
   */
  takeOffer(source, payload) {
    const step = routeOffer(source, payload, this.openCanvasId(), Date.now(), this.canvasView()?.followsLatest() ?? true);
    if (step.kind === "replace") {
      void this.canvasView()?.showComposition(step.compositionId);
      this.chatView()?.offerCanvas(step.compositionId, step.summaryText ?? "", "Open canvas");
      return;
    }
    if (step.kind !== "offer") return;
    this.pendingOffers = addOffer(this.pendingOffers, step.offer);
    this.canvasView()?.noteNewer(step.offer.compositionId, step.offer.summaryText ?? "");
    this.chatView()?.offerCanvas(step.offer.compositionId, step.offer.summaryText, step.offer.actionLabel);
    void this.refreshToday();
    if (step.announce) notifyLive({ title: step.offer.summaryText || "Myu prepared a canvas", body: step.offer.subjectName, kind: "info" }, () => void this.openOffer(step.offer.compositionId));
  }
  async openOffer(compositionId) {
    this.pendingOffers = this.pendingOffers.filter((o) => o.compositionId !== compositionId);
    await this.openCanvas(compositionId);
    void this.refreshToday({ now: true });
  }
  dismissOffer(compositionId) {
    this.pendingOffers = this.pendingOffers.filter((o) => o.compositionId !== compositionId);
    void this.refreshToday({ now: true });
  }
  /** `POST /feedback/submit` with what an Obsidian plugin can honestly say about itself. */
  sendFeedback(opts) {
    return this.backend.submitFeedback({ message: opts.message, category: opts.category, ...opts.rating ? { rating: opts.rating } : {}, app: "obsidian", version: BUILD_STAMP, context: { surface_state: opts.surface, ...opts.journalId ? { journal_id: opts.journalId } : {}, platform: import_obsidian54.Platform.isMobile ? "mobile" : "desktop" }, ...opts.attachments ? { attachments: opts.attachments } : {} });
  }
  /** The canvas pane, if one is open anywhere. */
  canvasView() {
    const view = this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)[0]?.view;
    return view instanceof CanvasView ? view : null;
  }
  /** The composition a pane is showing — what the chat sends as `continues_composition_id`. */
  openCanvasId() {
    return this.canvasView()?.currentId() ?? null;
  }
  applyCanvasMutations(compositionId, mutations) {
    return this.canvasView()?.applyRemoteMutations(compositionId, mutations) ?? false;
  }
  adoptCanvasId(compositionId) {
    this.canvasView()?.adoptId(compositionId);
  }
  /**
   * `reveal: false` updates the pane WITHOUT pulling it in front of what the
   * reader is doing. Every automatic path uses it: a canvas arriving mid-thread
   * used to yank its tab over the conversation the user was typing in
   * (operator, 2026-09-01), and the thread now carries the canvas anyway. A
   * button press still reveals, because that is a request to look.
   */
  async openCanvas(compositionId, opts = {}) {
    const reveal = opts.reveal !== false;
    const existing = this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE);
    if (!existing.length && !reveal) return;
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: CANVAS_VIEW_TYPE, active: true });
    if (reveal) await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof CanvasView) await view.showComposition(compositionId);
  }
  /** Prep opens in the right sidebar; one prep leaf, reused, like cards. */
  async openPrep(eventId) {
    const existing = this.app.workspace.getLeavesOfType(PREP_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: PREP_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof PrepView) await view.showMeeting(eventId);
  }
  refreshToday(opts = {}) {
    return this.todayGate.request(opts);
  }
  async fetchTodayLeaves() {
    for (const leaf of this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE)) {
      if (leaf.isDeferred) continue;
      const view = leaf.view;
      if (view instanceof TodayView) await view.refresh();
    }
  }
  /** A progress line is a PAINT, never a fetch: the pane updates one row. */
  paintProgress() {
    for (const leaf of this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE)) {
      if (leaf.isDeferred) continue;
      const view = leaf.view;
      if (view instanceof TodayView) view.paintProgress();
    }
  }
  // ── connect / backfill (called from settings + modals) ────────────────────
  /** Stable device identity, minted on first need. */
  async ensureDeviceId() {
    if (!this.settings.device_id) {
      this.settings.device_id = crypto.randomUUID();
      await this.saveSettings();
    }
    return this.settings.device_id;
  }
  /** P9 — redeem an emailed sign-in token (protocol handler or pasted link). */
  async completeMagicSignup(token) {
    if (this.unlock.current === "unlocked") return;
    const deviceId = await this.ensureDeviceId();
    const outcome = await this.unlock.completeMagicLink(token, deviceId);
    if (outcome === "ceremony") {
      this.openGenesisCeremony();
    } else if (outcome === "existing_account") {
      notifyStatus("Welcome back \u2014 this device needs approving. Myu shows how.");
      void this.openToday();
    } else if (outcome === "invalid") {
      notifyError("That sign-in link has expired or was already used. Request a fresh one.");
    } else {
      notifyError("Sign-in failed \u2014 check the connection and try again.");
    }
  }
  /**
   * Signup's key-birth step — the same t=0 custody sequence every frontend
   * runs, made visible as twelve words because this client has no passkey.
   * Closable: the account rests in BLOCKED and settings offers to finish.
   */
  openGenesisCeremony() {
    new SetupRecoveryModal(this.app, this, () => void this.finishFirstRun(), "genesis").open();
  }
  /**
   * The shared landing of every fresh-account door, AFTER keys exist:
   * rung one of the consent ladder, immediately — propose-don't-ask,
   * give-before-take. Recovery is real from birth; nothing is pending.
   */
  async finishFirstRun() {
    notifyStatus("Welcome. Myu is ready.");
    await this.openToday();
  }
  /** P10 — the webapp's arc/moment conversation, gated on SERVER truth. Dismissed or finished, the ladder goes on. */
  async offerOnboardingThenBackfill() {
    await this.refreshOnboardingState();
    if (this.onboardingComplete === false) {
      this.openOnboarding(() => this.offerBackfill());
      return;
    }
    this.offerBackfill();
  }
  /** The write rung, then whatever comes next. Latches `materialize_offered` either way — never a nag. */
  offerResidencyThen(next) {
    if (this.unlock.current !== "unlocked") return;
    if (this.settings.materialize_consented || this.settings.materialize_offered) {
      next();
      return;
    }
    new MaterializeConsentModal(this.app, this, (accepted) => {
      this.settings.materialize_offered = true;
      void this.saveSettings();
      if (accepted) {
        this.restartCapture();
        void this.materializer.materializeAll().then(({ people }) => {
          if (people > 0) notifyStatus(`Myu wrote ${people} ${people === 1 ? "page" : "pages"}.`);
        });
      }
      next();
    }).open();
  }
  /**
   * The write step of the sign-in ladder (operator, 2026-08-25: "I had to
   * enable Myu to write to Myu — annoying"). Signing in ran the READ consents
   * and onboarding but never OFFERED the write consent, so the vault stayed
   * empty and the toggle had to be hunted for in settings. Writing plaintext
   * stays its own opt-in class — we don't auto-enable — but it is now offered
   * at the natural moment. Backfill of the user's own existing notes proceeds
   * either way (it is a read, independent of whether Myu writes its folder).
   */
  offerResidencyThenBackfill() {
    this.offerResidencyThen(() => this.offerBackfill());
  }
  openOnboarding(onFinished) {
    let handed = false;
    new OnboardingModal(this.app, this, () => {
      if (handed) return;
      handed = true;
      void this.refreshOnboardingState();
      onFinished?.();
    }).open();
  }
  /** Ask the server whether onboarding happened; cache for settings + Today. */
  async refreshOnboardingState() {
    if (this.unlock.current !== "unlocked" || !this.settings.account_id) return;
    const res = await this.backend.getAccountState(this.settings.account_id);
    if (!res.ok || !res.data) return;
    this.onboardingComplete = res.data.onboarding_complete === true;
    this.onboardingScripts = res.data.myu_scripts ?? {};
    this.settingTab?.refreshIfVisible();
    void this.refreshToday();
  }
  async connect(token) {
    if (!this.settings.device_id) {
      this.settings.device_id = generateDeviceId();
      await this.saveSettings();
    }
    await this.unlock.connect(token, this.settings.device_id);
    if (this.unlock.current === "disconnected") {
      notifyError("That token didn't work. Create a new one in askMyu \u2192 Settings \u2192 Integrations.");
    }
  }
  /** Offered right after consent — the vault's history is the whole wedge. */
  offerBackfill() {
    if (this.unlock.current !== "unlocked") return;
    const { files, oldest } = this.capture.surveyBackfill();
    if (files.length === 0) return;
    new BackfillModal(this.app, this, files, oldest).open();
  }
  /**
   * The meeting-side wedge (gap closed 2026-08-23): existing Meetings/ notes
   * ingest in one confirmed sweep instead of waiting to be edited. Progress
   * rides the Today choreography row — the folder visibly filling is the
   * first-run promise, and this is where it starts for the acquisition
   * persona. Scope-confirmed by the count in the notice, not a second modal:
   * the consent ceremony just named these exact folders.
   */
  async runMeetingBackfill() {
    if (this.unlock.current !== "unlocked") return;
    const { files } = this.meetingCapture.surveyBackfill();
    if (files.length === 0) return;
    notifyStatus(`Bringing in ${files.length} existing meeting ${files.length === 1 ? "note" : "notes"}\u2026`);
    await this.meetingCapture.backfill(files, (done, total) => {
      this.materializeProgress = `Reading your meeting notes \u2014 ${done} of ${total}`;
      this.paintProgress();
    });
    this.materializeProgress = null;
    void this.refreshToday();
  }
  reportBackfillFinished(total) {
    notifyStatus(`Brought in ${total} ${total === 1 ? "note" : "notes"}.`);
    this.settings.backfill_done = true;
    void this.saveSettings();
    void this.refreshToday({ now: true });
  }
  expectCareerCanvas() {
    if (this.careerCanvasTimer !== null) window.clearTimeout(this.careerCanvasTimer);
    this.careerCanvasTimer = window.setTimeout(() => {
      this.careerCanvasTimer = null;
      void this.openCareerCanvas();
    }, 25e3);
  }
  /** True (and consumed) when a `composition_ready` is the seeded career canvas the onboarding is waiting for. */
  claimCareerCanvas(payload) {
    if (this.careerCanvasTimer === null || payload.flow_type !== "CareerTrajectoryCompositionFlow") return false;
    window.clearTimeout(this.careerCanvasTimer);
    this.careerCanvasTimer = null;
    return true;
  }
  /**
   * Device transfer requests waiting on this vault. Polled, not merely pushed:
   * the SSE Notice is the fast path, this is the one that still works when the
   * stream is down, the app was closed, or the toast was missed. Requests live
   * ~5 minutes server-side, so a stale row is dropped rather than shown.
   */
  /**
   * Keep the live stream up while unlocked. START it if it was never started
   * (an unlock that did not re-fire leaves `desired` false, and ensure() would
   * politely do nothing), otherwise re-open a stream that is not connected.
   */
  ensureLiveStream() {
    if (this.settings.use_mock_backend || this.termsStanding() === "gated") return;
    if (!this.sse.isRunning) {
      this.startLiveStream();
      return;
    }
    this.sse.ensure();
  }
  async refreshPendingTransfers() {
    if (this.unlock.current !== "unlocked" || this.settings.use_mock_backend) {
      if (this.pendingTransfers.length) {
        this.pendingTransfers = [];
        void this.refreshToday();
      }
      return;
    }
    const res = await this.backend.getPendingTransfers().catch(() => null);
    if (!res?.ok) return;
    const next = (res.data?.pending_requests ?? []).filter((r) => r.request_id);
    const changed = next.length !== this.pendingTransfers.length || next.some((r, i) => r.request_id !== this.pendingTransfers[i]?.request_id);
    this.pendingTransfers = next;
    if (changed) {
      void this.refreshToday({ now: true });
      this.settingTab?.refreshIfVisible();
    }
  }
  /**
   * From a canvas back to the conversation that made it: reveal the chat, then
   * scroll to and flash the reply carrying that canvas.
   *
   * If the canvas belongs to a conversation that is not open, `journal_id` on
   * its history row (backend 2026-09-01) says which one \u2014 so we open it and
   * land on the reply rather than telling the reader to go find it. Canvases
   * stored before that deploy carry no journal, and those still say so.
   */
  async showCanvasInChat(compositionId) {
    await this.openChat({ text: "", send: false });
    if (this.chatView()?.revealCanvas(compositionId)) return;
    const journalId = await this.journalForComposition(compositionId);
    if (!journalId) {
      notifyStatus("That canvas belongs to another conversation \u2014 find it under Past conversations.");
      return;
    }
    await this.openConversation(journalId);
    if (!this.chatView()?.revealCanvas(compositionId)) notifyStatus("Opened the conversation this canvas belongs to.");
  }
  /** Which conversation a canvas came from, per `/composition/history`. Empty when unknown. */
  async journalForComposition(compositionId) {
    const rows = (await this.backend.getCompositionHistory(50).catch(() => null))?.data?.compositions ?? [];
    const row = rows.find((r) => (r.composition_id ?? r.id) === compositionId);
    return typeof row?.journal_id === "string" ? row.journal_id : "";
  }
  /** The career canvas, asked for by the plugin (POST /composition/career-trajectory) and opened — the payback beat's fallback. */
  async openCareerCanvas() {
    const res = await this.backend.createCareerTrajectory().catch(() => null);
    const id = res?.data?.composition?.id || res?.data?.composition_id;
    if (!res?.ok || !id) return;
    await this.openCanvas(String(id));
    this.careerCanvasListener?.(String(id));
  }
  /** "Remove everything Myu wrote": confirm, then every generated file to the trash. Writing stays as set. */
  removeEverythingMyuWrote() {
    const found = findEverythingMyuWrote(this.app, Object.keys(this.settings.myu_file_hashes));
    if (found.files.length === 0) {
      notifyStatus("Nothing of Myu\u2019s to remove.");
      return;
    }
    const n = found.files.length;
    new PersonActionConfirmModal(this.app, {
      title: "Remove everything Myu wrote?",
      body: `${n} ${n === 1 ? "file goes" : "files go"} to the trash \u2014 every page, note, table and canvas Myu wrote, recoverable from there. Your own notes are untouched. Writing stays ${this.settings.materialize_consented ? "on, so the folder fills again on the next sync; turn it off in settings to stop that" : "off"}.`,
      cta: "Remove"
    }, (yes) => {
      if (!yes) return;
      void (async () => {
        const trashed = await trashEverythingMyuWrote(this.app, found.files);
        this.settings.myu_file_hashes = {};
        await this.saveSettings();
        notifyStatus(`Removed ${trashed} ${trashed === 1 ? "file" : "files"} \u2014 they are in the trash.`);
        void this.refreshToday({ now: true });
      })();
    }).open();
  }
  /** What the vault's links already say — cached per session; recomputed when consent changes. */
  async linkSurvey(force = false) {
    if (this.surveyCache && !force) return this.surveyCache;
    const notes = await this.capture.sharedNotesForSurvey();
    this.surveyCache = surveyLinks(notes);
    return this.surveyCache;
  }
  forgetLinkSurvey() {
    this.surveyCache = null;
  }
  async runBackfill(files) {
    if (this.backfillActive || files.length === 0) return;
    this.backfillActive = true;
    this.backfillStop = false;
    notifyStatus(`Bringing in ${files.length} ${files.length === 1 ? "note" : "notes"} \u2014 progress in the status bar; \u201CCancel bringing in notes\u201D stops it.`);
    const result = await this.capture.backfill(files, (done, total) => {
      this.statusBarEl?.setText(`myu \xB7 reading ${done}/${total}`);
      this.materializeProgress = `Reading your notes \u2014 ${done} of ${total}`;
      this.paintProgress();
    }, () => this.backfillStop);
    this.backfillActive = false;
    this.materializeProgress = null;
    this.setStatusBar(this.unlock.current, this.lastStateDetail);
    if (result.stopped) {
      notifyStatus("Stopped. What was sent stays sent; press Start again to continue \u2014 notes already in are skipped.");
      void this.refreshToday({ now: true });
      return;
    }
    this.reportBackfillFinished(files.length);
  }
  cancelBackfill() {
    this.backfillStop = true;
  }
  /** Public door to the Today refresh, for dialogs that changed a checklist row. */
  refreshTodayNow() {
    return this.refreshToday({ now: true });
  }
  /** Open the chat pane seeded — every conversational affordance lands here. */
  /** Open the chat pane on a PAST conversation, resumable. */
  async openConversation(journalId) {
    await this.openChat({ text: "", send: false });
    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    const view = leaf?.view;
    if (view instanceof ChatView) await view.openPastConversation(journalId);
  }
  async openChat(seed) {
    const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ChatView) view.seed(seed);
  }
  /** P6.3 — the exposure modal, then the vault-module write. Never automatic. */
  offerConversationSave(turns) {
    new ConversationSaveModal(this.app, async () => {
      const outcome = await this.conversationWriter.write(turns);
      if (outcome.status === "written") notifyStatus(`Saved to ${outcome.path}.`);
      else if (outcome.status === "nothing_to_write") notifyStatus("Nothing to save yet.");
      else notifyError(`Could not save the conversation: ${outcome.message}`);
    }).open();
  }
  /**
   * P5.5 — fetch a composition and materialize it as a .canvas + provenance
   * stub. The caller has already collected the exposure yes; this is the
   * mechanism. Shared by the command modal and (P6) the chat offer.
   */
  // ── person actions: merge / this is me / archive ─────────────────────────
  /** A Myu person note → the relationship it stands for, by frontmatter. */
  personOfNote(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== "myu-person" || typeof fm["myu-id"] !== "string") return null;
    return { id: fm["myu-id"], name: file.basename };
  }
  mergePerson(source) {
    new MergeIntoModal(this.app, this, source.id, source.name, (target) => {
      new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.merge(source.name, target.display_name), (yes) => {
        if (!yes) return;
        void (async () => {
          const res = await this.backend.mergeRelationships(source.id, target.entity_id);
          if (!res.ok) {
            notifyError(`Couldn\u2019t merge: ${res.error ?? res.data?.message ?? res.status}`);
            return;
          }
          await this.materializer.retirePersonNote(source.id);
          notifyStatus(`Merged ${source.name} into ${target.display_name}.`);
          void this.materializer.materializeAll();
        })();
      }).open();
    }).open();
  }
  markPersonAsSelf(person) {
    new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.self(person.name), (yes) => {
      if (!yes) return;
      void (async () => {
        const res = await this.backend.markRelationshipAsSelf(person.id);
        if (!res.ok) {
          notifyError(`Couldn\u2019t mark as you: ${res.error ?? res.data?.message ?? res.status}`);
          return;
        }
        await this.materializer.retirePersonNote(person.id);
        notifyStatus(`${person.name} is you now \u2014 removed from your people.`);
        void this.materializer.materializeAll();
      })();
    }).open();
  }
  async archivePerson(person) {
    const res = await this.backend.archiveRelationship(person.id, "archive");
    if (!res.ok) {
      notifyError(`Couldn\u2019t archive: ${res.error ?? res.status}`);
      return;
    }
    await this.materializer.retirePersonNote(person.id);
    notifyStatus(`Archived ${person.name}.`);
    void this.materializer.materializeAll();
  }
  /** Sync now — Today's header button and the command. */
  async syncNow() {
    if (this.unlock.current !== "unlocked" || !this.settings.materialize_consented) {
      notifyError("Sign in and allow Myu to write first (Settings \u2192 askMyu).");
      return;
    }
    await this.materializer.materializeAll();
    this.lastSyncAt = Date.now();
    void this.refreshToday({ now: true });
  }
  /** Everything Myu knows, as files — plus the receipt. */
  async exportEverything() {
    if (this.unlock.current !== "unlocked" || !this.settings.materialize_consented) {
      notifyError("Sign in and allow Myu to write first (Settings \u2192 askMyu).");
      return;
    }
    const summary = await this.exporter.exportEverything((line) => {
      this.materializeProgress = line || null;
      void this.refreshToday();
    });
    this.lastSyncAt = Date.now();
    notifyStatus(`Exported \u2014 ${summary.conversations.saved} conversations, ${summary.canvases.kept} canvases, ${summary.people} people. Receipt: Myu/Export.md`);
  }
  openDataExport() {
    if (this.unlock.current !== "unlocked") {
      notifyError("Sign in first.");
      return;
    }
    new DataExportModal(this.app, this).open();
  }
  /** The plugin's own settings tab — where Devices lives. */
  openSettings() {
    this.settingsHost()?.open();
    this.settingsHost()?.openTabById(this.manifest.id);
  }
  /** Open the tab AND land on one row — scrolled, flashed, focused. Retries once: the tab paints on its own tick. */
  openSettingsAt(settingName) {
    const host = this.settingsHost();
    host?.open();
    const tab = host?.openTabById(this.manifest.id);
    const container = tab?.containerEl ?? document;
    window.setTimeout(() => {
      if (!revealSetting(container, settingName)) window.setTimeout(() => revealSetting(container, settingName), 300);
    }, 60);
  }
  settingsHost() {
    return this.app.setting;
  }
  async keepCanvasIfAlwaysOn(compositionId, summary = "") {
    if (!shouldKeepCanvas(this.settings.auto_keep_canvas, compositionId, this.keptCanvasIds)) return;
    const outcome = await this.exportComposition(compositionId, "canvas", { quiet: true });
    if (outcome.status === "written") notifyStatus(`Kept canvas${summary ? ` \u2014 ${summary}` : ""}: ${outcome.canvasPath}`);
    else notifyError(`Couldn\u2019t keep a canvas: ${outcome.message}`);
  }
  async exportComposition(compositionId, format = "canvas", opts = {}) {
    const res = await this.backend.getComposition(compositionId);
    const spec = res.data?.composition;
    if (!res.ok || !spec) {
      if (!opts.quiet) notifyError("Couldn't load that composition. Check the id and your connection.");
      return { status: "error", message: res.error || "could not load the composition" };
    }
    const webUrl = `${this.settings.base_url.replace(/\/api\/?$/, "")}/dashboard`;
    const outcome = format === "markdown" ? await this.canvasExporter.writeMarkdown(
      spec,
      // The note links to the user's OWN person page when they keep one,
      // by basename — the link belongs in their graph, not ours.
      (name) => this.personIndex.find(name)?.path?.replace(/\.md$/, "").split("/").pop() ?? null,
      webUrl
    ) : await this.canvasExporter.write(
      spec,
      (name) => this.personIndex.find(name)?.path ?? null,
      webUrl
    );
    if (!opts.quiet) {
      if (outcome.status === "written") notifyStatus(`Saved to ${outcome.canvasPath}.`);
      else notifyError(`Could not save it: ${outcome.message}`);
    }
    return outcome;
  }
  // ── B4: the weekly review (the only vault write) ──────────────────────────
  /** Turn the opt-in on or off. Always behind the exposure warning. */
  offerWeeklyReview(onDecided) {
    new WeeklyReviewModal(this.app, async (enabled) => {
      this.settings.weekly_review_enabled = enabled;
      await this.saveSettings();
      onDecided();
    }).open();
  }
  /**
   * Materialize this week's review. Manual only — nothing on a timer calls this,
   * so a vault write is always something the user just did.
   */
  async writeWeeklyReview() {
    if (!this.settings.weekly_review_enabled) return;
    let lines = [];
    const weeklyRes = await this.backend.getWeeklyReview().catch(() => null);
    const edition = weeklyRes?.data?.edition;
    if (edition && isWeeklyEditionFresh(edition)) {
      lines = editionToLines(edition);
    } else {
      const res = await this.backend.getBrief();
      const brief = res.data?.brief;
      lines = (brief?.sections ?? []).flatMap((section) => section.items ?? []).filter((item) => item.type === "weekly_movement" && item.text).map((item) => item.text);
    }
    const outcome = await this.weeklyReview.write({ lines, weekOf: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) });
    switch (outcome.status) {
      case "written":
        notifyStatus(`Weekly review ${outcome.created ? "created in" : "updated in"} ${outcome.path}.`);
        break;
      case "no_weekly_config":
        notifyError("No weekly note configured in Periodic Notes, so there is nowhere to write it.");
        break;
      case "nothing_to_write":
        notifyStatus("No movement to report this week \u2014 nothing written.");
        break;
      case "error":
        notifyError(`Could not write the weekly review: ${outcome.message}`);
        break;
    }
  }
  // ── persistence ───────────────────────────────────────────────────────────
  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
    if (!this.settings.vault_id) {
      this.settings.vault_id = crypto.randomUUID();
      await this.saveSettings();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
/*! Bundled license information:

event-source-polyfill/src/eventsource.js:
  (** @license
   * eventsource.js
   * Available under MIT License (MIT)
   * https://github.com/Yaffle/EventSource/
   *)

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/base/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/bip39/index.js:
  (*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) *)
*/
