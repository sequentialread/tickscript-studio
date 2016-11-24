"use strict";

import template from './influxRowSet.tmpl.html!text'

export default function registerDirective(module) {
  module.directive(
    'influxRowSet',
    function () {
      return {
        restrict: 'E',
        template: template,
        controllerAs: "vm",
        bindToController: true,
        controller: [function() {
        }],
        scope: {
          showTitle: '@',
          rowSet: '='
        }
      }
    }
  );
}
