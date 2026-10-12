import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FacilityDashboardComponent } from '../facility-dashboard/facility-dashboard.component';
import { ApiService } from '../../services/api.service';

/**
 * Route-level wrapper for /facility/:facilityId -- reads the facility
 * ID from the route param (via the paramMap observable, so navigating
 * directly between two facility routes re-triggers the dashboard load
 * without a full component re-create) rather than from component
 * state, so a selected facility is a real, shareable/bookmarkable/
 * refreshable URL per the user's request.
 *
 * Unknown facility IDs (e.g. a stale bookmark, or a typo'd URL)
 * redirect straight back to '/' rather than rendering a dedicated 404
 * page -- not worth building out for this app's scope (per user,
 * 2026-10-13). Checked via a lightweight getFacility() call rather
 * than letting the dashboard's evaluate call fail into its generic
 * error message, since that message doesn't distinguish "this
 * facility doesn't exist" from "a live data source is down" and a
 * silent redirect is a cleaner outcome for the former.
 */
@Component({
  selector: 'app-facility-view',
  standalone: true,
  imports: [CommonModule, FacilityDashboardComponent],
  templateUrl: './facility-view.component.html',
  styleUrl: './facility-view.component.scss',
})
export class FacilityViewComponent {
  facilityId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
  ) {
    this.route.paramMap.subscribe((params) => {
      const facilityId = params.get('facilityId');
      this.api.getFacility(facilityId ?? '').subscribe({
        next: () => {
          this.facilityId = facilityId;
        },
        error: () => {
          this.router.navigate(['/']);
        },
      });
    });
  }
}
