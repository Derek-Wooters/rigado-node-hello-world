#!/usr/bin/env node

const os = require('os');
const MQTT = require('mqtt');

let Thingy = null;

const LOG_LEVEL_INFO = 1;
const LOG_LEVEL_DEBUG = 0;

const LOG_ERR = 'ERR';
const LOG_MQTT = 'MQTT';
const LOG_BLE = 'BLE';
const LOG_SEND = 'SEND';
const LOG_APP = 'APP';
const BROKER_STATE_READY = 'ready';
const BROKER_STATE_CONNECTING = 'connecting';
const BROKER_STATE_CONNECTED = 'connected';
const APP_STATE_RUNNING = 'running';
const APP_STATE_STOPPING = 'stopping';
const SEND_GATEWAY_CONNECTED = 'GATEWAY_CONNECTED';
const SEND_DEVICE_CONNECTED = 'DEVICE_CONNECTED';

const BROKER_CONNECT_INTERVAL = 3000;
const DISCOVER_RESTART_TIMEOUT = 5000; // XXX: Workaround for noble-device issue
const APPLICATION_START_TIMEOUT = 5000; // XXX: Wait HCI devices on system startup

let brokerConnectTaskId = null;
let dataTransmissionTaskId = null;

let brokerConnectionState = BROKER_STATE_READY;
let applicationState = APP_STATE_RUNNING;

let mqttClient = null;
let connectedThingy = null;
const thingyState = {
  accel: {
    x: 0,
    y: 0,
    z: 0
  },
  button: false
};
let config = {};

// Commons
// ==========

const loadConfig = () => {
  const c = require('./config');
  let { topic } = c.mqtt;
  topic = topic.replace('{hostname}', os.hostname());
  c.mqtt.topic = topic;
  return c;
};

const print = (context, msg, val = '', level = LOG_LEVEL_DEBUG) => { // TODO: Logging level
  let appLogLevel = config.app.logLevel;
  if (!context) {
    if (appLogLevel <= level) {
      console.log('=========================');
    }
  }
  else if (context === LOG_ERR) {
    console.error(msg, val);
  }
  else {
    if (appLogLevel <= level) {
      console.log(`[${context}] ${msg}`, val);
    }
  }
};

// Broker Utils
// ==========

const brokerDisconnect = () => {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }
};

const brokerConnect = (mqttConfig) => {
  brokerConnectionState = BROKER_STATE_CONNECTING;
  const mqttAddr = `${mqttConfig.host}:${mqttConfig.port}`;
  print(LOG_MQTT, `Connecting to: ${mqttAddr}`);

  const connectionProblemsHandler = (err) => {
    if (err) {
      print(LOG_ERR, 'Connection problem, disconnecting ...', err);
      brokerDisconnect();
      brokerConnectionState = BROKER_STATE_READY;
    }
  };

  const client = MQTT.connect({
    protocol: 'mqtt',
    host: mqttConfig.host,
    port: mqttConfig.port
  });

  client.on('connect', () => {
    mqttClient = client;
    print(LOG_MQTT, `Successfully connected to: ${mqttAddr}`, "", LOG_LEVEL_INFO);
    brokerConnectionState = BROKER_STATE_CONNECTED;
  });
  client.on('close', connectionProblemsHandler);
  client.on('error', connectionProblemsHandler);
  client.on('end', connectionProblemsHandler);
  client.on('offline', connectionProblemsHandler);
};

const startBrokerConnectTask = (config) => {
  print(LOG_MQTT, 'Start Broker Connect Task ...');
  return setInterval(() => {
    if (brokerConnectionState !== BROKER_STATE_CONNECTING
        && brokerConnectionState !== BROKER_STATE_CONNECTED) {
      brokerConnect(config.mqtt);
    }
  }, BROKER_CONNECT_INTERVAL);
};

const stopBrokerConnectTask = () => {
  print(LOG_MQTT, 'Stop Broker Connect Task ...');
  clearInterval(brokerConnectTaskId);
  brokerDisconnect();
};

// Thingy Utils
// ==========

const disconnectThingy = (disconnected) => {
  if (!disconnected && connectedThingy) {
    connectedThingy.disconnect();
  }
  connectedThingy = null;
};

const macToId = mac => (mac.toLowerCase().replace(new RegExp(':', 'g'), ''));

const startDiscoverThingyTask = (config) => {
  const handleDiscover = (thingy) => {
    if (!connectedThingy) {
      connectAndSetupThingy(thingy); // eslint-disable-line no-use-before-define
    }
  };
  print(LOG_BLE, 'Start Discovery Task ...');
  const id = macToId(config.ble.deviceMAC);
  Thingy.discoverWithFilter((device) => {
    print(LOG_BLE, `Discover: ${device.id} target: ${id}`, "", LOG_LEVEL_INFO);
    if (id === '*') return true;
    return id === device.id;
  }, handleDiscover);
};

