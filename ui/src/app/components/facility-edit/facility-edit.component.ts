import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Facility, FacilityLink } from '../../models/facility.model';

/**
 * Facility edit page -- route /facility/:facilityId/edit.
 *
 * SCOPE (per user, 2026-10-11): only `customLinks` is genuinely
 * editable here. Everything else about the facility (name, address,
 * coordinates, hours, accessibilityNotes, riverGaugeId) is shown
 * READ-ONLY. This isn't a UI limitation -- facilities.yaml is
 * hand-authored seed data loaded once into memory at server start
 * (see server/src/repository/facilities.ts), and nothing writes back
 * to it. Making coordinates/riverGaugeId editable specifically would
 * also carry real correctness risk: a bad lat/lon edit would silently
 * break that facility's NWS zone resolution with no obvious error
 * pointing back at the edit that caused it. Links are different --
 * purely additive, nothing else depends on them, genuinely safe to
 * make writable (see server/src/repository/facilityLinks.ts).
 */
@Component({
  selector: 'app-facility-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './facility-edit.component.html',
  styleUrl: './facility-edit.component.scss',
})
export class FacilityEditComponent implements OnInit {
  facilityId: string | null = null;
  facility: Facility | null = null;
  links: FacilityLink[] = [];
  loading = false;
  error: string | null = null;

  newLinkLabel = '';
  newLinkUrl = '';
  addingLink = false;
  addLinkError: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.facilityId = params.get('facilityId');
      if (this.facilityId) {
        this.load();
      }
    });
  }

  load(): void {
    if (!this.facilityId) return;
    this.loading = true;
    this.error = null;

    this.api.getFacility(this.facilityId).subscribe({
      next: (facility) => {
        this.facility = facility;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Could not load facility.';
        this.loading = false;
        console.error(err);
      },
    });

    this.api.getFacilityLinks(this.facilityId).subscribe({
      next: (res) => {
        this.links = res.links;
      },
      error: (err) => console.error('Could not load facility links', err),
    });
  }

  addLink(): void {
    if (!this.facilityId) return;
    this.addLinkError = null;

    const label = this.newLinkLabel.trim();
    const url = this.newLinkUrl.trim();

    if (!label || !url) {
      this.addLinkError = 'Both a label and a URL are required.';
      return;
    }

    this.addingLink = true;
    this.api.addFacilityLink(this.facilityId, label, url).subscribe({
      next: (link) => {
        this.links = [...this.links, link];
        this.newLinkLabel = '';
        this.newLinkUrl = '';
        this.addingLink = false;
      },
      error: (err) => {
        this.addingLink = false;
        this.addLinkError = err?.error?.error ?? 'Could not add link. Make sure the URL starts with http:// or https://.';
        console.error('Could not add facility link', err);
      },
    });
  }

  removeLink(link: FacilityLink): void {
    if (!this.facilityId) return;
    this.api.removeFacilityLink(this.facilityId, link.id).subscribe({
      next: () => {
        this.links = this.links.filter((l) => l.id !== link.id);
      },
      error: (err) => console.error('Could not remove facility link', err),
    });
  }
}
