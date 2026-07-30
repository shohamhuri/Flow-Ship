import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckoutsList } from './checkouts-list';

describe('CheckoutsList', () => {
  let component: CheckoutsList;
  let fixture: ComponentFixture<CheckoutsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckoutsList],
    }).compileComponents();

    fixture = TestBed.createComponent(CheckoutsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
