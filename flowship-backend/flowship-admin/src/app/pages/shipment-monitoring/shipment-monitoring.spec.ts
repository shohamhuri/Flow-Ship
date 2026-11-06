import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShipmentMonitoring } from './shipment-monitoring';

describe('ShipmentMonitoring', () => {
  let component: ShipmentMonitoring;
  let fixture: ComponentFixture<ShipmentMonitoring>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipmentMonitoring],
    }).compileComponents();

    fixture = TestBed.createComponent(ShipmentMonitoring);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
