"use strict";

import angular from 'angular'
import 'angular-sanitize'
import 'angular-cookies'
import 'angular-ui-router'
import 'angular-ui/bootstrap-bower'
import sourcemappedStacktrace from 'sourcemapped-stacktrace'

window.angular = angular;

var vendor = angular.module('vendor', [
  'ui.router',
  'ui.bootstrap',
  'ngSanitize',
  'ngCookies',
]);

vendor.config(['$uibModalProvider', function($uibModalProvider){
  $uibModalProvider.options.appendTo = angular.element(document.querySelector('#modal-append'));
}]);

vendor.service('sourcemappedStacktracePatched', function() {
  var filterResult = (stackTrace) => {
    if(stackTrace && typeof stackTrace !== 'string') {
      stackTrace = stackTrace.join("\n");
    }
    return '\n'+stackTrace;
  };

  this.mapStackTrace = (stackTrace, callback, options) => {
    return new Promise((resolve, reject) => {

      // modify the stack trace to match the format that sourcemappedStacktrace expects
      if(navigator.userAgent.toLowerCase().indexOf('chrome') > -1) {
        var chromeFormat1 = /^ +at.+\((.*):([0-9]+):([0-9]+)/;
        var chromeFormat2 = /^ +at.+(.*):([0-9]+):([0-9]+)/;
        stackTrace = stackTrace.split('\n').map((line, i) => {
          if(i != 0 && !line.match(chromeFormat1) && line.match(chromeFormat2)) {
            return line.replace(/^ +at /, '    at (') + ')';
          }
          return line;
        }).join('\n');
      }

      // sometimes it will throw an exception..? -- we still want to log in that case.
      // Just log the unmapped stack trace
      try {
        var itCalledBack = false;

        sourcemappedStacktrace.mapStackTrace(
          stackTrace,
          (result) => {
            if(!itCalledBack) {
              itCalledBack = true;
              resolve(filterResult(result));
            }
          },
          options
        );

        // sometimes it will fail silently and never call back. again, just log the unmapped stack trace
        setTimeout(() => {
          if(!itCalledBack) {
            itCalledBack = true;
            resolve(filterResult(stackTrace));
          }
        }, 1000);
      } catch (ex) {
        resolve(filterResult(stackTrace));
      }
    });
  };

  return this;
});
