/**
 * @namespace the SolarNetwork namespace
 * @require d3 3.0
 * @require queue 1.0
 */
var sn = {
	version : '0.0.3',
	
	config : {
		debug : false,
		host : 'data.solarnetwork.net',
		tls : (function() {
			return (window !== undefined 
				&& window.location.protocol !== undefined 
				&& window.location.protocol.toLowerCase().indexOf('https') === 0 ? true : false);
		})(),
		path : '/solarquery',
		solarUserPath : '/solaruser',
		secureQuery : false
	},
	
	colors : {
		steelblue: ['#356287', '#4682b4', '#6B9BC3', '#89AFCF', '#A1BFD9', '#B5CDE1', '#DAE6F0'],
		triplets : [
			'#3182bd', '#6baed6', '#9ecae1', 
			'#e6550d', '#fd8d3c', '#fdae6b', 
			'#31a354', '#74c476', '#a1d99b', 
			'#756bb1', '#9e9ac8', '#bcbddc', 
			'#843c39', '#ad494a', '#d6616b', 
			'#8c6d31', '#bd9e39', '#e7ba52', 
			'#7b4173', '#a55194', '#ce6dbd'
			]
	},
	
	// parse URL parameters into sn.env
	// support passing nodeId and other values as URL parameter, e.g. ?nodeId=11
	env : (function() {
			var env = {};
			if ( window !== undefined && window.location.search !== undefined ) {
				var match = window.location.search.match(/\w+=[^&]+/g);
				var i;
				var keyValue;
				if ( match !== null ) {
					for ( i = 0; i < match.length; i++ ) {
						keyValue = match[i].split('=', 2);
						env[keyValue[0]] = keyValue[1];
					}
				}
			}
			return env;
		})(),
		
	setDefaultEnv : function(defaults) {
		var prop = undefined;
		for ( prop in defaults ) {
			if ( sn.env[prop] === undefined ) {
				sn.env[prop] = defaults[prop];
			}
		}
	},
	
	setEnv : function(env) {
		var prop = undefined;
		for ( prop in env ) {
			sn.env[prop] = env[prop];
		}
	},

	runtime : {},
	
	dateTimeFormat : d3.time.format.utc("%Y-%m-%d %H:%M"),

	dateTimeFormatLocal : d3.time.format("%Y-%m-%d %H:%M"),

	dateTimeFormatURL : d3.time.format.utc("%Y-%m-%dT%H:%M"),
	
	dateFormat : d3.time.format.utc("%Y-%m-%d"),
	
	// fmt(string, args...): helper to be able to use placeholders even on iOS, where console.log doesn't support them
	fmt : function() {
		var formatted = arguments[0];
		for (var i = 1; i < arguments.length; i++) {
			var regexp = new RegExp('\\{'+(i-1)+'\\}', 'gi');
			var replaceValue = arguments[i];
			if ( replaceValue instanceof Date ) {
				replaceValue = (replaceValue.getUTCHours() === 0 && replaceValue.getMinutes() === 0 
					? sn.dateFormat(replaceValue) : sn.dateTimeFormat(replaceValue));
			}
			formatted = formatted.replace(regexp, replaceValue);
		}
		return formatted;
	},
	
	log : function() {
		if ( sn.config.debug === true && console !== undefined ) {
			console.log(sn.fmt.apply(this, arguments));
		}
	},
	
	/**
	 * Register a node URL helper function for the given name.
	 */
	registerNodeUrlHelper : function(name, helper) {
		if ( sn.env.nodeUrlHelpers === undefined ) {
			sn.env.nodeUrlHelpers = {};
		}
		sn.env.nodeUrlHelpers[name] = helper;
	},
	
	counter : function() {
		var c = 0;
		var obj = function() {
			return c;
		};
		obj.incrementAndGet = function() {
			c++;
			return c;
		};
		return obj;
	},
	
	/**
	 * Return an array of colors for a set of unique keys, where the returned
	 * array also contains associative properties for all key values to thier
	 * corresponding color value.
	 * 
	 * <p>This is designed so the set of keys always map to the same color, 
	 * even across charts where not all sources may be present.</p>
	 */
	colorMap : function(fillColors, keys) {
		var colorRange = d3.scale.ordinal().range(fillColors);
		var colorData = keys.map(function(el, i) { return {source:el, color:colorRange(i)}; });
		
		// also provide a mapping of sources to corresponding colors
		var i, len;
		for ( i = 0, len = colorData.length; i < len; i++ ) {
			// a source value might actually be a number string, which JavaScript will treat 
			// as an array index so only set non-numbers here
			var sourceName = colorData[i].source;
			if ( sourceName === '' ) {
				// default to Main if source not provided
				sourceName = 'Main';
			}
			if ( isNaN(Number(sourceName)) ) {
				colorData[sourceName] = colorData[i].color;
			}
		}
		
		return colorData;
	},
	
	/**
	 * Use the configured runtime color map to turn a source into a color.
	 * 
	 * The {@code sn.runtime.colorData} property must be set to a color map object
	 * as returned by {@link sn.colorMap}.
	 * 
	 * @param {object} d the data element, expected to contain a {@code source} property
	 * @param {number} i the data index
	 * @returns {string} color value
	 */
	colorFn : function(d, i) {
		var s = Number(d.source);
		if ( isNaN(s) ) {
			return sn.runtime.colorData[d.source];
		}
		return sn.runtime.colorData.reduce(function(c, obj) {
			return (obj.source === d.source ? obj.color : c);
		}, sn.runtime.colorData[0].color);
	}
};

