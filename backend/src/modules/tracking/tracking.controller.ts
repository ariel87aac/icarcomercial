import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateTrackingLinkDto, NotificationQueryDto, SaveChannelSettingDto, SaveEstimationSettingDto, SaveNotificationTemplateDto, TrackingEventDto, WebhookDto } from './dto/tracking.dto';
import { NotificationService } from './notification.service';
import { TrackingService } from './tracking.service';

@Controller()
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationService,
  ) {}

  @Post('orders/:id/tracking-link')
  @RequirePermissions('tracking.links.manage')
  generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTrackingLinkDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tracking.generate(id, dto.expiresAt, actor);
  }

  @Delete('orders/:id/tracking-link')
  @RequirePermissions('tracking.links.manage')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tracking.revoke(id, actor);
  }

  @Get('orders/:id/tracking-link')
  getLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tracking.internal(id, actor);
  }

  @Get('public/tracking/:token')
  @Public()
  publicTracking(@Param('token') token: string, @Req() request: Request) {
    return this.tracking.publicTracking(token, request.ip || request.socket.remoteAddress || 'unknown');
  }

  @Post('tracking-events')
  @RequirePermissions('tracking.links.manage')
  async capture(@Body() dto: TrackingEventDto) {
    await this.tracking.safeCaptureOrder(dto.orderId, dto.sourceEvent);
    return { accepted: true };
  }

  @Get('tracking-settings')
  @RequirePermissions('tracking.settings.read')
  settings() { return this.notifications.listSettings(); }

  @Post('tracking-settings')
  @RequirePermissions('tracking.settings.manage')
  saveSettings(@Body() dto: SaveEstimationSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.saveSetting(dto, actor);
  }

  @Get('notification-templates')
  @RequirePermissions('notifications.templates.read')
  templates() { return this.notifications.listTemplates(); }

  @Post('notification-templates')
  @RequirePermissions('notifications.templates.manage')
  saveTemplate(@Body() dto: SaveNotificationTemplateDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.saveTemplate(dto, actor);
  }

  @Get('notification-channel')
  @RequirePermissions('notifications.channel.read')
  channel() { return this.notifications.getChannel(); }

  @Post('notification-channel')
  @RequirePermissions('notifications.channel.manage')
  saveChannel(@Body() dto: SaveChannelSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.saveChannel(dto, actor);
  }

  @Get('notifications')
  @RequirePermissions('notifications.read')
  notificationHistory(@Query() query: NotificationQueryDto) { return this.notifications.findAll(query); }

  @Get('notifications/:id')
  @RequirePermissions('notifications.read')
  notification(@Param('id', ParseUUIDPipe) id: string) { return this.notifications.findOne(id); }

  @Post('notifications/:id/resend')
  @RequirePermissions('notifications.resend')
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.resend(id, actor);
  }

  @Post('webhooks/whatsapp')
  @Public()
  webhook(@Body() dto: WebhookDto, @Headers('authorization') authorization: string | undefined) {
    return this.notifications.webhook(dto, authorization);
  }
}
