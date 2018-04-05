/*
 * packet.js
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const utils = require('./utils');

const padLeft = utils.padLeft;
const hexStr = utils.hexStr;

// Packet layout:
//
//  <SOH><LenLow><LenHigh><STX><PAYLOAD><ETX><LRC><EOT>

const SOH = 0x01;
const STX = 0x02;
const ETX = 0x03;
const EOT = 0x04;

const HEADER_SIZE = 4;
const TRAILER_SIZE = 3;
const OVERHEAD_SIZE = HEADER_SIZE + TRAILER_SIZE;

const STATE = {
  SOH: 0,
  LEN_0: 1,
  LEN_1: 2,
  STX: 3,
  PAYLOAD: 4,
  ETX: 5,
  LRC: 6,
  EOT: 7
};
const STATE_STR = ['SOH',
                   'LEN_0',
                   'LEN_1',
                   'STX',
                   'PAYLOAD',
                   'ETX',
                   'LRC',
                   'EOT'];

class Packet {

  constructor() {
    this.state = STATE.SOH;
    this.showPackets = false;
    this.showBytes = false;
    this.length = 0;
  }

  processByte(byte) {
    if (this.showBytes) {
      let ch = (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.';
      console.log('State:', padLeft(STATE_STR[this.state], 7),
                  'Rcvd 0x' + hexStr(byte, 2), '\'' + ch + '\'');
    }

    switch (this.state) {
      case STATE.SOH:
        if (byte == SOH) {
          this.state = STATE.LEN_0;
        }
        break;
      case STATE.LEN_0:
        this.length = byte;
        this.state = STATE.LEN_1;
        break;
      case STATE.LEN_1:
        this.length += (byte << 8);
        this.idx = 0;
        this.buffer = Buffer.alloc(this.length);
        this.state = STATE.STX;
        this.lrc = 0;
        this.index = 0;
        break;
      case STATE.STX:
        if (byte == STX) {
          if (this.length > 0) {
            this.state = STATE.PAYLOAD;
          } else {
            this.state = STATE.ETX;
          }
        } else {
          this.state = STATE.SOH;
        }
        break;
      case STATE.PAYLOAD:
        this.buffer[this.index] = byte;
        this.index += 1;
        this.lrc += byte;
        if (this.index >= this.length) {
          this.state = STATE.ETX;
        }
        break;
      case STATE.ETX:
        if (byte == ETX) {
          this.state = STATE.LRC;
        } else {
          this.state = STATE.SOH;
        }
        break;
      case STATE.LRC: {
        this.lrc = ((this.lrc ^ 0xff) + 1) & 0xff;
        if (byte == this.lrc) {
          this.state = STATE.EOT;
        } else {
          console.error('Got LRC: 0x' + hexStr(byte, 2) +
                        ', expected 0x' + hexStr(this.lrc, 2));
          this.state = STATE.SOH;
        }
        break;
      }
      case STATE.EOT:
        this.state = STATE.SOH;
        if (byte == EOT) {
          // We successfully got a packet
          if (this.showPackets) {
            console.log('Rcvd Packet:', this.buffer);
          }
          return this.buffer;
        }
        break;
    }
  }

  static LRC(data) {
    let lrc = 0;
    for (let byte of data) {
      lrc += byte;
    }
    return ((lrc ^ 0xff) + 1) & 0xff;
  }

  static makePacket(data) {
    let buf = Buffer.alloc(data.length + OVERHEAD_SIZE);
    buf[0] = SOH;
    buf[1] = data.length & 0xff;
    buf[2] = (data.length >> 8) & 0xff;
    buf[3] = STX;
    data.copy(buf, HEADER_SIZE);
    let trailer = buf.slice(data.length + HEADER_SIZE);
    trailer[0] = ETX;
    trailer[1] = Packet.LRC(data);
    trailer[2] = EOT;
    return buf;
  }
}

module.exports = Packet;
