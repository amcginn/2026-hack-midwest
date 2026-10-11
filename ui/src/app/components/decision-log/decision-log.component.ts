import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { DecisionRecord, NotificationLogEntry, Posture } from '../../models/facility.model';

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

  /** Fallback for records persisted before thresholdCrossed/confidence/
   * whatWouldChange existed (added 2026-10-11) -- an older JSONL record
   * simply won't have these fields, which otherwise renders as a blank
   * line next to the label with no explanation. An em dash reads as
   * "not available," not as a bug. */
  readonly notRecordedText = '— not recorded for this decision';

  records: DecisionRecord[] = [];
  expandedRecordId: string | null = null;
  loading = false;

  // Separate audit trail -- notifications and decisions are
  // independent actions (see decision-log.component.html's
  // "notification-log" section doc comment above).
  notificationEntries: NotificationLogEntry[] = [];
  notificationLogLoading = false;

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
      this.notificationEntries = [];
      this.load();
      this.loadNotificationLog();
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

  /** Public so the dashboard can trigger a refresh right after a
   * Notify/Notify All action succeeds -- same pattern as `load()`
   * being called after a decision is recorded. */
  loadNotificationLog(): void {
    if (!this.facilityId) return;
    this.notificationLogLoading = true;
    this.api.getNotificationLog(this.facilityId).subscribe({
      next: (res) => {
        this.notificationEntries = res.entries;
        this.notificationLogLoading = false;
      },
      error: (err) => {
        console.error('Could not load notification log', err);
        this.notificationLogLoading = false;
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

  /** Same emphasis-marker rendering as facility-dashboard -- see that
   * component's renderRationale for why innerHTML is safe here. */
  renderRationale(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}
