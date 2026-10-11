import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getFacilities().subscribe({
      next: (res) => {
        this.facilities = res.facilities;
        this.states = [...new Set(this.facilities.map((f) => f.address.state))].sort();
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Could not load facility list. Is the backend running on :3001?';
        this.loading = false;
        console.error(err);
      },
    });
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
