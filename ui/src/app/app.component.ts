import { Component } from '@angular/core';
import { FacilityPickerComponent } from './components/facility-picker/facility-picker.component';
import { FacilityDashboardComponent } from './components/facility-dashboard/facility-dashboard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FacilityPickerComponent, FacilityDashboardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'USDA Weather-Driven Facility Decisions';
  selectedFacilityId: string | null = null;

  onFacilitySelected(facilityId: string): void {
    this.selectedFacilityId = facilityId;
  }
}
