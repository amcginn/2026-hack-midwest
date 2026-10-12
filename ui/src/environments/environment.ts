/**
 * Default (client/server) build environment. Swapped out for
 * environment.standalone.ts via angular.json's `standalone` build
 * configuration's fileReplacements -- see that config for the
 * GitHub Pages / no-backend build.
 */
import { ApiService } from '../app/services/api.service';

export const environment = {
  standalone: false,
  apiServiceToken: ApiService,
};
