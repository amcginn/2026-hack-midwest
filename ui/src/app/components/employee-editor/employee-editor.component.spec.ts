import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployeeEditorComponent } from './employee-editor.component';

describe('EmployeeEditorComponent', () => {
  let component: EmployeeEditorComponent;
  let fixture: ComponentFixture<EmployeeEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmployeeEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
