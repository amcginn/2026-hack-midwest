import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FacilityPickerComponent } from './facility-picker.component';

describe('FacilityPickerComponent', () => {
  let component: FacilityPickerComponent;
  let fixture: ComponentFixture<FacilityPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacilityPickerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FacilityPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
