/**
 * Default (client/server) build environment. Swapped out for
 * environment.standalone.ts via angular.json's `standalone` build
 * configuration's fileReplacements -- see that config for the
 * GitHub Pages / no-backend build.
 *
 * `apiServiceToken` is null here -- the default build uses
 * ApiService's own `providedIn: 'root'` registration directly, with
 * no alias. (A `useExisting: ApiService` self-alias in app.config.ts
 * previously caused NG0200 "Circular dependency in DI detected,"
 * since it told the injector "to resolve ApiService, resolve
 * ApiService.") Only environment.standalone.ts sets a real class
 * here, pointing the ApiService token at a *different* class
 * (StandaloneApiService).
 */
export const environment = {
  standalone: false,
  apiServiceToken: null as unknown as new (...args: any[]) => unknown,
};
