/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3-datum 1.1
 * @require solarnetwork-d3-sec 1.1
 */

(function() {
'use strict';

var timestampFormat = d3.time.format.utc("%Y-%m-%d %H:%M:%S.%LZ");

if ( sn.util === undefined ) {
	sn.util = {};
}

sn.util.controlToggler = function(urlHelper) {
	var self = {
		version : '1.3.0'
	};

	var timer;
	var lastKnownStatus;
	var lastKnownInstruction;
	var lastHadCredentials;
	var callback;
	var refreshMs = 20000;
	var pendingRefreshMs = 5000;
	var controlID = '/power/switch/1';
	var nodeUrlHelper = urlHelper;
	
	function notifyDelegate(error) {
		if ( callback !== undefined ) {
			try {
				callback.call(self, error);
			} catch ( callbackError ) {
				sn.log('Error in callback: {0}', callbackError);
			}
		}
	}
	
	function getActiveInstruction(data) {
		if ( !Array.isArray(data) || data.length === 0 ) {
			return undefined;
		}
		var instruction = data.reduce(function(prev, curr) {
			if ( curr.topic === 'SetControlParameter' && Array.isArray(curr.parameters)
				&& curr.parameters.length > 0 && curr.parameters[0].name === controlID
				&& (prev === undefined || prev.created < curr.created) ) {
				return curr;
			}
			return prev;
		}, undefined);
		if ( instruction !== undefined ) {
			sn.log('Active instruction for {3} found in state {0} (set control {1} to {2})', 
				instruction.state, controlID, instruction.parameters[0].value, nodeUrlHelper.keyDescription());
		}
		return instruction;
	}
	
	function lastKnownInstructionState() {
		return (lastKnownInstruction === undefined ? undefined : lastKnownInstruction.state);
	}
		
	function lastKnownInstructionValue() {
		return (lastKnownInstruction === undefined ? undefined : Number(lastKnownInstruction.parameters[0].value));
	}

	function currentRefreshMs() {
		return (['Queued','Received','Executing'].indexOf(lastKnownInstructionState()) < 0
			? refreshMs
			: pendingRefreshMs);
	}
	
	function value(desiredValue) {
		if ( !arguments.length ) return (lastKnownStatus === undefined ? undefined : lastKnownStatus.val);

    	var q = queue();
    	var currentValue = (lastKnownStatus === undefined ? undefined : lastKnownStatus.val);
    	var pendingState = lastKnownInstructionState();
    	var pendingValue = lastKnownInstructionValue();
		if ( pendingState === 'Queued' && pendingValue !== desiredValue ) {
			// cancel the pending instruction
			sn.log('Canceling {2} pending control {0} switch to {1}', controlID,  pendingValue, nodeUrlHelper.keyDescription());
			q.defer(sn.sec.json, nodeUrlHelper.updateInstructionStateURL(lastKnownInstruction.id, 'Declined'), 'POST');
			lastKnownInstruction = undefined;
			pendingState = undefined;
			pendingValue = undefined;
		}
		if ( currentValue !== desiredValue && pendingValue !== desiredValue ) {
			sn.log('Request {2} to change control {0} to {1}', controlID, desiredValue, nodeUrlHelper.keyDescription());
			q.defer(sn.sec.json, nodeUrlHelper.queueInstructionURL('SetControlParameter', 
				[{name:controlID, value:String(desiredValue)}]), 'POST');
		}
		q.awaitAll(function(error, results) {
			if ( error ) {
				sn.log('Error updating {2} control toggler {0}: {1}', controlID, error.status, nodeUrlHelper.keyDescription());
				notifyDelegate(error);
				return;
			}
			if ( results.length < 1 ) {
				// we queued nothing
				return;
			}
			var cancelResult = results[0];
			// note == null check here, which handles either undefined or null
			if ( cancelResult.data == null && cancelResult.success === true ) {
				// it was cancelled
				lastKnownInstruction = undefined;
			}
			var instructionResult = results[results.length - 1].data;
			if ( !(instructionResult == null) ) {
				// this is the last know instruction now
				lastKnownInstruction = instructionResult;
			}
			
			// invoke the client callback so they know the instruction state has changed
			notifyDelegate();
			
			// reset timer to start polling at pendingRefreshMs rate
			if ( timer ) {
				self.stop();
				self.start(currentRefreshMs());
			}
		});
		return self;
	}
	
	function mostRecentValue(controlStatus, instruction) {
		var statusDate, instructionDate;
		if ( !instruction || instruction.status === 'Declined' ) {
			return (controlStatus ? controlStatus.val : undefined);
		} else if ( !controlStatus ) {
			return Number(instruction.parameters[0].value);
		}
		// return the newer value
		statusDate = timestampFormat.parse(controlStatus.created);
		instructionDate = timestampFormat.parse(instruction.created);
		return (statusDate.getTime() > instructionDate.getTime() 
			? controlStatus.val 
			: Number(instruction.parameters[0].value));
	}
	
	function update() {
    	var q = queue();
		q.defer((nodeUrlHelper.secureQuery ? sn.sec.json : d3.json), nodeUrlHelper.mostRecentURL([controlID]));
		if ( sn.sec.hasTokenCredentials() === true ) {
			q.defer(sn.sec.json, nodeUrlHelper.viewPendingInstructionsURL(), 'GET');
			if ( lastKnownInstruction && ['Completed', 'Declined'].indexOf(lastKnownInstructionState()) < 0 ) {
				// also refresh this specific instruction, to know when it goes to Completed so we can
				// assume the control value has changed, even if the mostRecent data lags behind
				q.defer(sn.sec.json, nodeUrlHelper.viewInstruction(lastKnownInstruction.id));
			}
		}
		q.await(function(error, status, active, executing) {
			if ( error ) {
				sn.log('Error querying control toggler {0} for {2} status: {1}', controlID, error.status, nodeUrlHelper.keyDescription());
				notifyDelegate(error);
			} else {
				// get current status of control
				var i, len;
				var controlStatus = undefined;
				if ( status.data && Array.isArray(status.data.results) ) {
					for ( i = 0, len = status.data.results.length; i < len && controlStatus === undefined; i++ ) {
						if ( status.data.results[i].sourceId === controlID ) {
							controlStatus = status.data.results[i];
						}
					}
				}
				
				// get current instruction (if any)
				var execInstruction = (executing ? executing.data : undefined);
				var pendingInstruction = (active ? getActiveInstruction(active.data) : undefined);
				var newValue = (mostRecentValue(controlStatus, execInstruction ? execInstruction 
								: pendingInstruction ? pendingInstruction : lastKnownInstruction));
				var currValue = value();
				if ( (newValue !== currValue) 
					|| lastHadCredentials !==  sn.sec.hasTokenCredentials() ) {
					sn.log('Control {0} for {1} value is currently {2}', controlID, 
						nodeUrlHelper.keyDescription(),
						(newValue !== undefined ? newValue : 'N/A'));
					lastKnownStatus = controlStatus;
					if ( lastKnownStatus && !pendingInstruction ) {
						lastKnownStatus.val = newValue; // force this, because instruction value might be newer than status value
					}
					lastKnownInstruction = (execInstruction ? execInstruction : pendingInstruction);
					lastHadCredentials = sn.sec.hasTokenCredentials();
					
					// invoke the client callback so they know the data has been updated
					notifyDelegate();
				}
			}
			
			// if timer was defined, keep going as if interval set
			if ( timer !== undefined ) {
				timer = setTimeout(update, currentRefreshMs());
			}
		});

		return self;
	}
	
	/**
	 * Start automatically updating the status of the configured control.
	 * 
	 * @param {Number} when - An optional offset in milliseconds to start at, defaults to 20ms.
	 * @return this object
	 * @memberOf sn.util.controlToggler
	 */
	self.start = function(when) {
		if ( timer === undefined ) {
			timer = setTimeout(update, (when || 20));
		}
		return self;
	};
	
	/**
	 * Stop automatically updating the status of the configured control.
	 * 
	 * @return this object
	 * @memberOf sn.util.controlToggler
	 */
	self.stop = function() {
		if ( timer !== undefined ) {
			clearTimeout(timer);
			timer = undefined;
		}
		return self;
	};

	/**
	 * Get or set the control ID.
	 * 
	 * @param {String} [value] the control ID to set
	 * @return when used as a getter, the current control ID value, otherwise this object
	 * @memberOf sn.util.controlToggler
	 */
	self.controlID = function(value) {
		if ( !arguments.length ) return controlID;
		controlID = value;
		return self;
	};

	/**
	 * Get or set the refresh rate, in milliseconds.
	 * 
	 * @param {Number} [value] the millisecond value to set
	 * @return when used as a getter, the current refresh millisecond value, otherwise this object
	 * @memberOf sn.util.controlToggler
	 */
	self.refreshMs = function(value) {
		if ( !arguments.length ) return refreshMs;
		if ( typeof value === 'number' ) {
			refreshMs = value;
		}
		return self;
	};

	/**
	 * Get or set the refresh rate, in milliseconds, when a toggle instruction is queued.
	 * 
	 * @param {Number} [value] the millisecond value to set
	 * @return when used as a getter, the current refresh millisecond value, otherwise this object
	 * @memberOf sn.util.controlToggler
	 * @since 1.2
	 */
	self.pendingRefreshMs = function(value) {
		if ( !arguments.length ) return pendingRefreshMs;
		if ( typeof value === 'number' ) {
			pendingRefreshMs = value;
		}
		return self;
	};

	/**
	 * Get or set the {@link sn.datum.nodeUrlHelper} to use.
	 * 
	 * @param {Object} [value] the {@link sn.datum.nodeUrlHelper} to set
	 * @return when used as a getter, the current helper value, otherwise this object
	 * @memberOf sn.util.controlToggler
	 */
	self.nodeUrlHelper = function(value) {
		if ( !arguments.length ) return nodeUrlHelper;
		nodeUrlHelper = value;
		return self;
	};

	/**
	 * Get or set the callback function, which is called after the state of the control changes.
	 * The `this` reference will be set to this object.
	 * 
	 * @param {function} [value] the callback
	 * @return when used as a getter, the current callback function, otherwise this object
	 * @memberOf sn.util.controlToggler
	 */
	self.callback = function(value) {
		if ( !arguments.length ) return callback;
		if ( typeof value === 'function' ) {
			callback = value;
		}
		return self;
	};
	
	Object.defineProperties(self, {
		pendingInstructionState : { value : lastKnownInstructionState }, // deprecated, use lastKnownInstructionState
		pendingInstructionValue : { value : lastKnownInstructionValue }, // deprecated, use lastKnownInstructionValue
		lastKnownInstructionState : { value : lastKnownInstructionState },
		lastKnownInstructionValue : { value : lastKnownInstructionValue },
		value					: { value : value }
	});
	
	return self;
};

}());
