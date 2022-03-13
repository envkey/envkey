import * as R from "ramda";
import ipaddr from "ipaddr.js";

const IP_LIST_SPLIT_REGEX = /[,;\n\r]\s*/;

export const isValidIP = (s: string) => {
    try {
      ipaddr.parse(s);
      return true;
    } catch (err) {
      return false;
    }
  },
  parseIP = (s: string) => {
    try {
      const res = ipaddr.parse(s);
      return res;
    } catch (err) {
      return undefined;
    }
  },
  isValidCIDR = (s: string) => {
    try {
      ipaddr.parseCIDR(s);
      return true;
    } catch (err) {
      return false;
    }
  },
  parseCIDR = (s: string) => {
    try {
      const res = ipaddr.parseCIDR(s);
      return res;
    } catch (err) {
      return undefined;
    }
  },
  isValidIPOrCIDR = (s: string) => R.anyPass([isValidCIDR, isValidIP])(s),
  isValidIPString = R.pipe(
    R.split(IP_LIST_SPLIT_REGEX),
    R.all(isValidIPOrCIDR)
  ) as (s: string) => boolean,
  ipMatchesAny = (checkIp: string, ipList: string[]) => {
    const parsedCurrentIp = ipaddr.parse(checkIp);
    for (let ip of ipList) {
      const parsedCIDR = parseCIDR(ip);
      if (parsedCIDR) {
        if (parsedCurrentIp.match(parsedCIDR)) {
          return true;
        }
      } else {
        const parsedIP = parseIP(ip);
        if (parsedIP && parsedIP.toString() == parsedCurrentIp.toString()) {
          return true;
        }
      }
    }
    return false;
  };
