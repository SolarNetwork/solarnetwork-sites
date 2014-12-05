/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3-sec 1.0
 */

(function() {
'use strict';

if ( sn.util === undefined ) {
	sn.util = {};
}

sn.util.controlToggler = function(urlHelper) {
	var self = {
		version : '1.1.0'
	};

	var timer;
	var lastKnownStatus;
	var lastKnownInstruction;
	var lastHadCredentials;
	var callback;
	var refreshMs = 20000;
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
			sn.log('Active instruction found in state {0}; set control {1} to {2}', 
				instruction.state, controlID, instruction.parameters[0].value);
		}
		return instruction;
	}
	
	function pendingInstructionState() {
		return (lastKnownInstruction === undefined ? undefined : lastKnownInstruction.state);
	}
		
	function pendingInstructionValue() {
		return (lastKnownInstruction === undefined ? undefined : Number(lastKnownInstruction.parameters[0].value));
	}

	function value(desiredValue) {
		if ( !arguments.length ) return (lastKnownStatus === undefined ? undefined : lastKnownStatus.val);

    	var q = queue();
    	var currentValue = (lastKnownStatus === undefined ? undefined : lastKnownStatus.val);
    	var pendingState = pendingInstructionState();
    	var pendingValue = pendingInstructionValue();
		if ( pendingState !== undefined && pendingValue !== desiredValue ) {
			// cancel the pending instruction
			sn.log('Canceling pending control {0} switch to {1}', controlID,  pendingValue);
			q.defer(sn.sec.json, nodeUrlHelper.updateInstructionStateURL(lastKnownInstruction.id, 'Declined'), 'POST');
			lastKnownInstruction = undefined;
			pendingState = undefined;
			pendingValue = undefined;
		}
		if ( currentValue !== desiredValue && pendingValue !== desiredValue ) {
			sn.log('Request to change control {0} to {1}', controlID, desiredValue);
			q.defer(sn.sec.json, nodeUrlHelper.queueInstructionURL('SetControlParameter', 
				[{name:controlID, value:String(desiredValue)}]), 'POST');
		}
		q.awaitAll(function(error, results) {
			if ( error ) {
				sn.log('Error updating control toggler {0}: {1}', controlID, error.status);
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
		});
		return self;
	};
	
	function update() {
    	var q = queue();
		q.defer(d3.json, nodeUrlHelper.mostRecentURL([controlID]));
		if ( sn.sec.hasTokenCredentials() === true ) {
			q.defer(sn.sec.json, nodeUrlHelper.viewPendingInstructionsURL(), 'GET');
		}
		q.await(function(error, status, active) {
			if ( error ) {
				sn.log('Error querying control toggler {0} status: {1}', controlID, error.status);
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
				var pendingInstruction = (active ? getActiveInstruction(active.data) : undefined);
				var pendingValue = (pendingInstruction === undefined ? undefined : Number(pendingInstruction.parameters[0].value));
				var lastKnownValue = pendingInstructionValue();
				if ( controlStatus !== undefined && (lastKnownStatus === undefined 
						|| controlStatus.val !== lastKnownStatus.val)
						|| pendingValue !== lastKnownValue
						|| lastHadCredentials !==  sn.sec.hasTokenCredentials() ) {
					sn.log('Control {0} value is currently {1}', controlID, controlStatus.val);
					lastKnownStatus = controlStatus;
					lastKnownInstruction = pendingInstruction;
					lastHadCredentials = sn.sec.hasTokenCredentials();
					
					// invoke the client callback so they know the data has been updated
					notifyDelegate();
				}
			
				// if timer was defined, keep going as if interval set
				if ( timer !== undefined ) {
					timer = setTimeout(update, refreshMs);
				}
			}
		});

		return self;
	}
	
	/**
	 * Start automatically updating the status of the configured control.
	 * 
	 * @return this object
	 * @memberOf sn.util.controlToggler
	 */
	self.start = function() {
		if ( timer === undefined ) {
			timer = setTimeout(update, 20);
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
		pendingInstructionState : { value : pendingInstructionState },
		pendingInstructionValue : { value : pendingInstructionValue },
		value					: { value : value }
	});
	
	return self;
};

}());
