import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { DecisionRecord } from '../../models/facility.model';

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
}
