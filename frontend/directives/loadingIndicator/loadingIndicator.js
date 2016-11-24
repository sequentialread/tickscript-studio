"use strict";

import template from './loadingIndicator.tmpl.html!text'

export default function registerDirective(module) {
  module.directive(
    'loadingIndicator',
    function () {
      return {
        restrict: 'E',
        template: template,
        controllerAs: "vm",
        scope: {},
        bindToController: {
          activeRequests: "="
        },
        controller: ['$timeout', function($timeout) {
          var poll = () => {
            if(this.activeRequests) {
              var now = Number(new Date());
              this.activeRequests.forEach(x => x.startDate = x.startDate || now);
              var newLongRunningRequests = this.activeRequests.filter(x => (now - x.startDate) > 2000);
              if(this.longRunningRequests.length != newLongRunningRequests.length) {
                $timeout(() => this.longRunningRequests = newLongRunningRequests, 1);
              }
            }
            setTimeout(poll, 500);
          };

          this.longRunningRequests = [];
          poll();
        }]
      }
    }
  );
}
