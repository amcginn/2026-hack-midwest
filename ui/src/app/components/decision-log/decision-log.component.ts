import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { DecisionRecord, Posture } from '../../models/facility.model';

// Mirrors server/src/evaluator/posture.ts POSTURE_LABELS -- needed here
// because recommendedPosture is stored on the record as a raw enum
// value, and the override-flag display needs the human label, not
// "telework_unscheduled_leave" (found via screenshot review, 2026-10-11).
const POSTURE_LABELS: Record<Posture, string> = {
  normal: 'Normal Operations',
  delay: 'Delayed Arrival',
  early_dismissal: 'Early Dismissal',
  telework_unscheduled_leave: 'Telework / Unscheduled Leave',
  closure: 'Closure',
  unknown: 'Status Unknown',
};

/**
 * Decision record history for a facility -- deliverable #4
 * ("what was known, when, and what was decided... reconstructable
 * after the fact"). See docs/project-scope.md section 7.
 */
@Component({
  selector: 'app-decision-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './decision-log.component.html',
  styleUrl: './decision-log.component.scss',
})
export class DecisionLogComponent implements OnChanges {
  @Input() facilityId: string | null = null;

  records: DecisionRecord[] = [];
  expandedRecordId: string | null = null;
  loading = false;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['facilityId'] && this.facilityId) {
      // Clear stale state immediately on facility switch -- otherwise
      // the previous facility's records flash briefly before the new
      // fetch resolves, and an expanded record ID from facility A can
      // spuriously (non-)match facility B's record IDs (found live,
      // 2026-10-11).
      this.records = [];
      this.expandedRecordId = null;
      this.load();
    }
  }

  load(): void {
    if (!this.facilityId) return;
    this.loading = true;
    this.api.getDecisionRecords(this.facilityId).subscribe({
      next: (res) => {
        this.records = res.records;
        this.loading = false;
      },
      error: (err) => {
        console.error('Could not load decision records', err);
        this.loading = false;
      },
    });
  }

  toggleExpanded(recordId: string): void {
    this.expandedRecordId = this.expandedRecordId === recordId ? null : recordId;
  }

  postureLabel(posture: Posture | null): string {
    if (!posture) return 'none';
    return POSTURE_LABELS[posture] ?? posture;
  }
}
