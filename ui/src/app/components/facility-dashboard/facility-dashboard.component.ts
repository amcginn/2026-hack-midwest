import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  FacilityEvaluation,
  FacilityRoster,
  Posture,
  SourceOutcome,
  NotificationRecipient,
  NotificationChannel,
} from '../../models/facility.model';
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
 * color/icon cue so a reader can scan the dashboard at a glance rather
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

/** Format a Date as YYYY-MM-DD for an <input type="date"> value, using
 * local time (not UTC) so "today" matches what the user's clock says. */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  imports: [CommonModule, FormsModule, RouterLink, DecisionLogComponent],
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
  decisionDate = toDateInputValue(new Date());
  decidedPostureOverride = '';
  decidedBy = '';
  decisionNotes = '';
  recordingDecision = false;
  recordedConfirmation: string | null = null;

  // Notification send state. See POST /notifications (server/src/index.ts) --
  // a separate action/audit trail from decision records (per user,
  // 2026-10-11: "I'd say audit as a separate log"). Nothing here is
  // auto-triggered by viewing the dashboard -- only an explicit
  // Notify/Notify All click persists anything, same explicit-action
  // philosophy as the decision form.
  recipientChannel: Record<string, NotificationChannel> = {};
  notifyingEmployeeId: string | null = null;
  notifiedConfirmationByEmployee: Record<string, string> = {};
  notifyingAll = false;
  notifyAllConfirmation: string | null = null;
  /** "Skip confirmation" checkbox -- per user: "possibly have a check
   * box to be the equivalent to clicking notify all anyway (still
   * separate log, fewer clicks)." Does not skip logging, only skips
   * the browser confirm() prompt before a bulk send. */
  skipNotifyAllConfirm = false;
  previewEmployeeId: string | null = null;

  /** Whether the full Notify/Notify All panel is shown. Defaults
   * collapsed when posture is "normal" (nothing warrants proactively
   * notifying anyone -- see loadEvaluation below) but stays reachable
   * with one click, since a facility manager may need to notify
   * everyone for a reason outside the tracked data sources entirely
   * (e.g. a power outage) -- the system's job is to surface what it
   * knows, not to gate actions it didn't anticipate. */
  notifyPanelExpanded = false;

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

        // Default each recipient's channel to email. SMS is disabled
        // in the template only when shortFormMessage is genuinely
        // null -- every posture (including "normal," added
        // 2026-10-13) now has a real short form, so this fallback is
        // effectively unreachable today but left in place for safety
        // if a future posture is added without one.
        this.recipientChannel = {};
        for (const r of res.notification.recipients) {
          this.recipientChannel[r.employeeId] = 'email';
        }
        this.notifiedConfirmationByEmployee = {};
        this.notifyAllConfirmation = null;
        this.previewEmployeeId = res.notification.recipients[0]?.employeeId ?? null;
        // Auto-expand for any non-normal posture (there's something
        // worth notifying about); auto-collapse back to the minimal
        // summary for normal. Re-evaluated on every load, not just
        // once, so switching facilities or re-evaluating always
        // reflects the CURRENT posture's default, not a stale
        // expand/collapse choice from a previous posture.
        this.notifyPanelExpanded = res.posture !== 'normal';
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

    const recommendedLabel = this.evaluation.postureLabel;

    this.api
      .recordDecision(this.facilityId, {
        date: this.decisionDate || undefined,
        decidedPosture: this.decidedPostureOverride || undefined,
        decidedBy: this.decidedBy || undefined,
        notes: this.decisionNotes || undefined,
      })
      .subscribe({
        next: (record) => {
          this.recordingDecision = false;
          this.recordedConfirmation = isOverride
            ? `Decision recorded for ${record.requestedDate}: ${record.postureLabel} (overriding the system's ${recommendedLabel} recommendation).`
            : `Decision recorded for ${record.requestedDate}: ${record.postureLabel}.`;
          // Clear the form on successful submission -- a recorded
          // decision is done; leaving stale notes/decidedBy in the
          // fields invites accidental re-submission or confusion about
          // whether the next action is already filled in (found via
          // screenshot review, 2026-10-11). Reset the override back to
          // the current recommendation and the date back to today, not
          // left on whatever was just submitted.
          this.decisionDate = toDateInputValue(new Date());
          this.decidedPostureOverride = this.evaluation?.posture ?? '';
          this.decidedBy = '';
          this.decisionNotes = '';
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

  isDecisionDateToday(): boolean {
    return this.decisionDate === toDateInputValue(new Date());
  }

  /** Native <details> toggle event's target is a plain EventTarget,
   * not typed with `open` -- cast through HTMLDetailsElement here so
   * the template doesn't need an inline `as` cast. */
  onNotifyExpandToggle(event: Event): void {
    const details = event.target as HTMLDetailsElement;
    this.notifyPanelExpanded = details.open;
  }

  notifyOne(recipient: NotificationRecipient): void {
    if (!this.facilityId) return;
    this.notifyingEmployeeId = recipient.employeeId;

    const channel = this.recipientChannel[recipient.employeeId] ?? 'email';

    this.api
      .sendNotifications(this.facilityId, {
        date: this.decisionDate || undefined,
        employeeIds: [recipient.employeeId],
        channel,
      })
      .subscribe({
        next: () => {
          this.notifyingEmployeeId = null;
          this.notifiedConfirmationByEmployee[recipient.employeeId] =
            `Notified ${recipient.name} via ${channel === 'sms' ? 'SMS' : 'email'} at ${new Date().toLocaleTimeString()}.`;
          this.decisionLog?.loadNotificationLog();
        },
        error: (err) => {
          this.notifyingEmployeeId = null;
          console.error('Could not send notification', err);
        },
      });
  }

  notifyAll(): void {
    if (!this.facilityId || !this.evaluation) return;

    const count = this.evaluation.notification.recipientCount;
    if (!this.skipNotifyAllConfirm) {
      const confirmed = window.confirm(
        `Notify all ${count} recipient${count === 1 ? '' : 's'} for ${this.evaluation.facilityName}?`,
      );
      if (!confirmed) return;
    }

    this.notifyingAll = true;
    this.notifyAllConfirmation = null;

    // Group recipients by their individually-selected channel (found
    // live: this previously always sent "email" for every recipient,
    // silently ignoring each row's own channel dropdown). The server
    // route takes one channel per request, so "Notify All" issues one
    // request per distinct channel actually selected, rather than
    // changing the server's request contract under time pressure.
    const recipients = this.evaluation.notification.recipients;
    const groups = new Map<NotificationChannel, string[]>();
    for (const r of recipients) {
      const channel: NotificationChannel = this.recipientChannel[r.employeeId] ?? 'email';
      const ids = groups.get(channel) ?? [];
      ids.push(r.employeeId);
      groups.set(channel, ids);
    }

    const requests = Array.from(groups.entries()).map(([channel, employeeIds]) =>
      this.api.sendNotifications(this.facilityId!, {
        date: this.decisionDate || undefined,
        employeeIds,
        channel,
      }),
    );

    forkJoin(requests).subscribe({
      next: (results) => {
        this.notifyingAll = false;
        const totalCount = results.reduce((sum, res) => sum + res.count, 0);
        this.notifyAllConfirmation = `Notified ${totalCount} recipient${totalCount === 1 ? '' : 's'} at ${new Date().toLocaleTimeString()} (channel per recipient's selection).`;
        this.decisionLog?.loadNotificationLog();
      },
      error: (err) => {
        this.notifyingAll = false;
        console.error('Could not send bulk notification', err);
      },
    });
  }

  /** Drafted message text for the copy/paste preview box -- per user
   * (2026-10-11): "we may also have a text box with the email/template
   * to copy/paste in case it needs to be sent to someone else too."
   * Does not send or log anything; purely a read-only display. */
  previewMessageText(): string {
    if (!this.evaluation || !this.previewEmployeeId) return '';
    const recipient = this.evaluation.notification.recipients.find((r) => r.employeeId === this.previewEmployeeId);
    return recipient?.longFormMessage ?? '';
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

  /** Highest-score-first, so the source actually driving the
   * recommendation is always the first card, not buried among other
   * concurrent alerts (found live, 2026-10-11 -- San Diego's zone had
   * 9 simultaneous alerts rendering in whatever order NWS returned
   * them, with no visual cue for which one mattered). */
  sortedBySeverity(sources: SourceOutcome[]): SourceOutcome[] {
    return [...sources].sort((a, b) => (b.postureScore ?? -1) - (a.postureScore ?? -1));
  }

  /** True if this source's score matches the recommendation's overall
   * score -- i.e. it's (one of) the source(s) that actually drove the
   * posture. Matching by score rather than a dedicated backend field
   * since the exact drivingSource object isn't currently exposed on
   * the API response; a tie between two equally-severe sources is
   * rare and both legitimately deserve the badge if it happens. */
  isDrivingSource(source: SourceOutcome): boolean {
    if (!this.evaluation || this.evaluation.recommendedScore === null) return false;
    return source.postureScore === this.evaluation.recommendedScore;
  }

  /**
   * NWS sometimes issues the same warning as multiple zone-scoped CAP
   * records (confirmed live, 2026-10-11 -- see server/src/sources/nws.ts
   * collapseByHeadline). The server merges these into one source card
   * with `affectedAreaGroups` holding the full per-zone area text, so
   * the dashboard can show one clean card by default while still
   * surfacing why/where it applies on demand instead of either hiding
   * the detail entirely or repeating the same card 3 times.
   */
  /**
   * One bullet per distinct area description. For a facility whose
   * warning NWS reported as a single zone record, this is one entry
   * (`areaDesc`). For a warning NWS fanned across multiple zone
   * records with the same headline (merged server-side -- see
   * server/src/sources/nws.ts collapseByHeadline), this is each
   * record's area text. Always a plain visible list, not hidden
   * behind a disclosure -- the text isn't long enough to justify
   * hiding it, and a facility with only one area shouldn't need
   * different UI from one with three (simplified from an earlier
   * expand/collapse version, 2026-10-11).
   */
  affectedAreas(source: SourceOutcome): string[] {
    const groups = source.detail?.['affectedAreaGroups'];
    if (Array.isArray(groups) && groups.length > 0) {
      return groups as string[];
    }
    const single = source.detail?.['areaDesc'];
    return typeof single === 'string' && single.length > 0 ? [single] : [];
  }

  /** Typed accessor for a date-like string field inside the generic
   * `detail` bag, so the `date` pipe (which needs string|number|Date,
   * not `unknown`) can bind to it directly in the template. */
  detailDate(source: SourceOutcome, key: string): string | null {
    const value = source.detail?.[key];
    return typeof value === 'string' ? value : null;
  }

  /** Format an ISO timestamp in ITS OWN embedded UTC offset, not the
   * browser's local timezone -- found live, 2026-10-11: Angular's
   * `date` pipe with no explicit timezone silently converts to
   * whatever zone the viewer's browser is in, with no indication it
   * did so. For a facility manager checking a DIFFERENT facility's
   * alert times (e.g. an Iowa-based viewer checking Great Falls, MT),
   * that's actively misleading -- what matters operationally is the
   * facility's own local time, not the viewer's. NWS/NWPS/AQICN
   * timestamps all already carry a real fixed UTC offset (e.g.
   * "-07:00"), so no IANA timezone lookup/DST-abbreviation guessing is
   * needed -- just render using the offset already in the string. */
  formatWithOffset(isoString: string | null): string {
    if (!isoString) return '';
    const offsetMatch = isoString.match(/([+-]\d{2}:\d{2})$/);
    const offset = offsetMatch ? offsetMatch[1] : null;

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    if (!offset) {
      // No offset in the string (e.g. a Z/UTC timestamp, or our own
      // clock) -- fall back to a plain UTC-labeled render rather than
      // silently using browser-local with no label either.
      return `${date.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`;
    }

    const sign = offset[0];
    const [offsetHours] = offset.slice(1).split(':').map(Number);
    const offsetMinutes = Number(offset.slice(1).split(':')[1]);
    const totalOffsetMinutes = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes);

    // Shift the UTC time by the embedded offset, then render those
    // shifted fields as if they were UTC (so toLocaleString doesn't
    // re-apply the BROWSER's own zone on top).
    const shifted = new Date(date.getTime() + totalOffsetMinutes * 60000);
    const formatted = shifted.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
    return `${formatted} (UTC${offset})`;
  }

  todayStatusLabel(status: string): string {
    return TODAY_STATUS_LABELS[status] ?? status;
  }

  notificationReasonLabel(reason: NotificationRecipient['reason']): string {
    return NOTIFICATION_REASON_LABELS[reason] ?? reason;
  }

  remoteStatusLabel(status: string): string {
    return REMOTE_STATUS_LABELS[status] ?? status;
  }

  /**
   * Renders the server's `**posture label**` emphasis markers (see
   * rationale/templates.ts) as real <strong> HTML, so the recommended
   * posture visually stands out in the rationale paragraph instead of
   * reading as plain, undifferentiated prose. The rationale text is
   * server-templated (never raw user input), and any dynamic values
   * interpolated into it (facility name, posture label) come from our
   * own fixed data/enums -- not free-text user entry -- so innerHTML
   * here isn't an XSS vector. HTML-escape first regardless, as a
   * defensive habit rather than because a real injection path exists.
   */
  renderRationale(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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

// Notification recipient "reason" column -- added
// essential_despite_schedule_exception 2026-10-11 when the backend
// stopped silently notifying essential personnel who were actually on
// leave (not an exception worth notifying for at all -- see
// repository/applicability.ts module doc) while still correctly
// notifying essential staff who are on_detail/telework (still working,
// just not here).
const NOTIFICATION_REASON_LABELS: Record<string, string> = {
  home_facility_normal: 'Normal roster',
  in_office_today_exception: 'In office today (exception)',
  essential_despite_schedule_exception: 'Essential — notified despite schedule exception',
};
