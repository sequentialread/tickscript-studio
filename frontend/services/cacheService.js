



var CacheService = [function () {

  var localStorage = window.localStorage;
  var cacheNamespace = 'TICKscriptStudioCache:';

  var stringPopPrefix = (string, prefix) => {
      if(string.indexOf(prefix) == 0) {
        return string.substring(prefix.length);
      }
      return null;
  }

  this.set = (bucket, key, value) => {
    if(value === null || value === undefined) {
      localStorage.removeItem(cacheNamespace+bucket+key);
    } else {
      localStorage[cacheNamespace+bucket+key] = JSON.stringify(value);
    }
  };
  this.list = (bucket) => {
    var keys = [];
    for(var key in localStorage) {
      var keyInCache = stringPopPrefix(key, cacheNamespace);
      var realKey = keyInCache ? stringPopPrefix(keyInCache, bucket) : null;
      if(realKey) {
        keys.push(realKey);
      }
    }
    return keys;
  }
  this.get = (bucket, key) => {
    var value = localStorage[cacheNamespace+bucket+key];
  	return value ? JSON.parse(value) : null;
  };

}];

export default function registerService (module) {
  module.service('CacheService', CacheService);
}
