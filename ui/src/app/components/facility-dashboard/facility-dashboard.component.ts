import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { FacilityEvaluation, Posture, SourceOutcome } from '../../models/facility.model';

const POSTURE_CLASS: Record<Posture, string> = {
  normal: 'posture-normal',
  delay: 'posture-delay',
  early_dismissal: 'posture-early-dismissal',
  telework_unscheduled_leave: 'posture-telework',
  closure: 'posture-closure',
};

/**
 * Per-source severity classification, mirroring server's
 * evaluator/posture.ts bucket boundaries but applied per-source rather
 * than only to the aggregate. Lets each source card carry its own
 * color/icon cue so a judge can scan the dashboard at a glance rather
 * than reading every note to find what's actually abnormal.
 */
export type SourceSeverityClass = 'severity-none' | 'severity-low' | 'severity-moderate' | 'severity-high' | 'severity-severe';

const SEVERITY_ICON: Record<SourceSeverityClass, string> = {
  'severity-none': '✓',
  'severity-low': '⚠',
  'severity-moderate': '⚠',
  'severity-high': '⛔',
  'severity-severe': '⛔',
};

function scoreToSeverityClass(score: number | undefined): SourceSeverityClass {
  if (score === undefined) return 'severity-none';
  if (score < 0.5) return 'severity-none';
  if (score < 1.5) return 'severity-low';
  if (score < 2.5) return 'severity-moderate';
  if (score < 3.5) return 'severity-high';
  return 'severity-severe';
}

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

  sourceSeverityClass(source: SourceOutcome): SourceSeverityClass {
    if (source.status !== 'scored') return 'severity-none';
    return scoreToSeverityClass(source.postureScore);
  }

  sourceSeverityIcon(source: SourceOutcome): string {
    return SEVERITY_ICON[this.sourceSeverityClass(source)];
  }
}
