import { Module } from '@nestjs/common';
import { PondsService } from './ponds.service';
import { PondsController } from './ponds.controller';

@Module({
  providers: [PondsService],
  controllers: [PondsController],
  exports: [PondsService],
})
export class PondsModule {}
