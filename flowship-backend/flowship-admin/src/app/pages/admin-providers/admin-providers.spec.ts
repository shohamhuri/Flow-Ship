import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminProviders } from './admin-providers';

describe('AdminProviders', () => {
  let component: AdminProviders;
  let fixture: ComponentFixture<AdminProviders>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProviders],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminProviders);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