/**
 * Take SolarNetwork raw JSON data result and return a d3-friendly normalized array of data.
 * The 'sources' parameter can be either undefined or an empty Array, which will be populated
 * with the list of found {@code sourceId} values from the raw JSON data. 
 * 
 * The {@code rawData} is organized like this:
 * 
 * <pre>
 * [
 * 	{
 * 		"localDate" : "2011-12-02",
 * 		"localTime" : "12:00",
 * 		"sourceId" : "Main",
 * 		"wattHours" : 470.0,
 * 		"watts" : 592
 * 	},
 * 	{
 * 		"localDate" : "2011-12-02",
 * 		"localTime" : "12:00",
 * 		"sourceId" : "Secondary",
 * 		"wattHours" : 312.0,
 * 		"watts" : 123
 * 	}
 * 
 * ]
 * </pre>
 * 
 * Returned data sample format:
 * <pre>
 * [
 * 		{
 * 			date       : Date(2011-12-02 12:00),
 * 			Main       : { watts: 592, wattHours: 470 },
 * 			Secondary  : { watts: 123, wattHours: 312 },
 * 			_aggregate : { wattHoursTotal: 782 }
 * 		}
 * ]
 * </pre>
 * 
 * @param {object[]} rawData the raw source data
 * @param {string[]} [sources] if defined, then this array will be populated with the unique
 *                             set of {@code sourceId} values found in the data
 */
