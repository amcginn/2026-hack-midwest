import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FacilityPickerComponent } from './components/facility-picker/facility-picker.component';

/**
 * Facility selection navigates to /facility/:facilityId (see
 * app.routes.ts) rather than setting local component state, so a
 * selected facility is a real, shareable/bookmarkable/refreshable URL.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FacilityPickerComponent, RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'USDA Weather-Driven Facility Decisions';

  /** Drives the root-level overview block (app description + data
   * source list) -- shown only when no facility is selected, so the
   * header title doubles as a "go back to the overview" link rather
   * than leaving a dead-end once a facility is picked (found live,
   * 2026-10-11: there was no way back to a landing state other than
   * the dropdowns themselves). */
  atRoot = true;

  constructor(private router: Router) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.atRoot = this.router.url === '/';
    });
  }

  onFacilitySelected(facilityId: string): void {
    this.router.navigate(['/facility', facilityId]);
  }
}
