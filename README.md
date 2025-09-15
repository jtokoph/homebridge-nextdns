# Homebridge Plugin for NextDNS

A Homebridge plugin for NextDNS that leverages the [NextDNS API](https://nextdns.github.io/api/) to toggle preferences. This was initially created because I wanted to be able to block and unblock certain sites at the DNS level via HomeKit (e.g. "Siri, turn off 'Reddit Block'")

Currently this only supports configuring a list of domains that you want to be able to quickly deny/undeny via the Denylist.

## Installation

`npm install -g homebridge-nextdns` or search for nextdns in the homebridge ui.

## Configuration

- **apiKey**: Get this from https://my.nextdns.io/account
- **profileID**: Get this from https://my.nextdns.io/{PROFILE_ID}/setup when logged in.
- **blockedDomains**: Array of domain names to block (e.g. `reddit.com`)

## Future ideas

- Allowlist toggles
- Blocklist toggles
- Security and Privacy toggles

## Contribution

### Publish Package

```shell
npm publish
```

#### Publishing Beta Versions

You can publish *beta* versions of your plugin for other users to test before you release it to everyone.

```shell
# create a new pre-release version (eg. 2.1.0-beta.1)
npm version prepatch --preid beta

# publish to @beta
npm publish --tag beta
```

Users can then install the  *beta* version by appending `@beta` to the install command, for example:

```shell
sudo npm install -g homebridge-nextdns@beta
```
