"use strict";

import template from './header.tmpl.html!text'

export default function registerDirective(module) {
  module.directive(
    'myHeader',
    function () {
      return {
        restrict: 'E',
        template: template,
        controllerAs: "vm",
        scope: {},
        controller: ['config', '$state',
        function(config, $state) {
          this.config = config;
          this.getCurrentState = () => $state.$current.name;
        }]
      }
    }
  );
}
