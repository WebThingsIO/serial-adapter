/**
 * serial-adapter.js - OnOff adapter implemented as a plugin.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const USE_NET = false;
const SHOW_RX_DATA = false;

const Packet = require('./packet');

let Adapter, Database, Device, Property;
try {
  Adapter = require('../adapter');
  Device = require('../device');
  Property = require('../property');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }

  const gwa = require('gateway-addon');
  Adapter = gwa.Adapter;
  Database = gwa.Database;
  Device = gwa.Device;
  Property = gwa.Property;
}

let net;
let SerialPort;

if (USE_NET) {
  net = require('net');
} else {
  SerialPort = require('serialport');
}

// The property.js file has a function call copyDescriptionFieldsInto
// which should have been made a static method. Since it wasn't done this
// way for the 0.3.0 release, I've just copied the function here.

const DESCR_FIELDS = ['type', 'unit', 'description', 'min', 'max'];
function copyDescrFieldsInto(target, source) {
  for (const field of DESCR_FIELDS) {
    if (source.hasOwnProperty(field)) {
      target[field] = source[field];
    }
  }
}

class SerialProperty extends Property {

  constructor(device, msgData) {
    const propertyDescr = {};
    copyDescrFieldsInto(propertyDescr, msgData);
    super(device, msgData.name, propertyDescr);
    this.setCachedValue(msgData.value);
  }

  /**
   * @method setValue
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(value) {
    this.device.send('setProperty', {
      name: this.name,
      value: value,
    });
    // We don't rely on the device to tell us that the value changed,
    // so we resolve the promise right away.
    return Promise.resolve(value);
  }
}

class SerialThing extends Device {

  constructor(adapter, msgData) {
    super(adapter, msgData.id);
    this.name = msgData.name;
    this.type = msgData.type;
    this.description = msgData.description;
  }

  addProperty(msgData) {
    this.properties.set(msgData.name, new SerialProperty(this, msgData));
  }

  send(cmd, data) {
    data.id = this.id;
    this.adapter.send(cmd, data);
  }
}

class SerialAdapter extends Adapter {

  constructor(addonManager, manifest, port) {
    // We don't yet know the name of the adapter, so we set it to
    // unknown for now, and replace it later once we get the information
    // from the device.
    super(addonManager, 'serial-unknown', manifest.name);

    this.manifest = manifest;
    this.port = port;

    if (USE_NET) {
      const options = {
        host: 'localhost',
        port: 7788,
      };
      const hostStr = `${options.host}:${options.port}`;
      this.serialport = new net.createConnection(options, () => {
        console.log('Opened TCP connection to', hostStr);
        this.onOpen();
      });
      this.serialport.on('error', (err) => {
        console.error('Unable to connect to', hostStr);
        console.log(err.message);
      });
      this.serialport.on('end', () => {
        // The server shutdown
        console.log('Server', hostStr, 'shutdown');
      });
    } else {
      this.serialport = new SerialPort(port.comName, {
        baudRate: port.baudRate,
      }, (err) => {
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

    this.serialport.on('data', (data) => {
      this.onData(data);
    });
  }

  onAdapter(msgData) {
    console.log('Adapter:', msgData.id,
                'name:', msgData.name,
                'thingCount:', msgData.thingCount);

    this.id = msgData.id;
    this.name = msgData.name;

    this.manager.addAdapter(this);

    this.thingCount = msgData.thingCount;
    this.thingIdx = 0;
    this.send('getThingByIdx', {
      thingIdx: 0,
    });
  }

  onThing(msgData) {
    console.log('Thing:', msgData.id,
                'name:', msgData.name,
                'type:', msgData.type,
                'description:', msgData.description,
                'propertyCount:', msgData.propertyCount);
    this.newThing = new SerialThing(this, msgData);
    this.propertyCount = msgData.propertyCount;
    this.propertyIdx = 0;
    this.send('getPropertyByIdx', {
      thingIdx: this.thingIdx,
      propertyIdx: 0,
    });
  }

  onThingDone() {
    this.handleDeviceAdded(this.newThing);
    this.newThing = null;

    this.thingIdx += 1;
    if (this.thingIdx < this.thingCount) {
      this.send('getThingByIdx', {
        thingIdx: this.thingIdx,
      });
    }
  }

  onProperty(msgData) {
    console.log('Property:', msgData.name,
                'type:', msgData.type,
                'value:', msgData.value);
    if (this.newThing) {
      this.newThing.addProperty(msgData);
    }

    this.propertyIdx += 1;
    if (this.propertyIdx < this.propertyCount) {
      this.send('getPropertyByIdx', {
        thingIdx: this.thingIdx,
        propertyIdx: this.propertyIdx,
      });
    } else {
      this.onThingDone();
    }
  }

  onPropertyChanged(msgData) {
    console.log('PropertyChanged: id:', msgData.id,
                'name:', msgData.name,
                'value:', msgData.value);

    const thing = this.getDevice(msgData.id);
    if (thing) {
      const property = thing.findProperty(msgData.name);
      if (property) {
        property.setCachedValue(msgData.value);
        thing.notifyPropertyChanged(property);
      } else {
        console.log('propertyChanged for unknown property:', msgData.name,
                    '- ignoring');
      }
    } else {
      console.log('propertyChanged for unknown thing:', msgData.id,
                  '- ignoring');
    }
  }

  onData(data) {
    SHOW_RX_DATA && console.log('Got data:', data);
    for (const byte of data) {
      const buf = this.rxPacket.processByte(byte);
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
    const msg = JSON.stringify({
      messageType: cmd,
      data: data,
    });
    this.serialport.write(Packet.makePacket(Buffer.from(msg)));
    console.log(`Sent '${msg}'`);
  }
}

function serialPortMatches(port, portsConfig) {
  // We only filter using keys from the following:
  const compareKeys = ['manufacturer',
                       'vendorId',
                       'productId',
                       'serialNumber',
                       'comName'];

  if (!Array.isArray(portsConfig)) {
    const newConfig = [];
    for (const name in portsConfig) {
      const config = portsConfig[name];
      config.name = name;
      newConfig.push(config);
    }
    portsConfig = newConfig;
  }

  // Under OSX, SerialPort.list returns the /dev/tty.usbXXX instead
  // /dev/cu.usbXXX. tty.usbXXX requires DCD to be asserted which
  // isn't necessarily the case for usb-to-serial dongles.
  // The cu.usbXXX doesn't care about DCD.
  if (port.comName.startsWith('/dev/tty.usb')) {
    port.comName = port.comName.replace('/dev/tty', '/dev/cu');
  }
  for (const portConfig of portsConfig) {
    const configKeys =
      Object.keys(portConfig).filter((ck) => compareKeys.indexOf(ck) >= 0);
    if (configKeys.length == 0) {
      // No keys - it doesn't match
      continue;
    }
    let match = true;
    for (const configKey of configKeys) {
      const configVal = portConfig[configKey];
      const portVal = port[configKey];
      if (typeof portVal !== 'string' || !portVal.startsWith(configVal)) {
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
  let promise;

  // Attempt to move to new config format.
  if (Database) {
    const db = new Database(manifest.name);
    promise = db.open().then(() => {
      return db.loadConfig();
    }).then((config) => {
      if (!Array.isArray(config.ports)) {
        const ports = [];

        for (const portName in config.ports) {
          const port = Object.assign({}, config.ports[portName]);
          port.name = portName;
          ports.push(port);
        }

        manifest.moziot.config.ports = ports;
        return db.saveConfig({ports});
      }
    });
  } else {
    promise = Promise.resolve();
  }

  promise.then(() => {
    const portsConfig = manifest.moziot &&
                        manifest.moziot.config &&
                        manifest.moziot.config.ports;
    if (!portsConfig) {
      errorCallback(manifest.name,
                    'No moziot.config.ports found in package.json');
      return;
    }

    SerialPort.list().then((ports) => {
      const matchingPorts =
        ports.filter((port) => serialPortMatches(port, portsConfig));
      if (matchingPorts.length == 0) {
        errorCallback(manifest.name, 'No matching serial port found');
        return;
      }
      for (const port of matchingPorts) {
        new SerialAdapter(addonManager, manifest, port);
      }
    }).catch((e) => {
      errorCallback(manifest.name, e);
    });
  });
}

function loadNet(addonManager, manifest, _errorCallback) {
  new SerialAdapter(addonManager, manifest, 'tcp');
}

if (USE_NET) {
  module.exports = loadNet;
} else {
  module.exports = loadSerial;
}
