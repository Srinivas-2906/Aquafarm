import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';

@Module({
  providers: [FarmsService],
  controllers: [FarmsController],
  exports: [FarmsService],
})
export class FarmsModule {}
