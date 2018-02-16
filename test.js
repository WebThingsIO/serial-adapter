#!/usr/bin/env node
/**
 * index.js - Loads the simple On/Off adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const fs = require('fs');

const manifestData = fs.readFileSync('package.json');
const manifest = JSON.parse(manifestData);

const loadSerial = require('./serial-adapter');

loadSerial(null, manifest, (str) => {
  console.error(manifest.name + ':', str);
});