sn.powerPerSourceArray = function(rawData, sources) {
	var filteredData = {};
	var sourceMap = (sources === undefined ? undefined : {});
	if ( !Array.isArray(rawData) ) {
		return filteredData;
	}
	var i, len;
	var el;
	for ( i = 0, len = rawData.length; i < len; i++ ) {
		el = rawData[i];
		var dateStr = el.localDate +' ' +el.localTime;
		var d = filteredData[dateStr];
		if ( d === undefined ) {
			d = {date:sn.dateTimeFormat.parse(dateStr)};
			filteredData[dateStr] = d;
		}
		
		// if there is no data for the allotted sample, watts === -1, so don't treat
		// that sample as a valid source ID
		var sourceName = el.sourceId;
		if ( sourceName === undefined || sourceName === '' ) {
			// default to Main if source not provided
			sourceName = 'Main';
		}
		if ( el.watts !== -1 && sourceName !== 'date' && sourceName.charAt(0) !== '_' ) {
			if ( sourceMap !== undefined && sourceMap[sourceName] === undefined ) {
				sources.push(sourceName);
				sourceMap[sourceName] = 1;
			}
			d[sourceName] = {watts:el.watts, wattHours:el.wattHours};
			if ( el.wattHours > 0 ) {
				if ( d['_aggregate'] === undefined ) {
					d['_aggregate'] = {wattHoursTotal: el.wattHours};
				} else {
					d['_aggregate'].wattHoursTotal += el.wattHours;
				}
			}
		}
	}
	
	if ( sources !== undefined ) {
		// sort sources
		sources.sort();
	}
	
	var prop = undefined;
	var a = [];
	for ( prop in filteredData ) {
		a.push(filteredData[prop]);
	}
	return a.sort(function(left,right) {
		var a = left.date.getTime();
		var b = right.date.getTime(); 
		return (a < b ? -1 : a > b ? 1 : 0);
	});
};

/**
 * Call the {@code reportableInterval} and {@code availableSources} web services
 * and post a {@code snAvailableDataRange} event with the associated data.
 * 
 * <p>The event will contain a 'data' object property with the following
 * properties:</p>
 * 
 * <dl>
 *   <dt>data.reportableInterval</dt>
 *   <dd>The reportable interval for the given dataTypes. This tells you the
 *   earliest and latest dates data is available for.</dd>
 * 
 *   <dt>data.availableSources</dt>
 *   <dd>A sorted array of available source IDs for the first data type with 
 *   any sources available for the reportable interval. This tells you all the possible 
 *   sources available in the data set.</dd>
 *   
 *   <dt>data.availableSourcesMap</dt>
 *   <dd>An object whose properties are the data types passed on the {@code dataTypes}
 *   argument, and their associated value the sorted array of available sources for
 *   that data type over the reportable interval. This tells you all the possible sources
 *   for every data type, rather than just the first data type.</dd>
 * </dl>
 * 
 * A function can be passed for the {@code helper} argument, if different helpers are
 * needed for different data sets. This might be useful if you'd like to pull Power data
 * from one node but Consumption from another, for example. It will be called first
 * without any arguments and should return a {@code sn.nodeUrlHelper} instance to use
 * for the {@link sn.nodeUrlHelper#reportableInterval()} method. Then, for each data
 * type passed in {@code dataTypes} the function will be called again with the <em>data
 * type value</em> and <em>array index</em> as parameters.
 * 
 * @param {sn.nodeUrlHelper|function} helper a URL helper instance, or a function that returns one
 * @param {string[]} dataTypes array of string data types, e.g. 'Power' or 'Consumption'
 */
