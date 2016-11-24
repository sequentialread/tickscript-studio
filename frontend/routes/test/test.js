'use strict';

import template from './test.tmpl.html!text'
//import waitForKapacitorModalTemplate from './waitForKapacitorModal.tmpl.html!text'
import enterUsernameTemplate from './enterUsernameModal.tmpl.html!text'

var TICKScriptTestingController = ['$state', '$uibModal', '$interval', '$timeout', 'config', 'RestService', 'CacheService',
function TICKScriptTestingController($state, $uibModal, $interval, $timeout, config, RestService, CacheService) {

  this.database = $state.params.database;
  this.measurement = $state.params.measurement;
  this.editSampleMode = $state.params.isCustom == "custom";

  this.userId = CacheService.get('Lock:','userId');
  this.userName = CacheService.get('Lock:','userName');

  var guid = () => {
    var s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  };

  if(!this.userId) {
    this.userId = guid();
    CacheService.set('Lock:','userId', this.userId);
  }

  if(!this.userName && this.database && this.measurement) {
    this.getUserNameModal = $uibModal.open({
      template: enterUsernameTemplate,
      backdrop: 'static',
      keyboard: false,
      controllerAs: 'vm',
      controller: ['$uibModalInstance', function($uibModalInstance) {
        this.ok = () => {
          $uibModalInstance.close(this.userName);
        }
      }],
      size: 'md'
    });
    this.getUserNameModal.result.then(x => {
      if(x) {
        this.userName = x;
        CacheService.set('Lock:','userName', this.userName);
      }
    });
  }

  var parsedSamples = CacheService.list('SampleLineProtocol:');
  var unparsedSamples = CacheService.list('Sample:').filter(x => !parsedSamples.some(y => x == y));

  this.samples = parsedSamples.concat(unparsedSamples);
  this.selectedSample = this.samples[0];
  this.tickMetadataObject = {
    "type": "stream",
    "dbrps": [
      {
        "db": this.database,
        "rp": ""
      }
    ],
    "script": "$SCRIPT",
    "status": "enabled"
  };

  this.getSampleName = () => `${this.database}/${this.measurement}${this.editSampleMode ? '/custom' : ''}`;

  var loadFromSampleLineProtocol = (selectedSample) => {
    var json = CacheService.get('SampleLineProtocol:', selectedSample);
    if(json) {
      var lineProtocolAndMetadata = JSON.parse(json);
      this.sampleLineProtocol = lineProtocolAndMetadata.sampleLineProtocol;
      this.tags = lineProtocolAndMetadata.tags;
      this.metrics = lineProtocolAndMetadata.metrics;
    }
  };

  var saveSampleLineProtocol = (saveAsSample) => {
    CacheService.set(
      'SampleLineProtocol:',
      saveAsSample,
      JSON.stringify({
        sampleLineProtocol: this.sampleLineProtocol,
        tags: this.tags,
        metrics: this.metrics
      })
    );
  };

  this.init = () => {
    if(!this.database || !this.measurement) {
      this.selectedSampleChanged();
    }
    if(this.database && this.measurement) {
      var sampleName = this.getSampleName();
      if(CacheService.get('Sample:', sampleName) || CacheService.get('SampleLineProtocol:', sampleName)) {
        this.selectedSample = sampleName;

        this.tickScript = CacheService.get('Script:', this.selectedSample) || '';

        loadFromSampleLineProtocol(this.selectedSample);

        var hasSampleLineProtocol = Promise.resolve();

        if(!this.sampleLineProtocol) {
          hasSampleLineProtocol = convertSampleToLineProtocolFormat(
            CacheService.get('Sample:', this.selectedSample)
          ).then(result => {
            this.sampleLineProtocol = result;
            saveSampleLineProtocol(this.selectedSample);
          });

        }

        this.tickMetadataObject.dbrps.forEach(x => x.db = this.database)
        this.tickMetadata = JSON.stringify(this.tickMetadataObject, null, 2);
        this.tickMetadataErrorMessage = "";

      }
    }
  };

  var convertSampleToLineProtocolFormat = (data) => {

    return Promise.all([
      RestService.influxDbQuery(this.database, `SHOW TAG KEYS FROM "${this.measurement}"`),
      RestService.influxDbQuery(this.database, `SHOW FIELD KEYS FROM "${this.measurement}"`)
    ]).then(results => {
      var tagKeys = results[0].results[0];
      var fieldKeys = results[1].results[0];
      var tagKeysResult = tagKeys.series ? tagKeys.series[0].values.map(x => x[0]) : [];
      var fieldKeysResult = fieldKeys.series ? fieldKeys.series[0].values.map(x => x[0]) : [];

      var influxEscape = (s) => {
        return String(s).replace(',', '\\,')
          .replace('=', '\\=')
          .replace(' ', '\\ ')
          .replace('"', '\\"');
      };

      return data.values.map(row => {

        var dateNs = new Date(row.shift()).getTime() * 1000000;

        var rowWithNameValue = row.map((x,i) => ({name:data.columns[i+1], value: x}))
          .filter(x => x.value !== null && x.value !== '');

        var nameValueToInfluxKV = (x) => `${influxEscape(x.name)}=${influxEscape(x.value)}`;

        this.tags = rowWithNameValue.filter(x => tagKeysResult.indexOf(x.name) != -1);
        this.metrics = rowWithNameValue.filter(x => fieldKeysResult.indexOf(x.name) != -1);

        var tagsLineProtocol = this.tags.map(nameValueToInfluxKV).join(',');
        var metricsLineProtocol = this.metrics.map(nameValueToInfluxKV).join(',');

        return `${influxEscape(this.measurement)}${tagsLineProtocol.length ? ',' : ''}${tagsLineProtocol} ${metricsLineProtocol} ${dateNs}`;
      }).join('\n');
    });


  };

  var navigateToOtherSample = (params) => {
    if(this.getUserNameModal) {
      this.getUserNameModal.close(null);
      this.getUserNameModal = null;
    }
    $state.go('test', params);
  };

  this.editSample = () => {
    this.editSampleMode = true;
    var newSelectedSample = this.getSampleName();
    if(!CacheService.get('SampleLineProtocol:', newSelectedSample)) {
      CacheService.set('Script:', newSelectedSample, this.tickScript);
      saveSampleLineProtocol(newSelectedSample);
    }
    navigateToOtherSample({
      database:this.database,
      measurement:this.measurement,
      isCustom:'custom'
    });
  };

  this.sampleLineProtocolChanged = () => {
    saveSampleLineProtocol(this.selectedSample);
  };

  this.selectedSampleChanged = () => {
    if(this.selectedSample != this.getSampleName()) {
      var dbMeasurement = this.selectedSample.split('/');
      navigateToOtherSample({
        database:dbMeasurement[0],
        measurement:dbMeasurement[1],
        isCustom:dbMeasurement[2]
      });
      return;
    }
  };

  this.tickScriptChanged = () => {
    if(this.selectedSample) {
      CacheService.set('Script:', this.selectedSample, this.tickScript);
    }
  };

  this.tickMetadataChanged = () => {
    this.tickMetadataErrorMessage = "";
    var newTickMetadataObject = null;
    try {
      newTickMetadataObject = JSON.parse(this.tickMetadata);
    } catch(err) {
      this.tickMetadataErrorMessage = `${err.name || ''} ${err.message} `;
    }

    if(this.tickMetadataErrorMessage == "") {
      this.tickMetadataObject = newTickMetadataObject;
    }
  };

  this.stopPollingNow = () => {
    if(this.eventuallyStopPolling) {
      $timeout.cancel(this.eventuallyStopPolling);
      this.eventuallyStopPolling = null;
    }
    if(this.polling) {
      $interval.cancel(this.polling);
      this.polling = null;
    }

    return RestService.wrapperDelete('/kapacitorLock?id='+this.userId+'&name='+this.userName)
  };

  this.test = () => {
    if(this.tickMetadataErrorMessage != "") {
      return;
    }

    var waitForOneSecond = () => {
      return new Promise((resolve, reject) => {
        $timeout(resolve, 500);
      });
      // return $uibModal.open({
      //   template: waitForKapacitorModalTemplate,
      //   backdrop: 'static',
      //   keyboard: false,
      //   controller: ['$timeout', '$uibModalInstance', function($timeout, $uibModalInstance) {
      //     )
      //   }],
      //   size: 'md'
      // }).result;
    };

    $rootScope.activeRequests.push({id:'preparingKapacitorForTest'});

    var stopCurrentPolling = Promise.resolve();
    if(this.eventuallyStopPolling) {
      stopCurrentPolling = this.stopPollingNow();
    }

    stopCurrentPolling
    .then(() => RestService.wrapperGet('/kapacitorLock?id='+this.userId+'&name='+this.userName))
    .then(
      () => {
        this.kapacitorLogs = '';
        this.output = [];
        this.alerts =  [];
        this.graphUrl = null;
        return Promise.all([
          RestService.kapacitorGet('kapacitor/v1/tasks'),
          RestService.wrapperDelete("/output"),
          RestService.wrapperDelete("/alerts")
        ]);
      },
      () => {
        // catch if the lock fails, then re-throw the rejection as a special symbol so we can ignore it later!
        return Promise.reject('lockRejected');
      }
    )
    .then(results => {
      return Promise.all(
        results[0].tasks.map(x => RestService.kapacitorDelete('kapacitor/v1/tasks/'+x.id))
      );
    })
    .then(waitForOneSecond)
    .then(() => RestService.wrapperDelete("/kapacitorLogs"))
    .then(() => {
      var payload = JSON.parse(this.tickMetadata);
      payload.script = this.tickScript;
      return RestService.kapacitorPost('kapacitor/v1/tasks', payload);
    })
    .then(waitForOneSecond)
    .then(() => {
      return RestService.kapacitorPost('write?db='+this.database+'&rp=', this.sampleLineProtocol, {binaryBody:true});
    })
    .then(waitForOneSecond)
    .then(() => {
      window.scrollTo(0,document.body.scrollHeight);

      var pollForResults = () => {
        return Promise.all([
          RestService.wrapperPoll("/kapacitorLogs"),
          RestService.wrapperPoll("/output"),
          RestService.wrapperPoll("/alerts")
        ]).then(results => {
            this.kapacitorLogs = results[0];
            this.output = results[1];
            this.alerts =  results[2];
            this.graphUrl = '/graph.svg?cacheBust='+Math.random();
        });
      };
      pollForResults();

      this.polling = $interval(pollForResults, 1000*2);
      this.eventuallyStopPolling = $timeout(() => {
        $interval.cancel(this.polling);
        this.polling = null;
        this.eventuallyStopPolling = null;
      }, 1000*60);

      $rootScope.activeRequests = $rootScope.activeRequests.filter(x => x.id != 'preparingKapacitorForTest');
    })
    .catch(result => {
      $rootScope.activeRequests = $rootScope.activeRequests.filter(x => x.id != 'preparingKapacitorForTest');
      if(result != 'lockRejected') {
        return this.stopPollingNow();
      }
    });

  };

  this.getBlockQuoteColorStyle = (color) => {
    var mappedColor = {
      'good': 'green',
      'warning': 'orange',
      'danger': 'red'
    }[color];
    return {
      'border-left': '5px solid ' + (mappedColor || color)
    };
  };

  this.init();
}];

export default function registerRouteAndController($stateProvider) {
  return $stateProvider.state(
    'test',
    {
      url: '/test/:database/:measurement/:isCustom',
      template: template,
      controller: TICKScriptTestingController,
      controllerAs: 'vm'
    }
  );
}
