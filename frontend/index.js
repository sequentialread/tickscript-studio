"use strict";
"global angular";

import configText from '../config.json!text'
import './routes/routes.module'
import './directives/directives.module'
import './services/services.module'

var app = angular.module('client', [
  'vendor',
  'client.directives',
  'client.services',
  'client.routes'
]);

app.constant('windowViewModel', window.viewModel);
app.constant('config', JSON.parse(configText));

app.run(['$rootScope', '$window', '$state', function($rootScope, $window, $state) {
    $rootScope.$on('$stateChangeSuccess', function (event, current, previous) {
      try {
        var newUrl = $state.$current.url.source;
        objectForEach($state.$current.locals.globals.$stateParams, (key, value) => {
          newUrl = newUrl.replace(`:${key}`, value);
        });
        $window.document.title = `${newUrl} - tickscript-studio`;
      }
      catch (e) {
        $window.document.title = 'tickscript-studio';
      }
    });
}]);

var objectForEach = (object, keyValueAction) => {
  for(var paramName in object) {
    if(object.hasOwnProperty(paramName)) {
      keyValueAction(paramName, object[paramName]);
    }
  }
};
