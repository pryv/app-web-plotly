var container = document.getElementById("pryvGraphs");
var monitor;


/**
 * retrieve the registerURL from URL parameters
 */
function getRegisterURL() {
  return pryv.utility.urls.parseClientURL().parseQuery()['pryv-reg'];
}

var customRegisterUrl = getRegisterURL();
if (customRegisterUrl) {
  pryv.Auth.config.registerURL = {host: customRegisterUrl, 'ssl': true};
}

/**
 * retrieve the registerURL from URL parameters
 */
function getSettingsFromURL() {
  var settings = {
    username : pryv.utility.urls.parseClientURL().parseQuery()['username'],
    domain : pryv.utility.urls.parseClientURL().parseQuery()['domain'],
    auth: pryv.utility.urls.parseClientURL().parseQuery()['auth']
  }

  if (settings.username && settings.auth) {
    return settings;
  }

  return null;
}


var settings = getSettingsFromURL();
if (settings) {
  var connection = new pryv.Connection(settings);
  connection.fetchStructure(function () {
    setupMonitor(connection);
  });
} else {

  // Authenticate user
  var authSettings = {
      requestingAppId: 'appweb-plotly',
      requestedPermissions: [
          {
              streamId: '*',
              level: 'read'
          }
      ],
      returnURL: false,
      spanButtonID: 'pryv-button',
      callbacks: {
          needSignin: resetGraphs,
          needValidation: null,
          signedIn: function (connect) {
              connect.fetchStructure(function () {
                  setupMonitor(connect);
              });
          }
      }
  };

  pryv.Auth.setup(authSettings);
}

// MONITORING
// Setup monitoring for remote changes
function setupMonitor(connection) {
    var filter = new pryv.Filter();
    monitor = connection.monitor(filter);

    // should be false by default, will be updated in next lib version
    // to use fullCache call connection.ensureStructureFetched before
    monitor.ensureFullCache = false;
    monitor.initWithPrefetch = 0; // default = 100;

    // get notified when monitoring starts
    monitor.addEventListener(pryv.MESSAGES.MONITOR.ON_LOAD, function (events) {
        updateGraph(events);

    });

    // get notified when data changes
    monitor.addEventListener(pryv.MESSAGES.MONITOR.ON_EVENT_CHANGE, function (changes) {
        updateGraph(changes.created);
    });

    // start monitoring
    monitor.start(function (err) {
    });
}

// GRAPHS
var graphs = {};




var presets = { 
  'biovotion-bpm_frequency/bpm' : {
    gaps: 30,
    bundleKey : 'toto',
    trace: {
      name: 'Heart rate',
      mode: 'lines',
      connectgaps: false,
      type: 'scatter'
    }
  },
  'biovotion-bpm_pressure/mmhg' : {
    gaps: 30,
    bundleKey : 'toto',
    trace: {
      name: 'SPO2',
      mode: 'lines',
      connectgaps: false,
      type: 'scatter'
    }
  }

};

var bundles = {
  toto : {
    title : 'TOTO'
  }


};



function getDateString(timestamp) {
  var date = new Date(timestamp);
  return date.toISOString().substring(0, 10) + ' '
    + date.toISOString().substring(11, 19) + '.' + date.getMilliseconds();
}

function createGraph(event) {
  var graphKey = event.streamId + '_' + event.type;

  if (! pryv.eventTypes.isNumerical(event)) {
    graphs[graphKey] = { ignore : true};
    return;
  }

  var extraType = pryv.eventTypes.extras(event.type);

  var titleY = extraType.symbol ? extraType.symbol : event.type;


  var title = '';
  event.stream.ancestors.forEach(function (ancestor) { 
     title += ancestor.name + '/';
  });
  title += event.stream.name;

  console.log(graphKey);

  graphs[graphKey] = {
    bundleKey: graphKey,
    type: event.type,
    streamId: event.streamId + ' ' + titleY,
    last: event.timeLT,
    gaps: null,
    trace: {},
    layout : {
      title: title,
      xaxis1: {
        rangeselector: selectorOptions,
        title: 'Time',
        showticklabels : true
      }
    }
  };

  if (presets[graphKey]) {
    _.extend(graphs[graphKey], presets[graphKey]);
  }

  graphs[graphKey].trace.x = [1];
  graphs[graphKey].trace.y = [1];


  if (! bundles[graphs[graphKey].bundleKey] || ! bundles[graphs[graphKey].bundleKey].num) {



    var graph = document.createElement('div');
    graph.setAttribute('id', graphs[graphKey].bundleKey);
    container.appendChild(graph);

    if (bundles[graphs[graphKey].bundleKey]) {
      graphs[graphKey].title = bundles[graphs[graphKey].bundleKey].title;
      bundles[graphs[graphKey].bundleKey].num = 1;
    }

    Plotly.newPlot(graphs[graphKey].bundleKey, [],
      graphs[graphKey].layout);


    Plotly.relayout(graphs[graphKey].bundleKey, {
      yaxis1 : {
        title : titleY,
        side: 'left',
      }
    });
    Plotly.addTraces(graphs[graphKey].bundleKey, [graphs[graphKey].trace]);

  } else {

    var num = ++bundles[graphs[graphKey].bundleKey].num;
    var update = {};
    update['yaxis' + num] = {
      title : titleY,
      side: 'right',
      overlaying: 'y'
    };

    console.log(update, bundles[graphs[graphKey].bundleKey]);


    graphs[graphKey].trace['yaxis'] = 'y' + num;
    Plotly.relayout(graphs[graphKey].bundleKey, update);
    Plotly.addTraces(graphs[graphKey].bundleKey, [graphs[graphKey].trace]);
  }


}




function updateGraph(events) {
    // needed ?
    events = events.sort(function (a, b) {
      return a.time - b.time;
    });

    var toRedraw = {};

    events.map(function (event) {
      var graphKey = event.streamId + '_' + event.type;
      if (! graphs[graphKey]) { // create New Trace
        createGraph(event);
      }

      if (! graphs[graphKey].ignore) {


        if (graphs[graphKey].gaps) {
          if ((event.timeLT - graphs[graphKey].last) > graphs[graphKey].gaps * 1000) {
            graphs[graphKey].trace.x.push(getDateString(graphs[graphKey].last + 1));
            graphs[graphKey].trace.y.push(null);
          }
        }

        graphs[graphKey].trace.x.push(getDateString(event.timeLT));
        graphs[graphKey].trace.y.push(event.content);

        graphs[graphKey].last = event.timeLT;

        toRedraw[graphKey] = true;
      }

    });

     Object.keys(toRedraw).forEach(function (graphKey) {
         Plotly.redraw(graphs[graphKey].bundleKey);
     });
};



function resetGraphs() {
    if (monitor) {
        monitor.destroy();
    }
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}


// *** Plotly designs ***  //
var selectorOptions = {
  buttons: [{
    step: 'month',
    stepmode: 'backward',
    count: 1,
    label: '1m'
  }, {
    step: 'month',
    stepmode: 'backward',
    count: 6,
    label: '6m'
  }, {
    step: 'year',
    stepmode: 'todate',
    count: 1,
    label: 'YTD'
  }, {
    step: 'year',
    stepmode: 'backward',
    count: 1,
    label: '1y'
  }, {
    step: 'all',
  }],
};
