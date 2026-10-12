/**
 * Drop-in replacement for ApiService (same public method signatures)
 * that computes everything client-side using the ported logic under
 * ui/src/app/standalone/, instead of making HTTP calls to the Express
 * server. Backs the self-contained GitHub Pages build -- see
 * docs/project-scope.md section 6's "Self-contained client-only
 * build" note. All existing components depend on the ApiService
 * injection token, so swapping which service is provided (see
 * app.config.ts) is the only thing that needs to change to switch
 * builds -- no component/template changes.
 */

import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import {
  Facility,
  FacilityEvaluation,
  FacilityRoster,
  DecisionRecord,
  NotificationLogEntry,
  NotificationChannel,
  FacilityLink,
} from '../models/facility.model';
import { getAllFacilities, getFacilityById } from '../standalone/data/facilities';
import { evaluateFacility as runEvaluateFacility, getFacilityRoster, runEvaluationForDecision } from '../standalone/evaluate';
import {
  buildDecisionRecord,
  appendDecisionRecord,
  getAllDecisionRecords,
  getDecisionRecordsForFacility,
} from '../standalone/data/decisionRecords';
import {
  buildNotificationLogEntry,
  appendNotificationLogEntries,
  getNotificationLogForFacility,
} from '../standalone/data/notificationLog';
import {
  getFacilityLinks as readFacilityLinks,
  addFacilityLink as writeFacilityLink,
  removeFacilityLink as deleteFacilityLink,
  isValidHttpUrl,
} from '../standalone/data/facilityLinks';
import { POSTURE_LABELS, type Posture } from '../standalone/evaluator/posture';

@Injectable({
  providedIn: 'root',
})
export class StandaloneApiService {
  getFacilities(): Observable<{ facilities: Facility[] }> {
    return of({ facilities: getAllFacilities() });
  }

  evaluateFacility(facilityId: string, date?: string): Observable<FacilityEvaluation> {
    return from(
      runEvaluateFacility(facilityId, date).then((result) => {
        if (!result) throw new Error(`Unknown facilityId: ${facilityId}`);
        return result;
      }),
    );
  }

  getRoster(facilityId: string, date?: string): Observable<FacilityRoster> {
    const roster = getFacilityRoster(facilityId, date);
    if (!roster) {
      return throwError(() => new Error(`Unknown facilityId: ${facilityId}`));
    }
    return of(roster);
  }

  getDecisionRecords(facilityId?: string): Observable<{ count: number; records: DecisionRecord[] }> {
    const records = facilityId ? getDecisionRecordsForFacility(facilityId) : getAllDecisionRecords();
    return of({ count: records.length, records: records as unknown as DecisionRecord[] });
  }

  recordDecision(
    facilityId: string,
    options: { date?: string; decidedPosture?: string; decidedBy?: string; notes?: string } = {},
  ): Observable<DecisionRecord> {
    const date = options.date ?? new Date().toISOString().slice(0, 10);

    return from(
      runEvaluationForDecision(facilityId, date).then((evalResult) => {
        if (!evalResult) throw new Error(`Unknown facilityId: ${facilityId}`);

        const decidedPosture = (options.decidedPosture as Posture) ?? evalResult.posture;

        const record = buildDecisionRecord({
          facilityId,
          facilityName: evalResult.facility!.name,
          requestedDate: date,
          decidedPosture,
          recommendedPosture: evalResult.posture,
          postureLabel: POSTURE_LABELS[decidedPosture],
          recommendedScore: evalResult.recommendedScore ?? null,
          experimentalBlendedScore: evalResult.experimentalBlendedScore ?? null,
          rationale: evalResult.rationale,
          thresholdCrossed: evalResult.explanation.thresholdCrossed,
          confidence: evalResult.explanation.confidence,
          whatWouldChange: evalResult.explanation.whatWouldChange,
          governmentSourceErrored: evalResult.governmentSourceErrored,
          scoredSources: evalResult.scoredSources,
          excludedSources: evalResult.excludedSources,
          notificationRecipients: evalResult.notificationRecipients,
          sourceErrors: evalResult.sourceErrors,
          decidedBy: options.decidedBy,
          decisionNotes: options.notes,
        });

        appendDecisionRecord(record);
        return record as unknown as DecisionRecord;
      }),
    );
  }

  sendNotifications(
    facilityId: string,
    options: {
      date?: string;
      decisionRecordId?: string | null;
      employeeIds?: string[];
      notifyAll?: boolean;
      channel?: NotificationChannel;
    },
  ): Observable<{ count: number; entries: NotificationLogEntry[] }> {
    const date = options.date ?? new Date().toISOString().slice(0, 10);
    const decisionRecordId = options.decisionRecordId ?? null;
    const notifyAll = options.notifyAll === true;
    const requestedEmployeeIds = options.employeeIds ?? [];
    const channel: NotificationChannel = options.channel === 'sms' ? 'sms' : 'email';

    return from(
      runEvaluationForDecision(facilityId, date).then((evalResult) => {
        if (!evalResult) throw new Error(`Unknown facilityId: ${facilityId}`);

        const targetRecipients = notifyAll
          ? evalResult.notificationRecipients
          : evalResult.notificationRecipients.filter((r) => requestedEmployeeIds.includes(r.employeeId));

        if (targetRecipients.length === 0) {
          throw new Error('No matching recipients to notify. Pass employeeIds or notifyAll=true.');
        }

        const postureLabel = POSTURE_LABELS[evalResult.posture];
        const entries = targetRecipients.map((r) =>
          buildNotificationLogEntry({
            facilityId,
            facilityName: evalResult.facility!.name,
            decisionRecordId,
            posture: evalResult.posture,
            postureLabel,
            employeeId: r.employeeId,
            employeeName: r.name,
            essentialPersonnel: r.essentialPersonnel,
            channel,
            messageText: channel === 'sms' ? r.shortFormMessage ?? r.longFormMessage : r.longFormMessage,
            sentViaBulkAction: notifyAll,
          }),
        );

        appendNotificationLogEntries(entries);
        return { count: entries.length, entries: entries as unknown as NotificationLogEntry[] };
      }),
    );
  }

  getNotificationLog(facilityId: string): Observable<{ count: number; entries: NotificationLogEntry[] }> {
    const entries = getNotificationLogForFacility(facilityId);
    return of({ count: entries.length, entries: entries as unknown as NotificationLogEntry[] });
  }

  getFacility(facilityId: string): Observable<Facility> {
    const facility = getFacilityById(facilityId);
    if (!facility) {
      return throwError(() => new Error(`Unknown facilityId: ${facilityId}`));
    }
    return of(facility);
  }

  getFacilityLinks(facilityId: string): Observable<{ links: FacilityLink[] }> {
    return of({ links: readFacilityLinks(facilityId) });
  }

  addFacilityLink(facilityId: string, label: string, url: string): Observable<FacilityLink> {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();

    if (!trimmedLabel) {
      return throwError(() => new Error('label is required'));
    }
    if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) {
      return throwError(() => new Error('url must be a valid http:// or https:// URL'));
    }

    return of(writeFacilityLink(facilityId, trimmedLabel, trimmedUrl));
  }

  removeFacilityLink(facilityId: string, linkId: string): Observable<void> {
    const removed = deleteFacilityLink(facilityId, linkId);
    if (!removed) {
      return throwError(() => new Error(`Unknown linkId: ${linkId}`));
    }
    return of(undefined);
  }
}
