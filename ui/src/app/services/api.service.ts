import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Facility, FacilityEvaluation, FacilityRoster, DecisionRecord } from '../models/facility.model';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  // Local-dev backend per docs/project-scope.md section 6 -- not
  // environment-configurable yet, hardcoded for the hackathon demo.
  private readonly baseUrl = 'http://localhost:3001';

  constructor(private http: HttpClient) {}

  getFacilities(): Observable<{ facilities: Facility[] }> {
    return this.http.get<{ facilities: Facility[] }>(`${this.baseUrl}/api/facilities`);
  }

  evaluateFacility(facilityId: string, date?: string): Observable<FacilityEvaluation> {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.http.get<FacilityEvaluation>(
      `${this.baseUrl}/api/facilities/${encodeURIComponent(facilityId)}/evaluate${params}`,
    );
  }

  getRoster(facilityId: string, date?: string): Observable<FacilityRoster> {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.http.get<FacilityRoster>(
      `${this.baseUrl}/api/facilities/${encodeURIComponent(facilityId)}/roster${params}`,
    );
  }

  getDecisionRecords(facilityId?: string): Observable<{ count: number; records: DecisionRecord[] }> {
    const params = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
    return this.http.get<{ count: number; records: DecisionRecord[] }>(`${this.baseUrl}/api/decision-records${params}`);
  }

  recordDecision(
    facilityId: string,
    options: { date?: string; decidedPosture?: string; decidedBy?: string; notes?: string } = {},
  ): Observable<DecisionRecord> {
    return this.http.post<DecisionRecord>(
      `${this.baseUrl}/api/facilities/${encodeURIComponent(facilityId)}/decisions`,
      options,
    );
  }
}
