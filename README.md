Adapter for talking to serial-mcu based software through a serial port.

This respository is a place-holder for the adapter code which will talk to simple mcu devices (like an Arduino) through a serial interface.

These are the set of message currently needing to be transferred:

```
Sent '{"messageType":"getAdapter","data":{}}'
Rcvd: {"messageType":"adapter","data":{"id":"Arduino-LED","name":"Arduino-LED","thingCount":1}}
Sent '{"messageType":"getThingByIdx","data":{"thingIdx":0}}'
Rcvd: {"messageType":"thing","data":{"id":"ArduinoLED-led-1","name":"led","type":"onOffSwitch","description":"Arduino LED","propertyCount":1}}
Sent '{"messageType":"getPropertyByIdx","data":{"thingIdx":0,"propertyIdx":0}}'
Rcvd: {"messageType":"property","data":{"name":"on","type":"boolean","value":false}}
Sent '{"messageType":"setProperty","data":{"id":"ArduinoLED-led-1","name":"on","value":"true"}}'
Rcvd: {"messageType":"propertyChanged","data":{"id":"ArduinoLED-led-1","name":"on","value":"true"}}
```

The longest message from this simple example is the "thing" message which as JSON is 136 bytes long.

By encoding the messageType as a single byte and removing the labels, this can be dropped to 49 bytes
which is starting to be alot more reasonable for a microcontroller environment.

Further reduction would be possible by retrieving individial fields for adapter/things/properties and since retrieving
those fields only happens at startup, that would probably be another good compromise.

For a binary protocol, we would then have messages like:

- getAdapterId
- getAdapterName
- getAdapterThingCount

- getThingId(thingIndex)
- getThingName(thingIndex)
- getThingType(thingIndex)
- getThingDescription(thingIndex)
- getThingPropertyCount(thingIndex)

- getPropertyName(thingIndex, propertyIndex)
- getPropertyType(thingIndex, propertyIndex)
- getPropertyMin(thingIndex, propertyIndex)
- getPropertyMax(thingIndex, propertyIndex)
- getPropertyUnit(thingIndex, propertyIndex)
- getPropertyValue(thingIndex, propertyIndex)

- setProperty(thingIndex, propertyIndex, value)
- propertyChanged(thingIndex, propertyIndex, value)

This would reduce the max message sent to the MCU to 3 bytes + the max size of a value
And the max message received from the MCU would be a variable length string

The adapter (on the host) would translate indicies into strings based on the data queried.
