"use strict";
"global angular";

import registerErrorLoggingService from './errorLoggingService'
import registerRestService from './restService'
import registerCacheService from './cacheService'

var module = angular.module('client.services', []);

registerRestService(module);
registerCacheService(module);
registerErrorLoggingService(module);

export default module;
