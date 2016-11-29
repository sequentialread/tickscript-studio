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
          this.formatCell = (index, data) => index == 0 ? new Date(data).toLocaleString() : data;
        }],
        scope: {
          showTitle: '@',
          rowSet: '='
        }
      }
    }
  );
}
