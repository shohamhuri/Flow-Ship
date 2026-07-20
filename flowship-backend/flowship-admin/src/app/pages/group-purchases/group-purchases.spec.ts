import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupPurchases } from './group-purchases';

describe('GroupPurchases', () => {
  let component: GroupPurchases;
  let fixture: ComponentFixture<GroupPurchases>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupPurchases],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupPurchases);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
