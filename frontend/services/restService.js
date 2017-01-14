
import template from './restErrorModal.tmpl.html!text'

let RestService = ['$http', '$httpParamSerializerJQLike', '$rootScope', '$uibModal',
                   'ErrorLoggingService', 'config', 'windowViewModel', '$timeout',
function RestService($http, $httpParamSerializerJQLike, $rootScope, $uibModal,
                    ErrorLoggingService, config, windowViewModel, $timeout) {

  $rootScope.activeRequests = [];
  this.requestId = 0;
  window.$rootScope = $rootScope;

  var wwwFormEncode = (string) => {
    return encodeURIComponent(string).split('%20').join('+');
  };

  this.influxDbQuery = (database, query, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'GET',
      url: config.influxDbURL+"query?q="+wwwFormEncode(query) + (database != null ? "&db=" + wwwFormEncode(database) : "")
    })
  );

  this.kapacitorGet = (path, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'GET',
      url: config.kapacitorURL+path
    })
  );

  this.kapacitorPost = (path, body, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'POST',
      body: body,
      url: config.kapacitorURL+path
    })
  );

  this.kapacitorDelete = (path, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'DELETE',
      url: config.kapacitorURL+path
    })
  );

  this.wrapperPoll = (path, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'GET',
      url: path,
      isBackgroundProcess: true
    })
  );
  this.wrapperGet = (path, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'GET',
      url: path
    })
  );
  this.wrapperDelete = (path, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'DELETE',
      url: path
    })
  );

  this.logError = (body, options) => httpWrapper(
    Object.assign(options || {}, {
      method: 'POST',
      url: 'logError',
      body: body,
      ignoreErrors: true
    })
  );

  var httpWrapper = (options) => {

    this.requestId ++;
    var requestForTracking = {
      url: options.url,
      id: this.requestId
    };

    if(!options.isBackgroundProcess) {
      $rootScope.activeRequests.push(requestForTracking);
    }
    var request = {
      method: options.method,
      url: options.url,
      data: options.body,
      withCredentials: options.withCredentials
    };
    if(options.headers) {
      request.headers = options.headers;
    }
    if(options.authorization) {
      request.headers = request.headers ? request.headers : {};
      request.headers['Authorization'] = options.authorization;
    }
    if(options.binaryBody) {
      request.headers = request.headers ? request.headers : {};
      request.headers['Content-Type'] = undefined;
      request.transformRequest = angular.identity;
    }

    var err;
    try {
      throw new Error('HTTP Error Caught');
    } catch (ex) {
      err = ex;
    }

    return new Promise((resolve, reject) => {
      $http(request).then(
        (results) => {
          if(!options.isBackgroundProcess) {
            $rootScope.activeRequests = $rootScope.activeRequests.filter(x => x.id != requestForTracking.id);
          }

          var toResolve = options.returnFullRequest ? results : results.data;

          resolve(toResolve);
        },
        (results) => {
          if(!options.isBackgroundProcess) {
            $rootScope.activeRequests = $rootScope.activeRequests.filter(x => x.id != requestForTracking.id);
          }

          if(!options.ignoreErrors) {
            reject(err);
            if(!results.config) {
              results.config = request;
            }
            httpErrorHandler(results, err, options.body);
          } else {
            resolve(options.returnFullRequest ? results : results.data);
          }
        }
      );
    });
  }

  function httpErrorHandler(results, err, body) {

    var modalInstance = $uibModal.open({
      template: template,
      controllerAs: 'vm',
      controller: ['$uibModalInstance', '$cookies', '$state', function($uibModalInstance, $cookies, $state) {
        this.requestMethod = results.config.method;
        this.requestURL = results.config.url;
        this.requestHeaders = JSON.stringify(results.config.headers, null, 2);
        this.requestBodyJSON = body ? JSON.stringify(body, null, 2) : null;
        this.statusCode = results.status;
        this.responseBodyJSON = JSON.stringify(results.data, null, 2);
        this.ok = $uibModalInstance.close;
        this.reenterAPITokens = () => {
          windowViewModel.UserInfo.LoggedIn = false;
          $cookies.remove(config.cookieName);
          window.location.href = window.location.origin;
          $uibModalInstance.close();
        };

        ErrorLoggingService.logError(
          'HTTP ' + this.statusCode
            + ' at ' + this.requestMethod + " " + this.requestURL
            + "\n\nRequestHeaders: " + this.requestHeaders
            + "\n\nRequestBody: " + this.requestBodyJSON
            + "\n\nResponseBody: " + this.responseBodyJSON,
          null,
          null,
          null,
          err
        );
      }],
      size: 'lg'
    });
  }

}];

export default function registerService (module) {
  module.service('RestService', RestService);
}