const stopDiscoverThingyTask = (disconnected) => {
  print(LOG_BLE, 'Stop Discovery Task ...');
  Thingy.stopDiscover((err) => {
    if (err) {
      print(LOG_ERR, 'Connection/Setup problem, disconnecting ...', err);
    }
  });
  disconnectThingy(disconnected);
};

const restartDiscoverThingyTask = (disconnected) => {
  const config = loadConfig();
  stopDiscoverThingyTask(disconnected);
  setTimeout(() => {
    startDiscoverThingyTask(config);
  }, DISCOVER_RESTART_TIMEOUT);
};

const connectAndSetupThingy = (thingy) => {
  const handleError = (error) => {
    if (error) {
      print(LOG_ERR, 'Connection/Setup problem, disconnecting ...', error);
      restartDiscoverThingyTask();
    }
  };

  print(LOG_BLE, 'Connecting to the Thingy:52', thingy.id, LOG_LEVEL_INFO);
  thingy.connectAndSetUp((error) => {
    if (error) handleError(error);
    else {
      // User Interface
      thingy.led_breathe({
        color: 2,
        intensity: 100,
        delay: 1000
      }, handleError);
      thingy.button_enable(handleError);
      thingy.on('buttonNotif', (state) => {
        if (state === 'Pressed') {
          thingyState.button = true;
        }
      });
      // Sensors
      thingy.raw_enable(handleError);
      thingy.on('rawNotif', (rawData) => {
        thingyState.accel.x = rawData.accelerometer.x;
        thingyState.accel.y = rawData.accelerometer.y;
        thingyState.accel.z = rawData.accelerometer.z;
      });
      // Service
      thingy.on('disconnect', () => {
        print(LOG_BLE, 'Thingy:52 disconnected');
        restartDiscoverThingyTask(true);
      });
      connectedThingy = thingy;
      print(LOG_BLE, 'Successfully connected to ', thingy.id, LOG_LEVEL_INFO);
    }
  });
};

// Transmission Utils
// ==========

const send = (config, payload, status) => {
  const msg = JSON.stringify({
    status,
    timestamp: Math.round((new Date()).getTime() / 1000),
    payload
  });
  mqttClient.publish(config.topic, msg);
  print(LOG_SEND, `Publish to ${config.topic} ${msg}`);
};

const sendDeviceState = (config) => {
  send(config, thingyState, SEND_DEVICE_CONNECTED);
  thingyState.button = false;
};

const sendHealth = (config) => {
  send(config, null, SEND_GATEWAY_CONNECTED);
};

const startSendingTask = (config) => {
  print(LOG_SEND, 'Start Sending Task ...');
  return setInterval(() => {
    if (mqttClient) {
      if (connectedThingy) {
        sendDeviceState(config.mqtt);
      }
      else {
        sendHealth(config.mqtt);
      }
    }
  }, config.app.sendInterval);
};

const stopSendingTask = () => {
  print(LOG_SEND, 'Stop Sending Task ...');
  clearInterval(dataTransmissionTaskId);
};

// App Utils
// ==========

const start = (config) => {
  print();
  print(LOG_APP, 'Starting with Config: ', config, LOG_LEVEL_INFO);
  print();

  brokerConnectTaskId = startBrokerConnectTask(config);
  startDiscoverThingyTask(config);
  dataTransmissionTaskId = startSendingTask(config);
};

const stop = () => {
  if (applicationState === APP_STATE_STOPPING) return;
  applicationState = APP_STATE_STOPPING;
  print();
  print(LOG_APP, 'Stopping ...');
  stopSendingTask();
  stopBrokerConnectTask();
  stopDiscoverThingyTask();
};

const init = () => {
  config = loadConfig();
  print(LOG_APP, 'Initialize ...');
  // Setup noble lib
  process.env.NOBLE_HCI_DEVICE_ID = config.ble.hciDeviceNum;
  Thingy = require('thingy52');
  // Set exit handlers
  process.on('exit', () => {
    stop();
  });
  process.on('uncaughtException', (err) => {
    print(LOG_ERR, 'uncaughtException:', err);
    try {
      stop();
    }
    catch (stopErr) {
      print(LOG_ERR, 'Error while stop:', stopErr);
    }
    finally {
      process.exit(-1);
    }
  });
  return config;
};

// Application
// ==========
init();
setTimeout(() => {
  start(config);
}, APPLICATION_START_TIMEOUT);
