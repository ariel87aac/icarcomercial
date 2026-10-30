import { Injectable } from '@nestjs/common';
import { CatalogServiceParte01 } from './catalog.01-categories';

@Injectable()
export class CatalogService extends CatalogServiceParte01 {}