sn.availableDataRange = function(helper, dataTypes) {
	var urlHelperFn = helper;
	if ( urlHelperFn.reportableInterval !== undefined ) {
		// just turn into a function that returns helper
		urlHelperFn = function() { return helper; };
	}
	
	// if nodeId same for all data types, we can issue a single query, otherwise one query per node ID
	var numRangeQueries = 0;
	var lastNodeId = undefined;
	
	var q = queue();
	var sourcesRequests = [];
	dataTypes.forEach(function(e, i) {
		var urlHelper = urlHelperFn(e, i);
		if ( urlHelper.nodeId() !== lastNodeId ) {
			q.defer(d3.json, urlHelper.reportableInterval(dataTypes));
			lastNodeId = urlHelper.nodeId();
			numRangeQueries++;
		}
		sourcesRequests.push(urlHelperFn(e, i).availableSources(e));
	});
	sourcesRequests.forEach(function(e) {
		q.defer(d3.json, e);
	});
	
	function extractReportableInterval(results) {
		var result = undefined;
		var i = -1;
		while ( ++i < numRangeQueries ) {
			var repInterval = results[i];
			if ( repInterval.data === undefined || repInterval.data.endDate === undefined ) {
				sn.log('No data available for node {0}: {1}', urlHelperFn(dataTypes[i], i).nodeId(), (error ? error : 'unknown reason'));
				continue;
			}
			repInterval = repInterval.data;
			if ( result === undefined ) {
				result = repInterval;
			} else {
				// merge start/end dates
				if ( repInterval.endDateMillis > result.endDateMillis ) {
					result.endDateMillis = repInterval.endDateMillis;
				}
				if ( repInterval.startDateMillis < result.startDateMillis ) {
					result.startDateMillis = repInterval.startDateMillis;
				}
			}
		}
		return result;
	}
	
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting available data range: ' +error);
			return;
		}
		/*var repInterval = results[0];
		if ( repInterval.data === undefined || repInterval.data.endDate === undefined ) {
			sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
			return;
		}*/

		// turn start/end date strings into actual Date objects;
		// NOTE: we use the date strings here, rather than the available *DateMillis values, because the date strings
		//       are formatted in the node's local time zone, which allows the chart to display the data in OTHER
		//       time zones as if it were also in the node's local time zone.
		var intervalObj = extractReportableInterval(results);// repInterval.data;
		if ( intervalObj.startDate !== undefined ) {
			intervalObj.sDate = sn.dateTimeFormat.parse(intervalObj.startDate);
			intervalObj.sLocalDate = sn.dateTimeFormatLocal.parse(intervalObj.startDate);
		}
		if ( intervalObj.endDate !== undefined ) {
			intervalObj.eDate = sn.dateTimeFormat.parse(intervalObj.endDate);
			intervalObj.eLocalDate = sn.dateTimeFormatLocal.parse(intervalObj.endDate);
		}

		var evt = document.createEvent('Event');
		evt.initEvent('snAvailableDataRange', true, true);
		evt.data = {
				reportableInterval : intervalObj,
				availableSourcesMap : {} // mapping of data type -> sources
		};

		// now extract sources, which start at index numRangeQueries
		var i = numRangeQueries, len = results.length;
		var response;
		for ( ; i < len; i++ ) {
			response = results[i];
			if ( response.success !== true || Array.isArray(response.data) !== true || response.data.length < 1 ) {
				sn.log('No sources available for node {0} data type {1}', urlHelperFn(dataTypes[i - numRangeQueries], i - numRangeQueries).nodeId(), dataTypes[i - numRangeQueries]);
				continue;
			}
			response.data.sort();
			if ( evt.data.availableSources === undefined ) {
				// add as "default" set of sources, for the first data type
				evt.data.availableSources = response.data;
			}
			evt.data.availableSourcesMap[dataTypes[i-numRangeQueries]] = response.data;
		}
		document.dispatchEvent(evt);
	});
};

sn.colorDataLegendTable = function(containerSelector, colorData, clickHandler, labelRenderer) {
	// add labels based on available sources
	var table = d3.select(containerSelector).selectAll('table').data([0]);
	table.enter().append('table').append('tbody');
	
	var labelTableRows = table.select('tbody').selectAll('tr').data(colorData);
	
	var newLabelTableRows = labelTableRows.enter().append('tr');
	
	labelTableRows.exit().remove();
			
	if ( clickHandler ) {
		// attach the event handler for 'click', and add the 'clickable' class
		// so can be styled appropriately (e.g. cursor: pointer)
		newLabelTableRows.on('click', clickHandler).classed('clickable', true);
	}
	
	if ( labelRenderer === undefined ) {
		// default way to render labels is just a text node
		labelRenderer = function(s) {
			s.text(Object);
		};
	}	
	var swatches = labelTableRows.selectAll('td.swatch')
		.data(function(d) { return [d.color]; })
			.style('background-color', Object);
	swatches.enter().append('td')
				.attr('class', 'swatch')
				.style('background-color', Object);
	swatches.exit().remove();
			
	var descriptions = labelTableRows.selectAll('td.desc')
		.data(function(d) { return [(d.source === '' ? 'Main' : d.source)]; })
			.call(labelRenderer);
	descriptions.enter().append('td')
			.attr('class', 'desc')
			.call(labelRenderer);
	descriptions.exit().remove();
};

