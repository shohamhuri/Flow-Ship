import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShipmentGrouping } from './shipment-grouping';

describe('ShipmentGrouping', () => {
  let component: ShipmentGrouping;
  let fixture: ComponentFixture<ShipmentGrouping>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipmentGrouping],
    }).compileComponents();

    fixture = TestBed.createComponent(ShipmentGrouping);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
