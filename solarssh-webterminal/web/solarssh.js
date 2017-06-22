/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.2.0
 * @require xterm 2.7
 */

(function(window) {
'use strict';

var devEnv = {
	// comment out these for production
	debug: true,
	tls: false,
	host: 'solarnetworkdev.net:8680'
};

var app;

var solarSshApp = function(nodeUrlHelper, options) {
	var self = { version : '0.1.0' };
	var helper = sn.net.securityHelper();
	var config = (options || {});
	var session;

	function hostURL() {
		return ('http' +(config.solarSshTls === true ? 's' : '') +'://' +config.solarSshHost);
	}

	function baseURL() {
		return (hostURL() +config.solarSshPath +'/api/v1/ssh');
	}

	function enableSubmit(value) {
		d3.select('#connect').property('disabled', !value);
	}

	function connect() {
		helper.token(d3.select('input[name=token]').property('value'));
		helper.secret(d3.select('input[name=secret]').property('value'));
		enableSubmit(false);
		console.log('connect using token %s', helper.token());
		createSession();
	}

	function createSession() {
		var url = baseURL() + '/session/new?nodeId=' +nodeUrlHelper.nodeId;
		var authorization = helper.computeAuthorization(
			nodeUrlHelper.viewPendingInstructionsURL(),
			'GET',
			undefined,
			undefined,
			new Date()
		);
		return executeWithPreSignedAuthorization('GET', url, authorization)
			.on('load', handleCreateSession)
			.on('error', function(xhr) {
				console.error('Failed to create session: %s', xhr.responseText);
				enableSubmit(true);
			});
	}

	function handleCreateSession(json) {
		if ( !(json.success && json.data && json.data.sessionId) ) {
			console.error('Failed to create session: %s', JSON.stringify(json));
			enableSubmit(true);
			return;
		}
		console.log('Created session %s', json.data.sessionId);
		session = json.data;
		startSession();
	}

	function startSession() {
		var url = baseURL() + '/session/' +session.sessionId +'/start';
		var authorization = helper.computeAuthorization(
			nodeUrlHelper.queueInstructionURL('StartRemoteSsh', [
				{name: 'host', value: session.host},
				{name: 'user', value: session.sessionId},
				{name: 'port', value: session.port},
				{name: 'rport', value: session.reversePort }
			]),
			'POST',
			undefined,
			'application/x-www-form-urlencoded',
			new Date()
		);
		return executeWithPreSignedAuthorization('GET', url, authorization)
			.on('load', handleStartSession)
			.on('error', function(xhr) {
				console.error('Failed to start session: %s', xhr.responseText);
				enableSubmit(true);
			});
	}

	function handleStartSession(json) {
		if ( !(json.success && json.data && json.data.sessionId) ) {
			console.error('Failed to start session: %s', JSON.stringify(json));
			enableSubmit(true);
			return;
		}
		console.log('Started session %s', json.data.sessionId);
		session = json.data;
	}

	function executeWithPreSignedAuthorization(method, url, authorization) {
		var req = d3.json(url);
		req.on('beforesend', function(request) {
			request.setRequestHeader('X-SN-Date', authorization.dateHeader);
			request.setRequestHeader('X-SN-PreSignedAuthorization', authorization.header);
		});
		console.log('Requesting %s %s', method, url);
		req.send(method);
		return req;
	}

	function start() {
		var term = new Terminal();
		term.open(document.getElementById('terminal'));
	}

	function init() {
		d3.select('#connect').on('click', connect);
		return Object.defineProperties(self, {
			start: { value: start },
		});
	}

	return init();
};

function setupUI(env) {
	d3.selectAll('.node-id').text(env.nodeId);
}

function startApp(env) {
	var urlHelper;

	if ( !env ) {
		env = sn.util.copy(devEnv, sn.util.copy(sn.env, {
			nodeId : 167,
			solarSshHost: 'solarnetworkdev.net:8080',
			solarSshPath: '/solarssh',
			solarSshTls: false,
		}));
	}

	setupUI(env);

	urlHelper = sn.api.node.nodeUrlHelper(env.nodeId, env);

	app = solarSshApp(urlHelper, env)
		.start();

	return app;
}

sn.runtime.solarSshApp = startApp;

}(window));
