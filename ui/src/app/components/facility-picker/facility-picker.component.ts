import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { Facility } from '../../models/facility.model';

/**
 * "Pick a state, pick an office" multi-facility picker.
 * See docs/project-scope.md section 6 UI delighter #2 -- proves a
 * super-user/oversight role can browse across facilities, not just a
 * single-facility-manager view. Only a few seeded facilities, not
 * meant to imply full nationwide coverage.
 */
@Component({
  selector: 'app-facility-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './facility-picker.component.html',
  styleUrl: './facility-picker.component.scss',
})
export class FacilityPickerComponent implements OnInit {
  @Output() facilitySelected = new EventEmitter<string>();

  facilities: Facility[] = [];
  states: string[] = [];
  selectedState = '';
  selectedFacilityId = '';
  loading = true;
  error: string | null = null;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.api.getFacilities().subscribe({
      next: (res) => {
        this.facilities = res.facilities;
        this.states = [...new Set(this.facilities.map((f) => f.address.state))].sort();
        this.loading = false;
        this.syncFromCurrentRoute();
      },
      error: (err) => {
        this.error = 'Could not load facility list. Is the backend running on :3001?';
        this.loading = false;
        console.error(err);
      },
    });

    // Keep the picker's dropdowns in sync with direct navigation/deep
    // links to /facility/:facilityId, not just picker-driven selection.
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.syncFromCurrentRoute();
    });
  }

  /** Reads the current /facility/:facilityId route (if any) and
   * pre-selects the matching state/office in the dropdowns, so a
   * refreshed or directly-visited URL shows a consistent picker state
   * rather than blank dropdowns next to a populated dashboard. */
  private syncFromCurrentRoute(): void {
    if (this.facilities.length === 0) return;

    const urlFacilityId = this.router.url.match(/\/facility\/([^/?#]+)/)?.[1];

    // Navigated away from any /facility/:id route (e.g. the header
    // title link back to "/") -- clear the dropdowns so they don't
    // keep showing a stale selection next to the root overview (found
    // live, 2026-10-11: clicking the title link correctly navigated
    // and showed the overview, but left both dropdowns populated,
    // looking like a facility was still selected).
    if (!urlFacilityId) {
      if (this.selectedState || this.selectedFacilityId) {
        this.selectedState = '';
        this.selectedFacilityId = '';
      }
      return;
    }

    if (urlFacilityId === this.selectedFacilityId) return;

    const facility = this.facilities.find((f) => f.facilityId === urlFacilityId);
    if (!facility) return;

    this.selectedState = facility.address.state;
    this.selectedFacilityId = facility.facilityId;
  }

  get facilitiesInSelectedState(): Facility[] {
    return this.facilities.filter((f) => f.address.state === this.selectedState);
  }

  onStateChange(state: string): void {
    this.selectedState = state;
    this.selectedFacilityId = '';
  }

  onFacilityChange(facilityId: string): void {
    this.selectedFacilityId = facilityId;
    if (facilityId) {
      this.facilitySelected.emit(facilityId);
    }
  }
}
