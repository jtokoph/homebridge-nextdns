import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { BlockedDomainAccessory } from './blockedDomainAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

function getUUID(api: API, domain: string) {
  return api.hap.uuid.generate(`next-dns-blocked-domain:${domain}`);
}

function toTitleCase(str: string) {
  return str.replace(
    /\w\S*/g,
    (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase(),
  );
}

async function getNextDNSProfileData(
  platform: NextDNSPlatform,
  apiKey: string,
  profileId: string,
) {
  try {
    const response = await fetch(
      `https://api.nextdns.io/profiles/${profileId}`,
      {
        headers: {
          'x-api-key': apiKey,
        },
      },
    );

    if (!response.ok) {
      platform.log.warn('Failed to fetch profile:', response.statusText);
      return null;
    }

    const json = (await response.json()) as {
      data: { denylist: Array<{ id: string; active: boolean }> };
    };

    return json.data;
  } catch (_) {
    platform.log.warn(
      'Failed to fetch profile. Ensure the API key and profile ID are correct and the network is reachable.',
    );
    return null;
  }
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class NextDNSPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly BlockedDomainAccessories: Map<
    string,
    BlockedDomainAccessory
  > = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('config', config);

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    if (!this.config.apiKey || !this.config.profileId) {
      this.log.warn(
        `${config.name} is not configured correctly. apiKey and profileId are required. The configuration provided was: ${JSON.stringify(config)}`,
      );
      return;
    }

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    const blockedDomains = this.config.blockedDomains || [];

    const data = await getNextDNSProfileData(
      this,
      this.config.apiKey,
      this.config.profileId,
    );

    let denylist: Array<{ id: string; active: boolean }> = [];

    if (data?.denylist) {
      denylist = data.denylist;
    }

    const nextDNSBlockedDomains = denylist.reduce(
      (acc, domain) => {
        acc[domain.id] = domain.active;
        return acc;
      },
      {} as Record<string, boolean>,
    );

    this.log.debug('nextDNSBlockedDomains', nextDNSBlockedDomains);

    for (const blockedDomain of blockedDomains) {
      const uuid = getUUID(this.api, blockedDomain);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.debug(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
        );

        existingAccessory.context.isOn = !!nextDNSBlockedDomains[blockedDomain];
        this.api.updatePlatformAccessories([existingAccessory]);

        this.BlockedDomainAccessories.set(
          uuid,
          new BlockedDomainAccessory(this, existingAccessory),
        );
      } else {
        this.log.debug('Adding new accessory:', uuid);

        const displayName = toTitleCase(`${blockedDomain.split('.')[0]} block`);

        const accessory = new this.api.platformAccessory(displayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.domain = blockedDomain;
        accessory.context.displayName = displayName;
        accessory.context.isOn = !!nextDNSBlockedDomains[blockedDomain];

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        this.BlockedDomainAccessories.set(
          uuid,
          new BlockedDomainAccessory(this, accessory),
        );

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }

      // push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }

    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    // for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
    // from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.debug(
          'Removing existing accessory from cache:',
          accessory.displayName,
        );
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }

    // Bootstrap async updates
    this.bootstrapAsyncUpdates();
  }

  async bootstrapAsyncUpdates() {
    const syncConfig = async () => {
      this.log.debug('syncConfig called');
      try {
        const data = await getNextDNSProfileData(
          this,
          this.config.apiKey,
          this.config.profileId,
        );

        data?.denylist.forEach(async (blockedDomain) => {
          const accessory = this.accessories.get(
            getUUID(this.api, blockedDomain.id),
          );
          const service = accessory?.getService(this.Service.Switch);
          if (
            service &&
            service.getCharacteristic(this.Characteristic.On).value !==
              blockedDomain.active
          ) {
            this.log.debug(
              'updating accessory',
              blockedDomain.id,
              blockedDomain.active,
            );
            service?.updateCharacteristic(
              this.Characteristic.On,
              blockedDomain.active,
            );
          }

          const blockedDomainAccessory = this.BlockedDomainAccessories.get(
            getUUID(this.api, blockedDomain.id),
          );

          if (blockedDomainAccessory) {
            this.accessories
              .get('adf')
              ?.getService(this.Service.Switch)
              ?.updateCharacteristic(
                this.Characteristic.On,
                blockedDomain.active,
              );
            blockedDomainAccessory.isOn = blockedDomain.active;
          }
        });
      } catch (error) {
        this.log.warn('Failed to fetch profile:', error);
      }

      setTimeout(syncConfig, 60000);
    };

    syncConfig();
  }

  async blockDomain(domain: string) {
    try {
      const response = await fetch(
        `https://api.nextdns.io/profiles/${this.config.profileId}/denylist/${domain}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
          },
          body: JSON.stringify({
            active: true,
          }),
        },
      );

      if (!response.ok) {
        // create the new domain
        await fetch(
          `https://api.nextdns.io/profiles/${this.config.profileId}/denylist`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.config.apiKey,
            },
            body: JSON.stringify({
              id: domain,
              active: true,
            }),
          },
        );
      }
    } catch (error) {
      this.log.warn('Failed to block domain:', error);
    }
  }

  async unblockDomain(domain: string) {
    try {
      await fetch(
        `https://api.nextdns.io/profiles/${this.config.profileId}/denylist/${domain}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
          },
          body: JSON.stringify({
            active: false,
          }),
        },
      );
    } catch (error) {
      this.log.warn('Failed to unblock domain:', error);
    }
  }
}
