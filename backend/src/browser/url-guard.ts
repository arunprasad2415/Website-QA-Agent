import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { config } from '../config.js';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['64:ff9b::', 96]] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (!family) throw new Error(`Not an IP address: ${ip}`);
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export function assertHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are allowed, got "${url.protocol}"`);
  }
  return url;
}

export async function assertAllowedUrl(raw: string): Promise<URL> {
  const url = assertHttpUrl(raw);
  if (config.allowPrivateUrls) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error(`Could not resolve host "${url.hostname}"`);
  }
  if (addresses.some(isPrivateIp)) {
    throw new Error(`Blocked: "${url.hostname}" is a private or local address`);
  }
  return url;
}
