'use strict';

import template from './sample.tmpl.html!text'

var DataSamplingController = ['$state', 'config', 'RestService', 'CacheService',
function DataSamplingController($state, config, RestService, CacheService) {

  this.database = $state.params.database;
  this.measurement = $state.params.measurement;

  this.numberOfDataPoints = 100;

  this.queryWhere = CacheService.get('QueryWhere:', `${this.database}/${this.measurement}`) || '';

  this.reloadQuery = () => {
    if(this.database == "null" || this.database == "0" || !this.database) {
      this.database = null;
      RestService.influxDbQuery(null, 'SHOW DATABASES')
      .then(result => {
        this.series = result.results[0].series[0];
      });
    } else if(this.measurement == "null" || this.measurement == "0" || !this.measurement) {
      this.measurement = null;
      RestService.influxDbQuery(this.database, 'SHOW MEASUREMENTS')
      .then(result => {
        this.series = result.results[0].series[0];
      });
    } else {
      var cached = CacheService.get('Sample:', `${this.database}/${this.measurement}`);
      if(cached) {
        this.series = cached;
        return
      }
      var timeIncrements = ['1s', '5s', '10s', '50s', '100s', '16m', '2h', '20h'];

      var tryNextTimeIncrement = () => {
        var timeIncrement = timeIncrements.shift();
        var queryWhere = this.queryWhere.trim();
        var whereClause = `time > now() - ${timeIncrement} ${queryWhere != '' ? 'AND ' + queryWhere : ''}`;
        var query = `select * from "${this.measurement}" where ${whereClause} limit ${this.numberOfDataPoints}`;

        RestService.influxDbQuery(this.database, query)
        .then(result => {
          var seriesLength = 0;
          if(result.results[0].series && result.results[0].series[0]) {
            seriesLength = result.results[0].series[0].values.length;
          }
          if(seriesLength < this.numberOfDataPoints && timeIncrements.length > 0) {
            tryNextTimeIncrement();
          } else {
            this.series = result.results[0].series[0];
            CacheService.set('Sample:', `${this.database}/${this.measurement}`, this.series);
            CacheService.set('SampleLineProtocol:', `${this.database}/${this.measurement}`, null);
          }
        });
      };
      tryNextTimeIncrement();
    }
  };

  this.reload = () => {
    if(this.database && this.measurement && this.series) {
      CacheService.set('QueryWhere:', `${this.database}/${this.measurement}`, this.queryWhere);
      CacheService.set('Sample:', `${this.database}/${this.measurement}`, null);
      this.reloadQuery();
    }
  };

  this.formatCell = (index, data) => index == 0 ? new Date(data).toLocaleString() : data;

  this.reloadQuery();
}];

export default function registerRouteAndController($stateProvider) {
  return $stateProvider.state(
    'sample',
    {
      url: '/sample/:database/:measurement',
      template: template,
      controller: DataSamplingController,
      controllerAs: 'vm'
    }
  );
}
