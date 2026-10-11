import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Facility, FacilityEvaluation } from '../models/facility.model';

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
}
