import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { FacilityPickerComponent } from './components/facility-picker/facility-picker.component';

/**
 * Facility selection navigates to /facility/:facilityId (see
 * app.routes.ts) rather than setting local component state, so a
 * selected facility is a real, shareable/bookmarkable/refreshable URL.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FacilityPickerComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'USDA Weather-Driven Facility Decisions';

  constructor(private router: Router) {}

  onFacilitySelected(facilityId: string): void {
    this.router.navigate(['/facility', facilityId]);
  }
}
