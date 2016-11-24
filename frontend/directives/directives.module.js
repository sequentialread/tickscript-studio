"use strict";
"global angular";

import registerHeader from './header/header'
import registerSpoiler from './spoiler/spoiler'
import registerLoadingIndicator from './loadingIndicator/loadingIndicator'
import registerInfluxRowSet from './influxRowSet/influxRowSet'

var module = angular.module('client.directives', []);

registerHeader(module);
registerSpoiler(module);
registerLoadingIndicator(module);
registerInfluxRowSet(module);

export default module;
