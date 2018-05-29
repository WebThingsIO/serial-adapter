#!/usr/bin/env node

const fs = require('fs');
const SerialPort = require('serialport');
const utils = require('./utils');

function serialPortMatches(port, portsConfig) {
  // We only filter using keys from the following:
  const compareKeys = ['manufacturer',
                       'vendorId',
                       'productId',
                       'serialNumber',
                       'comName'];

  // Under OSX, SerialPort.list returns the /dev/tty.usbXXX instead
  // /dev/cu.usbXXX. tty.usbXXX requires DCD to be asserted which
  // isn't necessarily the case for usb-to-serial dongles.
  // The cu.usbXXX doesn't care about DCD.
  if (port.comName.startsWith('/dev/tty.usb')) {
    port.comName = port.comName.replace('/dev/tty', '/dev/cu');
  }
  for (const name in portsConfig) {
    const portConfig = portsConfig[name];

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

function printPorts(ports) {
  const lines = [
    ['comPort', 'vendorId', 'productId', 'serialNumber', 'manufacturer'],
    '-',
  ];

  for (const port of ports) {
    if (port.comName.startsWith('/dev/tty.usb')) {
      port.comName = port.comName.replace('/dev/tty', '/dev/cu');
    }
    lines.push([port.comName,
                port.vendorId || '',
                port.productId || '',
                port.serialNumber || '',
                port.manufacturer || '']);
  }

  utils.printTable('<<<<<', lines);
}

SerialPort.list().then((ports) => {
  // First print a list of all of the ports
  console.log('===== All ports found =====');
  printPorts(ports);

  const manifestData = fs.readFileSync('package.json');
  const manifest = JSON.parse(manifestData);
  const portsConfig = manifest.moziot &&
                      manifest.moziot.config &&
                      manifest.moziot.config.ports;
  if (!portsConfig) {
    console.log('No moziot.config.ports found in package.json');
    return;
  }

  for (const name in portsConfig) {
    console.log('');
    console.log('===== Serial ports which match filter', name, '=====');
    const portConfig = {};
    portConfig[name] = portsConfig[name];
    const matchingPorts =
      ports.filter((port) => serialPortMatches(port, portConfig));
    printPorts(matchingPorts);
  }
});
