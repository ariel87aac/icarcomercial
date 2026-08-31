import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get(AppService);
  });

  it('expone la identidad de la aplicación', () => {
    expect(service.getApplicationInfo()).toEqual(
      expect.objectContaining({
        name: 'Sistema Comercial ICAR',
        version: '0.1.0',
      }),
    );
  });
});

