import { Routes } from '@angular/router';
import { FacilityViewComponent } from './components/facility-view/facility-view.component';
import { FacilityEditComponent } from './components/facility-edit/facility-edit.component';

export const routes: Routes = [
  { path: 'facility/:facilityId', component: FacilityViewComponent },
  { path: 'facility/:facilityId/edit', component: FacilityEditComponent },
  { path: '', pathMatch: 'full', redirectTo: '' },
];
