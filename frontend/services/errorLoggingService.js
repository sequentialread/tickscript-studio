
function getErrorObject(thrown) {
  if(typeof thrown == "string") {
    return new Error(thrown);
  }
  return thrown;
}

var ErrorLoggingService = ['$injector', 'windowViewModel', 'sourcemappedStacktracePatched',
function ErrorLoggingService($injector, windowViewModel, sourcemappedStacktrace) {

  this.knownStackTraces = [];

  this.onStackTraceMapped = (msg, url, line, col, stackTrace) => {

     if(msg && stackTrace) {
       var remove = msg;
       var firstColon = msg.indexOf(':');
       if(firstColon != -1 && firstColon < 30) {
         remove = msg.substring(firstColon);
       }
       stackTrace = stackTrace.replace(remove, '');
     }
     var message = msg;
     var okToPostToServer = this.knownStackTraces.indexOf(stackTrace) == -1 || msg.indexOf('HTTP') == 0;
     if(this.knownStackTraces.indexOf(stackTrace) == -1) {
       this.knownStackTraces.push(stackTrace);
     }
     if(okToPostToServer) {
       var RestService = $injector.get('RestService');
       RestService.logError(
         {
             Location: window.location.href,
             Message: msg,
             File: url,
             Line: line || -1,
             Column: col || -1,
             StackTrace: stackTrace,
             JSDateMs: Number(new Date())
         }
       );
     }
  };

  this.logError = (msg, url, line, col, error) => {

    if(msg.indexOf('HTTP Error Caught') != -1) {
      return;
    }

    if(error) {
      sourcemappedStacktrace.mapStackTrace(error.stack)
        .then((stackTrace) => this.onStackTraceMapped(msg, url, line, col, stackTrace));
    } else {
      this.onStackTraceMapped(msg, url, line, col, null);
    }

    // no error alerts (like in old versions of Internet Explorer)
    var suppressErrorAlert = true;
    return suppressErrorAlert;
  };

  window.onerror = this.logError;
  window.addEventListener("unhandledrejection", (unhandledPromiseRejectionEvent, promise) => {
    var err = getErrorObject(unhandledPromiseRejectionEvent.reason);
    if(err) {
      this.logError(err.message, err.fileName, err.lineNumber, null, err);
    }
  });

}];

export default function registerService (module) {
  module.service('ErrorLoggingService', ErrorLoggingService);
  module.factory('$exceptionHandler', ['$log', 'ErrorLoggingService', function($log, ErrorLoggingService) {
    return function exceptionHandler(thrown, cause) {
      var err = getErrorObject(thrown);
      ErrorLoggingService.logError((cause || '') + err.message, err.fileName, err.lineNumber, null, err);
      $log.error(err, cause);
    };
  }]);
}
