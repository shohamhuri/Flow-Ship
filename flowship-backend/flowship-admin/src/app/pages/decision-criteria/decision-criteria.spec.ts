import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisionCriteriaComponent } from './decision-criteria';

describe('DecisionCriteria', () => {
  let component: DecisionCriteriaComponent;
  let fixture: ComponentFixture<DecisionCriteriaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionCriteriaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DecisionCriteriaComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
