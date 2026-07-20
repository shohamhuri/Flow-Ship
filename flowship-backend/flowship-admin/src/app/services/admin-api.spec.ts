import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin-api';

describe('AdminApi', () => {
  let service: AdminApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdminApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
