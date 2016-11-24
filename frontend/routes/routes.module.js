"use strict";
"global angular";

import RegisterHome from './home/home.js'
import RegisterDataSampler from './sample/sample.js'
import RegisterTickTester from './test/test.js'

var routes = angular.module('client.routes', []);

routes.config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {

    $urlRouterProvider.otherwise(function($injector, $location) {
      console.log("Could not find route '" + ((typeof $location) == 'object' ? $location.$$path : $location) + "'");
      $location.path('/');
    });

    RegisterHome($stateProvider);
    RegisterDataSampler($stateProvider);
    RegisterTickTester($stateProvider);
}]);

export default routes;
