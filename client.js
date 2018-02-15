#!/usr/bin/env node

/*
 * client.js
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const net = require('net');
const Packet = require('./packet');

let client = new net.createConnection({port: 7788}, () => {
  console.log('Connected to server');
  client.write(Packet.makePacket(Buffer.from(JSON.stringify({
    a: 1,
    b: 2,
    c: 3
  }))));
});
client.on('data', (data) => {
  console.log('Got data:', data);
});
client.on('end', () => {
  console.log('Disconnected from server');
});
