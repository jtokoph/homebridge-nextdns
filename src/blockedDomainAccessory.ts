import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { NextDNSPlatform } from './platform.js';

export class BlockedDomainAccessory {
  private service: Service;

  public isOn: boolean = false;

  constructor(
    private readonly platform: NextDNSPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    platform.log.debug(
      'BlockedDomainAccessory',
      accessory.context.domain,
      accessory.context.isOn,
    );

    // biome-ignore lint/style/noNonNullAssertion: because we know it exists
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'NextDNS')
      .setCharacteristic(this.platform.Characteristic.Model, 'NextDNS')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'NextDNS');

    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.isOn = this.accessory.context.isOn === true;

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.displayName,
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    return;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    this.platform.log.debug('setOn', this.accessory.context.domain, value);
    this.isOn = value as boolean;

    if (this.isOn) {
      this.platform.blockDomain(this.accessory.context.domain);
    } else {
      this.platform.unblockDomain(this.accessory.context.domain);
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possible. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
   * In this case, you may decide not to implement `onGet` handlers, which may speed up
   * the responsiveness of your device in the Home app.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    return this.isOn;
  }
}
