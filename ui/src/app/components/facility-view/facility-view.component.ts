import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FacilityDashboardComponent } from '../facility-dashboard/facility-dashboard.component';

/**
 * Route-level wrapper for /facility/:facilityId -- reads the facility
 * ID from the route param (via the paramMap observable, so navigating
 * directly between two facility routes re-triggers the dashboard load
 * without a full component re-create) rather than from component
 * state, so a selected facility is a real, shareable/bookmarkable/
 * refreshable URL per the user's request.
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

  constructor(private route: ActivatedRoute) {
    this.route.paramMap.subscribe((params) => {
      this.facilityId = params.get('facilityId');
    });
  }
}
