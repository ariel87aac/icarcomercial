import { Controller, Get } from '@nestjs/common';
import { AppService, ApplicationInfo } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getApplicationInfo(): ApplicationInfo {
    return this.appService.getApplicationInfo();
  }
}