/**
 * A node-specific URL utility object.
 * 
 * @class
 * @constructor
 * @param nodeId {Number} the node ID to use
 * @returns {sn.nodeUrlHelper}
 */
sn.nodeUrlHelper = function(nodeId) {
	var hostURL = function() {
		return ('http' +(sn.config.tls === true ? 's' : '') +'://' +sn.config.host);
	};
	var baseURL = function() {
		return (hostURL() +sn.config.path +'/api/v1/' +(sn.config.secureQuery === true ? 'sec' : 'pub'));
	};
	var helper = { 
		
		nodeId : function() { return nodeId; },
		
		hostURL : hostURL,
		
		baseURL : baseURL,
		
		reportableInterval : function(types) {
			var t = (Array.isArray(types) && types.length > 0 ? types : ['Power']);
			var url = (baseURL() +'/range/interval?nodeId=' +nodeId
					+ '&' +t.map(function(e) { return 'types='+encodeURIComponent(e); }).join('&'));
			return url;
		},
		
		availableSources : function(type, startDate, endDate) {
			var url = (baseURL() +'/range/sources?nodeId=' +nodeId
						+ '&type=' +encodeURIComponent(type !== undefined ? type : 'Power'));
			if ( startDate !== undefined ) {
				url += '&start=' +encodeURIComponent(sn.dateFormat(startDate));
			}
			if ( endDate !== undefined ) {
				url += '&end=' +encodeURIComponent(sn.dateFormat(endDate));
			}
			return url;
		},
		
		/**
		 * Generate a SolarNet {@code /datum/query} URL.
		 * 
		 * @param type {String} a single supported datum type, or an Array of datum types, to query for
		 * @param startDate {Date} the starting date for the query
		 * @param endDate {Date} the ending date for the query
		 * @param agg {String} a supported aggregate type
		 * @return {String} a URL string
		 */
		dateTimeQuery : function(type, startDate, endDate, agg, opts) {
			var types = (Array.isArray(type) ? type : [type]);
			types.sort();
			var eDate = (opts !== undefined && opts.exclusiveEndDate === true ? d3.time.second.utc.offset(endDate, -1) : endDate);
			var dataURL = (baseURL() +'/datum/query?nodeId=' +nodeId 
                    		+'&type=' +encodeURIComponent(type.toLowerCase())
                    		+'&startDate=' +encodeURIComponent(sn.dateTimeFormatURL(startDate))
							+'&endDate=' +encodeURIComponent(sn.dateTimeFormatURL(eDate)));
			var aggNum = Number(agg);
			if ( !isNaN(agg) ) {
				dataURL += '&precision=' +aggNum.toFixed(0);
			} else if ( typeof agg === 'string' && agg.length > 0 ) {
				dataURL += '&aggregate=' + encodeURIComponent(agg);
			}
			return dataURL;
		},
		
		mostRecentQuery : function(type) {
			type = (type === undefined ? 'power' : type.toLowerCase());
			var url;
			if ( type === 'weather' ) {
				url = (baseURL() + '/weather/recent?nodeId=');
			} else {
				url = (baseURL() + '/datum/mostRecent?nodeId=');
			}
			url += nodeId;
			if ( type !== 'weather' ) {
				url += '&type=' + encodeURIComponent(type);
			}
			return url;
		},
		
		nodeDashboard : function(source) {
			return ('http://' +sn.config.host +'/solarviz/node-dashboard.do?nodeId=' +nodeId
				 +(source === undefined ? '' : '&consumptionSourceId='+source));
		}
	};
	
	// this is a stand-alone function so we correctly capture the 'prop' name in the loop below
	function setupProxy(prop) {
		helper[prop] = function() {
			return sn.env.nodeUrlHelpers[prop].apply(helper, arguments);
		};
	}
	
	// allow plug-ins to supply URL helper methods, as long as they don't override built-in ones
	if ( sn.env.nodeUrlHelpers !== undefined ) {
		var prop = undefined;
		for ( prop in sn.env.nodeUrlHelpers ) {
			if ( helper[prop] !== undefined || typeof sn.env.nodeUrlHelpers[prop] !== 'function' ) {
				continue;
			}
			setupProxy(prop);
		}
	}
	
	return helper;
};

