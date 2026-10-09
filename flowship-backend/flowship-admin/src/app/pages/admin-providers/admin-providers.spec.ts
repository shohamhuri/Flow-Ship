import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminProvidersComponent } from './admin-providers';

describe('AdminProvidersComponent', () => {
  let component: AdminProvidersComponent;
  let fixture: ComponentFixture<AdminProvidersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProvidersComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminProvidersComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
