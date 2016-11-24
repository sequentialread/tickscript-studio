'use strict';

import template from './home.tmpl.html!text'

var HomeController = ['$state', 'config',
function HomeController($state, config) {

}];

export default function registerRouteAndController($stateProvider) {
  return $stateProvider.state(
    'home',
    {
      url: '/',
      template: template,
      controller: HomeController,
      controllerAs: 'vm'
    }
  );
}