/**
 * A configuration utility object.
 * 
 * @class
 * @constructor
 * @param {Object} initialMap the initial properties to store (optional)
 * @returns {sn.Configuration}
 */
sn.Configuration = function(initialMap) {
	this.map = {};
	if ( initialMap !== undefined ) {
		(function() {
			var prop = undefined;
			for ( prop in initialMap ) {
				map[prop] = initialMap[prop];
			}
		})();
	}
};
sn.Configuration.prototype = {
	/**
	 * Test if a key is enabled, via the {@link #toggle} function.
	 * 
	 * @param {String} key the key to test
	 * @returns {Boolean} <em>true</em> if the key is enabled
	 */
	enabled : function(key) {
		if ( key === undefined ) {
			return false;
		}
		return (this.map[key] !== undefined);
	},

	/**
	 * Set or toggle the enabled status of a given key.
	 * 
	 * <p>If the <em>enabled</em> parameter is not passed, then the enabled
	 * status will be toggled to its opposite value.</p>
	 * 
	 * @param {String} key they key to set
	 * @param {Boolean} enabled the optional enabled value to set
	 * @returns {sn.Configuration} this object to allow method chaining
	 */
	toggle : function(key, enabled) {
		var value = enabled;
		if ( key === undefined ) {
			return this;
		}
		if ( value === undefined ) {
			// in 1-argument mode, toggle current value
			value = (this.map[key] === undefined);
		}
		if ( value === true ) {
			// enable key
			this.map[key] = true;
		} else {
			// disable key (via delete)
			delete this.map[key];
		}
		return this;
	}
};

/**
 * Utility object for generating "layer" data returned from the
 * {@link sn.powerPerSourceArray} function, suitable for using with 
 * stacked charts.
 * 
 * <p>The returned object is a function, and calling the function causes 
 * a new layer data set to be calculated from the associated data array.
 * The layer data set is a 2D array, the first dimension representing 
 * individual layers and the second dimension the datum values for the
 * associated layer. The datum values are objects with <strong>x</strong>,
 * <strong>y</strong>, and <strong>y0</strong> (the stack offset value).</p>
 * 
 * <p>The returned array also has some properties defined on it:</p>
 * 
 * <dl>
 * <dt>domainX</dt><dd>A 2-element array with the minimum and maximum dates of the 
 * data set. This can be passed to the <code>d3.domain()</code> function for the 
 * <strong>x</strong> domain.</dd>
 * <dt>maxY</dt><dd>The maximum overall <strong>y</strong> coordinate value, across
 * all layers. This can be passed as the maximum value to the <code>d3.domain()</code>
 * function for the <strong>y</strong> domain.</dd>
 * </dl>
 * 
 * <p>A {@link sn.Configuration} object can be used to toggle different layers on or 
 * off in the generated data, by rendering all <strong>y</strong> coordinate values as
 * <strong>0</strong> for disabled layers. This allows the data to transition nicely
 * when toggling layer visibility.</p>
 * 
 * @param {string[]} keyValueSet  array of all possible key values, so that a stable
 *                                set of layer data can be generated
 * @param {string} valueProperty  the name of the property that contains the values to
 *                                use for the y-axis domain
 * @class
 * @constructor
 * @returns {sn.powerPerSourceStackedLayerGenerator}
 */
