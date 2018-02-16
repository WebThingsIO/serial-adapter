/**
 * serial-adapter.js - OnOff adapter implemented as a plugin.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const USE_NET = true;
const SHOW_RX_DATA = false;

const Packet = require('./packet');

var net;
var SerialPort;

if (USE_NET) {
  net = require('net');
} else {
  SerialPort = require('serialport');
}

class SerialAdapter {

  constructor(addonManager, manifest, port) {
    // We don't yet know the name of the adapter, so we set it to
    // unknown for now, and replace it later once we get the information
    // from the device.
    //super(addonManager, 'serial-unknown', manifest.name);

    this.manifest = manifest;
    this.port = port;

    if (USE_NET) {
      let options = {
        host: 'localhost',
        port: 7788
      };
      const hostStr = options.host + ':' + options.port;
      this.serialport = new net.createConnection(options, () => {
        console.log('Opened TCP connection to', hostStr);
        this.onOpen();
      });
      this.serialport.on('error', err => {
        console.error('Unable to connect to', hostStr);
        console.log(err.message);
      });
      this.serialport.on('end', () => {
        // The server shutdown
        console.log ('Server', hostStr, 'shutdown');
      });
    } else {
      this.serialport = new SerialPort(port.comName, {
        baudRate: port.baudRate
      }, err => {
        if (err) {
          console.error('Unable to open serial port', port.comName);
          console.error(err);
          return;
        }
        console.log('Opened matching serial port @', port.comName);
        this.onOpen();
      });
    }

    this.rxPacket = new Packet();
    this.rxPacket.showBytes = false;
    this.rxPacket.showPackets = false;

    this.serialport.on('data', data => {
      this.onData(data);
    });
  }

  onAdapter(data) {
    console.log('Adapter:', data.id,
                'name:', data.name,
                'thingCount:', data.thingCount);

    // Add adapter

    this.thingCount = data.thingCount;
    this.thingIdx = 0;
    this.send('getThingByIdx', {thingIdx: 0});
  }

  onThing(data) {
    console.log('Thing:', data.id,
                'name:', data.name,
                'type:', data.type,
                'description:', data.description,
                'propertyCount:', data.propertyCount);
    this.thingId = data.id;
    this.propertyCount = data.propertyCount;
    this.propertyIdx = 0;
    this.send('getPropertyByIdx', {thingIdx: this.thingIdx, propertyIdx: 0});
  }

  onThingDone() {
    // Add thing

    this.thingIdx += 1;
    if (this.thingIdx < this.thingCount) {
      this.send('getThingByIdx', {thingIdx: this.thingIdx});
    } else {
      this.send('setProperty', {
        id: this.thingId,
        name: "on",
        value: "true"
      });
    }
  }

  onProperty(data) {
    console.log('Property:', data.name, 'type:', data.type, 'value:', data.value);
    this.propertyIdx += 1;
    if (this.propertyIdx < this.propertyCount) {
      this.send('getPropertyByIdx', {thingIdx: this.thingIdx, propertyIdx: this.propertyIdx});
    } else {
      this.onThingDone();
    }
  }

  onPropertyChanged(data) {
    console.log('PropertyChanged: id:', data.id, 'name:', data.name, 'value:', data.value);
  }

  onData(data) {
    SHOW_RX_DATA && console.log('Got data:', data);
    for (let byte of data) {
      let buf = this.rxPacket.processByte(byte);
      if (buf) {
        console.log('Rcvd:', buf.toString());

        const msg = JSON.parse(buf.toString());
        const data = msg.data;
        switch (msg.messageType) {
          case 'adapter':
            this.onAdapter(data);
            break;
          case 'thing':
            this.onThing(data);
            break;
          case 'property':
            this.onProperty(data);
            break;
          case 'propertyChanged':
            this.onPropertyChanged(data);
            break;
          case 'error':
            console.error(data.msg);
            break;
          default:
            console.error('Unrecognized command:', msg.messageType);
            break;
        }
      }
    }
  }

  onOpen() {
    this.send('getAdapter');
  }

  send(cmd, data) {
    if (!data) {
      data = {};
    }
    let msg = JSON.stringify({
      messageType: cmd,
      data: data
    });
    this.serialport.write(Packet.makePacket(Buffer.from(msg)));
    console.log(`Sent '${msg}'`);
  }
}

function serialPortMatches(port, portsConfig) {
  // We only filter using keys from the following:
  const compareKeys = ["manufacturer",
                       "vendorId",
                       "productId",
                       "serialNumber",
                       "comName"];

  // Under OSX, SerialPort.list returns the /dev/tty.usbXXX instead
  // /dev/cu.usbXXX. tty.usbXXX requires DCD to be asserted which
  // isn't necessarily the case for usb-to-serial dongles.
  // The cu.usbXXX doesn't care about DCD.
  if (port.comName.startsWith('/dev/tty.usb')) {
    port.comName = port.comName.replace('/dev/tty', '/dev/cu');
  }
  for (const name in portsConfig) {
    const portConfig = portsConfig[name];

    const configKeys = Object.keys(portConfig)
                             .filter(ck => compareKeys.indexOf(ck) >= 0);
    if (configKeys.length == 0) {
      // No keys - it doesn't match
      continue;
    }
    let match = true;
    for (const configKey of configKeys) {
      let configVal = portConfig[configKey];
      let portVal = port[configKey];
      if (typeof(portVal) != 'string' || !portVal.startsWith(configVal)) {
        match = false;
      }
    }
    if (match) {
      // All of the fields from the config match the values from the port,
      // so we have a match;

      // If there is a baudRate, copy it over
      if (portConfig.hasOwnProperty('baudRate')) {
        port.baudRate = portConfig.baudRate;
      } else {
        port.baudRate = 115200;
      }
      return true;
    }
  }
  return false;
}

function loadSerial(addonManager, manifest, errorCallback) {
  let portsConfig = manifest.moziot &&
                    manifest.moziot.config &&
                    manifest.moziot.config.ports;
  if (!portsConfig) {
    errorCallback('No moziot.config.ports found in package.json');
    return;
  }

  SerialPort.list().then(ports => {
    let matchingPorts =
      ports.filter(port => serialPortMatches(port, portsConfig));
    if (matchingPorts.length == 0) {
      errorCallback('No matching serial port found');
      return;
    }
    for (const port of matchingPorts) {
      new SerialAdapter(addonManager, manifest, port);
    }
  }).catch(e => {
    errorCallback(e);
  });
}

function loadNet(addonManager, manifest, errorCallback) {
  new SerialAdapter(addonManager, manifest, 'tcp');
}

if (USE_NET) {
  module.exports = loadNet;
} else {
  module.exports = loadSerial;
}
