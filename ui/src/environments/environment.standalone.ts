/**
 * Standalone (no-backend, GitHub Pages) build environment. Swapped in
 * for environment.ts via angular.json's `standalone` build
 * configuration's fileReplacements. Points the ApiService injection
 * token at StandaloneApiService instead, which computes everything
 * client-side via ui/src/app/standalone/ instead of calling the
 * Express server over HTTP. See
 * ui/src/app/services/standalone-api.service.ts module doc.
 */
import { StandaloneApiService } from '../app/services/standalone-api.service';

export const environment = {
  standalone: true,
  apiServiceToken: StandaloneApiService,
};