sn.powerPerSourceStackedLayerGenerator = function(keyValueSet, valueProperty) {
	var sources = keyValueSet;
	var excludeSources = undefined;
	var stack = d3.layout.stack();
	var dataArray = undefined;
	
	var stackedLayerData = function() {
		if ( dataArray === undefined ) return;
		var layers = stack(sources.map(function(source) {
				var array = dataArray.map(function(d) {
						return {
							x: d.date, 
							y: (excludeSources !== undefined && excludeSources.enabled(source) 
								? 0 : d[source] !== undefined ? +d[source][valueProperty] : 0),
						};
					});
				array.source = source;
				return array;
			}));
		layers.domainX = [layers[0][0].x, layers[0][layers[0].length - 1].x];
		layers.maxY = d3.max(layers[layers.length - 1], function(d) { return d.y0 + d.y; });
		return layers;
	};
	
	/**
	 * Get or set the data associated with this generator.
	 * 
	 * @param {array} data the array of data
	 * @return when used as a getter, the data array, otherwise this object
	 *         to allow method chaining
	 * @memberOf sn.powerPerSourceStackedLayerGenerator
	 */
	stackedLayerData.data = function(data) {
		if ( !arguments.length ) return dataArray;
		dataArray = data;
		return stackedLayerData;
	};
	
	/**
	 * Get or set the d3 stack offset method.
	 * 
	 * @param {string|function} [value] the offset method, e.g. <code>wiggle</code>
	 * @return the offset value when called as a getter, or this object when called as a setter
	 * @memberOf sn.powerPerSourceStackedLayerGenerator
	 */
	stackedLayerData.offset = function(value) {
		if ( !arguments.length ) return stack.offset();
		stack.offset(value);
		return stackedLayerData;
	};
	
	/**
	 * Get or set the d3 stack order method.
	 * 
	 * @param {string|function} [value] the order method, e.g. <code>inside-out</code>
	 * @return the order value when called as a getter, or this object when called as a setter
	 * @memberOf sn.powerPerSourceStackedLayerGenerator
	 */
	stackedLayerData.order = function(value) {
		if ( !arguments.length ) return stack.order();
		stack.order(value);
		return stackedLayerData;
	};
	
	/**
	 * Get or set a layer visibility configuration object.
	 * 
	 * @param excludeConfiguration {sn.Configuration} a configuration object, where the enabled status
	 *                                                of key values cause that layer to generate with
	 *                                                <strong>y</strong> values all set to <strong>0</strong>
	 * @return when used as a getter, the current configuration object, otherwise this object
	 *         to allow method chaining
	 * @memberOf sn.powerPerSourceStackedLayerGenerator
	 */
	stackedLayerData.excludeSources = function(excludeConfiguration) {
		if ( !arguments.length ) return excludeSources;
		excludeSources = excludeConfiguration;
		return stackedLayerData;
	};
	
	return stackedLayerData;
};

/**
 * @typedef sn.sourceColorMapping
 * @type {object}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * @typedef sn.sourceColorMapParameters
 * @type {object}
 * @property {function} [displayDataType] a function that accepts a data type and returns the display
 *                                        version of that data type
 * @property {function} [displayColor] a function that accepts a data type and a Colorbrewer color group
 * @property {boolean} [reverseColors] the Colorbrewer colors are reversed, unless this is set to {@code false}
 */

