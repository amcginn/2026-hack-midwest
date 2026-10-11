import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { FacilityEvaluation, FacilityRoster, Posture, SourceOutcome } from '../../models/facility.model';
import { DecisionLogComponent } from '../decision-log/decision-log.component';

const POSTURE_CLASS: Record<Posture, string> = {
  normal: 'posture-normal',
  delay: 'posture-delay',
  early_dismissal: 'posture-early-dismissal',
  telework_unscheduled_leave: 'posture-telework',
  closure: 'posture-closure',
  unknown: 'posture-unknown',
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
  imports: [CommonModule, FormsModule, DecisionLogComponent],
  templateUrl: './facility-dashboard.component.html',
  styleUrl: './facility-dashboard.component.scss',
})
export class FacilityDashboardComponent implements OnChanges {
  @Input() facilityId: string | null = null;

  @ViewChild(DecisionLogComponent) decisionLog?: DecisionLogComponent;

  evaluation: FacilityEvaluation | null = null;
  roster: FacilityRoster | null = null;
  loading = false;
  error: string | null = null;

  // Record-decision form state. See POST /decisions (server/src/index.ts) --
  // the only route that actually persists an audit record; viewing/
  // refreshing this dashboard does not (changed 2026-10-11, per user).
  decidedPostureOverride = '';
  decidedBy = '';
  decisionNotes = '';
  recordingDecision = false;
  recordedConfirmation: string | null = null;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['facilityId'] && this.facilityId) {
      this.loadEvaluation();
      this.loadRoster();
      this.recordedConfirmation = null;
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
        // Default the override dropdown to the system's current
        // recommendation -- /evaluate itself does NOT persist
        // anything (see recordDecision below for the only action that
        // does).
        this.decidedPostureOverride = res.posture;
      },
      error: (err) => {
        this.error = 'Could not load evaluation for this facility.';
        this.loading = false;
        console.error(err);
      },
    });
  }

  recordDecision(): void {
    if (!this.facilityId || !this.evaluation) return;
    this.recordingDecision = true;
    this.recordedConfirmation = null;

    const isOverride = this.decidedPostureOverride !== this.evaluation.posture;

    this.api
      .recordDecision(this.facilityId, {
        decidedPosture: this.decidedPostureOverride || undefined,
        decidedBy: this.decidedBy || undefined,
        notes: this.decisionNotes || undefined,
      })
      .subscribe({
        next: (record) => {
          this.recordingDecision = false;
          this.recordedConfirmation = isOverride
            ? `Decision recorded: ${record.postureLabel} (overriding the system's ${this.evaluation?.postureLabel} recommendation).`
            : `Decision recorded: ${record.postureLabel}.`;
          // The decision was just persisted server-side -- refresh the
          // log so it appears immediately.
          this.decisionLog?.load();
        },
        error: (err) => {
          this.recordingDecision = false;
          this.recordedConfirmation = null;
          console.error('Could not record decision', err);
        },
      });
  }

  loadRoster(): void {
    if (!this.facilityId) return;
    this.roster = null;

    this.api.getRoster(this.facilityId).subscribe({
      next: (res) => {
        this.roster = res;
      },
      error: (err) => {
        console.error('Could not load roster', err);
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

  todayStatusLabel(status: string): string {
    return TODAY_STATUS_LABELS[status] ?? status;
  }

  remoteStatusLabel(status: string): string {
    return REMOTE_STATUS_LABELS[status] ?? status;
  }
}

// "Today" column -- includes schedule-exception statuses (on_detail,
// telework, leave, in_office_today) in addition to the normal patterns,
// since todayStatus falls back to remoteStatus when there's no
// exception for the day.
const TODAY_STATUS_LABELS: Record<string, string> = {
  in_office: 'In office (normal)',
  full_remote: 'Full remote (normal)',
  hybrid: 'Hybrid (normal)',
  on_detail: 'On detail elsewhere',
  telework: 'Telework today',
  leave: 'On leave',
  // Was "In office today (exception)" -- redundant/clunky next to a
  // scheduleNote that already explains the exception (found via
  // screenshot review, 2026-10-11). The note carries the "why"; the
  // label just needs to state what's true today.
  in_office_today: 'In office today',
};

// "Normal Pattern" column -- only the three steady-state remoteStatus
// values from the employee record itself (see
// server/src/repository/types.ts RemoteStatus), never a schedule
// exception value. Kept as a separate map so this column reads as
// "their baseline," distinct from "today" even when they happen to
// match.
const REMOTE_STATUS_LABELS: Record<string, string> = {
  in_office: 'In office',
  full_remote: 'Full remote',
  hybrid: 'Hybrid',
};
