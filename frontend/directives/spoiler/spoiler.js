"use strict";

import template from './spoiler.tmpl.html!text'

export default function registerDirective(module) {
  module.directive(
    'spoiler',
    function () {
      return {
        restrict: 'E',
        template: template,
        controllerAs: "vm",
        bindToController: true,
        controller: function() {
          this.closed = !this.initiallyOpen;
          this.toggle = function (clickedElement) {
            this.closed = !this.closed;
          };
        },
        transclude: true,
        scope: {
          title: '@',
          initiallyOpen: '='
        }
      }
    }
  );
}