/**
 * Create mapping of raw sources, grouped by data type, to potentially alternate names,
 * and assign Colorbrewer color values to each source.
 * 
 * The input {@code sourceMap} should contain a mapping of data types to associatd arrays
 * of sources. This is the format returned by {@link sn.availableDataRange}, on the 
 * {@code availableSourcesMap} property. For example:
 * 
 * <pre>
 * {
 *     'Consumption' : [ 'Main', 'Shed' ],
 *     'Power' : [ 'Main' ]
 * }
 * </pre>
 * 
 * The returned {@link sn.sourceColorMapping} object contains 
 * 
 * <pre>
 * {
 *     sourceList : [ 'Consumption / Main', 'Consumption / Shed', 'Power / Main' ]
 *     displaySourceMap : {
 *         Consumption : {
 *             Main : 'Consumption / Main',
 *             Shed : 'Consumption / Shed'
 *         },
 *         Power : {
 *             Main : 'Power / Main'
 *         }
 *     },
 *     colorList : [ 'red', 'light-red', 'green' ]
 *     colorMap : {
 *         'Consumption / Main' : 'red',
 *         'Consumption / Shed' : 'light-red',
 *         'Power / Main' : 'green'
 *     }
 * }
 * </pre>
 * 
 * @params {sn.sourceColorMapParameters} [params] the parameters
 * @returns {sn.sourceColorMapping}
 */
sn.sourceColorMapping = function(sourceMap, params) {
	var p = (params || {});
	var chartSourceMap = {};
	var dataType = undefined;
	var sourceList = [];
	var colorGroup = undefined;
	var sourceColors = [];
	var typeSourceList = undefined;
	var colorGroupIndex;
	var colorSlice = undefined;
	var result = {};
	var displayDataTypeFn;
	if ( typeof p.displayDataType === 'function' ) {
		displayDataTypeFn = p.displayDataType;
	} else {
		displayDataTypeFn = function(dataType) {
			return (dataType === 'Power' ? 'Generation' : dataType);
		};
	}
	var displayColorFn;
	if ( typeof p.displayColor === 'function' ) {
		displayColorFn = p.displayColor;
	} else {
		displayColorFn = function(dataType) {
			return (dataType === 'Power' ? colorbrewer.Greens : colorbrewer.Blues);
		};
	}
	for ( dataType in sourceMap ) {
		chartSourceMap[dataType] = {};
		typeSourceList = [];
		sourceMap[dataType].forEach(function(el) {
			var mappedSource;
			if ( el === '' || el === 'Main' ) {
				mappedSource = displayDataTypeFn(dataType);
			} else {
				mappedSource = displayDataTypeFn(dataType) +' / ' +el;
			}
			chartSourceMap[dataType][el] = mappedSource;
			typeSourceList.push(mappedSource);
			sourceList.push(mappedSource);
		});
		colorGroup = displayColorFn(dataType);
		if ( typeSourceList.length < 3 ) {
			colorGroupIndex = 3;
		} else if ( colorGroup[typeSourceList.length] === undefined ) {
			colorGroupIndex = 9;
		} else {
			colorGroupIndex = typeSourceList.length;
		}
		colorSlice = colorGroup[colorGroupIndex].slice(-typeSourceList.length);
		if ( p.reverseColors !== false ) {
			colorSlice.reverse();
		}
		sourceColors = sourceColors.concat(colorSlice);
	}
	result.sourceList = sourceList;
	result.displaySourceMap = chartSourceMap;
	result.colorMap = sn.colorMap(sourceColors, sourceList);
	return result;
};

/**
 * Convert degrees to radians.
 * 
 * @param {number} deg - the degrees value to convert to radians
 * @returns {number} the radians
 */
sn.deg2rad = function(deg) {
	return deg * Math.PI / 180;
};

/**
 * Get the width of an element based on a selector, in pixels.
 * 
 * @param {string} selector - a selector to an element to get the width of
 * @returns {number} the width, or {@code undefined} if {@code selector} is undefined, 
 *                   or {@code null} if the width cannot be computed in pixels
 */
sn.pixelWidth = function(selector) {
	if ( selector === undefined ) {
		return undefined;
	}
	var styleWidth = d3.select(selector).style('width');
	if ( !styleWidth ) {
		return null;
	}
	var pixels = styleWidth.match(/(\d+)px/);
	if ( pixels === null ) {
		return null;
	}
	var result = Number(pixels[1]);
	if ( isNaN(result) ) {
		return null;
	}
	return result;
};



/**
 * @namespace the SolarNetwork chart namespace.
 */
sn.chart = {};
