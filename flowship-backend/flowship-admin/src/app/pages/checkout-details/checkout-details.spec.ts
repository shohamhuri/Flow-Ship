import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckoutDetails } from './checkout-details';

describe('CheckoutDetails', () => {
  let component: CheckoutDetails;
  let fixture: ComponentFixture<CheckoutDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckoutDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(CheckoutDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
