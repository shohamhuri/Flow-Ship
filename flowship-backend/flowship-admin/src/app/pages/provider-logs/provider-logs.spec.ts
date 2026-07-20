import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderLogs } from './provider-logs';

describe('ProviderLogs', () => {
  let component: ProviderLogs;
  let fixture: ComponentFixture<ProviderLogs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProviderLogs],
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderLogs);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
