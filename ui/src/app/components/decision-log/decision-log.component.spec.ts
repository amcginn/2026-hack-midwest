import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisionLogComponent } from './decision-log.component';

describe('DecisionLogComponent', () => {
  let component: DecisionLogComponent;
  let fixture: ComponentFixture<DecisionLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisionLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
