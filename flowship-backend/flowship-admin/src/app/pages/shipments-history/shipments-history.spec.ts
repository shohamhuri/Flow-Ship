import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShipmentsHistory } from './shipments-history';

describe('ShipmentsHistory', () => {
  let component: ShipmentsHistory;
  let fixture: ComponentFixture<ShipmentsHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipmentsHistory],
    }).compileComponents();

    fixture = TestBed.createComponent(ShipmentsHistory);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
