import { parse as parseUrl } from 'url';
import { Route, isHandler, HandleValue } from '@vercel/routing-utils';
import PCRE from 'pcre-to-regexp';

import isURL from './util/is-url';
import { RouteResult, HTTPHeaders } from './types';

/**
 *
 * @param str
 * @param match
 * @param keys
 */
function resolveRouteParameters(
  str: string,
  match: string[],
  keys: string[]
): string {
  return str.replace(/\$([1-9a-zA-Z]+)/g, (_, param) => {
    let matchIndex: number = keys.indexOf(param);
    if (matchIndex === -1) {
      // It's a number match, not a named capture
      matchIndex = parseInt(param, 10);
    } else {
      // For named captures, add one to the `keys` index to
      // match up with the RegExp group matches
      matchIndex++;
    }
    return match[matchIndex] || '';
  });
}

export class Proxy {
  routes: Route[];
  lambdaRoutes: Set<string>;
  staticRoutes: Set<string>;

  constructor(routes: Route[], lambdaRoutes: string[], staticRoutes: string[]) {
    this.routes = routes;
    this.lambdaRoutes = new Set<string>(lambdaRoutes);
    this.staticRoutes = new Set<string>(staticRoutes);

    console.log('this.lambdaRoutes', this.lambdaRoutes)
  }

  _checkFileSystem = (path: string) => {
    return this.staticRoutes.has(path);
  };

  route(reqUrl: string) {
    const parsedUrl = parseUrl(reqUrl, true);
    let query = parsedUrl.query;
    let reqPathname = parsedUrl.pathname ?? '/';
    let result: RouteResult | undefined;
    let status: number | undefined;
    let isContinue = false;
    let idx = -1;
    let phase: HandleValue | null = null;
    let combinedHeaders: HTTPHeaders = {};

    for (const routeConfig of this.routes) {
      /**
       * This is how the routing basically works
       * 1. Checks if the route is an exact match to a route in the
       *    S3 filesystem (e.g. /test.html -> s3://test.html)
       *    --> true: returns found in filesystem
       * 2.
       *
       */

      idx++;
      isContinue = false;

      //////////////////////////////////////////////////////////////////////////
      // Phase 1: Check for filesystem
      if (isHandler(routeConfig)) {
        phase = routeConfig.handle;

        // Check if the path is a static file that should be served from the
        // filesystem
        if (routeConfig.handle === 'filesystem') {
          // Check if the route matches a route from the filesystem
          if (this._checkFileSystem(reqPathname)) {
            result = {
              found: true,
              target: 'filesystem',
              dest: reqPathname,
              headers: combinedHeaders,
              continue: false,
              isDestUrl: false,
            };
            break;
          }
        }

        continue;
      }

      //////////////////////////////////////////////////////////////////////////
      // Phase 2:
      const { src, headers } = routeConfig;
      let keys: string[] = []; // Filled by PCRE in next step
      // Note: Routes are case-insensitive
      // PCRE tries to match the path to the regex of the route
      // It also parses the parameters to the keys variable
      const matcher = PCRE(`%${src}%i`, keys);
      const match =
        matcher.exec(reqPathname) || matcher.exec(reqPathname!.substring(1));

      if (match) {
        console.log('Match', src);

        // The path that should be sent to the target system (lambda or filesystem)
        let destPath: string = reqPathname;

        if (routeConfig.dest) {
          // Fix for next.js 9.5+: Removes querystring from slug URLs
          destPath = parseUrl(
            resolveRouteParameters(routeConfig.dest, match, keys)
          ).pathname!;
        }

        if (headers) {
          for (const originalKey of Object.keys(headers)) {
            const lowerKey = originalKey.toLowerCase();
            const originalValue = headers[originalKey];
            const value = resolveRouteParameters(originalValue, match, keys);
            combinedHeaders[lowerKey] = value;
          }
        }

        if (routeConfig.continue) {
          if (routeConfig.status) {
            status = routeConfig.status;
          }
          reqPathname = destPath;
          isContinue = true;
          continue;
        }

        if (routeConfig.check && phase !== 'hit') {
          if (!this.lambdaRoutes.has(destPath)) {

            // console.log('this.lambdaRoutes', this.lambdaRoutes)
            reqPathname = destPath;
            console.log('HERE!', reqPathname);
            // TODO: We should break here!
            continue;
          }
        }

        console.log('destPath', destPath);
        const isDestUrl = isURL(destPath);

        if (isDestUrl) {
          result = {
            found: true,
            dest: destPath,
            continue: isContinue,
            userDest: false,
            isDestUrl,
            status: routeConfig.status || status,
            uri_args: query,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
            headers: combinedHeaders,
          };
          break;
        } else {
          if (!destPath.startsWith('/')) {
            destPath = `/${destPath}`;
          }
          const destParsed = parseUrl(destPath, true);
          Object.assign(destParsed.query, query);
          result = {
            found: true,
            dest: destParsed.pathname || '/',
            continue: isContinue,
            userDest: Boolean(routeConfig.dest),
            isDestUrl,
            status: routeConfig.status || status,
            uri_args: destParsed.query,
            matched_route: routeConfig,
            matched_route_idx: idx,
            phase,
            headers: combinedHeaders,
          };
          break;
        }
      }
    }

    if (!result) {
      result = {
        found: false,
        dest: reqPathname,
        continue: isContinue,
        status,
        isDestUrl: false,
        uri_args: query,
        phase,
        headers: combinedHeaders,
      };
    }

    return result;
  }
}
