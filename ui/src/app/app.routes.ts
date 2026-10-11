import { Routes } from '@angular/router';
import { FacilityViewComponent } from './components/facility-view/facility-view.component';

export const routes: Routes = [
  { path: 'facility/:facilityId', component: FacilityViewComponent },
  { path: '', pathMatch: 'full', redirectTo: '' },
];
