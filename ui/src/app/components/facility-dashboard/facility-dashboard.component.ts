import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { FacilityEvaluation, Posture } from '../../models/facility.model';

const POSTURE_CLASS: Record<Posture, string> = {
  normal: 'posture-normal',
  delay: 'posture-delay',
  early_dismissal: 'posture-early-dismissal',
  telework_unscheduled_leave: 'posture-telework',
  closure: 'posture-closure',
};

@Component({
  selector: 'app-facility-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './facility-dashboard.component.html',
  styleUrl: './facility-dashboard.component.scss',
})
export class FacilityDashboardComponent implements OnChanges {
  @Input() facilityId: string | null = null;

  evaluation: FacilityEvaluation | null = null;
  loading = false;
  error: string | null = null;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['facilityId'] && this.facilityId) {
      this.loadEvaluation();
    }
  }

  loadEvaluation(): void {
    if (!this.facilityId) return;
    this.loading = true;
    this.error = null;
    this.evaluation = null;

    this.api.evaluateFacility(this.facilityId).subscribe({
      next: (res) => {
        this.evaluation = res;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Could not load evaluation for this facility.';
        this.loading = false;
        console.error(err);
      },
    });
  }

  postureClass(posture: Posture): string {
    return POSTURE_CLASS[posture] ?? '';
  }
}
